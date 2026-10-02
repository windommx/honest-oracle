// ============================================================
// ห้องทดลอง "ชนะ 80% อย่างมีนัยสำคัญ" (pure · deterministic · seed คงที่)
//
// กับดักหลัก: อัตราชนะถูกกำหนดด้วย "รูปทรงของกติกาออก" ได้เสมอ — เป้าใกล้/stop กว้าง ทำให้แม้แต่การสุ่มเข้าก็ชนะ 80%+
// จึงวัด "ฝีมือ" ด้วยการเทียบกับการสุ่มเข้าแบบเดียวกัน: หุ้นเดียวกัน · วันสุ่มในช่วงเวลาเดียวกัน · แผนเทรดแบบเดียวกัน ณ วันนั้น
// (โซนเข้า/stop จาก evaluateGates) · กติกาออกเดียวกัน · ค่าธรรมเนียมเดียวกัน
//
// ขั้นตอนที่ตั้งไว้ก่อนดูผล:
//  1) แบ่งสัญญาณตามเวลา: 60% แรก = ช่วงค้นหา · 40% หลัง = ช่วงทดสอบ (ไม่ใช้เลือก)
//     ตัดสัญญาณช่วงรอยต่อทิ้ง (embargo = วันรอคำสั่ง + วันถือสูงสุด) ไม่ให้ผลของช่วงค้นหาใช้ราคาของช่วงทดสอบ
//     วันสุ่มของแต่ละสัญญาณก็สุ่มเฉพาะในช่วงของตัวเอง
//  2) ทุก config (เป้า × stop × วันถือ × ตัวกรอง) ในช่วงค้นหา: อัตราชนะ + Wilson CI · ชนะเหนือการสุ่ม (จับคู่ต่อสัญญาณ)
//     + CI/p แบบ cluster-robust รายสัปดาห์ · ผลสุทธิต่อไม้ + CI · ปรับ p ข้ามทุก config ด้วย Benjamini–Hochberg
//  3) ผู้ผ่าน = ชนะ ≥ 80% · ผลสุทธิเฉลี่ย > 0 · q < 0.1 → เลือกตัวที่ q ต่ำสุด
//  4) ทดสอบตัวที่เลือก "ครั้งเดียว" ในช่วงทดสอบ: ชนะ ≥ 80% · เหนือการสุ่ม p < 0.05 · ผลสุทธิ > 0
//  5) จำนวนไม้ forward ที่ต้องใช้ยืนยัน (กำลัง 80%) × design effect ของการกระจุกตัวรายสัปดาห์
// ============================================================

import type { MarketState } from '@/lib/quant/engine/types';
import { mulberry32 } from '@/lib/quant/rng';
import { bhFdr, mean, wilsonInterval } from '@/lib/quant/stats';
import type { GateBlockMatrix } from '@/lib/rhythm/compute';
import { EXEC, type ExecRule, type PaperResult } from '@/lib/workflow/execution';
import { signalSet, simulateSignal, type SignalPlan, type SignalRow } from './signals';
import { binomTailGE, clusterMean, sampleSize } from './stats';
import type { WinCurve, WinFilter, WinRow, WinStats } from './types';

export const LAB = {
  /** เป้าอัตราชนะ (สัดส่วน) */
  target: 0.8,
  targetsR: [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2],
  stopMults: [1, 1.5, 2],
  holds: [3, 5, 10],
  filters: ['all', 'pullback', 'uncrowded', 'quality'] as WinFilter[],
  /** วันสุ่มเข้าต่อหนึ่งสัญญาณ (หุ้นเดียวกัน ช่วงเวลาเดียวกัน) */
  randomPerSignal: 12,
  /** ต้องมีไม้สุ่มที่ปิดแล้วอย่างน้อยเท่านี้ จึงใช้เป็นฐานของสัญญาณนั้น */
  minRandomClosed: 4,
  /** สัดส่วนสัญญาณแรก (ตามเวลา) ที่ใช้ค้นหา — ที่เหลือคือช่วงทดสอบ */
  discoveryShare: 0.6,
  seed: 20261002,
  alpha: 0.05,
  power: 0.8,
  /** ไม้ที่ปิดแล้วขั้นต่ำต่อ config ก่อนจะนับเป็นผู้ผ่าน */
  minTrades: 20,
  fdr: 0.1,
  /** "ไม่แออัด" = วันที่มีสัญญาณไม่เกินเท่านี้ */
  crowdMax: 2,
  /** "คุณภาพสูง" = P(ขึ้น) ของระบบ ณ วันสัญญาณ ≥ เท่านี้ (ตั้งก่อนดูผล ไม่ได้มาจากข้อมูล) */
  qualityMin: 0.55,
  /** วันซื้อขายต่อปีโดยประมาณของ SET */
  sessionsPerYear: 245,
};

