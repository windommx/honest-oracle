// ============================================================
// จังหวะตลาด — คำนวณทั้ง 5 แผงจาก MarketState (pure · deterministic · ไม่แตะ DB)
// ตัวเลขทุกตัวมาจากชุดข้อมูลเดียวกับ Terminal/Decision · ด่านสัญญาณใช้ evaluateGates ตัวเดียวกับ backtest (light mode)
// ============================================================

import { sectorLabel, thDate, thMonthTick, TH_MONTH } from '@/lib/flows/format';
import { evaluateGates } from '@/lib/quant/engine/gates';
import { START_T, type MarketState } from '@/lib/quant/engine/types';
import { mulberry32 } from '@/lib/quant/rng';
import { bhFdr, mean, median, normalTwoSideP, pca, quantile, std } from '@/lib/quant/stats';
import type {
  BreadthDay,
  BreadthPanel,
  DayCluster,
  DayMapAxis,
  DayMapPanel,
  GateBlockCounts,
  GateBlockKey,
  GateBlockPanel,
  HeatCell,
  SeasonalityPanel,
  SeasonStat,
  SectorPanel,
} from './types';

export const RHYTHM = {
  /** หน้าต่างวิเคราะห์สูงสุด (~3 ปีทำการ) — จำกัดงานคำนวณเมื่อนำเข้าข้อมูลจริงย้อนหลังยาว */
  maxDays: 756,
  /** น้อยกว่านี้ถือว่าข้อมูลไม่พอ */
  minDays: 60,
  sigmaWindow: 60,
  extremeSigma: 2,
  meanWindow: 20,
  /** วันพุ่งที่เลือกต้องห่างกันอย่างน้อยกี่วันทำการ (ไม่ให้ 3 อันดับแรกเป็นเหตุการณ์เดียวกัน) */
  spikeGap: 10,
  calendarWeeks: 52,
  sectorWindow: 20,
  sectorMonths: 12,
  clusters: 5,
  kmeansRestarts: 8,
  kmeansSeed: 20240502,
  fwdDays: 5,
} as const;

export const MARKET_SYMBOL = 'SET';
/** ระดับ false discovery rate ของแผงฤดูกาล */
const FDR_LEVEL = 0.1;
const WEEKDAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'];
const DAY_MS = 86_400_000;

