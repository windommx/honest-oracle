/// <reference types="bun-types" />
// bun test — track record (pure): ledger จาก Decision/Trade/Position · NAV คำนวณมือเทียบ · สถิติ · ป้ายความเชื่อมั่น · ledger hash
import { describe, expect, it } from "bun:test"

import { assessConfidence, MIN_CLOSED_TRADES, MIN_SESSIONS } from "./confidence"
import { buildLedger, chainHashAt, estimatedSlots, ledgerChain, type LedgerDecision } from "./ledger"
import { computeTrackStats, simulateNav, type PriceMatrix } from "./nav"

const at = (date: string, lagDays = 0) => new Date(Date.parse(`${date}T11:00:00Z`) + lagDays * 86_400_000) // 18:00 BKK
let nextId = 1
const dec = (p: Partial<LedgerDecision> & Pick<LedgerDecision, "date" | "question" | "target" | "action">): LedgerDecision => ({
  id: nextId++,
  conf: 0.7,
  reason: "",
  executed: false,
  source: "lite",
  createdAt: at(p.date),
  ...p,
})

describe("buildLedger", () => {
  nextId = 1
  const decisions: LedgerDecision[] = [
    dec({ date: "2026-09-01", question: "Q_SIGNAL", target: "mom", action: "promote", source: "policy", executed: true }), // ไม่ใช่ของ Jev
    dec({ date: "2026-09-01", question: "Q_REGIME", target: "market", action: "risk_on" }),
    dec({ date: "2026-09-01", question: "Q_ENTRY", target: "AAA", action: "buy", conf: 0.9, executed: true }),
    dec({ date: "2026-09-01", question: "Q_ENTRY", target: "AAA", action: "buy", source: "lite+v2-shadow" }),
    dec({ date: "2026-09-01", question: "Q_ENTRY", target: "WWW", action: "watch" }),
    dec({ date: "2026-09-02", question: "Q_REGIME", target: "market", action: "neutral" }),
    dec({ date: "2026-09-02", question: "Q_ENTRY", target: "BBB", action: "buy", conf: 0.72, executed: true, source: "human" }),
    dec({ date: "2026-09-02", question: "Q_ENTRY", target: "CCC", action: "buy", conf: 0.72, executed: false }), // ส่ง human gate
    dec({ date: "2026-09-03", question: "Q_REGIME", target: "market", action: "risk_on" }),
    dec({ date: "2026-09-03", question: "Q_ENTRY", target: "DDD", action: "buy", conf: 0.8, executed: true }), // จะกลายเป็น orphan
    dec({ date: "2026-09-03", question: "Q_ENTRY", target: "EEE", action: "buy", conf: 0.72, executed: true, source: "reversal" }),
    dec({ date: "2026-09-04", question: "Q_REGIME", target: "market", action: "risk_on" }),
    dec({ date: "2026-09-04", question: "Q_EXIT", target: "AAA", action: "exit", executed: true }),
    dec({ date: "2026-09-04", question: "Q_EXIT", target: "SEED1", action: "exit", executed: true }), // สถานะของ seed
    dec({ date: "2026-09-04", question: "Q_EXIT", target: "BBB", action: "tighten", executed: true }),
    dec({ date: "2026-09-04", question: "Q_ENTRY", target: "BBB", action: "buy", conf: 0.9, executed: true }), // ซ้ำ ขณะยังถือ
    dec({ date: "2026-09-05", question: "Q_REGIME", target: "market", action: "risk_on" }),
    dec({ date: "2026-09-05", question: "Q_EXIT", target: "EEE", action: "exit", executed: true }), // ไม่มี Trade (human exit) ไม่มี snapshot
  ]
  const L = buildLedger({
    decisions,
    trades: [
      { id: 1, symbol: "AAA", entry: "2026-09-01", exit: "2026-09-04", entryPx: 10, exitPx: 11, ret: 8.6, stopPolicy: "jev" },
      { id: 2, symbol: "ZZZ", entry: "2026-08-01", exit: "2026-08-05", entryPx: 5, exitPx: 6, ret: 18.6, stopPolicy: "fixed15" }, // seed
    ],
    positions: [
      { symbol: "BBB", entryDate: "2026-09-02", entryPx: 20, slots: 0.75 },
      { symbol: "SEED2", entryDate: "2026-08-20", entryPx: 7, slots: 1 },
    ],
    snapshotLegs: [{ symbol: "AAA", entryDate: "2026-09-01", entryPx: 10, slots: 1.25 }],
  })

  it("นับเฉพาะ Decision ของ Jev · runs = จำนวนวันที่มี Q_REGIME · LIVE", () => {
    expect(L.counts.total).toBe(decisions.length - 1)
    expect(L.counts.runs).toBe(5)
    expect(L.liveSince).toBe("2026-09-01")
    expect(L.mode).toMatchObject({ label: "LIVE", liveRuns: 5, replayRuns: 0 })
    expect(L.counts.shadow).toBe(1)
    expect(L.counts.watch).toBe(1)
    expect(L.counts.pendingBuys).toBe(1)
    expect(L.counts.tightens).toBe(1)
    expect(L.counts.human).toBe(1)
    expect(L.counts.reversal).toBe(1)
  })

  it("จับคู่ไม้เข้า/ออก + ราคา/ขนาดจากแหล่งที่บันทึก (Trade → snapshot → Position → ประมาณ)", () => {
    const by = new Map(L.legs.map((l) => [l.symbol, l]))
    expect(by.get("AAA")).toMatchObject({ status: "closed", exitDate: "2026-09-04", recordedEntryPx: 10, recordedExitPx: 11, recordedRetPct: 8.6, slots: 1.25, slotsSource: "snapshot" })
    expect(by.get("BBB")).toMatchObject({ status: "open", recordedEntryPx: 20, slots: 0.75, slotsSource: "position", source: "human" })
    expect(by.get("EEE")).toMatchObject({ status: "closed", slots: 0.5, slotsSource: "estimated", recordedExitPx: null })
    expect(by.get("DDD")).toMatchObject({ status: "orphan" })
    expect(L.counts).toMatchObject({ entries: 5, exits: 3, unmatchedExits: 1, duplicateEntries: 1, orphanLegs: 1, estimatedSlots: 1 })
    expect(L.untrackedPositions).toEqual(["SEED2"])
  })

  it("ยุคข้อมูล: การตัดสินใจก่อน seed/replaceDemo ล่าสุดไม่นับ", () => {
    const L2 = buildLedger({ decisions, trades: [], positions: [], epochStartMs: at("2026-09-03").getTime() - 1 })
    expect(L2.counts.priorEpoch).toBe(7) // 4 ของ 09-01 + 3 ของ 09-02 (Q_SIGNAL ของ policy ไม่ใช่ของ Jev)
    expect(L2.liveSince).toBe("2026-09-03")
  })

  it("รอบที่ตัดสินใจช้ากว่าวันของข้อมูลเกิน 4 วัน = REPLAY", () => {
    nextId = 100
    const replay = [
      dec({ date: "2026-06-01", question: "Q_REGIME", target: "market", action: "neutral", createdAt: at("2026-06-01", 30) }),
      dec({ date: "2026-06-02", question: "Q_REGIME", target: "market", action: "neutral", createdAt: at("2026-06-02", 1) }),
    ]
    const L3 = buildLedger({ decisions: replay, trades: [], positions: [] })
    expect(L3.mode).toMatchObject({ label: "MIXED", liveRuns: 1, replayRuns: 1, maxLagDays: 30, firstLiveDate: "2026-06-02" })
  })

  it("ขนาดประมาณตามกติกาของ Jev: conf ≥ 0.85 → 1.0 ไม่งั้น 0.5", () => {
    expect(estimatedSlots(0.85)).toBe(1)
    expect(estimatedSlots(0.84)).toBe(0.5)
  })
})

