// ============================================================
// สร้างข้อมูลแดชบอร์ด COT จากประวัติรายงาน (pure — ทดสอบได้)
// ตาราง Legacy / Disaggregated ของสัปดาห์ล่าสุด + การเปลี่ยนแปลงจากสัปดาห์ก่อน + % ของ OI
// อนุกรมตามช่วงที่เลือก (6m/1y/2y/3y) + COT Index (Williams): (net − min) / (max − min) × 100 ย้อนหลัง 26 / 156 สัปดาห์
// ============================================================

import type {
  CotDashboard,
  CotPosition,
  CotRange,
  CotSeriesPoint,
  CotTableRow,
  CotWeek,
  DisaggGroup,
  LegacyGroup,
} from './types';
import type { MarketSpec } from './markets';

export const RANGE_WEEKS: Record<CotRange, number> = { '6m': 26, '1y': 52, '2y': 104, '3y': 156 };
export const LOOKBACK_6M = 26;
export const LOOKBACK_36M = 156;

export const LEGACY_LABEL: Record<LegacyGroup, string> = {
  commercials: 'Commercials',
  largeSpecs: 'Large Speculators',
  smallTraders: 'Small Traders',
};
export const DISAGG_LABEL: Record<DisaggGroup, string> = {
  producer: 'Producer/Merchant',
  swap: 'Swap Dealers',
  managed: 'Managed Money',
  other: 'Other Reportables',
  nonrept: 'Nonreportable',
};

const net = (p: CotPosition) => p.long - p.short;

/** COT Index ของค่า values[i] เทียบ lookback สัปดาห์ (รวมสัปดาห์นั้น) — null เมื่อประวัติไม่พอ */
export function cotIndexAt(values: number[], i: number, lookback: number): number | null {
  if (i < lookback - 1) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let k = i - lookback + 1; k <= i; k++) {
    if (values[k] < min) min = values[k];
    if (values[k] > max) max = values[k];
  }
  if (max === min) return 50;
  return +(((values[i] - min) / (max - min)) * 100).toFixed(1);
}

const pct = (x: number, oi: number) => (oi > 0 ? +((x / oi) * 100).toFixed(1) : 0);

function row(key: string, label: string, cur: CotPosition, prev: CotPosition, oi: number, hasSpread: boolean, hasTraders: boolean): CotTableRow {
  const n = net(cur);
  const pn = net(prev);
  return {
    key,
    label,
    long: cur.long,
    short: cur.short,
    spread: hasSpread ? cur.spread : null,
    changeLong: cur.long - prev.long,
    changeShort: cur.short - prev.short,
    changeSpread: hasSpread ? cur.spread - prev.spread : null,
    pctOiLong: pct(cur.long, oi),
    pctOiShort: pct(cur.short, oi),
    pctOiSpread: hasSpread ? pct(cur.spread, oi) : null,
    tradersLong: hasTraders ? cur.tradersLong : 0,
    tradersShort: hasTraders ? cur.tradersShort : 0,
    tradersSpread: hasSpread && hasTraders ? cur.tradersSpread : null,
    net: n,
    netChangePct: pn !== 0 ? +(((n - pn) / Math.abs(pn)) * 100).toFixed(1) : null,
  };
}

function groupNet(w: CotWeek, g: LegacyGroup | DisaggGroup): number {
  return g in w.legacy ? net(w.legacy[g as LegacyGroup]) : net(w.disagg[g as DisaggGroup]);
}

export function buildCotDashboard(
  spec: MarketSpec,
  history: CotWeek[],
  range: CotRange,
  indexGroup: LegacyGroup | DisaggGroup = 'commercials',
  source: CotDashboard['source'],
): CotDashboard {
  if (history.length < 2) throw new Error('ประวัติรายงาน COT ไม่พอ (ต้อง ≥ 2 สัปดาห์)');
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const nets = history.map((w) => groupNet(w, indexGroup));
  const n = history.length;
  const from = Math.max(0, n - RANGE_WEEKS[range]);
  const series: CotSeriesPoint[] = [];
  for (let i = from; i < n; i++) {
    const w = history[i];
    series.push({
      date: w.date,
      o: w.price.o,
      h: w.price.h,
      l: w.price.l,
      c: w.price.c,
      openInterest: w.openInterest,
      commercials: net(w.legacy.commercials),
      largeSpecs: net(w.legacy.largeSpecs),
      smallTraders: net(w.legacy.smallTraders),
      producer: net(w.disagg.producer),
      swap: net(w.disagg.swap),
      managed: net(w.disagg.managed),
      other: net(w.disagg.other),
      cotIndex6m: cotIndexAt(nets, i, LOOKBACK_6M),
      cotIndex36m: cotIndexAt(nets, i, LOOKBACK_36M),
    });
  }
  const oi = last.openInterest;
  const legacyRows = (Object.keys(LEGACY_LABEL) as LegacyGroup[]).map((g) =>
    row(g, LEGACY_LABEL[g], last.legacy[g], prev.legacy[g], oi, g === 'largeSpecs', g !== 'smallTraders'),
  );
  const disaggRows = (Object.keys(DISAGG_LABEL) as DisaggGroup[]).map((g) =>
    row(g, DISAGG_LABEL[g], last.disagg[g], prev.disagg[g], oi, g === 'swap' || g === 'managed' || g === 'other', g !== 'nonrept'),
  );
  return {
    market: { id: spec.id, name: spec.name, group: spec.group, exchange: spec.exchange, unit: spec.unit, financial: spec.financial },
    range,
    indexGroup,
    source,
    reportDate: last.date,
    prevReportDate: prev.date,
    series,
    legacy: { rows: legacyRows, openInterest: oi, changeOi: oi - prev.openInterest },
    disagg: { rows: disaggRows, openInterest: oi, changeOi: oi - prev.openInterest },
    cotIndex: {
      m6: cotIndexAt(nets, n - 1, LOOKBACK_6M) ?? 50,
      m36: cotIndexAt(nets, n - 1, LOOKBACK_36M) ?? 50,
      group: indexGroup in LEGACY_LABEL ? LEGACY_LABEL[indexGroup as LegacyGroup] : DISAGG_LABEL[indexGroup as DisaggGroup],
    },
  };
}