const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const round = (v: number, digits = 1) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return r === 0 ? 0 : r; // ไม่ส่ง -0
};
const pctOf = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
/** '+0.12' · '−0.30' · '±0.00' (ลบใช้เครื่องหมายลบจริง) */
export const signed = (v: number, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;
const monthKey = (d: Date) => keyOf(d).slice(0, 7);

/** ผลตอบแทน SET proxy วันที่ t (%) */
const marketRet = (state: MarketState, t: number) => (t > 0 ? (state.marketClose[t] / state.marketClose[t - 1] - 1) * 100 : 0);

/** หน้าต่างวิเคราะห์ [t0, t1] — เริ่มหลัง warm-up ของ panel (START_T) · null = ข้อมูลไม่พอ */
export function rhythmWindow(state: MarketState): { t0: number; t1: number } | null {
  const N = state.dates.length;
  const t1 = N - 1;
  const t0 = Math.max(START_T, N - RHYTHM.maxDays);
  return t1 - t0 + 1 >= RHYTHM.minDays ? { t0, t1 } : null;
}

// ─────────────────────────── 1) ความพร้อมกัน / ความกว้างของตลาด ───────────────────────────

export function computeBreadth(state: MarketState, t0: number, t1: number): BreadthPanel {
  const S = state.stocks;
  const n = S.length;
  const W = RHYTHM.meanWindow;
  const from = Math.max(1, t0 - (W - 1));
  const above = new Array<number>(t1 + 1).fill(0);
  const extreme = new Array<number>(t1 + 1).fill(0);
  for (const s of S) {
    // prefix sum ของผลตอบแทนและกำลังสอง → σ ย้อนหลัง 60 วันแบบ O(1) ต่อวัน
    const ps = new Float64Array(t1 + 2);
    const ps2 = new Float64Array(t1 + 2);
    for (let t = 0; t <= t1; t++) {
      const r = Number.isFinite(s.rows[t].ret1) ? s.rows[t].ret1 : 0;
      ps[t + 1] = ps[t] + r;
      ps2[t + 1] = ps2[t] + r * r;
    }
    for (let t = from; t <= t1; t++) {
      const row = s.rows[t];
      if (row.ma20Gap > 0) above[t]++;
      const a = Math.max(1, t - RHYTHM.sigmaWindow);
      const m = t - a; // วัน [a, t-1] — ไม่รวมวันที่กำลังวัด
      if (m < 20) continue;
      const sx = ps[t] - ps[a];
      const v = (ps2[t] - ps2[a] - (sx * sx) / m) / (m - 1);
      if (v > 0 && Math.abs(row.ret1) > RHYTHM.extremeSigma * Math.sqrt(v)) extreme[t]++;
    }
  }
  const breadth = above.map((c) => pctOf(c, n));
  const meanBack = (arr: number[], t: number) => mean(arr.slice(Math.max(from, t - (W - 1)), t + 1));

  // p90 / มัธยฐาน / สูงสุด ของจำนวนหุ้นเคลื่อนแรงต่อวัน รายเดือน
  const byMonth = new Map<string, number[]>();
  for (let t = t0; t <= t1; t++) {
    const k = monthKey(state.dates[t]);
    const list = byMonth.get(k) ?? [];
    list.push(extreme[t]);
    byMonth.set(k, list);
  }
  const monthly = [...byMonth].map(([month, xs]) => ({
    month,
    median: round(median(xs), 1),
    p90: round(quantile(xs, 0.9), 1),
    max: Math.max(...xs),
    n: xs.length,
  }));
  const p90ByMonth = new Map(monthly.map((m) => [m.month, m.p90]));

  // breadth รายเดือน (ทุกเดือนในหน้าต่าง) + ตาราง เดือน × วันในสัปดาห์ ของ 12 เดือนล่าสุด
  const breadthByMonth = new Map<string, number[]>();
  const heatAcc = new Map<string, number[][]>();
  for (let t = t0; t <= t1; t++) {
    const d = state.dates[t];
    const k = monthKey(d);
    const list = breadthByMonth.get(k) ?? [];
    list.push(breadth[t]);
    breadthByMonth.set(k, list);
    const wd = d.getUTCDay() - 1;
    if (wd < 0 || wd > 4) continue;
    const row = heatAcc.get(k) ?? WEEKDAYS.map(() => []);
    row[wd].push(breadth[t]);
    heatAcc.set(k, row);
  }
  const monthBreadth = [...breadthByMonth].map(([month, xs]) => ({
    month,
    mean: round(mean(xs), 1),
    pctAbove50: round(pctOf(xs.filter((x) => x > 50).length, xs.length), 0),
    n: xs.length,
  }));
  const heatMonths = [...heatAcc.keys()].slice(-12);
  const heat: BreadthPanel['heat'] = {
    rows: heatMonths,
    cols: WEEKDAYS,
    cells: heatMonths.map((k) => heatAcc.get(k)!.map((xs) => ({ value: xs.length ? round(mean(xs), 0) : null, n: xs.length }))),
    rowMeta: heatMonths.map((k) => {
      const m = monthBreadth.find((x) => x.month === k)!;
      return { mean: m.mean, pctAbove50: m.pctAbove50, n: m.n };
    }),
  };

  const days: BreadthDay[] = [];
  for (let t = t0; t <= t1; t++) {
    days.push({
      date: keyOf(state.dates[t]),
      breadth: round(breadth[t], 1),
      breadthMean20: round(meanBack(breadth, t), 1),
      extreme: extreme[t],
      extremeMean20: round(meanBack(extreme, t), 2),
      extremeP90m: p90ByMonth.get(monthKey(state.dates[t])) ?? 0,
      marketRet: round(marketRet(state, t), 2),
      riskOff: state.regime[t] === 'risk_off',
    });
  }

  // วันพุ่ง 3 อันดับ (ห่างกัน ≥ spikeGap วันทำการ)
  const order = days
    .map((_, i) => i)
    .sort((a, b) => days[b].extreme - days[a].extreme || Math.abs(days[b].marketRet) - Math.abs(days[a].marketRet) || b - a);
  const picked: number[] = [];
  for (const i of order) {
    if (days[i].extreme === 0 || picked.length === 3) break;
    if (picked.every((j) => Math.abs(i - j) >= RHYTHM.spikeGap)) picked.push(i);
  }
  const spikes = picked.map((i) => ({
    date: days[i].date,
    extreme: days[i].extreme,
    share: round(pctOf(days[i].extreme, n), 0),
    marketRet: days[i].marketRet,
    breadth: days[i].breadth,
  }));

  const riskOffSpans: BreadthPanel['riskOffSpans'] = [];
  for (let i = 0; i < days.length; i++) {
    if (!days[i].riskOff) continue;
    let j = i;
    while (j + 1 < days.length && days[j + 1].riskOff) j++;
    riskOffSpans.push({ start: days[i].date, end: days[j].date });
    i = j;
  }

  let regimeShift: BreadthPanel['regimeShift'] = null;
  for (let t = t1; t > t0; t--) {
    if (state.regime[t] === state.regime[t - 1]) continue;
    const to = state.regime[t];
    regimeShift = {
      date: keyOf(state.dates[t]),
      to,
      daysAgo: t1 - t,
      note:
        to === 'risk_off'
          ? 'เข้าสู่ risk-off: SET proxy หลุดเส้นเฉลี่ย 100 วัน หรือความผันผวน 20 วันขึ้นไปอยู่ใน quartile บน'
          : 'กลับเป็น risk-on: SET proxy อยู่เหนือเส้นเฉลี่ย 100 วัน และความผันผวน 20 วันไม่อยู่ใน quartile บน',
    };
    break;
  }

  // ปฏิทิน breadth: 52 สัปดาห์ล่าสุด (เริ่มวันจันทร์) × จ.–ศ.
  const tByDate = new Map<string, number>();
  for (let t = t0; t <= t1; t++) tByDate.set(keyOf(state.dates[t]), t);
  const last = state.dates[t1];
  const lastMonday = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - ((last.getUTCDay() + 6) % 7));
  const calendar: BreadthPanel['calendar'] = [];
  for (let w = RHYTHM.calendarWeeks - 1; w >= 0; w--) {
    const monday = lastMonday - w * 7 * DAY_MS;
    const week = Array.from({ length: 5 }, (_, k) => {
      const date = keyOf(new Date(monday + k * DAY_MS));
      const t = tByDate.get(date);
      return t === undefined ? null : { date, breadth: round(breadth[t], 1) };
    });
    if (calendar.length === 0 && week.every((d) => d === null)) continue;
    calendar.push({ week: keyOf(new Date(monday)), days: week });
  }

  const L = days[days.length - 1];
  const medExtreme = median(days.map((d) => d.extreme));
  // เดือนแรกของหน้าต่างมักไม่เต็มเดือน → เทียบจากเดือนแรกที่มี ≥ 10 วันทำการ
  const firstFull = Math.max(0, monthBreadth.findIndex((m) => m.n >= 10));
  const mb0 = monthBreadth[firstFull];
  const mb1 = monthBreadth[monthBreadth.length - 1];
  const ex0 = monthly.find((m) => m.month === mb0.month) ?? monthly[0];
  const quarterDays = days.filter((d) => d.extreme >= n / 4).length;
  const summary =
    `breadth เฉลี่ยรายเดือน ${mb0.mean.toFixed(0)}% (${thMonthTick(mb0.month)}) → ${mb1.mean.toFixed(0)}% (${thMonthTick(mb1.month)}) · ` +
    `วันที่หุ้นเกินครึ่งอยู่เหนือ MA20 ${mb0.pctAbove50}% → ${mb1.pctAbove50}% · ` +
    `p90 หุ้นเคลื่อนแรง/วัน ${ex0.p90} → ${monthly[monthly.length - 1].p90} ตัว · ` +
    `วันที่หุ้น ≥ 1/4 ของตลาดเคลื่อนแรงพร้อมกัน ${quarterDays} วัน (${round(pctOf(quarterDays, days.length), 1)}%)`;
  const tone =
    L.breadthMean20 >= 60 ? 'หุ้นส่วนใหญ่อยู่ในขาขึ้นระยะสั้น' : L.breadthMean20 <= 40 ? 'อ่อนแอเป็นวงกว้าง' : 'ก้ำกึ่ง ไม่มีฝั่งใดครองตลาด';
  return {
    title: `ความกว้างของตลาด: หุ้น ${L.breadth.toFixed(0)}% ปิดเหนือ MA20 (เฉลี่ย 20 วัน ${L.breadthMean20.toFixed(0)}%) — ${tone}`,
    summary,
    basis:
      `${n} หุ้น · ${thDate(days[0].date)} – ${thDate(L.date)} (${days.length} วันทำการ) · breadth = % หุ้นที่ปิดเหนือเส้นเฉลี่ย 20 วัน · ` +
      `“เคลื่อนแรงผิดปกติ” = |ผลตอบแทนวันนั้น| > 2σ ของหุ้นตัวเองใน 60 วันก่อนหน้า (มัธยฐาน ${round(medExtreme, 1)} ตัว/วัน) — ` +
      'หลายตัวพร้อมกันมักเป็นข่าวระดับตลาด ไม่ใช่ข่าวรายตัว · แถบแรเงา = regime risk-off ของแพลตฟอร์ม',
    nStocks: n,
    days,
    spikes,
    riskOffSpans,
    regimeShift,
    monthly,
    heat,
    calendar,
    latest: { date: L.date, breadth: L.breadth, breadthMean20: L.breadthMean20, extreme: L.extreme },
  };
}

