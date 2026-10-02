// ============================================================
// สำรองฐานข้อมูล SQLite แบบออนไลน์ — `VACUUM INTO '<file>'` ผ่าน Prisma (ไม่ต้องหยุดเซิร์ฟเวอร์)
// ได้ไฟล์ .db ที่สมบูรณ์ในตัว (consistent snapshot) เปิดด้วย sqlite3 / ใช้แทน db/custom.db ได้ทันที
//
// เรียกก่อนทุกการลบข้อมูลทั้งชุด (seed force, นำเข้าข้อมูลจริง) และจาก scripts/backup-db.ts
// ไม่ throw ใส่ผู้เรียก — ล้มเหลว/ไม่ใช่ SQLite = log แล้วคืน null (ผู้เรียกตัดสินใจเองว่าจะไปต่อไหม)
// ปลายทาง: OQE_BACKUP_DIR หรือ <app>/data/backups · เก็บ OQE_BACKUP_KEEP ไฟล์ล่าสุด (ค่าเริ่มต้น 14)
// ============================================================

import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs"
import path from "node:path"
import { db } from "@/lib/db"
import { log } from "@/lib/log"

export interface BackupResult {
  file: string
  bytes: number
  at: string
}

type Env = Record<string, string | undefined>

export const DEFAULT_BACKUP_KEEP = 14
const PREFIX = "oqe-backup-"
const NAME_RE = /^oqe-backup-\d{8}T\d{9}Z-[a-z0-9-]+-[0-9a-f]{4}\.db$/
// path ที่ฝังลง SQL ได้อย่างปลอดภัย — ไม่มีเครื่องหมายคำพูด/อักขระควบคุม (กัน SQL injection ผ่านชื่อโฟลเดอร์)
const SAFE_PATH = /^[A-Za-z0-9 _.\-/\\:]+$/

/** รากของแอป — standalone server.js chdir ไป .next/standalone แต่ backup ต้องไม่อยู่ในโฟลเดอร์ build (rebuild ลบทิ้ง) */
export function appRoot(cwd: string = process.cwd()): string {
  return /[\\/]\.next[\\/]standalone[\\/]?$/.test(cwd) ? path.resolve(cwd, "..", "..") : cwd
}

export function defaultBackupDir(env: Env = process.env, cwd: string = process.cwd()): string {
  const fromEnv = env.OQE_BACKUP_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(appRoot(cwd), "data", "backups")
}

export function backupKeep(env: Env = process.env): number {
  const n = Number(env.OQE_BACKUP_KEEP ?? DEFAULT_BACKUP_KEEP)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_BACKUP_KEEP
}

/** DATABASE_URL เป็น SQLite (file:...) หรือไม่ — provider อื่นไม่รองรับ VACUUM INTO */
export function isSqliteUrl(url: string | undefined = process.env.DATABASE_URL): boolean {
  return typeof url === "string" && url.trim().replace(/^["']/, "").startsWith("file:")
}

export function backupSlug(reason: string | undefined): string {
  const s = (reason ?? "manual")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  return s || "manual"
}

/** 20260929T061530123Z — เรียงตามชื่อ = เรียงตามเวลา */
function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:.]/g, "")
}

/** ไฟล์ backup ที่ระบบนี้สร้าง (ชื่อตรงรูปแบบ) ใหม่ → เก่า */
export function listBackups(dir: string = defaultBackupDir()): Array<{ file: string; name: string; bytes: number; at: string }> {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .sort()
    .reverse()
    .map((name) => {
      const file = path.join(dir, name)
      const st = statSync(file)
      return { file, name, bytes: st.size, at: st.mtime.toISOString() }
    })
}

/** ลบไฟล์ backup เก่าเกิน keep (เฉพาะไฟล์ที่ระบบนี้สร้าง — ชื่อตรงรูปแบบ) */
export function pruneBackups(dir: string, keep: number): string[] {
  const files = readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .sort()
    .reverse()
  const removed: string[] = []
  for (const f of files.slice(Math.max(1, keep))) {
    try {
      unlinkSync(path.join(dir, f))
      removed.push(f)
    } catch (e) {
      log.warn("backup prune failed", { file: f, error: e })
    }
  }
  return removed
}

export async function backupDatabase(opts?: { reason?: string; dir?: string; keep?: number }): Promise<BackupResult | null> {
  let file: string | null = null
  try {
    if (!isSqliteUrl()) {
      log.warn("backup skipped", { reason: "DATABASE_URL ไม่ใช่ SQLite (file:...)" })
      return null
    }
    // turbopackIgnore: path มาจาก env/argument ตอนรัน — ไม่ให้ Turbopack ลากทั้งโปรเจกต์เข้า standalone build
    const dir = path.resolve(/*turbopackIgnore: true*/ opts?.dir ?? defaultBackupDir())
    const keep = typeof opts?.keep === "number" && Number.isFinite(opts.keep) && opts.keep >= 1 ? Math.floor(opts.keep) : backupKeep()
    const target = path.join(dir, `${PREFIX}${stamp()}-${backupSlug(opts?.reason)}-${randomBytes(2).toString("hex")}.db`)
    if (!SAFE_PATH.test(target)) {
      log.error("backup refused", { reason: "path มีอักขระไม่ปลอดภัย — ตั้ง OQE_BACKUP_DIR เป็นโฟลเดอร์ที่ชื่อไม่มีเครื่องหมายคำพูด", dir })
      return null
    }
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    file = target
    await db.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    try {
      chmodSync(file, 0o600) // backup = ข้อมูลทั้งหมด (รวม journal) — อ่านได้เฉพาะเจ้าของ
    } catch {}
    const bytes = statSync(file).size
    pruneBackups(dir, keep)
    log.info("backup ok", { reason: backupSlug(opts?.reason), file, bytes })
    return { file, bytes, at: new Date().toISOString() }
  } catch (e) {
    log.error("backup failed", { error: e })
    // VACUUM INTO ที่ล้มกลางทางอาจทิ้งไฟล์ครึ่งเดียว — ไม่ปล่อยให้ดูเหมือน backup ที่ใช้ได้
    if (file && existsSync(file)) {
      try {
        unlinkSync(file)
      } catch {}
    }
    return null
  }
}
