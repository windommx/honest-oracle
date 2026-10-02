// ============================================================
// เงินไหลตามประเภทนักลงทุน (หุ้นไทย) — type ที่ใช้ร่วมกันทั้ง server และ UI (ไม่มี import ฝั่ง server)
//
// ระดับตลาด (SET): 4 ประเภทตามที่ตลาดหลักทรัพย์ฯ เผยแพร่ทุกวันทำการ
//   นักลงทุนต่างประเทศ · สถาบันในประเทศ · บัญชีบริษัทหลักทรัพย์ · นักลงทุนทั่วไปในประเทศ
// ระดับหุ้นรายตัว: SET ไม่เผยแพร่ประเภทนักลงทุนรายหุ้น → ใช้ NVDR (ตัวแทนแรงซื้อขายของต่างชาติ) เทียบผู้ลงทุนอื่น + Short sale
// เอกลักษณ์ทางบัญชี: Σ ซื้อ = Σ ขาย = มูลค่าซื้อขายรวม · Σ สุทธิ = 0 (ทุกการซื้อมีผู้ขาย) · หน่วยเงิน = ล้านบาท
// ============================================================

export type MarketGroup = 'foreign' | 'institution' | 'prop' | 'retail';
export type StockGroup = 'nvdr' | 'others';
export type FlowGroup = MarketGroup | StockGroup;

export const MARKET_GROUPS: MarketGroup[] = ['foreign', 'institution', 'prop', 'retail'];
export const STOCK_GROUPS: StockGroup[] = ['nvdr', 'others'];

export const FLOW_LABEL: Record<FlowGroup, string> = {
  foreign: 'นักลงทุนต่างประเทศ',
  institution: 'สถาบันในประเทศ',
  prop: 'บัญชีบริษัทหลักทรัพย์',
  retail: 'นักลงทุนทั่วไปในประเทศ',
  nvdr: 'NVDR',
  others: 'ผู้ลงทุนอื่น',
};

/** ชื่อสั้นสำหรับแกนกราฟแท่ง/วงกลม */
export const FLOW_SHORT: Record<FlowGroup, string> = {
  foreign: 'ต่างชาติ',
  institution: 'สถาบัน',
  prop: 'พอร์ต บล.',
  retail: 'รายย่อย',
  nvdr: 'NVDR',
  others: 'อื่น ๆ',
};

export type FlowRange = '6m' | '1y' | '2y' | '3y';
export const FLOW_RANGES: FlowRange[] = ['6m', '1y', '2y', '3y'];

export interface BuySell {
  /** มูลค่าซื้อ (ล้านบาท) */
  buy: number;
  /** มูลค่าขาย (ล้านบาท) */
  sell: number;
}

/** หนึ่งวันทำการ (หรือหนึ่งสัปดาห์หลังรวม) ของหน่วยที่ติดตาม — ตลาดทั้งตลาดหรือหุ้นหนึ่งตัว */
export interface FlowBar {
  /** วันทำการ (รายวัน) หรือวันทำการสุดท้ายของสัปดาห์ (รายสัปดาห์) YYYY-MM-DD */
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  /** มูลค่าซื้อขายรวม (ล้านบาท) = Σ ซื้อ = Σ ขาย */
  value: number;
  groups: Partial<Record<FlowGroup, BuySell>>;
  /** มูลค่า short sale (ล้านบาท) — หุ้นรายตัวเท่านั้น (ส่วนหนึ่งของฝั่งขาย) */
  short: number | null;
}

export interface FlowWeek extends FlowBar {
  /** วันทำการแรกของสัปดาห์ */
  start: string;
  /** จำนวนวันทำการในสัปดาห์ */
  days: number;
}

export interface FlowEntity {
  /** 'SET' หรือสัญลักษณ์หุ้น */
  id: string;
  kind: 'market' | 'stock';
  name: string;
  sector: string | null;
  groups: FlowGroup[];
}

export interface FlowTableRow {
  key: FlowGroup;
  label: string;
  buy: number;
  sell: number;
  net: number;
  changeBuy: number;
  changeSell: number;
  changeNet: number;
  /** % ของมูลค่าซื้อรวม / มูลค่าขายรวม */
  pctBuy: number;
  pctSell: number;
}

export type PeriodKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

export interface FlowPeriodRow {
  key: string;
  label: string;
  /** net = เงินไหลสุทธิ (มีเครื่องหมาย) · value = มูลค่า (ล้านบาท) · pct = ร้อยละ */
  kind: 'net' | 'value' | 'pct';
  /** ค่าตามคอลัมน์ของ periods.columns (null = ข้อมูลไม่พอ) */
  values: Array<number | null>;
}

export interface FlowSeriesPoint {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  value: number;
  /** เงินไหลสุทธิรายสัปดาห์ต่อกลุ่ม (ล้านบาท) */
  net: Partial<Record<FlowGroup, number>>;
  /** เงินไหลสุทธิสะสมตั้งแต่ต้นช่วงที่แสดง (ล้านบาท) */
  cum: Partial<Record<FlowGroup, number>>;
  /** short sale เป็น % ของมูลค่าซื้อขาย (หุ้นรายตัวเท่านั้น) */
  shortPct: number | null;
  /** Flow Index (0–100) ของกลุ่มที่เลือก: ตำแหน่งของเงินไหลสะสมในกรอบ 26 / สูงสุด 156 สัปดาห์ */
  flowIndex6m: number | null;
  flowIndex36m: number | null;
}

export interface FlowSource {
  kind: 'synthetic';
  label: string;
  note: string;
}

export interface FlowDashboard {
  entity: FlowEntity;
  range: FlowRange;
  indexGroup: FlowGroup;
  source: FlowSource;
  /** วันทำการล่าสุดของข้อมูล */
  lastDate: string;
  /** สัปดาห์ของตาราง = สัปดาห์ล่าสุดที่ครบ (สัปดาห์ปัจจุบันที่ยังไม่จบไม่นำมาเทียบกับสัปดาห์เต็ม) */
  week: { start: string; end: string; days: number };
  prevWeek: { start: string; end: string };
  /** สัปดาห์ปัจจุบันยังไม่จบ (แสดงในกราฟเป็นแท่งสุดท้าย) */
  partialWeek: { start: string; end: string; days: number } | null;
  series: FlowSeriesPoint[];
  table: { rows: FlowTableRow[]; value: number; changeValue: number };
  periods: { columns: Array<{ key: PeriodKey; label: string }>; rows: FlowPeriodRow[] };
  short: { value: number; pctValue: number; changeValue: number; avgPct13w: number } | null;
  flowIndex: { m6: number; m36: number; group: string; weeks36: number };
  /** สรุปเป็นประโยคจากตัวเลขบนหน้า (กฎตายตัว ไม่ใช่ LLM) */
  insights: string[];
}

/** รายชื่อสิ่งที่ติดตามได้: ตลาดรวม + หุ้นรายตัวแยกหมวด */
export interface FlowEntitiesResponse {
  lastDate: string;
  market: Array<{ id: string; name: string }>;
  sectors: Array<{ sector: string; stocks: Array<{ id: string; name: string }> }>;
}
