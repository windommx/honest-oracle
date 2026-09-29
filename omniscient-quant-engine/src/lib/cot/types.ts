// ============================================================
// Commitments of Traders (COT) — type ที่ใช้ร่วมกันทั้ง server และ UI (ไม่มี import ฝั่ง server)
// โครงสร้างตามรายงาน CFTC: Legacy (Commercials / Non-commercials = Large Speculators / Non-reportable = Small Traders)
// และ Disaggregated (Producer/Merchant · Swap Dealers · Managed Money · Other Reportables · Non-reportable)
// ============================================================

export type LegacyGroup = 'commercials' | 'largeSpecs' | 'smallTraders';
export type DisaggGroup = 'producer' | 'swap' | 'managed' | 'other' | 'nonrept';
export type CotRange = '6m' | '1y' | '2y' | '3y';
export const COT_RANGES: CotRange[] = ['6m', '1y', '2y', '3y'];

export interface CotPosition {
  long: number;
  short: number;
  /** spread (ถือทั้ง long และ short เท่ากัน) — เฉพาะกลุ่มที่รายงานมี */
  spread: number;
  tradersLong: number;
  tradersShort: number;
  tradersSpread: number;
}

export interface CotWeek {
  /** วันที่ของรายงาน (อังคาร) YYYY-MM-DD */
  date: string;
  price: { o: number; h: number; l: number; c: number };
  openInterest: number;
  legacy: Record<LegacyGroup, CotPosition>;
  disagg: Record<DisaggGroup, CotPosition>;
}

export interface CotMarket {
  id: string;
  name: string;
  group: string;
  exchange: string;
  unit: string;
  /** รายงานจริงของตลาดการเงินใช้ TFF ไม่ใช่ Disaggregated — แสดงหมายเหตุ */
  financial: boolean;
}

export interface CotTableRow {
  key: string;
  label: string;
  long: number;
  short: number;
  spread: number | null;
  changeLong: number;
  changeShort: number;
  changeSpread: number | null;
  pctOiLong: number;
  pctOiShort: number;
  pctOiSpread: number | null;
  tradersLong: number;
  tradersShort: number;
  tradersSpread: number | null;
  net: number;
  /** % เปลี่ยนของ net เทียบสัปดาห์ก่อน (null = สัปดาห์ก่อนเป็น 0) */
  netChangePct: number | null;
}

export interface CotSeriesPoint {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  openInterest: number;
  commercials: number;
  largeSpecs: number;
  smallTraders: number;
  producer: number;
  swap: number;
  managed: number;
  other: number;
  /** COT Index (0–100) ของกลุ่มที่เลือก — lookback 26 / 156 สัปดาห์ */
  cotIndex6m: number | null;
  cotIndex36m: number | null;
}

export interface CotDashboard {
  market: CotMarket;
  range: CotRange;
  indexGroup: LegacyGroup | DisaggGroup;
  source: { kind: 'synthetic' | 'cftc'; label: string; note: string };
  reportDate: string;
  prevReportDate: string;
  series: CotSeriesPoint[];
  legacy: { rows: CotTableRow[]; openInterest: number; changeOi: number };
  disagg: { rows: CotTableRow[]; openInterest: number; changeOi: number };
  cotIndex: { m6: number; m36: number; group: string };
}
