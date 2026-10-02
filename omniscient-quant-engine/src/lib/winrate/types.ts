// ============================================================
// ห้องทดลอง "ชนะ 80% อย่างมีนัยสำคัญ" — type ที่ใช้ร่วมทั้ง server และ UI
// "ชนะ" = ไม้ที่ปิดแล้วได้ผลสุทธิหลังค่าธรรมเนียมไป-กลับ > 0
// "มีนัย" = (1) ชนะมากกว่าการสุ่มเข้าแบบเดียวกันอย่างมีนัยหลังปรับการทดสอบหลายแบบ (2) ได้กำไรสุทธิ
//          (3) ผ่านช่วงทดสอบที่ไม่ได้ใช้เลือก (4) ยืนยันด้วยไม้ forward จริงจนครบจำนวนที่คำนวณไว้
// ============================================================

import type { AtlasCI } from '@/lib/atlas/types';

export type WinFilter = 'all' | 'pullback' | 'uncrowded' | 'quality';

export interface WinConfig {
  key: string;
  targetR: number;
  stopMult: number;
  holdDays: number;
  filter: WinFilter;
}

export interface WinStats {
  signals: number;
  filled: number;
  /** % ของคำสั่งที่ได้ของ (ไม่นับคำสั่งที่ยังรอ) */
  fillRate: number | null;
  closed: number;
  wins: number;
  /** อัตราชนะสุทธิ (%) */
  winRate: number | null;
  /** Wilson 95% (%) */
  wilson: { lo: number; hi: number } | null;
  /** อัตราชนะของการสุ่มเข้าแบบเดียวกัน (หุ้นเดียวกัน · ช่วงเวลาเดียวกัน · แผนแบบเดียวกัน · กติกาออกเดียวกัน) (%) */
  baseline: number | null;
  /** ชนะเหนือการสุ่ม (จุด %) + CI 95% แบบ cluster-robust รายสัปดาห์ */
  excess: AtlasCI | null;
  /** p ทางเดียวของ "ชนะเหนือการสุ่ม" */
  pExcess: number | null;
  /** ผลสุทธิเฉลี่ยต่อไม้ (%) + CI 95% */
  expectancy: AtlasCI | null;
  meanRNet: number | null;
  profitFactor: number | null;
  /** อัตราชนะที่ต้องได้เพื่อเท่าทุนด้วยขนาดกำไร/ขาดทุนเฉลี่ยของ config นี้ (%) */
  breakevenWin: number | null;
  deff: number | null;
}

export interface WinRow extends WinConfig {
  discovery: WinStats;
  holdout: WinStats;
  /** q (Benjamini–Hochberg) ของ "ชนะเหนือการสุ่ม" ข้ามทุก config ในช่วงค้นหา · null = ไม้ไม่พอจึงไม่ได้ทดสอบ */
  q: number | null;
}

/** หนึ่ง config ของกริดแบบย่อ (ช่วงค้นหาเท่านั้น) — ใช้วาดแผนภาพกระจาย */
export interface WinCell extends WinConfig {
  n: number;
  win: number | null;
  base: number | null;
  excess: number | null;
  p: number | null;
  q: number | null;
  exp: number | null;
}

export interface WinCurvePoint {
  targetR: number;
  signalWin: number | null;
  randomWin: number | null;
  signalExp: number | null;
  randomExp: number | null;
  closed: number;
}

/** เส้นอัตราชนะ/ผลสุทธิตามระยะเป้า ของหนึ่งคู่ stop × วันถือ (ทุกสัญญาณ · ทั้งหน้าต่าง) */
export interface WinCurve {
  stopMult: number;
  holdDays: number;
  points: WinCurvePoint[];
}

export type PlanStatus = 'ok' | 'warn' | 'block' | 'wait';

