// ============================================================
// Atlas พฤติกรรมระบบ — คำนวณ 6 มุม (pure · deterministic · seed คงที่)
// ข้อมูล 2 ชุดที่แยกกันชัดเจน:
//  (1) สัญญาณตามกติกา 5 ด่านทั้งหน้าต่าง (ตารางด่านชุดเดียวกับหน้าจังหวะตลาด) → จำลองเป็นไม้: เข้าที่ราคาปิดวันสัญญาณ,
//      stop = stopHard ของแผน, เป้า = +2R, ถือไม่เกิน 5 วัน — กติกาถูกจูนบนข้อมูลชุดนี้ จึงเป็นผล "ในตัวอย่าง" (มุม B–E)
//  (2) walk-forward backtest ของเอนจิน (P(up) นอกตัวอย่าง · train 252 → embargo 5 → test 21) → ทดสอบว่าส่วนที่ "ฉลาด" ช่วยจริงไหม (มุม A, F)
// ทุกข้อสรุปมีช่วงความเชื่อมั่น (bootstrap แบบบล็อก) หรือค่า p (เลื่อนเป็นวงกลม / ปรับหลายการทดสอบ) และบอกตรง ๆ เมื่อ "ยังสรุปไม่ได้"
// ============================================================

import { sectorLabel, thDate, TH_MONTH } from '@/lib/flows/format';
import type { BacktestResult, BtTrade } from '@/lib/quant/engine/backtest';
import { RULES } from '@/lib/quant/engine/rules';
import type { MarketState } from '@/lib/quant/engine/types';
import { mulberry32 } from '@/lib/quant/rng';
import { bhFdr, mean, median, pearson, quantile, std } from '@/lib/quant/stats';
import { DAY_FEATURES, MAX_SECTORS, OTHER_SECTOR, type GateBlockMatrix } from '@/lib/rhythm/compute';
import type { BreadthPanel, DayMapPanel } from '@/lib/rhythm/types';
import { aucSorted, bootDiff, bootMean, bootPaired, nEff, spearman } from './stats';
import type {
  AtlasCI,
  AtlasDepth,
  AtlasExitLever,
  AtlasHeader,
  AtlasIntel,
  AtlasLever,
  AtlasLifecycle,
  AtlasMix,
  AtlasResponse,
  AtlasStateMap,
  AtlasTiming,
  AtlasTrade,
  AtlasVerdict,
  EndKey,
} from './types';

export const ATLAS = {
  /** ถือไม้ไม่เกินกี่วันทำการ */
  holdDays: 5,
  /** เป้ากำไรเป็นกี่เท่าของความเสี่ยงต่อไม้ (R) */
  targetR: 2,
  boot: 400,
  /** ความยาวบล็อกของ bootstrap (วันทำการ) — คงความสัมพันธ์ตามเวลา */
  block: 5,
  shifts: 200,
  /** เลื่อนผลเป็นวงกลมอย่างน้อยกี่วัน (ตัดความสัมพันธ์ใกล้ ๆ ทิ้ง) */
  minShift: 21,
  knn: 10,
  /** ไม่นับเพื่อนบ้านที่ห่างกันไม่เกินกี่วันทำการ */
  exclude: 5,
  seed: 20260930,
  /** วันที่มีสัญญาณ ≥ เท่านี้ = "แออัด" */
  crowd: 3,
  /** ส่วนต่างของโมเดล = หุ้น 20% บนสุด − 20% ล่างสุดตาม P(up) */
  spreadQ: 0.2,
  spikeGap: 10,
} as const;

export interface AtlasInput {
  state: MarketState;
  t0: number;
  t1: number;
  gates: GateBlockMatrix;
  dayMap: DayMapPanel;
  breadth: BreadthPanel;
  features: { ts: number[]; X: number[][] };
  backtest: BacktestResult;
  data: { kind: string; label: string };
}

const WEEKDAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'];
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const round = (v: number, digits = 2) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return r === 0 ? 0 : r;
};
const pctOf = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const signed = (v: number, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;
const ciText = (c: AtlasCI, digits = 2, unit = '') => `${signed(c.mean, digits)}${unit} [${signed(c.lo, digits)}, ${signed(c.hi, digits)}]`;
const roundCI = (c: AtlasCI, digits = 3): AtlasCI => ({ mean: round(c.mean, digits), lo: round(c.lo, digits), hi: round(c.hi, digits) });
const excludesZero = (c: AtlasCI) => c.lo > 0 || c.hi < 0;
/** คำตัดสินของคันโยกเทียบกติกาปัจจุบัน — ผ่านเกณฑ์ต่อเมื่อ q < 0.1 และ CI ไม่คร่อมศูนย์ */
const verdictOf = (i: number, same: boolean, q: number, diff: AtlasCI): AtlasVerdict =>
  i === 0 ? 'baseline' : same ? 'same' : q < 0.1 && diff.lo > 0 ? 'better' : q < 0.1 && diff.hi < 0 ? 'worse' : 'unclear';
const pText = (p: number) => (p < 0.001 ? '< 0.001' : p.toFixed(3));

export const END_LABEL: Record<EndKey, string> = {
  target: 'ถึงเป้า +2R',
  stop: 'โดน stop',
  timeUp: 'หมดเวลา · บวก',
  timeDown: 'หมดเวลา · ลบ/เสมอ',
  open: 'ยังเปิดอยู่',
};
const END_KEYS: EndKey[] = ['target', 'timeUp', 'timeDown', 'stop', 'open'];

// ─────────────────────────── ไม้จำลองจากสัญญาณตามกติกา ───────────────────────────

export interface ExitRule {
  /** ตัวคูณระยะ stop (1 = stopHard ของแผน) */
  stopMult: number;
  /** เป้าเป็น R · null = ไม่มีเป้า (ออกเมื่อหมดเวลาหรือโดน stop) */
  targetR: number | null;
  holdDays: number;
}
export const BASE_EXIT: ExitRule = { stopMult: 1, targetR: ATLAS.targetR, holdDays: ATLAS.holdDays };

/** จำลองไม้ของทุกสัญญาณ: เข้าที่ราคาปิด · วันเดียวกันแตะทั้ง stop และเป้า = นับว่าโดน stop ก่อน (ระวังไว้ก่อน) · เปิดต่ำกว่า stop = ออกที่ราคาเปิด */
export function simulateTrades(
  input: Pick<AtlasInput, 'state' | 't0' | 't1' | 'gates' | 'dayMap'>,
  rule: ExitRule = BASE_EXIT,
): { trades: AtlasTrade[]; perDay: number[] } {
  const { state, t0, t1, gates, dayMap } = input;
  const clusterByDate = new Map(dayMap.points.map((p) => [p.date, p.c]));
  const H = rule.holdDays;
  const trades: AtlasTrade[] = [];
  const perDay = new Array<number>(t1 - t0 + 1).fill(0);
  state.stocks.forEach((s, si) => {
    for (let t = t0; t <= t1; t++) {
      const i = t - t0;
      if (gates.cat[si][i] !== 5) continue;
      perDay[i]++;
      const date = keyOf(state.dates[t]);
      const entry = s.rows[t].close;
      let baseStop = gates.stop[si][i];
      if (!(baseStop > 0 && baseStop < entry)) baseStop = entry * 0.95;
      const R = (entry - baseStop) * rule.stopMult;
      const stop = entry - R;
      const target = rule.targetR === null ? Infinity : entry + rule.targetR * R;
      let end: EndKey = 'open';
      let exit = entry;
      let days = 0;
      for (let u = t + 1; u <= Math.min(t + H, t1); u++) {
        const o = s.ohlcv.open[u];
        days = u - t;
        if (s.ohlcv.low[u] <= stop) {
          end = 'stop';
          exit = o <= stop ? o : stop;
          break;
        }
        if (s.ohlcv.high[u] >= target) {
          end = 'target';
          exit = o >= target ? o : target;
          break;
        }
      }
      if (end === 'open' && t + H <= t1) {
        exit = s.rows[t + H].close;
        days = H;
        end = exit > entry ? 'timeUp' : 'timeDown';
      }
      const closed = end !== 'open';
      trades.push({
        date,
        symbol: s.symbol,
        sector: s.sector,
        kind: gates.kind[si][i] === 2 ? 'momentum' : 'pullback',
        cluster: clusterByDate.get(date) ?? null,
        regime: state.regime[t],
        end,
        ret: closed ? round((exit / entry - 1) * 100, 3) : null,
        r: closed ? round((exit - entry) / R, 3) : null,
        days,
      });
    }
  });
  trades.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  return { trades, perDay };
}

const closedOf = (trades: AtlasTrade[]) => trades.filter((t): t is AtlasTrade & { ret: number; r: number } => t.ret !== null && t.r !== null);
const winRateOf = (xs: Array<{ ret: number }>) => (xs.length ? round(pctOf(xs.filter((t) => t.ret > 0).length, xs.length), 1) : null);
const meanRetOf = (xs: Array<{ ret: number }>) => (xs.length ? round(mean(xs.map((t) => t.ret)), 3) : null);

// ─────────────────────────── walk-forward backtest: ตารางรายวัน ───────────────────────────

interface BtGrid {
  dates: string[];
  rows: BtTrade[][];
}

function btGrid(bt: BacktestResult): BtGrid {
  const dates: string[] = [];
  const rows: BtTrade[][] = [];
  for (const tr of bt.trades) {
    if (dates[dates.length - 1] !== tr.date) {
      dates.push(tr.date);
      rows.push([]);
    }
    rows[rows.length - 1].push(tr);
  }
  return { dates, rows };
}

/** ส่วนต่างของโมเดลวันนั้น (จุด %): ผลตอบแทนวันถัดไปของหุ้น 20% ที่ P(up) สูงสุด − 20% ต่ำสุด */
function daySpread(rows: BtTrade[]): number | null {
  if (rows.length < 5) return null;
  const sorted = [...rows].sort((a, b) => b.prob - a.prob);
  const q = Math.max(1, Math.floor(rows.length * ATLAS.spreadQ));
  return (mean(sorted.slice(0, q).map((r) => r.fwdRet)) - mean(sorted.slice(-q).map((r) => r.fwdRet))) * 100;
}

// ─────────────────────────── A · แผนที่สถานะตลาด ───────────────────────────

function stateMapSection(input: AtlasInput, trades: AtlasTrade[], grid: BtGrid, rng: () => number): AtlasStateMap {
  const { dayMap, features, state } = input;
  const nStocks = state.stocks.length;
  const spreadByDate = new Map<string, number | null>(grid.dates.map((d, i) => [d, daySpread(grid.rows[i])]));
  const points = dayMap.points.map((p) => {
    const v = spreadByDate.get(p.date);
    return { date: p.date, x: p.x, y: p.y, c: p.c, outcome: v === undefined || v === null ? null : round(v, 2) };
  });
  const clusters = dayMap.clusters.map((c) => {
    const days = dayMap.points.filter((p) => p.c === c.id);
    const tr = trades.filter((t) => t.cluster === c.id);
    const closed = closedOf(tr);
    const sp = days.map((p) => spreadByDate.get(p.date)).filter((v): v is number => v !== undefined && v !== null);
    return {
      id: c.id,
      label: c.label,
      share: c.share,
      nDays: days.length,
      nSignals: tr.length,
      signalRate: round(pctOf(tr.length, days.length * nStocks), 2),
      winRate: winRateOf(closed),
      meanRet: meanRetOf(closed),
      spread: sp.length ? round(mean(sp), 3) : null,
    };
  });

  // ความสอดคล้องกับเพื่อนบ้าน: วันที่ใกล้กันบนพื้นที่ตัวแปร (ไม่นับวันที่ใกล้กันทางเวลา) ให้ผลของโมเดลใกล้กันไหม
  const tIndex = new Map(features.ts.map((t, i) => [keyOf(state.dates[t]), i]));
  const oos = grid.dates
    .map((d, gi) => ({ d, gi, y: spreadByDate.get(d), fi: tIndex.get(d) }))
    .filter((v): v is { d: string; gi: number; y: number; fi: number } => v.y !== undefined && v.y !== null && v.fi !== undefined);
  const p = DAY_FEATURES.length;
  const Xo = oos.map((v) => features.X[v.fi]);
  const mu = Array.from({ length: p }, (_, j) => mean(Xo.map((r) => r[j])));
  const sd = Array.from({ length: p }, (_, j) => Math.max(1e-9, std(Xo.map((r) => r[j]))));
  const Z = Xo.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const y = oos.map((v) => v.y);
  const n = oos.length;
  const K = Math.min(ATLAS.knn, Math.max(1, n - 2 * ATLAS.exclude - 1));
  const neighbors: number[][] = [];
  for (let i = 0; i < n; i++) {
    const cand: Array<[number, number]> = [];
    for (let j = 0; j < n; j++) {
      if (Math.abs(i - j) <= ATLAS.exclude) continue;
      let d2 = 0;
      for (let k = 0; k < p; k++) d2 += (Z[i][k] - Z[j][k]) ** 2;
      cand.push([d2, j]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    neighbors.push(cand.slice(0, K).map((c) => c[1]));
  }
  const nbMean = (ys: number[]) => neighbors.map((nb) => mean(nb.map((j) => ys[j])));
  const rho = n > 10 ? spearman(y, nbMean(y)) : 0;
  let hits = 0;
  for (let s = 0; s < ATLAS.shifts && n > 2 * ATLAS.minShift; s++) {
    const delta = ATLAS.minShift + Math.floor(rng() * (n - 2 * ATLAS.minShift));
    const ys = y.map((_, i) => y[(i + delta) % n]);
    if (Math.abs(spearman(ys, nbMean(ys))) >= Math.abs(rho)) hits++;
  }
  const pNb = (1 + hits) / (1 + ATLAS.shifts);
  const featureCorr = DAY_FEATURES.map((f, j) => ({ feature: f.label, rho: round(spearman(Xo.map((r) => r[j]), y), 3) })).sort(
    (a, b) => Math.abs(b.rho) - Math.abs(a.rho),
  );
  const dateT = new Map(state.dates.map((d, t) => [keyOf(d), t]));
  const regime = (['risk_on', 'risk_off'] as const).map((key) => {
    const ys = oos.filter((v) => state.regime[dateT.get(v.d)!] === key).map((v) => v.y);
    return { key, label: key === 'risk_on' ? 'risk-on' : 'risk-off', n: ys.length, ci: roundCI(bootMean(ys, rng, ATLAS.boot, ATLAS.block)) };
  });
  const [ron, roff] = regime;
  const overlap = !(ron.ci.lo > roff.ci.hi || roff.ci.lo > ron.ci.hi);
  const structured = pNb < 0.05 && rho > 0;
  return {
    title: `แผนที่ ${points.length} วัน: วันที่อยู่ใกล้กันบนแผนที่${structured ? 'ให้ผลของโมเดลใกล้กันบางส่วน' : 'ไม่ได้ให้ผลของโมเดลใกล้กัน'} (ρ = ${rho.toFixed(2)}, p = ${pText(pNb)})`,
    basis:
      `${points.length} วันทำการ · ${DAY_FEATURES.length} ตัวแปรระดับตลาดที่คำนวณจากอดีตเท่านั้น · PCA 2 มิติ + k-means k=${clusters.length} (ชุดเดียวกับหน้าจังหวะตลาด) · ` +
      `ผลของวัน = ส่วนต่างของโมเดล: ผลตอบแทนวันถัดไปของหุ้น 20% ที่ P(up) สูงสุด − 20% ต่ำสุด (เฉพาะ ${n} วันในช่วง walk-forward)`,
    conclusion:
      `ความสอดคล้องกับเพื่อนบ้านใกล้สุด (k=${K}, ไม่นับวันที่ห่างกันไม่เกิน ${ATLAS.exclude} วันทำการ): ρ = ${rho.toFixed(3)} · p = ${pText(pNb)} จากการเลื่อนผลเป็นวงกลม ${ATLAS.shifts} ครั้ง — ` +
      (structured ? 'มีโครงสร้างที่ทำนายผลของโมเดลได้บางส่วน ' : 'ค่าใกล้ 0 / ไม่ต่างจากการสุ่ม หมายถึงตำแหน่งบนแผนที่บอกผลของโมเดลแทบไม่ได้ ') +
      `· ตัวแปรที่สัมพันธ์กับผลมากสุดคือ ${featureCorr[0].feature} (${signed(featureCorr[0].rho, 2)}), ${featureCorr[1].feature} (${signed(featureCorr[1].rho, 2)}). ` +
      `วัน risk-on (n=${ron.n}) ส่วนต่างเฉลี่ย ${ciText(ron.ci, 2, '%')} เทียบ risk-off (n=${roff.n}) ${ciText(roff.ci, 2, '%')} — ` +
      (overlap ? 'ช่วงความเชื่อมั่นซ้อนกัน จึงยังแยกสองภาวะไม่ได้จากข้อมูลชุดนี้' : 'ช่วงความเชื่อมั่นไม่ซ้อนกัน'),
    source: 'src/lib/atlas/compute.ts (stateMapSection) · ตัวแปร/กลุ่มวัน: src/lib/rhythm/compute.ts (dayFeatureMatrix, computeDayMap) · ผลของโมเดล: runBacktest (walk-forward)',
    features: DAY_FEATURES.map((f) => f.label),
    points,
    clusters,
    neighbor: { rho: round(rho, 3), p: round(pNb, 3), k: K, exclude: ATLAS.exclude, n },
    featureCorr,
    regime,
  };
}

// ─────────────────────────── B · จังหวะเวลา ───────────────────────────

function timingSection(input: AtlasInput, trades: AtlasTrade[]): AtlasTiming {
  const { state, t0, t1, breadth } = input;
  const wdOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() - 1;
  const mOf = (d: string) => Number(d.slice(5, 7)) - 1;
  const cells = WEEKDAYS.map(() => TH_MONTH.map(() => 0));
  for (const t of trades) {
    const wd = wdOf(t.date);
    if (wd >= 0 && wd < 5) cells[wd][mOf(t.date)]++;
  }
  const dayWd = new Array<number>(5).fill(0);
  const dayM = new Array<number>(12).fill(0);
  for (let t = t0; t <= t1; t++) {
    const k = keyOf(state.dates[t]);
    const wd = wdOf(k);
    if (wd >= 0 && wd < 5) dayWd[wd]++;
    dayM[mOf(k)]++;
  }
  const nDays = t1 - t0 + 1;
  const total = trades.length;
  const closed = closedOf(trades);
  const byWeekday = WEEKDAYS.map((label, i) => {
    const tr = closed.filter((t) => wdOf(t.date) === i);
    return {
      label,
      signals: trades.filter((t) => wdOf(t.date) === i).length,
      share: round(pctOf(trades.filter((t) => wdOf(t.date) === i).length, total), 1),
      dayShare: round(pctOf(dayWd[i], nDays), 1),
      winRate: winRateOf(tr),
      meanRet: meanRetOf(tr),
    };
  });
  const byMonth = TH_MONTH.map((label, i) => {
    const tr = closed.filter((t) => mOf(t.date) === i);
    const n = trades.filter((t) => mOf(t.date) === i).length;
    return { label, signals: n, share: round(pctOf(n, total), 1), dayShare: round(pctOf(dayM[i], nDays), 1), winRate: winRateOf(tr), meanRet: meanRetOf(tr) };
  });
  // สัญญาณรายเดือน (ปฏิทินจริง) เทียบ breadth เฉลี่ยรายเดือน
  const monthSig = new Map<string, number>();
  const monthBreadth = new Map<string, number[]>();
  for (const d of breadth.days) {
    const mk = d.date.slice(0, 7);
    monthSig.set(mk, monthSig.get(mk) ?? 0);
    monthBreadth.set(mk, [...(monthBreadth.get(mk) ?? []), d.breadth]);
  }
  for (const t of trades) monthSig.set(t.date.slice(0, 7), (monthSig.get(t.date.slice(0, 7)) ?? 0) + 1);
  const mk = [...monthBreadth.keys()];
  const breadthR = mk.length > 3 ? pearson(mk.map((k) => monthSig.get(k) ?? 0), mk.map((k) => mean(monthBreadth.get(k)!))) : 0;
  let peak: AtlasTiming['peak'] = null;
  cells.forEach((row, r) =>
    row.forEach((n, c) => {
      if (n > 0 && (!peak || n > peak.n)) peak = { weekday: WEEKDAYS[r], month: TH_MONTH[c], n };
    }),
  );
  const pk = peak as AtlasTiming['peak'];
  const ranked = byWeekday.filter((w) => w.meanRet !== null).sort((a, b) => b.meanRet! - a.meanRet!);
  const over = [...byWeekday].sort((a, b) => b.share - b.dayShare - (a.share - a.dayShare))[0];
  return {
    title: pk
      ? `สัญญาณกระจุกตัวที่ ${pk.weekday} × ${pk.month} (${pk.n} ครั้ง) และตามความกว้างของตลาด (r = ${breadthR.toFixed(2)} ต่อเดือน)`
      : 'ยังไม่มีสัญญาณในช่วงนี้',
    basis: `${nDays} วันทำการ · ${total} สัญญาณตามกติกา 5 ด่าน (pullback + momentum) · นับตามวันที่เกิดสัญญาณ · ผลต่อไม้จากไม้จำลอง (stop ของแผน · เป้า +${ATLAS.targetR}R · ถือ ≤ ${ATLAS.holdDays} วัน)`,
    conclusion:
      (over ? `${over.label} มีสัญญาณ ${over.share}% ขณะที่มีวันทำการ ${over.dayShare}% — มากกว่าสัดส่วนวันมากที่สุด. ` : '') +
      `สัญญาณรายเดือนเคลื่อนตาม breadth ของตลาด (r = ${breadthR.toFixed(2)}) จึงเป็น "ตามจังหวะของตลาดเอง" มากกว่าวันในปฏิทิน. ` +
      (ranked.length >= 2
        ? `ผลเฉลี่ยต่อไม้ดีสุดวัน${ranked[0].label} (${signed(ranked[0].meanRet!)}%, ชนะ ${ranked[0].winRate}%) แย่สุดวัน${ranked[ranked.length - 1].label} (${signed(ranked[ranked.length - 1].meanRet!)}%) — แต่ละวันมีไม้ไม่กี่สิบไม้ จึงเป็นข้อสังเกต ไม่ใช่รูปแบบที่พึ่งพาได้`
        : ''),
    source: 'src/lib/atlas/compute.ts (timingSection) · สัญญาณ: src/lib/rhythm/compute.ts (computeGateBlockMatrix → evaluateGates) · ไม้จำลอง: simulateTrades',
    rows: WEEKDAYS,
    cols: TH_MONTH,
    cells,
    byWeekday,
    byMonth,
    breadthR: round(breadthR, 3),
    peak: pk,
  };
}

// ─────────────────────────── C · ความลึก (สัญญาณพร้อมกัน) ───────────────────────────

function depthSection(input: AtlasInput, trades: AtlasTrade[], perDay: number[], rng: () => number): AtlasDepth {
  const { state, t0, breadth } = input;
  const days = perDay.map((n, i) => ({
    date: keyOf(state.dates[t0 + i]),
    n,
    mean7: round(mean(perDay.slice(Math.max(0, i - 6), i + 1)), 2),
  }));
  const order = days.map((_, i) => i).sort((a, b) => days[b].n - days[a].n || b - a);
  const picked: number[] = [];
  for (const i of order) {
    if (days[i].n === 0 || picked.length === 3) break;
    if (picked.every((j) => Math.abs(i - j) >= ATLAS.spikeGap)) picked.push(i);
  }
  const bd = new Map(breadth.days.map((d) => [d.date, d]));
  const peaks = picked.map((i) => ({ date: days[i].date, n: days[i].n, breadth: bd.get(days[i].date)?.breadth ?? 0, marketRet: bd.get(days[i].date)?.marketRet ?? 0 }));
  const byMonth = new Map<string, number[]>();
  for (const d of days) byMonth.set(d.date.slice(0, 7), [...(byMonth.get(d.date.slice(0, 7)) ?? []), d.n]);
  const monthly = [...byMonth].map(([month, xs]) => ({
    month,
    median: round(median(xs), 1),
    p90: round(quantile(xs, 0.9), 1),
    p99: round(quantile(xs, 0.99), 1),
    max: Math.max(...xs),
  }));
  const active = perDay.filter((n) => n > 0);
  const max = Math.max(0, ...perDay);
  const countByDate = new Map(days.map((d) => [d.date, d.n]));
  const closed = closedOf(trades);
  const crowdedR = closed.filter((t) => (countByDate.get(t.date) ?? 0) >= ATLAS.crowd).map((t) => t.ret);
  const sparseR = closed.filter((t) => (countByDate.get(t.date) ?? 0) < ATLAS.crowd).map((t) => t.ret);
  const crowding = {
    threshold: ATLAS.crowd,
    crowded: { n: crowdedR.length, ci: roundCI(bootMean(crowdedR, rng, ATLAS.boot)) },
    sparse: { n: sparseR.length, ci: roundCI(bootMean(sparseR, rng, ATLAS.boot)) },
    diff: roundCI(bootDiff(crowdedR, sparseR, rng, ATLAS.boot)),
  };
  const zeroShare = round(pctOf(perDay.length - active.length, perDay.length), 0);
  const meanWhenActive = round(active.length ? mean(active) : 0, 1);
  const top = peaks[0];
  const medAll = monthly.filter((m) => m.median === 0).length;
  const p99max = Math.max(0, ...monthly.map((m) => m.p99));
  return {
    title: `สัญญาณพร้อมกันสูงสุด ${max} ตัวในวันเดียว แต่ ${zeroShare}% ของวันไม่มีสัญญาณเลย และเมื่อมีจะเฉลี่ย ${meanWhenActive} ตัว`,
    basis: `${days.length} วันทำการ · ${trades.length} สัญญาณ · นับจำนวนหุ้นที่มีสัญญาณในวันเดียวกัน (ถ้าถือพร้อมกันคือความลึกของพอร์ต) · "แออัด" = วันที่มีสัญญาณ ≥ ${ATLAS.crowd} ตัว`,
    conclusion:
      (top ? `จุดสูงสุด ${thDate(top.date)} มี ${top.n} สัญญาณพร้อมกัน (breadth ${top.breadth.toFixed(0)}% · SET ${signed(top.marketRet)}%). ` : '') +
      `มัธยฐานรายวันเป็น 0 ใน ${medAll} จาก ${monthly.length} เดือน แต่ p99 รายเดือนขึ้นถึง ${p99max} ตัว — เพดานความเสี่ยงรวมต้องตั้งจากหางของการกระจาย ไม่ใช่ค่าเฉลี่ย. ` +
      `ไม้ในวันแออัด (n=${crowding.crowded.n}) ผลเฉลี่ย ${ciText(crowding.crowded.ci, 2, '%')} เทียบวันปกติ (n=${crowding.sparse.n}) ${ciText(crowding.sparse.ci, 2, '%')} · ส่วนต่าง ${ciText(crowding.diff, 2, ' จุด')} — ` +
      (excludesZero(crowding.diff) ? (crowding.diff.mean < 0 ? 'วันแออัดแย่กว่าอย่างชัดเจน (สัญญาณพร้อมกันคือการเดิมพันทิศเดียวกัน)' : 'วันแออัดดีกว่าอย่างชัดเจน') : 'ช่วงคร่อมศูนย์ จึงยังไม่พบผลของความแออัด'),
    source: 'src/lib/atlas/compute.ts (depthSection) · สัญญาณรายวัน: computeGateBlockMatrix',
    days,
    peaks,
    monthly,
    zeroShare,
    meanWhenActive,
    max,
    crowding,
  };
}

// ─────────────────────────── D · ส่วนผสมของกำไร/ขาดทุน ───────────────────────────

function mixSection(input: AtlasInput, trades: AtlasTrade[]): AtlasMix {
  const universe = [...new Set(input.state.stocks.map((s) => s.sector))];
  const closed = closedOf(trades);
  let keys = universe;
  if (universe.length > MAX_SECTORS) {
    const abs = new Map<string, number>();
    for (const t of closed) abs.set(t.sector, (abs.get(t.sector) ?? 0) + Math.abs(t.ret));
    const keep = new Set([...universe].sort((a, b) => (abs.get(b) ?? 0) - (abs.get(a) ?? 0)).slice(0, MAX_SECTORS - 1));
    keys = [...universe.filter((k) => keep.has(k)), OTHER_SECTOR];
  }
  const slot = (sector: string) => {
    const i = keys.indexOf(sector);
    return i >= 0 ? i : keys.length - 1;
  };
  const byMonth = new Map<string, typeof closed>();
  for (const t of closed) byMonth.set(t.date.slice(0, 7), [...(byMonth.get(t.date.slice(0, 7)) ?? []), t]);
  const signalsByMonth = new Map<string, number>();
  for (const t of trades) signalsByMonth.set(t.date.slice(0, 7), (signalsByMonth.get(t.date.slice(0, 7)) ?? 0) + 1);
  const windowMonths = [...new Set(input.breadth.days.map((d) => d.date.slice(0, 7)))];
  const months = windowMonths.map((month) => {
    const tr = byMonth.get(month) ?? [];
    const absBySector = keys.map(() => 0);
    for (const t of tr) absBySector[slot(t.sector)] += Math.abs(t.ret);
    const absTot = absBySector.reduce((a, b) => a + b, 0);
    return {
      month,
      gain: round(tr.filter((t) => t.ret > 0).reduce((a, t) => a + t.ret, 0), 2),
      loss: round(tr.filter((t) => t.ret < 0).reduce((a, t) => a + t.ret, 0), 2),
      sectorShare: absBySector.map((v) => round(pctOf(v, absTot), 1)),
      signals: signalsByMonth.get(month) ?? 0,
    };
  });
  const gain = closed.filter((t) => t.ret > 0).reduce((a, t) => a + t.ret, 0);
  const loss = closed.filter((t) => t.ret < 0).reduce((a, t) => a + t.ret, 0);
  const stops = closed.filter((t) => t.end === 'stop');
  const stopLoss = stops.filter((t) => t.ret < 0).reduce((a, t) => a + t.ret, 0);
  const worstN = Math.max(1, Math.ceil(closed.length * 0.1));
  const sortedRet = closed.map((t) => t.ret).sort((a, b) => a - b);
  const worstShare = loss < 0 ? pctOf(-sortedRet.slice(0, worstN).filter((r) => r < 0).reduce((a, r) => a + r, 0), -loss) : 0;
  const bestShare = gain > 0 ? pctOf(sortedRet.slice(-worstN).filter((r) => r > 0).reduce((a, r) => a + r, 0), gain) : 0;
  const nEffGain = nEff(months.map((m) => m.gain));
  const nEffLoss = nEff(months.map((m) => -m.loss));
  const stopShareTrades = pctOf(stops.length, closed.length);
  const stopShareOfLoss = loss < 0 ? pctOf(-stopLoss, -loss) : 0;
  const labels = keys.map((k) => (k === OTHER_SECTOR ? 'หมวดอื่น ๆ' : sectorLabel(k)));
  const totalAbsBySector = keys.map((_, i) => closed.filter((t) => slot(t.sector) === i).reduce((a, t) => a + Math.abs(t.ret), 0));
  const topSector = totalAbsBySector.indexOf(Math.max(...totalAbsBySector));
  return {
    title: `stop เป็นเพียง ${stopShareTrades.toFixed(0)}% ของไม้ แต่คิดเป็น ${stopShareOfLoss.toFixed(0)}% ของขาดทุนทั้งหมด`,
    basis: `${closed.length} ไม้ที่ปิดแล้ว · ${months.length} เดือน · ผลต่อไม้ = % จากราคาเข้า (ไม่หักค่าธรรมเนียม) · N_eff = 1/Σp² = จำนวนเดือนที่ "มีผลจริง"`,
    conclusion:
      `กำไรรวม ${signed(gain, 1)} จุด % ขาดทุนรวม ${signed(loss, 1)} จุด % (สุทธิ ${signed(gain + loss, 1)}) · ` +
      `ขาดทุน${nEffLoss < nEffGain ? 'กระจุกตัวกว่า' : 'กระจายพอ ๆ กับ'}กำไร: N_eff ของขาดทุน ${nEffLoss.toFixed(1)} เดือน เทียบกำไร ${nEffGain.toFixed(1)} เดือน จากทั้งหมด ${months.length} เดือน · ` +
      `ไม้ 10% ที่แย่สุด (${worstN} ไม้) คิดเป็น ${worstShare.toFixed(0)}% ของขาดทุน · 10% ที่ดีสุดคิดเป็น ${bestShare.toFixed(0)}% ของกำไร · ` +
      `หมวดที่ขยับ P&L มากสุด: ${labels[topSector]} (${pctOf(totalAbsBySector[topSector], totalAbsBySector.reduce((a, b) => a + b, 0)).toFixed(0)}% ของ |P&L|)`,
    source: 'src/lib/atlas/compute.ts (mixSection) · ไม้จำลอง: simulateTrades',
    sectors: keys.map((key, i) => ({ key, label: labels[i] })),
    months,
    nEff: { gainMonths: round(nEffGain, 1), lossMonths: round(nEffLoss, 1), months: months.length },
    tail: { worstShare: round(worstShare, 1), bestShare: round(bestShare, 1), worstN },
    totals: { gain: round(gain, 2), loss: round(loss, 2), stopLoss: round(stopLoss, 2), stopShareOfLoss: round(stopShareOfLoss, 1) },
  };
}

// ─────────────────────────── E · เริ่มอย่างไร จบอย่างไร ───────────────────────────

function lifecycleSection(input: AtlasInput, trades: AtlasTrade[], rng: () => number): AtlasLifecycle {
  const { dayMap } = input;
  const closed = closedOf(trades);
  const ends = END_KEYS.map((key) => {
    const n = trades.filter((t) => t.end === key).length;
    return { key, label: END_LABEL[key], n, share: round(pctOf(n, trades.length), 1) };
  });
  const starts = dayMap.clusters.map((c) => ({ key: `c${c.id}`, label: `${c.id + 1} · ${c.label}` }));
  const startKey = (t: AtlasTrade) => (t.cluster === null ? 'none' : `c${t.cluster}`);
  const months = [...new Set(input.breadth.days.map((d) => d.date.slice(0, 7)))];
  const monthlyEnd = months.map((month) => {
    const counts = Object.fromEntries(END_KEYS.map((k) => [k, 0])) as Record<EndKey, number>;
    for (const t of trades) if (t.date.startsWith(month)) counts[t.end]++;
    return { month, counts };
  });
  const monthlyStart = months.map((month) => {
    const counts: Record<string, number> = Object.fromEntries(starts.map((s) => [s.key, 0]));
    for (const t of trades) if (t.date.startsWith(month) && startKey(t) in counts) counts[startKey(t)]++;
    return { month, counts };
  });
  const row = (key: string, label: string, xs: typeof closed) => ({
    key,
    label,
    n: xs.length,
    winRate: winRateOf(xs) ?? 0,
    stopRate: round(pctOf(xs.filter((t) => t.end === 'stop').length, xs.length), 1),
    meanR: roundCI(bootMean(xs.map((t) => t.r), rng, ATLAS.boot)),
  });
  const table = starts.map((s) => row(s.key, s.label, closed.filter((t) => startKey(t) === s.key))).filter((r) => r.n > 0);
  const byKind = (['pullback', 'momentum'] as const).map((k) => {
    const r = row(k, k === 'pullback' ? 'pullback (ผ่านครบ 5 ด่าน)' : 'momentum (G1–G4 + breakout)', closed.filter((t) => t.kind === k));
    return { ...r, key: k };
  });
  const stopN = closed.filter((t) => t.end === 'stop').length;
  const ofClosed = (k: EndKey) => round(pctOf(closed.filter((t) => t.end === k).length, closed.length), 1);
  const allR = roundCI(bootMean(closed.map((t) => t.r), rng, ATLAS.boot));
  const exitLevers = exitLeverRows(input, trades, rng);
  const exitBetter = exitLevers.filter((l) => l.verdict === 'better');
  const winAll = winRateOf(closed) ?? 0;
  const bigEnough = table.filter((r) => r.n >= 10);
  const best = [...bigEnough].sort((a, b) => b.meanR.mean - a.meanR.mean)[0];
  const worst = [...bigEnough].sort((a, b) => a.meanR.mean - b.meanR.mean)[0];
  const distinct = best && worst && best !== worst && best.meanR.lo > worst.meanR.hi;
  return {
    title: `${pctOf(stopN, closed.length).toFixed(0)}% ของ ${closed.length} ไม้จบด้วย stop · ผลเฉลี่ยต่อไม้ ${signed(allR.mean, 2)}R [${signed(allR.lo, 2)}, ${signed(allR.hi, 2)}]`,
    basis: `1 ไม้ = เข้าที่ราคาปิดวันสัญญาณ · stop = stopHard ของแผนเทรด · เป้า = +${ATLAS.targetR}R · ถือไม่เกิน ${ATLAS.holdDays} วันทำการ · วันเดียวกันแตะทั้งสองฝั่ง = นับ stop ก่อน · สภาวะตอนเริ่ม = กลุ่มวันบนแผนที่ (มุม A)`,
    conclusion:
      `ของไม้ที่ปิดแล้ว: อัตราชนะ ${winAll}% · ถึงเป้า ${ofClosed('target')}% · หมดเวลา ${round(ofClosed('timeUp') + ofClosed('timeDown'), 1)}% · โดน stop ${ofClosed('stop')}%. ` +
      (bigEnough.length >= 2 && best && worst
        ? `ตามสภาวะตอนเริ่ม: ดีสุด “${best.label}” ${signed(best.meanR.mean)}R (n=${best.n}) · แย่สุด “${worst.label}” ${signed(worst.meanR.mean)}R (n=${worst.n}) — ` +
          (distinct ? 'ช่วงความเชื่อมั่นไม่ซ้อนกัน' : 'ช่วงความเชื่อมั่นซ้อนกัน ความต่างจึงยังอยู่ในระดับสัญญาณรบกวน')
        : 'จำนวนไม้ต่อสภาวะยังน้อยเกินกว่าจะเทียบกัน') +
      `. pullback ${byKind[0].n} ไม้ ${signed(byKind[0].meanR.mean)}R · momentum ${byKind[1].n} ไม้ ${signed(byKind[1].meanR.mean)}R. ` +
      (exitBetter.length
        ? `กติกาออกที่ดีกว่าอย่างมีนัยหลังปรับหลายการทดสอบ: ${exitBetter.map((l) => `${l.label} (${signed(l.diff.mean)} จุด/ไม้)`).join(' · ')} — เป็นผลในตัวอย่าง ต้องยืนยันแบบ forward`
        : `ไม่มีกติกาออกทางเลือก (${exitLevers.length - 1} แบบ) ที่ดีกว่าอย่างมีนัยหลังปรับหลายการทดสอบ`),
    source: 'src/lib/atlas/compute.ts (simulateTrades, lifecycleSection) · stop: evaluateGates().plan.stopHard (light) · OHLC: MarketState.ohlcv',
    ends,
    starts,
    monthlyEnd,
    monthlyStart,
    table,
    byKind,
    exitLevers,
  };
}

/** กติกาออกทางเลือกบนสัญญาณชุดเดียวกัน — ส่วนต่างผลต่อไม้แบบจับคู่ (bootstrap แบบบล็อกตามลำดับวัน) + BH-FDR */
function exitLeverRows(input: AtlasInput, baseTrades: AtlasTrade[], rng: () => number): AtlasExitLever[] {
  const variants: Array<{ key: string; label: string; rule: ExitRule }> = [
    { key: 'base', label: `กติกาปัจจุบัน (stop แผน · เป้า ${ATLAS.targetR}R · ถือ ${ATLAS.holdDays} วัน)`, rule: BASE_EXIT },
    { key: 'wide', label: 'stop กว้างขึ้น 1.5 เท่า', rule: { ...BASE_EXIT, stopMult: 1.5 } },
    { key: 'tight', label: 'stop แคบลง 0.75 เท่า', rule: { ...BASE_EXIT, stopMult: 0.75 } },
    { key: 't1', label: 'เป้า 1R', rule: { ...BASE_EXIT, targetR: 1 } },
    { key: 't3', label: 'เป้า 3R', rule: { ...BASE_EXIT, targetR: 3 } },
    { key: 'noTarget', label: 'ไม่มีเป้า (ออกเมื่อหมดเวลา)', rule: { ...BASE_EXIT, targetR: null } },
    { key: 'h3', label: 'ถือไม่เกิน 3 วัน', rule: { ...BASE_EXIT, holdDays: 3 } },
    { key: 'h10', label: 'ถือไม่เกิน 10 วัน', rule: { ...BASE_EXIT, holdDays: 10 } },
  ];
  const keyOfTrade = (t: AtlasTrade) => `${t.date}|${t.symbol}`;
  const baseRet = new Map(baseTrades.filter((t) => t.ret !== null).map((t) => [keyOfTrade(t), t.ret!]));
  const rows = variants.map((v) => {
    const tr = v.key === 'base' ? baseTrades : simulateTrades(input, v.rule).trades;
    // จับคู่เฉพาะไม้ที่ปิดแล้วในทั้งสองกติกา (เรียงตามวัน)
    const pairs = tr.filter((t) => t.ret !== null && baseRet.has(keyOfTrade(t))).map((t) => [t.ret!, baseRet.get(keyOfTrade(t))!] as const);
    const closed = closedOf(tr);
    const d = v.key === 'base' ? { mean: 0, lo: 0, hi: 0, p: 1 } : bootPaired(pairs.map((x) => x[0]), pairs.map((x) => x[1]), rng, ATLAS.boot, ATLAS.block);
    const same = closed.length === baseRet.size && pairs.length === closed.length && pairs.every(([a, b]) => a === b);
    return { v, closed, d, same };
  });
  const qs = bhFdr(rows.slice(1).map((r) => r.d.p));
  return rows.map(({ v, closed, d, same }, i) => {
    const q = i === 0 ? 1 : qs[i - 1];
    const diff = roundCI(d, 3);
    return {
      key: v.key,
      label: v.label,
      n: closed.length,
      winRate: winRateOf(closed) ?? 0,
      stopRate: round(pctOf(closed.filter((t) => t.end === 'stop').length, closed.length), 1),
      meanRet: meanRetOf(closed) ?? 0,
      days: round(closed.length ? mean(closed.map((t) => t.days)) : 0, 2),
      perDay: round(closed.length ? mean(closed.map((t) => t.ret)) / Math.max(1e-9, mean(closed.map((t) => t.days))) : 0, 3),
      diff,
      p: round(d.p, 3),
      q: round(q, 3),
      verdict: verdictOf(i, same, q, diff),
    };
  });
}

// ─────────────────────────── F · ทดสอบความฉลาดแบบ walk-forward ───────────────────────────

interface LeverDef {
  key: string;
  label: string;
  pick: (tr: BtTrade, pThr: number) => boolean;
  cap?: number;
  day?: (dayIndex: number) => boolean;
}

function intelSection(input: AtlasInput, grid: BtGrid, rng: () => number): AtlasIntel {
  const { backtest: bt, state } = input;
  const pThr = RULES.backtest.pThr;
  const D = grid.dates.length;
  const symbols = state.stocks.map((s) => s.symbol);
  const flat: BtTrade[] = [];
  const dayOf: number[] = [];
  const rowAt: number[][] = grid.rows.map(() => new Array<number>(symbols.length).fill(-1));
  const symIdx = new Map(symbols.map((s, i) => [s, i]));
  grid.rows.forEach((rows, d) =>
    rows.forEach((tr) => {
      rowAt[d][symIdx.get(tr.symbol) ?? 0] = flat.length;
      flat.push(tr);
      dayOf.push(d);
    }),
  );
  const y = Float64Array.from(flat, (t) => (t.fwdRet > 0 ? 1 : 0));
  const allPass = (t: BtTrade) => t.g1 && t.g2 && t.g3 && t.g4 && t.g5;
  const scores: Array<{ key: string; label: string; s: Float64Array }> = [
    { key: 'prob', label: 'P(up) ของโมเดล (walk-forward)', s: Float64Array.from(flat, (t) => t.prob) },
    { key: 'signal', label: 'สัญญาณ (5 ด่าน + P(up) > เกณฑ์)', s: Float64Array.from(flat, (t) => (allPass(t) && t.prob > pThr ? 1 : 0)) },
    { key: 'all', label: 'ผ่านครบ 5 ด่าน', s: Float64Array.from(flat, (t) => (allPass(t) ? 1 : 0)) },
    { key: 'g1', label: 'G1 · Regime', s: Float64Array.from(flat, (t) => (t.g1 ? 1 : 0)) },
    { key: 'g2', label: 'G2 · Dependence', s: Float64Array.from(flat, (t) => (t.g2 ? 1 : 0)) },
    { key: 'g3', label: 'G3 · Technical', s: Float64Array.from(flat, (t) => (t.g3 ? 1 : 0)) },
    { key: 'g4', label: 'G4 · Risk', s: Float64Array.from(flat, (t) => (t.g4 ? 1 : 0)) },
    { key: 'g5', label: 'G5 · Execution', s: Float64Array.from(flat, (t) => (t.g5 ? 1 : 0)) },
  ];
  // bootstrap แบบบล็อกของ "วัน" → น้ำหนักต่อแถว · เลื่อนผลเป็นวงกลมทีละวัน (หุ้นเดิม) → การกระจายภายใต้ "ไม่มีความสัมพันธ์"
  const Bauc = Math.min(ATLAS.boot, 300);
  const weightsList: Float64Array[] = [];
  for (let b = 0; b < Bauc; b++) {
    const counts = new Float64Array(D);
    let c = 0;
    while (c < D) {
      const start = Math.floor(rng() * D);
      for (let j = 0; j < ATLAS.block && c < D; j++, c++) counts[(start + j) % D]++;
    }
    weightsList.push(Float64Array.from(dayOf, (d) => counts[d]));
  }
  const shiftLabels: Array<{ y: Float64Array; w: Float64Array }> = [];
  for (let s = 0; s < ATLAS.shifts && D > 2 * ATLAS.minShift; s++) {
    const delta = ATLAS.minShift + Math.floor(rng() * (D - 2 * ATLAS.minShift));
    const ys = new Float64Array(flat.length);
    const w = new Float64Array(flat.length);
    for (let i = 0; i < flat.length; i++) {
      const j = rowAt[(dayOf[i] + delta) % D][symIdx.get(flat[i].symbol) ?? 0];
      if (j >= 0) {
        ys[i] = y[j];
        w[i] = 1;
      }
    }
    shiftLabels.push({ y: ys, w });
  }
  const auc = scores.map(({ key, label, s }) => {
    const order = Array.from(flat.keys()).sort((a, b) => s[a] - s[b]);
    const a = aucSorted(order, s, y);
    const boots = weightsList.map((w) => aucSorted(order, s, y, w));
    const extreme = shiftLabels.filter((sl) => Math.abs(aucSorted(order, s, sl.y, sl.w) - 0.5) >= Math.abs(a - 0.5)).length;
    return {
      key,
      label,
      auc: round(a, 3),
      lo: round(quantile(boots, 0.025), 3),
      hi: round(quantile(boots, 0.975), 3),
      p: round((1 + extreme) / (1 + shiftLabels.length), 3),
      n: flat.length,
    };
  });

  // ปรับคันโยก: กติกาทางเลือกบนแถวนอกตัวอย่างชุดเดียวกัน → ผลตอบแทนรายวันของพอร์ต (เท่ากันต่อไม้ · วันไม่มีสัญญาณ = เงินสด)
  const dateT = new Map(state.dates.map((d, t) => [keyOf(d), t]));
  const riskOn = grid.dates.map((d) => state.regime[dateT.get(d)!] === 'risk_on');
  const gatesBut = (skip: string) => (t: BtTrade, thr: number) =>
    (skip === 'g1' || t.g1) && (skip === 'g2' || t.g2) && (skip === 'g3' || t.g3) && (skip === 'g4' || t.g4) && (skip === 'g5' || t.g5) && t.prob > thr;
  const base: LeverDef = { key: 'base', label: 'กติกาปัจจุบัน (5 ด่าน + P(up) > 0.55)', pick: gatesBut('') };
  const levers: LeverDef[] = [
    base,
    { key: 'noG1', label: 'ไม่ใช้ G1 · Regime', pick: gatesBut('g1') },
    { key: 'noG2', label: 'ไม่ใช้ G2 · Dependence', pick: gatesBut('g2') },
    { key: 'noG3', label: 'ไม่ใช้ G3 · Technical', pick: gatesBut('g3') },
    { key: 'noG4', label: 'ไม่ใช้ G4 · Risk', pick: gatesBut('g4') },
    { key: 'noG5', label: 'ไม่ใช้ G5 · Execution', pick: gatesBut('g5') },
    { key: 'noProb', label: 'ไม่กรองด้วย P(up)', pick: (t) => allPass(t) },
    { key: 'p50', label: 'เกณฑ์ P(up) 0.50', pick: (t) => allPass(t) && t.prob > 0.5 },
    { key: 'p60', label: 'เกณฑ์ P(up) 0.60', pick: (t) => allPass(t) && t.prob > 0.6 },
    { key: 'top2', label: 'จำกัด 2 ตัว/วัน (P(up) สูงสุด)', pick: gatesBut(''), cap: 2 },
    { key: 'riskOn', label: 'เทรดเฉพาะวัน risk-on', pick: gatesBut(''), day: (d) => riskOn[d] },
  ];
  const run = (lv: LeverDef) => {
    const daily: number[] = [];
    const picks: BtTrade[] = [];
    grid.rows.forEach((rows, d) => {
      if (lv.day && !lv.day(d)) {
        daily.push(0);
        return;
      }
      let sel = rows.filter((t) => lv.pick(t, pThr));
      if (lv.cap !== undefined) sel = [...sel].sort((a, b) => b.prob - a.prob).slice(0, lv.cap);
      picks.push(...sel);
      daily.push(sel.length ? mean(sel.map((t) => t.fwdRet)) : 0);
    });
    return { daily, picks };
  };
  const baseRun = run(base);
  const results = levers.map((lv) => {
    const r = lv === base ? baseRun : run(lv);
    const d = lv === base ? { mean: 0, lo: 0, hi: 0, p: 1 } : bootPaired(r.daily, baseRun.daily, rng, ATLAS.boot, ATLAS.block);
    const same = r.picks.length === baseRun.picks.length && r.daily.every((v, j) => v === baseRun.daily[j]);
    return { lv, r, d, same };
  });
  const qs = bhFdr(results.slice(1).map((x) => x.d.p));
  const leverRows: AtlasLever[] = results.map(({ lv, r, d, same }, i) => {
    const q = i === 0 ? 1 : qs[i - 1];
    const diff = { mean: round(d.mean * 1e4, 2), lo: round(d.lo * 1e4, 2), hi: round(d.hi * 1e4, 2) };
    return {
      key: lv.key,
      label: lv.label,
      nSignals: r.picks.length,
      hitRate: round(pctOf(r.picks.filter((t) => t.fwdRet > 0).length, r.picks.length), 1),
      meanDaily: round(mean(r.daily) * 1e4, 2),
      diff,
      p: round(d.p, 3),
      q: round(q, 3),
      verdict: verdictOf(i, same, q, diff),
    };
  });
  const prob = auc[0];
  const coversHalf = prob.lo <= 0.5 && prob.hi >= 0.5;
  const better = leverRows.filter((l) => l.verdict === 'better');
  const worse = leverRows.filter((l) => l.verdict === 'worse');
  const idle = leverRows.filter((l) => l.verdict === 'same');
  const tested = leverRows.length - 1 - idle.length;
  return {
    title: `โมเดลที่ฝึกจากอดีตอย่างเดียว${coversHalf ? 'ยังแยกวันขึ้น/ลงไม่ได้' : prob.auc > 0.5 ? 'แยกวันขึ้น/ลงได้เล็กน้อย' : 'ทำนายกลับทาง'} (AUC ของ P(up) ${prob.auc.toFixed(3)} ช่วง [${prob.lo.toFixed(2)}, ${prob.hi.toFixed(2)}] · p = ${pText(prob.p)})`,
    basis:
      `${D} วันทดสอบ × ${symbols.length} หุ้น = ${flat.length} หุ้น-วัน · walk-forward: train ${RULES.backtest.train} → embargo ${RULES.backtest.embargo} → test ${RULES.backtest.test} วัน · ` +
      `ผล = ขึ้น/ลงของวันถัดไป · CI 95% จาก bootstrap แบบบล็อก ${ATLAS.block} วัน · p จากการเลื่อนผลเป็นวงกลม ${ATLAS.shifts} ครั้ง (คงความสัมพันธ์ตามเวลา ตัดความเชื่อมโยงกับคะแนน) · คันโยกปรับหลายการทดสอบด้วย Benjamini–Hochberg`,
    conclusion:
      `P(up): AUC ${prob.auc.toFixed(3)} [${prob.lo.toFixed(3)}, ${prob.hi.toFixed(3)}] ${coversHalf ? 'ครอบ 0.50' : 'ไม่ครอบ 0.50'} · ` +
      `ด่านที่แยกได้ดีสุด: ${[...auc.slice(3)].sort((a, b) => Math.abs(b.auc - 0.5) - Math.abs(a.auc - 0.5))[0].label}. ` +
      (better.length || worse.length
        ? `คันโยกที่ต่างจากกติกาปัจจุบันอย่างมีนัยหลังปรับหลายการทดสอบ: ${[...better.map((l) => `${l.label} (ดีกว่า ${signed(l.diff.mean)} bp/วัน)`), ...worse.map((l) => `${l.label} (แย่กว่า ${signed(l.diff.mean)} bp/วัน)`)].join(' · ')}`
        : `คันโยกที่เปลี่ยนสัญญาณจริง ${tested} แบบ มีช่วงความเชื่อมั่นคร่อมศูนย์หรือไม่ผ่านการปรับหลายการทดสอบทั้งหมด จึงยังสรุปไม่ได้ว่าการปรับใดช่วย`) +
      (idle.length ? ` · ${idle.map((l) => l.label).join(' และ ')} ไม่เปลี่ยนสัญญาณเลยสักวัน (ตัวกรองนั้นไม่เคยเป็นตัวตัดสินในช่วงทดสอบ)` : '') +
      ` · เป็นข้อมูลชุดเดียว (${input.data.label}) — โมเดลไม่เห็นอนาคต แต่เป็นกลุ่มตัวอย่างเดียว`,
    source: 'src/lib/atlas/compute.ts (intelSection) · src/lib/atlas/stats.ts (aucSorted, bootPaired) · ข้อมูล: runBacktest (walk-forward, purged + embargo)',
    auc,
    levers: leverRows,
    calibration: bt.calibration,
    window: { train: RULES.backtest.train, test: RULES.backtest.test, embargo: RULES.backtest.embargo, pThr, block: ATLAS.block, boot: ATLAS.boot },
  };
}

// ─────────────────────────── ข้อเสนอเพื่อเพิ่มประสิทธิภาพ ───────────────────────────

function buildActions(a: AtlasStateMap, c: AtlasDepth, d: AtlasMix, e: AtlasLifecycle, f: AtlasIntel): AtlasResponse['actions'] {
  const out: AtlasResponse['actions'] = [];
  const better = f.levers.filter((l) => l.verdict === 'better');
  for (const l of better)
    out.push({ tone: 'try', text: `ทดลองแบบ forward ก่อนใช้จริง: ${l.label} — ดีกว่ากติกาปัจจุบัน ${signed(l.diff.mean)} bp/วัน [${signed(l.diff.lo)}, ${signed(l.diff.hi)}] (q = ${l.q.toFixed(3)})` });
  for (const l of f.levers.filter((x) => x.verdict === 'worse'))
    out.push({ tone: 'keep', text: `คง${l.label.replace('ไม่ใช้ ', '')}ไว้ — ถ้าเอาออกผลแย่ลง ${signed(l.diff.mean)} bp/วัน [${signed(l.diff.lo)}, ${signed(l.diff.hi)}]` });
  if (!better.length)
    out.push({ tone: 'keep', text: 'ยังไม่มีคันโยกไหนดีกว่ากติกาปัจจุบันอย่างมีนัยหลังปรับหลายการทดสอบ — อย่าจูนเพิ่มบนข้อมูลชุดนี้ (เสี่ยง overfit) ให้ล็อกกติกาแล้วเก็บผล forward / ข้อมูลจริงก่อน' });
  const idle = f.levers.filter((x) => x.verdict === 'same');
  if (idle.length)
    out.push({
      tone: 'watch',
      text: `${idle.map((l) => l.label).join(' · ')} — ไม่เปลี่ยนสัญญาณเลยในช่วงทดสอบ (ด่านอื่นคัดออกไปก่อนแล้ว) · ไม่ได้แปลว่าตัดออกได้: อาจเป็นตาข่ายนิรภัยของภาวะที่ยังไม่เกิดในข้อมูลชุดนี้`,
    });
  const baseExit = e.exitLevers[0];
  for (const l of e.exitLevers.filter((x) => x.verdict === 'better'))
    out.push({
      tone: 'try',
      text:
        `ทดลองแบบ forward: กติกาออก “${l.label}” — ผลต่อไม้ดีขึ้น ${signed(l.diff.mean)} จุด [${signed(l.diff.lo)}, ${signed(l.diff.hi)}] (q = ${l.q.toFixed(3)}, ผลในตัวอย่าง) · ` +
        `ถือเฉลี่ย ${l.days} วัน เทียบ ${baseExit.days} วัน → ผลต่อวันที่ถือ ${signed(l.perDay, 3)}% เทียบ ${signed(baseExit.perDay, 3)}%${l.perDay <= baseExit.perDay ? ' (ต่อวันไม่ดีขึ้น — กำไรที่เพิ่มมาจากการถือนานขึ้น)' : ''}`,
    });
  const prob = f.auc[0];
  if (prob.lo <= 0.5 && prob.hi >= 0.5)
    out.push({ tone: 'watch', text: `P(up) ยังแยกขึ้น/ลงไม่ได้เหนือโอกาส (AUC ${prob.auc.toFixed(2)} [${prob.lo.toFixed(2)}, ${prob.hi.toFixed(2)}]) — อย่าให้น้ำหนักมากในการตัดสินใจหรือขนาดไม้` });
  out.push({ tone: 'watch', text: `สัญญาณพร้อมกันสูงสุด ${c.max} ตัว (p99 รายเดือนสูงสุด ${Math.max(...c.monthly.map((m) => m.p99))}) — ตั้งเพดานความเสี่ยงรวมต่อวันจากหาง ไม่ใช่จากค่าเฉลี่ย ${c.meanWhenActive} ตัว` });
  if (excludesZero(c.crowding.diff) && c.crowding.diff.mean < 0)
    out.push({ tone: 'try', text: `วันแออัด (≥ ${c.crowding.threshold} สัญญาณ) ผลแย่กว่าอย่างชัดเจน ${signed(c.crowding.diff.mean)} จุด/ไม้ — ทดลองจำกัดจำนวนไม้ต่อวัน` });
  if (d.totals.stopShareOfLoss >= 50)
    out.push({ tone: 'watch', text: `ขาดทุน ${d.totals.stopShareOfLoss.toFixed(0)}% มาจาก stop — ตรวจระยะ stop และขนาดไม้ก่อนปรับส่วนอื่น (ขาดทุน N_eff ${d.nEff.lossMonths} เดือน)` });
  if (a.neighbor.p >= 0.05)
    out.push({ tone: 'watch', text: `สภาพตลาดบนแผนที่ยังไม่ช่วยเลือกวันให้โมเดล (ρ = ${a.neighbor.rho.toFixed(2)}, p = ${a.neighbor.p.toFixed(2)}) — ตัวกรอง regime ใหม่ต้องพิสูจน์แบบ walk-forward ก่อน` });
  const stopRow = e.ends.find((x) => x.key === 'stop');
  if (stopRow && stopRow.share > 35)
    out.push({ tone: 'watch', text: `ไม้จบด้วย stop ${stopRow.share}% — stop อาจแคบเกินความผันผวนจริง ลองทดสอบระยะ stop แบบ walk-forward` });
  return out;
}

// ─────────────────────────── ประกอบทั้งหมด ───────────────────────────

export function computeAtlas(input: AtlasInput): AtlasResponse {
  const rng = mulberry32(ATLAS.seed);
  const { trades, perDay } = simulateTrades(input);
  const grid = btGrid(input.backtest);
  const closed = closedOf(trades);
  const header: AtlasHeader = {
    asOf: keyOf(input.state.dates[input.t1]),
    start: keyOf(input.state.dates[input.t0]),
    end: keyOf(input.state.dates[input.t1]),
    nStocks: input.state.stocks.length,
    nDays: input.t1 - input.t0 + 1,
    nSignals: trades.length,
    nClosed: closed.length,
    winRate: winRateOf(closed) ?? 0,
    meanRet: meanRetOf(closed) ?? 0,
    sumRet: round(closed.reduce((a, t) => a + t.ret, 0), 2),
    nStops: closed.filter((t) => t.end === 'stop').length,
    backtest: {
      start: grid.dates[0] ?? '',
      end: grid.dates[grid.dates.length - 1] ?? '',
      nDays: grid.dates.length,
      nSignals: input.backtest.metrics.nSignals,
      hitRate: input.backtest.metrics.hitRate,
    },
    data: input.data,
  };
  const stateMap = stateMapSection(input, trades, grid, rng);
  const timing = timingSection(input, trades);
  const depth = depthSection(input, trades, perDay, rng);
  const mix = mixSection(input, trades);
  const lifecycle = lifecycleSection(input, trades, rng);
  const intel = intelSection(input, grid, rng);
  return {
    header,
    intro:
      `ส่องพฤติกรรมของเอนจิน 5 ด่านบนหุ้นไทยผ่านหกมุม (แผนที่สถานะตลาด · จังหวะเวลา · สัญญาณพร้อมกัน · ส่วนผสมของกำไร/ขาดทุน · วิธีที่ไม้เริ่มและจบ · ทดสอบความฉลาดแบบ walk-forward) ` +
      `รูปแบบการวิเคราะห์และการออกแบบกราฟยืมจากชุดภาพตัวอย่าง (แผนที่ UMAP, heatmap ชั่วโมง×วัน, concurrency, model mix, ใครเริ่มเทิร์น) และ Grid Behavior Atlas ` +
      `— ตัวเลขทุกตัวคำนวณจากราคาและสัญญาณของแพลตฟอร์มเอง (${input.data.label}) ไม่มีตัวเลขจากภาพต้นแบบ · ไม้จำลองไม่หักค่าธรรมเนียม · ไม่ใช่ผลเทรดจริงและไม่ใช่คำแนะนำการลงทุน`,
    stateMap,
    timing,
    depth,
    mix,
    lifecycle,
    intel,
    actions: buildActions(stateMap, depth, mix, lifecycle, intel),
  };
}

