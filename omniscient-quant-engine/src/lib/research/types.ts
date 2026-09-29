// ============================================================
// Deep Research — รายงานเชิงลึกรายหุ้นฉบับเดียวที่รวมผลทุกชั้นของระบบ (type ใช้ร่วมกันทั้ง server และ UI)
// ตัวเลขทุกตัวมาจากเอนจินชุดเดียวกับแท็บอื่น (หลอมรวม, Decision, Risk, Meta-Risk, Apex, เงินไหล, Backtest)
// ข้อความสรุปสร้างด้วยกฎตายตัว — LLM (ถ้าตั้งค่า) เป็นแค่ผู้เรียบเรียงเพิ่ม ไม่ใช่ผู้คำนวณ
// ============================================================

export type Stance = 'positive' | 'negative' | 'neutral' | 'abstain' | 'info';

export const STANCE_LABEL: Record<Stance, string> = {
  positive: 'หนุน',
  negative: 'ถ่วง',
  neutral: 'กลาง',
  abstain: 'งดออกเสียง',
  info: 'ข้อมูล',
};

export interface Fact {
  label: string;
  value: string;
  note?: string;
}

export interface ResearchSection {
  key: string;
  title: string;
  /** ชั้นของระบบ เช่น "L1 · G1" */
  layer: string;
  stance: Stance;
  summary: string;
  facts: Fact[];
  bullets: string[];
}

export interface ResearchStrand {
  key: string;
  label: string;
  layer: string;
  vote: 'LONG' | 'SHORT' | 'NEUTRAL';
  weight: number;
  trusted: boolean;
  abstain: boolean;
  value: string;
  detail: string;
}

export type VerdictCode = 'STRONG_LONG' | 'LEAN_LONG' | 'MIXED' | 'LEAN_SHORT' | 'STRONG_SHORT';
export type SignalCode = 'ENTRY_PULLBACK' | 'ENTRY_MOMENTUM' | 'NO_TRADE';

export interface DeepResearchReport {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  /** วันที่ของข้อมูลล่าสุด */
  asOf: string;
  price: number;
  /** ผลตอบแทน (%) */
  change: { d1: number; d5: number; d21: number };
  data: { kind: string; label: string; flowsSimulated: boolean };
  rules: { hashShort: string; version: string; matchesRegistered: boolean };
  verdict: {
    code: VerdictCode;
    label: string;
    action: string;
    score: number;
    agreement: number;
    signal: SignalCode;
    signalLabel: string;
    finalSizePct: number;
    headline: string;
    summary: string;
  };
  kpis: Fact[];
  sections: ResearchSection[];
  strands: ResearchStrand[];
  plan: {
    entryLow: number;
    entryHigh: number;
    trigger: number;
    stopStruct: number;
    stopHard: number;
    cvarSizePct: number;
    finalSizePct: number;
    riskPerTradePct: number;
    failingGates: string[];
    killSwitch: string;
    execution: string[];
  };
  /** สิ่งที่อาจทำให้ข้อสรุปผิด (kill switch, ความเสี่ยงสูงสุด, เงื่อนไขโมเดลตาย, จุดอ่อน) */
  risks: string[];
  roadmap: string[];
  /** Part IV = ก่อนกดซื้อทุกครั้ง · Part V = ตัวระบบและการรับรู้ของผู้เทรด (จากแท็บ Meta-Risk) */
  checklist: Array<{ part: 'IV' | 'V'; question: string; answer: string; pass: boolean | null }>;
  caveats: string[];
}

/** บทเรียบเรียงจาก LLM (เฉพาะเมื่อผู้ดูแลตั้งค่าผู้ให้บริการ) */
export interface ResearchNarrative {
  headline: string;
  summary: string;
  bullCase: string[];
  bearCase: string[];
  watchList: string[];
  conclusion: string;
}
