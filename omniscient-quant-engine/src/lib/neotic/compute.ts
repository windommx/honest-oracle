// ============================================================
// สแกน Neotic 3D (pure · point-in-time · deterministic) — ชั้น 1–4 ของสถาปัตยกรรมในข้อความต้นแบบ
//  ชั้น 1 สแกน: RS Rank แบบตัดขวางรายวัน (เทียบหุ้นที่ซื้อขายวันนั้น) · % ต่ำกว่าจุดสูงสุด 52 สัปดาห์ (high 252 วัน)
//        · ปริมาณ ÷ ค่าเฉลี่ย 50 วันก่อนหน้า (ไม่รวมวันนั้น · นับเฉพาะวันที่มีการซื้อขาย) · การเติบโตกำไรตามวันประกาศงบ
//  ชั้น 2 ส่งคำสั่ง: โบรกเกอร์กระดาษชุดเดียวกับทั้งแพลตฟอร์ม — ซื้อราคาเปิดวันถัดไป · SL 5% และ TP 15% จากราคาได้ของ
//        · ออกเมื่อปิดต่ำกว่า EMA20 (ขายราคาเปิดวันถัดไป) · ถือไม่เกิน 60 วัน · หักค่าธรรมเนียมไป-กลับ
//  ชั้น 3 เดินหน้า: จูน 4 เกณฑ์ (RS_DIV · knee · DIST_B · vol_trigger ตามช่วงของต้นแบบ) บน train → วัดบน test ที่ไม่เคยเห็น
//        เทียบเกณฑ์ตามสเปกและการสุ่มเข้า (หุ้นเดียวกัน หน้าต่างเดียวกัน กติกาออกเดียวกัน)
//  ชั้น 4 MAE/MFE: การเดินราคาหลังสัญญาณแบบไม่ถูกตัด (stop กว้าง ไม่มีเป้า) เทียบวันสุ่ม → SL/TP ที่ข้อมูลบอก (บรรยายเท่านั้น)
// งบ: กำไรสุทธิรายไตรมาสแทน EPS (จำนวนหุ้นคงที่ = อัตราเติบโตเท่ากัน) · ใช้ได้ตั้งแต่วันประกาศ
//      วันประกาศเร็วกว่า 14 วันหลังสิ้นงวด = ไม่น่าเชื่อ (มักเป็นวันสิ้นงวด) → ใช้วันสิ้นงวด + 60 วันแบบระมัดระวังตามต้นแบบ
// ============================================================

import type { MarketState } from '@/lib/quant/engine/types';
import { mulberry32 } from '@/lib/quant/rng';
import { mean, quantile, wilsonInterval } from '@/lib/quant/stats';
import { maxDrawdown, weekBootstrap } from '@/lib/walkforward/compute';
import { weekOf } from '@/lib/winrate/signals';
import { clusterMean } from '@/lib/winrate/stats';
import { EXEC, emaOf, floorToTick, simulatePlan, type Bars, type ExecRule, type ExitKind, type PaperResult, type PlanInput } from '@/lib/workflow/execution';
import { barsOf } from '@/lib/workflow/replay';
import type {
  GrowthStatus,
  NeoExcursion,
  NeoFold,
  NeoFunnel,
  NeoQuantiles,
  NeoRecent,
  NeoScanRow,
  NeoStats,
  NeoThresholds,
  NeoTrade,
  NeoWalkforward,
  NeoZone,
} from './types';

export const NEO = {
  /** น้ำหนักของ ROC ในคะแนน RS (locked spec) */
  weights: [
    { days: 63, weight: 0.4 },
    { days: 126, weight: 0.2 },
    { days: 189, weight: 0.2 },
    { days: 252, weight: 0.2 },
  ],
  /** เกณฑ์ตามสเปก: โซน B = RS ≥ 80 และต่ำกว่าจุดสูงสุด 5–15% · ปริมาณ ≥ 2.5 เท่า */
  locked: { rsDiv: 80, knee: 5, distB: 15, volTrigger: 2.5 } as NeoThresholds,
  /** ช่วงจูนตามโค้ด Optuna ของต้นแบบ (rs_div 70–90 · knee 3–5 · dist_b 10–20 · vol_trigger 2.0–3.5) แบบกริด */
  grid: { rsDiv: [70, 75, 80, 85, 90], knee: [3, 4, 5], distB: [10, 12.5, 15, 17.5, 20], volTrigger: [2, 2.5, 3, 3.5] },
  /** เกณฑ์ปริมาณที่แสดงในกรวย (1.5 อยู่นอกช่วงจูนของต้นแบบ — ใช้ดูความไวเท่านั้น) */
  funnelTriggers: [1.5, 2, 2.5, 3, 3.5],
  highWindow: 252,
  volWindow: 50,
  /** วันที่มีการซื้อขายขั้นต่ำในหน้าต่าง 50 วันก่อนจะคำนวณอัตราส่วนปริมาณ */
  volMinDays: 30,
  emaPeriod: 20,
  /** กติกาออกตามโค้ดตัวอย่าง (ค่าชั่วคราวที่ต้นแบบบอกให้จูนด้วย MAE/MFE) */
  stopPct: 5,
  targetPct: 15,
  /** ต้นแบบไม่บังคับออกตามเวลา — เพดาน 60 วันทำการไว้ปิดไม้ที่ค้างนาน (นับเป็น "หมดเวลา") */
  maxHold: 60,
  lagDays: 60,
  minAnnounceLag: 14,
  randomPerSignal: 12,
  minRandomClosed: 4,
  folds: 4,
  initialShare: 0.4,
  minTrain: 15,
  /** วัน-หุ้นขั้นต่ำที่ผ่านเกณฑ์หลวมสุดของกริด ก่อนจะแบ่งหน้าต่างเดินหน้า */
  minCandidates: 40,
  /** ไม้ปิดขั้นต่ำก่อนตัดสินกติกา */
  minTrades: 20,
  boot: 1000,
  seed: 20261004,
  excursionHold: 20,
  wideStopPct: 15,
  maeQ: 0.95,
  mfeQ: 0.75,
  randomStudy: 4,
  sessionsPerYear: 245,
};

