// ============================================================
// สายพานปิดตลาดรายวัน (end-of-day pipeline) — ตัวจริงของ scripts/daily.ts
//
//   (a) ปฏิทิน    : รอบซื้อขายที่ต้องประมวลผล · ข้ามเสาร์–อาทิตย์/วันหยุดเมื่อรอบล่าสุดทำไปแล้ว
//   (b) ดึงข้อมูล : Yahoo (.BK) หรือไฟล์ใน inbox จากสคริปต์ Python (settfex / Settrade)
//   (c) ตรวจก่อนเข้า: คุณภาพรายตัว · reconciliation กับค่าที่มีใน DB (จับฐานราคาเปลี่ยน) · corporate action
//       → ingest เฉพาะแถวใหม่/แถวที่เปลี่ยน ผ่านไลบรารีเดียวกับ UI (ingestFeed — ไม่ผ่าน HTTP)
//   (d) freshness + DQ → ปัญหาวิกฤต = หยุด ไม่ป้อนข้อมูลเสียให้สมอง
//   (e) สมอง Jev (POST /api/jev/run in-process) + ให้คะแนนผล (GET /api/verify)
//   (f) track snapshot ลง EventLog  (g) backup ถ้ามีโมดูล  (h) run log JSON + EventLog "daily_run"
//
// ปลอดภัยต่อการรันซ้ำ: ข้อมูลเดิม = ไม่ ingest · Jev มี idempotency guard ต่อวัน · snapshot เดิม = ไม่บันทึก
// → รันซ้ำวันเดียวกันไม่เขียน DB เลย (ยกเว้นมีข้อมูล/การตัดสินใจใหม่จริง)
// ไม่ล้างข้อมูล demo ให้เด็ดขาด (ครั้งแรกใช้ bun run fetch:th -- --replace-demo ที่มี backup/confirm ของระบบ)
// ============================================================

import { promises as fs } from "node:fs"
import path from "node:path"
import { db } from "@/lib/db"
import { closePivot, runDataQualityChecks, type ParsedCsvRow } from "@/lib/momentum/core"
import type { FeedRange, FeedSymbolReport } from "@/lib/momentum/contracts"
import { classifyProvenance } from "@/lib/flagship/funnel"
import { emitEvent } from "@/lib/research/events"
import { buildTrackRecord } from "@/lib/track/record"
import { snapshotTrackRecord } from "@/lib/track/snapshot"
import type { fetchYahooBatch as FetchYahooBatch } from "./yahoo"
import { assessSymbol, flagStale } from "./quality"
import { ingestFeed } from "./ingest"
import { FEED_PRESETS, parseSymbolList } from "./universe"
import {
  bangkokClock,
  EOD_READY_MINUTES,
  expectedLatestSession,
  holidayCoverage,
  isTradingDay,
  type HolidayCalendar,
} from "./calendar"
import { loadHolidayCalendar } from "./calendar-file"
import { activeUniverse, computeFreshness, type FreshnessReport } from "./freshness"
import { mergeByPrecedence, reconcileCloses, summarizeRecon, type ReconSummary, type SourceRows } from "./reconcile"
import { detectCorporateActions, type CorporateActionFlag } from "./corporate-actions"
import { listInbox, moveInboxFiles, readInboxFile, type InboxFile } from "./inbox"
import { dataEpoch } from "./provenance"

// ---------------- สัญญาของสคริปต์ ----------------

/** exit code ของ scripts/daily.ts (บันทึกใน docs/research/market-feed.md ด้วย) */
export const DAILY_EXIT = {
  OK: 0, // สำเร็จ / ไม่มีอะไรเปลี่ยน (รันซ้ำ) / ข้าม (วันหยุด หรือยังไม่ถึงเวลาข้อมูลปิดตลาด และรอบล่าสุดทำไปแล้ว)
  ERROR: 1, // ข้อผิดพลาดที่ไม่คาดคิด
  USAGE: 2, // argument ผิด
  FETCH_FAILED: 3, // ดึงข้อมูลไม่ได้เลย (ถูกบล็อก / ไม่มีเน็ต / inbox ว่าง)
  DQ_CRITICAL: 4, // คุณภาพข้อมูลวิกฤต — ไม่รันสมอง (หุ้นหายเกินเกณฑ์, แหล่งขัดกัน, corporate action, DB จำลอง ฯลฯ)
  STALE: 5, // วันล่าสุดของข้อมูลไม่ขยับถึงรอบที่ควรมี (latest date not advancing)
  BRAIN_FAILED: 6, // /api/jev/run หรือ /api/verify ตอบ error
} as const

export type DailySource = "yahoo" | "inbox" | "auto"
export type DailyStatus = "ok" | "noop" | "skipped" | "failed"
export type StepStatus = "ok" | "noop" | "skipped" | "warn" | "failed" | "critical" | "unavailable"

export interface DailyOptions {
  dryRun: boolean
  skipFetch: boolean
  /** รอบซื้อขายที่ต้องประมวลผล (YYYY-MM-DD) — null = คำนวณจากเวลาปัจจุบัน */
  date: string | null
  /** รายชื่อหุ้น (preset / คั่นด้วย ,) — null = universe ที่ยังซื้อขายอยู่ใน DB */
  symbols: string | null
  source: DailySource
  range: FeedRange
  /** ช่วงที่ดึงใหม่ทั้งประวัติเมื่อพบฐานราคาเปลี่ยน (Yahoo ปรับปันผล/สปลิตย้อนหลัง) */
  rebaseRange: FeedRange
  rebase: boolean
  inboxDir: string
  runsDir: string
  holidaysFile: string | null
  /** % หุ้นใน universe ที่ขาดแท่งของรอบได้สูงสุดก่อนนับเป็นวิกฤต */
  maxMissingPct: number
  /** % หุ้นที่ขัดกับค่าเดิมใน DB (conflict) ได้สูงสุดก่อนปฏิเสธการ ingest */
  maxConflictPct: number
  allowCorporateActions: boolean
  force: boolean
  fetchBudgetMs: number
  now: Date
}

export const DEFAULT_DAILY_OPTIONS: Omit<DailyOptions, "now"> = {
  dryRun: false,
  skipFetch: false,
  date: null,
  symbols: null,
  source: "auto",
  range: "6mo",
  rebaseRange: "max",
  rebase: true,
  inboxDir: path.join("data", "feed", "inbox"),
  runsDir: path.join("data", "runs"),
  holidaysFile: null,
  maxMissingPct: 20,
  maxConflictPct: 20,
  allowCorporateActions: false,
  force: false,
  fetchBudgetMs: 15 * 60_000,
}

