// ============================================================
// bun run fetch:th -- [--symbols SET50|CORE|PTT,KBANK|@list.txt] [--range 2y] [--raw]
//                     [--replace-demo] [--csv path.csv] [--delay 150]
// ดึงราคาหุ้นไทยจริงจาก Yahoo Finance (.BK) บนเครื่องที่เข้าเน็ตปกติ แล้ว
//   - ค่าเริ่มต้น: นำเข้า DB ผ่านท่อ ingest เดียวกับ UI (indicator · โผ · sector · EventLog)
//   - --csv: เขียนไฟล์ CSV รูปแบบเดียวกับการ์ดนำเข้า (date,symbol,open,high,low,close,val) แทนการแตะ DB
// เหมาะกับ cron หลังตลาดปิด เช่น 0 18 * * 1-5  cd repo/thai-momentum-platform && bun run fetch:th -- --symbols SET50 --range 6mo
// ============================================================

import { parseArgs } from "node:util"
import { promises as fs } from "node:fs"
import path from "node:path"

import { fetchYahooBatch, YAHOO_RANGES } from "../src/lib/feed/yahoo"
import { flagStale } from "../src/lib/feed/quality"
import { parseSymbolList } from "../src/lib/feed/universe"
import type { FeedRange } from "../src/lib/momentum/contracts"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    symbols: { type: "string", default: "SET50" },
    range: { type: "string", default: "2y" },
    raw: { type: "boolean", default: false },
    "replace-demo": { type: "boolean", default: false },
    csv: { type: "string" },
    delay: { type: "string", default: "150" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(`ใช้: bun run fetch:th -- [--symbols SET50|CORE|A,B,C|@file] [--range ${YAHOO_RANGES.join("|")}] [--raw] [--replace-demo] [--csv out.csv] [--delay ms]`)
  process.exit(0)
}

let symbolText = values.symbols ?? "SET50"
if (symbolText.startsWith("@")) symbolText = await fs.readFile(symbolText.slice(1), "utf8")
const { symbols, invalid } = parseSymbolList(symbolText)
if (invalid.length) console.warn(`⚠️ ข้ามสัญลักษณ์รูปแบบไม่ถูกต้อง: ${invalid.join(", ")}`)
if (symbols.length === 0) {
  console.error("ไม่มีรายชื่อหุ้น — ใช้ --symbols SET50 หรือ --symbols PTT,KBANK")
  process.exit(1)
}
const range: FeedRange = YAHOO_RANGES.includes(values.range as FeedRange) ? (values.range as FeedRange) : "2y"
const adjusted = !values.raw
const delayArg = Number(values.delay)
const delayMs = Number.isFinite(delayArg) ? Math.max(0, delayArg) : 150 // --delay 0 ต้องได้ 0 (เดิม 0 || 150 = 150)

console.log(`🌐 Yahoo Finance (.BK) — ${symbols.length} ตัว · range ${range} · ${adjusted ? "adjusted (adjclose)" : "ราคาดิบ"}`)
const t0 = Date.now()
const batch = await fetchYahooBatch(symbols, range, {
  adjusted,
  delayMs,
  onProgress: (done, total, sym) => {
    if (done % 10 === 0 || done === total) console.log(`  … ${done}/${total} (${sym})`)
  },
})
const reports = flagStale(batch.reports)
const failed = reports.filter((r) => !r.ok)

console.log(`\nรายงานรายตัว (${reports.length}):`)
for (const r of reports) {
  const tag = r.ok ? (r.warnings.length ? "⚠️" : "✅") : "❌"
  console.log(`  ${tag} ${r.symbol.padEnd(8)} ${r.ok ? `${String(r.bars).padStart(5)} แท่ง ${r.firstDate} → ${r.lastDate}` : ""} ${r.warnings.join(" · ")}${r.error ? ` ${r.error}` : ""}`)
}
console.log(`ได้ ${reports.length - failed.length}/${symbols.length} ตัว · ${batch.rows.length.toLocaleString()} แถว · ${((Date.now() - t0) / 1000).toFixed(1)}s`)

if (batch.rows.length === 0) {
  console.error(batch.blocked ? "❌ เข้าถึง Yahoo ไม่ได้จากเครื่องนี้ (บล็อก/ไม่มีเน็ต)" : "❌ ไม่ได้ข้อมูลเลย — ตรวจชื่อย่อ")
  process.exit(2)
}

if (values.csv) {
  const out = path.resolve(values.csv)
  const lines = ["date,symbol,open,high,low,close,val"]
  for (const r of batch.rows) lines.push(`${r.date},${r.symbol},${r.open ?? ""},${r.high ?? ""},${r.low ?? ""},${r.close},${r.val}`)
  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, lines.join("\n") + "\n", "utf8")
  console.log(`💾 เขียน ${out} (${batch.rows.length.toLocaleString()} แถว) — นำเข้าผ่านการ์ด CSV หรือ POST /api/ingest ได้`)
  process.exit(0)
}

// นำเข้า DB (import แบบ lazy — ไม่ต้องมี DB เมื่อใช้ --csv)
const { ingestFeed, CROSS_ASSET_CLEARED_NOTE } = await import("../src/lib/feed/ingest")
const res = await ingestFeed({ rows: batch.rows, source: "yahoo", actor: "system", replaceDemo: values["replace-demo"] === true })
console.log(
  `📥 นำเข้า ${res.ingest.insertedRaw.toLocaleString()} แถว · indicator ${res.ingest.updatedRows.toLocaleString()} แถว · โผ ${res.ingest.snapDates.length} วัน (ล่าสุด ${res.latestDate ?? "—"}) · sector ${res.sectorRows} ตัว${res.replacedDemo ? " · ล้าง demo แล้ว" : ""}`,
)
if (res.clearedCrossAsset) console.log(`ℹ️ ${CROSS_ASSET_CLEARED_NOTE}`)
console.log(`⏱ รวม ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(0)
