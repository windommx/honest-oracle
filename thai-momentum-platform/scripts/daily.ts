// ============================================================
// bun run daily -- [ตัวเลือก]  — สายพานปิดตลาดรายวันของ SET (ตัวจริงอยู่ที่ src/lib/feed/pipeline.ts)
//
//   ปฏิทิน → ดึงข้อมูล (Yahoo .BK หรือ inbox จาก settfex/Settrade) → reconcile/corporate action → ingest
//   → freshness + DQ (วิกฤต = หยุด) → สมอง Jev (POST /api/jev/run in-process) → verify → track snapshot
//   → backup (ถ้ามี src/lib/ops/backup) → run log data/runs/YYYY-MM-DD.json + EventLog "daily_run"
//
// ตัวเลือก:
//   --dry-run                 ดึง/ตรวจทุกอย่าง แต่ไม่เขียน DB ไม่ย้ายไฟล์ ไม่รันสมอง ไม่เขียน run log
//   --skip-fetch              ไม่ดึงข้อมูลใหม่ — ตรวจ + รันสมองบนข้อมูลใน DB ตามที่มี
//   --date YYYY-MM-DD         รอบซื้อขายที่ต้องประมวลผล (ค่าเริ่มต้น: รอบล่าสุดที่ข้อมูลปิดตลาดควรพร้อม)
//                             หมายเหตุ: Jev ตัดสินใจบนข้อมูลล่าสุดใน DB เสมอ (ไม่มีการตัดสินใจย้อนหลัง)
//   --symbols SET50|CORE|A,B  universe ที่ดึง/ตรวจ (ค่าเริ่มต้น: หุ้นที่ยังซื้อขายอยู่ใน DB → CORE ถ้า DB ว่าง)
//   --source auto|yahoo|inbox ค่าเริ่มต้น auto = inbox ถ้ามีไฟล์ ไม่งั้น Yahoo
//   --range 6mo               ช่วงที่ดึงจาก Yahoo ทุกวัน (ซ้อนกับ DB เพื่อ reconcile) · DB ว่าง = 5y
//   --rebase-range max        ช่วงที่ดึงใหม่เมื่อฐานราคาเปลี่ยน (ปันผล/สปลิตถูกปรับย้อนหลัง) · --no-rebase ปิด
//   --inbox data/feed/inbox   โฟลเดอร์รับไฟล์ · ไฟล์ที่ใช้แล้ว → archive/<รอบ>/ · ไฟล์เสีย → rejected/<รอบ>/
//   --runs-dir data/runs      ที่เก็บ run log
//   --holidays file.json      วันหยุด SET ของผู้ใช้ (หรือ env SET_HOLIDAYS_FILE) — ["2027-01-01", …]
//   --max-missing-pct 20      หุ้นใน universe ขาดแท่งของรอบได้ไม่เกิน % นี้
//   --max-conflict-pct 20     หุ้นที่ราคาขัดกับค่าเดิมใน DB ได้ไม่เกิน % นี้ (เกิน = ไม่ ingest)
//   --allow-corporate-actions ยอมให้รอบที่มีราคาเปลี่ยนเกิน ±30% ผ่าน (หลังตรวจกับประกาศ SET แล้ว)
//   --force                   รันแม้เป็นวันหยุด/ก่อนเวลาข้อมูลปิดตลาด หรือ --date เป็นวันหยุด
//   --json                    พิมพ์ run log เต็มเป็น JSON (บรรทัดสุดท้าย)
//
// exit code: 0 สำเร็จ/ไม่มีอะไรเปลี่ยน/ข้ามวันหยุด · 1 error ไม่คาดคิด · 2 argument ผิด · 3 ดึงข้อมูลไม่ได้
//            4 คุณภาพข้อมูลวิกฤต (ไม่รันสมอง) · 5 ข้อมูลไม่ขยับถึงรอบที่ควรมี (stale) · 6 jev/run หรือ verify ล้มเหลว
//
// cron (หลังตลาดปิด): 30 18 * * 1-5  cd /app && bun run daily >> data/runs/cron.log 2>&1
// ============================================================

import { parseArgs } from "node:util"
import { DAILY_EXIT, DEFAULT_DAILY_OPTIONS, runDailyPipeline, type DailyDeps, type DailySource } from "@/lib/feed/pipeline"
import { fetchYahooBatch, YAHOO_RANGES } from "@/lib/feed/yahoo"
import { internalRequest } from "@/lib/security/request-principal"
import type { FeedRange } from "@/lib/momentum/contracts"

const USAGE =
  "ใช้: bun run daily -- [--dry-run] [--skip-fetch] [--date YYYY-MM-DD] [--symbols SET50|CORE|A,B] [--source auto|yahoo|inbox] " +
  "[--range 6mo] [--rebase-range max] [--no-rebase] [--inbox dir] [--runs-dir dir] [--holidays file.json] " +
  "[--max-missing-pct 20] [--max-conflict-pct 20] [--allow-corporate-actions] [--force] [--json]"

function usageError(msg: string): never {
  console.error(`❌ ${msg}\n${USAGE}`)
  process.exit(DAILY_EXIT.USAGE)
}

