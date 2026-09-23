// ============================================================
// Data trust — สรุป "เชื่อข้อมูลชุดนี้ได้แค่ไหน" สำหรับ GET /api/data/trust (อ่านอย่างเดียว)
//   provenance + licensing ของแต่ละแหล่ง · freshness เทียบปฏิทิน SET · corporate action ล่าสุด
//   · reconciliation ครั้งล่าสุดจากสายพานรายวัน (EventLog "daily_run")
// ============================================================

import path from "node:path"
import { db } from "@/lib/db"
import { closePivot, type Pivot } from "@/lib/momentum/core"
import { classifyProvenance } from "@/lib/flagship/funnel"
import { loadHolidayCalendar } from "./calendar-file"
import { detectCorporateActions, type CorporateActionFlag } from "./corporate-actions"
import { computeFreshness, type FreshnessReport } from "./freshness"
import {
  dataEpoch,
  epochSourceIds,
  evidenceDataLabel,
  provenanceFor,
  SOURCE_PROVENANCE,
  type EvidenceDataLabel,
  type IngestSourceSummary,
  type SourceProvenance,
} from "./provenance"
import type { ReconKind, ReconPair } from "./reconcile"

/** corporate action ย้อนหลังกี่วันซื้อขายที่แสดงเป็น "ล่าสุด" */
export const CA_WINDOW_SESSIONS = 60

export interface PipelineRunInfo {
  eventId: number
  at: string
  session: string | null
  status: string | null
  exitCode: number | null
  exitReason: string | null
  dbLatest: string | null
  pctUpdated: number | null
}

export interface TrustReconciliation {
  pairs: string
  compared: number
  flagged: number
  counts: Record<ReconKind, number> | null
  conflicts: string[]
  rebased: string[]
  worst: ReconPair | null
}

export interface DataTrustResponse {
  generatedAt: string
  provenance: {
    label: string
    evidenceLabel: EvidenceDataLabel
    isSynthetic: boolean
    latestSource: string | null
    latestSourceInfo: SourceProvenance
    epochStart: string | null
    epochKind: "seed" | "replace-demo" | null
    ingestHistory: IngestSourceSummary[]
  }
  sources: SourceProvenance[]
  freshness: FreshnessReport
  corporateActions: { windowSessions: number; since: string | null; recent: CorporateActionFlag[]; totalHistorical: number }
  reconciliation: { lastRun: PipelineRunInfo | null; items: TrustReconciliation[]; note: string }
  pipeline: { lastRun: PipelineRunInfo | null; lastSuccess: PipelineRunInfo | null }
  calendar: { source: "builtin" | "file"; years: number[]; file: string | null; error: string | null }
  notes: string[]
}

// cache ผลสแกนทั้งประวัติ ผูกกับ object ของ closePivot (ข้อมูลเปลี่ยน = pivot ใหม่ = สแกนใหม่) + ปฏิทินที่ใช้
let _caCache: { pivot: Pivot; calKey: string; all: CorporateActionFlag[] } | null = null