describe("simulateNav — เทียบค่าคำนวณมือ", () => {
  const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08"]
  // AAA: เข้า 09-02 ออก 09-04 (1 slot) · BBB: เข้า 09-03 ยังถือ (0.5 slot) พักการซื้อขาย 09-07 · CCC อยู่ใน benchmark อย่างเดียว
  const px = [
    [10, 20, 5],
    [10, 20, 5],
    [11, 20, 5.5],
    [12.1, 22, 5.5],
    [12, NaN, 6],
    [12, 24.2, 6],
  ]
  const prices: PriceMatrix = {
    dates,
    px,
    symIdx: new Map([
      ["AAA", 0],
      ["BBB", 1],
      ["CCC", 2],
    ]),
    dateIdx: new Map(dates.map((d, i) => [d, i])),
  }
  const base = { entryId: 0, exitId: null, recordedEntryPx: null, recordedExitPx: null, recordedRetPct: null, source: "lite", conf: 0.9 }
  const legs = [
    { ...base, entryId: 1, symbol: "AAA", entryDate: "2026-09-02", exitDate: "2026-09-04", exitId: 5, slots: 1, slotsSource: "position" as const, status: "closed" as const, recordedEntryPx: 10 },
    { ...base, entryId: 2, symbol: "BBB", entryDate: "2026-09-03", exitDate: null, slots: 0.5, slotsSource: "position" as const, status: "open" as const, recordedEntryPx: 19 },
  ]
  const c = 0.007
  const nav = simulateNav({ legs, prices, startDate: "2026-09-02", maxSlots: 7, costLeg: c })

  it("NAV รายวัน = Σ น้ำหนัก × ผลตอบแทน − ต้นทุนต่อขา (หุ้นพัก = 0 แล้วเทียบราคาล่าสุดเมื่อกลับมา)", () => {
    const w1 = 1 / 7
    const w2 = 0.5 / 7
    let e = 1 - w1 * c // 09-02 เข้า AAA
    const exp = [e]
    e *= 1 + w1 * (11 / 10 - 1) - w2 * c // 09-03 AAA +10% · เข้า BBB
    exp.push(e)
    e *= 1 + w1 * (12.1 / 11 - 1) - w1 * c + w2 * (22 / 20 - 1) // 09-04 AAA +10% แล้วออก · BBB +10%
    exp.push(e)
    exp.push(e) // 09-07 BBB พัก = 0
    e *= 1 + w2 * (24.2 / 22 - 1) // 09-08 BBB กลับมา เทียบ 22
    exp.push(e)
    expect(nav.points.map((p) => p.date)).toEqual(dates.slice(1))
    nav.points.forEach((p, i) => expect(p.nav).toBeCloseTo(exp[i], 6))
    expect(nav.points.map((p) => p.exposure)).toEqual([0.1429, 0.2143, 0.0714, 0.0714, 0.0714])
    expect(nav.unpriced).toEqual([])
  })

  it("benchmark equal-weight รายวัน (หุ้นที่มีราคาทั้งสองวัน) · วันแรก = 1", () => {
    const b2 = (11 / 10 - 1 + 0 + 5.5 / 5 - 1) / 3
    const b3 = (12.1 / 11 - 1 + 22 / 20 - 1 + 0) / 3
    const b4 = (12 / 12.1 - 1 + 6 / 5.5 - 1) / 2 // BBB NaN ไม่นับ
    const b5 = 0 // AAA 12→12, CCC 6→6, BBB ขาดวันก่อน
    let b = 1
    const exp = [1]
    for (const r of [b2, b3, b4, b5]) exp.push((b *= 1 + r))
    nav.points.forEach((p, i) => expect(p.bench as number).toBeCloseTo(exp[i], 6))
  })

  it("liquid mask ตัดหุ้นที่ไม่ผ่านเกณฑ์ ณ วันก่อนหน้าออกจาก benchmark", () => {
    const liquid = dates.map(() => [true, true, false])
    const n2 = simulateNav({ legs, prices, liquid, startDate: "2026-09-02", maxSlots: 7, costLeg: c })
    expect(n2.points[1].bench as number).toBeCloseTo(1 + (11 / 10 - 1 + 0) / 2, 6)
  })

  it("ผลต่อไม้ + ราคาเข้าที่บันทึกต่างจาก DB (ข้อมูลถูกปรับย้อนหลัง) ถูกรายงาน", () => {
    const a = nav.priced.find((p) => p.leg.symbol === "AAA")!
    expect(a.netRet).toBeCloseTo(12.1 / 10 - 1 - 2 * c, 9)
    expect(a.holdSessions).toBe(2)
    expect(a.entryDrift).toBeCloseTo(0, 9)
    const b = nav.priced.find((p) => p.leg.symbol === "BBB")!
    expect(b.netRet).toBeCloseTo(24.2 / 20 - 1 - c, 9)
    expect(b.entryDrift).toBeCloseTo(20 / 19 - 1, 9)
  })

  it("สถิติ: ค่าที่วัดไม่ได้ (ข้อมูล < 20 วัน) = null ไม่ใช่ 0", () => {
    const s = computeTrackStats(nav)
    expect(s.closedTrades).toBe(1)
    expect(s.openTrades).toBe(1)
    expect(s.hitRatePct).toBe(100)
    expect(s.avgLossPct).toBeNull()
    expect(s.payoff).toBeNull()
    expect(s.sharpe).toBeNull()
    expect(s.volPct).toBeNull()
    expect(s.cagrPct).toBeNull()
    expect(s.tStatExcess).toBeNull()
    expect(s.turnoverAnnual).toBeNull()
    expect(s.totalReturnPct).toBeCloseTo((nav.points[4].nav - 1) * 100, 2)
    expect(s.realizedPct).toBeCloseTo((1 / 7) * (12.1 / 10 - 1 - 2 * c) * 100, 2)
    expect(s.maxDrawdownPct).toBe(0)
  })

  it("ไม้ที่หุ้นไม่มีราคาใน DB ถูกแยกเป็น unpriced (ไม่เดาราคา)", () => {
    const n3 = simulateNav({ legs: [{ ...legs[1], symbol: "GONE" }], prices, startDate: "2026-09-02", maxSlots: 7, costLeg: c })
    expect(n3.unpriced).toEqual(["GONE"])
    expect(n3.points.every((p) => p.nav === 1)).toBe(true)
  })
})