// ─────────────────────────── 2) ฤดูกาลของผลตอบแทน ───────────────────────────

function seasonStat(label: string, xs: number[]): SeasonStat {
  const n = xs.length;
  if (n === 0) return { label, mean: null, upPct: null, n: 0, tStat: null, q: null };
  const m = mean(xs);
  const sd = n > 1 ? std(xs) : 0;
  return {
    label,
    mean: round(m, 3),
    upPct: round(pctOf(xs.filter((x) => x > 0).length, n), 0),
    n,
    tStat: n >= 3 && sd > 0 ? round(m / (sd / Math.sqrt(n)), 2) : null,
    q: null,
  };
}

/** BH-FDR ข้ามทุกช่องที่ทดสอบพร้อมกัน — ทดสอบ 17 ช่องที่ |t| ≥ 2 จะเจอโดยบังเอิญ ~1 ช่องอยู่แล้ว */
function adjustForMultipleTests(stats: SeasonStat[]): void {
  const tested = stats.filter((s) => s.tStat !== null);
  const q = bhFdr(tested.map((s) => normalTwoSideP(s.tStat!)));
  tested.forEach((s, i) => (s.q = round(q[i], 3)));
}

/** heatmap วันในสัปดาห์ × เดือน ของผลตอบแทนรายวัน (%) — SET proxy หรือหุ้นหนึ่งตัว · ใช้ประวัติทั้งหมดที่มี · null = ไม่รู้จักสัญลักษณ์ */
export function computeSeasonality(state: MarketState, symbol: string): SeasonalityPanel | null {
  const isMarket = symbol === MARKET_SYMBOL;
  const st = isMarket ? null : state.stocks.find((s) => s.symbol === symbol);
  if (!isMarket && !st) return null;
  const grid: number[][][] = WEEKDAYS.map(() => TH_MONTH.map(() => []));
  const byMonth: number[][] = TH_MONTH.map(() => []);
  const byWeekday: number[][] = WEEKDAYS.map(() => []);
  const all: number[] = [];
  let first = '';
  let lastDate = '';
  for (let t = 1; t < state.dates.length; t++) {
    let r: number;
    if (st) {
      if (!(st.ohlcv.volume[t] > 0)) continue; // วันที่เติมช่องว่าง (ไม่มีการซื้อขาย)
      r = st.rows[t].ret1 * 100;
    } else {
      r = marketRet(state, t);
    }
    if (!Number.isFinite(r)) continue;
    const d = state.dates[t];
    const wd = d.getUTCDay() - 1;
    if (wd < 0 || wd > 4) continue;
    const m = d.getUTCMonth();
    grid[wd][m].push(r);
    byMonth[m].push(r);
    byWeekday[wd].push(r);
    all.push(r);
    if (!first) first = keyOf(d);
    lastDate = keyOf(d);
  }
  const cells: HeatCell[][] = grid.map((row) => row.map((xs) => ({ value: xs.length ? round(mean(xs), 3) : null, n: xs.length })));
  const months = byMonth.map((xs, i) => seasonStat(TH_MONTH[i], xs));
  const weekdays = byWeekday.map((xs, i) => seasonStat(WEEKDAYS[i], xs));
  adjustForMultipleTests([...months, ...weekdays]);
  const label = st ? `${st.symbol} · ${st.name}` : 'SET proxy (ดัชนีของแพลตฟอร์ม)';
  const short = st ? st.symbol : 'SET proxy';

  const ranked = months.filter((m) => m.mean !== null && m.n >= 10).sort((a, b) => b.mean! - a.mean!);
  const tested = [...months, ...weekdays].filter((m) => m.tStat !== null);
  const raw = tested.filter((m) => Math.abs(m.tStat!) >= 2).map((m) => `${m.label} (t=${m.tStat!.toFixed(1)})`);
  const fdr = tested.filter((m) => m.q! < FDR_LEVEL).map((m) => `${m.label} (t=${m.tStat!.toFixed(1)})`);
  const verdict = fdr.length
    ? `ต่างจากศูนย์แม้ปรับการทดสอบ ${tested.length} ช่องพร้อมกันแล้ว (FDR 10%): ${fdr.join(', ')}`
    : raw.length
      ? `|t| ≥ 2 ที่ ${raw.join(', ')} แต่ไม่ผ่านเมื่อปรับการทดสอบ ${tested.length} ช่องพร้อมกัน — อาจเป็นความบังเอิญ`
      : 'ไม่มีเดือนหรือวันใดต่างจากศูนย์อย่างมีนัย (|t| < 2 ทั้งหมด)';
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const years = all.length / 252;
  const occurrences = new Set<string>();
  for (let t = 1; t < state.dates.length; t++) occurrences.add(monthKey(state.dates[t]));
  const perMonth = TH_MONTH.map((_, i) => [...occurrences].filter((k) => Number(k.slice(5)) === i + 1).length);
  const filledCells = cells.flat().filter((c) => c.n > 0);
  let maxCell: SeasonalityPanel['maxCell'] = null;
  let minCell: SeasonalityPanel['minCell'] = null;
  cells.forEach((row, r) =>
    row.forEach((c, ci) => {
      if (c.value === null || c.n < 5) return;
      if (!maxCell || c.value > cells[maxCell.r][maxCell.c].value!) maxCell = { r, c: ci };
      if (!minCell || c.value < cells[minCell.r][minCell.c].value!) minCell = { r, c: ci };
    }),
  );
  const cellText = (x: { r: number; c: number } | null) =>
    x ? `${WEEKDAYS[x.r]} × ${TH_MONTH[x.c]} ${signed(cells[x.r][x.c].value!)}%/วัน (${cells[x.r][x.c].n} วัน)` : '—';
  const wdRanked = weekdays.filter((w) => w.mean !== null).sort((a, b) => b.mean! - a.mean!);
  const summary =
    `ช่องสูงสุด ${cellText(maxCell)} · ต่ำสุด ${cellText(minCell)} · ` +
    (wdRanked.length ? `วันในสัปดาห์: ${wdRanked[0].label} ดีสุด (${signed(wdRanked[0].mean!)}%) · ${wdRanked[wdRanked.length - 1].label} แย่สุด (${signed(wdRanked[wdRanked.length - 1].mean!)}%) · ` : '') +
    `วันที่ปิดบวก ${all.length ? round(pctOf(all.filter((x) => x > 0).length, all.length), 0) : 0}% ของทั้งหมด`;
  return {
    symbol: st ? st.symbol : MARKET_SYMBOL,
    label,
    summary,
    title:
      best && worst
        ? `${short}: เดือนที่เฉลี่ยดีสุด ${best.label} (${signed(best.mean!)}%/วัน) · แย่สุด ${worst.label} (${signed(worst.mean!)}%/วัน) — ${verdict}`
        : `${short}: ข้อมูลยังไม่พอสำหรับดูฤดูกาล`,
    basis:
      `ผลตอบแทนรายวัน ${first ? `${thDate(first)} – ${thDate(lastDate)}` : '—'} (${all.length} วัน ≈ ${years.toFixed(1)} ปี) · ` +
      `แต่ละเดือนในปฏิทินมีตัวอย่างเพียง ${Math.min(...perMonth)}–${Math.max(...perMonth)} ครั้ง · ` +
      `ช่องหนึ่งเฉลี่ย ${filledCells.length ? Math.round(mean(filledCells.map((c) => c.n))) : 0} วัน · t = ค่าเฉลี่ย ÷ (SD/√n) — |t| < 2 แยกไม่ออกจากความบังเอิญ · ` +
      `q = p ที่ปรับการทดสอบหลายช่อง (Benjamini–Hochberg) · ใช้ดูรูปแบบ ไม่ใช่กฎซื้อขาย`,
    rows: WEEKDAYS,
    cols: TH_MONTH,
    cells,
    byMonth: months,
    byWeekday: weekdays,
    overallMean: round(mean(all), 3),
    nDays: all.length,
    start: first,
    end: lastDate,
    maxCell,
    minCell,
  };
}

