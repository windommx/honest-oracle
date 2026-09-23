/// <reference types="bun-types" />
// bun test — Bayesian stop-loss (Zambelli): posterior (bayes.ts) + walk-forward arm (engine.ts) ส่วนที่ pure
import { describe, expect, it } from "bun:test"

import { buildPosterior, DEFAULT_COST_RT, firstBreachCloses, liveBackstop, liveExit, type BayesTrade } from "./bayes"

// engine.ts import "@/lib/db" (PrismaClient สร้างแบบ lazy — test นี้ไม่ query เลย)
// DATABASE_URL ชี้ DB ชั่วคราวจาก preload (src/test/setup.ts) อยู่แล้ว — ห้ามทับเอง (bun test แชร์ Prisma singleton ข้ามไฟล์)
const { simulateArm, isDailyPath } = await import("./engine")
type StopTradeRec = import("./engine").StopTradeRec

/** path รายวันจาก p ต่อวัน (d = วันที่สมมติ เรียงได้แบบ string) */
const dailyPathOf = (ps: number[]) => ps.map((p, k) => ({ d: `2026-02-${String(k + 1).padStart(2, "0")}`, p }))

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

  it("มีเทรดที่มี path รายวัน → s* หาได้ตามปกติ และเป็นตัวเลขจำกัด", () => {
    // [แก้ test เดิม 2026-09-23] เดิมใช้เทรดไม่มี path แล้วคาดว่าได้ s* — s* นั้นมาจากสมมติ "ขายได้ที่ −s พอดี"
    // กับเทรดที่ไม่มีหลักฐานว่าราคาผ่าน −s เมื่อไร (บั๊กที่ทำให้ demo adopt stop 1%) → ตอนนี้ต้องมี path รายวัน
    const trades: BayesTrade[] = [
      { ret: 6, mae: 0.01, path: dailyPathOf([1, 0.99, 1.03, 1.074]), dailyPath: true },
      { ret: 4, mae: 0.02, path: dailyPathOf([1, 0.98, 1.02, 1.054]), dailyPath: true },
      { ret: -9, mae: 0.08, path: dailyPathOf([1, 0.97, 0.94, 0.92, 0.924]), dailyPath: true },
      { ret: -12, mae: 0.11, path: dailyPathOf([1, 0.96, 0.93, 0.9, 0.89, 0.894]), dailyPath: true },
    ]
    const p = buildPosterior(trades, { mode: "T" })
    expect(p.nObs).toBe(4)
    expect(p.fill).toBe("close")
    expect(p.nNoPathEvidence).toBe(0)
    expect(p.sOpt).not.toBeNull()
    expect(p.evCurve.length).toBe(p.bins.length) // จุดไม่มี stop + ทุกระดับ s
    for (const pt of p.evCurve) expect(Number.isFinite(pt.ev)).toBe(true)
  })

  it("เทรดไม่มี path รายวัน (path บาง/ไม่มี) → ไม่ให้เครดิต stop: เส้น E[R|s] แบนเท่า evNoStop และ sOpt = null", () => {
    // ชุดเดียวกับข้างบนแต่ไม่มีหลักฐาน path — โค้ดเดิม (fill="level") ได้ s* จากการตัดทุกไม้ขาดทุนที่ −s ฟรี ๆ
    const trades: BayesTrade[] = [
      { ret: 6, mae: 0.01 },
      { ret: 4, mae: 0.02 },
      { ret: -9, mae: 0.08, path: [{ d: "2026-02-01", p: 1 }, { d: "2026-02-05", p: 0.924 }] }, // path บาง
      { ret: -12, mae: 0.11 },
    ]
    const p = buildPosterior(trades, { mode: "T" })
    expect(p.sOpt).toBeNull()
    expect(p.evOpt).toBeNull()
    expect(p.nNoPathEvidence).toBe(4)
    for (const pt of p.evCurve) expect(pt.ev).toBe(p.evNoStop) // เท่ากันเป๊ะ (evNoStop + ส่วนปรับ 0 — ไม่มี s* จาก float noise)
    const legacy = buildPosterior(trades, { mode: "T", fill: "level" })
    expect(legacy.sOpt).not.toBeNull() // สมมติเดิมยังเรียกดูได้เพื่อเทียบ
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
    const s3 = (p: ReturnType<typeof buildPosterior>) => p.evCurve.find((c, i) => i > 0 && Math.abs(c.s - 0.03) < 1e-12)!.ev
    // [แก้ test เดิม 2026-09-23] สาขา stop หัก cost ทั้งสองวิธีเติมราคา — "level" = สูตรเดิมกับเทรดไม่มี path
    const p0 = buildPosterior([{ ret: -8, mae: 0.08 }], { mode: "T", cost: 0, fill: "level" })
    const p1 = buildPosterior([{ ret: -8, mae: 0.08 }], { mode: "T", cost: 0.02, fill: "level" })
    expect(s3(p0) - s3(p1)).toBeCloseTo(0.02, 9)
    // "close" (ค่าเริ่มต้น) กับเทรดที่มี path รายวัน: ขายที่ราคาปิดวันทะลุ − cost → cost ต่างกัน 0.02 = EV ต่างกัน 0.02
    const tr: BayesTrade = { ret: -8, mae: 0.08, path: dailyPathOf([1, 0.96, 0.92, 0.934]), dailyPath: true }
    const c0 = buildPosterior([tr], { mode: "T", cost: 0 })
    const c1 = buildPosterior([tr], { mode: "T", cost: 0.02 })
    expect(s3(c0) - s3(c1)).toBeCloseTo(0.02, 9)
  })
})