describe("สถิติระยะยาว — t-stat ของส่วนเกิน benchmark", () => {
  // 120 วัน: AAA ขึ้นวันละ ~0.5% สลับ, ตลาด (BBB) ทรงตัว — ถือ AAA ตลอด (open leg)
  const n = 121
  const dates = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString().slice(0, 10))
  const px: number[][] = []
  let a = 10
  let b = 10
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      a *= 1 + (i % 2 ? 0.012 : -0.004)
      b *= 1 + (i % 2 ? 0.004 : -0.004)
    }
    px.push([a, b])
  }
  const prices: PriceMatrix = { dates, px, symIdx: new Map([["AAA", 0], ["BBB", 1]]), dateIdx: new Map(dates.map((d, i) => [d, i])) }
  const leg = { entryId: 1, exitId: null, symbol: "AAA", entryDate: dates[0], exitDate: null, slots: 7, slotsSource: "position" as const, status: "open" as const, recordedEntryPx: null, recordedExitPx: null, recordedRetPct: null, source: "lite", conf: 0.9 }
  const nav = simulateNav({ legs: [leg], prices, startDate: dates[0], maxSlots: 7, costLeg: 0.007 })
  const s = computeTrackStats(nav)
  it("มี CAGR/vol/Sharpe/t-stat เมื่อข้อมูลพอ · edge บวกคงที่ → t > 2 และประมาณวันที่ต้องสะสม", () => {
    expect(nav.points).toHaveLength(n)
    expect(s.cagrPct).not.toBeNull()
    expect(s.sharpe).not.toBeNull()
    expect(s.tStatExcess as number).toBeGreaterThan(2)
    expect(s.sessionsForSignificance as number).toBeGreaterThan(0)
    expect(s.avgExposurePct).toBe(100)
  })
})