function parse(p: string): Record<string, unknown> {
  try {
    const v = JSON.parse(p) as unknown
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function runInfo(e: { id: number; ts: Date; payload: string } | null): PipelineRunInfo | null {
  if (!e) return null
  const p = parse(e.payload)
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const s = (v: unknown) => (typeof v === "string" ? v : null)
  return {
    eventId: e.id,
    at: e.ts.toISOString(),
    session: s(p.session),
    status: s(p.status),
    exitCode: num(p.exitCode),
    exitReason: s(p.exitReason),
    dbLatest: s(p.dbLatest),
    pctUpdated: num(p.pctUpdated),
  }
}

export async function buildDataTrust(opts: { now?: Date } = {}): Promise<DataTrustResponse> {
  const now = opts.now ?? new Date()
  const [rawRows, provEvents, lastGroups, runEvents, cal] = await Promise.all([
    db.rawDaily.count(),
    db.eventLog.findMany({ where: { kind: { in: ["seed", "ingest"] } }, select: { id: true, kind: true, payload: true, ts: true }, orderBy: { id: "asc" } }),
    db.rawDaily.groupBy({ by: ["symbol"], _max: { date: true } }),
    db.eventLog.findMany({ where: { kind: "daily_run" }, select: { id: true, ts: true, payload: true }, orderBy: { id: "desc" }, take: 30 }),
    loadHolidayCalendar(),
  ])
  const prov = classifyProvenance(provEvents, rawRows)
  const epoch = dataEpoch(provEvents)
  const lastDateBySymbol = new Map<string, string>()
  for (const g of lastGroups) if (g._max.date) lastDateBySymbol.set(g.symbol, g._max.date)
  const freshness = computeFreshness({ now, lastDateBySymbol, calendar: cal.calendar })

  // corporate action จากราคาทั้งประวัติใน DB (pivot มี cache ร่วมกับทั้งระบบ)
  let recent: CorporateActionFlag[] = []
  let totalHistorical = 0
  let since: string | null = null
  if (rawRows > 0) {
    const pivot = await closePivot()
    const calKey = `${cal.calendar.source}:${cal.calendar.dates.size}:${cal.calendar.years.join(",")}`
    let all: CorporateActionFlag[]
    if (_caCache && _caCache.pivot === pivot && _caCache.calKey === calKey) all = _caCache.all
    else {
      const rows: { date: string; symbol: string; close: number }[] = []
      for (let i = 0; i < pivot.dates.length; i++) {
        const row = pivot.px[i]
        for (let s = 0; s < pivot.symbols.length; s++) {
          const v = row[s]
          if (Number.isFinite(v) && v > 0) rows.push({ date: pivot.dates[i], symbol: pivot.symbols[s], close: v })
        }
      }
      all = detectCorporateActions(rows, { calendar: cal.calendar })
      _caCache = { pivot, calKey, all }
    }
    totalHistorical = all.length
    since = pivot.dates[Math.max(0, pivot.dates.length - CA_WINDOW_SESSIONS)] ?? null
    recent = since ? all.filter((f) => f.date >= (since as string)).slice(0, 50) : []
  }

  const lastRunEv = runEvents[0] ?? null
  const lastRun = runInfo(lastRunEv)
  const lastSuccess = runInfo(runEvents.find((e) => parse(e.payload).status !== "failed") ?? null)
  const recItems: TrustReconciliation[] = []
  const withRecon = runEvents.find((e) => Array.isArray(parse(e.payload).reconciliation) && (parse(e.payload).reconciliation as unknown[]).length > 0) ?? null
  if (withRecon) {
    for (const r of parse(withRecon.payload).reconciliation as Record<string, unknown>[]) {
      recItems.push({
        pairs: typeof r.pairs === "string" ? r.pairs : "?",
        compared: typeof r.compared === "number" ? r.compared : 0,
        flagged: typeof r.flagged === "number" ? r.flagged : 0,
        counts: r.counts && typeof r.counts === "object" ? (r.counts as Record<ReconKind, number>) : null,
        conflicts: Array.isArray(r.conflicts) ? (r.conflicts as string[]) : [],
        rebased: Array.isArray(r.rebased) ? (r.rebased as string[]) : [],
        worst: r.worst && typeof r.worst === "object" ? (r.worst as ReconPair) : null,
      })
    }
  }

  const notes: string[] = [...freshness.notes]
  const latestInfo = provenanceFor(epoch.latestSource)
  if (prov.isSynthetic && rawRows > 0) notes.push(`ข้อมูลตลาดเป็น ${prov.dataLabel} — ตัวเลขทุกโมดูลเป็นของจำลอง`)
  const unknownSources = epoch.sources.filter((x) => !x.known).map((x) => x.source)
  if (!prov.isSynthetic && unknownSources.length > 0)
    notes.push(`มีข้อมูลจากแหล่งที่ระบบไม่รู้จักในยุคนี้ (${unknownSources.join(", ")}) — ยืนยันที่มาก่อนใช้เป็นหลักฐาน`)
  if (latestInfo.commercialUse === "no") notes.push(`${latestInfo.label}: ${latestInfo.terms}`)
  if (recent.length > 0) notes.push(`พบราคาเปลี่ยนเกิน ±30% ใน ${CA_WINDOW_SESSIONS} วันซื้อขายล่าสุด ${recent.length} จุด — ตรวจ corporate action`)
  if (!lastRun) notes.push("ยังไม่เคยรันสายพานรายวัน (bun run daily) — ยังไม่มีผล reconciliation/freshness อัตโนมัติ")
  else if (lastRun.status === "failed") notes.push(`สายพานรายวันรอบล่าสุด (${lastRun.session ?? "—"}) ล้มเหลว: ${lastRun.exitReason ?? "—"}`)
  if (cal.error) notes.push("อ่านไฟล์วันหยุดของผู้ใช้ (SET_HOLIDAYS_FILE) ไม่ได้ — ใช้ปฏิทินตั้งต้น")

  return {
    generatedAt: now.toISOString(),
    provenance: {
      label: prov.dataLabel,
      evidenceLabel: evidenceDataLabel(prov, epochSourceIds(epoch)),
      isSynthetic: prov.isSynthetic,
      latestSource: epoch.latestSource,
      latestSourceInfo: latestInfo,
      epochStart: epoch.startTs,
      epochKind: epoch.startKind,
      ingestHistory: epoch.sources,
    },
    sources: Object.values(SOURCE_PROVENANCE).sort((a, b) => a.precedence - b.precedence),
    freshness,
    corporateActions: { windowSessions: CA_WINDOW_SESSIONS, since, recent, totalHistorical },
    reconciliation: {
      lastRun: runInfo(withRecon),
      items: recItems,
      note:
        recItems.length > 0
          ? "จากสายพานรายวันรอบล่าสุดที่มีการเทียบแหล่ง — ต่าง > 0.5% = ติดธง"
          : "ยังไม่มีผลเทียบแหล่ง (เกิดเมื่อสายพานรายวันดึงข้อมูลซ้อนกับ DB หรือ inbox มีหลายแหล่งให้วันเดียวกัน)",
    },
    pipeline: { lastRun, lastSuccess },
    // ชื่อไฟล์อย่างเดียว — ไม่เปิดเผย path บนเซิร์ฟเวอร์ให้ผู้ชม
    calendar: { source: cal.calendar.source, years: cal.calendar.years, file: cal.file ? path.basename(cal.file) : null, error: cal.error ? "อ่านไฟล์วันหยุดของผู้ใช้ไม่ได้ — ใช้ปฏิทินตั้งต้น" : null },
    notes,
  }
}
