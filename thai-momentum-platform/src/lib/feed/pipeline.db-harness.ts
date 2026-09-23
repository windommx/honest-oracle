// ============================================================
// สคริปต์ทดสอบสายพานรายวันกับ SQLite จริง — รันเป็น subprocess โดย pipeline.db.test.ts เท่านั้น
// fetch = stub (ไม่แตะเน็ต) · สมอง = POST /api/jev/run จริง (in-process) · verify = GET /api/verify จริง
// ใช้: DATABASE_URL=file:/tmp/x.db bun pipeline.db-harness.ts <workdir> → พิมพ์ JSON บรรทัดสุดท้าย
// ============================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { db } from "@/lib/db"
import type { ParsedCsvRow } from "@/lib/momentum/core"
import type { YahooBatchResult } from "./yahoo"
import { assessSymbol } from "./quality"
import { defaultHolidayCalendar, isTradingDay, nextTradingDay } from "./calendar"
import { ingestFeed } from "./ingest"
import { DEFAULT_DAILY_OPTIONS, runDailyPipeline, type DailyDeps, type DailyOptions } from "./pipeline"

const work = process.argv[2] ?? ""
const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")

async function guard() {
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
  if (!work) throw new Error("ต้องส่ง workdir")
}

const cal = defaultHolidayCalendar()
function sessionsEnding(last: string, n: number): string[] {
  const out: string[] = []
  let d = last
  while (out.length < n) {
    if (isTradingDay(d, cal)) out.unshift(d)
    d = new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  }
  return out
}