// ─────────────────────────── 3) สัดส่วนมูลค่าซื้อขายรายหมวด ───────────────────────────

/** N_eff = 1/Σs² (s = สัดส่วนแบบเศษส่วน) — จำนวนหมวด "ที่มีน้ำหนักจริง" */
export const nEffective = (shares: number[]): number => {
  const tot = shares.reduce((a, b) => a + b, 0);
  if (tot <= 0) return 0;
  return 1 / shares.reduce((a, s) => a + (s / tot) ** 2, 0);
};

/** สีหมวดที่ผ่าน validator มี 6 ช่อง — เกินนี้รวมหมวดที่มูลค่าน้อยเป็น "หมวดอื่น ๆ" (ไม่สร้างสีใหม่) */
export const MAX_SECTORS = 6;
export const OTHER_SECTOR = 'OTHER';

export function computeSectors(state: MarketState, t0: number, t1: number): SectorPanel {
  const W = RHYTHM.sectorWindow;
  const from = Math.max(0, t0 - (W - 1));
  const tradedValue = (s: MarketState['stocks'][number], t: number) => {
    const v = s.ohlcv.volume[t] * s.rows[t].close;
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  // ลำดับหมวดตามจักรวาลหุ้น (สีผูกกับหมวด) · เกิน 6 หมวด → เก็บ 5 หมวดที่มูลค่ารวมสูงสุด + หมวดอื่น ๆ
  const universe = [...new Set(state.stocks.map((s) => s.sector))];
  let keys = universe;
  if (universe.length > MAX_SECTORS) {
    const total = new Map<string, number>();
    for (const s of state.stocks) {
      let v = 0;
      for (let t = t0; t <= t1; t++) v += tradedValue(s, t);
      total.set(s.sector, (total.get(s.sector) ?? 0) + v);
    }
    const keep = new Set([...universe].sort((a, b) => total.get(b)! - total.get(a)!).slice(0, MAX_SECTORS - 1));
    keys = [...universe.filter((k) => keep.has(k)), OTHER_SECTOR];
  }
  const idx = new Map(keys.map((k, i) => [k, i]));
  const slotOf = (sector: string) => idx.get(sector) ?? keys.length - 1;
  const nStocks = keys.map(() => 0);
  for (const s of state.stocks) nStocks[slotOf(s.sector)]++;
  const K = keys.length;
  // มูลค่าซื้อขายรายวันต่อหมวด (ล้านบาท) ≈ ปริมาณ (ล้านหุ้น) × ราคาปิด · เงินไหลสุทธิสถาบัน = Σ flow5 ของหุ้นที่มีข้อมูล flow
  const val = keys.map(() => new Float64Array(t1 + 1));
  const flow = keys.map(() => new Float64Array(t1 + 1));
  let hasFlows = false;
  for (const s of state.stocks) {
    const k = slotOf(s.sector);
    const withFlow = s.coverage?.flows ?? false;
    hasFlows ||= withFlow;
    for (let t = from; t <= t1; t++) {
      val[k][t] += tradedValue(s, t);
      if (withFlow && Number.isFinite(s.rows[t].flow5)) flow[k][t] += s.rows[t].flow5;
    }
  }

  const rolling: SectorPanel['rolling'] = [];
  const acc = new Float64Array(K);
  for (let t = from; t <= t1; t++) {
    for (let k = 0; k < K; k++) {
      acc[k] += val[k][t];
      if (t - W >= from) acc[k] -= val[k][t - W];
    }
    if (t < t0) continue;
    const tot = acc.reduce((a, b) => a + b, 0);
    rolling.push({ date: keyOf(state.dates[t]), shares: Array.from(acc, (v) => round(pctOf(v, tot), 1)) });
  }

  const months = new Map<string, number[]>();
  for (let t = t0; t <= t1; t++) {
    const mk = monthKey(state.dates[t]);
    const list = months.get(mk) ?? [];
    list.push(t);
    months.set(mk, list);
  }
  const monthly: SectorPanel['monthly'] = [...months].slice(-RHYTHM.sectorMonths).map(([month, ts]) => {
    const v = keys.map((_, k) => ts.reduce((a, t) => a + val[k][t], 0));
    const totalValue = v.reduce((a, b) => a + b, 0);
    const net = keys.map((_, k) => ts.reduce((a, t) => a + flow[k][t], 0));
    const mag = net.map(Math.abs);
    const totalMag = mag.reduce((a, b) => a + b, 0);
    const withFlow = hasFlows && totalMag > 0;
    return {
      month,
      totalValue: Math.round(totalValue),
      totalFlow: withFlow ? Math.round(totalMag) : null,
      value: v.map((x) => round(pctOf(x, totalValue), 1)),
      flow: withFlow ? mag.map((x) => round(pctOf(x, totalMag), 1)) : null,
      flowNet: withFlow ? net.map((x) => Math.round(x)) : null,
      nEffValue: round(nEffective(v), 2),
      nEffFlow: withFlow ? round(nEffective(mag), 2) : null,
    };
  });

  const latestShares = rolling[rolling.length - 1].shares;
  const nEff = round(nEffective(latestShares), 2);
  const labels = keys.map((k) => (k === OTHER_SECTOR ? 'หมวดอื่น ๆ' : sectorLabel(k)));
  const top = latestShares.indexOf(Math.max(...latestShares));
  // เทียบ 3 เดือน (63 วันทำการ) — หมวดที่สัดส่วนเพิ่ม/ลดมากสุด
  const back = rolling[Math.max(0, rolling.length - 1 - 63)];
  const delta = latestShares.map((v, k) => round(v - back.shares[k], 1));
  const gain = delta.indexOf(Math.max(...delta));
  const loss = delta.indexOf(Math.min(...delta));
  const value20 = acc.reduce((a, b) => a + b, 0);
  const summary =
    `เทียบ ${thDate(back.date)}: ${labels[gain]} ${signed(delta[gain], 1)} จุด · ${labels[loss]} ${signed(delta[loss], 1)} จุด · ` +
    `N_eff ${nEffective(back.shares).toFixed(1)} → ${nEff.toFixed(1)} · มูลค่าซื้อขาย 20 วันล่าสุด ${Math.round(value20).toLocaleString('en-US')} ล้านบาท`;
  const concentration = nEff <= K * 0.5 ? 'กระจุกตัว' : nEff >= K * 0.8 ? 'กระจายตัวดี' : 'กระจายตัวปานกลาง';
  return {
    title: `${labels[top]} ครองมูลค่าซื้อขาย ${latestShares[top].toFixed(0)}% (20 วันล่าสุด) · N_eff ${nEff.toFixed(1)} จาก ${K} หมวด — ${concentration}`,
    summary,
    basis:
      `มูลค่าซื้อขาย ≈ ปริมาณ × ราคาปิด (ล้านบาท) ของหุ้น ${state.stocks.length} ตัวในแพลตฟอร์ม (ไม่ใช่ทั้งตลาด) · สัดส่วนสะสม 20 วันทำการ · ` +
      `N_eff = 1/Σ(สัดส่วน²) = จำนวนหมวดที่มีน้ำหนักจริง (สูงสุด ${K}) · ` +
      (universe.length > K ? `รวม ${universe.length - K + 1} หมวดที่มูลค่าน้อยเป็น “หมวดอื่น ๆ” · ` : '') +
      (hasFlows
        ? 'ขนาดเงินไหลสุทธิสถาบัน = |Σ flow5 ของหุ้นในหมวดตลอดเดือน| (ทั้งเข้าและออก) — ดูทิศทางจริงได้ใน tooltip'
        : 'ชุดข้อมูลนี้ไม่มีเงินไหลสถาบัน จึงแสดงเฉพาะมูลค่าซื้อขาย'),
    sectors: keys.map((key, k) => ({ key, label: labels[k], nStocks: nStocks[k] })),
    rolling,
    monthly,
    latest: { date: rolling[rolling.length - 1].date, shares: latestShares, nEff },
    hasFlows,
  };
}

// ─────────────────────────── 4) แผนที่วันซื้อขาย ───────────────────────────

interface DayFeature {
  label: string;
  family: string;
  pos: string;
  neg: string;
}

export const DAY_FEATURES: DayFeature[] = [
  { label: 'ผลตอบแทน SET', family: 'dir', pos: 'ตลาดบวก', neg: 'ตลาดลบ' },
  { label: '% หุ้นปิดบวก', family: 'dir', pos: 'หุ้นส่วนใหญ่บวก', neg: 'หุ้นส่วนใหญ่ลบ' },
  { label: 'การกระจายผลตอบแทน', family: 'disp', pos: 'หุ้นแยกทางกัน', neg: 'เคลื่อนไปทางเดียวกัน' },
  { label: 'ปริมาณเทียบปกติ', family: 'vol', pos: 'ปริมาณหนาแน่น', neg: 'ปริมาณบางเบา' },
  { label: 'F_stress', family: 'stress', pos: 'ตึงเครียด', neg: 'ผ่อนคลาย' },
  { label: 'F_momentum', family: 'mom', pos: 'โมเมนตัมบวก', neg: 'โมเมนตัมลบ' },
  { label: 'F_flow', family: 'flow', pos: 'เงินไหลเข้า', neg: 'เงินไหลออก' },
];

const dist2 = (a: number[], b: number[]) => {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2;
  return s;
};

/** k-means++ หลายรอบเริ่มต้น (seed คงที่) → รอบที่ inertia ต่ำสุด */
export function kmeans(Z: number[][], k: number, seed: number, restarts: number): { assign: number[]; centroids: number[][]; inertia: number } {
  const n = Z.length;
  const p = Z[0].length;
  const rng = mulberry32(seed);
  let best: { assign: number[]; centroids: number[][]; inertia: number } | null = null;
  for (let r = 0; r < restarts; r++) {
    const C: number[][] = [Z[Math.floor(rng() * n)].slice()];
    const d2 = new Float64Array(n).fill(Infinity);
    while (C.length < k) {
      const c = C[C.length - 1];
      let total = 0;
      for (let i = 0; i < n; i++) {
        d2[i] = Math.min(d2[i], dist2(Z[i], c));
        total += d2[i];
      }
      let u = rng() * total;
      let pick = n - 1;
      for (let i = 0; i < n; i++) {
        u -= d2[i];
        if (u <= 0) {
          pick = i;
          break;
        }
      }
      C.push(Z[pick].slice());
    }
    const assign = new Array<number>(n).fill(-1);
    for (let it = 0; it < 100; it++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        let bi = 0;
        let bd = Infinity;
        for (let c = 0; c < k; c++) {
          const d = dist2(Z[i], C[c]);
          if (d < bd) {
            bd = d;
            bi = c;
          }
        }
        if (assign[i] !== bi) {
          assign[i] = bi;
          changed = true;
        }
      }
      if (!changed) break;
      const sums = Array.from({ length: k }, () => new Array<number>(p).fill(0));
      const counts = new Array<number>(k).fill(0);
      for (let i = 0; i < n; i++) {
        counts[assign[i]]++;
        for (let j = 0; j < p; j++) sums[assign[i]][j] += Z[i][j];
      }
      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) C[c] = sums[c].map((s) => s / counts[c]);
        else {
          // กลุ่มว่าง → ย้ายไปจุดที่ไกลจากกลุ่มของตัวเองที่สุด
          let far = 0;
          let fd = -1;
          for (let i = 0; i < n; i++) {
            const d = dist2(Z[i], C[assign[i]]);
            if (d > fd) {
              fd = d;
              far = i;
            }
          }
          C[c] = Z[far].slice();
        }
      }
    }
    const inertia = Z.reduce((a, z, i) => a + dist2(z, C[assign[i]]), 0);
    if (!best || inertia < best.inertia) best = { assign, centroids: C, inertia };
  }
  return best!;
}

