// ============================================================
// ทดสอบเดินหน้า (Walk-forward optimization) ของกติกาออก (pure · deterministic · seed คงที่)
//
// แนวคิดจาก PyBroker (walkforward + optimize): train บนหน้าต่างแรก → วัดบนหน้าต่างถัดไปที่ยังไม่เคยเห็น → เลื่อนไปข้างหน้า
//  · หน้าต่างตัดตามจำนวนสัญญาณ (ไม่ใช่ตามเวลา) เพราะสัญญาณกระจุกตามสภาวะตลาด — ตัดตามเวลาแล้วบางหน้าต่างไม่มีสัญญาณเลย
//  · train = สัญญาณทั้งหมดก่อนหน้าต่าง test (anchored) ลบช่วงตัดรอยต่อ (วันรอคำสั่ง + วันถือสูงสุด) — ไม้ของ train ปิดก่อน test เริ่ม
//  · วิธีเลือกกติกาออก 4 แบบตั้งไว้ก่อนดูผล: ล็อกไว้ (ฐาน) · กำไรสุทธิสูงสุด · ชนะบ่อยสุด (กำไร > 0) · SL = MAE p95 / TP = MFE p75
//  · ทุกไม้นอกตัวอย่างเทียบการสุ่มเข้า (หุ้นเดียวกัน · หน้าต่างเดียวกัน · แผน ณ วันนั้น · กติกาออกเดียวกัน · ค่าธรรมเนียมเดียวกัน)
//  · MAE/MFE ของกติกาที่ 4 วัดจากการเดินราคาแบบไม่มีเป้า + stop กว้าง (ไม่ใช่ MAE ของไม้ที่มี stop อยู่แล้ว ซึ่งถูกตัดที่ stop)
// ============================================================

import type { MarketState } from '@/lib/quant/engine/types';
import { mulberry32 } from '@/lib/quant/rng';
import { mean, quantile, wilsonInterval } from '@/lib/quant/stats';
import type { GateBlockMatrix } from '@/lib/rhythm/compute';
import { EXEC, floorToTick, type ExecRule, type PaperResult } from '@/lib/workflow/execution';
import { EMBARGO, FILTER_LABEL, LAB, passesFilter } from '@/lib/winrate/lab';
import { signalSet, simulateSignal, type SignalPlan, type SignalRow } from '@/lib/winrate/signals';
import { clusterMean } from '@/lib/winrate/stats';
import type { OptimizerKey, WfCurve, WfExit, WfFold, WfMaeMfe, WfOptimizer, WfPick, WfQuantiles, WfTrade } from './types';

export const WF = {
  folds: 4,
  /** สัญญาณแรก (ตามเวลา) ที่เป็นหน้าต่าง train เริ่มต้น */
  initialShare: 0.4,
  embargo: EMBARGO,
  /** ไม้ปิดขั้นต่ำใน train ก่อน config จะถูกเลือกได้ */
  minTrain: 15,
  /** วันสุ่มเข้าต่อสัญญาณใน test (หุ้นเดียวกัน หน้าต่างเดียวกัน) */
  randomPerSignal: 8,
  minRandomClosed: 3,
  seed: 20261003,
  boot: 1000,
  /** stop กว้างสำหรับวัดการเดินราคาแบบไม่ถูกตัด (เท่าของระยะ stop ในแผน) */
  wideStop: 3,
  excursionHold: 10,
  horizons: [3, 5, 10],
  maeQ: 0.95,
  mfeQ: 0.75,
  /** วันสุ่มต่อสัญญาณของการศึกษา MAE/MFE (ทั้งหน้าต่าง) */
  randomStudy: 4,
  alpha: 0.05,
};

