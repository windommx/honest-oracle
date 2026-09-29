/// <reference types="bun-types" />
// ============================================================
// bun scripts/ingest-csv.ts <prices.csv> --source "<ที่มา>" [--license "<สิทธิ์>"] [--meta meta.csv]
//                           [--volume-unit shares|millionShares] [--yes] [--no-backup]
//
// นำเข้าราคารายวันจาก CSV แบบยาว (symbol,date,open,high,low,close,volume) แทนที่ข้อมูลตลาดทั้งชุดใน DATABASE_URL
//   ไม่มี --yes = ตรวจอย่างเดียว (dry run) พิมพ์สรุป/คำเตือน แล้ว exit 2
//   --yes       = backup DB ก่อน (ล้ม = ยกเลิก) → แทนที่ใน transaction → บันทึก DataSource (kind=real)
// journal / รายงาน / การล็อกกติกา ไม่ถูกแตะ · server ที่รันอยู่เห็นข้อมูลใหม่เองในคำขอถัดไป (cache ผูกกับ DataSource)
// exit code: 0 สำเร็จ · 1 ข้อมูลไม่ผ่าน/ผิดพลาด · 2 dry run
// ============================================================

process.env.OQE_LOG_FORMAT ??= "json"

import { readFileSync } from "node:fs"
import { db } from "@/lib/db"
import { log } from "@/lib/log"
import { parseMetaCsv, parsePriceCsv } from "@/lib/data/csv"
import { ingestDataset } from "@/lib/data/service"

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

export async function main(argv: string[]): Promise<number> {
  const file = argv.find((a, i) => !a.startsWith("--") && !["--source", "--license", "--meta", "--volume-unit", "--note"].includes(argv[i - 1] ?? ""))
  const source = arg(argv, "--source")
  if (!file || !source || argv.includes("--help")) {
    console.log('ใช้: bun scripts/ingest-csv.ts <prices.csv> --source "<ที่มา>" [--license "<สิทธิ์>"] [--meta meta.csv] [--volume-unit shares|millionShares] [--yes] [--no-backup]')
    return argv.includes("--help") ? 0 : 1
  }
  const parsed = parsePriceCsv(readFileSync(file, "utf8"))
  if (parsed.rows === 0) {
    log.error("csv unreadable", { file, issues: parsed.issues.slice(0, 10) })
    return 1
  }
  const metaFile = arg(argv, "--meta")
  const meta = metaFile ? parseMetaCsv(readFileSync(metaFile, "utf8")) : new Map()
  const dataset = {
    source,
    license: arg(argv, "--license"),
    note: arg(argv, "--note"),
    volumeUnit: arg(argv, "--volume-unit") ?? "shares",
    stocks: [...parsed.bySymbol.entries()].map(([symbol, prices]) => ({ symbol, ...(meta.get(symbol) ?? {}), prices })),
  }
  const yes = argv.includes("--yes")
  const out = await ingestDataset(dataset, { dryRun: !yes, requireBackup: !argv.includes("--no-backup") })
  if (parsed.issues.length) log.warn("csv lines skipped", { count: parsed.issues.length, first: parsed.issues.slice(0, 5) })
  if (!out.ok) {
    log.error("ingest rejected", { stage: out.stage, errors: out.errors, warnings: out.warnings, summary: out.summary })
    return 1
  }
  if (out.dryRun) {
    log.info("dry run ok — เพิ่ม --yes เพื่อแทนที่ข้อมูลจริง", { summary: out.summary, warnings: out.warnings })
    return 2
  }
  log.info("ingest ok", { summary: out.summary, warnings: out.warnings, backup: out.backup?.file ?? null, result: out.result })
  return 0
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      log.error("ingest crashed", { error: e })
      process.exitCode = 1
    })
    .finally(() => db.$disconnect().catch(() => {}))
}