/** ป้ายกลุ่มจากค่ากลางแบบ z: ตัวแปรที่เด่นที่สุดจากคนละตระกูล (|z| ≥ 0.35) */
function clusterLabel(profile: number[], maxParts: number): string {
  const ranked = profile.map((z, j) => ({ z, j })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const parts: string[] = [];
  const families = new Set<string>();
  for (const { z, j } of ranked) {
    if (Math.abs(z) < 0.35 || parts.length === maxParts) break;
    const f = DAY_FEATURES[j];
    if (families.has(f.family)) continue;
    families.add(f.family);
    parts.push(z > 0 ? f.pos : f.neg);
  }
  return parts.length ? parts.join(' · ') : 'วันปกติ (ใกล้ค่าเฉลี่ยทุกด้าน)';
}

export function computeDayMap(state: MarketState, t0: number, t1: number): DayMapPanel {
  const S = state.stocks;
  const ts: number[] = [];
  const X: number[][] = [];
  for (let t = t0; t <= t1; t++) {
    const rets = S.map((s) => s.rows[t].ret1).filter(Number.isFinite);
    const vr = S.map((s) => s.rows[t].volRatio).filter(Number.isFinite);
    ts.push(t);
    X.push([
      marketRet(state, t),
      pctOf(rets.filter((r) => r > 0).length, rets.length),
      std(rets) * 100,
      mean(vr),
      state.fStress[t],
      state.fMomentum[t],
      state.fFlow[t],
    ]);
  }
  const n = X.length;
  const pc = pca(X, 2);
  // ทิศของแกน PCA ไม่มีความหมายในตัว → หันให้ตัวแปรที่ถ่วงมากที่สุดของแต่ละแกนเป็นบวก (ผลคงที่ทุกครั้ง)
  const flip = pc.loadings.map((l) => {
    const j = l.reduce((bi, v, i) => (Math.abs(v) > Math.abs(l[bi]) ? i : bi), 0);
    return l[j] < 0 ? -1 : 1;
  });
  const loadings = pc.loadings.map((l, a) => l.map((v) => v * flip[a]));
  const scores = pc.scores.map((s) => [s[0] * flip[0], s[1] * flip[1]]);
  const Z = X.map((r) => r.map((v, j) => (v - pc.means[j]) / pc.sds[j]));

  const km = kmeans(Z, Math.min(RHYTHM.clusters, n), RHYTHM.kmeansSeed, RHYTHM.kmeansRestarts);
  const k = km.centroids.length;
  const sizes = new Array<number>(k).fill(0);
  for (const a of km.assign) sizes[a]++;
  // เรียงกลุ่มตามขนาด (ใหญ่ → เล็ก) ให้ id คงที่ต่อชุดข้อมูล
  const order = sizes.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i).map((o) => o.i);
  const remap = new Array<number>(k);
  order.forEach((old, id) => (remap[old] = id));
  const assign = km.assign.map((a) => remap[a]);

  const fwd = (t: number) => (t + RHYTHM.fwdDays <= t1 ? (state.marketClose[t + RHYTHM.fwdDays] / state.marketClose[t] - 1) * 100 : null);
  const fwdStats = (idxs: number[]) => {
    const xs = idxs.map((i) => fwd(ts[i])).filter((v): v is number => v !== null);
    return {
      fwd5: xs.length ? round(mean(xs), 2) : null,
      fwdUp: xs.length ? round(pctOf(xs.filter((x) => x > 0).length, xs.length), 0) : null,
      nFwd: xs.length,
    };
  };

  const labels: string[] = [];
  const clusters: DayCluster[] = order.map((old, id) => {
    const members = assign.map((a, i) => (a === id ? i : -1)).filter((i) => i >= 0);
    const profile = km.centroids[old].map((v) => round(v, 2));
    let label = clusterLabel(profile, 2);
    if (labels.includes(label)) label = clusterLabel(profile, 3);
    if (labels.includes(label)) label = `${label} (${id + 1})`;
    labels.push(label);
    return {
      id,
      label,
      share: round(pctOf(members.length, n), 1),
      n: members.length,
      cx: round(mean(members.map((i) => scores[i][0])), 2),
      cy: round(mean(members.map((i) => scores[i][1])), 2),
      avgRet: round(mean(members.map((i) => X[i][0])), 2),
      pctUp: round(mean(members.map((i) => X[i][1])), 0),
      ...fwdStats(members),
      profile,
    };
  });

  const axis = (a: 0 | 1): DayMapAxis => ({
    label: a === 0 ? 'แกนนอน (PC1)' : 'แกนตั้ง (PC2)',
    explained: round(pc.explained[a] * 100, 0),
    top: loadings[a]
      .map((l, j) => ({ feature: DAY_FEATURES[j].label, loading: round(l, 2) }))
      .sort((x, y) => Math.abs(y.loading) - Math.abs(x.loading))
      .slice(0, 3),
  });
  const points = ts.map((t, i) => ({ date: keyOf(state.dates[t]), x: round(scores[i][0], 2), y: round(scores[i][1], 2), c: assign[i] }));
  const latest = points[points.length - 1];
  const cl = clusters[latest.c];
  const baseline = fwdStats(ts.map((_, i) => i));
  const e = round((pc.explained[0] + pc.explained[1]) * 100, 0);
  const recent = points.slice(-5);
  const axX = axis(0);
  const axY = axis(1);
  const summary =
    `5 วันล่าสุด: กลุ่ม ${recent.map((r) => r.c + 1).join(' → ')} · ` +
    `แกนนอน ≈ ${axX.top.slice(0, 2).map((x) => x.feature).join(' + ')} (${axX.explained}%) · แกนตั้ง ≈ ${axY.top.slice(0, 2).map((x) => x.feature).join(' + ')} (${axY.explained}%)` +
    (cl.fwdUp !== null && baseline.fwdUp !== null ? ` · หลังวันแบบกลุ่มนี้ SET 5 วันบวก ${cl.fwdUp}% ของครั้ง (ทั้งช่วง ${baseline.fwdUp}%)` : '');
  return {
    title:
      `วันล่าสุด (${thDate(latest.date)}) อยู่ในกลุ่ม “${cl.label}” — ${cl.share.toFixed(0)}% ของวันเป็นแบบนี้` +
      (cl.fwd5 !== null && baseline.fwd5 !== null ? ` · SET 5 วันถัดไปเฉลี่ย ${signed(cl.fwd5)}% (ทั้งช่วง ${signed(baseline.fwd5)}%)` : ''),
    basis:
      `แต่ละจุด = 1 วันทำการ (${n} วัน) · ตัวแปรระดับตลาด ${DAY_FEATURES.length} ตัวแปลงเป็น z-score แล้วฉายลง 2 มิติด้วย PCA (อธิบายความแปรปรวน ${e}%) · ` +
      `จัดกลุ่มด้วย k-means (k=${k}, seed คงที่) บนทั้ง ${DAY_FEATURES.length} มิติ ไม่ใช่บนภาพ 2 มิติ · ` +
      `ผลตอบแทน 5 วันถัดไปเป็นสถิติย้อนหลังในตัวอย่าง (หน้าต่างซ้อนกัน) — ไม่ใช่สัญญาณซื้อขาย`,
    summary,
    features: DAY_FEATURES.map((f) => f.label),
    axes: [axX, axY],
    points,
    clusters,
    baseline,
    latest: { date: latest.date, cluster: latest.c, x: latest.x, y: latest.y },
    recent,
  };
}