describe("assessConfidence — ไม่มีป้าย 'พิสูจน์แล้ว'", () => {
  const baseIn = {
    hasData: true,
    runs: 100,
    evidenceLabel: "REAL" as const,
    sessions: 120,
    closedTrades: 50,
    tStatExcess: 0.5 as number | null,
    mode: { label: "LIVE" as const, liveRuns: 100, replayRuns: 0, maxLagDays: 1, firstLiveDate: "2026-01-05" },
    estimatedSlots: 0,
    untrackedPositions: [] as string[],
    orphanLegs: 0,
    unpriced: 0,
  }
  it("ลำดับการตัดสิน", () => {
    expect(assessConfidence({ ...baseIn, hasData: false }).verdict).toBe("NO_DATA")
    expect(assessConfidence({ ...baseIn, runs: 0 }).verdict).toBe("NO_RUNS")
    expect(assessConfidence({ ...baseIn, evidenceLabel: "SYNTHETIC" }).verdict).toBe("NOT_REAL")
    expect(assessConfidence({ ...baseIn, evidenceLabel: "UNVERIFIED_SOURCE", tStatExcess: 5 }).verdict).toBe("NOT_REAL")
    expect(assessConfidence({ ...baseIn, sessions: MIN_SESSIONS - 1, tStatExcess: 5 }).verdict).toBe("TOO_EARLY")
    expect(assessConfidence({ ...baseIn, closedTrades: MIN_CLOSED_TRADES - 1, tStatExcess: 5 }).verdict).toBe("TOO_EARLY")
    expect(assessConfidence(baseIn).verdict).toBe("NO_EDGE_YET")
    expect(assessConfidence({ ...baseIn, tStatExcess: 2.4 }).verdict).toBe("PROMISING")
    expect(assessConfidence({ ...baseIn, tStatExcess: -2.4 }).verdict).toBe("UNDERPERFORM")
  })
  it("บอกเหตุผลที่ยังไม่นับเป็นหลักฐานครบทุกข้อ", () => {
    const c = assessConfidence({
      ...baseIn,
      evidenceLabel: "SYNTHETIC",
      sessions: 3,
      closedTrades: 1,
      mode: { ...baseIn.mode, label: "MIXED", replayRuns: 2 },
      estimatedSlots: 1,
      untrackedPositions: ["SEED"],
      orphanLegs: 1,
      unpriced: 1,
    })
    expect(c.tooEarly).toBe(true)
    expect(c.notes.join(" ")).toContain("demo seed")
    expect(c.notes.join(" ")).toContain("replay")
    expect(c.notes.join(" ")).toContain("SEED")
    expect(c.notes).toHaveLength(8)
  })
})