/** กติกาออกของ Neotic บนโบรกเกอร์กระดาษ (เป้า 15% = 3R ของ stop 5%) */
export const NEO_RULE: ExecRule = {
  orderDays: EXEC.orderDays,
  holdDays: NEO.maxHold,
  targetR: NEO.targetPct / NEO.stopPct,
  costPct: EXEC.costPct,
  trailEma: NEO.emaPeriod,
};

/** ช่วงตัดรอยต่อ train/test = วันที่คำสั่งรอได้ + วันถือสูงสุด → ไม้ของ train ปิดก่อน test เริ่มเสมอ */
export const NEO_EMBARGO = EXEC.orderDays + NEO.maxHold;

/** เกณฑ์หลวมสุดของกริด — วัน-หุ้นที่ผ่านชุดนี้คือผู้สมัครของทุกชุดเกณฑ์ */
export const NEO_LOOSE: NeoThresholds = {
  rsDiv: Math.min(...NEO.grid.rsDiv),
  knee: Math.min(...NEO.grid.knee),
  distB: Math.max(...NEO.grid.distB),
  volTrigger: Math.min(...NEO.grid.volTrigger),
};

export const thresholdsLabel = (th: NeoThresholds) => `RS ≥ ${th.rsDiv} · ต่ำกว่าจุดสูงสุด ${th.knee}–${th.distB}% · ปริมาณ ≥ ${th.volTrigger}×`;

const DAY = 86_400_000;
const PERIOD_RE = /^(\d{4})-Q([1-4])$/;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};
const rp = (p: number) => (p >= 0.001 ? Math.round(p * 1e4) / 1e4 : Number(p.toPrecision(2)));
const fin = (v: number) => Number.isFinite(v);
const orNull = (v: number, round: (x: number) => number = r2) => (Number.isFinite(v) ? round(v) : null);
const isClosed = (r: PaperResult) => r.state === 'closed' && r.retNetPct !== null;

export function growthStatus(qoq: number, yoy: number): GrowthStatus {
  if (!fin(qoq) || !fin(yoy)) return 'unknown';
  if (qoq > 0 && yoy > 0) return 'green';
  return qoq > 0 || yoy > 0 ? 'mixed' : 'red';
}

export function zoneOf(rs: number, dist: number, th: NeoThresholds): NeoZone {
  if (!fin(rs) || !fin(dist)) return 'na';
  if (rs < th.rsDiv) return 'weak';
  if (dist < th.knee) return 'near';
  return dist >= th.distB ? 'far' : 'B';
}

export interface NeoPoint {
  rs: number;
  dist: number;
  vr: number;
  green: boolean;
}

/** ผ่านกติกาเข้าครบทุกข้อ (โซน B + เขียว + ปริมาณ) */
export const passes = (p: NeoPoint, th: NeoThresholds) => p.green && p.rs >= th.rsDiv && p.dist >= th.knee && p.dist < th.distB && p.vr >= th.volTrigger;

// ─────────────────────────── ชั้น 1: ตัวแปรของสแกน ───────────────────────────

export interface NeoFeatures {
  dates: string[];
  /** วันแรกที่มีตัวแปรครบ (ROC 252 วัน) · วันสุดท้ายของข้อมูล */
  tStart: number;
  tEnd: number;
  bars: Bars[];
  rsRaw: Float64Array[];
  rsRank: Float64Array[];
  dist: Float64Array[];
  volRatio: Float64Array[];
  ema: Float64Array[];
  qoq: Float64Array[];
  yoy: Float64Array[];
  /** index ของ period ล่าสุดที่ประกาศแล้ว (ใน periods[si]) · −1 = ยังไม่มี */
  periodIdx: Int32Array[];
  periods: string[][];
  quarterInfo: { parsed: number; unparsed: number; early: number; lags: number[]; stocks: number };
}

