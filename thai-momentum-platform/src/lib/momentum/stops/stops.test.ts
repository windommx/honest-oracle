/// <reference types="bun-types" />
// bun test — Bayesian stop-loss (Zambelli): posterior (bayes.ts) + walk-forward arm (engine.ts) ส่วนที่ pure
import { describe, expect, it } from "bun:test"

import { buildPosterior, DEFAULT_COST_RT, liveBackstop, liveExit, type BayesTrade } from "./bayes"

// engine.ts import "@/lib/db" (PrismaClient สร้างแบบ lazy — test นี้ไม่ query เลย)
// DATABASE_URL ชี้ DB ชั่วคราวจาก preload (src/test/setup.ts) อยู่แล้ว — ห้ามทับเอง (bun test แชร์ Prisma singleton ข้ามไฟล์)
const { simulateArm } = await import("./engine")
type StopTradeRec = import("./engine").StopTradeRec

describe("buildPosterior — ไม่มีข้อมูล = ไม่มี posterior (ไม่แต่งตัวเลขจาก prior)", () => {
  it("0 เทรด → sOpt/evOpt = null, evCurve ว่าง, liveExit/backstop ไม่ตัดสิน", () => {
    for (const mode of ["T", "R"] as const) {
      const p = buildPosterior([], { mode })
      expect(p.nTrades).toBe(0)
      expect(p.nObs).toBe(0)
      expect(p.sOpt).toBeNull()
      expect(p.evOpt).toBeNull()
      expect(p.evCurve).toEqual([])
      expect(Number.isFinite(p.evNoStop)).toBe(true)
      expect(liveBackstop(p)).toBeNull()
      const lv = liveExit(p, 0.05)
      expect(lv.pL).toBeNull()
      expect(lv.evHold).toBeNull()
      expect(lv.exit).toBe(false)
    }
  })

  it("R mode ที่เทรดไม่มี path เลย (nObs = 0) → ไม่มี s* / ไม่ตัดสินหน้างาน", () => {
    const trades: BayesTrade[] = [
      { ret: -6.4, mae: 0.05, path: [] },
      { ret: 3.1, mae: 0.01 },
    ]
    const p = buildPosterior(trades, { mode: "R" })
    expect(p.nTrades).toBe(2)
    expect(p.nObs).toBe(0)
    expect(p.sOpt).toBeNull()
    expect(p.evCurve).toEqual([])
    expect(liveExit(p, 0.03).evHold).toBeNull()
  })

  it("มีเทรด → s* หาได้ตามปกติ และเป็นตัวเลขจำกัด", () => {
    const trades: BayesTrade[] = [
      { ret: 6, mae: 0.01 },
      { ret: 4, mae: 0.02 },
      { ret: -9, mae: 0.08 },
      { ret: -12, mae: 0.11 },
    ]
    const p = buildPosterior(trades, { mode: "T" })
    expect(p.nObs).toBe(4)
    expect(p.sOpt).not.toBeNull()
    expect(p.evCurve.length).toBe(p.bins.length) // จุดไม่มี stop + ทุกระดับ s
    for (const pt of p.evCurve) expect(Number.isFinite(pt.ev)).toBe(true)
  })
})

describe("buildPosterior — EV ของเทรดที่ถูก stop ต้องหักต้นทุน round-trip (−s − cost)", () => {
  it("stop ที่ระดับเดียวกับ drawdown สุดท้ายของเทรด ให้ผลเท่ากับถือจนจบ (ไม่ได้กำไรต้นทุนฟรี)", () => {
    // loser เดียว: จบที่ราคา −5% (MAE 5%) → ret หลังต้นทุน = −5% − 1.4% = −6.4%
    const ret = (-0.05 - DEFAULT_COST_RT) * 100
    const p = buildPosterior([{ ret, mae: 0.05 }], { mode: "T" })
    const at5 = p.evCurve.find((c, i) => i > 0 && Math.abs(c.s - 0.05) < 1e-12)
    expect(at5).toBeDefined()
    // โค้ดเดิมคิด −s = −5% → อ้างว่า stop ที่ 5% ดีกว่าถือ 1.4pp ทั้งที่ผลลัพธ์ราคาเดียวกันเป๊ะ
    expect(at5!.ev).toBeCloseTo(p.evNoStop, 6)
    expect(at5!.ev).toBeCloseTo(ret / 100, 6)
  })

  it("cost ส่งเองได้ และ default = 2 ขา × (commission 30 + slippage 40 bps)", () => {
    expect(DEFAULT_COST_RT).toBeCloseTo(0.014, 12)
    const p0 = buildPosterior([{ ret: -8, mae: 0.08 }], { mode: "T", cost: 0 })
    const p1 = buildPosterior([{ ret: -8, mae: 0.08 }], { mode: "T", cost: 0.02 })
    const s3 = (p: ReturnType<typeof buildPosterior>) => p.evCurve.find((c, i) => i > 0 && Math.abs(c.s - 0.03) < 1e-12)!.ev
    expect(s3(p0) - s3(p1)).toBeCloseTo(0.02, 9)
  })
})