// ─────────────────────────── 5) อะไรบล็อกสัญญาณ ───────────────────────────

export const GATE_BLOCK_CATEGORIES: GateBlockPanel['categories'] = [
  { key: 'G1', label: 'G1 · Regime', desc: 'ภาวะตลาดไม่เอื้อ (F_stress สูง หรือโมเมนตัมไหลลง)' },
  { key: 'G2', label: 'G2 · Dependence', desc: 'หุ้นยังผูกกับตลาดและ tail risk สูง' },
  { key: 'G3', label: 'G3 · Technical', desc: 'โครงสร้างราคา/ปริมาณไม่สนับสนุน' },
  { key: 'G4', label: 'G4 · Risk', desc: 'ขนาดไม้ที่งบความเสี่ยงอนุญาตเล็กเกินไป' },
  { key: 'G5', label: 'G5 · Execution', desc: 'RSI สูงเกิน — ห้ามไล่ราคา' },
  { key: 'SIGNAL', label: 'สัญญาณเข้าซื้อ', desc: 'ผ่านครบ 5 ด่าน (pullback) หรือ G1–G4 + breakout (momentum)' },
];
const BLOCK_KEYS = GATE_BLOCK_CATEGORIES.map((c) => c.key);
const SIGNAL_CAT = 5;

