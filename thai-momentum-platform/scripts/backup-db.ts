// ============================================================
// bun scripts/backup-db.ts — สำรองฐานข้อมูล SQLite แบบออนไลน์ (ไม่ต้องหยุด server)
// ใช้ backupDatabase() (VACUUM INTO → snapshot ที่สมบูรณ์ในตัว) แล้วตรวจไฟล์ที่ได้ด้วย PRAGMA quick_check
//
//   bun scripts/backup-db.ts                         # → TMP_BACKUP_DIR หรือ data/backups · เก็บ 14 ไฟล์ล่าสุด
//   bun scripts/backup-db.ts --reason nightly --keep 30
//   bun scripts/backup-db.ts --dir /mnt/backup --mirror /mnt/nas/tmp-backups
//
// env: DATABASE_URL (file:...) · TMP_BACKUP_DIR · TMP_BACKUP_KEEP · TMP_BACKUP_MIRROR_DIR (สำเนานอกเครื่อง/ดิสก์อื่น)
// exit code: 0 = สำเร็จและไฟล์ผ่านการตรวจ · 1 = ล้มเหลว (log JSON บรรทัดสุดท้ายบอกเหตุผล)
// ============================================================

import { Database } from "bun:sqlite"
import { copyFileSync, mkdirSync, renameSync } from "node:fs"
import path from "node:path"
import { db } from "@/lib/db"
import { backupDatabase, DEFAULT_BACKUP_KEEP, defaultBackupDir, pruneBackups } from "@/lib/ops/backup"
import { createLogger } from "@/lib/ops/log"

const log = createLogger("backup")

interface Args {
  reason: string
  dir?: string
  keep: number
  mirror?: string
}

function parseArgs(argv: string[], env: Record<string, string | undefined> = process.env): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("ใช้: bun scripts/backup-db.ts [--reason <ชื่อ>] [--dir <โฟลเดอร์>] [--keep <จำนวน>] [--mirror <โฟลเดอร์สำเนา>]")
    process.exit(0)
  }
  const keepRaw = Number(get("--keep") ?? env.TMP_BACKUP_KEEP ?? DEFAULT_BACKUP_KEEP)
  return {
    reason: get("--reason") ?? "manual",
    dir: get("--dir"),
    keep: Number.isFinite(keepRaw) && keepRaw >= 1 ? Math.floor(keepRaw) : DEFAULT_BACKUP_KEEP,
    mirror: get("--mirror") ?? (env.TMP_BACKUP_MIRROR_DIR?.trim() || undefined),
  }
}

/** ตรวจไฟล์ backup: SQLite สมบูรณ์ (quick_check) + อ่านตารางหลักได้ */
export function verifyBackupFile(file: string): { ok: boolean; check: string; rawRows: number | null; latestDate: string | null } {
  let sqlite: Database | null = null
  try {
    sqlite = new Database(file, { readonly: true })
    const check = String((sqlite.query("PRAGMA quick_check").get() as Record<string, unknown> | null)?.quick_check ?? "")
    const row = sqlite.query("SELECT COUNT(*) AS n, MAX(date) AS d FROM RawDaily").get() as { n: number; d: string | null } | null
    return { ok: check === "ok", check, rawRows: row?.n ?? null, latestDate: row?.d ?? null }
  } catch (e) {
    return { ok: false, check: (e as Error).message, rawRows: null, latestDate: null }
  } finally {
    sqlite?.close()
  }
}

async function main(): Promise<number> {
  const t0 = Date.now()
  const args = parseArgs(process.argv.slice(2))
  const dir = path.resolve(args.dir ?? defaultBackupDir())
  const res = await backupDatabase({ reason: args.reason, dir, keep: args.keep })
  if (!res) {
    log.error("backup failed", { reason: args.reason, dir, hint: "ดูข้อความ [backup] ด้านบน — DATABASE_URL ต้องเป็น file:... และโฟลเดอร์ต้องเขียนได้" })
    return 1
  }
  const verify = verifyBackupFile(res.file)
  if (!verify.ok) {
    log.error("backup verification failed", { file: res.file, check: verify.check })
    return 1
  }

  let mirrored: string | null = null
  if (args.mirror) {
    try {
      const mdir = path.resolve(args.mirror)
      mkdirSync(mdir, { recursive: true, mode: 0o700 })
      const target = path.join(mdir, path.basename(res.file))
      const tmp = `${target}.partial`
      copyFileSync(res.file, tmp)
      renameSync(tmp, target) // ไม่มีไฟล์ครึ่งเดียวค้างในโฟลเดอร์สำเนา
      pruneBackups(mdir, args.keep)
      mirrored = target
    } catch (e) {
      // backup หลักสำเร็จแล้ว — สำเนาล้ม = เตือน (exit 1 ให้ scheduler/monitor เห็น)
      log.error("mirror copy failed", { file: res.file, mirror: args.mirror, error: e })
      return 1
    }
  }

  log.info("backup ok", {
    file: res.file,
    bytes: res.bytes,
    rawRows: verify.rawRows,
    latestDate: verify.latestDate,
    keep: args.keep,
    mirrored,
    tookMs: Date.now() - t0,
  })
  return 0
}

if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      log.error("backup crashed", { error: e })
      process.exitCode = 1
    })
    .finally(() => db.$disconnect().catch(() => {}))
}
