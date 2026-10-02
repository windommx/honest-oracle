// ============================================================
// จังหวะตลาด (Market Rhythm) — type ที่ใช้ร่วมกันทั้ง server และ UI
// ดัดแปลงแนวคิดกราฟวิเคราะห์ "จังหวะการทำงาน" 5 แบบ มาใช้กับหุ้นไทยในแพลตฟอร์ม:
//  1) ความพร้อมกัน  → หุ้นที่เคลื่อนแรงพร้อมกัน + ความกว้างของตลาด + ปฏิทิน breadth
//  2) ชั่วโมง × วัน   → ฤดูกาลของผลตอบแทน วันในสัปดาห์ × เดือน
//  3) สัดส่วน model  → สัดส่วนมูลค่าซื้อขายรายหมวด (rolling + รายเดือน + N_eff)
//  4) แผนที่ความหมาย → แผนที่วันซื้อขาย (PCA 2 มิติ + k-means) — วันนี้คล้ายวันแบบไหน
//  5) ใครเริ่ม turn  → อะไรบล็อกสัญญาณ: ด่านแรกที่ไม่ผ่านรายเดือน
// ============================================================

export interface HeatCell {
  /** ค่าเฉลี่ยของช่อง (null = ไม่มีข้อมูล) */
  value: number | null;
  n: number;
}

export interface BreadthDay {
  date: string;
  /** % ของหุ้นที่ปิดเหนือเส้นเฉลี่ย 20 วัน */
  breadth: number;
  breadthMean20: number;
  /** จำนวนหุ้นที่เคลื่อนแรงผิดปกติ (|ผลตอบแทน| > 2σ ของตัวเองใน 60 วันก่อนหน้า) */
  extreme: number;
  extremeMean20: number;
  /** p90 ของจำนวนหุ้นเคลื่อนแรงในเดือนนั้น (เส้นขั้นบันได) */
  extremeP90m: number;
  /** ผลตอบแทน SET proxy วันนั้น (%) */
  marketRet: number;
  riskOff: boolean;
}

export interface BreadthPanel {
  title: string;
  /** บรรทัดตัวเลขสำคัญใต้หัวข้อ (แบบกราฟต้นฉบับ) */
  summary: string;
  basis: string;
  nStocks: number;
  days: BreadthDay[];
  /** วันที่หุ้นเคลื่อนแรงพร้อมกันมากที่สุด (ห่างกันอย่างน้อย 10 วันทำการ) */
  spikes: Array<{ date: string; extreme: number; share: number; marketRet: number; breadth: number }>;
  /** ช่วง regime risk-off ของแพลตฟอร์มในหน้าต่างวิเคราะห์ */
  riskOffSpans: Array<{ start: string; end: string }>;
  /** จุดเปลี่ยน regime ล่าสุดในหน้าต่าง */
  regimeShift: { date: string; to: 'risk_on' | 'risk_off'; daysAgo: number; note: string } | null;
  /** การกระจายของจำนวนหุ้นเคลื่อนแรงต่อวัน รายเดือน */
  monthly: Array<{ month: string; median: number; p90: number; max: number; n: number }>;
  /** breadth เฉลี่ย เดือน × วันในสัปดาห์ (12 เดือนล่าสุด) + ขอบขวา: เฉลี่ยทั้งเดือน | % วันที่ breadth > 50% */
  heat: { rows: string[]; cols: string[]; cells: HeatCell[][]; rowMeta: Array<{ mean: number; pctAbove50: number; n: number }> };
  /** ปฏิทิน breadth รายวัน 52 สัปดาห์ล่าสุด: สัปดาห์ (เริ่มวันจันทร์) × จ.–ศ. · null = ไม่มีวันซื้อขาย */
  calendar: Array<{ week: string; days: Array<{ date: string; breadth: number } | null> }>;
  latest: { date: string; breadth: number; breadthMean20: number; extreme: number };
}

export interface SeasonStat {
  label: string;
  mean: number | null;
  upPct: number | null;
  n: number;
  /** ค่าเฉลี่ย / (SD/√n) — |t| < 2 = แยกไม่ออกจาก noise */
  tStat: number | null;
  /** p ที่ปรับการทดสอบหลายช่องพร้อมกันแล้ว (Benjamini–Hochberg ข้ามทุกเดือน + ทุกวัน) */
  q: number | null;
}

export interface SeasonalityPanel {
  symbol: string;
  label: string;
  title: string;
  summary: string;
  basis: string;
  /** แถว = วันในสัปดาห์ (จ.–ศ.) · คอลัมน์ = เดือน (ม.ค.–ธ.ค.) · ค่า = ผลตอบแทนเฉลี่ยต่อวัน (%) */
  rows: string[];
  cols: string[];
  cells: HeatCell[][];
  byMonth: SeasonStat[];
  byWeekday: SeasonStat[];
  overallMean: number;
  nDays: number;
  start: string;
  end: string;
  /** ช่องที่ค่าเฉลี่ยสูงสุด / ต่ำสุด (เฉพาะช่องที่มี ≥ 5 วัน) */
  maxCell: { r: number; c: number } | null;
  minCell: { r: number; c: number } | null;
}

