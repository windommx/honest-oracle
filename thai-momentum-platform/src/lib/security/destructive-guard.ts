// ============================================================
// ด่านก่อนลบข้อมูลทั้งชุด (ผูก DB) — นับสิ่งที่จะหาย → ต้องยืนยัน → สำรอง DB → ค่อยให้ route ลบ
// ใช้ใน: POST /api/seed · POST /api/feed/ingest (replaceDemo) · POST /api/feed/fetch (replaceDemo)
// ============================================================

import path from "node:path"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { appRoot, backupDatabase, isSqliteUrl } from "@/lib/ops/backup"
import { frozenWriteError, liveFreezeFlag } from "@/lib/research/freeze"
import { confirmationRequired, hasConfirmation, wouldDelete, type DestructiveOp, type ExistingData } from "./confirm"

export interface BackupInfo {
  /** path สัมพัทธ์กับโฟลเดอร์แอป (หรือชื่อไฟล์ ถ้าอยู่นอกแอป) */
  file: string
  bytes: number
}

export type GuardOutcome =
  | { ok: true; backup: BackupInfo | null; existing: ExistingData }
  | { ok: false; response: NextResponse }

/** นับแถวที่ op นั้นจะลบ — ตรงกับ seedDemoData (core.ts) / clearDemoMarketData (feed/ingest.ts) */
export async function countExisting(op: DestructiveOp): Promise<ExistingData> {
  const [rawDaily, positions, trades, pendingGates, backtests, decisions, crossAsset] = await Promise.all([
    db.rawDaily.count(),
    db.position.count(),
    db.trade.count(),
    op === "seed" ? db.pendingGate.count() : db.pendingGate.count({ where: { status: "pending" } }),
    db.backtestRun.count(),
    // replaceDemo ไม่ลบ Decision (audit) · CrossAsset ที่ลบเป็นของจำลองเท่านั้น (ของจริงป้าย yahoo ถูกเก็บไว้)
    op === "seed" ? db.decision.count() : Promise.resolve(0),
    op === "seed" ? db.crossAsset.count() : Promise.resolve(0),
  ])
  return { rawDaily, decisions, positions, trades, pendingGates, backtests, crossAsset }
}

function displayPath(file: string): string {
  const rel = path.relative(appRoot(), file)
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : path.basename(file)
}

/**
 * นำเข้าที่ทับช่วงวันที่ซึ่งมีข้อมูลอยู่แล้ว (แก้ราคาย้อนหลัง / นำเข้าซ้ำ) = เขียนทับค่าเดิม
 * → สำรอง DB ก่อนแบบ best-effort (ไม่ลบแถวใด จึงไม่ต้องยืนยัน และสำรองไม่ได้ก็ไม่บล็อกการนำเข้า)
 * นำเข้าวันใหม่ต่อท้ายตามปกติ (ไม่ทับ) = ไม่สำรอง
 */
export async function backupBeforeOverwrite(dates: Iterable<string>, reason: string): Promise<BackupInfo | null> {
  let min: string | null = null
  let max: string | null = null
  for (const d of dates) {
    if (min === null || d < min) min = d
    if (max === null || d > max) max = d
  }
  if (min === null || max === null) return null
  const overlap = await db.rawDaily.count({ where: { date: { gte: min, lte: max } } })
  if (overlap === 0) return null
  const b = await backupDatabase({ reason })
  return b ? { file: displayPath(b.file), bytes: b.bytes } : null
}

/**
 * ตรวจการยืนยันอย่างเดียว (ยังไม่สำรอง) — ให้ route ที่มีงานยาวก่อนลบ (เช่น /api/feed/fetch ดึง Yahoo หลายนาที)
 * ตอบ 409 ได้ทันทีก่อนเริ่มงาน แล้วค่อยเรียก guardDestructive() ตอนจะลบจริง
 */
export async function checkDestructiveConfirmation(
  op: DestructiveOp,
  body: unknown,
): Promise<{ ok: true; existing: ExistingData } | { ok: false; response: NextResponse }> {
  // ล็อกช่วงเก็บผลจริงอยู่ → ห้ามล้างข้อมูลทั้งชุด (ลบกติกาที่ล็อกไว้ + เริ่มยุคข้อมูลใหม่กลาง record) แม้ยืนยันแล้ว
  const freeze = await liveFreezeFlag()
  if (freeze.frozen) {
    const what = op === "seed" ? "สร้างข้อมูลตัวอย่าง (ล้างข้อมูลทั้งหมด)" : "ล้างข้อมูลตลาดทั้งชุด (replaceDemo)"
    return {
      ok: false,
      response: NextResponse.json({ error: frozenWriteError(what, freeze), code: "live_frozen", frozenAt: freeze.frozenAt }, { status: 409 }),
    }
  }
  const existing = await countExisting(op)
  if (wouldDelete(existing) && !hasConfirmation(body, op)) {
    return { ok: false, response: NextResponse.json(confirmationRequired(op, existing), { status: 409 }) }
  }
  return { ok: true, existing }
}

/** ด่านเต็มก่อนลบ: DB ว่าง = ผ่าน · มีข้อมูล = ต้องยืนยัน (409) → สำรอง DB (ไม่สำเร็จ = 500 ไม่ลบ) → ผ่าน */
export async function guardDestructive(op: DestructiveOp, body: unknown): Promise<GuardOutcome> {
  const check = await checkDestructiveConfirmation(op, body)
  if (!check.ok) return check
  const { existing } = check
  if (!wouldDelete(existing)) return { ok: true, backup: null, existing } // DB ว่าง — ไม่มีอะไรให้เสีย
  const b = await backupDatabase({ reason: op === "seed" ? "seed" : "replace-demo" })
  if (!b && isSqliteUrl()) {
    // ยืนยันแล้วแต่สำรองไม่ได้ → ไม่ลบ (ลบไปแล้วกู้ไม่ได้)
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "สำรองฐานข้อมูลก่อนลบไม่สำเร็จ — ยกเลิกเพื่อความปลอดภัยของข้อมูล (ดู log ของเซิร์ฟเวอร์ · ตรวจพื้นที่ดิสก์และสิทธิ์เขียน data/backups หรือ TMP_BACKUP_DIR)",
          code: "backup_failed",
        },
        { status: 500 },
      ),
    }
  }
  return { ok: true, backup: b ? { file: displayPath(b.file), bytes: b.bytes } : null, existing }
}