export interface DailyDeps {
  fetchYahooBatch: typeof FetchYahooBatch
  /** POST /api/jev/run (in-process) */
  runBrain: () => Promise<Response>
  /** GET /api/verify (in-process) */
  runVerify: () => Promise<Response>
  /** backupDatabase ของ src/lib/ops/backup — null = ไม่มีโมดูล */
  backup: ((opts: { reason?: string }) => Promise<{ file: string; bytes: number } | null>) | null
  log: (line: string) => void
}

export interface DailyStep {
  step: string
  status: StepStatus
  detail: string
  data?: Record<string, unknown>
}

export interface DailyRunLog {
  v: 1
  kind: "daily_run"
  session: string | null
  today: string
  startedAt: string
  finishedAt: string
  tookMs: number
  dryRun: boolean
  database: string
  options: Record<string, unknown>
  status: DailyStatus
  exitCode: number
  exitReason: string
  critical: string[]
  warnings: string[]
  steps: DailyStep[]
  provenance: { label: string; isSynthetic: boolean; latestSource: string | null } | null
  freshness: FreshnessReport | null
  reconciliation: ReconSummary[]
  corporateActions: CorporateActionFlag[]
  brain: Record<string, unknown> | null
  track: Record<string, unknown> | null
  backup: Record<string, unknown> | null
  changed: boolean
  eventEmitted: boolean
  logFile: string | null
  previousAttempts?: { startedAt: string; status: DailyStatus; exitCode: number; exitReason: string }[]
}

// ---------------- pure helpers (ทดสอบได้โดยไม่แตะ DB) ----------------

export interface SessionPlan {
  session: string
  today: string
  todayTrading: boolean
  eodReady: boolean
  /** รันนอกเวลา (วันหยุด หรือก่อนข้อมูลปิดตลาดพร้อม) และไม่ได้ระบุ --date */
  offHours: boolean
  error: string | null
}

/**
 * รอบที่ต้องประมวลผล: --date ถ้าระบุ (ต้องเป็นวันซื้อขาย เว้นแต่ --force) ไม่งั้นรอบล่าสุดที่ข้อมูลปิดตลาดควรพร้อม
 * (เสาร์ → ศุกร์ · ก่อน 17:30 ของวันซื้อขาย → วันซื้อขายก่อนหน้า) — ไม่เคยประมวลผลแท่งระหว่างวัน
 */
export function resolveSession(input: { now: Date; date: string | null; force: boolean; calendar: HolidayCalendar }): SessionPlan {
  const clock = bangkokClock(input.now)
  const todayTrading = isTradingDay(clock.date, input.calendar)
  const eodReady = clock.minutes >= EOD_READY_MINUTES
  if (input.date) {
    const ok = isTradingDay(input.date, input.calendar)
    return {
      session: input.date,
      today: clock.date,
      todayTrading,
      eodReady,
      offHours: false,
      error: !ok && !input.force ? `--date ${input.date} ไม่ใช่วันซื้อขายของ SET (เสาร์–อาทิตย์/วันหยุด) — ใช้ --force ถ้าต้องการจริง` : null,
    }
  }
  return {
    session: expectedLatestSession(input.now, input.calendar),
    today: clock.date,
    todayTrading,
    eodReady,
    offHours: !todayTrading || !eodReady,
    error: null,
  }
}

export interface IngestPlan {
  rows: ParsedCsvRow[]
  newRows: number
  changedRows: number
  unchanged: number
}

/** เทียบแถวที่เข้ามากับ DB — เก็บเฉพาะแถวใหม่/แถวที่ค่าเปลี่ยน (กติกาเดียวกับ mergeSymbol: OHLC ว่าง = คงค่าเดิม) */
export function planIngest(
  incoming: ParsedCsvRow[],
  dbRows: { date: string; symbol: string; close: number; val: number; open: number | null; high: number | null; low: number | null }[],
): IngestPlan {
  const have = new Map(dbRows.map((r) => [`${r.date}|${r.symbol}`, r]))
  const seen = new Map<string, ParsedCsvRow>()
  for (const r of incoming) seen.set(`${r.date}|${r.symbol}`, r) // แถวซ้ำในชุด: แถวหลังชนะ (เหมือน ingestRows)
  const rows: ParsedCsvRow[] = []
  let newRows = 0
  let changedRows = 0
  let unchanged = 0
  const diff = (a: number | null | undefined, b: number | null | undefined) =>
    a !== null && a !== undefined && (b === null || b === undefined || Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b)))
  for (const [key, r] of seen) {
    const d = have.get(key)
    if (!d) {
      newRows++
      rows.push(r)
    } else if (diff(r.close, d.close) || diff(r.val, d.val) || diff(r.open, d.open) || diff(r.high, d.high) || diff(r.low, d.low)) {
      changedRows++
      rows.push(r)
    } else unchanged++
  }
  return { rows, newRows, changedRows, unchanged }
}

// ---------------- DB helpers ----------------

async function dbLastDates(): Promise<Map<string, string>> {
  const g = await db.rawDaily.groupBy({ by: ["symbol"], _max: { date: true } })
  const m = new Map<string, string>()
  for (const r of g) if (r._max.date) m.set(r.symbol, r._max.date)
  return m
}

async function dbRowsFor(symbols: string[], minDate: string, maxDate: string) {
  const out: { date: string; symbol: string; close: number; val: number; open: number | null; high: number | null; low: number | null }[] = []
  for (let i = 0; i < symbols.length; i += 400) {
    out.push(
      ...(await db.rawDaily.findMany({
        where: { symbol: { in: symbols.slice(i, i + 400) }, date: { gte: minDate, lte: maxDate } },
        select: { date: true, symbol: true, close: true, val: true, open: true, high: true, low: true },
      })),
    )
  }
  return out
}

/** ราคาปิดล่าสุดใน DB ก่อนวันที่ before ต่อหุ้น (ฐานเทียบ corporate action ของแท่งแรกที่เข้ามา) */
async function dbPrevCloses(symbols: string[], before: string): Promise<{ date: string; symbol: string; close: number }[]> {
  const out: { date: string; symbol: string; close: number }[] = []
  const pivot = await closePivot()
  let bi = -1
  for (let i = pivot.dates.length - 1; i >= 0; i--)
    if (pivot.dates[i] < before) {
      bi = i
      break
    }
  if (bi < 0) return out
  for (const sym of symbols) {
    const si = pivot.symIdx.get(sym)
    if (si === undefined) continue
    for (let k = bi; k >= Math.max(0, bi - 60); k--) {
      const v = pivot.px[k][si]
      if (Number.isFinite(v) && v > 0) {
        out.push({ date: pivot.dates[k], symbol: sym, close: v })
        break
      }
    }
  }
  return out
}

