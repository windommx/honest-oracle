// ============================================================
// Track record ของพอร์ตกระดาษ Jev — อ่าน DB อย่างเดียว (ไม่เขียนอะไร) แล้วประกอบรายงานที่ซื่อตรง
//   Decision/Trade/Position → ledger (ไม้เข้า/ออก) → NAV mark-to-market รายวัน vs benchmark
//   + ป้ายที่มาข้อมูล (SYNTHETIC/REAL จาก EventLog) + ความเชื่อมั่นทางสถิติ + หลักฐานกันแก้ย้อนหลัง
//   + ล็อกช่วงเก็บผลจริง (freeze): frozenAt · กติกาที่ใช้อยู่ไม่ตรงกับตอนล็อก (drift) · การเปลี่ยนกติกาใน EventLog ระหว่าง record
// ============================================================

import { db } from "@/lib/db"
import { closePivot, MIN_PRICE } from "@/lib/momentum/core"
import { TH_STRATEGY } from "@/lib/config/thai"
import { classifyProvenance } from "@/lib/flagship/funnel"
import { auditEvents } from "@/lib/research/events"
import { buildTrackFreeze, getLiveFreezeStatus, POLICY_EVENT_KINDS, type TrackFreezeInfo } from "@/lib/research/freeze"
import { dataEpoch, epochSourceIds, evidenceDataLabel, provenanceFor } from "@/lib/feed/provenance"
import { readPendingFills } from "@/lib/jev/fills"
import { assessConfidence } from "./confidence"
import { buildLedger, chainHashAt, JEV_QUESTIONS, ledgerChain, type SnapshotLegInfo } from "./ledger"
import { computeTrackStats, simulateNav, type NavResult } from "./nav"
import type { LegRow, SnapshotCheck, TrackRecordResponse, TrackSnapshotPayload } from "./types"

/** ต้นทุนต่อขา = commission + slippage ของตลาดไทย (70bps) — เท่ากับ Trade.ret ที่ /api/jev/run บันทึก */
export const COST_LEG = (TH_STRATEGY.costBps + TH_STRATEGY.slipBpsBase) / 1e4
/** งบ slots สูงสุดของพอร์ต Jev (7) — 1 slot = 1/7 ของทุน */
export const MAX_SLOTS = TH_STRATEGY.maxPos

/** คำตอบของ GET /api/track-record = track record + สถานะล็อกกติกาช่วงเก็บผล */
export type TrackRecordWithFreeze = TrackRecordResponse & { freeze: TrackFreezeInfo }

const r2 = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)

export function parseSnapshotPayload(raw: string): TrackSnapshotPayload | null {
  try {
    const p = JSON.parse(raw) as Partial<TrackSnapshotPayload>
    if (!p || typeof p !== "object" || typeof p.date !== "string" || typeof p.ledgerHash !== "string") return null
    if (typeof p.maxDecisionId !== "number" || typeof p.nav !== "number") return null
    return { ...p, openLegs: Array.isArray(p.openLegs) ? p.openLegs : [] } as TrackSnapshotPayload
  } catch {
    return null
  }
}

