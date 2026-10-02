/// <reference types="bun-types" />
// ============================================================
// bun scripts/fetch-yahoo.ts (--symbols PTT,AOT,... | --universe demo) [--range 5y] [--raw] [--meta meta.csv]
//                            [--out data/yahoo-dataset.json] [--yes] [--no-backup]
//
// ดึงราคารายวันหุ้นไทยจาก Yahoo Finance (chart API v8, suffix .BK) แล้วนำเข้าผ่านท่อเดียวกับ /api/data/ingest
//   ค่าเริ่มต้น: ราคาปรับปันผล/สปลิต (adjusted) 5 ปี · --raw = ราคาดิบ
//   --universe demo = 22 ตัวเดียวกับชุดสาธิต (ชื่อ/หมวด/ธีมจากชุดสาธิต — บางตัวอาจเปลี่ยนสถานะหลังควบรวมกิจการ)
//   ไม่มี --yes = ดึง + ตรวจ + (--out) เขียนไฟล์ชุดข้อมูลให้ตรวจ แล้ว exit 2 · --yes = backup แล้วแทนที่ข้อมูล
// ข้อจำกัด: ไม่มีงบ/เงินไหลสถาบันจาก Yahoo (สายที่ใช้ข้อมูลนั้นงดออกเสียง) · เงื่อนไขการใช้ข้อมูลเป็นของ Yahoo
// exit code: 0 สำเร็จ · 1 ผิดพลาด/ดึงไม่ได้ · 2 dry run
// ============================================================

process.env.OQE_LOG_FORMAT ??= "json"

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { db } from "@/lib/db"
import { log } from "@/lib/log"
import { parseMetaCsv, type CsvPriceRow } from "@/lib/data/csv"
import { SYMBOL_RE } from "@/lib/data/ingest"
import { ingestDataset } from "@/lib/data/service"
import { fetchYahooDaily, YAHOO_RANGES, type YahooRange } from "@/lib/data/yahoo"
import { UNIVERSE } from "@/lib/quant/market"

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

export async function main(argv: string[]): Promise<number> {
  const universe = arg(argv, "--universe")
  const list = universe === "demo" ? UNIVERSE.map((u) => u.symbol) : (arg(argv, "--symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (!list.length || argv.includes("--help")) {
    console.log("ใช้: bun scripts/fetch-yahoo.ts (--symbols PTT,AOT,... | --universe demo) [--range 5y] [--raw] [--meta meta.csv] [--out file.json] [--yes] [--no-backup]")
    return argv.includes("--help") ? 0 : 1
  }
  const bad = list.filter((s) => !SYMBOL_RE.test(s))
  if (bad.length) {
    log.error("invalid symbols", { bad })
    return 1
  }
  const range = (arg(argv, "--range") ?? "5y") as YahooRange
  if (!YAHOO_RANGES.includes(range)) {
    log.error("invalid range", { range, allowed: YAHOO_RANGES })
    return 1
  }
  const adjusted = !argv.includes("--raw")
  const metaFile = arg(argv, "--meta")
  const meta = metaFile ? parseMetaCsv(readFileSync(metaFile, "utf8")) : new Map()
  const demoMeta = new Map(UNIVERSE.map((u) => [u.symbol, { name: u.name, sector: u.sector, theme: u.theme }]))

  const stocks: Array<{ symbol: string; name?: string; sector?: string; theme?: string; prices: CsvPriceRow[] }> = []
  const failed: Array<{ symbol: string; error: string }> = []
  for (const [i, symbol] of list.entries()) {
    try {
      const rows = await fetchYahooDaily(symbol, range, { adjusted })
      stocks.push({ symbol, ...(demoMeta.get(symbol) ?? {}), ...(meta.get(symbol) ?? {}), prices: rows })
      log.info("fetched", { symbol, bars: rows.length, first: rows[0]?.date, last: rows.at(-1)?.date, progress: `${i + 1}/${list.length}` })
    } catch (e) {
      failed.push({ symbol, error: e instanceof Error ? e.message : String(e) })
      log.warn("fetch failed", { symbol, error: e })
      // 3 ตัวแรกล้มหมด = น่าจะเข้าถึง Yahoo ไม่ได้ (ถูกบล็อก/ไม่มีเน็ต) — หยุดเร็ว ไม่รอทั้งชุด
      if (stocks.length === 0 && failed.length >= 3) {
        log.error("yahoo unreachable", { failed, hint: "ตรวจการเชื่อมต่ออินเทอร์เน็ต/proxy หรือใช้ bun scripts/ingest-csv.ts กับไฟล์ที่ดาวน์โหลดเอง" })
        return 1
      }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  if (stocks.length === 0) {
    log.error("yahoo unreachable", { failed, hint: "ดึงไม่ได้สักตัว — ตรวจการเชื่อมต่อ/proxy (403 = ถูกนโยบายเครือข่ายปฏิเสธ) หรือใช้ bun scripts/ingest-csv.ts กับไฟล์ที่ดาวน์โหลดเอง" })
    return 1
  }
  const dataset = {
    source: `yahoo:chart-v8 ${adjusted ? "adjusted" : "raw"} range=${range}`,
    license: "Yahoo Finance terms — ใช้เพื่อการศึกษาส่วนตัว ไม่เผยแพร่ซ้ำ",
    note: failed.length ? `ดึงไม่สำเร็จ ${failed.length} ตัว: ${failed.map((f) => f.symbol).join(", ")}` : undefined,
    volumeUnit: "shares" as const,
    stocks,
  }
  const outFile = arg(argv, "--out")
  if (outFile) {
    mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
    writeFileSync(outFile, JSON.stringify(dataset))
    log.info("dataset written", { file: outFile, stocks: stocks.length })
  }
  const yes = argv.includes("--yes")
  const out = await ingestDataset(dataset, { dryRun: !yes, requireBackup: !argv.includes("--no-backup") })
  if (!out.ok) {
    log.error("ingest rejected", { stage: out.stage, errors: out.errors, warnings: out.warnings, failed })
    return 1
  }
  if (out.dryRun) {
    log.info("dry run ok — เพิ่ม --yes เพื่อแทนที่ข้อมูลจริง", { summary: out.summary, warnings: out.warnings, failed })
    return 2
  }
  log.info("ingest ok", { summary: out.summary, warnings: out.warnings, failed, backup: out.backup?.file ?? null, result: out.result })
  return 0
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      log.error("fetch-yahoo crashed", { error: e })
      process.exitCode = 1
    })
    .finally(() => db.$disconnect().catch(() => {}))
}
