/// <reference types="bun-types" />
// bun test — เรนเดอร์ TrackRecordView ฝั่ง server (react-dom/server) ด้วยข้อมูลหลายสถานะ
// กันแท็บพังตอนเรนเดอร์ + ยืนยันป้ายความจริงใจ (SYNTHETIC / ยังเร็วเกินไป / "—" แทนค่าที่วัดไม่ได้)
import { describe, expect, it } from "bun:test"
import { renderToString } from "react-dom/server"
import type { TrackRecordResponse } from "@/lib/track/types"
import type { DataTrustResponse } from "@/lib/feed/trust"
import { SOURCE_PROVENANCE } from "@/lib/feed/provenance"
import { TrackRecordView } from "./track-record-tab"

const nullStats = {
  totalReturnPct: null,
  benchReturnPct: null,
  excessReturnPct: null,
  cagrPct: null,
  benchCagrPct: null,
  volPct: null,
  sharpe: null,
  maxDrawdownPct: null,
  benchMaxDrawdownPct: null,
  closedTrades: 0,
  openTrades: 0,
  hitRatePct: null,
  avgWinPct: null,
  avgLossPct: null,
  payoff: null,
  profitFactor: null,
  realizedPct: null,
  unrealizedPct: null,
  avgExposurePct: null,
  turnoverAnnual: null,
  avgHoldSessions: null,
  tStatExcess: null,
  sessionsForSignificance: null,
}

function mkTrack(p: Partial<TrackRecordResponse> = {}): TrackRecordResponse {
  return {
    generatedAt: "2026-09-23T11:00:00.000Z",
    status: "NO_RUNS",
    provenance: { label: "SYNTHETIC (demo seed)", evidenceLabel: "SYNTHETIC", isSynthetic: true, latestSource: null, sourceKnown: false, epochStart: "2026-09-01T00:00:00.000Z", epochStartEventId: 1, epochKind: "seed" },
    liveSince: null,
    firstRunAt: null,
    latestDate: null,
    sessions: 0,
    mode: { label: "NONE", liveRuns: 0, replayRuns: 0, maxLagDays: null, firstLiveDate: null },
    nav: [],
    stats: nullStats,
    decisions: { total: 0, runs: 0, entries: 0, exits: 0, tightens: 0, watch: 0, pendingBuys: 0, human: 0, reversal: 0, shadow: 0, priorEpoch: 0, unmatchedExits: 0, orphanLegs: 0, estimatedSlots: 0, duplicateEntries: 0, untrackedPositions: [] },
    legs: [],
    confidence: { tooEarly: true, verdict: "NO_RUNS", label: "ยังไม่มีรอบตัดสินใจของ Jev ในยุคข้อมูลนี้ — ยังไม่มี track record", notes: [], minSessions: 60, minClosedTrades: 30 },
    tamper: {
      audit: { ok: true, total: 10, brokenAt: null },
      latestEvent: { id: 10, kind: "seed", ts: "2026-09-01T00:00:00.000Z", hash: "a".repeat(64) },
      ledgerHash: "b".repeat(64),
      ledgerDecisions: 0,
      ledgerMaxDecisionId: 0,
      snapshots: { count: 0, lastDate: null, lastAt: null, ledgerMismatches: 0, firstLedgerMismatch: null, navChecked: 0, navMismatches: 0, navSuperseded: 0 },
    },
    method: { weighting: "slots/7", costPerLegPct: 0.7, maxSlots: 7, benchmark: "EW liquid", prices: "close" },
    notes: [],
    ...p,
  }
}