/** ผลของทุกหุ้น-วัน: หมวด 0–4 = ด่าน G1–G5 ที่ไม่ผ่านเป็นด่านแรก · 5 = มีสัญญาณ (kind 1 = pullback, 2 = momentum) */
export interface GateBlockMatrix {
  t0: number;
  t1: number;
  symbols: string[];
  cat: Int8Array[];
  kind: Int8Array[];
}

export function computeGateBlockMatrix(state: MarketState, t0: number, t1: number): GateBlockMatrix {
  const len = t1 - t0 + 1;
  const cat: Int8Array[] = [];
  const kind: Int8Array[] = [];
  for (const s of state.stocks) {
    const c = new Int8Array(len);
    const k = new Int8Array(len);
    for (let t = t0; t <= t1; t++) {
      const ev = evaluateGates(state, s.symbol, t, { light: true });
      const i = t - t0;
      if (ev.signal !== 'NO_TRADE') {
        c[i] = SIGNAL_CAT;
        k[i] = ev.signal === 'ENTRY_PULLBACK' ? 1 : 2;
      } else {
        const g = ev.gates;
        c[i] = !g.g1 ? 0 : !g.g2 ? 1 : !g.g3 ? 2 : !g.g4 ? 3 : 4;
      }
    }
    cat.push(c);
    kind.push(k);
  }
  return { t0, t1, symbols: state.stocks.map((s) => s.symbol), cat, kind };
}