/** QoQ/YoY (%) ณ ทุกวันจากงบที่ "ใช้ได้แล้ว" ณ วันนั้น — งวดล่าสุด = งวดใหม่สุดตามป้าย ไม่ใช่งบที่ประกาศล่าสุด (กันงบแก้ย้อนหลัง) */
function growthSeries(quarters: NonNullable<MarketState['stocks'][number]['quarters']>, dateMs: number[]) {
  const N = dateMs.length;
  const qoq = new Float64Array(N).fill(NaN);
  const yoy = new Float64Array(N).fill(NaN);
  const pidx = new Int32Array(N).fill(-1);
  const labels: string[] = [];
  let unparsed = 0;
  let early = 0;
  const lags: number[] = [];
  const parsed: Array<{ key: number; label: number; np: number; avail: number }> = [];
  for (const q of quarters) {
    const m = PERIOD_RE.exec(q.period);
    if (!m) {
      unparsed++;
      continue;
    }
    const y = Number(m[1]);
    const qq = Number(m[2]);
    const end = Date.UTC(y, qq * 3, 0);
    const lag = (q.announce - end) / DAY;
    const tooEarly = lag < NEO.minAnnounceLag;
    if (tooEarly) early++;
    else lags.push(lag);
    let li = labels.indexOf(q.period);
    if (li < 0) li = labels.push(q.period) - 1;
    parsed.push({ key: y * 4 + (qq - 1), label: li, np: q.netProfitM, avail: tooEarly ? end + NEO.lagDays * DAY : q.announce });
  }
  parsed.sort((a, b) => a.avail - b.avail);
  const known = new Map<number, { np: number; label: number }>();
  let latest = -Infinity;
  let ptr = 0;
  let cur = { qoq: NaN, yoy: NaN, label: -1 };
  const growth = (np: number, base: { np: number } | undefined) => (base && base.np !== 0 ? ((np - base.np) / Math.abs(base.np)) * 100 : NaN);
  for (let t = 0; t < N; t++) {
    let changed = false;
    while (ptr < parsed.length && parsed[ptr].avail <= dateMs[t]) {
      const p = parsed[ptr++];
      known.set(p.key, { np: p.np, label: p.label });
      latest = Math.max(latest, p.key);
      changed = true;
    }
    if (changed) {
      const now = known.get(latest)!;
      cur = { qoq: growth(now.np, known.get(latest - 1)), yoy: growth(now.np, known.get(latest - 4)), label: now.label };
    }
    qoq[t] = cur.qoq;
    yoy[t] = cur.yoy;
    pidx[t] = cur.label;
  }
  return { qoq, yoy, pidx, labels, info: { parsed: parsed.length, unparsed, early, lags } };
}

export function neoFeatures(state: MarketState): NeoFeatures {
  const dates = state.dates.map(keyOf);
  const dateMs = state.dates.map((d) => d.getTime());
  const N = dates.length;
  const S = state.stocks.length;
  const maxD = Math.max(...NEO.weights.map((w) => w.days));
  const tStart = Math.max(maxD, NEO.highWindow - 1, NEO.volWindow);
  const bars = state.stocks.map((_, si) => barsOf(state, si, dates));
  const rsRaw: Float64Array[] = [];
  const dist: Float64Array[] = [];
  const volRatio: Float64Array[] = [];
  const ema: Float64Array[] = [];
  const qoq: Float64Array[] = [];
  const yoy: Float64Array[] = [];
  const periodIdx: Int32Array[] = [];
  const periods: string[][] = [];
  const quarterInfo = { parsed: 0, unparsed: 0, early: 0, lags: [] as number[], stocks: 0 };

  for (let si = 0; si < S; si++) {
    const b = bars[si];
    const close = b.close;
    // คะแนน RS ดิบ (%)
    const raw = new Float64Array(N).fill(NaN);
    for (let t = maxD; t < N; t++) {
      let v = 0;
      let ok = close[t] > 0;
      for (const w of NEO.weights) {
        const c0 = close[t - w.days];
        if (!(c0 > 0)) ok = false;
        else v += w.weight * (close[t] / c0 - 1);
      }
      raw[t] = ok ? v * 100 : NaN;
    }
    rsRaw.push(raw);
    // % ต่ำกว่าจุดสูงสุด 52 สัปดาห์ (sliding max ของ high แบบ deque)
    const d = new Float64Array(N).fill(NaN);
    const dq: number[] = [];
    let head = 0;
    for (let t = 0; t < N; t++) {
      while (dq.length > head && b.high[dq[dq.length - 1]] <= b.high[t]) dq.pop();
      dq.push(t);
      if (dq[head] <= t - NEO.highWindow) head++;
      if (t >= NEO.highWindow - 1) {
        const hi = b.high[dq[head]];
        d[t] = hi > 0 ? (1 - close[t] / hi) * 100 : NaN;
      }
    }
    dist.push(d);
    // ปริมาณ ÷ ค่าเฉลี่ย 50 วันก่อนหน้า (เฉพาะวันที่มีการซื้อขาย)
    const vr = new Float64Array(N).fill(NaN);
    let sum = 0;
    let cnt = 0;
    for (let t = 0; t < N; t++) {
      if (t - 1 >= 0 && b.volume[t - 1] > 0) {
        sum += b.volume[t - 1];
        cnt++;
      }
      const out = t - 1 - NEO.volWindow;
      if (out >= 0 && b.volume[out] > 0) {
        sum -= b.volume[out];
        cnt--;
      }
      if (b.volume[t] > 0 && cnt >= NEO.volMinDays && sum > 0) vr[t] = b.volume[t] / (sum / cnt);
    }
    volRatio.push(vr);
    ema.push(emaOf(close, NEO.emaPeriod));
    const g = growthSeries(state.stocks[si].quarters ?? [], dateMs);
    qoq.push(g.qoq);
    yoy.push(g.yoy);
    periodIdx.push(g.pidx);
    periods.push(g.labels);
    quarterInfo.parsed += g.info.parsed;
    quarterInfo.unparsed += g.info.unparsed;
    quarterInfo.early += g.info.early;
    quarterInfo.lags.push(...g.info.lags);
    if (g.info.parsed > 0) quarterInfo.stocks++;
  }

  // RS Rank = เปอร์เซ็นไทล์ตัดขวาง (อันดับเฉลี่ยเมื่อค่าเท่ากัน ÷ จำนวนหุ้น × 99 แบบ rank(pct=True) × 99 ของต้นแบบ) เฉพาะหุ้นที่ซื้อขายวันนั้น
  const rsRank = state.stocks.map(() => new Float64Array(N).fill(NaN));
  for (let t = maxD; t < N; t++) {
    const xs: Array<{ si: number; v: number }> = [];
    for (let si = 0; si < S; si++) if (bars[si].volume[t] > 0 && fin(rsRaw[si][t])) xs.push({ si, v: rsRaw[si][t] });
    xs.sort((a, b) => a.v - b.v);
    const n = xs.length;
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && xs[j + 1].v === xs[i].v) j++;
      const avgRank = (i + 1 + (j + 1)) / 2;
      for (let k = i; k <= j; k++) rsRank[xs[k].si][t] = (avgRank / n) * 99;
      i = j + 1;
    }
  }
  return { dates, tStart, tEnd: N - 1, bars, rsRaw, rsRank, dist, volRatio, ema, qoq, yoy, periodIdx, periods, quarterInfo };
}

