// ============================================================
// Track snapshot — บันทึกสภาพ track record ลง EventLog (hash chain) ทุกวันที่ผลเปลี่ยน
//
// ทำไม: Decision/Position/Trade ไม่ได้อยู่ใน hash chain → แก้ย้อนหลังได้เงียบ ๆ
// snapshot เก็บ ledger hash (sha256 chain ของ Decision) + NAV + ขนาดไม้เปิด ลง EventLog ที่แก้ไม่ได้
// → GET /api/track-record ตรวจย้อนหลังได้ว่าประวัติการตัดสินใจ/ราคา ถูกแก้หลังบันทึกหรือไม่
// และเก็บ slots ของไม้เปิดไว้ (Trade ไม่มีคอลัมน์ slots) → ไม้ที่ปิดภายหลังไม่ต้องประมาณขนาด
//
// idempotent: วันเดียวกัน + ledger hash เดิม + NAV เดิม = ไม่บันทึกซ้ำ
// ============================================================

import { db } from "@/lib/db"
import { emitEvent } from "@/lib/research/events"
import { buildTrackRecord, parseSnapshotPayload } from "./record"
import type { TrackRecordResponse, TrackSnapshotPayload } from "./types"

export const TRACK_SNAPSHOT_KIND = "track_snapshot"

export interface SnapshotResult {
  emitted: boolean
  reason: string
  payload: TrackSnapshotPayload | null
}

export function snapshotPayloadFrom(rec: TrackRecordResponse): TrackSnapshotPayload | null {
  const last = rec.nav[rec.nav.length - 1]
  if (rec.status !== "OK" || !last) return null
  return {
    v: 1,
    date: last.date,
    nav: last.nav,
    bench: last.bench,
    sessions: rec.sessions,
    liveSince: rec.liveSince,
    closedTrades: rec.stats.closedTrades,
    openLegs: rec.legs
      .filter((l) => l.status === "open")
      .map((l) => ({ symbol: l.symbol, entryDate: l.entryDate, entryPx: l.entryPx, slots: l.slots })),
    ledgerHash: rec.tamper.ledgerHash,
    maxDecisionId: rec.tamper.ledgerMaxDecisionId,
    decisions: rec.tamper.ledgerDecisions,
    evidenceLabel: rec.provenance.evidenceLabel,
    isSynthetic: rec.provenance.isSynthetic,
    auditOk: rec.tamper.audit.ok,
  }
}

export async function snapshotTrackRecord(
  opts: { actor?: string; dryRun?: boolean; record?: TrackRecordResponse } = {},
): Promise<SnapshotResult> {
  const rec = opts.record ?? (await buildTrackRecord())
  const payload = snapshotPayloadFrom(rec)
  if (!payload) return { emitted: false, reason: rec.status === "OK" ? "ไม่มีจุด NAV" : `ยังไม่มี track record (${rec.status})`, payload: null }

  const lastEv = await db.eventLog.findFirst({
    where: { kind: TRACK_SNAPSHOT_KIND, ...(rec.provenance.epochStartEventId !== null ? { id: { gt: rec.provenance.epochStartEventId } } : {}) },
    orderBy: { id: "desc" },
    select: { payload: true },
  })
  const prev = lastEv ? parseSnapshotPayload(lastEv.payload) : null
  if (prev && prev.date === payload.date && prev.ledgerHash === payload.ledgerHash && Math.abs(prev.nav - payload.nav) < 1e-9) {
    return { emitted: false, reason: "ไม่เปลี่ยนจาก snapshot ล่าสุด (วันเดียวกัน · ledger hash เดิม · NAV เดิม)", payload }
  }
  if (opts.dryRun) return { emitted: false, reason: "dry-run — ไม่บันทึก", payload }
  await emitEvent(TRACK_SNAPSHOT_KIND, opts.actor ?? "system", payload)
  return { emitted: true, reason: prev ? "ผลเปลี่ยนจาก snapshot ล่าสุด" : "snapshot แรกของยุคข้อมูลนี้", payload }
}