const emptyCounts = (): Record<GateBlockKey, number> => ({ G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, SIGNAL: 0 });

function finalize(counts: Record<GateBlockKey, number>, pullback: number, momentum: number): GateBlockCounts {
  const total = BLOCK_KEYS.reduce((a, key) => a + counts[key], 0);
  const shares = emptyCounts();
  for (const key of BLOCK_KEYS) shares[key] = round(pctOf(counts[key], total), 1);
  return { total, counts, shares, pullback, momentum };
}

/** รวมรายเดือน: scope 'ALL' = ทุกหุ้น · สัญลักษณ์ = หุ้นตัวเดียว · null = ไม่รู้จักสัญลักษณ์ */
export function summarizeGateBlocks(state: MarketState, m: GateBlockMatrix, scope: string): GateBlockPanel | null {
  const all = scope === 'ALL';
  const rows = all ? m.cat.map((_, i) => i) : [m.symbols.indexOf(scope)].filter((i) => i >= 0);
  if (rows.length === 0) return null;
  const byMonth = new Map<string, { counts: Record<GateBlockKey, number>; pullback: number; momentum: number }>();
  const overall = { counts: emptyCounts(), pullback: 0, momentum: 0 };
  for (let t = m.t0; t <= m.t1; t++) {
    const mk = monthKey(state.dates[t]);
    let b = byMonth.get(mk);
    if (!b) {
      b = { counts: emptyCounts(), pullback: 0, momentum: 0 };
      byMonth.set(mk, b);
    }
    for (const si of rows) {
      const i = t - m.t0;
      const key = BLOCK_KEYS[m.cat[si][i]];
      b.counts[key]++;
      overall.counts[key]++;
      if (m.kind[si][i] === 1) {
        b.pullback++;
        overall.pullback++;
      } else if (m.kind[si][i] === 2) {
        b.momentum++;
        overall.momentum++;
      }
    }
  }
  const months = [...byMonth].map(([month, b]) => ({ month, ...finalize(b.counts, b.pullback, b.momentum) }));
  const tot = finalize(overall.counts, overall.pullback, overall.momentum);
  const gatesOnly = GATE_BLOCK_CATEGORIES.filter((c) => c.key !== 'SIGNAL');
  const worst = gatesOnly.reduce((a, c) => (tot.shares[c.key] > tot.shares[a.key] ? c : a), gatesOnly[0]);
  const st = all ? null : state.stocks[rows[0]];
  const unit = all ? 'หุ้น-วัน' : 'วัน';
  const label = st ? `${st.symbol} · ${st.name}` : `ทุกหุ้น (${m.symbols.length} ตัว)`;
  const lastMonths = months.slice(-3);
  const recentSignal = lastMonths.reduce((a, x) => a + x.counts.SIGNAL, 0);
  const recentTotal = lastMonths.reduce((a, x) => a + x.total, 0);
  const topBlocker = (m: GateBlockCounts) => gatesOnly.reduce((a, c) => (m.shares[c.key] > m.shares[a.key] ? c : a), gatesOnly[0]);
  const fullTotal = Math.max(...months.map((m) => m.total));
  const m0 = months.find((m) => m.total >= fullTotal * 0.45) ?? months[0];
  const m1 = months[months.length - 1];
  const summary =
    `ด่านที่บล็อกมากสุด: ${topBlocker(m0).label} (${thMonthTick(m0.month)}) → ${topBlocker(m1).label} (${thMonthTick(m1.month)}) · ` +
    `สัญญาณ 3 เดือนล่าสุด ${round(pctOf(recentSignal, recentTotal), 1).toFixed(1)}% เทียบทั้งช่วง ${tot.shares.SIGNAL.toFixed(1)}% · ` +
    `pullback ${tot.pullback} · momentum ${tot.momentum} ครั้ง`;
  return {
    scope: st ? st.symbol : 'ALL',
    label,
    title:
      `${st ? `${st.symbol}: ` : ''}${tot.shares[worst.key].toFixed(0)}% ของ${unit}ติดด่าน ${worst.label} ก่อนด่านอื่น — ` +
      `มีสัญญาณเข้าซื้อ ${tot.shares.SIGNAL.toFixed(1)}% (${tot.counts.SIGNAL} ครั้ง) · 3 เดือนล่าสุด ${round(pctOf(recentSignal, recentTotal), 1).toFixed(1)}%`,
    summary,
    basis:
      `นับต่อ${unit} (${tot.total.toLocaleString('en-US')} ${unit}, ${months.length} เดือน) ว่า “ด่านแรกที่ไม่ผ่าน” ตามลำดับ G1→G5 คือด่านไหน · ` +
      'ผ่านครบ = สัญญาณ pullback · ผ่าน G1–G4 + breakout = สัญญาณ momentum · ' +
      'ใช้ evaluateGates ตัวเดียวกับ backtest (โหมดเร็ว: ความเสี่ยง G4 แบบ parametric) — ผลจริงรายวันในแท็บ Decision ใช้ Monte Carlo จึงอาจต่างเล็กน้อย',
    categories: GATE_BLOCK_CATEGORIES,
    months,
    overall: tot,
  };
}