/** ช่วงตัดรอยต่อระหว่างช่วงค้นหา/ช่วงทดสอบ = วันที่คำสั่งรอได้ + วันถือสูงสุด */
export const EMBARGO = EXEC.orderDays + Math.max(...LAB.holds);

export const FILTER_LABEL: Record<WinFilter, string> = {
  all: 'ทุกสัญญาณ',
  pullback: 'เฉพาะ pullback',
  uncrowded: `วันที่มีสัญญาณ ≤ ${LAB.crowdMax} ตัว`,
  quality: `P(ขึ้น) ≥ ${LAB.qualityMin}`,
};

/** ตัวกรองสัญญาณ (ตั้งไว้ก่อนดูผล) — ใช้ร่วมกับหน้าทดสอบเดินหน้า */
export function passesFilter(filter: WinFilter, g: Pick<SignalRow, 'kind' | 'crowd' | 'plan'>): boolean {
  return filter === 'all' || (filter === 'pullback' ? g.kind === 'pullback' : filter === 'uncrowded' ? g.crowd <= LAB.crowdMax : g.plan.probUp >= LAB.qualityMin);
}

export const configLabel = (c: { targetR: number; stopMult: number; holdDays: number; filter: WinFilter }) =>
  `เป้า ${c.targetR}R · stop ${c.stopMult}× · ถือ ${c.holdDays} วัน · ${FILTER_LABEL[c.filter]}`;

export { weekOf } from './signals';

type Period = 'discovery' | 'holdout' | 'embargo';

interface LabSignal extends SignalRow {
  random: Array<{ u: number; plan: SignalPlan }>;
  period: Period;
}

