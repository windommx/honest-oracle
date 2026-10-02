// ============================================================
// สแกน Neotic 3D — type ที่ใช้ร่วมทั้ง server และ UI
// กติกาตาม locked spec ของผู้ใช้ (ข้อความต้นแบบ "หลอมรวม PyBroker"):
//  RS Rank = เปอร์เซ็นไทล์ทั้งตลาดของ 0.40·ROC63 + 0.20·ROC126 + 0.20·ROC189 + 0.20·ROC252 (× 99)
//  โซน B = RS ≥ 80 และต่ำกว่าจุดสูงสุด 52 สัปดาห์ 5–15% · เขียว = กำไร QoQ > 0 และ YoY > 0 ตามวันประกาศงบ
//  สัญญาณ = โซน B + เขียว + ปริมาณวันนั้น ≥ 2.5 เท่าของค่าเฉลี่ย 50 วันก่อนหน้า
// ============================================================

import type { AtlasCI } from '@/lib/atlas/types';
import type { ExitKind } from '@/lib/workflow/execution';

/** เกณฑ์ 4 ตัวที่ต้นแบบให้จูน (RS_DIV · knee · DIST_B · vol_trigger) */
export interface NeoThresholds {
  rsDiv: number;
  /** ขอบล่างของโซน B (% ต่ำกว่าจุดสูงสุด 52 สัปดาห์) */
  knee: number;
  /** ขอบบนของโซน B (ไม่รวม) */
  distB: number;
  volTrigger: number;
}

/** green = โตทั้ง QoQ และ YoY (ตามสเปก) · mixed = โตด้านเดียว · red = ไม่โตทั้งคู่ · unknown = งบไม่พอ */
export type GrowthStatus = 'green' | 'mixed' | 'red' | 'unknown';

/** B = โซนเข้า · near = RS ผ่านแต่ใกล้จุดสูงสุดเกิน knee · far = RS ผ่านแต่ห่างเกิน DIST_B · weak = RS ไม่ถึง · na = ข้อมูลไม่พอ */
export type NeoZone = 'B' | 'near' | 'far' | 'weak' | 'na';

export interface NeoScanRow {
  symbol: string;
  name: string;
  sector: string;
  close: number;
  /** คะแนน RS ดิบ (% ถ่วงน้ำหนัก) */
  rsRaw: number | null;
  rsRank: number | null;
  /** % ต่ำกว่าจุดสูงสุด 52 สัปดาห์ */
  dist: number | null;
  volRatio: number | null;
  ema20: number | null;
  /** การเติบโตของกำไรสุทธิ (%) จากงบที่ประกาศแล้ว ณ วันนั้น */
  qoq: number | null;
  yoy: number | null;
  period: string | null;
  growth: GrowthStatus;
  zone: NeoZone;
  checks: { rs: boolean; zone: boolean; growth: boolean; volume: boolean };
  signal: boolean;
}

export interface NeoFunnelStep {
  key: 'days' | 'rs' | 'zone' | 'growth' | 'volume';
  label: string;
  /** จำนวนวัน-หุ้นที่ผ่านทุกเงื่อนไขจนถึงขั้นนี้ */
  count: number;
  /** จำนวนวัน-หุ้นที่ผ่านเงื่อนไขนี้เงื่อนไขเดียว (ไม่สนเงื่อนไขอื่น) */
  alone: number | null;
}

export interface NeoFunnel {
  steps: NeoFunnelStep[];
  /** เงื่อนไขที่ตัดสัญญาณมากที่สุด (ขั้นที่เหลือน้อยที่สุดเทียบขั้นก่อน) */
  binding: NeoFunnelStep['key'] | null;
  volume: { days: number; p50: number | null; p90: number | null; p99: number | null; max: number | null; aboveTrigger: number };
  /** จำนวนสัญญาณถ้าเปลี่ยนเกณฑ์ปริมาณ (เงื่อนไขอื่นตามสเปก) */
  byTrigger: Array<{ trigger: number; signals: number; locked: boolean; inGrid: boolean }>;
}

export interface NeoCheck {
  key: string;
  title: string;
  status: 'ok' | 'warn' | 'block' | 'info';
  detail: string;
}

export interface NeoStats {
  /** สัญญาณในขอบเขต (รวมที่ยังไม่ได้ของ/ยังถือ) */
  signals: number;
  /** ไม้ที่ปิดแล้ว */
  trades: number;
  /** ยังถืออยู่ ณ วันสุดท้ายของข้อมูล */
  open: number;
  wins: number;
  winRate: number | null;
  wilson: { lo: number; hi: number } | null;
  /** ผลสุทธิเฉลี่ยต่อไม้ (%) + CI 95% แบบ cluster-robust รายสัปดาห์ */
  expectancy: AtlasCI | null;
  meanRNet: number | null;
  profitFactor: number | null;
  pfCI: { lo: number; hi: number } | null;
  maxDD: number | null;
  maxDD95: number | null;
  avgDays: number | null;
  byExit: Record<ExitKind, number>;
  random: { winRate: number | null; expectancy: number | null };
  /** ผลสุทธิต่อไม้เหนือการสุ่มเข้า (จุด %) */
  excess: AtlasCI | null;
  pExcess: number | null;
}

