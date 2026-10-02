// ============================================================
// Atlas พฤติกรรมระบบ — type ที่ใช้ร่วมกันทั้ง server และ UI
// ส่องการทำงานของเอนจิน 5 ด่านบนหุ้นไทยผ่าน 6 มุม ตามรูปแบบ "Grid Behavior Atlas":
//  A แผนที่สถานะตลาด (ตำแหน่งบนแผนที่บอกผลของระบบได้ไหม)  · B จังหวะเวลา (สัญญาณเกิดเมื่อไหร่)
//  C ความลึก (สัญญาณพร้อมกันกี่ตัว — หางของการกระจาย)     · D ส่วนผสมของกำไร/ขาดทุน (มาจากไหน กระจุกแค่ไหน)
//  E เริ่มอย่างไร จบอย่างไร (ภาวะตอนเข้า · stop/เป้า/หมดเวลา) · F ทดสอบความฉลาดแบบ walk-forward (AUC + ปรับคันโยก)
// ทุกข้อสรุปมีช่วงความเชื่อมั่นหรือค่า p และบอกตรง ๆ เมื่อ "ยังสรุปไม่ได้"
// ============================================================

/** ค่าเฉลี่ยพร้อมช่วงความเชื่อมั่น 95% (หน่วยเดียวกับค่าเฉลี่ย) */
export interface AtlasCI {
  mean: number;
  lo: number;
  hi: number;
}

export interface AtlasSection {
  /** ข้อค้นพบ (หัวข้อ) */
  title: string;
  /** ฐานข้อมูล/นิยามของมุมนี้ */
  basis: string;
  /** ย่อหน้าสรุปผลพร้อมตัวเลขสถิติ */
  conclusion: string;
  /** ที่มา: โมดูล/ฟังก์ชันที่คำนวณ */
  source: string;
}

export type EndKey = 'target' | 'stop' | 'timeUp' | 'timeDown' | 'open';

/** ไม้จำลองจากสัญญาณตามกติกา: เข้าที่ราคาปิดวันสัญญาณ · stop = stopHard ของแผน · เป้า = +2R · ถือไม่เกิน 5 วัน */
export interface AtlasTrade {
  date: string;
  symbol: string;
  sector: string;
  kind: 'pullback' | 'momentum';
  cluster: number | null;
  regime: 'risk_on' | 'risk_off';
  end: EndKey;
  /** ผลตอบแทนของไม้ (%) — null = ยังเปิดอยู่ */
  ret: number | null;
  /** ผลเป็นหน่วย R (1R = ระยะจากราคาเข้าถึง stop) */
  r: number | null;
  days: number;
}

export interface AtlasHeader {
  asOf: string;
  start: string;
  end: string;
  nStocks: number;
  nDays: number;
  nSignals: number;
  nClosed: number;
  winRate: number;
  meanRet: number;
  sumRet: number;
  nStops: number;
  backtest: { start: string; end: string; nDays: number; nSignals: number; hitRate: number };
  data: { kind: string; label: string };
}

export interface AtlasStateMap extends AtlasSection {
  features: string[];
  points: Array<{ date: string; x: number; y: number; c: number; outcome: number | null }>;
  clusters: Array<{
    id: number;
    label: string;
    share: number;
    nDays: number;
    nSignals: number;
    /** สัญญาณต่อ 100 หุ้น-วัน */
    signalRate: number;
    winRate: number | null;
    meanRet: number | null;
    /** ส่วนต่างรายวันของโมเดลเฉลี่ย (จุด %) — เฉพาะวันที่อยู่ในช่วง walk-forward */
    spread: number | null;
  }>;
  neighbor: { rho: number; p: number; k: number; exclude: number; n: number };
  featureCorr: Array<{ feature: string; rho: number }>;
  regime: Array<{ key: 'risk_on' | 'risk_off'; label: string; n: number; ci: AtlasCI }>;
}

export interface AtlasTiming extends AtlasSection {
  rows: string[];
  cols: string[];
  /** จำนวนสัญญาณต่อช่อง (วันในสัปดาห์ × เดือน) */
  cells: number[][];
  byWeekday: Array<{ label: string; signals: number; share: number; dayShare: number; winRate: number | null; meanRet: number | null }>;
  byMonth: Array<{ label: string; signals: number; share: number; dayShare: number; winRate: number | null; meanRet: number | null }>;
  /** สหสัมพันธ์ระหว่างจำนวนสัญญาณรายเดือนกับ breadth เฉลี่ยรายเดือน */
  breadthR: number;
  peak: { weekday: string; month: string; n: number } | null;
}