/** ตรวจ snapshot ย้อนหลังกับ Decision + NAV ปัจจุบัน */
export function checkSnapshots(
  snaps: { id: number; ts: string; payload: TrackSnapshotPayload }[],
  chain: { id: number; hash: string }[],
  decisions: { id: number; date: string }[],
  navByDate: Map<string, number>,
): SnapshotCheck {
  let ledgerMismatches = 0
  let firstLedgerMismatch: string | null = null
  for (const s of snaps) {
    if (chainHashAt(chain, s.payload.maxDecisionId) !== s.payload.ledgerHash) {
      ledgerMismatches++
      if (!firstLedgerMismatch) firstLedgerMismatch = s.payload.date
    }
  }
  // NAV: ใช้ snapshot ล่าสุดของแต่ละวัน · ถ้ามี Decision ของวัน ≤ D เพิ่มหลัง snapshot (เช่นมนุษย์อนุมัติทีหลัง) = superseded
  const lastByDate = new Map<string, TrackSnapshotPayload>()
  for (const s of snaps) lastByDate.set(s.payload.date, s.payload)
  let navChecked = 0
  let navMismatches = 0
  let navSuperseded = 0
  // id สูงสุดของ Decision ที่ลงวันที่ ≤ D (prefix max ตามวัน — O(n log n) แทนการวนทุก decision ต่อ snapshot)
  const byDate = new Map<string, number>()
  for (const d of decisions) byDate.set(d.date, Math.max(byDate.get(d.date) ?? 0, d.id))
  const days = [...byDate.keys()].sort()
  const prefixMax: number[] = []
  days.forEach((d, i) => prefixMax.push(Math.max(i > 0 ? prefixMax[i - 1] : 0, byDate.get(d) ?? 0)))
  const maxIdUpTo = (date: string): number => {
    let lo = 0
    let hi = days.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (days[mid] <= date) {
        ans = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return ans >= 0 ? prefixMax[ans] : 0
  }
  for (const [date, p] of lastByDate) {
    const now = navByDate.get(date)
    if (now === undefined) continue
    if (maxIdUpTo(date) > p.maxDecisionId) {
      navSuperseded++
      continue
    }
    navChecked++
    if (Math.abs(now - p.nav) > 1e-6 * Math.max(1, Math.abs(p.nav))) navMismatches++
  }
  const last = snaps[snaps.length - 1]
  return {
    count: snaps.length,
    lastDate: last?.payload.date ?? null,
    lastAt: last?.ts ?? null,
    ledgerMismatches,
    firstLedgerMismatch,
    navChecked,
    navMismatches,
    navSuperseded,
  }
}

export async function buildTrackRecord(): Promise<TrackRecordWithFreeze> {
  const generatedAt = new Date().toISOString()
  const [rawRows, provEvents, decisionRows, tradeRows, positionRows, snapRows, audit, latestEvent, freezeStatus, policyEvents] = await Promise.all([
    db.rawDaily.count(),
    db.eventLog.findMany({ where: { kind: { in: ["seed", "ingest"] } }, select: { id: true, kind: true, payload: true, ts: true }, orderBy: { id: "asc" } }),
    db.decision.findMany({ where: { question: { in: [...JEV_QUESTIONS] } }, orderBy: { id: "asc" } }),
    db.trade.findMany({ where: { stopPolicy: "jev" }, orderBy: { id: "asc" } }),
    db.position.findMany({ orderBy: { symbol: "asc" } }),
    db.eventLog.findMany({ where: { kind: "track_snapshot" }, select: { id: true, ts: true, payload: true }, orderBy: { id: "asc" } }),
    auditEvents(1),
    db.eventLog.findFirst({ orderBy: { id: "desc" }, select: { id: true, kind: true, ts: true, hash: true } }),
    getLiveFreezeStatus(),
    db.eventLog.findMany({ where: { kind: { in: [...POLICY_EVENT_KINDS] } }, select: { id: true, kind: true, ts: true, payload: true }, orderBy: { id: "asc" } }),
  ])

  // ---- ที่มาข้อมูล + ยุคข้อมูล ----
  const prov = classifyProvenance(provEvents, rawRows)
  const epoch = dataEpoch(provEvents)
  const evidenceLabel = evidenceDataLabel(prov, epochSourceIds(epoch))
  const epochStartMs = epoch.startTs ? Date.parse(epoch.startTs) : null

  const snaps = snapRows
    .filter((s) => epoch.startEventId === null || s.id > epoch.startEventId)
    .map((s) => ({ id: s.id, ts: s.ts.toISOString(), payload: parseSnapshotPayload(s.payload) }))
    .filter((s): s is { id: number; ts: string; payload: TrackSnapshotPayload } => s.payload !== null)
  const snapshotLegs: SnapshotLegInfo[] = snaps.flatMap((s) =>
    s.payload.openLegs.filter((l) => l && typeof l.symbol === "string" && typeof l.entryDate === "string" && Number.isFinite(l.slots)),
  )

  const ledger = buildLedger({
    decisions: decisionRows,
    trades: tradeRows,
    positions: positionRows,
    snapshotLegs,
    epochStartMs,
  })

  // ---- NAV ----
  let nav: NavResult = { points: [], dailyRet: [], benchRet: [], priced: [], unpriced: [], tradedWeight: 0, benchGapDays: 0 }
  if (rawRows > 0 && ledger.counts.runs > 0 && ledger.liveSince) {
    const pivot = await closePivot()
    const s0 = pivot.dates.findIndex((d) => d >= (ledger.liveSince as string))
    if (s0 >= 0) {
      const fromIdx = Math.max(0, s0 - 1)
      const liqRows = await db.rawDaily.findMany({
        where: { date: { gte: pivot.dates[fromIdx] } },
        select: { date: true, symbol: true, liq5: true, close: true },
      })
      const liquid: boolean[][] = new Array(pivot.dates.length)
      for (let i = fromIdx; i < pivot.dates.length; i++) liquid[i] = new Array<boolean>(pivot.symbols.length).fill(false)
      for (const r of liqRows) {
        const i = pivot.dateIdx.get(r.date)
        const s = pivot.symIdx.get(r.symbol)
        if (i === undefined || s === undefined || !liquid[i]) continue
        liquid[i][s] = r.liq5 === 1 && r.close > MIN_PRICE
      }
      nav = simulateNav({ legs: ledger.legs, prices: pivot, liquid, startDate: ledger.liveSince, maxSlots: MAX_SLOTS, costLeg: COST_LEG })
    }
  }
  const stats = computeTrackStats(nav)
  const sessions = Math.max(0, nav.points.length - 1)

  // ---- หลักฐานกันแก้ย้อนหลัง ----
  const chain = ledgerChain(ledger.epochDecisions)
  const ledgerHash = chain.length > 0 ? chain[chain.length - 1].hash : chainHashAt(chain, 0)
  const navByDate = new Map(nav.points.map((p) => [p.date, p.nav]))
  const snapshots = checkSnapshots(snaps, chain, ledger.epochDecisions, navByDate)

  // ---- ไม้รายตัว (ล่าสุดก่อน) ----
  const pricedBy = new Map(nav.priced.map((p) => [p.leg.entryId, p]))
  // 200 ไม้ล่าสุด + ไม้เปิดทุกไม้เสมอ (snapshot ใช้บันทึกขนาดของไม้เปิด — ไม้เปิดเก่าต้องไม่หลุด)
  const sortedLegs = [...ledger.legs].sort((a, b) => b.entryId - a.entryId)
  const shown = sortedLegs.slice(0, 200)
  for (const l of sortedLegs.slice(200)) if (l.status === "open") shown.push(l)
  const legs: LegRow[] = shown
    .map((l) => {
      const p = pricedBy.get(l.entryId)
      return {
        symbol: l.symbol,
        status: l.status,
        source: l.source,
        conf: l.conf,
        entryDate: l.entryDate,
        entryPx: p ? Math.round(p.entryPx * 1e4) / 1e4 : l.recordedEntryPx,
        exitDate: l.exitDate,
        exitPx: l.status === "closed" ? (p ? Math.round(p.markPx * 1e4) / 1e4 : l.recordedExitPx) : null,
        slots: l.slots,
        slotsSource: l.slotsSource,
        netRetPct: p ? r2(p.netRet * 100) : null,
        holdSessions: p ? p.holdSessions : null,
        recordedRetPct: l.recordedRetPct,
        entryDriftPct: p && p.entryDrift !== null ? r2(p.entryDrift * 100) : null,
      }
    })

  const status: TrackRecordResponse["status"] = rawRows === 0 ? "NO_DATA" : ledger.counts.runs === 0 ? "NO_RUNS" : "OK"
  const confidence = assessConfidence({
    hasData: rawRows > 0,
    runs: ledger.counts.runs,
    evidenceLabel,
    sessions,
    closedTrades: stats.closedTrades,
    tStatExcess: stats.tStatExcess,
    mode: ledger.mode,
    estimatedSlots: ledger.counts.estimatedSlots,
    untrackedPositions: ledger.untrackedPositions,
    orphanLegs: ledger.counts.orphanLegs,
    unpriced: nav.unpriced.length,
  })

  const notes: string[] = []
  const latestDate = nav.points[nav.points.length - 1]?.date ?? null
  const lastRun = ledger.runDates[ledger.runDates.length - 1] ?? null
  if (latestDate && lastRun && latestDate > lastRun) notes.push(`รอบตัดสินใจล่าสุด ${lastRun} — NAV mark-to-market ถึงข้อมูลล่าสุด ${latestDate}`)
  if (ledger.counts.priorEpoch > 0)
    notes.push(`ไม่นับ ${ledger.counts.priorEpoch} การตัดสินใจก่อนยุคข้อมูลปัจจุบัน (ก่อน ${epoch.startKind === "seed" ? "seed" : "ล้าง demo"} ล่าสุด)`)
  if (nav.benchGapDays > 0) notes.push(`${nav.benchGapDays} วันไม่มีหุ้นผ่านเกณฑ์สภาพคล่องให้คำนวณ benchmark (นับเป็น 0%)`)
  if (snapshots.ledgerMismatches > 0)
    notes.push(`⚠️ ledger hash ไม่ตรงกับ snapshot ${snapshots.ledgerMismatches} ครั้ง (แรกสุด ${snapshots.firstLedgerMismatch}) — ประวัติการตัดสินใจถูกแก้/ลบหลังบันทึก`)
  if (snapshots.navMismatches > 0) notes.push(`NAV ที่คำนวณใหม่ต่างจาก snapshot ${snapshots.navMismatches} วัน — ราคาในฐานข้อมูลถูกแก้ย้อนหลัง`)
  if (!audit.ok) notes.push(`⚠️ EventLog hash chain พังที่ event #${audit.brokenAt} — audit trail ไม่น่าเชื่อถือ`)
  // คำสั่งซื้อรอเติม T+1 (Setting jev_pending_fills) ไม่ใช่สถานะ — ไม่อยู่ใน legs/NAV จนกว่าจะเติม → แสดงแยก
  const pendingFills = await readPendingFills()
  if (pendingFills.length > 0)
    notes.push(`คำสั่งซื้อรอเติม T+1 ${pendingFills.length} รายการ (${pendingFills.map((o) => `${o.symbol} หลังข้อมูล ${o.afterDate}`).join(", ")}) — ยังไม่ใช่สถานะ ไม่นับใน NAV จนกว่าจะเติมที่ราคาปิดวันทำการถัดไป`)

  // ---- ล็อกกติกาช่วงเก็บผล: ช่วง record = ตั้งแต่รอบตัดสินใจจริงครั้งแรกของยุคนี้ ----
  const freeze = buildTrackFreeze({
    status: freezeStatus,
    events: policyEvents.map((e) => ({ id: e.id, kind: e.kind, ts: e.ts.toISOString(), payload: e.payload })),
    recordStart: ledger.counts.runs > 0 ? ledger.firstRunAt : null,
    liveSince: status === "OK" ? ledger.liveSince : null,
    epochStart: epoch.startTs,
  })
  notes.push(...freeze.notes)
  if (freeze.info.violated)
    confidence.notes.push("กติกาเปลี่ยน/ตรวจไม่ผ่านระหว่างช่วงล็อก — track record นี้ไม่ใช่หลักฐานของกติกาที่ลงทะเบียนไว้ (ดูหมายเหตุ ⚠️)")

  return {
    generatedAt,
    status,
    provenance: {
      label: prov.dataLabel,
      evidenceLabel,
      isSynthetic: prov.isSynthetic,
      latestSource: epoch.latestSource,
      sourceKnown: epoch.sources.length > 0 && epoch.sources.every((x) => provenanceFor(x.source).known),
      epochStart: epoch.startTs,
      epochStartEventId: epoch.startEventId,
      epochKind: epoch.startKind,
    },
    liveSince: status === "OK" ? ledger.liveSince : null,
    firstRunAt: ledger.firstRunAt,
    latestDate,
    sessions,
    mode: ledger.mode,
    nav: nav.points,
    stats,
    decisions: { ...ledger.counts, untrackedPositions: ledger.untrackedPositions },
    legs,
    confidence,
    tamper: {
      audit: { ok: audit.ok, total: audit.total, brokenAt: audit.brokenAt },
      latestEvent: latestEvent ? { id: latestEvent.id, kind: latestEvent.kind, ts: latestEvent.ts.toISOString(), hash: latestEvent.hash } : null,
      ledgerHash,
      ledgerDecisions: chain.length,
      ledgerMaxDecisionId: chain.length > 0 ? chain[chain.length - 1].id : 0,
      snapshots,
    },
    method: {
      weighting: `น้ำหนักต่อไม้ = slots/${MAX_SLOTS} ของ NAV (คงที่รายวัน เหมือน backtest engine) · เงินสดไม่มีผลตอบแทน`,
      costPerLegPct: Math.round(COST_LEG * 10000) / 100,
      maxSlots: MAX_SLOTS,
      benchmark: `equal-weight รายวันของหุ้นที่ผ่าน liq5 และราคา > ${MIN_PRICE} บาท ณ วันก่อนหน้า (ไม่ใช่ดัชนี SET)`,
      prices: "ราคาปิดใน DB ปัจจุบัน (ชุดเดียวกับ benchmark) · เข้าที่ราคาปิดของวันเติม T+1 (Position.entryDate / Decision fill — วันทำการถัดจากวันตัดสินใจ) · ออกที่ราคาปิดของวันตัดสินใจ",
    },
    notes,
    freeze: freeze.info,
  }
}