export interface NeoTrade {
  symbol: string;
  signalDate: string;
  entryDate: string;
  exitDate: string;
  entry: number;
  exit: number;
  retNetPct: number;
  rNet: number;
  days: number;
  exitKind: ExitKind;
  maePct: number | null;
  mfePct: number | null;
  rsRank: number;
  dist: number;
  volRatio: number;
  cumPct: number;
}

export interface NeoFold {
  index: number;
  trainStart: string | null;
  trainEnd: string | null;
  testStart: string;
  testEnd: string;
  trainCandidates: number;
  testCandidates: number;
  pick: NeoThresholds;
  pickLabel: string;
  /** ไม่มีชุดเกณฑ์ที่มีไม้ใน train พอ → ใช้เกณฑ์ตามสเปก */
  fallback: boolean;
  isTrades: number;
  isExp: number | null;
  tuned: { trades: number; win: number | null; exp: number | null };
  locked: { trades: number; win: number | null; exp: number | null };
  randExp: number | null;
}

export interface NeoWalkforward {
  ready: boolean;
  /** เหตุที่ยังเดินหน้าไม่ได้ (ready = false) */
  reason: string | null;
  /** วัน-หุ้นที่ผ่านเกณฑ์หลวมสุดของกริด (ฐานของการตัดหน้าต่าง) */
  candidates: number;
  configs: number;
  folds: NeoFold[];
  locked: NeoStats | null;
  tuned: NeoStats | null;
  /** ผลต่อสัญญาณของเกณฑ์ที่จูน − เกณฑ์ตามสเปก (จุด %) */
  vsLocked: AtlasCI | null;
  pVsLocked: number | null;
  isExpectancy: number | null;
  wfe: number | null;
}

export interface NeoQuantiles {
  n: number;
  maeP50: number | null;
  maeP95: number | null;
  mfeP50: number | null;
  mfeP75: number | null;
  eRatio: number | null;
}

export interface NeoExcursion {
  horizon: number;
  wideStopPct: number;
  signal: NeoQuantiles;
  random: NeoQuantiles;
  /** จุดของแผนภาพกระจาย (% ของราคาได้ของ) */
  points: Array<{ mae: number; mfe: number; win: boolean }>;
  /** SL = MAE p95 · TP = MFE p75 ของทั้งหน้าต่าง (บรรยายเท่านั้น ไม่ใช่ผลนอกตัวอย่าง) */
  suggestion: { stopPct: number; targetPct: number } | null;
}

/** nodata = ประเมินเงื่อนไขไม่ได้ (เช่นไม่มีงบ) · insufficient = สัญญาณน้อยเกินตัดสิน · evidence/none/worse ตามผลเทียบการสุ่ม */
export type NeoLevel = 'nodata' | 'insufficient' | 'evidence' | 'none' | 'worse';

export interface NeoRecent {
  date: string;
  symbol: string;
  rsRank: number;
  dist: number;
  volRatio: number;
  state: 'closed' | 'open' | 'order' | 'gap' | 'expired';
  retNetPct: number | null;
  exitKind: ExitKind | null;
}

export interface NeoticResponse {
  data: { kind: string; label: string };
  asOf: string;
  spec: {
    thresholds: NeoThresholds;
    weights: Array<{ days: number; weight: number }>;
    highWindow: number;
    volWindow: number;
    exits: { stopPct: number; targetPct: number; targetR: number; trailEma: number; maxHold: number; orderDays: number; costPct: number };
    lagDays: number;
    minAnnounceLag: number;
    grid: { rsDiv: number[]; knee: number[]; distB: number[]; volTrigger: number[] };
  };
  window: { start: string; end: string; sessions: number; years: number; stocks: number };
  scan: NeoScanRow[];
  zones: Record<NeoZone, number>;
  recent: NeoRecent[];
  funnel: NeoFunnel;
  readiness: NeoCheck[];
  backtest: { stats: NeoStats; trades: NeoTrade[]; curve: Array<{ date: string; cum: number; random: number | null }> };
  walkforward: NeoWalkforward;
  excursion: NeoExcursion;
  verdict: { level: NeoLevel; title: string; reasons: string[] };
  bridge: { rows: number; symbols: number; signals: number; pybroker: string };
  method: string[];
}
