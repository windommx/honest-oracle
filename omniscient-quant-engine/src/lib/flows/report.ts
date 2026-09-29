// ============================================================
// สร้างข้อมูลแดชบอร์ดเงินไหลจากรายวัน (pure — ทดสอบได้)
//  - ตารางซื้อ/ขาย/สุทธิต่อกลุ่มของ "สัปดาห์ล่าสุดที่ครบ" + การเปลี่ยนแปลงจากสัปดาห์ก่อน + % ของมูลค่ารวม
//  - เงินไหลสุทธิตามช่วงเวลา (วันล่าสุด … 1 ปี, ตั้งแต่ต้นปี) จากรายวัน
//  - อนุกรมรายสัปดาห์ตามช่วงที่เลือก (6m/1y/2y/3y): สุทธิรายสัปดาห์, สุทธิสะสมในช่วง, short sale %
//  - Flow Index (แนวคิดเดียวกับ COT Index): (สะสม − ต่ำสุด) / (สูงสุด − ต่ำสุด) × 100 ของเงินไหลสะสม ย้อนหลัง 26 / 156 สัปดาห์
// ============================================================

import { thSpan } from './format';
import { aggregateWeeks } from './generate';
import {
  FLOW_LABEL,
  type FlowBar,
  type FlowDashboard,
  type FlowEntity,
  type FlowGroup,
  type FlowPeriodRow,
  type FlowRange,
  type FlowSeriesPoint,
  type FlowSource,
  type FlowTableRow,
  type FlowWeek,
  type PeriodKey,
} from './types';

export const RANGE_WEEKS: Record<FlowRange, number> = { '6m': 26, '1y': 52, '2y': 104, '3y': 156 };
export const LOOKBACK_6M = 26;
export const LOOKBACK_36M = 156;
/** Flow Index 36 เดือนใช้ข้อมูลเท่าที่มีเมื่อประวัติสั้นกว่า 156 สัปดาห์ แต่ต้องมีอย่างน้อย 52 สัปดาห์ */
export const MIN_WEEKS_36M = 52;

export const PERIOD_DEFS: Array<{ key: PeriodKey; label: string; days: number | null }> = [
  { key: '1D', label: 'วันล่าสุด', days: 1 },
  { key: '1W', label: '5 วัน', days: 5 },
  { key: '1M', label: '1 เดือน', days: 21 },
  { key: '3M', label: '3 เดือน', days: 63 },
  { key: '6M', label: '6 เดือน', days: 126 },
  { key: 'YTD', label: 'ตั้งแต่ต้นปี', days: null },
  { key: '1Y', label: '1 ปี', days: 252 },
];

const cents = (x: number) => Math.round(x * 100);
const netCents = (b: FlowBar, g: FlowGroup) => {
  const x = b.groups[g];
  return x ? cents(x.buy) - cents(x.sell) : 0;
};
const pct = (x: number, total: number) => (total > 0 ? +((x / total) * 100).toFixed(1) : 0);

/** Flow Index ของ values[i] เทียบกรอบ lookback สัปดาห์ล่าสุด (รวมสัปดาห์นั้น) — null เมื่อประวัติในกรอบน้อยกว่า minWeeks · แบน = 50 */
export function flowIndexAt(values: number[], i: number, lookback: number, minWeeks = lookback): number | null {
  const from = Math.max(0, i - lookback + 1);
  if (i - from + 1 < minWeeks) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let k = from; k <= i; k++) {
    if (values[k] < min) min = values[k];
    if (values[k] > max) max = values[k];
  }
  if (max === min) return 50;
  return +(((values[i] - min) / (max - min)) * 100).toFixed(1);
}

/**
 * สัปดาห์สุดท้ายยังไม่จบหรือไม่ — จบแล้วเมื่อวันสุดท้ายเป็นวันศุกร์ หรือจำนวนวันทำการเท่ากับสัปดาห์ปกติ (สูงสุดของ 8 สัปดาห์ก่อน)
 * ไม่จบ → ตารางใช้สัปดาห์ก่อนหน้า เพื่อไม่เทียบสัปดาห์ 2 วันกับสัปดาห์เต็ม
 */