export interface LabResult {
  start: string;
  end: string;
  /** วันแรกของช่วงทดสอบ */
  split: string;
  sessions: number;
  years: number;
  signals: number;
  discoverySignals: number;
  holdoutSignals: number;
  embargoSignals: number;
  rows: WinRow[];
  curves: WinCurve[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};
/** p แสดง 4 ตำแหน่งแบบนัยสำคัญ (p เล็กมากต้องไม่ปัดเป็น 0) */
const rp = (p: number) => (p >= 0.001 ? Math.round(p * 1e4) / 1e4 : Number(p.toPrecision(2)));

const isClosed = (r: PaperResult) => r.state === 'closed' && r.rNet !== null;

/** สถิติของ config หนึ่งบนชุดสัญญาณหนึ่ง · q[i] = อัตราชนะของการสุ่มเข้าที่จับคู่กับสัญญาณ i (null = ไม้สุ่มปิดไม่พอ) */
export function statsFor(idx: number[], weeks: string[], res: PaperResult[], q: Array<number | null>): WinStats {
  const filled = idx.filter((i) => res[i].fill !== null).length;
  const expired = idx.filter((i) => res[i].state === 'expired').length;
  const gaps = idx.filter((i) => res[i].state === 'gap').length;
  const closed = idx.filter((i) => isClosed(res[i]));
  const n = closed.length;
  const wins = closed.filter((i) => res[i].rNet! > 0).length;
  const paired = closed.filter((i) => q[i] !== null);
  const ex = clusterMean(
    paired.map((i) => (res[i].rNet! > 0 ? 1 : 0) - q[i]!),
    paired.map((i) => weeks[i]),
  );
  const rets = closed.map((i) => res[i].retNetPct!);
  const exp = clusterMean(
    rets,
    closed.map((i) => weeks[i]),
  );
  const gains = rets.filter((v) => v > 0);
  const losses = rets.filter((v) => v <= 0);
  const sumLoss = -losses.reduce((a, b) => a + b, 0);
  const avgWin = gains.length ? mean(gains) : 0;
  const avgLoss = losses.length ? -mean(losses) : 0;
  const w = n ? wilsonInterval(wins, n) : null;
  return {
    signals: idx.length,
    filled,
    fillRate: filled + expired + gaps ? r1((100 * filled) / (filled + expired + gaps)) : null,
    closed: n,
    wins,
    winRate: n ? r1((100 * wins) / n) : null,
    wilson: w ? { lo: r1(100 * w.lo), hi: r1(100 * w.hi) } : null,
    baseline: paired.length ? r1(100 * mean(paired.map((i) => q[i]!))) : null,
    excess: ex ? { mean: r1(100 * ex.mean), lo: r1(100 * ex.lo), hi: r1(100 * ex.hi) } : null,
    pExcess: ex ? rp(ex.p) : null,
    expectancy: exp ? { mean: r3(exp.mean), lo: r3(exp.lo), hi: r3(exp.hi) } : null,
    meanRNet: n ? r3(mean(closed.map((i) => res[i].rNet!))) : null,
    profitFactor: sumLoss > 0 ? r3(gains.reduce((a, b) => a + b, 0) / sumLoss) : null,
    breakevenWin: avgWin + avgLoss > 0 ? r1((100 * avgLoss) / (avgWin + avgLoss)) : null,
    deff: ex ? r3(ex.deff) : null,
  };
}

/** ทุก config ของกริด + เส้นอัตราชนะ/ผลสุทธิตามระยะเป้า — งานหนักของหน้า (cache ต่อ MarketState ที่ผู้เรียก) */
export function computeLab(state: MarketState, gates: GateBlockMatrix): LabResult {
  const rng = mulberry32(LAB.seed);
  const set = signalSet(state, gates);
  const { dates, planAt, bars } = set;
  const sigs: LabSignal[] = set.sigs.map((g) => ({ ...g, random: [], period: 'discovery' }));

  // แบ่งช่วงตามเวลา + ตัดรอยต่อ
  const splitIdx = Math.min(Math.max(0, sigs.length - 1), Math.floor(sigs.length * LAB.discoveryShare));
  const splitT = sigs.length ? sigs[splitIdx].t : gates.t1 + 1;
  const discEnd = splitT - EMBARGO; // ช่วงค้นหา = t < discEnd (ไม้ปิดก่อนช่วงทดสอบเริ่ม)
  for (const g of sigs) g.period = g.t >= splitT ? 'holdout' : g.t < discEnd ? 'discovery' : 'embargo';

  // วันสุ่มของแต่ละสัญญาณ: เฉพาะช่วงเวลาของตัวเอง (สัญญาณรอยต่อใช้ช่วงค้นหา — ใช้เฉพาะในเส้นภาพรวม)
  const ranges: Record<Period, [number, number]> = {
    discovery: [gates.t0, discEnd - 1],
    embargo: [gates.t0, discEnd - 1],
    holdout: [splitT, gates.t1],
  };
  for (const g of sigs) {
    const [a, b] = ranges[g.period];
    if (b < a) continue;
    for (let k = 0; k < LAB.randomPerSignal; k++) {
      const u = a + Math.floor(rng() * (b - a + 1));
      g.random.push({ u, plan: planAt(g.si, u) });
    }
  }

  const weeks = sigs.map((g) => g.week);
  const disc = sigs.map((_, i) => i).filter((i) => sigs[i].period === 'discovery');
  const hold = sigs.map((_, i) => i).filter((i) => sigs[i].period === 'holdout');
  const everyIdx = sigs.map((_, i) => i);

  const rows: WinRow[] = [];
  const curves: WinCurve[] = [];
  for (const stopMult of LAB.stopMults) {
    for (const holdDays of LAB.holds) {
      const curve: WinCurve = { stopMult, holdDays, points: [] };
      curves.push(curve);
      for (const targetR of LAB.targetsR) {
        const rule: ExecRule = { orderDays: EXEC.orderDays, holdDays, targetR, costPct: EXEC.costPct };
        const res = sigs.map((g) => simulateSignal(bars[g.si], g.t, g.kind, g.plan, stopMult, rule));
        const q: Array<number | null> = [];
        const qExp: Array<number | null> = [];
        for (const g of sigs) {
          const rr = g.random.map((x) => simulateSignal(bars[g.si], x.u, g.kind, x.plan, stopMult, rule)).filter(isClosed);
          const ok = rr.length >= LAB.minRandomClosed;
          q.push(ok ? rr.filter((x) => x.rNet! > 0).length / rr.length : null);
          qExp.push(ok ? mean(rr.map((x) => x.retNetPct!)) : null);
        }
        for (const filter of LAB.filters) {
          const keep = (i: number) => passesFilter(filter, sigs[i]);
          rows.push({
            key: `t${targetR}-s${stopMult}-h${holdDays}-${filter}`,
            targetR,
            stopMult,
            holdDays,
            filter,
            discovery: statsFor(disc.filter(keep), weeks, res, q),
            holdout: statsFor(hold.filter(keep), weeks, res, q),
            q: null,
          });
        }
        // เส้นภาพรวม (ทุกสัญญาณ ทั้งหน้าต่าง) — ใช้แสดงกับดักของรูปทรง ไม่ใช้เลือก config
        const closed = everyIdx.filter((i) => isClosed(res[i]));
        const withQ = everyIdx.filter((i) => q[i] !== null);
        curve.points.push({
          targetR,
          signalWin: closed.length ? r1((100 * closed.filter((i) => res[i].rNet! > 0).length) / closed.length) : null,
          randomWin: withQ.length ? r1(100 * mean(withQ.map((i) => q[i]!))) : null,
          signalExp: closed.length ? r3(mean(closed.map((i) => res[i].retNetPct!))) : null,
          randomExp: withQ.length ? r3(mean(withQ.map((i) => qExp[i]!))) : null,
          closed: closed.length,
        });
      }
    }
  }
  // ปรับการทดสอบหลายแบบ: ทุก config ที่มีไม้ปิดพอในช่วงค้นหา
  const tested = rows.filter((r) => r.discovery.pExcess !== null && r.discovery.closed >= LAB.minTrades);
  const qs = bhFdr(tested.map((r) => r.discovery.pExcess!));
  tested.forEach((r, i) => (r.q = rp(qs[i])));
  const sessions = gates.t1 - gates.t0 + 1;
  return {
    start: dates[gates.t0],
    end: dates[gates.t1],
    split: splitT <= gates.t1 ? dates[splitT] : dates[gates.t1],
    sessions,
    years: Math.round((sessions / LAB.sessionsPerYear) * 100) / 100,
    signals: sigs.length,
    discoverySignals: disc.length,
    holdoutSignals: hold.length,
    embargoSignals: sigs.length - disc.length - hold.length,
    rows,
    curves,
  };
}

// ─────────────────────────── เลือก · ตัดสิน · จำนวนไม้ที่ต้องใช้ ───────────────────────────

export const SELECTION_RULE =
  `ช่วงค้นหาเท่านั้น: ไม้ปิด ≥ ${LAB.minTrades} · ชนะ ≥ ${LAB.target * 100}% · ผลสุทธิเฉลี่ย > 0 · ชนะเหนือการสุ่มด้วย q < ${LAB.fdr} (Benjamini–Hochberg ข้ามทุก config) → เลือก q ต่ำสุด แล้วทดสอบครั้งเดียวในช่วงทดสอบ (ชนะ ≥ ${LAB.target * 100}% · เหนือการสุ่ม p < ${LAB.alpha} · ผลสุทธิ > 0 · ไม้ปิด ≥ ${LAB.minTrades})`;

const reaches = (r: WinRow) => r.discovery.closed >= LAB.minTrades && (r.discovery.winRate ?? 0) >= LAB.target * 100;

export function selectConfig(rows: WinRow[]) {
  const reach = rows.filter(reaches);
  const candidates = reach.filter((r) => (r.discovery.expectancy?.mean ?? -1) > 0 && r.q !== null && r.q < LAB.fdr);
  const selected = [...candidates].sort((a, b) => a.q! - b.q! || b.discovery.expectancy!.mean - a.discovery.expectancy!.mean)[0] ?? null;
  // ไม่มีผู้ผ่าน → ตัวที่ใกล้ที่สุด (ใช้ข้อมูลช่วงค้นหาเท่านั้น): ชนะ ≥ เป้าและเหนือการสุ่มมากสุด · ถ้าไม่มีใครถึงเป้า = ชนะสูงสุด
  const closest =
    selected ??
    [...reach].sort((a, b) => (b.discovery.excess?.mean ?? -1e9) - (a.discovery.excess?.mean ?? -1e9))[0] ??
    [...rows].filter((r) => r.discovery.closed >= LAB.minTrades).sort((a, b) => (b.discovery.winRate ?? 0) - (a.discovery.winRate ?? 0))[0] ??
    null;
  const h = selected?.holdout;
  const holdoutPass = selected
    ? !!h && h.closed >= LAB.minTrades && (h.winRate ?? 0) >= LAB.target * 100 && (h.pExcess ?? 1) < LAB.alpha && (h.expectancy?.mean ?? -1) > 0
    : null;
  return { candidates: candidates.length, selected, closest, holdoutPass, reach };
}

/** จำนวนไม้ forward ที่ต้องใช้พิสูจน์ "ชนะ 80% เหนือการสุ่ม" ของ config อ้างอิง (กำลัง 80% · α 5% ทางเดียว · × design effect) */
export function powerFor(ref: WinRow | null, years: number) {
  const p1 = LAB.target;
  if (!ref || ref.discovery.baseline === null) {
    return { reference: null, p0: null, p1: p1 * 100, nIid: null, deff: 1, nNeeded: null, closedPerYear: 0, years: null, note: 'ยังไม่มี config อ้างอิงที่มีไม้พอ' };
  }
  const p0 = ref.discovery.baseline / 100;
  const deff = Math.max(1, ref.discovery.deff ?? 1);
  const nIid = sampleSize(p0, p1, LAB.alpha, LAB.power);
  const closedPerYear = years > 0 ? Math.round(((ref.discovery.closed + ref.holdout.closed) / years) * 10) / 10 : 0;
  const nNeeded = nIid === null ? null : Math.ceil(nIid * deff);
  const yrs = nNeeded !== null && closedPerYear > 0 ? Math.round((nNeeded / closedPerYear) * 10) / 10 : null;
  const note =
    nIid === null
      ? `การสุ่มเข้าด้วยกติกาออกเดียวกันชนะ ${(p0 * 100).toFixed(1)}% อยู่แล้ว — ชนะ 80% ของ config นี้จึงไม่ได้พิสูจน์ฝีมือ ต้องมี edge ที่ทำให้ชนะเหนือการสุ่ม`
      : `พิสูจน์ว่าชนะ 80% จริงเทียบการสุ่ม ${(p0 * 100).toFixed(1)}% ต้องใช้ ${nIid} ไม้ถ้าอิสระกัน × design effect ${deff.toFixed(2)} = ${nNeeded} ไม้` +
        (yrs !== null ? ` ≈ ${yrs} ปีที่ความถี่ ${closedPerYear} ไม้ปิด/ปี` : '');
  return { reference: configLabel(ref), p0: Math.round(p0 * 1000) / 10, p1: p1 * 100, nIid, deff: Math.round(deff * 100) / 100, nNeeded, closedPerYear, years: yrs, note };
}

/** ตัวอย่างกับดัก: config ที่ชนะสูงสุด — เทียบ 50% ดู "มีนัย" แต่การสุ่มก็ชนะพอ ๆ กัน */
export function trapOf(rows: WinRow[]) {
  const pool = rows.filter((r) => r.filter === 'all' && r.discovery.closed >= LAB.minTrades && r.discovery.winRate !== null);
  const top = [...pool].sort((a, b) => b.discovery.winRate! - a.discovery.winRate! || (a.discovery.baseline ?? 0) - (b.discovery.baseline ?? 0))[0];
  if (!top) return null;
  const d = top.discovery;
  return {
    config: configLabel(top),
    key: top.key,
    win: d.winRate!,
    baseline: d.baseline,
    pVs50: rp(binomTailGE(d.wins, d.closed, 0.5)),
    pExcess: d.pExcess,
    expectancy: d.expectancy?.mean ?? null,
  };
}
