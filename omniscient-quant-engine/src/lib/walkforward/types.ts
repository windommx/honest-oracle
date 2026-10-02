// ============================================================
// ทดสอบเดินหน้า (Walk-forward) — type ที่ใช้ร่วมทั้ง server และ UI
// แนวคิดจาก PyBroker: แบ่งข้อมูลเป็นหน้าต่าง train → test เดินหน้าตามเวลา · เลือกพารามิเตอร์ (แบบ Optuna) บน train เท่านั้น
// แล้ววัดผลบน test ที่ยังไม่เคยเห็น · ตารางไม้แบบ result.trades (MAE/MFE) · ช่วงความเชื่อมั่นแบบ bootstrap
// ============================================================

import type { AtlasCI } from '@/lib/atlas/types';
import type { WinFilter } from '@/lib/winrate/types';

/** วิธีเลือกกติกาออกในแต่ละหน้าต่าง (ตั้งไว้ก่อนดูผล) */
export type OptimizerKey = 'locked' | 'maxExp' | 'maxWin' | 'maeMfe';

export interface WfExit {
  targetR: number | null;
  stopMult: number;
  holdDays: number;
  filter: WinFilter;
}

export interface WfPick {
  exit: WfExit;
  label: string;
  /** ไม่มี config ผ่านเกณฑ์ใน train → ใช้กติกาที่ล็อก */
  fallback: boolean;
  /** ผลในหน้าต่าง train (in-sample) */
  isTrades: number;
  isWin: number | null;
  isExp: number | null;
  /** ผลในหน้าต่าง test (out-of-sample) */
  oosTrades: number;
  oosWin: number | null;
  oosExp: number | null;
  /** การสุ่มเข้าในหน้าต่าง test ด้วยกติกาออกเดียวกัน */
  randWin: number | null;
  randExp: number | null;
}

export interface WfFold {
  index: number;
  /** ช่วงวันของสัญญาณที่ใช้ train (เริ่มจากต้นหน้าต่างเสมอ = anchored) */
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  trainSignals: number;
  testSignals: number;
  picks: Record<OptimizerKey, WfPick>;
}

export interface WfOptimizer {
  key: OptimizerKey;
  label: string;
  description: string;
  /** ไม้ที่ปิดแล้วในหน้าต่าง test ทั้งหมด */
  trades: number;
  wins: number;
  winRate: number | null;
  wilson: { lo: number; hi: number } | null;
  /** ผลสุทธิเฉลี่ยต่อไม้ (%) + CI 95% แบบ cluster-robust รายสัปดาห์ */
  expectancy: AtlasCI | null;
  meanRNet: number | null;
  /** ผลรวมของผลต่อไม้ (จุด %) — ไม้ละเท่ากัน ไม่ใช่ % ของพอร์ต */
  sumPct: number;
  profitFactor: number | null;
  /** CI 95% ของ profit factor จาก bootstrap แบบสุ่มทั้งสัปดาห์ */
  pfCI: { lo: number; hi: number } | null;
  /** drawdown สูงสุดของผลรวมต่อไม้ (จุด %) ตามลำดับเวลาจริง */
  maxDD: number | null;
  /** drawdown ที่เกิดได้ 95% (bootstrap สลับลำดับสัปดาห์) */
  maxDD95: number | null;
  random: { winRate: number | null; expectancy: number | null };
  /** ผลสุทธิต่อไม้เหนือการสุ่ม (จุด %) */
  excess: AtlasCI | null;
  pExcess: number | null;
  /** ผลต่อสัญญาณเทียบกติกาที่ล็อก (จุด %) — ไม่ได้ของ/ยังไม่ปิด/ถูกกรอง = 0 */
  vsLocked: AtlasCI | null;
  pVsLocked: number | null;
  /** p หลังปรับ Holm ข้าม 3 วิธีที่เทียบกับกติกาที่ล็อก */
  pVsLockedAdj: number | null;
  /** ผลในตัวอย่างเฉลี่ยของ config ที่ถูกเลือก (ถ่วงด้วยไม้) */
  isExpectancy: number | null;
  /** walk-forward efficiency = ผลนอกตัวอย่าง ÷ ผลในตัวอย่าง */
  wfe: number | null;
}

export interface WfCurve {
  key: OptimizerKey | 'random';
  label: string;
  points: Array<{ date: string; cum: number }>;
}

/** หนึ่งไม้นอกตัวอย่าง — คอลัมน์ตามตาราง result.trades ของ PyBroker */
export interface WfTrade {
  optimizer: OptimizerKey;
  fold: number;
  symbol: string;
  kind: 'pullback' | 'momentum';
  signalDate: string;
  entryDate: string;
  exitDate: string;
  entry: number;
  exit: number;
  retNetPct: number;
  rNet: number;
  cumPct: number;
  bars: number;
  pctPerBar: number;
  exitKind: 'target' | 'stop' | 'time';
  maeR: number | null;
  mfeR: number | null;
  config: string;
}

export interface WfQuantiles {
  n: number;
  maeP50: number | null;
  maeP75: number | null;
  maeP95: number | null;
  mfeP50: number | null;
  mfeP75: number | null;
  mfeP95: number | null;
  /** E-ratio = MFE เฉลี่ย ÷ MAE เฉลี่ย (> การสุ่ม = จังหวะเข้ามีความได้เปรียบ) */
  eRatio: number | null;
}

export interface WfMaeMfe {
  horizon: number;
  wideStop: number;
  signal: WfQuantiles;
  random: WfQuantiles;
  byHorizon: Array<{ horizon: number; signal: number | null; random: number | null }>;
  /** จุดของแผนภาพกระจาย (หน่วย R ของ stop ในแผน) */
  points: Array<{ mae: number; mfe: number; win: boolean }>;
  /** กติกาจากข้อความต้นแบบ (SL = MAE p95 · TP = MFE p75) ถ้าคำนวณจากทั้งหน้าต่าง — แสดงเท่านั้น ไม่ใช้วัดผล */
  fullWindowRule: { stopMult: number; targetR: number } | null;
}

export interface WfTrap {
  key: string;
  title: string;
  status: 'ok' | 'warn' | 'block' | 'info';
  detail: string;
}

/** evidence = มีวิธีที่ทำกำไรสุทธิและเหนือการสุ่มนอกตัวอย่างอย่างมีนัย · worse = ทุกวิธีแย่กว่าการสุ่มอย่างมีนัย · none = ยังสรุปไม่ได้ */
export type WfLevel = 'evidence' | 'none' | 'worse';

export interface WalkforwardResponse {
  data: { kind: string; label: string };
  window: {
    start: string;
    end: string;
    signals: number;
    folds: number;
    /** สัดส่วนสัญญาณแรกที่ใช้เป็นหน้าต่าง train เริ่มต้น */
    initialShare: number;
    embargo: number;
    minTrain: number;
    randomPerSignal: number;
    configs: number;
  };
  costPct: number;
  locked: WfExit & { label: string };
  folds: WfFold[];
  optimizers: WfOptimizer[];
  curves: WfCurve[];
  trades: WfTrade[];
  maeMfe: WfMaeMfe;
  verdict: { level: WfLevel; title: string; reasons: string[] };
  traps: WfTrap[];
  bridge: { rows: number; symbols: number; signals: number; pybroker: string };
  method: string[];
}
