// ============================================================
// ActionLog — บันทึกการกระทำที่เปลี่ยนข้อมูล/ใช้ทรัพยากร (journal, seed, ingest, ล็อกกติกา, เรียก LLM)
// เก็บใน DB (ตาราง ActionLog) เพื่อดูย้อนหลังได้ที่ GET /api/audit-log — ไม่เก็บ body ทั้งก้อน เก็บสรุปที่ route ส่งมา
// เขียนแบบไม่บล็อก (fire-and-forget) — ล้มเหลวแล้ว log เป็น warn ไม่ทำให้คำขอหลักพัง
// ============================================================

import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { log } from "@/lib/log"
import { requestActor } from "@/lib/security/request-actor"

export type ActionName =
  | "journal.create" | "journal.update" | "journal.delete" | "journal.seed"
  | "data.seed" | "data.ingest" | "rules.register" | "audit.run" | "synthesis.run" | "analyst.chat" | "research.deep"

/** คืน Promise ที่ไม่มีวัน reject — route เรียกแบบ `void logAction(...)` (ไม่รอ) · test รอได้ */
export function logAction(req: Request, action: ActionName, status: number, detail?: Record<string, unknown>): Promise<void> {
  let path = "?"
  try {
    path = new URL(req.url).pathname
  } catch {}
  let actor = "unknown"
  try {
    actor = requestActor(req)
  } catch {}
  const fail = (e: unknown) => log.warn("action log write failed", { action, error: (e as Error)?.message ?? String(e) })
  try {
    // ผ่าน JSON ก่อน: ค่าที่เก็บ = ค่าที่ JSON แทนได้จริง · object วนซ้ำ/BigInt ล้มทันที (ไม่ปล่อยให้ Prisma วนจน stack ล้น)
    const safe = detail === undefined ? undefined : (JSON.parse(JSON.stringify(detail)) as Prisma.InputJsonValue)
    return db.actionLog
      .create({ data: { actor, action, method: req.method, path, status, detail: safe } })
      // detail ซ้อนใน key ของตัวเอง — ค่าใน detail (เช่น status ของ journal) ทับ status ของ HTTP ไม่ได้
      .then(() => log.info("action", { actor, action, method: req.method, path, status, detail }))
      .catch(fail)
  } catch (e) {
    // serialize detail ไม่ได้ตั้งแต่ตอนเรียก (เช่น object วนซ้ำ) — ไม่ให้ log ทำคำขอหลักพัง
    fail(e)
    return Promise.resolve()
  }
}