export function isPartialWeek(weeks: FlowWeek[]): boolean {
  if (weeks.length < 2) return false;
  const last = weeks[weeks.length - 1];
  if (new Date(`${last.date}T00:00:00Z`).getUTCDay() === 5) return false;
  const typical = Math.max(...weeks.slice(-9, -1).map((w) => w.days));
  return last.days < typical;
}

/** ผลรวมรายวันตามช่วงเวลา (ข้อมูลไม่พอ = null) */
function periodSlices(days: FlowBar[]): Array<FlowBar[] | null> {
  const n = days.length;
  const year = days[n - 1].date.slice(0, 4);
  return PERIOD_DEFS.map((p) => {
    if (p.days === null) return days.slice(days.findIndex((d) => d.date.slice(0, 4) === year));
    return n >= p.days ? days.slice(n - p.days) : null;
  });
}

const sum = (xs: FlowBar[], f: (b: FlowBar) => number) => xs.reduce((a, b) => a + f(b), 0);

function periodRows(entity: FlowEntity, days: FlowBar[]): FlowPeriodRow[] {
  const slices = periodSlices(days);
  const each = (f: (s: FlowBar[]) => number) => slices.map((s) => (s ? f(s) : null));
  const rows: FlowPeriodRow[] = entity.groups.map((g) => ({
    key: g,
    label: FLOW_LABEL[g],
    kind: 'net' as const,
    values: each((s) => sum(s, (b) => netCents(b, g)) / 100),
  }));
  if (entity.kind === 'stock') {
    rows.push({ key: 'short', label: 'Short sale', kind: 'value', values: each((s) => sum(s, (b) => cents(b.short ?? 0)) / 100) });
    rows.push({
      key: 'shortPct',
      label: 'Short sale % ของมูลค่า',
      kind: 'pct',
      values: each((s) => {
        const v = sum(s, (b) => cents(b.value));
        return v > 0 ? +((sum(s, (b) => cents(b.short ?? 0)) / v) * 100).toFixed(2) : 0;
      }),
    });
  }
  rows.push({ key: 'value', label: 'มูลค่าซื้อขายรวม', kind: 'value', values: each((s) => sum(s, (b) => cents(b.value)) / 100) });
  return rows;
}

function tableRow(g: FlowGroup, cur: FlowWeek, prev: FlowWeek): FlowTableRow {
  const c = cur.groups[g] ?? { buy: 0, sell: 0 };
  const p = prev.groups[g] ?? { buy: 0, sell: 0 };
  const net = cents(c.buy) - cents(c.sell);
  const prevNet = cents(p.buy) - cents(p.sell);
  return {
    key: g,
    label: FLOW_LABEL[g],
    buy: c.buy,
    sell: c.sell,
    net: net / 100,
    changeBuy: (cents(c.buy) - cents(p.buy)) / 100,
    changeSell: (cents(c.sell) - cents(p.sell)) / 100,
    changeNet: (net - prevNet) / 100,
    pctBuy: pct(c.buy, cur.value),
    pctSell: pct(c.sell, cur.value),
  };
}

