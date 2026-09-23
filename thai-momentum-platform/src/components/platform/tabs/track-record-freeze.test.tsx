/// <reference types="bun-types" />
// bun test — แท็บ Track Record แสดงล็อกกติกาช่วงเก็บผล (SSR): วันที่ล็อก · hash · drift/การเปลี่ยนหลังล็อกเป็นป้ายแดง
import { describe, expect, it } from "bun:test"
import { renderToString } from "react-dom/server"
import type { TrackFreezeInfo } from "@/lib/research/freeze"
import type { TrackRecordResponse } from "@/lib/track/types"
import { TrackRecordView } from "./track-record-tab"

const H = (c: string) => c.repeat(64)

function mkTrack(freeze?: TrackFreezeInfo): TrackRecordResponse & { freeze?: TrackFreezeInfo } {
  return {
    generatedAt: "2026-09-23T11:00:00.000Z",
    status: "OK",
    provenance: { label: "REAL (feed: yahoo)", evidenceLabel: "REAL", isSynthetic: false, latestSource: "yahoo", sourceKnown: true, epochStart: null, epochStartEventId: null, epochKind: "replace-demo" },
    liveSince: "2026-09-01",
    firstRunAt: "2026-09-01T11:00:00.000Z",
    latestDate: "2026-09-01",
    sessions: 0,
    mode: { label: "LIVE", liveRuns: 1, replayRuns: 0, maxLagDays: 0, firstLiveDate: "2026-09-01" },
    nav: [{ date: "2026-09-01", nav: 1, bench: 1, exposure: 0 }],
    stats: {
      totalReturnPct: null, benchReturnPct: null, excessReturnPct: null, cagrPct: null, benchCagrPct: null, volPct: null, sharpe: null,
      maxDrawdownPct: null, benchMaxDrawdownPct: null, closedTrades: 0, openTrades: 0, hitRatePct: null, avgWinPct: null, avgLossPct: null,
      payoff: null, profitFactor: null, realizedPct: null, unrealizedPct: null, avgExposurePct: null, turnoverAnnual: null, avgHoldSessions: null,
      tStatExcess: null, sessionsForSignificance: null,
    },
    decisions: { total: 1, runs: 1, entries: 0, exits: 0, tightens: 0, watch: 0, pendingBuys: 0, human: 0, reversal: 0, shadow: 0, priorEpoch: 0, unmatchedExits: 0, orphanLegs: 0, estimatedSlots: 0, duplicateEntries: 0, untrackedPositions: [] },
    legs: [],
    confidence: { tooEarly: true, verdict: "TOO_EARLY", label: "ยังเร็วเกินไปที่จะตัดสิน", notes: [], minSessions: 60, minClosedTrades: 30 },
    tamper: {
      audit: { ok: true, total: 5, brokenAt: null },
      latestEvent: { id: 5, kind: "live_freeze", ts: "2026-08-31T00:00:00.000Z", hash: H("a") },
      ledgerHash: H("b"),
      ledgerDecisions: 1,
      ledgerMaxDecisionId: 1,
      snapshots: { count: 0, lastDate: null, lastAt: null, ledgerMismatches: 0, firstLedgerMismatch: null, navChecked: 0, navMismatches: 0, navSuperseded: 0 },
    },
    method: { weighting: "slots/7", costPerLegPct: 0.7, maxSlots: 7, benchmark: "EW liquid", prices: "close" },
    notes: [],
    ...(freeze ? { freeze } : {}),
  }
}

const baseFreeze: TrackFreezeInfo = {
  frozen: true,
  corrupt: false,
  frozenAt: "2026-08-31T10:00:00.000Z",
  dataDate: "2026-08-29",
  note: "H: Jev ชนะ benchmark t ≥ 2 ที่ 120 วัน",
  hashes: { config_th: H("1"), signals_policy: H("2"), stops_policy: H("3"), meta_model: null, prereg_trial: H("4") },
  preregHash: H("5"),
  drift: [],
  integrity: [],
  changes: [],
  startedBeforeFreeze: false,
  beforeEpoch: false,
  violated: false,
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

describe("TrackRecordView — ล็อกกติกาช่วงเก็บผล", () => {
  it("ล็อกก่อนเริ่ม record และค่าตรง: ป้าย 🔒 + วันที่ล็อก + สมมติฐาน + hash ย่อ · ไม่มีป้ายแดง", () => {
    const html = text(renderToString(<TrackRecordView track={mkTrack(baseFreeze)} trust={null} />))
    expect(html).toContain("🔒 ล็อกกติกา 2026-08-31")
    expect(html).toContain("ล็อกกติกาช่วงเก็บผล: ล็อกตั้งแต่")
    expect(html).toContain("H: Jev ชนะ benchmark")
    expect(html).toContain(`config ${H("1").slice(0, 10)}…`)
    expect(html).toContain("meta —") // ไม่มีค่า = —
    expect(html).toContain("ค่าที่ระบบเทรดใช้ตรงกับตอนล็อกทุกตัว")
    expect(html).not.toContain("กติกาเปลี่ยน/ตรวจไม่ผ่านระหว่างช่วงล็อก")
    expect(html).toContain("ตรวจผ่าน")
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })

  it("drift + เปลี่ยนกติกาหลังล็อก: ป้ายแดงบนหัว + banner + รายการ (หลังล็อก) + TR4 มีปัญหา", () => {
    const f: TrackFreezeInfo = {
      ...baseFreeze,
      drift: [{ key: "signals_policy", label: "signals_policy — สัญญาณที่ PROMOTE + น้ำหนัก", frozen: H("2"), current: H("9") }],
      changes: [{ id: 42, ts: "2026-09-05T03:00:00.000Z", kind: "config", keys: ["config_th"], afterFreeze: true, text: "แก้ config_th" }],
      violated: true,
    }
    const html = text(renderToString(<TrackRecordView track={mkTrack(f)} trust={null} />))
    expect(html).toContain("⚠️ กติกาไม่ตรงกับที่ล็อก")
    expect(html).toContain("กติกาเปลี่ยน/ตรวจไม่ผ่านระหว่างช่วงล็อก")
    expect(html).toContain("ค่าที่ระบบเทรดใช้ไม่ตรงกับตอนล็อก: signals_policy")
    expect(html).toContain("#42 แก้ config_th")
    expect(html).toContain("(หลังล็อก)")
    expect(html).toContain("มีปัญหา")
  })

  it("ยังไม่ล็อก: ป้ายยังไม่ล็อก + บอกทางล็อก · ข้อมูลเก่าที่ไม่มี freeze ยังเรนเดอร์ได้", () => {
    const off: TrackFreezeInfo = { ...baseFreeze, frozen: false, frozenAt: null, dataDate: null, note: null, hashes: null, preregHash: null }
    const html = text(renderToString(<TrackRecordView track={mkTrack(off)} trust={null} />))
    expect(html).toContain("ยังไม่ล็อกกติกา")
    expect(html).toContain("ล็อกที่แท็บ Evidence ก่อนเริ่มนับ")
    const legacy = text(renderToString(<TrackRecordView track={mkTrack()} trust={null} />))
    expect(legacy).not.toContain("ล็อกกติกาช่วงเก็บผล")
    expect(legacy).not.toMatch(/NaN|undefined/)
  })
})
