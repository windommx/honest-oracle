// ============================================================
// กระบวนการทำงานประจำวัน — type ที่ใช้ร่วมทั้ง server และ UI
// วงจรหลังตลาดปิด: ข้อมูล → กติกา → สัญญาณ → บันทึกก่อนตลาดเปิดรอบถัดไป → โบรกเกอร์กระดาษติดตามผล → เทียบความคาดหวัง
// ============================================================

import type { AtlasCI } from '@/lib/atlas/types';
import type { ExitKind, PaperState } from './execution';

export type StepKey = 'data' | 'rules' | 'signals' | 'record' | 'track' | 'evaluate';
/** ok = พร้อม · warn = ทำงานได้แต่มีข้อควรระวัง · block = ต้องแก้ก่อน · wait = รอเวลา/รอข้อมูล */
export type StepStatus = 'ok' | 'warn' | 'block' | 'wait';

export interface WorkflowStep {
  key: StepKey;
  title: string;
  status: StepStatus;
  summary: string;
  detail: string[];
  action: 'lock-rules' | 'run-cycle' | null;
}

/** เหตุผลที่ไม้หนึ่งนับ/ไม่นับเป็นหลักฐาน forward */
export type ForwardReason = 'counted' | 'synthetic' | 'not-locked' | 'pre-lock' | 'rules-changed' | 'late';

export interface LedgerRow {
  id: string | null;
  session: string;
  symbol: string;
  name: string | null;
  kind: 'pullback' | 'momentum';
  order: { type: 'limit' | 'open'; price: number | null; validUntil: string };
  stop: number;
  target: number | null;
  sizePct: number | null;
  probUp: number | null;
  state: PaperState;
  fill: { date: string; price: number } | null;
  exit: { date: string; price: number; kind: ExitKind } | null;
  r: number | null;
  retPct: number | null;
  days: number | null;
  /** สถานะใน journal (PLANNED/EXECUTED/CLOSED/SKIPPED) — null = ยังไม่ได้บันทึก */
  journalStatus: string | null;
  recordedAt: string | null;
  reason: ForwardReason;
}

export interface PaperStats {
  signals: number;
  filled: number;
  /** % ของคำสั่งที่ได้ของ (ไม่นับคำสั่งที่ยังรอ) */
  fillRate: number | null;
  expired: number;
  gaps: number;
  open: number;
  closed: number;
  winRate: number | null;
  meanR: AtlasCI | null;
  meanRet: number | null;
  sumR: number;
  avgDays: number | null;
  byExit: Record<ExitKind, number>;
}

export interface WorkflowAlert {
  level: 'danger' | 'warn' | 'info';
  text: string;
}

export interface WorkflowResponse {
  now: string;
  session: string | null;
  nextSession: string | null;
  /** เส้นตายบันทึกคำสั่งของรอบล่าสุด (เวลาเปิดตลาดรอบถัดไป) */
  deadline: string | null;
  data: { kind: string; label: string; status: string; lagSessions: number | null; expectedSession: string; notes: string[] };
  rules: { hashShort: string; locked: boolean; lockedAt: string | null; lockedHashShort: string | null; matches: boolean };
  steps: WorkflowStep[];
  /** สัญญาณของรอบล่าสุด (บันทึกแล้วหรือยัง) */
  today: LedgerRow[];
  /** ไม้กระดาษทั้งหมดที่รอบประจำวันบันทึกไว้ (ใหม่สุดก่อน) */
  ledger: LedgerRow[];
  forward: { since: string | null; stats: PaperStats; excluded: Record<Exclude<ForwardReason, 'counted'>, number> };
  baseline: {
    start: string | null;
    end: string | null;
    sessions: number;
    stats: PaperStats;
    equity: Array<{ date: string; cumR: number }>;
    note: string;
  };
  comparison: { verdict: 'insufficient' | 'in-line' | 'below' | 'above'; z: number | null; minTrades: number; text: string };
  alerts: WorkflowAlert[];
  lastRun: { at: string; actor: string; session: string | null; recorded: number; resolved: number } | null;
  schedule: { auto: boolean; readyAfter: string; cli: string };
  exec: { orderDays: number; holdDays: number; targetR: number | null };
}

export interface CycleReport {
  session: string;
  dataKind: string;
  recorded: number;
  alreadyRecorded: number;
  resolved: number;
  blocked: string | null;
  tookMs: number;
}