export interface SectorPanel {
  title: string;
  summary: string;
  basis: string;
  /** ลำดับคงที่ตามจักรวาลหุ้น (สีตามหมวด ไม่ใช่ตามอันดับ) */
  sectors: Array<{ key: string; label: string; nStocks: number }>;
  /** สัดส่วนมูลค่าซื้อขาย rolling 20 วัน (%) เรียงตาม sectors */
  rolling: Array<{ date: string; shares: number[] }>;
  /** รายเดือนล่าสุด: สัดส่วนมูลค่าซื้อขาย vs สัดส่วนขนาดเงินไหลสุทธิสถาบัน (%) + N_eff = 1/Σs² */
  monthly: Array<{
    month: string;
    totalValue: number;
    /** Σ|เงินไหลสุทธิสถาบันของแต่ละหมวด| ทั้งเดือน (ล้านบาท) */
    totalFlow: number | null;
    value: number[];
    flow: number[] | null;
    /** เงินไหลสุทธิสถาบันของหมวด (ล้านบาท, มีเครื่องหมาย) */
    flowNet: number[] | null;
    nEffValue: number;
    nEffFlow: number | null;
  }>;
  latest: { date: string; shares: number[]; nEff: number };
  hasFlows: boolean;
}

export interface DayCluster {
  id: number;
  label: string;
  /** % ของวันทั้งหมด */
  share: number;
  n: number;
  cx: number;
  cy: number;
  /** ผลตอบแทน SET proxy เฉลี่ยของวันในกลุ่ม (%) */
  avgRet: number;
  /** % หุ้นที่ปิดบวกโดยเฉลี่ย */
  pctUp: number;
  /** ผลตอบแทน SET proxy 5 วันถัดไปเฉลี่ย (%) · % ครั้งที่บวก · จำนวนที่คำนวณได้ */
  fwd5: number | null;
  fwdUp: number | null;
  nFwd: number;
  /** ค่ากลางของกลุ่มในหน่วย z (เรียงตาม features) */
  profile: number[];
}

export interface DayMapAxis {
  label: string;
  /** % ความแปรปรวนที่แกนนี้อธิบาย */
  explained: number;
  /** ตัวแปรที่ถ่วงแกนนี้มากที่สุด */
  top: Array<{ feature: string; loading: number }>;
}

export interface DayMapPanel {
  title: string;
  summary: string;
  basis: string;
  features: string[];
  axes: [DayMapAxis, DayMapAxis];
  points: Array<{ date: string; x: number; y: number; c: number }>;
  clusters: DayCluster[];
  /** ค่าฐานของทั้งช่วง (เทียบกับรายกลุ่ม) */
  baseline: { fwd5: number | null; fwdUp: number | null; nFwd: number };
  latest: { date: string; cluster: number; x: number; y: number };
  /** 5 วันทำการล่าสุด (เก่า → ใหม่) — เส้นทางบนแผนที่ */
  recent: Array<{ date: string; c: number; x: number; y: number }>;
}

export type GateBlockKey = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'SIGNAL';

export interface GateBlockCounts {
  total: number;
  counts: Record<GateBlockKey, number>;
  shares: Record<GateBlockKey, number>;
  pullback: number;
  momentum: number;
}

export interface GateBlockPanel {
  /** 'ALL' = ทุกหุ้น · อื่น ๆ = สัญลักษณ์หุ้น */
  scope: string;
  label: string;
  title: string;
  summary: string;
  basis: string;
  categories: Array<{ key: GateBlockKey; label: string; desc: string }>;
  months: Array<GateBlockCounts & { month: string }>;
  overall: GateBlockCounts;
}

export interface RhythmResponse {
  asOf: string;
  start: string;
  nDays: number;
  /** 'SET' = ทั้งตลาด · อื่น ๆ = หุ้นที่เลือก (ใช้กับแผงฤดูกาลและด่านที่บล็อก) */
  symbol: string;
  symbols: Array<{ id: string; name: string; sector: string }>;
  data: { kind: string; label: string };
  breadth: BreadthPanel;
  seasonality: SeasonalityPanel;
  sectors: SectorPanel;
  dayMap: DayMapPanel;
  gates: GateBlockPanel;
}

/** สรุปสั้นสำหรับ Command Center (ไม่ส่งอนุกรมทั้งหมด) */
export interface RhythmSummary {
  asOf: string;
  nStocks: number;
  data: { kind: string; label: string };
  breadth: { value: number; mean20: number; extreme: number };
  dayType: { id: number; label: string; share: number; fwdUp: number | null; baselineUp: number | null; recent: number[] };
  gates: { month: string; top: { key: GateBlockKey; label: string; share: number }; signalShare: number };
  /** หัวข้อ (ข้อค้นพบ) ของทั้ง 5 แผง */
  findings: string[];
}
