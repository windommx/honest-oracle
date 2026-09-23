// ============================================================
// ป้ายความเชื่อมั่นทางสถิติของ track record (pure) — ตั้งใจให้ "พูดน้อยกว่าที่ตัวเลขชวนเชื่อ"
//   ลำดับการตัดสิน: ไม่มีข้อมูล → ยังไม่มีรอบ → ข้อมูลไม่ใช่ของจริงล้วน → สั้นเกินไป → t-stat ของส่วนเกิน benchmark
//   ไม่มีป้าย "พิสูจน์แล้ว" — ดีที่สุดคือ PROMISING (ต้องสะสมต่อ out-of-sample)
// ============================================================

import type { EvidenceDataLabel } from "@/lib/feed/provenance"
import type { TrackConfidence, TrackMode, TrackVerdict } from "./types"

/** เกณฑ์ขั้นต่ำก่อนเริ่มตีความผลงาน */
export const MIN_SESSIONS = 60
export const MIN_CLOSED_TRADES = 30
export const T_SIGNIFICANT = 2

const LABELS: Record<TrackVerdict, string> = {
  NO_DATA: "ยังไม่มีข้อมูลตลาด — ยังไม่มี track record",
  NO_RUNS: "ยังไม่มีรอบตัดสินใจของ Jev ในยุคข้อมูลนี้ — ยังไม่มี track record",
  NOT_REAL: "ข้อมูลไม่ใช่ข้อมูลตลาดจริงล้วน — ตัวเลขชุดนี้ไม่ใช่หลักฐานของ edge",
  TOO_EARLY: `ยังเร็วเกินไปที่จะตัดสิน — ต้องมีอย่างน้อย ${MIN_SESSIONS} วันซื้อขาย และ ${MIN_CLOSED_TRADES} เทรดที่ปิดแล้ว`,
  NO_EDGE_YET: `ยังไม่มีหลักฐานว่าชนะ benchmark (|t| < ${T_SIGNIFICANT}) — ผลที่เห็นแยกไม่ออกจากโชค`,
  UNDERPERFORM: `แพ้ benchmark อย่างมีนัยสำคัญ (t ≤ −${T_SIGNIFICANT}) — ทบทวนกลยุทธ์ก่อนเพิ่มเงินจริง`,
  PROMISING: `ชนะ benchmark ที่ t ≥ ${T_SIGNIFICANT} — น่าสนใจแต่ยังไม่ใช่ข้อพิสูจน์: ต้องสะสมต่อ out-of-sample, รวมต้นทุนจริง และไม่เปลี่ยนกติกากลางทาง`,
}

export function assessConfidence(input: {
  hasData: boolean
  runs: number
  evidenceLabel: EvidenceDataLabel
  sessions: number
  closedTrades: number
  tStatExcess: number | null
  mode: TrackMode
  estimatedSlots: number
  untrackedPositions: string[]
  orphanLegs: number
  unpriced: number
}): TrackConfidence {
  const notes: string[] = []
  const tooEarly = input.sessions < MIN_SESSIONS || input.closedTrades < MIN_CLOSED_TRADES
  let verdict: TrackVerdict
  if (!input.hasData) verdict = "NO_DATA"
  else if (input.runs === 0) verdict = "NO_RUNS"
  else if (input.evidenceLabel !== "REAL") verdict = "NOT_REAL"
  else if (tooEarly) verdict = "TOO_EARLY"
  else if (input.tStatExcess === null) verdict = "NO_EDGE_YET"
  else if (input.tStatExcess >= T_SIGNIFICANT) verdict = "PROMISING"
  else if (input.tStatExcess <= -T_SIGNIFICANT) verdict = "UNDERPERFORM"
  else verdict = "NO_EDGE_YET"

  if (input.hasData && input.runs > 0) {
    if (input.evidenceLabel === "SYNTHETIC") notes.push("ราคาทั้งหมดมาจาก demo seed (หุ้นสมมติ) — ใช้ทดสอบระบบเท่านั้น")
    else if (input.evidenceLabel === "MIXED") notes.push("มีข้อมูลจริงปนหุ้นจำลอง (ingest หลัง seed โดยไม่ล้าง demo) — ล้าง demo แล้วเริ่มนับใหม่")
    else if (input.evidenceLabel === "UNVERIFIED_SOURCE") notes.push("มีข้อมูลในยุคนี้จากแหล่งที่ระบบไม่รู้จัก (ไม่ใช่ yahoo/set/settrade/csv) — ยืนยันที่มาก่อนนับเป็นหลักฐาน")
    else if (input.evidenceLabel === "UNKNOWN") notes.push("ตรวจที่มาข้อมูลจาก EventLog ไม่ได้ — ไม่นับเป็นหลักฐาน")
    if (input.sessions < MIN_SESSIONS) notes.push(`มี track record ${input.sessions} วันซื้อขาย (ต้อง ≥ ${MIN_SESSIONS})`)
    if (input.closedTrades < MIN_CLOSED_TRADES) notes.push(`เทรดที่ปิดแล้ว ${input.closedTrades} ไม้ (ต้อง ≥ ${MIN_CLOSED_TRADES}) — hit rate / avg win-loss ยังไม่เสถียร`)
    if (input.mode.replayRuns > 0)
      notes.push(`${input.mode.replayRuns} รอบตัดสินใจช้ากว่าวันของข้อมูลเกิน 4 วัน (replay/backfill) — นับเป็น live out-of-sample ไม่ได้`)
    if (input.estimatedSlots > 0) notes.push(`${input.estimatedSlots} ไม้ใช้ขนาดประมาณจาก conf (Trade ไม่เก็บ slots และไม่มี snapshot ของไม้นั้น)`)
    if (input.untrackedPositions.length > 0)
      notes.push(`สถานะในพอร์ตที่ไม่ได้เข้าโดย Jev ในยุคนี้ ไม่นับใน NAV: ${input.untrackedPositions.slice(0, 8).join(", ")}${input.untrackedPositions.length > 8 ? " …" : ""}`)
    if (input.orphanLegs > 0) notes.push(`${input.orphanLegs} ไม้หายจากพอร์ตโดยไม่มีบันทึกไม้ออก (เช่นถูกล้างโดย replaceDemo) — ไม่นับใน NAV`)
    if (input.unpriced > 0) notes.push(`${input.unpriced} ไม้ไม่มีราคาในฐานข้อมูลปัจจุบัน — ไม่นับใน NAV`)
  }
  return { tooEarly, verdict, label: LABELS[verdict], notes, minSessions: MIN_SESSIONS, minClosedTrades: MIN_CLOSED_TRADES }
}