let values: Record<string, string | boolean | undefined>
try {
  values = parseArgs({
    args: process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      "skip-fetch": { type: "boolean", default: false },
      date: { type: "string" },
      symbols: { type: "string" },
      source: { type: "string", default: "auto" },
      range: { type: "string", default: DEFAULT_DAILY_OPTIONS.range },
      "rebase-range": { type: "string", default: DEFAULT_DAILY_OPTIONS.rebaseRange },
      "no-rebase": { type: "boolean", default: false },
      inbox: { type: "string", default: DEFAULT_DAILY_OPTIONS.inboxDir },
      "runs-dir": { type: "string", default: DEFAULT_DAILY_OPTIONS.runsDir },
      holidays: { type: "string" },
      "max-missing-pct": { type: "string", default: String(DEFAULT_DAILY_OPTIONS.maxMissingPct) },
      "max-conflict-pct": { type: "string", default: String(DEFAULT_DAILY_OPTIONS.maxConflictPct) },
      "allow-corporate-actions": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  }).values
} catch (e) {
  usageError((e as Error).message)
}

if (values.help) {
  console.log(USAGE)
  process.exit(DAILY_EXIT.OK)
}

const str = (k: string) => (typeof values[k] === "string" ? (values[k] as string) : undefined)
const date = str("date") ?? null
if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) usageError(`--date ต้องเป็น YYYY-MM-DD (ได้ "${date}")`)
const source = (str("source") ?? "auto") as DailySource
if (!["auto", "yahoo", "inbox"].includes(source)) usageError(`--source ต้องเป็น auto | yahoo | inbox (ได้ "${source}")`)
const range = str("range") as FeedRange
const rebaseRange = str("rebase-range") as FeedRange
if (!YAHOO_RANGES.includes(range)) usageError(`--range ต้องเป็น ${YAHOO_RANGES.join(" | ")}`)
if (!YAHOO_RANGES.includes(rebaseRange)) usageError(`--rebase-range ต้องเป็น ${YAHOO_RANGES.join(" | ")}`)
const pct = (k: string) => {
  const n = Number(str(k))
  if (!Number.isFinite(n) || n < 0 || n > 100) usageError(`--${k} ต้องเป็นตัวเลข 0–100`)
  return n
}

// backup ของ engineer A (src/lib/ops/backup) — ไม่มีโมดูล/ชื่อฟังก์ชันไม่ตรง = ข้ามอย่างสุภาพ
async function loadBackup(): Promise<DailyDeps["backup"]> {
  const spec = "@/lib/ops/" + "backup" // ไม่ให้ tsc ผูกกับโมดูลที่อาจยังไม่มี
  try {
    const mod = (await import(spec)) as { backupDatabase?: unknown }
    return typeof mod.backupDatabase === "function" ? (mod.backupDatabase as NonNullable<DailyDeps["backup"]>) : null
  } catch {
    return null
  }
}

const json = values.json === true
const log = (line: string) => {
  if (!json) console.log(line)
}

log(`🗓  สายพานปิดตลาด SET · DB ${(process.env.DATABASE_URL ?? "").replace(/^file:/, "") || "(DATABASE_URL ไม่ได้ตั้ง)"}${values["dry-run"] ? " · DRY-RUN" : ""}`)
const { exitCode, log: runLog } = await runDailyPipeline(
  {
    ...DEFAULT_DAILY_OPTIONS,
    dryRun: values["dry-run"] === true,
    skipFetch: values["skip-fetch"] === true,
    date,
    symbols: str("symbols") ?? null,
    source,
    range,
    rebaseRange,
    rebase: values["no-rebase"] !== true,
    inboxDir: str("inbox") ?? DEFAULT_DAILY_OPTIONS.inboxDir,
    runsDir: str("runs-dir") ?? DEFAULT_DAILY_OPTIONS.runsDir,
    holidaysFile: str("holidays") ?? process.env.SET_HOLIDAYS_FILE ?? null,
    maxMissingPct: pct("max-missing-pct"),
    maxConflictPct: pct("max-conflict-pct"),
    allowCorporateActions: values["allow-corporate-actions"] === true,
    force: values.force === true,
    now: new Date(),
  },
  {
    fetchYahooBatch,
    runBrain: async () => (await import("@/app/api/jev/run/route")).POST(),
    // internalRequest = คำขอภายใน process ที่ได้สิทธิ์ผู้ดูแล — GET /api/verify บันทึกผล (outcome) เฉพาะผู้ดูแล
    // (new Request ธรรมดาได้สิทธิ์เฉพาะโหมด local · เครื่องที่ตั้ง TMP_AUTH_PASSWORD จะคำนวณแต่ไม่บันทึก)
    runVerify: async () => (await import("@/app/api/verify/route")).GET(internalRequest("http://localhost/api/verify?hold=10")),
    backup: await loadBackup(),
    log,
  },
)

if (json) console.log(JSON.stringify(runLog))
else {
  const icon = runLog.status === "failed" ? "❌" : runLog.status === "skipped" ? "⏭ " : runLog.status === "noop" ? "✅" : "✅"
  console.log(`${icon} ${runLog.status.toUpperCase()} (exit ${exitCode}) · รอบ ${runLog.session ?? "—"} · ${runLog.exitReason} · ${(runLog.tookMs / 1000).toFixed(1)}s`)
  for (const c of runLog.critical) console.log(`   ⛔ ${c}`)
  for (const w of runLog.warnings.slice(0, 12)) console.log(`   ⚠️  ${w}`)
  if (runLog.warnings.length > 12) console.log(`   … อีก ${runLog.warnings.length - 12} คำเตือน (ดู run log)`)
  if (runLog.logFile) console.log(`   📝 ${runLog.logFile}${runLog.eventEmitted ? " · EventLog daily_run" : ""}`)
}
process.exit(exitCode)