/** จุดของหุ้น si วัน t (null = ตัวแปรไม่ครบหรือไม่ได้ซื้อขาย) */
export function pointAt(f: NeoFeatures, si: number, t: number): NeoPoint | null {
  const rs = f.rsRank[si][t];
  const dist = f.dist[si][t];
  const vr = f.volRatio[si][t];
  if (!(f.bars[si].volume[t] > 0) || !fin(rs) || !fin(dist) || !fin(vr)) return null;
  return { rs, dist, vr, green: growthStatus(f.qoq[si][t], f.yoy[si][t]) === 'green' };
}

// ─────────────────────────── ชั้น 2: ส่งคำสั่ง + สถิติ ───────────────────────────

/** แผนของ Neotic ณ วัน t: ซื้อราคาเปิดวันถัดไป · stop = % ใต้ราคาได้ของ (ราคาปิดวันสัญญาณใช้กันซื้อเมื่อเปิดหลุด) */
export function neoPlan(close: number, stopPct: number = NEO.stopPct): PlanInput {
  return { kind: 'momentum', close, limit: null, stop: floorToTick(close * (1 - stopPct / 100)), stopPct };
}

interface Obs {
  res: PaperResult;
  week: string;
  q: { win: number; exp: number } | null;
}

const profitFactor = (xs: number[]) => {
  const g = xs.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const l = -xs.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  return l > 0 ? g / l : null;
};

export function statsOf(signals: number, obs: Obs[], seed: number): NeoStats {
  const closed = obs.filter((o) => isClosed(o.res)).sort((a, b) => a.res.exit!.date.localeCompare(b.res.exit!.date));
  const rets = closed.map((o) => o.res.retNetPct!);
  const weeks = closed.map((o) => o.week);
  const n = closed.length;
  const wins = rets.filter((v) => v > 0).length;
  const w = n ? wilsonInterval(wins, n) : null;
  const exp = clusterMean(rets, weeks);
  const paired = closed.filter((o) => o.q !== null);
  const ex = clusterMean(
    paired.map((o) => o.res.retNetPct! - o.q!.exp),
    paired.map((o) => o.week),
  );
  const boot = n >= 3 ? weekBootstrap(closed.map((o, j) => ({ ret: rets[j], week: weeks[j] })), NEO.boot, mulberry32(seed)) : null;
  const pf = profitFactor(rets);
  const byExit: Record<ExitKind, number> = { target: 0, stop: 0, time: 0, trail: 0 };
  for (const o of closed) byExit[o.res.exit!.kind]++;
  return {
    signals,
    trades: n,
    open: obs.filter((o) => o.res.state === 'open').length,
    wins,
    winRate: n ? r1((100 * wins) / n) : null,
    wilson: w ? { lo: r1(100 * w.lo), hi: r1(100 * w.hi) } : null,
    expectancy: exp ? { mean: r3(exp.mean), lo: r3(exp.lo), hi: r3(exp.hi) } : null,
    meanRNet: n ? r3(mean(closed.map((o) => o.res.rNet!))) : null,
    profitFactor: pf === null ? null : r2(pf),
    pfCI: boot && boot.pfLo !== null && boot.pfHi !== null ? { lo: r2(boot.pfLo), hi: r2(boot.pfHi) } : null,
    maxDD: n ? r2(maxDrawdown(rets)) : null,
    maxDD95: boot ? r2(boot.dd95) : null,
    avgDays: n ? r1(mean(closed.map((o) => o.res.days ?? 0))) : null,
    byExit,
    random: {
      winRate: paired.length ? r1(100 * mean(paired.map((o) => o.q!.win))) : null,
      expectancy: paired.length ? r3(mean(paired.map((o) => o.q!.exp))) : null,
    },
    excess: ex ? { mean: r3(ex.mean), lo: r3(ex.lo), hi: r3(ex.hi) } : null,
    pExcess: ex ? rp(ex.p) : null,
  };
}