export interface AtlasDepth extends AtlasSection {
  days: Array<{ date: string; n: number; mean7: number }>;
  peaks: Array<{ date: string; n: number; breadth: number; marketRet: number }>;
  monthly: Array<{ month: string; median: number; p90: number; p99: number; max: number }>;
  zeroShare: number;
  meanWhenActive: number;
  max: number;
  crowding: { threshold: number; crowded: { n: number; ci: AtlasCI }; sparse: { n: number; ci: AtlasCI }; diff: AtlasCI };
}

export interface AtlasMix extends AtlasSection {
  sectors: Array<{ key: string; label: string }>;
  months: Array<{
    month: string;
    gain: number;
    loss: number;
    /** สัดส่วน |P&L| ตามหมวด (%) เรียงตาม sectors */
    sectorShare: number[];
    signals: number;
  }>;
  nEff: { gainMonths: number; lossMonths: number; months: number };
  tail: { worstShare: number; bestShare: number; worstN: number };
  totals: { gain: number; loss: number; stopLoss: number; stopShareOfLoss: number };
}

/**
 * คำตัดสินของคันโยก: better/worse = q < 0.1 และ CI 95% ไม่คร่อมศูนย์ · unclear = ยังสรุปไม่ได้
 * same = ไม่เปลี่ยนผลเลยสักวัน (ตัวกรองนั้นไม่เคยเป็นตัวตัดสินในช่วงนี้) · baseline = กติกาปัจจุบัน
 */
export type AtlasVerdict = 'better' | 'worse' | 'unclear' | 'same' | 'baseline';

/** ทางเลือกของกติกาออก (ชุดสัญญาณเดียวกัน) — เทียบผลต่อไม้แบบจับคู่กับกติกาปัจจุบัน */
export interface AtlasExitLever {
  key: string;
  label: string;
  n: number;
  winRate: number;
  stopRate: number;
  /** ผลเฉลี่ยต่อไม้ (%) */
  meanRet: number;
  /** จำนวนวันที่ถือเฉลี่ย · ผลต่อวันที่ถือ (%) — ถือนานขึ้น = ใช้ทุนนานขึ้น */
  days: number;
  perDay: number;
  /** ส่วนต่างต่อไม้เทียบกติกาปัจจุบัน (จุด %) + CI 95% */
  diff: AtlasCI;
  p: number;
  q: number;
  verdict: AtlasVerdict;
}

export interface AtlasLifecycle extends AtlasSection {
  ends: Array<{ key: EndKey; label: string; n: number; share: number }>;
  starts: Array<{ key: string; label: string }>;
  monthlyEnd: Array<{ month: string; counts: Record<EndKey, number> }>;
  monthlyStart: Array<{ month: string; counts: Record<string, number> }>;
  table: Array<{ key: string; label: string; n: number; winRate: number; stopRate: number; meanR: AtlasCI }>;
  byKind: Array<{ key: 'pullback' | 'momentum'; label: string; n: number; winRate: number; stopRate: number; meanR: AtlasCI }>;
  exitLevers: AtlasExitLever[];
}

export interface AtlasLever {
  key: string;
  label: string;
  nSignals: number;
  hitRate: number;
  /** ผลตอบแทนเฉลี่ยรายวันของกลยุทธ์ (bp/วัน) */
  meanDaily: number;
  /** ส่วนต่างเทียบกติกาปัจจุบัน (bp/วัน) พร้อมช่วงความเชื่อมั่น 95% จาก block bootstrap */
  diff: AtlasCI;
  p: number;
  /** p ที่ปรับการทดสอบหลายคันโยกพร้อมกัน (Benjamini–Hochberg) */
  q: number;
  verdict: AtlasVerdict;
}

export interface AtlasIntel extends AtlasSection {
  auc: Array<{ key: string; label: string; auc: number; lo: number; hi: number; p: number; n: number }>;
  levers: AtlasLever[];
  calibration: Array<{ bucket: string; predicted: number; actual: number; n: number }>;
  window: { train: number; test: number; embargo: number; pThr: number; block: number; boot: number };
}

export interface AtlasResponse {
  header: AtlasHeader;
  intro: string;
  stateMap: AtlasStateMap;
  timing: AtlasTiming;
  depth: AtlasDepth;
  mix: AtlasMix;
  lifecycle: AtlasLifecycle;
  intel: AtlasIntel;
  /** ข้อเสนอเพื่อเพิ่มประสิทธิภาพ — สร้างจากผลที่ผ่านเกณฑ์สถิติเท่านั้น (ที่เหลือบอกว่ายังสรุปไม่ได้) */
  actions: Array<{ tone: 'try' | 'keep' | 'watch'; text: string }>;
}
