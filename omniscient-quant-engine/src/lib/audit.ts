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
  | "data.seed" | "data.ingest" | "rules.register" | "audit.run" | "synthesis.run" | "analyst.chat"

/** คืน Promise ที่ไม่มีวัน reject — route เรียกแบบ `void logAction(...)` (ไม่รอ) · test รอได้ */
export function logAction(req: Request, action: ActionName, status: number, detail?: Record<string, unknown>): Promise<void> {
  let path = "?"
  try {
    path = new URL(req.url).pathname
  } catch {}
  const actor = requestActor(req)
  return db.actionLog
    .create({ data: { actor, action, method: req.method, path, status, detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined } })
    .then(() => log.info("action", { actor, action, method: req.method, path, status, ...(detail ?? {}) }))
    .catch((e) => log.warn("action log write failed", { action, error: (e as Error)?.message }))
}