function quantilesOf(ex: Array<{ mae: number; mfe: number }>): NeoQuantiles {
  const n = ex.length;
  if (n < 5) return { n, maeP50: null, maeP95: null, mfeP50: null, mfeP75: null, eRatio: null };
  const mae = ex.map((e) => e.mae);
  const mfe = ex.map((e) => e.mfe);
  const mMae = mean(mae);
  return {
    n,
    maeP50: r2(quantile(mae, 0.5)),
    maeP95: r2(quantile(mae, NEO.maeQ)),
    mfeP50: r2(quantile(mfe, 0.5)),
    mfeP75: r2(quantile(mfe, NEO.mfeQ)),
    eRatio: mMae > 0 ? r2(mean(mfe) / mMae) : null,
  };
}

// ─────────────────────────── คำนวณทั้งหน้า ───────────────────────────

export interface NeoCand extends NeoPoint {
  si: number;
  t: number;
  date: string;
  week: string;
  qoq: number;
  yoy: number;
}

export interface NeoFacts {
  sessions: number;
  years: number;
  stocks: number;
  /** หุ้นที่มีงบรายไตรมาสอ่านได้อย่างน้อย 1 งวด */
  fundStocks: number;
  /** หุ้นที่รู้การเติบโตทั้ง QoQ และ YoY ณ วันล่าสุด */
  growthToday: number;
  unparsed: number;
  early: number;
  lagMedian: number | null;
  /** % ของวัน-หุ้นในหน้าต่างที่ไม่มีการซื้อขาย */
  zeroVolPct: number;
  delisted: string[];
  signals: number;
  closed: number;
}

export interface NeoComputed {
  asOf: string;
  start: string;
  end: string;
  facts: NeoFacts;
  scan: NeoScanRow[];
  zones: Record<NeoZone, number>;
  recent: NeoRecent[];
  funnel: NeoFunnel;
  backtest: { stats: NeoStats; trades: NeoTrade[]; curve: Array<{ date: string; cum: number; random: number | null }> };
  walkforward: NeoWalkforward;
  excursion: NeoExcursion;
  candidates: number;
}