describe("buildPosterior — สาขา stop ใช้ราคาปิดวันแรกที่ทะลุจริง (fill=close) ไม่ใช่ −s พอดี", () => {
  it("ราคา gap ทะลุ stop: E[R|s] ได้ผลจริงที่แย่กว่า −s−cost · สูตรเดิม (level) มองโลกสวย", () => {
    // winner (MAE 1%) + loser ที่ gap จาก −1% ลง −12% ในวันเดียว แล้วจบ −15%
    const trades: BayesTrade[] = [
      { ret: 8.6, mae: 0.01, path: dailyPathOf([1, 0.99, 1.05, 1.1]), dailyPath: true },
      { ret: -16.4, mae: 0.15, path: dailyPathOf([1, 0.99, 0.88, 0.85]), dailyPath: true },
    ]
    const close = buildPosterior(trades, { mode: "T" })
    const level = buildPosterior(trades, { mode: "T", fill: "level" })
    const at = (p: ReturnType<typeof buildPosterior>, s: number) => p.evCurve.find((c, i) => i > 0 && Math.abs(c.s - s) < 1e-12)!.ev
    // stop 5%: loser ถูก stop วันที่ปิด 0.88 → −12% − cost (ไม่ใช่ −5% − cost)
    const pLoser = 0.5 // P(bin) ถ่วงต่อเทรด 1:1
    const evHoldWinnerBins = close.evHold[1] * 0.5 // winner อยู่ bin 1 < 5 → EV_hold(1)
    expect(at(close, 0.05)).toBeCloseTo(evHoldWinnerBins + pLoser * (0.88 - 1 - DEFAULT_COST_RT), 9)
    expect(at(level, 0.05)).toBeCloseTo(evHoldWinnerBins + pLoser * (-0.05 - DEFAULT_COST_RT), 9)
    expect(at(close, 0.05)).toBeLessThan(at(level, 0.05) - 0.03) // โค้ดเดิมให้เครดิตเกินจริง 7pp × P(bin)
  })

  it("ข้อมูลแบบ demo เดิม (path บาง, MAE = ขาดทุนตอนจบ): level ได้ s* = 1% ปลอม · close ไม่แต่ง s*", () => {
    const trades: BayesTrade[] = []
    for (let i = 0; i < 40; i++) {
      const up = i % 2 === 0
      const pEnd = up ? 1 + 0.01 * (1 + (i % 7)) : 1 - 0.01 * (2 + (i % 9))
      trades.push({
        ret: (pEnd - 1 - DEFAULT_COST_RT) * 100,
        mae: Math.max(0, 1 - pEnd),
        path: [{ d: "2026-01-01", p: 1 }, { d: "2026-01-15", p: pEnd }],
        dailyPath: false,
      })
    }
    expect(buildPosterior(trades, { mode: "T", fill: "level" }).sOpt).toBe(0.01) // อาการที่ demo เคยเห็น
    expect(buildPosterior(trades, { mode: "T" }).sOpt).toBeNull()
    expect(buildPosterior(trades, { mode: "R" }).sOpt).toBeNull()
  })

  it("firstBreachCloses: ราคาปิดวันแรกที่ bin ของ dd ≥ k (เรียงตามวันที่ ไม่พึ่งลำดับ array)", () => {
    const path = [
      { d: "2026-03-04", p: 0.9 },
      { d: "2026-03-01", p: 1 },
      { d: "2026-03-02", p: 0.985 },
      { d: "2026-03-03", p: 0.95 },
    ]
    const out = firstBreachCloses(path, 0.01, 26, 10)
    expect(out[1]).toBe(0.985) // dd 1.5% → bin 1
    expect(out[2]).toBe(0.95) // gap จาก bin 1 ไป bin 5 ในวันเดียว → k = 2..5 ขายที่ 0.95 ทั้งหมด
    expect(out[5]).toBe(0.95)
    expect(out[6]).toBe(0.9)
    expect(out[10]).toBe(0.9)
    expect(Number.isNaN(firstBreachCloses([{ d: "a", p: 0.97 }], 0.01, 26, 5)[4])).toBe(true) // path ไปไม่ถึง
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

  it("path รายวันครบ: stop ที่ close แรกที่ dd ≥ s และขายที่ราคาปิดวันนั้น (ไม่ใช่ระดับ stop พอดี)", () => {
    // [แก้ test เดิม 2026-09-23] เดิมคาด ret = −10% − cost ทั้งที่ราคาปิดวันทะลุคือ 0.89 (−11%) — fill ที่ระดับ stop
    // ดีกว่าที่ live Jev ทำได้จริง (Jev ปิด ณ ราคาปิด) = บั๊กมองโลกสวย · สมมติเดิมยังเรียกได้ด้วย fill: "level"
    const ps = [1, 0.97, 0.95, 0.93, 0.89, 0.86, 0.9]
    const path = ps.map((p, k) => ({ d: dates[3 + k], p }))
    const t = trade(3, 9, path, 0.9)
    const a = simulateArm("fixed10", [t], N, dateIdx)
    expect(a.fill).toBe("close")
    expect(a.trades[0].stopped).toBe(true)
    expect(a.trades[0].stopIdx).toBe(7) // 0.89 → dd 11% ≥ 10%
    expect(a.trades[0].ret).toBeCloseTo((0.89 - 1 - DEFAULT_COST_RT) * 100, 9)
    const legacy = simulateArm("fixed10", [t], N, dateIdx, { fill: "level" })
    expect(legacy.trades[0].ret).toBeCloseTo((-0.1 - DEFAULT_COST_RT) * 100, 9)
  })

  it("ราคา gap ลงทะลุ stop: ขายที่ราคาปิดวัน gap (−20%) ทั้งในผลเทรดและ equity รายวัน", () => {
    const path = [1, 0.99, 0.8, 0.82].map((p, k) => ({ d: dates[3 + k], p }))
    const t = trade(3, 6, path, 0.82)
    const a = simulateArm("fixed10", [t], N, dateIdx)
    expect(a.trades[0].stopIdx).toBe(5)
    expect(a.trades[0].ret).toBeCloseTo((0.8 - 1 - DEFAULT_COST_RT) * 100, 9) // เดิม −11.4% (ขายได้ที่ 0.90)
    const leg = DEFAULT_COST_RT / 2
    const dayMove = a.equity[5] / a.equity[4] - 1
    expect(dayMove).toBeCloseTo((0.8 / 0.99 - 1 - leg) / 7, 12) // วันทะลุ: จาก 0.99 → 0.80 − ต้นทุนขาออก
    for (let i = 6; i < N; i++) expect(a.equity[i]).toBeCloseTo(a.equity[5], 12) // ออกแล้ว ไม่ขยับต่อ
  })

  it("path บาง (วันเข้า+วันออก) ขาดทุนเกิน s: fill=close ได้ผลเท่าถือจนจบ (ไม่มีเครดิต stop ฟรี) · level ตัดที่ −s", () => {
    const t = trade(5, 15, [{ d: dates[5], p: 1 }, { d: dates[15], p: 0.85 }], 0.85)
    const a = simulateArm("fixed10", [t], N, dateIdx)
    expect(a.trades[0].ret).toBeCloseTo(t.ret, 1) // −16.4% = ผลจริงของเทรด
    const legacy = simulateArm("fixed10", [t], N, dateIdx, { fill: "level" })
    expect(legacy.trades[0].ret).toBeCloseTo((-0.1 - DEFAULT_COST_RT) * 100, 9) // −11.4% โดยไม่มีหลักฐานว่าเคยผ่าน −10%
  })

  it("isDailyPath: path ครอบวันที่มีราคาจริง ≥ 80% (ข้ามวันหยุดพักได้) · path บาง = ไม่ใช่", () => {
    const prices = dates.map((_, i) => (i === 8 || i === 9 ? NaN : 10)) // หยุดพักวันที่ 8–9
    const full = [5, 6, 7, 10, 11, 12].map((i) => ({ d: dates[i] }))
    expect(isDailyPath(full, 5, 12, prices, dates)).toBe(true)
    expect(isDailyPath([{ d: dates[5] }, { d: dates[12] }], 5, 12, prices, dates)).toBe(false)
    expect(isDailyPath([{ d: dates[5] }, { d: dates[6] }], 5, 6, prices, dates)).toBe(true) // ถือ 1 วัน = ครบ
    expect(isDailyPath(full, null, 12, prices, dates)).toBe(false)
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
