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

// การเขียนต้องเป็นลำดับเดียว: อ่านหาง chain + insert ต้องไม่ถูกแทรก ไม่งั้นสองเหตุการณ์ที่ยิงพร้อมกัน
// (หลาย route emit พร้อมกันได้) จะอ่าน prevHash ตัวเดียวกัน → chain แตกกิ่ง → audit รายงานว่า "พัง"
// → mutex ระดับ process (เก็บบน globalThis ให้ทุก route/HMR ใช้ตัวเดียวกัน; server เป็น process เดียว)
// หมายเหตุ: ไม่ใช้ interactive transaction — บน Bun ถ้าวิ่งพร้อม query อื่น query engine ของ Prisma ค้าง/panic
const lockHolder = globalThis as unknown as { __eventChainLock?: Promise<void> }

async function appendEvent(kind: string, actor: string, payload: unknown): Promise<void> {
  const payloadStr = JSON.stringify(payload ?? {})
  const last = await db.eventLog.findFirst({ orderBy: { id: "desc" }, select: { hash: true } })
  const prevHash = last?.hash ?? GENESIS
  const ts = new Date()
  const body = JSON.stringify({ kind, actor, payload: payloadStr, ts: ts.toISOString() })
  const hash = sha256(prevHash + body)
  await db.eventLog.create({ data: { kind, actor, payload: payloadStr, prevHash, hash, ts } })
}

// บันทึกเหตุการณ์ (ห้าม throw ทำให้ route หลักพัง — log error แล้วจบ)
export async function emitEvent(kind: string, actor: string, payload: unknown): Promise<void> {
  const prev = lockHolder.__eventChainLock ?? Promise.resolve()
  const run = prev.then(() => appendEvent(kind, actor, payload))
  lockHolder.__eventChainLock = run.catch(() => undefined)
  try {
    await run
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
// ตรวจแบบเดียวกับตอนเขียน (เรียงตาม id): prevHash ที่เก็บต้องชี้ hash ของแถวก่อนหน้า และ hash ต้องคำนวณซ้ำได้
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
    if (e.prevHash !== prev || h !== e.hash) {
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