describe("simulateArm — path ผูกกับวันที่ (ไม่ใช่ตำแหน่งใน array)", () => {
  // ปฏิทินทำการ 30 วัน
  const dates = Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`)
  const dateIdx = new Map(dates.map((d, i) => [d, i]))
  const N = dates.length
  const trade = (ei: number, ex: number, path: { d: string; p: number }[], pEnd: number): StopTradeRec => ({
    id: 1,
    symbol: "AAA",
    entry: dates[ei],
    exit: dates[ex],
    ret: Math.round((pEnd - 1 - DEFAULT_COST_RT) * 10000) / 100,
    mae: Math.max(0, ...path.map((x) => 1 - x.p)),
    regime: "neutral",
    src: "auto",
    holdDays: ex - ei,
    path,
    exIdx: ex,
    eiIdx: ei,
  })
  const firstMove = (eq: number[]) => eq.findIndex((v, i) => i > 0 && Math.abs(v - eq[i - 1]) > 1e-12)

  it("path บาง (วันเข้า + วันออก): stop เกิดวันออก ไม่ใช่วันถัดจากวันเข้า (ไม่มองอนาคต)", () => {
    const t = trade(5, 15, [{ d: dates[5], p: 1 }, { d: dates[15], p: 0.85 }], 0.85)
    const a = simulateArm("fixed10", [t], N, dateIdx)
    expect(a.trades).toHaveLength(1)
    expect(a.trades[0].stopped).toBe(true)
    expect(a.trades[0].stopIdx).toBe(15) // โค้ดเดิม = 6 (ใช้ราคาวันที่ 15 ตั้งแต่วันที่ 6)
    const moves = a.equity.map((v, i) => (i > 0 ? v - a.equity[i - 1] : 0))
    // มีแค่ต้นทุนขาเข้าวันที่ 5 และผลขาดทุนวันที่ 15 — วันระหว่างกลางไม่ขยับ
    for (let i = 6; i < 15; i++) expect(Math.abs(moves[i])).toBeLessThan(1e-12)
    expect(moves[15]).toBeLessThan(-0.01)
    expect(firstMove(a.equity)).toBe(5)
  })

  it("winner path บาง: ลงบัญชีวันออก และหักต้นทุนขาออกครบ", () => {
    const t = trade(5, 15, [{ d: dates[5], p: 1 }, { d: dates[15], p: 1.1 }], 1.1)
    const a = simulateArm("fixed10", [t], N, dateIdx)
    expect(a.trades[0].stopped).toBe(false)
    const leg = DEFAULT_COST_RT / 2
    const expected = (1 - leg / 7) * (1 + (1.1 - 1 - leg) / 7) // maxPos = 7 slot เท่ากัน
    expect(a.equity[N - 1]).toBeCloseTo(expected, 10) // โค้ดเดิมไม่หักขาออก → 1.0133 แทน 1.0123
    expect(a.equity[14]).toBeCloseTo(1 - leg / 7, 12)
  })

  it("path รายวันครบ: stop ที่ close แรกที่ dd ≥ s (พฤติกรรมเดิมคงอยู่)", () => {
    const ps = [1, 0.97, 0.95, 0.93, 0.89, 0.86, 0.9]
    const path = ps.map((p, k) => ({ d: dates[3 + k], p }))
    const t = trade(3, 9, path, 0.9)
    const a = simulateArm("fixed10", [t], N, dateIdx)
    expect(a.trades[0].stopped).toBe(true)
    expect(a.trades[0].stopIdx).toBe(7) // 0.89 → dd 11% ≥ 10%
    expect(a.trades[0].ret).toBeCloseTo((-0.1 - DEFAULT_COST_RT) * 100, 9)
  })

  it("path ว่าง (ข้อมูลเก่า): ใช้ราคาวันออกจาก ret — ไม่ throw ไม่ข้ามต้นทุน", () => {
    const t = { ...trade(2, 6, [], 1.05), mae: 0 }
    const a = simulateArm("fixed10", [t], N, dateIdx)
    expect(a.trades[0].stopped).toBe(false)
    const leg = DEFAULT_COST_RT / 2
    expect(a.equity[N - 1]).toBeCloseTo((1 - leg / 7) * (1 + (1.05 - 1 - leg) / 7), 6)
    for (const v of a.equity) expect(Number.isFinite(v)).toBe(true)
  })

  it("bayes arm ไม่มีเทรดก่อน refit → ไม่แต่ง s* (ใช้ fallback 10% ตามกติกา)", () => {
    const a = simulateArm("bayesT", [], 200, new Map())
    expect([...a.sMap.values()].every((s) => s === 0.1)).toBe(true)
  })
})