export const OPTIMIZERS: Array<{ key: OptimizerKey; label: string; description: string }> = [
  { key: 'locked', label: 'กติกาที่ล็อก', description: 'ไม่ปรับ — ใช้ RULES.execution ตลอดทุกหน้าต่าง (ฐานเทียบ)' },
  {
    key: 'maxExp',
    label: 'จูนหากำไรสุทธิสูงสุด',
    description: `ทุกหน้าต่าง: เลือกจาก ${LAB.targetsR.length * LAB.stopMults.length * LAB.holds.length * LAB.filters.length} แบบ ตัวที่ผลสุทธิเฉลี่ยต่อไม้ใน train สูงสุด (ไม้ปิด ≥ ${WF.minTrain}) — objective แบบ Optuna ในข้อความต้นแบบ`,
  },
  { key: 'maxWin', label: 'จูนหาอัตราชนะสูงสุด', description: `ทุกหน้าต่าง: เลือกตัวที่ชนะบ่อยสุดใน train โดยผลสุทธิ > 0 (ไม้ปิด ≥ ${WF.minTrain})` },
  {
    key: 'maeMfe',
    label: 'SL = MAE p95 · TP = MFE p75',
    description: `ทุกหน้าต่าง: วัดการเดินราคาใน train แบบไม่มีเป้า (stop กว้าง ${WF.wideStop}× · ถือ ${WF.excursionHold} วัน) แล้วตั้ง stop = MAE เปอร์เซ็นไทล์ ${WF.maeQ * 100} · เป้า = MFE เปอร์เซ็นไทล์ ${WF.mfeQ * 100} · ถือ ${WF.excursionHold} วัน`,
  },
];

export const exitLabel = (e: WfExit) => `เป้า ${e.targetR === null ? 'ไม่มี' : `${e.targetR}R`} · stop ${e.stopMult}× · ถือ ${e.holdDays} วัน · ${FILTER_LABEL[e.filter]}`;

export interface WfComputed {
  start: string;
  end: string;
  signals: number;
  configs: number;
  folds: WfFold[];
  optimizers: WfOptimizer[];
  curves: WfCurve[];
  trades: WfTrade[];
  maeMfe: WfMaeMfe;
  /** หุ้นที่หยุดซื้อขายก่อนวันสุดท้ายของข้อมูล (ตรวจ survivorship) */
  delisted: string[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};
const rp = (p: number) => (p >= 0.001 ? Math.round(p * 1e4) / 1e4 : Number(p.toPrecision(2)));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const step = (v: number, s: number) => Math.round(v / s) * s;
const isClosed = (r: PaperResult) => r.state === 'closed' && r.retNetPct !== null;
const ruleOf = (e: WfExit): ExecRule => ({ orderDays: EXEC.orderDays, holdDays: e.holdDays, targetR: e.targetR, costPct: EXEC.costPct });
const exitKey = (e: Pick<WfExit, 'targetR' | 'stopMult' | 'holdDays'>) => `${e.targetR}|${e.stopMult}|${e.holdDays}`;

/** Holm–Bonferroni (คืน p ที่ปรับแล้วตามลำดับเดิม) */
export function holm(ps: Array<number | null>): Array<number | null> {
  const idx = ps.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p !== null);
  idx.sort((a, b) => a.p - b.p);
  const out: Array<number | null> = ps.map(() => null);
  let run = 0;
  idx.forEach((x, k) => {
    run = Math.max(run, Math.min(1, x.p * (idx.length - k)));
    out[x.i] = run;
  });
  return out;
}

/** drawdown สูงสุดของผลรวมสะสม (จุด %) */
export function maxDrawdown(xs: number[]): number {
  let peak = 0;
  let cum = 0;
  let dd = 0;
  for (const x of xs) {
    cum += x;
    peak = Math.max(peak, cum);
    dd = Math.max(dd, peak - cum);
  }
  return dd;
}

const profitFactor = (xs: number[]) => {
  const g = xs.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const l = -xs.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  return l > 0 ? g / l : null;
};

/**
 * bootstrap แบบสุ่มทั้งสัปดาห์ (แนวเดียวกับ bootstrap metrics ของ PyBroker แต่เคารพการกระจุกรายสัปดาห์):
 * สุ่มสัปดาห์แบบใส่คืน เรียงตามลำดับที่สุ่มได้ → profit factor และ drawdown สูงสุดของแต่ละรอบ
 */