const fmt = (v: number) => Math.round(Math.abs(v)).toLocaleString('en-US');
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(v)}`;
const side = (v: number) => (v >= 0 ? 'ซื้อ' : 'ขาย');
/** ต่อคำไทยกับชื่อ: เว้นวรรคเมื่อฝั่งใดเป็นอักษรละติน/ตัวเลข (เช่น "ของ NVDR", "NVDR ซื้อ") ไม่เว้นเมื่อเป็นไทยล้วน */
const sp = (a: string, b: string) => (/[A-Za-z0-9)]$/.test(a) || /^[A-Za-z0-9(]/.test(b) ? `${a} ${b}` : `${a}${b}`);
export function flowZone(v: number): string {
  return v >= 80 ? 'สะสมใกล้สูงสุดของกรอบ — แรงซื้อต่อเนื่อง' : v <= 20 ? 'สะสมใกล้ต่ำสุดของกรอบ — แรงขายต่อเนื่อง' : 'อยู่กลางกรอบ — ยังไม่มีทิศชัด';
}

/** จำนวนสัปดาห์ที่ครบติดกันจนถึงสัปดาห์ของตารางที่สุทธิเครื่องหมายเดียวกัน + ผลรวม */
function streak(series: FlowSeriesPoint[], g: FlowGroup, lastIdx: number): { n: number; sum: number } {
  const first = series[lastIdx]?.net[g] ?? 0;
  if (first === 0) return { n: 0, sum: 0 };
  let n = 0;
  let sum = 0;
  for (let i = lastIdx; i >= 0; i--) {
    const v = series[i].net[g] ?? 0;
    if (Math.sign(v) !== Math.sign(first)) break;
    n++;
    sum += v;
  }
  return { n, sum };
}

/** สรุป 3–4 ประโยคจากตัวเลขของแดชบอร์ด (กฎตายตัว — ทดสอบได้ ไม่เดาเกินข้อมูล) */
export function buildInsights(d: Omit<FlowDashboard, 'insights'>): string[] {
  const out: string[] = [];
  const week = thSpan(d.week.start, d.week.end);
  const lastIdx = d.series.findIndex((p) => p.date === d.week.end);
  const ytdCol = d.periods.columns.findIndex((c) => c.key === 'YTD');
  const ytd = d.periods.rows.filter((r) => r.kind === 'net').map((r) => ({ key: r.key as FlowGroup, label: r.label, v: r.values[ytdCol] ?? 0 }));
  const idx = d.indexGroup;
  const idxLabel = FLOW_LABEL[idx];
  if (d.entity.kind === 'market') {
    const rows = [...d.table.rows].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const top = rows[0];
    const opp = rows.find((r) => Math.sign(r.net) === -Math.sign(top.net));
    out.push(
      `สัปดาห์ ${week}: ${sp(top.label, side(top.net))}สุทธิมากที่สุด ${fmt(top.net)} ล้านบาท` +
        (opp ? ` ${sp(sp('โดยมี', opp.label), 'เป็นฝั่งตรงข้ามหลัก')} (${signed(opp.net)} ล้านบาท)` : ''),
    );
  } else {
    const n = d.table.rows.find((r) => r.key === 'nvdr');
    if (n) {
      const pct = d.table.value > 0 ? (Math.abs(n.net) / d.table.value) * 100 : 0;
      out.push(`สัปดาห์ ${week}: NVDR ${side(n.net)}สุทธิ ${fmt(n.net)} ล้านบาท (${pct.toFixed(1)}% ของมูลค่าซื้อขาย) เทียบสัปดาห์ก่อน ${signed(n.changeNet)} ล้านบาท`);
    }
    if (d.short) {
      const diff = d.short.pctValue - d.short.avgPct13w;
      out.push(
        `Short sale ${d.short.pctValue.toFixed(1)}% ของมูลค่าซื้อขาย ${Math.abs(diff) < 0.5 ? 'ใกล้ค่าเฉลี่ย' : diff > 0 ? 'สูงกว่าค่าเฉลี่ย' : 'ต่ำกว่าค่าเฉลี่ย'} 13 สัปดาห์ (${d.short.avgPct13w.toFixed(1)}%)`,
      );
    }
  }
  const s = lastIdx >= 0 ? streak(d.series, idx, lastIdx) : { n: 0, sum: 0 };
  if (s.n >= 2) out.push(`${sp(idxLabel, side(s.sum))}สุทธิติดต่อกัน ${s.n} สัปดาห์ รวม ${fmt(s.sum)} ล้านบาท`);
  if (d.entity.kind === 'market' && ytd.length) {
    const buyer = ytd.reduce((a, b) => (b.v > a.v ? b : a));
    const seller = ytd.reduce((a, b) => (b.v < a.v ? b : a));
    if (buyer.v > 0 && seller.v < 0) {
      out.push(`ตั้งแต่ต้นปี: ${sp(buyer.label, 'ซื้อ')}สุทธิมากที่สุด ${fmt(buyer.v)} ล้านบาท · ${sp(seller.label, 'ขาย')}สุทธิมากที่สุด ${fmt(seller.v)} ล้านบาท`);
    }
  } else {
    const y = ytd.find((r) => r.key === 'nvdr');
    if (y) out.push(`ตั้งแต่ต้นปี NVDR ${side(y.v)}สุทธิรวม ${fmt(y.v)} ล้านบาท`);
  }
  out.push(`${sp('Flow Index 6 เดือนของ', idxLabel)} = ${d.flowIndex.m6.toFixed(0)} (${flowZone(d.flowIndex.m6)}) · 36 เดือน = ${d.flowIndex.m36.toFixed(0)}`);
  return out;
}

export function buildFlowDashboard(
  entity: FlowEntity,
  days: FlowBar[],
  range: FlowRange,
  indexGroup: FlowGroup,
  source: FlowSource,
): FlowDashboard {
  const weeks = aggregateWeeks(days);
  const partial = isPartialWeek(weeks);
  const ci = partial ? weeks.length - 2 : weeks.length - 1; // สัปดาห์ของตาราง
  if (ci < 1) throw new Error('ประวัติเงินไหลไม่พอ (ต้องมีอย่างน้อย 2 สัปดาห์ที่ครบ)');
  const cur = weeks[ci];
  const prev = weeks[ci - 1];
  const W = weeks.length;

  // เงินไหลสะสมตลอดประวัติของกลุ่มที่ใช้ทำ Flow Index (หน่วยสตางค์ล้าน → ไม่มีเศษทศนิยมสะสม)
  const cumAll: number[] = [];
  let run = 0;
  for (const w of weeks) {
    run += netCents(w, indexGroup);
    cumAll.push(run);
  }

  const from = Math.max(0, W - RANGE_WEEKS[range]);
  const running = new Map<FlowGroup, number>(entity.groups.map((g) => [g, 0]));
  const series: FlowSeriesPoint[] = [];
  for (let i = from; i < W; i++) {
    const w = weeks[i];
    const net: FlowSeriesPoint['net'] = {};
    const cum: FlowSeriesPoint['cum'] = {};
    for (const g of entity.groups) {
      const n = netCents(w, g);
      running.set(g, (running.get(g) ?? 0) + n);
      net[g] = n / 100;
      cum[g] = (running.get(g) ?? 0) / 100;
    }
    series.push({
      date: w.date,
      o: w.o,
      h: w.h,
      l: w.l,
      c: w.c,
      value: w.value,
      net,
      cum,
      shortPct: w.short !== null && w.value > 0 ? +((w.short / w.value) * 100).toFixed(2) : null,
      flowIndex6m: flowIndexAt(cumAll, i, LOOKBACK_6M),
      flowIndex36m: flowIndexAt(cumAll, i, LOOKBACK_36M, MIN_WEEKS_36M),
    });
  }

  let short: FlowDashboard['short'] = null;
  if (entity.kind === 'stock' && cur.short !== null && prev.short !== null) {
    const last13 = weeks.slice(Math.max(0, ci - 12), ci + 1);
    const v13 = sum(last13, (w) => cents(w.value));
    short = {
      value: cur.short,
      pctValue: cur.value > 0 ? +((cur.short / cur.value) * 100).toFixed(2) : 0,
      changeValue: (cents(cur.short) - cents(prev.short)) / 100,
      avgPct13w: v13 > 0 ? +((sum(last13, (w) => cents(w.short ?? 0)) / v13) * 100).toFixed(2) : 0,
    };
  }

  const last = weeks[W - 1];
  const dash: Omit<FlowDashboard, 'insights'> = {
    entity,
    range,
    indexGroup,
    source,
    lastDate: days[days.length - 1].date,
    week: { start: cur.start, end: cur.date, days: cur.days },
    prevWeek: { start: prev.start, end: prev.date },
    partialWeek: partial ? { start: last.start, end: last.date, days: last.days } : null,
    series,
    table: {
      rows: entity.groups.map((g) => tableRow(g, cur, prev)),
      value: cur.value,
      changeValue: (cents(cur.value) - cents(prev.value)) / 100,
    },
    periods: { columns: PERIOD_DEFS.map(({ key, label }) => ({ key, label })), rows: periodRows(entity, days) },
    short,
    flowIndex: {
      m6: flowIndexAt(cumAll, W - 1, LOOKBACK_6M) ?? 50,
      m36: flowIndexAt(cumAll, W - 1, LOOKBACK_36M, MIN_WEEKS_36M) ?? 50,
      group: FLOW_LABEL[indexGroup],
      weeks36: Math.min(LOOKBACK_36M, W),
    },
  };
  return { ...dash, insights: buildInsights(dash) };
}
