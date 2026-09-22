// ============================================================
// Event sourcing + hash chain — ทุกเหตุการณ์สำคัญถูกผูกกันด้วย sha256
// hash_n = sha256(hash_{n-1} + body_n) → แอบแก้ log ย้อนหลังไม่ได้โดยไม่พังทั้งสาย
// ============================================================

import { createHash } from "crypto"
import { db } from "@/lib/db"

const GENESIS = "GENESIS"

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

// บันทึกเหตุการณ์ (ห้าม throw ทำให้ route หลักพัง — log error แล้วจบ)
export async function emitEvent(kind: string, actor: string, payload: unknown): Promise<void> {
  try {
    const last = await db.eventLog.findFirst({ orderBy: { id: "desc" }, select: { hash: true } })
    const prevHash = last?.hash ?? GENESIS
    const payloadStr = JSON.stringify(payload ?? {})
    const ts = new Date()
    const body = JSON.stringify({ kind, actor, payload: payloadStr, ts: ts.toISOString() })
    const hash = sha256(prevHash + body)
    await db.eventLog.create({ data: { kind, actor, payload: payloadStr, prevHash, hash, ts } })
  } catch (e) {
    console.error("[events] emit failed:", (e as Error).message)
  }
}

export interface AuditRow {
  id: number
  ts: string
  kind: string
  actor: string
  payload: string
}

export interface AuditResult {
  ok: boolean
  total: number
  brokenAt: number | null
  events: AuditRow[]
}

// ตรวจความถูกต้องของ chain ทั้งหมด + คืนเหตุการณ์ล่าสุด
export async function auditEvents(limit = 50): Promise<AuditResult> {
  const all = await db.eventLog.findMany({ orderBy: { id: "asc" } })
  let prev = GENESIS
  let brokenAt: number | null = null
  for (const e of all) {
    const body = JSON.stringify({
      kind: e.kind,
      actor: e.actor,
      payload: e.payload,
      ts: e.ts.toISOString(),
    })
    const h = sha256(prev + body)
    if (h !== e.hash) {
      brokenAt = e.id
      break
    }
    prev = e.hash
  }
  const recent = await db.eventLog.findMany({ orderBy: { id: "desc" }, take: limit })
  return {
    ok: brokenAt === null,
    total: all.length,
    brokenAt,
    events: recent.map((e) => ({
      id: e.id,
      ts: e.ts.toISOString(),
      kind: e.kind,
      actor: e.actor,
      payload: e.payload,
    })),
  }
}