export function weekBootstrap(xs: Array<{ ret: number; week: string }>, B: number, rng: () => number) {
  const groups = new Map<string, number[]>();
  for (const x of xs) groups.set(x.week, [...(groups.get(x.week) ?? []), x.ret]);
  const gs = [...groups.values()];
  const G = gs.length;
  if (G < 3) return null;
  const pf: number[] = [];
  const dd: number[] = [];
  for (let b = 0; b < B; b++) {
    const seq: number[] = [];
    for (let j = 0; j < G; j++) seq.push(...gs[Math.floor(rng() * G)]);
    const p = profitFactor(seq);
    if (p !== null) pf.push(p);
    dd.push(maxDrawdown(seq));
  }
  return { pfLo: pf.length > 10 ? quantile(pf, 0.025) : null, pfHi: pf.length > 10 ? quantile(pf, 0.975) : null, dd95: quantile(dd, 0.95) };
}

function quantiles(ex: Array<{ mae: number; mfe: number }>): WfQuantiles {
  const n = ex.length;
  if (n < 5) return { n, maeP50: null, maeP75: null, maeP95: null, mfeP50: null, mfeP75: null, mfeP95: null, eRatio: null };
  const mae = ex.map((e) => e.mae);
  const mfe = ex.map((e) => e.mfe);
  const mMae = mean(mae);
  return {
    n,
    maeP50: r2(quantile(mae, 0.5)),
    maeP75: r2(quantile(mae, 0.75)),
    maeP95: r2(quantile(mae, 0.95)),
    mfeP50: r2(quantile(mfe, 0.5)),
    mfeP75: r2(quantile(mfe, 0.75)),
    mfeP95: r2(quantile(mfe, 0.95)),
    eRatio: mMae > 0 ? r2(mean(mfe) / mMae) : null,
  };
}