/**
 * none = ไม่มี config ผ่านช่วงค้นหา · discovery = ผ่านช่วงค้นหาแต่ตกช่วงทดสอบ · holdout = ผ่านทั้งสองช่วง รอ forward
 * rejected = forward ครบแล้วแต่ไม่ยืนยัน · confirmed = forward ยืนยันแล้ว
 */
export type WinLevel = 'none' | 'discovery' | 'holdout' | 'rejected' | 'confirmed';

export interface WinPlanStep {
  key: 'data' | 'search' | 'holdout' | 'lock' | 'forward' | 'decide';
  title: string;
  status: PlanStatus;
  detail: string;
}

export interface WinrateResponse {
  /** เป้าอัตราชนะ (%) */
  target: number;
  costPct: number;
  data: { kind: string; label: string };
  window: {
    start: string;
    end: string;
    /** วันแรกของช่วงทดสอบ (holdout) — config ถูกเลือกจากสัญญาณก่อนวันนี้เท่านั้น */
    split: string;
    signals: number;
    discoverySignals: number;
    holdoutSignals: number;
    /** สัญญาณช่วงรอยต่อที่ตัดทิ้ง (ไม้ของมันคร่อมเข้าช่วงทดสอบได้) */
    embargoSignals: number;
    embargo: number;
    randomPerSignal: number;
    years: number;
  };
  grid: { targetsR: number[]; stopMults: number[]; holds: number[]; filters: Array<{ key: WinFilter; label: string }>; configs: number };
  /** กติกาออกที่ล็อกอยู่ตอนนี้ (RULES.execution) + ผลของมันในกริด (ทุกสัญญาณ) */
  current: { targetR: number | null; stopMult: number; holdDays: number; rulesHashShort: string; locked: boolean; matches: boolean; label: string; row: WinRow | null };
  /** อัตราชนะ/ผลสุทธิตามระยะเป้า ทุกคู่ stop × วันถือ — ใช้แสดงกับดักของรูปทรง ไม่ใช้เลือก config */
  curves: WinCurve[];
  cells: WinCell[];
  /**
   * กรวยการคัด: configs = ทั้งกริด · tested = ไม้ปิดพอจึงทดสอบ · reach = ชนะ ≥ เป้า · positive = + ผลสุทธิ > 0
   * candidates = + เหนือการสุ่ม q < FDR · significant = config ใดก็ได้ที่เหนือการสุ่ม q < FDR (ไม่สนอัตราชนะ)
   */
  funnel: { configs: number; tested: number; reach: number; positive: number; candidates: number; significant: number; selected: boolean; holdoutPass: boolean | null };
  /** config ที่ชนะ ≥ เป้าในช่วงค้นหา (เรียงตามชนะเหนือการสุ่ม) — แสดงเฉพาะผลช่วงค้นหา */
  reach: WinRow[];
  selection: { rule: string; candidates: number; selected: WinRow | null; closest: WinRow | null; holdoutPass: boolean | null };
  verdict: { level: WinLevel; title: string; reasons: string[] };
  power: { reference: string | null; p0: number | null; p1: number; nIid: number | null; deff: number; nNeeded: number | null; closedPerYear: number; years: number | null; note: string };
  trap: { config: string; key: string; win: number; baseline: number | null; pVs50: number; pExcess: number | null; expectancy: number | null } | null;
  plan: WinPlanStep[];
  /** ไม้ forward ที่นับได้ของรอบประจำวัน (กติกาออกที่ล็อกอยู่) เทียบอัตราชนะของการสุ่มด้วยกติกาออกเดียวกัน */
  forward: {
    config: string;
    /** กติกาออกที่ล็อกอยู่ = config อ้างอิงของแผน (ไม้ forward จึงนับเข้าการพิสูจน์ 80% ได้) */
    matchesReference: boolean;
    closed: number;
    wins: number;
    winRate: number | null;
    wilson: { lo: number; hi: number } | null;
    baseline: number | null;
    pVsBaseline: number | null;
    needed: number | null;
  };
  method: string[];
}