/** null = ประวัติราคาไม่พอคำนวณ ROC 252 วัน */
export function computeNeotic(state: MarketState, f: NeoFeatures = neoFeatures(state)): NeoComputed | null {
  const { dates, tStart, tEnd, bars } = f;
  if (tEnd < tStart) return null;
  const S = state.stocks.length;
  const N = dates.length;

  // ── ผลของโบรกเกอร์ต่อ (หุ้น, วัน) — cache เพราะวันสุ่มซ้ำกันได้ ──
  const simCache = new Map<number, PaperResult>();
  const simAt = (si: number, t: number) => {
    const k = si * N + t;
    let r = simCache.get(k);
    if (!r) {
      r = simulatePlan(bars[si], t, neoPlan(bars[si].close[t]), NEO_RULE);
      simCache.set(k, r);
    }
    return r;
  };
  const randomQ = (si: number, a: number, b: number, k: number, rng: () => number) => {
    if (b < a) return null;
    const rr: PaperResult[] = [];
    for (let j = 0; j < k; j++) {
      const r = simAt(si, a + Math.floor(rng() * (b - a + 1)));
      if (isClosed(r)) rr.push(r);
    }
    if (rr.length < NEO.minRandomClosed) return null;
    return { win: rr.filter((r) => r.retNetPct! > 0).length / rr.length, exp: mean(rr.map((r) => r.retNetPct!)) };
  };

  // ── ผู้สมัคร (ผ่านเกณฑ์หลวมสุดของกริด) + กรวยของเกณฑ์ตามสเปก ──
  const L = NEO.locked;
  const cands: NeoCand[] = [];
  const vrs: number[] = [];
  let days = 0;
  const cum = { rs: 0, zone: 0, growth: 0, volume: 0 };
  const alone = { rs: 0, zone: 0, growth: 0, volume: 0 };
  const byTrigger = NEO.funnelTriggers.map(() => 0);
  let zeroVol = 0;
  for (let t = tStart; t <= tEnd; t++) {
    for (let si = 0; si < S; si++) {
      if (!(bars[si].volume[t] > 0)) zeroVol++;
      const p = pointAt(f, si, t);
      if (!p) continue;
      days++;
      vrs.push(p.vr);
      const rsOk = p.rs >= L.rsDiv;
      const bandOk = p.dist >= L.knee && p.dist < L.distB;
      const volOk = p.vr >= L.volTrigger;
      if (rsOk) alone.rs++;
      if (bandOk) alone.zone++;
      if (p.green) alone.growth++;
      if (volOk) alone.volume++;
      if (rsOk) {
        cum.rs++;
        if (bandOk) {
          cum.zone++;
          if (p.green) {
            cum.growth++;
            if (volOk) cum.volume++;
            NEO.funnelTriggers.forEach((tr, k) => {
              if (p.vr >= tr) byTrigger[k]++;
            });
          }
        }
      }
      if (passes(p, NEO_LOOSE)) cands.push({ ...p, si, t, date: dates[t], week: weekOf(dates[t]), qoq: f.qoq[si][t], yoy: f.yoy[si][t] });
    }
  }
  cands.sort((a, b) => a.t - b.t || a.si - b.si);
  const candRes = cands.map((c) => simAt(c.si, c.t));
  const vq = (p: number) => (vrs.length ? r2(quantile(vrs, p)) : null);
  const aloneKeys = ['rs', 'zone', 'growth', 'volume'] as const;
  const funnel: NeoFunnel = {
    steps: [
      { key: 'days', label: 'วัน-หุ้นที่มีตัวแปรครบ', count: days, alone: null },
      { key: 'rs', label: `RS Rank ≥ ${L.rsDiv}`, count: cum.rs, alone: alone.rs },
      { key: 'zone', label: `+ ต่ำกว่าจุดสูงสุด ${L.knee}–${L.distB}% (โซน B)`, count: cum.zone, alone: alone.zone },
      { key: 'growth', label: '+ กำไรโต QoQ และ YoY (เขียว)', count: cum.growth, alone: alone.growth },
      { key: 'volume', label: `+ ปริมาณ ≥ ${L.volTrigger}× ค่าเฉลี่ย ${NEO.volWindow} วัน`, count: cum.volume, alone: alone.volume },
    ],
    binding: days ? [...aloneKeys].sort((a, b) => alone[a] - alone[b])[0] : null,
    volume: { days: vrs.length, p50: vq(0.5), p90: vq(0.9), p99: vq(0.99), max: vrs.length ? r2(Math.max(...vrs)) : null, aboveTrigger: alone.volume },
    byTrigger: NEO.funnelTriggers.map((trigger, k) => ({ trigger, signals: byTrigger[k], locked: trigger === L.volTrigger, inGrid: NEO.grid.volTrigger.includes(trigger) })),
  };

  // ── ชั้น 2: กติกาตามสเปกทั้งหน้าต่าง เทียบการสุ่มเข้า (หุ้นเดียวกัน · วันใดก็ได้ในหน้าต่าง · กติกาออกเดียวกัน) ──
  const lockedIdx = cands.map((_, i) => i).filter((i) => passes(cands[i], L));
  const brng = mulberry32(NEO.seed);
  const lockedObs: Obs[] = lockedIdx.map((i) => ({ res: candRes[i], week: cands[i].week, q: randomQ(cands[i].si, tStart, tEnd, NEO.randomPerSignal, brng) }));
  const stats = statsOf(lockedIdx.length, lockedObs, NEO.seed + 1);
  const closedLocked = lockedIdx
    .map((i, j) => ({ i, o: lockedObs[j] }))
    .filter((x) => isClosed(x.o.res))
    .sort((a, b) => a.o.res.exit!.date.localeCompare(b.o.res.exit!.date) || a.i - b.i);
  let run = 0;
  let runRand = 0;
  let anyRand = false;
  const trades: NeoTrade[] = [];
  const curve: Array<{ date: string; cum: number; random: number | null }> = [];
  for (const { i, o } of closedLocked) {
    const c = cands[i];
    const r = o.res;
    run += r.retNetPct!;
    if (o.q) {
      runRand += o.q.exp;
      anyRand = true;
    }
    trades.push({
      symbol: state.stocks[c.si].symbol,
      signalDate: c.date,
      entryDate: r.fill!.date,
      exitDate: r.exit!.date,
      entry: r.fill!.price,
      exit: r.exit!.price,
      retNetPct: r.retNetPct!,
      rNet: r.rNet!,
      days: r.days ?? 0,
      exitKind: r.exit!.kind,
      maePct: r.maePct,
      mfePct: r.mfePct,
      rsRank: r1(c.rs),
      dist: r2(c.dist),
      volRatio: r2(c.vr),
      cumPct: r2(run),
    });
    curve.push({ date: r.exit!.date, cum: r2(run), random: anyRand ? r2(runRand) : null });
  }
  const recent: NeoRecent[] = [...lockedIdx]
    .reverse()
    .slice(0, 15)
    .flatMap((i) => {
      const c = cands[i];
      const r = candRes[i];
      if (r.state === 'invalid') return [];
      return [
        {
          date: c.date,
          symbol: state.stocks[c.si].symbol,
          rsRank: r1(c.rs),
          dist: r2(c.dist),
          volRatio: r2(c.vr),
          state: r.state,
          retNetPct: r.retNetPct,
          exitKind: r.exit?.kind ?? null,
        },
      ];
    });

  // ── ชั้น 3: เดินหน้าจูน 4 เกณฑ์ ──
  const walkforward = walkforwardNeo(cands, candRes, f, randomQ);

  // ── ชั้น 4: MAE/MFE แบบไม่ถูกตัด (stop กว้าง · ไม่มีเป้า · ไม่ออกตาม EMA) เทียบวันสุ่ม ──
  const wideRule: ExecRule = { orderDays: EXEC.orderDays, holdDays: NEO.excursionHold, targetR: null, costPct: EXEC.costPct };
  const excursionAt = (si: number, t: number) => {
    const r = simulatePlan(bars[si], t, neoPlan(bars[si].close[t], NEO.wideStopPct), wideRule);
    return isClosed(r) && r.maePct !== null && r.mfePct !== null ? { mae: r.maePct, mfe: r.mfePct, win: r.retNetPct! > 0 } : null;
  };
  const srng = mulberry32(NEO.seed + 13);
  const sx = lockedIdx.map((i) => excursionAt(cands[i].si, cands[i].t)).filter((x): x is NonNullable<typeof x> => x !== null);
  const rx = lockedIdx
    .flatMap((i) => Array.from({ length: NEO.randomStudy }, () => excursionAt(cands[i].si, tStart + Math.floor(srng() * (tEnd - tStart + 1)))))
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const sq = quantilesOf(sx);
  const excursion: NeoExcursion = {
    horizon: NEO.excursionHold,
    wideStopPct: NEO.wideStopPct,
    signal: sq,
    random: quantilesOf(rx),
    points: sx.slice(0, 400).map((x) => ({ mae: r2(x.mae), mfe: r2(x.mfe), win: x.win })),
    suggestion:
      sq.n >= 10 && sq.maeP95 !== null && sq.mfeP75 !== null
        ? {
            stopPct: Math.min(NEO.wideStopPct, Math.max(1, Math.round(sq.maeP95 * 2) / 2)),
            targetPct: Math.min(50, Math.max(1, Math.round(sq.mfeP75 * 2) / 2)),
          }
        : null,
  };

  // ── สแกน ณ วันล่าสุด ──
  const zones: Record<NeoZone, number> = { B: 0, near: 0, far: 0, weak: 0, na: 0 };
  const scan: NeoScanRow[] = state.stocks.map((s, si) => {
    const t = tEnd;
    const traded = bars[si].volume[t] > 0;
    const rs = traded ? f.rsRank[si][t] : NaN;
    const dist = f.dist[si][t];
    const vr = f.volRatio[si][t];
    const growth = growthStatus(f.qoq[si][t], f.yoy[si][t]);
    const zone = zoneOf(rs, dist, L);
    zones[zone]++;
    const checks = { rs: fin(rs) && rs >= L.rsDiv, zone: fin(dist) && dist >= L.knee && dist < L.distB, growth: growth === 'green', volume: fin(vr) && vr >= L.volTrigger };
    const pi = f.periodIdx[si][t];
    return {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      close: bars[si].close[t],
      rsRaw: orNull(f.rsRaw[si][t]),
      rsRank: orNull(rs, r1),
      dist: orNull(dist),
      volRatio: orNull(vr),
      ema20: orNull(f.ema[si][t], (v) => Math.round(v * 1e4) / 1e4),
      qoq: orNull(f.qoq[si][t], r1),
      yoy: orNull(f.yoy[si][t], r1),
      period: pi >= 0 ? f.periods[si][pi] : null,
      growth,
      zone,
      checks,
      signal: checks.rs && checks.zone && checks.growth && checks.volume,
    };
  });
  scan.sort((a, b) => (b.rsRank ?? -1) - (a.rsRank ?? -1) || a.symbol.localeCompare(b.symbol));

  // ── ข้อเท็จจริงสำหรับรายการความพร้อมของข้อมูล ──
  const last = N - 1;
  const delisted = state.stocks
    .filter((_, si) => {
      let lastLive = -1;
      for (let t = last; t >= 0; t--)
        if (bars[si].volume[t] > 0) {
          lastLive = t;
          break;
        }
      return lastLive < last - 5;
    })
    .map((s) => s.symbol);
  const sessions = tEnd - tStart + 1;
  const facts: NeoFacts = {
    sessions,
    years: r2(sessions / NEO.sessionsPerYear),
    stocks: S,
    fundStocks: f.quarterInfo.stocks,
    growthToday: state.stocks.filter((_, si) => growthStatus(f.qoq[si][tEnd], f.yoy[si][tEnd]) !== 'unknown').length,
    unparsed: f.quarterInfo.unparsed,
    early: f.quarterInfo.early,
    lagMedian: f.quarterInfo.lags.length ? Math.round(quantile(f.quarterInfo.lags, 0.5)) : null,
    zeroVolPct: sessions * S ? r1((100 * zeroVol) / (sessions * S)) : 0,
    delisted,
    signals: lockedIdx.length,
    closed: stats.trades,
  };

  return {
    asOf: dates[tEnd],
    start: dates[tStart],
    end: dates[tEnd],
    facts,
    scan,
    zones,
    recent,
    funnel,
    backtest: { stats, trades, curve },
    walkforward,
    excursion,
    candidates: cands.length,
  };
}