/** corporate action ของรอบ session จากราคาใน DB (ใช้เมื่อ --skip-fetch) */
async function sessionCorporateActions(session: string, calendar: HolidayCalendar): Promise<CorporateActionFlag[]> {
  const pivot = await closePivot()
  const si = pivot.dateIdx.get(session)
  if (si === undefined) return []
  const rows: { date: string; symbol: string; close: number }[] = []
  for (let i = Math.max(0, si - 60); i <= si; i++) {
    for (let s = 0; s < pivot.symbols.length; s++) {
      const v = pivot.px[i][s]
      if (Number.isFinite(v) && v > 0) rows.push({ date: pivot.dates[i], symbol: pivot.symbols[s], close: v })
    }
  }
  return detectCorporateActions(rows, { since: session, calendar }).filter((f) => f.date === session)
}

async function sessionProcessed(session: string): Promise<boolean> {
  const [agg, run] = await Promise.all([
    db.rawDaily.aggregate({ _max: { date: true } }),
    db.decision.findFirst({ where: { question: "Q_REGIME", date: { gte: session } }, select: { id: true } }),
  ])
  return (agg._max.date ?? "") >= session && !!run
}

function dbFileOf(url: string | undefined): string {
  return (url ?? "").replace(/^file:/, "") || "(DATABASE_URL ไม่ได้ตั้ง)"
}

// ---------------- pipeline ----------------