async function main() {
  await guard()
  const dates = sessionsEnding("2026-09-22", 80)
  let seed = 3
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const rows: ParsedCsvRow[] = []
  const lastClose = new Map<string, number>()
  const syms = Array.from({ length: 40 }, (_, s) => `S${String(s).padStart(2, "0")}`)
  for (const sym of syms) {
    let px = 10 + rnd() * 40
    for (const date of dates) {
      px = Math.max(2, px * (1 + (rnd() - 0.48) * 0.05))
      const c = Math.round(px * 100) / 100
      rows.push({ date, symbol: sym, close: c, open: null, high: null, low: null, val: 5e6 + Math.round(rnd() * 5e7) })
      lastClose.set(sym, c)
    }
  }
  await ingestFeed({ rows, source: "yahoo", actor: "system" })

  // ---- fetch stub: คืนแถวใน DB (30 วันล่าสุด) + แท่งของวันใหม่ตาม scenario ----
  let mode: "normal" | "same" | "split" = "normal"
  let newDate = "2026-09-23"
  let fetchCalls = 0
  const fetchYahooBatch: DailyDeps["fetchYahooBatch"] = async (symbols) => {
    fetchCalls++
    const have = await db.rawDaily.findMany({ where: { symbol: { in: symbols } }, orderBy: [{ symbol: "asc" }, { date: "asc" }] })
    const out: ParsedCsvRow[] = []
    for (const sym of symbols) {
      const own = have.filter((r) => r.symbol === sym).slice(-30)
      out.push(...own.map((r) => ({ date: r.date, symbol: sym, close: r.close, open: r.open, high: r.high, low: r.low, val: r.val })))
      const last = own[own.length - 1]
      if (mode !== "same" && last && last.date < newDate) {
        const close = mode === "split" && sym === "S01" ? Math.round((last.close / 2) * 100) / 100 : Math.round(last.close * 1.004 * 100) / 100
        out.push({ date: newDate, symbol: sym, close, open: null, high: null, low: null, val: last.val })
      }
    }
    return { rows: out, reports: symbols.map((s) => assessSymbol(s, out.filter((r) => r.symbol === s))), blocked: false } satisfies YahooBatchResult
  }
  let backups = 0
  const logs: string[] = []
  const deps: DailyDeps = {
    fetchYahooBatch,
    runBrain: async () => (await import("@/app/api/jev/run/route")).POST(),
    runVerify: async () => {
      const { internalRequest } = await import("@/lib/security/request-principal")
      return (await import("@/app/api/verify/route")).GET(internalRequest("http://localhost/api/verify?hold=10"))
    },
    backup: async () => {
      backups++
      return { file: path.join(work, "fake-backup.db"), bytes: 1 }
    },
    log: (l) => logs.push(l),
  }
  const runsDir = path.join(work, "runs")
  const inboxDir = path.join(work, "inbox")
  const opts = (o: Partial<DailyOptions>): DailyOptions => ({ ...DEFAULT_DAILY_OPTIONS, runsDir, inboxDir, source: "yahoo", now: new Date("2026-09-23T11:30:00Z"), ...o })
  const counts = async () => ({
    raw: await db.rawDaily.count(),
    events: await db.eventLog.count(),
    decisions: await db.decision.count(),
    dailyRuns: await db.eventLog.count({ where: { kind: "daily_run" } }),
    snapshots: await db.eventLog.count({ where: { kind: "track_snapshot" } }),
  })
  const brief = (r: Awaited<ReturnType<typeof runDailyPipeline>>) => ({
    exit: r.exitCode,
    status: r.log.status,
    reason: r.log.exitReason,
    steps: Object.fromEntries(r.log.steps.map((s) => [s.step, s.status])),
    eventEmitted: r.log.eventEmitted,
    logFile: r.log.logFile,
    critical: r.log.critical,
  })

  const c0 = await counts()
  // 1) วันใหม่ปกติ
  const r1 = await runDailyPipeline(opts({ date: "2026-09-23" }), deps)
  const c1 = await counts()
  const log1 = r1.log.logFile ? (JSON.parse(readFileSync(r1.log.logFile, "utf8")) as { status: string; freshness: { pctUpdated: number } }) : null
  // 2) รันซ้ำ = ไม่เขียน DB
  const r2 = await runDailyPipeline(opts({ date: "2026-09-23" }), deps)
  const c2 = await counts()
  const log2 = JSON.parse(readFileSync(path.join(runsDir, "2026-09-23.json"), "utf8")) as { previousAttempts: unknown[] }
  // 3) ก่อนเวลาข้อมูลปิดตลาดของวันถัดไป + รอบล่าสุดทำแล้ว = ข้าม
  const r3 = await runDailyPipeline(opts({ now: new Date("2026-09-24T03:00:00Z") }), deps)
  const c3 = await counts()
  // 4) วันถัดไป feed ไม่อัปเดต = STALE (exit 5) ไม่รันสมอง
  mode = "same"
  newDate = "2026-09-24"
  const r4 = await runDailyPipeline(opts({ date: "2026-09-24", now: new Date("2026-09-24T11:30:00Z") }), deps)
  // 5) corporate action ในรอบนี้ = ปฏิเสธก่อน ingest (exit 4)
  mode = "split"
  const r5 = await runDailyPipeline(opts({ date: "2026-09-24", now: new Date("2026-09-24T11:30:00Z") }), deps)
  const c5 = await counts()
  // 6) dry-run: ดึง/ตรวจครบ ไม่เขียนอะไร
  mode = "normal"
  const r6 = await runDailyPipeline(opts({ date: "2026-09-24", now: new Date("2026-09-24T11:30:00Z"), dryRun: true }), deps)
  const c6 = await counts()
  // 7) inbox สองแหล่ง (Settrade JSON + settfex CSV) ให้วันเดียวกัน — ต่างกัน 1% หนึ่งตัว
  mkdirSync(inboxDir, { recursive: true })
  const d24 = "2026-09-24"
  const prev = await db.rawDaily.findMany({ where: { date: "2026-09-23" } })
  const px = new Map(prev.map((r) => [r.symbol, r.close]))
  const st = syms.slice(0, 35).map((s) => ({ date: d24, symbol: s, close: Math.round((px.get(s) as number) * 1.01 * 100) / 100, val: 9e6, volume: null }))
  writeFileSync(path.join(inboxDir, `settrade-20260924.json`), JSON.stringify({ source: "settrade", rows: st }))
  const csvRows = syms.slice(20).map((s) => {
    const base = Math.round((px.get(s) as number) * 1.01 * 100) / 100
    return `${d24},${s},,,,${s === "S21" ? Math.round(base * 1.01 * 100) / 100 : base},8000000`
  })
  writeFileSync(path.join(inboxDir, `set-20260924.csv`), ["date,symbol,open,high,low,close,val", ...csvRows].join("\n") + "\n")
  writeFileSync(path.join(inboxDir, `set-20260924.sectors.json`), JSON.stringify({ S20: "Energy" }))
  writeFileSync(path.join(inboxDir, `broken.json`), "{not json")
  const r7 = await runDailyPipeline(opts({ date: d24, now: new Date("2026-09-24T11:30:00Z"), source: "auto" }), deps)
  const c7 = await counts()
  const ingestEv = await db.eventLog.findMany({ where: { kind: "ingest" }, orderBy: { id: "desc" }, take: 2 })
  const sectorS20 = await db.symbolMeta.findUnique({ where: { symbol: "S20" } })

  return {
    c0,
    r1: brief(r1),
    c1,
    log1Status: log1?.status,
    log1Pct: log1?.freshness.pctUpdated,
    brainR1: r1.log.brain,
    trackR1: r1.log.track,
    r2: brief(r2),
    c2,
    prevAttempts: log2.previousAttempts.length,
    r3: brief(r3),
    c3,
    r4: brief(r4),
    r5: brief(r5),
    c5,
    r6: brief(r6),
    c6,
    r7: brief(r7),
    c7,
    recon7: r7.log.reconciliation,
    warnings7: r7.log.warnings,
    archived: existsSync(path.join(inboxDir, "archive", d24)) ? readdirSync(path.join(inboxDir, "archive", d24)).sort() : [],
    rejected: existsSync(path.join(inboxDir, "rejected", d24)) ? readdirSync(path.join(inboxDir, "rejected", d24)) : [],
    inboxLeft: readdirSync(inboxDir).filter((f) => f !== "archive" && f !== "rejected"),
    ingestSources: ingestEv.map((e) => (JSON.parse(e.payload) as { source: string }).source).sort(),
    sectorS20: sectorS20?.sector ?? null,
    backups,
    fetchCalls,
  }
}

main()
  .then((r) => {
    console.log(JSON.stringify(r))
    process.exit(0)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