export function computeWalkforward(state: MarketState, gates: GateBlockMatrix): WfComputed {
  const set = signalSet(state, gates);
  const { dates, sigs, planAt, bars } = set;
  const S = sigs.length;
  const rng = mulberry32(WF.seed);
  const locked: WfExit = { targetR: EXEC.targetR, stopMult: EXEC.stopMult, holdDays: EXEC.holdDays, filter: 'all' };

  // ── ผลของกติกาออกหนึ่งชุดบนทุกสัญญาณ (cache · คำนวณครั้งเดียว แล้วแบ่ง train/test ด้วย index) ──
  const cache = new Map<string, PaperResult[]>();
  const simAll = (e: WfExit): PaperResult[] => {
    const k = exitKey(e);
    let res = cache.get(k);
    if (!res) {
      res = sigs.map((g) => simulateSignal(bars[g.si], g.t, g.kind, g.plan, e.stopMult, ruleOf(e)));
      cache.set(k, res);
    }
    return res;
  };
  const grid: WfExit[] = [];
  for (const stopMult of LAB.stopMults)
    for (const holdDays of LAB.holds) for (const targetR of LAB.targetsR) for (const filter of LAB.filters) grid.push({ targetR, stopMult, holdDays, filter });

  /** ระยะ 1R ของแผน = ราคาอ้างอิง (ราคาตั้งซื้อ/ราคาปิด) − stop ของแผน (ปัด tick) */
  const r1Of = (g: SignalRow, plan: SignalPlan = g.plan) => {
    const ref = g.kind === 'pullback' ? floorToTick(plan.zoneHi) : plan.close;
    return ref - floorToTick(plan.stopHard);
  };
  /** การเดินราคาแบบไม่ถูกตัด (stop กว้าง · ไม่มีเป้า) เป็นหน่วย 1R ของแผน */
  const excursion = (g: SignalRow, t: number, plan: SignalPlan, hold: number) => {
    const res = simulateSignal(bars[g.si], t, g.kind, plan, WF.wideStop, { orderDays: EXEC.orderDays, holdDays: hold, targetR: null, costPct: EXEC.costPct });
    const R1 = r1Of(g, plan);
    if (!isClosed(res) || !(R1 > 0) || res.maePct === null || res.mfePct === null) return null;
    const px = res.fill!.price;
    return { mae: (res.maePct / 100) * px / R1, mfe: (res.mfePct / 100) * px / R1, ret: res.retNetPct! };
  };

  // ── หน้าต่าง: ตัดตามจำนวนสัญญาณ ชิดขอบวัน ──
  const initN = Math.floor(S * WF.initialShare);
  const startsT = S > initN ? [...new Set(Array.from({ length: WF.folds }, (_, k) => sigs[Math.min(S - 1, initN + Math.floor(((S - initN) * k) / WF.folds))].t))].sort((a, b) => a - b) : [];
  const foldOf = new Array<number>(S).fill(-1);
  const ranges = startsT.map((a, k) => [a, k + 1 < startsT.length ? startsT[k + 1] - 1 : gates.t1] as const);
  sigs.forEach((g, i) => {
    const k = ranges.findIndex(([a, b]) => g.t >= a && g.t <= b);
    foldOf[i] = k;
  });

  // วันสุ่มเข้าของสัญญาณใน test (ใช้ชุดเดียวกันทุกวิธี = เทียบกันอย่างยุติธรรม)
  const randomDays = sigs.map((g, i) => {
    const k = foldOf[i];
    if (k < 0) return [];
    const [a, b] = ranges[k];
    return Array.from({ length: WF.randomPerSignal }, () => a + Math.floor(rng() * (b - a + 1)));
  });

  const statsOn = (res: PaperResult[], idx: number[], filter: WfExit['filter']) => {
    const keep = idx.filter((i) => passesFilter(filter, sigs[i]) && isClosed(res[i]));
    const rets = keep.map((i) => res[i].retNetPct!);
    return { n: keep.length, win: keep.length ? (100 * rets.filter((v) => v > 0).length) / keep.length : null, exp: keep.length ? mean(rets) : null };
  };

  const pickFor = (key: OptimizerKey, trainIdx: number[]): { exit: WfExit; fallback: boolean } => {
    if (key === 'locked') return { exit: locked, fallback: false };
    if (key === 'maeMfe') {
      const ex = trainIdx.map((i) => excursion(sigs[i], sigs[i].t, sigs[i].plan, WF.excursionHold)).filter((x): x is NonNullable<typeof x> => x !== null);
      if (ex.length < WF.minTrain) return { exit: locked, fallback: true };
      const stopMult = r2(clamp(step(quantile(ex.map((x) => x.mae), WF.maeQ), 0.05), 0.5, WF.wideStop));
      const targetR = r2(clamp(step(quantile(ex.map((x) => x.mfe), WF.mfeQ) / stopMult, 0.05), 0.1, 5));
      return { exit: { targetR, stopMult, holdDays: WF.excursionHold, filter: 'all' }, fallback: false };
    }
    let best: { e: WfExit; s: number; tie: number; n: number } | null = null;
    for (const e of grid) {
      const st = statsOn(simAll(e), trainIdx, e.filter);
      if (st.n < WF.minTrain || st.exp === null || st.win === null) continue;
      if (key === 'maxWin' && !(st.exp > 0)) continue;
      const s = key === 'maxExp' ? st.exp : st.win;
      const tie = key === 'maxExp' ? st.n : st.exp;
      if (!best || s > best.s + 1e-12 || (Math.abs(s - best.s) <= 1e-12 && (tie > best.tie + 1e-12 || (Math.abs(tie - best.tie) <= 1e-12 && st.n > best.n)))) best = { e, s, tie, n: st.n };
    }
    return best ? { exit: best.e, fallback: false } : { exit: locked, fallback: true };
  };

  interface Oos {
    i: number;
    fold: number;
    res: PaperResult;
    randWin: number | null;
    randExp: number | null;
    exit: WfExit;
  }
  const oos: Record<OptimizerKey, Oos[]> = { locked: [], maxExp: [], maxWin: [], maeMfe: [] };
  /** ผลต่อสัญญาณ (ไม่ได้ของ/ไม่ปิด/ถูกกรอง = 0) — ใช้เทียบกับกติกาที่ล็อกแบบจับคู่ */
  const perSignal: Record<OptimizerKey, Map<number, number>> = { locked: new Map(), maxExp: new Map(), maxWin: new Map(), maeMfe: new Map() };
  const isSum: Record<OptimizerKey, { w: number; s: number }> = { locked: { w: 0, s: 0 }, maxExp: { w: 0, s: 0 }, maxWin: { w: 0, s: 0 }, maeMfe: { w: 0, s: 0 } };
  const folds: WfFold[] = [];

  ranges.forEach(([a, b], k) => {
    const testIdx = sigs.map((_, i) => i).filter((i) => foldOf[i] === k);
    const trainIdx = sigs.map((_, i) => i).filter((i) => sigs[i].t < a - WF.embargo);
    const picks = {} as Record<OptimizerKey, WfPick>;
    for (const o of OPTIMIZERS) {
      const { exit, fallback } = pickFor(o.key, trainIdx);
      const resAll = simAll(exit);
      const resOf = (i: number) => resAll[i];
      const isSt = statsOn(resAll, trainIdx, exit.filter);
      const rw: number[] = [];
      const re: number[] = [];
      let n = 0;
      let wins = 0;
      const rets: number[] = [];
      for (const i of testIdx) {
        const g = sigs[i];
        const res = resOf(i);
        const pass = passesFilter(exit.filter, g);
        perSignal[o.key].set(i, pass && isClosed(res) ? res.retNetPct! : 0);
        if (!pass || !isClosed(res)) continue;
        const rr = randomDays[i]
          .map((u) => simulateSignal(bars[g.si], u, g.kind, planAt(g.si, u), exit.stopMult, ruleOf(exit)))
          .filter(isClosed);
        const ok = rr.length >= WF.minRandomClosed;
        const qWin = ok ? rr.filter((x) => x.retNetPct! > 0).length / rr.length : null;
        const qExp = ok ? mean(rr.map((x) => x.retNetPct!)) : null;
        if (qWin !== null) rw.push(qWin);
        if (qExp !== null) re.push(qExp);
        oos[o.key].push({ i, fold: k + 1, res, randWin: qWin, randExp: qExp, exit });
        n++;
        if (res.retNetPct! > 0) wins++;
        rets.push(res.retNetPct!);
      }
      if (isSt.exp !== null && isSt.n > 0) {
        isSum[o.key].w += isSt.n;
        isSum[o.key].s += isSt.exp * isSt.n;
      }
      picks[o.key] = {
        exit,
        label: exitLabel(exit),
        fallback,
        isTrades: isSt.n,
        isWin: isSt.win === null ? null : r1(isSt.win),
        isExp: isSt.exp === null ? null : r3(isSt.exp),
        oosTrades: n,
        oosWin: n ? r1((100 * wins) / n) : null,
        oosExp: n ? r3(mean(rets)) : null,
        randWin: rw.length ? r1(100 * mean(rw)) : null,
        randExp: re.length ? r3(mean(re)) : null,
      };
    }
    folds.push({
      index: k + 1,
      trainStart: trainIdx.length ? sigs[trainIdx[0]].date : dates[gates.t0],
      trainEnd: trainIdx.length ? sigs[trainIdx[trainIdx.length - 1]].date : dates[gates.t0],
      testStart: dates[a],
      testEnd: dates[b],
      trainSignals: trainIdx.length,
      testSignals: testIdx.length,
      picks,
    });
  });

  // ── สรุปนอกตัวอย่างต่อวิธี ──
  const allTest = sigs.map((_, i) => i).filter((i) => foldOf[i] >= 0);
  const brng = mulberry32(WF.seed + 7);
  const base: WfOptimizer[] = OPTIMIZERS.map((o) => {
    const xs = [...oos[o.key]].sort((p, q) => p.res.exit!.date.localeCompare(q.res.exit!.date) || p.i - q.i);
    const rets = xs.map((x) => x.res.retNetPct!);
    const weeks = xs.map((x) => sigs[x.i].week);
    const n = xs.length;
    const wins = rets.filter((v) => v > 0).length;
    const w = n ? wilsonInterval(wins, n) : null;
    const exp = clusterMean(rets, weeks);
    const paired = xs.filter((x) => x.randExp !== null);
    const ex = clusterMean(
      paired.map((x) => x.res.retNetPct! - x.randExp!),
      paired.map((x) => sigs[x.i].week),
    );
    const vs =
      o.key === 'locked'
        ? null
        : clusterMean(
            allTest.map((i) => (perSignal[o.key].get(i) ?? 0) - (perSignal.locked.get(i) ?? 0)),
            allTest.map((i) => sigs[i].week),
          );
    const boot = n >= 3 ? weekBootstrap(xs.map((x, j) => ({ ret: rets[j], week: weeks[j] })), WF.boot, brng) : null;
    const pf = profitFactor(rets);
    const isExp = isSum[o.key].w ? isSum[o.key].s / isSum[o.key].w : null;
    const oosExp = n ? mean(rets) : null;
    const rw = xs.filter((x) => x.randWin !== null).map((x) => x.randWin!);
    const re = xs.filter((x) => x.randExp !== null).map((x) => x.randExp!);
    return {
      key: o.key,
      label: o.label,
      description: o.description,
      trades: n,
      wins,
      winRate: n ? r1((100 * wins) / n) : null,
      wilson: w ? { lo: r1(100 * w.lo), hi: r1(100 * w.hi) } : null,
      expectancy: exp ? { mean: r3(exp.mean), lo: r3(exp.lo), hi: r3(exp.hi) } : null,
      meanRNet: n ? r3(mean(xs.map((x) => x.res.rNet!))) : null,
      sumPct: r2(rets.reduce((a, v) => a + v, 0)),
      profitFactor: pf === null ? null : r2(pf),
      pfCI: boot && boot.pfLo !== null && boot.pfHi !== null ? { lo: r2(boot.pfLo), hi: r2(boot.pfHi) } : null,
      maxDD: n ? r2(maxDrawdown(rets)) : null,
      maxDD95: boot ? r2(boot.dd95) : null,
      random: { winRate: rw.length ? r1(100 * mean(rw)) : null, expectancy: re.length ? r3(mean(re)) : null },
      excess: ex ? { mean: r3(ex.mean), lo: r3(ex.lo), hi: r3(ex.hi) } : null,
      pExcess: ex ? rp(ex.p) : null,
      vsLocked: vs ? { mean: r3(vs.mean), lo: r3(vs.lo), hi: r3(vs.hi) } : null,
      pVsLocked: vs ? rp(vs.p) : null,
      pVsLockedAdj: null,
      isExpectancy: isExp === null ? null : r3(isExp),
      wfe: isExp !== null && isExp > 0 && oosExp !== null ? r2(oosExp / isExp) : null,
    };
  });
  const adj = holm(base.map((o) => (o.key === 'locked' ? null : o.pVsLocked)));
  const optimizers = base.map((o, j) => ({ ...o, pVsLockedAdj: adj[j] === null ? null : rp(adj[j]!) }));

  // ── เส้นผลรวมสะสม + ตารางไม้ ──
  const curves: WfCurve[] = OPTIMIZERS.map((o) => {
    const xs = [...oos[o.key]].sort((p, q) => p.res.exit!.date.localeCompare(q.res.exit!.date) || p.i - q.i);
    let cum = 0;
    return { key: o.key, label: o.label, points: xs.map((x) => ({ date: x.res.exit!.date, cum: r2((cum += x.res.retNetPct!)) })) };
  });
  {
    const xs = [...oos.locked].filter((x) => x.randExp !== null).sort((p, q) => p.res.exit!.date.localeCompare(q.res.exit!.date) || p.i - q.i);
    let cum = 0;
    curves.push({ key: 'random', label: 'สุ่มเข้า (กติกาที่ล็อก)', points: xs.map((x) => ({ date: x.res.exit!.date, cum: r2((cum += x.randExp!)) })) });
  }
  const trades: WfTrade[] = [];
  for (const o of OPTIMIZERS) {
    let cum = 0;
    const xs = [...oos[o.key]].sort((p, q) => p.res.exit!.date.localeCompare(q.res.exit!.date) || p.i - q.i);
    for (const x of xs) {
      const g = sigs[x.i];
      const r = x.res;
      cum += r.retNetPct!;
      const barsHeld = Math.max(1, r.days ?? 1);
      trades.push({
        optimizer: o.key,
        fold: x.fold,
        symbol: state.stocks[g.si].symbol,
        kind: g.kind,
        signalDate: g.date,
        entryDate: r.fill!.date,
        exitDate: r.exit!.date,
        entry: r.fill!.price,
        exit: r.exit!.price,
        retNetPct: r.retNetPct!,
        rNet: r.rNet!,
        cumPct: r2(cum),
        bars: r.days ?? 0,
        pctPerBar: r3(r.retNetPct! / barsHeld),
        exitKind: r.exit!.kind,
        maeR: r.maeR,
        mfeR: r.mfeR,
        config: exitLabel(x.exit),
      });
    }
  }

  // ── การศึกษา MAE/MFE ทั้งหน้าต่าง (สัญญาณ vs สุ่มเข้า) ──
  const srng = mulberry32(WF.seed + 13);
  const span = gates.t1 - gates.t0 + 1;
  const studyDays = sigs.map(() => Array.from({ length: WF.randomStudy }, () => gates.t0 + Math.floor(srng() * span)));
  const byHorizon = WF.horizons.map((h) => {
    const sx = sigs.map((g) => excursion(g, g.t, g.plan, h)).filter((x): x is NonNullable<typeof x> => x !== null);
    const rx = sigs.flatMap((g, i) => studyDays[i].map((u) => excursion(g, u, planAt(g.si, u), h))).filter((x): x is NonNullable<typeof x> => x !== null);
    return { h, sx, rx };
  });
  const main = byHorizon.find((b) => b.h === WF.excursionHold) ?? byHorizon[byHorizon.length - 1];
  const sq = quantiles(main.sx);
  const maeMfe: WfMaeMfe = {
    horizon: WF.excursionHold,
    wideStop: WF.wideStop,
    signal: sq,
    random: quantiles(main.rx),
    byHorizon: byHorizon.map((b) => ({ horizon: b.h, signal: quantiles(b.sx).eRatio, random: quantiles(b.rx).eRatio })),
    points: main.sx.slice(0, 400).map((x) => ({ mae: r2(x.mae), mfe: r2(x.mfe), win: x.ret > 0 })),
    fullWindowRule:
      sq.maeP95 !== null && sq.mfeP75 !== null
        ? (() => {
            const stopMult = r2(clamp(step(sq.maeP95, 0.05), 0.5, WF.wideStop));
            return { stopMult, targetR: r2(clamp(step(sq.mfeP75 / stopMult, 0.05), 0.1, 5)) };
          })()
        : null,
  };

  // ── survivorship: หุ้นที่ไม่มีการซื้อขายจริงในช่วง 5 วันทำการสุดท้าย ──
  const last = dates.length - 1;
  const delisted = state.stocks
    .filter((s) => {
      let lastLive = -1;
      for (let t = last; t >= 0; t--)
        if (s.ohlcv.volume[t] > 0) {
          lastLive = t;
          break;
        }
      return lastLive < last - 5;
    })
    .map((s) => s.symbol);

  return {
    start: dates[gates.t0],
    end: dates[gates.t1],
    signals: S,
    configs: grid.length,
    folds,
    optimizers,
    curves,
    trades,
    maeMfe,
    delisted,
  };
}