const trust: DataTrustResponse = {
  generatedAt: "2026-09-23T11:00:00.000Z",
  provenance: { label: "SYNTHETIC (demo seed)", evidenceLabel: "SYNTHETIC", isSynthetic: true, latestSource: null, latestSourceInfo: SOURCE_PROVENANCE.yahoo, epochStart: null, epochKind: "seed", ingestHistory: [] },
  sources: Object.values(SOURCE_PROVENANCE),
  freshness: { now: "2026-09-23T18:00:00+07:00", expectedSession: "2026-09-23", dbLatest: "2026-09-22", lagSessions: 1, status: "lagging", universeSize: 40, universeSource: "active", updated: 0, pctUpdated: 0, counts: { fresh: 0, lagging: 40, stale: 0, missing: 0 }, laggards: [{ symbol: "PTT", lastDate: "2026-09-22", lagSessions: 1, status: "lagging" }], holidayCovered: true, notes: [] },
  corporateActions: { windowSessions: 60, since: "2026-06-26", recent: [{ symbol: "CPALL", date: "2026-09-22", prevDate: "2026-09-21", prevClose: 60, close: 30, changePct: -50, kind: "split-like", splitFactor: 2, gapSessions: 0, note: "split" }], totalHistorical: 1 },
  reconciliation: { lastRun: null, items: [{ pairs: "yahoo vs db", compared: 100, flagged: 2, counts: { match: 9, rebased: 1, rescaled: 0, conflict: 0 }, conflicts: [], rebased: ["PTT"], worst: null }], note: "" },
  pipeline: { lastRun: { eventId: 5, at: "2026-09-22T11:40:00.000Z", session: "2026-09-22", status: "failed", exitCode: 5, exitReason: "stale", dbLatest: "2026-09-21", pctUpdated: 0 }, lastSuccess: null },
  calendar: { source: "builtin", years: [2025, 2026], file: null, error: null },
  notes: ["ข้อมูลตลาดเป็น SYNTHETIC (demo seed)"],
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ")

describe("TrackRecordView (SSR)", () => {
  it("กำลังโหลด / error / ยังไม่มีรอบ — ไม่พัง และบอกสถานะตรง ๆ", () => {
    expect(renderToString(<TrackRecordView track={null} trust={null} trackLoading />)).toContain("animate-pulse")
    expect(text(renderToString(<TrackRecordView track={null} trust={null} trackError="HTTP 500" />))).toContain("HTTP 500")
    const html = text(renderToString(<TrackRecordView track={mkTrack()} trust={trust} />))
    expect(html).toContain("SYNTHETIC")
    expect(html).toContain("ยังไม่มีรอบตัดสินใจของ Jev")
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })

  it("track record บนข้อมูลจำลอง: ป้าย SYNTHETIC + ยังเร็วเกินไป + กราฟ 2 เส้น + ค่าที่วัดไม่ได้ = —", () => {
    const t = mkTrack({
      status: "OK",
      liveSince: "2026-09-01",
      latestDate: "2026-09-03",
      sessions: 2,
      mode: { label: "LIVE", liveRuns: 3, replayRuns: 0, maxLagDays: 1, firstLiveDate: "2026-09-01" },
      nav: [
        { date: "2026-09-01", nav: 0.999, bench: 1, exposure: 0.14 },
        { date: "2026-09-02", nav: 1.004, bench: 1.002, exposure: 0.14 },
        { date: "2026-09-03", nav: 1.01, bench: 0.998, exposure: 0.07 },
      ],
      stats: { ...nullStats, totalReturnPct: 1, benchReturnPct: -0.2, excessReturnPct: 1.2, maxDrawdownPct: 0, closedTrades: 1, openTrades: 1, hitRatePct: 100, avgWinPct: 3.2 },
      legs: [
        { symbol: "AAA", status: "closed", source: "lite", conf: 0.9, entryDate: "2026-09-01", entryPx: 10, exitDate: "2026-09-03", exitPx: 10.46, slots: 1, slotsSource: "estimated", netRetPct: 3.2, holdSessions: 2, recordedRetPct: 3.2, entryDriftPct: 0 },
        { symbol: "BBB", status: "open", source: "human", conf: 0.72, entryDate: "2026-09-02", entryPx: 20, exitDate: null, exitPx: null, slots: 0.5, slotsSource: "position", netRetPct: -0.7, holdSessions: 1, recordedRetPct: null, entryDriftPct: null },
      ],
      confidence: { tooEarly: true, verdict: "NOT_REAL", label: "ข้อมูลไม่ใช่ข้อมูลตลาดจริงล้วน — ตัวเลขชุดนี้ไม่ใช่หลักฐานของ edge", notes: ["ราคาทั้งหมดมาจาก demo seed"], minSessions: 60, minClosedTrades: 30 },
    })
    const raw = renderToString(<TrackRecordView track={t} trust={trust} chartWidth={800} />)
    const html = text(raw)
    expect(html).toContain("SYNTHETIC — ข้อมูลจำลอง")
    expect(html).toContain("ยังเร็วเกินไปที่จะตัดสิน")
    expect(html).toContain("(ข้อมูลไม่จริง)")
    expect(html).toContain("ประมาณ") // ขนาดไม้ที่ไม่ได้บันทึก
    expect(html).toContain("CPALL") // corporate action ใน data trust
    expect(html).toContain("PTT") // ฐานราคาเปลี่ยน
    expect(raw).toContain("<svg")
    expect((raw.match(/recharts-line-curve/g) ?? []).length).toBe(2)
    expect(html).toContain("—") // Sharpe/CAGR ที่วัดไม่ได้
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })

  it("REAL + audit พัง: ป้ายสีแดงบอกตำแหน่งที่พัง ไม่ซ่อน", () => {
    const t = mkTrack({
      status: "OK",
      provenance: { label: "REAL (feed: yahoo)", evidenceLabel: "REAL", isSynthetic: false, latestSource: "yahoo", sourceKnown: true, epochStart: null, epochStartEventId: null, epochKind: "replace-demo" },
      liveSince: "2026-09-01",
      sessions: 0,
      nav: [{ date: "2026-09-01", nav: 1, bench: 1, exposure: 0 }],
      tamper: { ...mkTrack().tamper, audit: { ok: false, total: 10, brokenAt: 7 } },
      confidence: { tooEarly: true, verdict: "TOO_EARLY", label: "ยังเร็วเกินไปที่จะตัดสิน", notes: [], minSessions: 60, minClosedTrades: 30 },
    })
    const html = text(renderToString(<TrackRecordView track={t} trust={null} />))
    expect(html).toContain("REAL — ข้อมูลจริง")
    expect(html).toContain("พังที่ #7")
    expect(html).toContain("มี NAV จุดเดียว")
    expect(html).not.toContain("(ข้อมูลไม่จริง)")
  })
})