// ─────────────────────────── ชั้น 3: เดินหน้าจูน 4 เกณฑ์ ───────────────────────────

export function gridConfigs(): NeoThresholds[] {
  const out: NeoThresholds[] = [];
  for (const rsDiv of NEO.grid.rsDiv)
    for (const knee of NEO.grid.knee) for (const distB of NEO.grid.distB) for (const volTrigger of NEO.grid.volTrigger) out.push({ rsDiv, knee, distB, volTrigger });
  return out;
}

function walkforwardNeo(
  cands: NeoCand[],
  res: PaperResult[],
  f: NeoFeatures,
  randomQ: (si: number, a: number, b: number, k: number, rng: () => number) => { win: number; exp: number } | null,
): NeoWalkforward {
  const configs = gridConfigs();
  const C = cands.length;
  const empty: NeoWalkforward = {
    ready: false,
    reason: null,
    candidates: C,
    configs: configs.length,
    folds: [],
    locked: null,
    tuned: null,
    vsLocked: null,
    pVsLocked: null,
    isExpectancy: null,
    wfe: null,
  };
  if (C < NEO.minCandidates) {
    return {
      ...empty,
      reason: `วัน-หุ้นที่ผ่านเกณฑ์หลวมสุดของกริด (${thresholdsLabel(NEO_LOOSE)} + เขียว) มีเพียง ${C} ครั้ง — ต้องมีอย่างน้อย ${NEO.minCandidates} ครั้งจึงแบ่ง train/test ได้`,
    };
  }
  const L = NEO.locked;
  const initN = Math.floor(C * NEO.initialShare);
  const startsT = [...new Set(Array.from({ length: NEO.folds }, (_, k) => cands[Math.min(C - 1, initN + Math.floor(((C - initN) * k) / NEO.folds))].t))].sort((a, b) => a - b);
  const ranges = startsT.map((a, k) => [a, k + 1 < startsT.length ? startsT[k + 1] - 1 : f.tEnd] as const);
  const rng = mulberry32(NEO.seed + 29);
  const folds: NeoFold[] = [];
  const tunedObs: Obs[] = [];
  const lockedObs: Obs[] = [];
  const diffs: number[] = [];
  const diffWeeks: string[] = [];
  let tunedSignals = 0;
  let lockedSignals = 0;
  let isW = 0;
  let isS = 0;
  const statOn = (idx: number[], th: NeoThresholds) => {
    const keep = idx.filter((i) => passes(cands[i], th) && isClosed(res[i]));
    const rets = keep.map((i) => res[i].retNetPct!);
    return { n: keep.length, exp: keep.length ? mean(rets) : null, win: keep.length ? (100 * rets.filter((v) => v > 0).length) / keep.length : null };
  };
  ranges.forEach(([a, b], k) => {
    const trainIdx: number[] = [];
    const testIdx: number[] = [];
    cands.forEach((c, i) => {
      if (c.t < a - NEO_EMBARGO) trainIdx.push(i);
      else if (c.t >= a && c.t <= b) testIdx.push(i);
    });
    let best: { th: NeoThresholds; e: number; n: number } | null = null;
    for (const th of configs) {
      let n = 0;
      let s = 0;
      for (const i of trainIdx) {
        if (!passes(cands[i], th) || !isClosed(res[i])) continue;
        n++;
        s += res[i].retNetPct!;
      }
      if (n < NEO.minTrain) continue;
      const e = s / n;
      if (!best || e > best.e + 1e-12 || (Math.abs(e - best.e) <= 1e-12 && n > best.n)) best = { th, e, n };
    }
    const pick = best?.th ?? L;
    const isSt = statOn(trainIdx, pick);
    if (isSt.exp !== null) {
      isW += isSt.n;
      isS += isSt.exp * isSt.n;
    }
    const tuned = { trades: 0, wins: 0, sum: 0 };
    const lock = { trades: 0, wins: 0, sum: 0 };
    const rexp: number[] = [];
    for (const i of testIdx) {
      const c = cands[i];
      const pT = passes(c, pick);
      const pL = passes(c, L);
      const closed = isClosed(res[i]);
      diffs.push((pT && closed ? res[i].retNetPct! : 0) - (pL && closed ? res[i].retNetPct! : 0));
      diffWeeks.push(c.week);
      if (!pT && !pL) continue;
      const q = randomQ(c.si, a, b, NEO.randomPerSignal, rng);
      if (q) rexp.push(q.exp);
      const o: Obs = { res: res[i], week: c.week, q };
      if (pT) {
        tunedSignals++;
        tunedObs.push(o);
        if (closed) {
          tuned.trades++;
          tuned.sum += res[i].retNetPct!;
          if (res[i].retNetPct! > 0) tuned.wins++;
        }
      }
      if (pL) {
        lockedSignals++;
        lockedObs.push(o);
        if (closed) {
          lock.trades++;
          lock.sum += res[i].retNetPct!;
          if (res[i].retNetPct! > 0) lock.wins++;
        }
      }
    }
    const summary = (x: { trades: number; wins: number; sum: number }) => ({
      trades: x.trades,
      win: x.trades ? r1((100 * x.wins) / x.trades) : null,
      exp: x.trades ? r3(x.sum / x.trades) : null,
    });
    folds.push({
      index: k + 1,
      trainStart: trainIdx.length ? cands[trainIdx[0]].date : null,
      trainEnd: trainIdx.length ? cands[trainIdx[trainIdx.length - 1]].date : null,
      testStart: f.dates[a],
      testEnd: f.dates[b],
      trainCandidates: trainIdx.length,
      testCandidates: testIdx.length,
      pick,
      pickLabel: thresholdsLabel(pick),
      fallback: !best,
      isTrades: isSt.n,
      isExp: isSt.exp === null ? null : r3(isSt.exp),
      tuned: summary(tuned),
      locked: summary(lock),
      randExp: rexp.length ? r3(mean(rexp)) : null,
    });
  });
  const tunedStats = statsOf(tunedSignals, tunedObs, NEO.seed + 31);
  const lockedStats = statsOf(lockedSignals, lockedObs, NEO.seed + 37);
  const vs = clusterMean(diffs, diffWeeks);
  const isExp = isW ? isS / isW : null;
  const oosExp = tunedStats.expectancy?.mean ?? null;
  return {
    ...empty,
    ready: true,
    folds,
    locked: lockedStats,
    tuned: tunedStats,
    vsLocked: vs ? { mean: r3(vs.mean), lo: r3(vs.lo), hi: r3(vs.hi) } : null,
    pVsLocked: vs ? rp(vs.p) : null,
    isExpectancy: isExp === null ? null : r3(isExp),
    wfe: isExp !== null && isExp > 0 && oosExp !== null ? r2(oosExp / isExp) : null,
  };
}