export async function runDailyPipeline(opts: DailyOptions, deps: DailyDeps): Promise<{ exitCode: number; log: DailyRunLog }> {
  const t0 = Date.now()
  const steps: DailyStep[] = []
  const critical: string[] = []
  const warnings: string[] = []
  const reconciliation: ReconSummary[] = []
  let corporateActions: CorporateActionFlag[] = []
  let freshness: FreshnessReport | null = null
  let provenance: DailyRunLog["provenance"] = null
  let brain: DailyRunLog["brain"] = null
  let track: DailyRunLog["track"] = null
  let backup: DailyRunLog["backup"] = null
  let changed = false
  let exitCode: number = DAILY_EXIT.OK
  let exitReason = ""
  let status: DailyStatus = "ok"
  const step = (s: DailyStep) => {
    steps.push(s)
    deps.log(`  [${s.status.toUpperCase().padEnd(11)}] ${s.step}: ${s.detail}`)
  }
  const fail = (code: number, reason: string) => {
    exitCode = code
    exitReason = reason
    status = "failed"
  }

  const cal = await loadHolidayCalendar(opts.holidaysFile)
  if (cal.error) warnings.push(cal.error)
  if (cal.invalid.length) warnings.push(`ไฟล์วันหยุดมีวันที่รูปแบบผิด ${cal.invalid.length} รายการ: ${cal.invalid.slice(0, 5).join(", ")}`)
  const plan = resolveSession({ now: opts.now, date: opts.date, force: opts.force, calendar: cal.calendar })
  const session = plan.session
  let inboxUsed: InboxFile[] = []
  let inboxToArchive = false

  try {
    // ---------- (a) ปฏิทิน ----------
    const cov = holidayCoverage(session, cal.calendar)
    if (!cov.covered && cov.note) warnings.push(cov.note)
    if (plan.error) {
      step({ step: "calendar", status: "skipped", detail: plan.error })
      status = "skipped"
      exitReason = plan.error
      return await finish()
    }
    if (plan.offHours && !opts.force && (await sessionProcessed(session))) {
      const why = !plan.todayTrading ? `วันนี้ (${plan.today}) ไม่ใช่วันซื้อขาย` : `ยังไม่ถึงเวลาข้อมูลปิดตลาด (${Math.floor(EOD_READY_MINUTES / 60)}:${String(EOD_READY_MINUTES % 60).padStart(2, "0")} น.)`
      const msg = `${why} และรอบล่าสุด ${session} ประมวลผลแล้ว — ไม่มีอะไรต้องทำ`
      step({ step: "calendar", status: "skipped", detail: msg })
      status = "skipped"
      exitReason = msg
      return await finish()
    }
    step({
      step: "calendar",
      status: "ok",
      detail: `รอบ ${session}${opts.date ? " (--date)" : ""} · วันนี้ ${plan.today}${plan.todayTrading ? "" : " (ไม่ใช่วันซื้อขาย)"} · ปฏิทินวันหยุด ${cal.calendar.source}${cal.file ? ` (${cal.file})` : ""}`,
      data: { session, today: plan.today, todayTrading: plan.todayTrading, eodReady: plan.eodReady, holidayYears: cal.calendar.years },
    })

    // ---------- provenance guard ----------
    const [rawRows, provEvents] = await Promise.all([
      db.rawDaily.count(),
      db.eventLog.findMany({ where: { kind: { in: ["seed", "ingest"] } }, select: { id: true, kind: true, payload: true, ts: true }, orderBy: { id: "asc" } }),
    ])
    const prov = classifyProvenance(provEvents, rawRows)
    const epoch = dataEpoch(provEvents)
    provenance = { label: prov.dataLabel, isSynthetic: prov.isSynthetic, latestSource: epoch.latestSource }
    if (!opts.skipFetch && rawRows > 0 && prov.isSynthetic) {
      const msg = `ฐานข้อมูลเป็น ${prov.dataLabel} — ไม่นำข้อมูลจริงมาปนกับหุ้นจำลอง: ครั้งแรกให้รัน bun run fetch:th -- --symbols SET50 --range 5y --replace-demo (มี backup + confirm) แล้วค่อยใช้ daily · หรือรัน daily ด้วย --skip-fetch เพื่อทดสอบบนข้อมูลจำลอง`
      step({ step: "provenance", status: "critical", detail: msg })
      critical.push(msg)
      fail(DAILY_EXIT.DQ_CRITICAL, msg)
      return await finish()
    }
    step({ step: "provenance", status: prov.isSynthetic ? "warn" : "ok", detail: `${prov.dataLabel}${epoch.latestSource ? ` · แหล่งล่าสุด ${epoch.latestSource}` : ""}` })
    if (prov.isSynthetic && rawRows > 0) warnings.push(`ข้อมูลเป็น ${prov.dataLabel} — ผลของสมอง/track record ทั้งหมดเป็นของจำลอง ไม่ใช่หลักฐาน`)

    // ---------- (b)(c) ดึง → ตรวจ → ingest ----------
    const lastBefore = await dbLastDates()
    let dbLatestBefore: string | null = null
    for (const d of lastBefore.values()) if (!dbLatestBefore || d > dbLatestBefore) dbLatestBefore = d
    let universe: string[] = []
    if (opts.symbols) {
      const p = parseSymbolList(opts.symbols)
      universe = p.symbols
      if (p.invalid.length) warnings.push(`ข้ามสัญลักษณ์รูปแบบผิด: ${p.invalid.join(", ")}`)
    }
    let incomingLast: Map<string, string> | null = null

    if (opts.skipFetch) {
      step({ step: "fetch", status: "skipped", detail: "--skip-fetch — ใช้ข้อมูลใน DB ตามที่มี" })
      step({ step: "ingest", status: "skipped", detail: "--skip-fetch" })
    } else {
      const inboxFiles = opts.source === "yahoo" ? [] : await listInbox(opts.inboxDir)
      const source: "yahoo" | "inbox" = opts.source === "inbox" ? "inbox" : opts.source === "yahoo" ? "yahoo" : inboxFiles.length > 0 ? "inbox" : "yahoo"
      let sets: SourceRows<ParsedCsvRow>[] = []
      let reports: FeedSymbolReport[] = []
      let sectors: Record<string, string> | undefined

      if (source === "yahoo") {
        if (universe.length === 0) universe = activeUniverse(lastBefore, dbLatestBefore, cal.calendar)
        if (universe.length === 0) universe = FEED_PRESETS.find((p) => p.id === "CORE")?.symbols ?? []
        const range: FeedRange = rawRows === 0 ? "5y" : opts.range
        deps.log(`  … ดึง Yahoo ${universe.length} ตัว · range ${range}`)
        const batch = await deps.fetchYahooBatch(universe, range, { adjusted: true, deadline: Date.now() + opts.fetchBudgetMs })
        reports = batch.reports
        if (batch.rows.length === 0) {
          const msg = batch.blocked
            ? "เข้าถึง Yahoo ไม่ได้ (ถูกบล็อก/ไม่มีเน็ต) — รันบนเครื่องที่เข้าเน็ตได้ หรือวางไฟล์จาก lab/fetch_set_feed.py ลง inbox แล้วใช้ --source inbox"
            : "ไม่ได้ข้อมูลจาก Yahoo เลย — ตรวจรายชื่อหุ้น"
          step({ step: "fetch", status: "failed", detail: msg, data: { requested: universe.length, failed: reports.filter((r) => !r.ok).length } })
          fail(DAILY_EXIT.FETCH_FAILED, msg)
          return await finish()
        }
        sets = [{ source: "yahoo", rows: batch.rows }]
        const failedSyms = reports.filter((r) => !r.ok)
        step({
          step: "fetch",
          status: failedSyms.length > 0 ? "warn" : "ok",
          detail: `Yahoo ${universe.length - failedSyms.length}/${universe.length} ตัว · ${batch.rows.length.toLocaleString()} แถว`,
          data: { source, range, requested: universe.length, rows: batch.rows.length, failed: failedSyms.map((r) => `${r.symbol}: ${r.error ?? ""}`).slice(0, 30) },
        })
      } else {
        if (inboxFiles.length === 0) {
          const msg = `inbox ว่าง (${opts.inboxDir}) — ให้สคริปต์ Python เขียนไฟล์ลงโฟลเดอร์นี้ หรือใช้ --source yahoo`
          step({ step: "fetch", status: "failed", detail: msg })
          fail(DAILY_EXIT.FETCH_FAILED, msg)
          return await finish()
        }
        const parsed = await Promise.all(inboxFiles.map((f) => readInboxFile(f)))
        const bad = parsed.filter((p) => p.error || p.rows.length === 0)
        const good = parsed.filter((p) => !p.error && p.rows.length > 0)
        for (const p of parsed) for (const n of p.notes) warnings.push(`${p.file}: ${n}`)
        if (bad.length > 0 && !opts.dryRun) {
          const rejected = inboxFiles.filter((f) => bad.some((b) => b.file === f.name))
          await moveInboxFiles(rejected, path.join(opts.inboxDir, "rejected", session))
        }
        for (const b of bad) warnings.push(`ไฟล์ ${b.file} ใช้ไม่ได้: ${b.error ?? "ไม่มีแถวที่ถูกต้อง"}${opts.dryRun ? "" : " (ย้ายไป rejected/)"}`)
        if (good.length === 0) {
          const msg = "ไม่มีไฟล์ใน inbox ที่ใช้ได้"
          step({ step: "fetch", status: "failed", detail: msg })
          fail(DAILY_EXIT.FETCH_FAILED, msg)
          return await finish()
        }
        inboxUsed = inboxFiles.filter((f) => good.some((g) => g.file === f.name))
        const bySrc = new Map<string, ParsedCsvRow[]>()
        for (const g of good) {
          bySrc.set(g.source, [...(bySrc.get(g.source) ?? []), ...g.rows])
          if (g.sectors) sectors = { ...(sectors ?? {}), ...g.sectors }
        }
        sets = [...bySrc.entries()].map(([s, rows]) => ({ source: s, rows }))
        // หลายแหล่งให้วัน/หุ้นเดียวกัน → reconcile ทุกคู่ก่อนผสาน
        for (let i = 0; i < sets.length; i++)
          for (let j = i + 1; j < sets.length; j++) {
            const r = reconcileCloses(sets[i], sets[j])
            if (r.compared > 0) reconciliation.push(summarizeRecon(r))
            if (r.flagged > 0) {
              warnings.push(
                `${sets[i].source} vs ${sets[j].source}: ราคาปิดต่าง > ${r.tolerancePct}% ${r.flagged}/${r.compared} คู่ (${r.flaggedPairs.slice(0, 5).map((p) => `${p.symbol} ${p.date} ${p.diffPct}%`).join(", ")}) — ใช้ค่าของแหล่งที่เชื่อถือได้กว่าตามลำดับ precedence (ทางการก่อน) · ตรวจแหล่งที่ผิด`,
              )
            }
          }
        const bySym = new Map<string, ParsedCsvRow[]>()
        for (const s of sets) for (const r of s.rows) bySym.set(r.symbol, [...(bySym.get(r.symbol) ?? []), r])
        reports = [...bySym.entries()].map(([sym, rows]) => assessSymbol(sym, rows))
        if (universe.length === 0) universe = activeUniverse(lastBefore, dbLatestBefore, cal.calendar)
        step({
          step: "fetch",
          status: "ok",
          detail: `inbox ${good.length} ไฟล์ (${sets.map((s) => `${s.source}: ${s.rows.length.toLocaleString()} แถว`).join(" · ")})`,
          data: { source, files: good.map((g) => g.file), rejected: bad.map((b) => b.file) },
        })
      }

      // ผสานหลายแหล่ง + ตัดแท่งหลังรอบ (แท่งระหว่างวันของ Yahoo / --date ย้อนหลัง)
      const merged = mergeByPrecedence(sets)
      const future = merged.rows.filter((r) => r.date > session).length
      let incoming = merged.rows.filter((r) => r.date <= session)
      if (future > 0) warnings.push(`ตัด ${future} แถวที่ลงวันหลังรอบ ${session} (แท่งระหว่างวัน/อนาคต) — ไม่ ingest`)
      const staleReports = flagStale(reports)
      const warnSyms = staleReports.filter((r) => r.ok && r.warnings.length > 0)
      if (warnSyms.length > 0) warnings.push(`คำเตือนคุณภาพรายตัว ${warnSyms.length} ตัว: ${warnSyms.slice(0, 5).map((r) => `${r.symbol} (${r.warnings[0]})`).join(" · ")}`)

      // reconciliation กับค่าที่มีอยู่ใน DB (ช่วงวันที่ซ้อนกัน)
      const srcLabel = sets.length === 1 ? sets[0].source : "inbox"
      const incSyms = [...new Set(incoming.map((r) => r.symbol))]
      const minDate = incoming.reduce((m, r) => (r.date < m ? r.date : m), "9999-12-31")
      const maxDate = incoming.reduce((m, r) => (r.date > m ? r.date : m), "0000-01-01")
      let dbRows = incoming.length > 0 ? await dbRowsFor(incSyms, minDate, maxDate) : []
      const recDb = reconcileCloses({ source: srcLabel, rows: incoming }, { source: "db", rows: dbRows })
      if (recDb.compared > 0) reconciliation.push(summarizeRecon(recDb))
      const rebasedSyms = recDb.bySymbol.filter((s) => s.kind === "rebased" || s.kind === "rescaled").map((s) => s.symbol)
      const conflictSyms = recDb.bySymbol.filter((s) => s.kind === "conflict").map((s) => s.symbol)
      if (rebasedSyms.length > 0) {
        if (source === "yahoo" && opts.rebase && !opts.dryRun) {
          deps.log(`  … ฐานราคาเปลี่ยน ${rebasedSyms.length} ตัว → ดึงประวัติเต็ม (${opts.rebaseRange})`)
          const re = await deps.fetchYahooBatch(rebasedSyms, opts.rebaseRange, { adjusted: true, deadline: Date.now() + opts.fetchBudgetMs })
          const got = new Set(re.rows.map((r) => r.symbol))
          incoming = [...incoming.filter((r) => !got.has(r.symbol)), ...re.rows.filter((r) => r.date <= session)]
          const missed = rebasedSyms.filter((s) => !got.has(s))
          warnings.push(
            `ฐานราคาเปลี่ยน (ปันผล/สปลิตถูกปรับย้อนหลัง) ${rebasedSyms.length} ตัว → ดึงประวัติเต็มใหม่ ${got.size} ตัว${missed.length ? ` · ดึงไม่ได้ ${missed.join(", ")} (ประวัติยังคนละฐาน)` : ""}`,
          )
          if (got.size > 0) {
            const minRe = re.rows.reduce((m, r) => (r.date < m ? r.date : m), minDate)
            dbRows = await dbRowsFor([...new Set(incoming.map((r) => r.symbol))], minRe < minDate ? minRe : minDate, maxDate)
          }
        } else {
          warnings.push(
            `ฐานราคาของแหล่ง ${srcLabel} ต่างจากประวัติใน DB ${rebasedSyms.length} ตัว (${rebasedSyms.slice(0, 8).join(", ")}) — ${source === "yahoo" ? (opts.dryRun ? "dry-run: จะดึงประวัติเต็มใหม่" : "--no-rebase: ไม่ดึงประวัติเต็ม") : "ส่งออกประวัติเต็มจากแหล่งเดียวกันแล้วนำเข้าใหม่ อย่าผสมราคาดิบกับราคาปรับแล้ว"}`,
          )
        }
      }
      const conflictPct = recDb.symbols > 0 ? (conflictSyms.length / recDb.symbols) * 100 : 0
      if (conflictSyms.length > 0) warnings.push(`ราคาขัดกับค่าเดิมใน DB ${conflictSyms.length} ตัว: ${conflictSyms.slice(0, 8).join(", ")}`)
      step({
        step: "reconcile",
        status: conflictPct > opts.maxConflictPct ? "critical" : recDb.flagged > 0 ? "warn" : recDb.compared > 0 ? "ok" : "skipped",
        detail:
          recDb.compared > 0
            ? `${srcLabel} vs DB: เทียบ ${recDb.compared.toLocaleString()} คู่ · ต่าง > ${recDb.tolerancePct}% ${recDb.flagged} คู่ · ตรง ${recDb.counts.match} · ฐานเปลี่ยน ${recDb.counts.rebased + recDb.counts.rescaled} · ขัดกัน ${recDb.counts.conflict}`
            : "ไม่มีวัน/หุ้นซ้อนกับ DB ให้เทียบ",
        data: { counts: recDb.counts, rebased: rebasedSyms, conflicts: conflictSyms },
      })
      if (conflictPct > opts.maxConflictPct) {
        const msg = `แหล่ง ${srcLabel} ขัดกับข้อมูลเดิม ${conflictPct.toFixed(0)}% ของหุ้น (> ${opts.maxConflictPct}%) — ไม่ ingest (ตรวจแหล่งก่อน)`
        critical.push(msg)
        fail(DAILY_EXIT.DQ_CRITICAL, msg)
        return await finish()
      }

      // corporate action ในแถวที่เข้ามา (รวมรอยต่อกับราคาปิดล่าสุดใน DB)
      const prevCloses = incoming.length > 0 ? await dbPrevCloses([...new Set(incoming.map((r) => r.symbol))], incoming.reduce((m, r) => (r.date < m ? r.date : m), "9999-12-31")) : []
      corporateActions = detectCorporateActions([...prevCloses, ...incoming], { calendar: cal.calendar })
      // ราคาเกินเพดาน/พื้นในรอบนี้ = ข้อมูลน่าสงสัย → ปฏิเสธ "ก่อน" เขียน DB (ไม่ให้โมดูลอื่น/ปุ่มบน UI เห็นราคาเพี้ยน)
      const uniPre = new Set(universe.length > 0 ? universe : incSyms)
      const caPre = corporateActions.filter((f) => f.date === session && uniPre.has(f.symbol))
      if (caPre.length > 0 && !opts.allowCorporateActions) {
        const msg = `ราคาเปลี่ยนเกินเพดาน/พื้น ±30% ในรอบ ${session} ${caPre.length} ตัว (${caPre.slice(0, 5).map((f) => `${f.symbol} ${f.changePct}%`).join(", ")}) — น่าจะเป็น corporate action ที่ยังไม่ปรับราคา: ไม่ ingest · ใช้ข้อมูลปรับแล้ว หรือ --allow-corporate-actions ถ้าตรวจกับประกาศ SET แล้ว`
        step({ step: "ingest", status: "critical", detail: msg })
        critical.push(msg)
        fail(DAILY_EXIT.DQ_CRITICAL, msg)
        return await finish()
      }

      // ingest เฉพาะแถวใหม่/แถวที่เปลี่ยน
      const planIn = planIngest(incoming, dbRows)
      if (planIn.rows.length === 0) {
        step({ step: "ingest", status: "noop", detail: `ไม่มีข้อมูลใหม่ (${planIn.unchanged.toLocaleString()} แถวตรงกับ DB อยู่แล้ว)`, data: { ...planIn, rows: 0 } })
        inboxToArchive = true
      } else if (opts.dryRun) {
        step({ step: "ingest", status: "skipped", detail: `dry-run — จะ ingest ${planIn.newRows} แถวใหม่ · ${planIn.changedRows} แถวที่เปลี่ยน`, data: { newRows: planIn.newRows, changedRows: planIn.changedRows } })
        incomingLast = new Map(lastBefore)
        for (const r of planIn.rows) if ((incomingLast.get(r.symbol) ?? "") < r.date) incomingLast.set(r.symbol, r.date)
      } else {
        const keep = new Set(planIn.rows.map((r) => `${r.date}|${r.symbol}`))
        const groups = sets.length === 1 ? [{ source: sets[0].source, rows: planIn.rows }] : merged.groups.map((g) => ({ source: g.source, rows: g.rows.filter((r) => keep.has(`${r.date}|${r.symbol}`)) }))
        // แถวจากการดึงประวัติเต็ม (rebase) ไม่อยู่ใน merged.groups — ใส่รวมกับกลุ่มของแหล่งนั้น
        const covered = new Set(groups.flatMap((g) => g.rows.map((r) => `${r.date}|${r.symbol}`)))
        const rest = planIn.rows.filter((r) => !covered.has(`${r.date}|${r.symbol}`))
        if (rest.length > 0) groups.push({ source: srcLabel === "inbox" ? "external" : srcLabel, rows: rest })
        let inserted = 0
        let snapDates = 0
        let latestDate: string | null = null
        for (const g of groups) {
          if (g.rows.length === 0) continue
          const res = await ingestFeed({ rows: g.rows, source: g.source, actor: "system", sectors })
          inserted += res.ingest.insertedRaw
          snapDates += res.ingest.snapDates.length
          if (res.latestDate && (!latestDate || res.latestDate > latestDate)) latestDate = res.latestDate
        }
        changed = true
        inboxToArchive = true
        step({
          step: "ingest",
          status: "ok",
          detail: `ingest ${inserted.toLocaleString()} แถว (ใหม่ ${planIn.newRows} · เปลี่ยน ${planIn.changedRows}) · สร้างโผ ${snapDates} วัน · ล่าสุด ${latestDate ?? "—"}`,
          data: { newRows: planIn.newRows, changedRows: planIn.changedRows, snapDates, latestDate, sources: groups.map((g) => `${g.source}:${g.rows.length}`) },
        })
      }
      if (inboxToArchive && inboxUsed.length > 0 && !opts.dryRun) {
        if (future > 0) {
          // ไฟล์มีแถวของรอบถัดไป — คงไว้ใน inbox จนกว่าทุกแถวจะถึงรอบ (รันซ้ำแถวเดิม = ไม่ ingest ซ้ำ)
          step({ step: "inbox", status: "warn", detail: `คงไฟล์ ${inboxUsed.length} ไฟล์ไว้ใน inbox — มี ${future} แถวของรอบหลัง ${session}` })
        } else {
          const moved = await moveInboxFiles(inboxUsed, path.join(opts.inboxDir, "archive", session))
          step({ step: "inbox", status: "ok", detail: `ย้าย ${inboxUsed.length} ไฟล์ไป ${path.join(opts.inboxDir, "archive", session)}`, data: { moved } })
        }
      }
    }

    // ---------- (d) freshness + DQ ----------
    const lastAfter = incomingLast ?? (await dbLastDates())
    freshness = computeFreshness({
      now: opts.now,
      lastDateBySymbol: lastAfter,
      universe: opts.symbols ? universe : undefined,
      expectedSession: session,
      calendar: cal.calendar,
    })
    if (opts.skipFetch) corporateActions = await sessionCorporateActions(session, cal.calendar)
    const dq = await runDataQualityChecks()
    const dqCritical = dq.checks.filter((c) => !c.ok && (c.name.includes("ซ้ำ") || c.name.includes("ตัวกรอง")))
    const dqWarn = dq.checks.filter((c) => !c.ok && !dqCritical.includes(c))
    for (const c of dqWarn) warnings.push(`DQ: ${c.name} — ${c.detail}`)
    const universeSet = new Set(freshness.universeSize > 0 ? [...(opts.symbols ? universe : activeUniverse(lastAfter, freshness.dbLatest, cal.calendar))] : [])
    const caSession = corporateActions.filter((f) => f.date === session && (universeSet.size === 0 || universeSet.has(f.symbol)))
    const caOld = corporateActions.filter((f) => !caSession.includes(f))
    if (caOld.length > 0) warnings.push(`corporate action ในข้อมูลย้อนหลัง ${caOld.length} จุด (เช่น ${caOld.slice(0, 3).map((f) => `${f.symbol} ${f.date} ${f.changePct}%`).join(", ")})`)

    const qCritical: { code: number; msg: string }[] = []
    if (freshness.dbLatest === null) qCritical.push({ code: DAILY_EXIT.DQ_CRITICAL, msg: "ฐานข้อมูลไม่มีข้อมูลตลาด" })
    else if (freshness.dbLatest < session)
      qCritical.push({
        code: DAILY_EXIT.STALE,
        msg: `ข้อมูลล่าสุด ${freshness.dbLatest} ยังไม่ถึงรอบ ${session} (ตามหลัง ${freshness.lagSessions} วันซื้อขาย) — latest date ไม่ขยับ: feed ยังไม่อัปเดต หรือวันนี้เป็นวันหยุดที่ไม่อยู่ในปฏิทิน`,
      })
    else if (freshness.pctUpdated !== null && freshness.pctUpdated < 100 - opts.maxMissingPct)
      qCritical.push({
        code: DAILY_EXIT.DQ_CRITICAL,
        msg: `หุ้นใน universe มีแท่งของรอบ ${session} เพียง ${freshness.pctUpdated}% (${freshness.updated}/${freshness.universeSize}) — ขาดเกิน ${opts.maxMissingPct}%`,
      })
    for (const c of dqCritical) qCritical.push({ code: DAILY_EXIT.DQ_CRITICAL, msg: `DQ วิกฤต: ${c.name} — ${c.detail}` })
    if (caSession.length > 0 && !opts.allowCorporateActions)
      qCritical.push({
        code: DAILY_EXIT.DQ_CRITICAL,
        msg: `ราคาเปลี่ยนเกินเพดาน/พื้น ±30% ในรอบ ${session} ${caSession.length} ตัว (${caSession.slice(0, 5).map((f) => `${f.symbol} ${f.changePct}%`).join(", ")}) — น่าจะเป็น corporate action ที่ยังไม่ปรับราคา (ข้อมูลอยู่ใน DB แล้ว) · นำเข้าข้อมูลปรับแล้วทับ หรือ --allow-corporate-actions ถ้าตรวจแล้ว`,
      })
    else if (caSession.length > 0) warnings.push(`อนุญาต corporate action ในรอบนี้ ${caSession.length} ตัว (--allow-corporate-actions)`)
    step({
      step: "quality",
      status: qCritical.length > 0 ? "critical" : dqWarn.length > 0 || freshness.status !== "fresh" ? "warn" : "ok",
      detail: `ข้อมูลล่าสุด ${freshness.dbLatest ?? "—"} (รอบ ${session}) · อัปเดต ${freshness.pctUpdated ?? "—"}% ของ ${freshness.universeSize} ตัว · ค้าง ≥5 วัน ${freshness.counts.stale} ตัว · DQ เตือน ${dqWarn.length} · CA รอบนี้ ${caSession.length}`,
      data: { freshness: { status: freshness.status, lag: freshness.lagSessions, pctUpdated: freshness.pctUpdated }, dqFlags: dq.flags },
    })
    if (qCritical.length > 0) {
      for (const c of qCritical) critical.push(c.msg)
      fail(qCritical[0].code, qCritical[0].msg)
      step({ step: "brain", status: "skipped", detail: "ไม่รันสมองบนข้อมูลที่ไม่ผ่านเกณฑ์" })
      return await finish()
    }

    // ---------- (e) สมอง Jev + verify ----------
    const latestSnap = (await db.snapshot.aggregate({ _max: { date: true } }))._max.date
    // เหมือน guard ของ /api/jev/run: Decision ของมนุษย์ (อนุมัติหลังข้อมูลเข้า) และแถวเติม/ยกเลิกคำสั่ง T+1 ไม่ใช่หลักฐานว่ารอบนี้รันแล้ว
    const alreadyRan = latestSnap
      ? !!(await db.decision.findFirst({
          where: { date: latestSnap, question: "Q_ENTRY", source: { not: "human" }, action: { notIn: ["fill", "cancel"] } },
          select: { id: true },
        }))
      : false
    if (opts.dryRun) {
      step({ step: "brain", status: "skipped", detail: `dry-run — จะรัน Jev บนโผวันที่ ${latestSnap ?? "—"}${alreadyRan ? " (รันไปแล้ว = ไม่ทำอะไร)" : ""}` })
      step({ step: "verify", status: "skipped", detail: "dry-run" })
      brain = { date: latestSnap, wouldRun: !alreadyRan }
    } else {
      const res = await deps.runBrain()
      const j = (await res.json().catch(() => null)) as
        | { date?: string; regime?: string; message?: string; executed?: unknown[]; gated?: unknown[]; blocked?: unknown[]; error?: string }
        | null
      if (!res.ok || !j || j.error) {
        const msg = `/api/jev/run ตอบ ${res.status}: ${j?.error ?? "รูปแบบไม่ถูกต้อง"}`
        step({ step: "brain", status: "failed", detail: msg })
        fail(DAILY_EXIT.BRAIN_FAILED, msg)
        return await finish()
      }
      const idempotent = alreadyRan || (j.message ?? "").includes("รันไปแล้ว")
      brain = {
        date: j.date ?? null,
        regime: j.regime ?? null,
        message: j.message ?? "",
        executed: j.executed?.length ?? 0,
        gated: j.gated?.length ?? 0,
        blocked: j.blocked?.length ?? 0,
        idempotent,
      }
      if (!idempotent) changed = true
      if (j.date && j.date !== session) warnings.push(`Jev ตัดสินใจบนโผวันที่ ${j.date} ไม่ใช่รอบ ${session} (วันนั้นไม่มีโผ เช่นวันหยุดที่มีแถวราคาแต่ไม่มีสภาพคล่อง)`)
      step({ step: "brain", status: idempotent ? "noop" : "ok", detail: idempotent ? `รันไปแล้วสำหรับ ${j.date} — ไม่ทำซ้ำ` : `${j.date}: ${j.message}` })

      const vr = await deps.runVerify()
      const vj = (await vr.json().catch(() => null)) as { total?: number; brier?: number | null; error?: string } | null
      if (!vr.ok || !vj || vj.error) {
        const msg = `/api/verify ตอบ ${vr.status}: ${vj?.error ?? "รูปแบบไม่ถูกต้อง"}`
        step({ step: "verify", status: "failed", detail: msg })
        fail(DAILY_EXIT.BRAIN_FAILED, msg)
        return await finish()
      }
      step({ step: "verify", status: "ok", detail: `ให้คะแนนแล้ว ${vj.total ?? 0} การตัดสินใจ · Brier ${vj.brier ?? "—"}` })
      brain.verify = { total: vj.total ?? 0, brier: vj.brier ?? null }
    }

    // ---------- (f) track snapshot ----------
    const rec = await buildTrackRecord()
    const snap = await snapshotTrackRecord({ actor: "daily", dryRun: opts.dryRun, record: rec })
    if (snap.emitted) changed = true
    track = {
      status: rec.status,
      evidenceLabel: rec.provenance.evidenceLabel,
      liveSince: rec.liveSince,
      sessions: rec.sessions,
      nav: rec.nav[rec.nav.length - 1]?.nav ?? null,
      bench: rec.nav[rec.nav.length - 1]?.bench ?? null,
      closedTrades: rec.stats.closedTrades,
      openTrades: rec.stats.openTrades,
      verdict: rec.confidence.verdict,
      ledgerHash: rec.tamper.ledgerHash,
      auditOk: rec.tamper.audit.ok,
      snapshot: { emitted: snap.emitted, reason: snap.reason },
    }
    step({
      step: "track",
      status: snap.emitted ? "ok" : rec.status === "OK" ? "noop" : "skipped",
      detail: `${rec.provenance.evidenceLabel} · ${rec.status}${rec.status === "OK" ? ` · ${rec.sessions} วัน · NAV ${track.nav}` : ""} · ${rec.confidence.verdict} · snapshot: ${snap.reason}`,
    })

    // ---------- (g) backup ----------
    if (opts.dryRun) {
      step({ step: "backup", status: "skipped", detail: "dry-run" })
    } else if (!deps.backup) {
      backup = { available: false }
      step({ step: "backup", status: "unavailable", detail: "ไม่มีโมดูล src/lib/ops/backup — ข้าม" })
    } else if (!changed) {
      backup = { available: true, skipped: "no-change" }
      step({ step: "backup", status: "skipped", detail: "ไม่มีการเปลี่ยนแปลงในรอบนี้ — ไม่ต้อง backup" })
    } else {
      try {
        const b = await deps.backup({ reason: `daily ${session}` })
        backup = b ? { available: true, file: b.file, bytes: b.bytes } : { available: true, file: null }
        step({ step: "backup", status: b ? "ok" : "warn", detail: b ? `${b.file} (${(b.bytes / 1e6).toFixed(1)} MB)` : "backupDatabase คืน null (ไม่ใช่ SQLite หรือสำรองไม่สำเร็จ — ดู log)" })
        if (!b) warnings.push("backup ไม่สำเร็จ")
      } catch (e) {
        backup = { available: true, error: (e as Error).message }
        warnings.push(`backup ล้มเหลว: ${(e as Error).message}`)
        step({ step: "backup", status: "failed", detail: (e as Error).message })
      }
    }
    status = changed ? "ok" : "noop"
    exitReason = opts.dryRun ? "dry-run ผ่านทุกด่าน — ไม่ได้เขียนอะไร (ดูผลแต่ละขั้น)" : changed ? "สำเร็จ" : "ไม่มีอะไรเปลี่ยน (รันซ้ำ/ข้อมูลเดิม)"
    return await finish()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    step({ step: "error", status: "failed", detail: msg })
    fail(DAILY_EXIT.ERROR, msg)
    return await finish()
  }

  // ---------- (h) run log + EventLog ----------
  async function finish(): Promise<{ exitCode: number; log: DailyRunLog }> {
    const log: DailyRunLog = {
      v: 1,
      kind: "daily_run",
      session: plan.error ? null : session,
      today: plan.today,
      startedAt: new Date(t0).toISOString(),
      finishedAt: new Date().toISOString(),
      tookMs: Date.now() - t0,
      dryRun: opts.dryRun,
      database: dbFileOf(process.env.DATABASE_URL),
      options: {
        skipFetch: opts.skipFetch,
        date: opts.date,
        symbols: opts.symbols,
        source: opts.source,
        range: opts.range,
        rebase: opts.rebase,
        maxMissingPct: opts.maxMissingPct,
        maxConflictPct: opts.maxConflictPct,
        allowCorporateActions: opts.allowCorporateActions,
        force: opts.force,
        holidaysFile: opts.holidaysFile,
      },
      status,
      exitCode,
      exitReason,
      critical,
      warnings,
      steps,
      provenance,
      freshness,
      reconciliation,
      corporateActions: corporateActions.slice(0, 50),
      brain,
      track,
      backup,
      changed,
      eventEmitted: false,
      logFile: null,
    }
    if (!opts.dryRun && status !== "skipped") {
      // run log ต่อรอบ: ทับด้วยรอบล่าสุด + เก็บสรุปความพยายามก่อนหน้า (รันซ้ำตรวจย้อนหลังได้)
      try {
        await fs.mkdir(opts.runsDir, { recursive: true })
        const file = path.join(opts.runsDir, `${session}.json`)
        let previous: DailyRunLog["previousAttempts"] = []
        try {
          const old = JSON.parse(await fs.readFile(file, "utf8")) as DailyRunLog
          previous = [...(old.previousAttempts ?? []), { startedAt: old.startedAt, status: old.status, exitCode: old.exitCode, exitReason: old.exitReason }].slice(-20)
        } catch {
          previous = []
        }
        log.previousAttempts = previous
        log.logFile = file
        // EventLog เฉพาะเมื่อมีการเปลี่ยนแปลงหรือล้มเหลว — รันซ้ำที่ไม่มีอะไรเปลี่ยนไม่เขียน DB
        if (changed || status === "failed") {
          await emitEvent("daily_run", "system", {
            session,
            status,
            exitCode,
            exitReason: exitReason.slice(0, 300),
            source: opts.skipFetch ? "skip-fetch" : opts.source,
            dbLatest: freshness?.dbLatest ?? null,
            lagSessions: freshness?.lagSessions ?? null,
            pctUpdated: freshness?.pctUpdated ?? null,
            critical: critical.map((c) => c.slice(0, 200)),
            reconciliation: reconciliation.map((r) => ({ pairs: r.pairs, compared: r.compared, flagged: r.flagged, counts: r.counts, conflicts: r.conflicts.slice(0, 20), rebased: r.rebased.slice(0, 20), worst: r.worst })),
            corporateActions: corporateActions.slice(0, 20).map((f) => ({ symbol: f.symbol, date: f.date, changePct: f.changePct, kind: f.kind })),
            brain: brain ? { date: brain.date ?? null, executed: brain.executed ?? 0, gated: brain.gated ?? 0, idempotent: brain.idempotent ?? null } : null,
            track: track ? { nav: track.nav, sessions: track.sessions, ledgerHash: track.ledgerHash, verdict: track.verdict, snapshot: (track.snapshot as { emitted: boolean }).emitted } : null,
            backup: backup ? !!(backup as { file?: string }).file : false,
          })
          log.eventEmitted = true
        }
        await fs.writeFile(file, JSON.stringify(log, null, 2) + "\n", "utf8")
      } catch (e) {
        deps.log(`  ⚠️ เขียน run log ไม่สำเร็จ: ${(e as Error).message}`)
      }
    }
    return { exitCode, log }
  }
}
