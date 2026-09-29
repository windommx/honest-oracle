/// <reference types="bun-types" />
// ============================================================
// bun scripts/backup-db.ts — สำรองฐานข้อมูล SQLite แบบออนไลน์ (ไม่ต้องหยุด server)
// backupDatabase() (VACUUM INTO → snapshot สมบูรณ์ในตัว) แล้วตรวจไฟล์ที่ได้ด้วย PRAGMA quick_check
//
//   bun scripts/backup-db.ts                              # → OQE_BACKUP_DIR หรือ data/backups · เก็บ 14 ไฟล์ล่าสุด
//   bun scripts/backup-db.ts --reason nightly --keep 30
//   bun scripts/backup-db.ts --dir /mnt/backup
//
// env: DATABASE_URL (file:...) · OQE_BACKUP_DIR · OQE_BACKUP_KEEP
// exit code: 0 = สำเร็จและไฟล์ผ่านการตรวจ · 1 = ล้มเหลว (log JSON บรรทัดสุดท้ายบอกเหตุผล)
// ============================================================

process.env.OQE_LOG_FORMAT ??= "json"

import { db } from "@/lib/db"
import { log } from "@/lib/log"
import { backupDatabase, backupKeep } from "@/lib/ops/backup"
import { inspectSqlite } from "./sqlite-file"

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("ใช้: bun scripts/backup-db.ts [--reason <ชื่อ>] [--dir <โฟลเดอร์>] [--keep <จำนวน>]")
    return 0
  }
  const t0 = Date.now()
  const keepRaw = Number(arg(argv, "--keep") ?? backupKeep())
  const keep = Number.isFinite(keepRaw) && keepRaw >= 1 ? Math.floor(keepRaw) : backupKeep()
  const res = await backupDatabase({ reason: arg(argv, "--reason") ?? "manual", dir: arg(argv, "--dir"), keep })
  if (!res) {
    log.error("backup failed", { hint: "DATABASE_URL ต้องเป็น file:... และโฟลเดอร์ปลายทางต้องเขียนได้" })
    return 1
  }
  const info = inspectSqlite(res.file, "quick")
  if (!info.ok) {
    log.error("backup verification failed", { file: res.file, check: info.integrity })
    return 1
  }
  log.info("backup verified", { file: res.file, bytes: res.bytes, stocks: info.stocks, prices: info.prices, lastDate: info.lastDate, keep, tookMs: Date.now() - t0 })
  return 0
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      log.error("backup crashed", { error: e })
      process.exitCode = 1
    })
    .finally(() => db.$disconnect().catch(() => {}))
}
