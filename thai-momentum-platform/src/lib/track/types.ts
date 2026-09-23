// ============================================================
// Track record — ชนิดข้อมูลของ GET /api/track-record (ใช้ร่วม server/UI)
// ทุกตัวเลขที่วัดไม่ได้ = null (UI แสดง "—") · ไม่มีค่าตั้งต้นปลอม
// ============================================================

import type { EvidenceDataLabel } from "@/lib/feed/provenance"

export type TrackStatus = "NO_DATA" | "NO_RUNS" | "OK"

export type TrackVerdict = "NO_DATA" | "NO_RUNS" | "NOT_REAL" | "TOO_EARLY" | "NO_EDGE_YET" | "UNDERPERFORM" | "PROMISING"

export interface NavPoint {
  date: string
  nav: number
  /** equal-weight หุ้นสภาพคล่องผ่านเกณฑ์ (null = วันแรก/ไม่มีหุ้นให้วัด) */
  bench: number | null
  /** สัดส่วนเงินลงทุน ณ ปิดวัน (Σ slots / maxSlots) */
  exposure: number
}

export interface LegRow {
  symbol: string
  status: "open" | "closed" | "orphan"
  source: string
  conf: number
  entryDate: string
  entryPx: number | null
  exitDate: string | null
  exitPx: number | null
  slots: number
  slotsSource: "position" | "snapshot" | "estimated"
  /** ผลตอบแทนสุทธิหลังต้นทุนสองขา (%) จากราคาปิดใน DB — ไม้เปิดใช้ราคาปิดล่าสุด หักต้นทุนขาเข้า */
  netRetPct: number | null
  holdSessions: number | null
  /** ผลที่บันทึกตอนปิดไม้ (Trade.ret) — เทียบกับ netRetPct เพื่อจับข้อมูลราคาที่ถูกแก้ภายหลัง */
  recordedRetPct: number | null
  /** ราคาเข้าที่บันทึกไว้ vs ราคาปิดใน DB วันเดียวกัน (%) — ≠ 0 = ข้อมูลถูกปรับย้อนหลัง */
  entryDriftPct: number | null
}

export interface TrackStats {
  totalReturnPct: number | null
  benchReturnPct: number | null
  excessReturnPct: number | null
  cagrPct: number | null
  benchCagrPct: number | null
  volPct: number | null
  sharpe: number | null
  maxDrawdownPct: number | null
  benchMaxDrawdownPct: number | null
  closedTrades: number
  openTrades: number
  hitRatePct: number | null
  avgWinPct: number | null
  avgLossPct: number | null
  payoff: number | null
  profitFactor: number | null
  /** กำไร/ขาดทุนที่รับรู้แล้ว (% ของทุน โดยประมาณ = Σ น้ำหนัก × ผลสุทธิ) */
  realizedPct: number | null
  unrealizedPct: number | null
  avgExposurePct: number | null
  /** turnover ทางเดียวต่อปี (เท่าของทุน) */
  turnoverAnnual: number | null
  avgHoldSessions: number | null
  /** t-stat ของผลตอบแทนรายวันส่วนเกิน benchmark (null เมื่อ < 20 วัน) */
  tStatExcess: number | null
  /** วันซื้อขายโดยประมาณที่ต้องสะสมให้ t ≈ 2 ถ้า edge ขนาดนี้คงอยู่ (null = ยังไม่มี edge บวก) */
  sessionsForSignificance: number | null
}

export interface TrackDecisionCounts {
  total: number
  runs: number
  entries: number
  exits: number
  tightens: number
  watch: number
  pendingBuys: number
  /** คำสั่งซื้อที่ส่งเข้าคิว T+1 (อัตโนมัติ + มนุษย์อนุมัติ) — ยังไม่ใช่ไม้จนกว่าจะเติม (ledger นับเสมอ · optional ให้ fixture เก่าใช้ได้) */
  queuedOrders?: number
  /** คำสั่งที่ถูกยกเลิกตอนเติม (ไม่มีราคาวันเติม / sector-slot ไม่ผ่าน / มีสถานะแล้ว) */
  cancelledOrders?: number
  human: number
  reversal: number
  shadow: number
  priorEpoch: number
  unmatchedExits: number
  orphanLegs: number
  estimatedSlots: number
  duplicateEntries: number
  untrackedPositions: string[]
}

export interface TrackMode {
  /** LIVE = ทุกรอบตัดสินใจภายในไม่กี่วันหลังวันของข้อมูล · REPLAY = ย้อนหลังทั้งหมด · MIXED = ปน */
  label: "LIVE" | "REPLAY" | "MIXED" | "NONE"
  liveRuns: number
  replayRuns: number
  maxLagDays: number | null
  firstLiveDate: string | null
}

export interface SnapshotCheck {
  count: number
  lastDate: string | null
  lastAt: string | null
  /** snapshot ที่ ledger hash ไม่ตรงกับ Decision ปัจจุบัน = ประวัติการตัดสินใจถูกแก้/ลบหลังบันทึก */
  ledgerMismatches: number
  firstLedgerMismatch: string | null
  navChecked: number
  /** NAV ที่คำนวณใหม่ต่างจากที่บันทึก = ราคาในฐานข้อมูลถูกแก้ย้อนหลัง */
  navMismatches: number
  navSuperseded: number
}

export interface TrackTamper {
  audit: { ok: boolean; total: number; brokenAt: number | null }
  latestEvent: { id: number; kind: string; ts: string; hash: string } | null
  /** sha256 chain ของ Decision ของ Jev ในยุคนี้ (ไม่รวม outcome ที่ /api/verify เติมภายหลัง) */
  ledgerHash: string
  ledgerDecisions: number
  /** id สูงสุดของ Decision ที่อยู่ใน ledgerHash (snapshot ใช้ตรวจย้อนหลัง) */
  ledgerMaxDecisionId: number
  snapshots: SnapshotCheck
}

export interface TrackConfidence {
  tooEarly: boolean
  verdict: TrackVerdict
  label: string
  notes: string[]
  minSessions: number
  minClosedTrades: number
}

export interface TrackRecordResponse {
  generatedAt: string
  status: TrackStatus
  provenance: {
    label: string
    evidenceLabel: EvidenceDataLabel
    isSynthetic: boolean
    latestSource: string | null
    sourceKnown: boolean
    epochStart: string | null
    epochStartEventId: number | null
    epochKind: "seed" | "replace-demo" | null
  }
  liveSince: string | null
  firstRunAt: string | null
  latestDate: string | null
  /** จำนวนวันซื้อขายที่ผ่านไปนับจาก liveSince (จำนวนผลตอบแทนรายวัน) */
  sessions: number
  mode: TrackMode
  nav: NavPoint[]
  stats: TrackStats
  decisions: TrackDecisionCounts
  legs: LegRow[]
  confidence: TrackConfidence
  tamper: TrackTamper
  method: {
    weighting: string
    costPerLegPct: number
    maxSlots: number
    benchmark: string
    prices: string
  }
  notes: string[]
}

/** payload ของ EventLog kind "track_snapshot" (สายพานรายวันบันทึกทุกวันที่ผลเปลี่ยน) */
export interface TrackSnapshotPayload {
  v: 1
  date: string
  nav: number
  bench: number | null
  sessions: number
  liveSince: string | null
  closedTrades: number
  openLegs: { symbol: string; entryDate: string; entryPx: number | null; slots: number }[]
  ledgerHash: string
  maxDecisionId: number
  decisions: number
  evidenceLabel: EvidenceDataLabel
  isSynthetic: boolean
  auditOk: boolean
}