describe("ledger hash chain", () => {
  nextId = 500
  const ds = [
    dec({ date: "2026-09-01", question: "Q_REGIME", target: "market", action: "risk_on" }),
    dec({ date: "2026-09-01", question: "Q_ENTRY", target: "AAA", action: "buy", executed: true, reason: "n_tf=3" }),
    dec({ date: "2026-09-02", question: "Q_REGIME", target: "market", action: "neutral" }),
  ]
  const chain = ledgerChain(ds)
  it("prefix hash คงที่เมื่อมี decision ใหม่ต่อท้าย · แก้เหตุผลย้อนหลัง = hash เปลี่ยน", () => {
    const more = ledgerChain([...ds, dec({ id: 999, date: "2026-09-03", question: "Q_REGIME", target: "market", action: "risk_off" })])
    expect(chainHashAt(more, ds[2].id)).toBe(chain[2].hash)
    const edited = ledgerChain(ds.map((d, i) => (i === 1 ? { ...d, reason: "n_tf=5" } : d)))
    expect(chainHashAt(edited, ds[2].id)).not.toBe(chain[2].hash)
    expect(chainHashAt(edited, ds[0].id)).toBe(chain[0].hash)
    expect(chainHashAt(chain, 0)).toMatch(/^[0-9a-f]{64}$/)
  })
})
