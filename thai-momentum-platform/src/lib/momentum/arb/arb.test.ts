/// <reference types="bun-types" />
// bun test — Alpha Stack ส่วนที่ pure: pairs scanner (จับคู่ตามวันที่) + เครื่องคิดเลข VRP/options
import { describe, expect, it } from "bun:test"

import type { Row } from "@/lib/momentum/signals/engine"
import { condorPlan } from "../vrp"
import { calendarSignal } from "./basis"
import { backtestPair, scanPairs } from "./pairs"

// คู่ cointegrated ตามตำรา: A = random walk, B = A − OU spread (half-life ~8 วัน, β = 1)
function makePair(M: number): { dates: string[]; la: number[]; lb: number[] } {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const dates = Array.from({ length: M }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10))
  let a = Math.log(50)
  let s = 0
  const la: number[] = []
  const lb: number[] = []
  for (let i = 0; i < M; i++) {
    a += 0.012 * gauss()
    s = s * Math.exp(-Math.log(2) / 8) + 0.01 * gauss()
    la.push(a)
    lb.push(a - s)
  }
  return { dates, la, lb }
}

function rowsOf(
  p: { dates: string[]; la: number[]; lb: number[] },
  dropA: (i: number) => boolean = () => false,
  stopB?: number
): Row[] {
  const rows: Row[] = []
  p.dates.forEach((d, i) => {
    if (!dropA(i)) rows.push({ date: d, symbol: "AAA", close: Math.exp(p.la[i]), val: 5e6, liq5: 1 })
    if (stopB === undefined || i < stopB) rows.push({ date: d, symbol: "BBB", close: Math.exp(p.lb[i]), val: 5e6, liq5: 1 })
  })
  return rows
}

describe("scanPairs — legs aligned by date", () => {
  const p = makePair(320)
  const clean = scanPairs(rowsOf(p), () => "Banking")

  it("finds the cointegrated pair on clean data", () => {
    expect(clean.tested).toBe(1)
    expect(clean.pairs[0].beta).toBeCloseTo(0.985, 2)
  })

  it("a few suspension days on one leg do not shift the whole series (same β / half-life as clean)", () => {
    const holes = scanPairs(rowsOf(p, (i) => i === 120 || i === 180 || i === 240 || i === 300), () => "Banking")
    expect(holes.tested).toBe(1) // เดิม: จับคู่ตามลำดับแถว → เลื่อนวัน → คู่หลุดเกณฑ์
    expect(holes.pairs[0].beta).toBeCloseTo(clean.pairs[0].beta, 1)
    expect(Math.abs(holes.pairs[0].hl - clean.pairs[0].hl)).toBeLessThan(1)
    // spread ที่ส่งให้ backtest ต้องยาวเท่ากันและมาจากวันเดียวกัน
    expect(holes.pairs[0].logA.length).toBe(holes.pairs[0].logB.length)
  })

  it("a leg that stopped trading (no price on the latest market date) is not offered as a pair", () => {
    const stale = scanPairs(rowsOf(p, () => false, 290), () => "Banking")
    expect(stale.tested).toBe(0) // เดิม: β=0.80 hl=24 จากราคาที่ห่างกัน 30 วัน
  })

  it("different sectors are never paired; empty input is safe", () => {
    expect(scanPairs(rowsOf(p), (s) => (s === "AAA" ? "Banking" : "Energy")).scanned).toBe(0)
    expect(scanPairs([], () => "X")).toEqual({ scanned: 0, tested: 0, pairs: [] })
  })

  it("backtest on an aligned spread returns finite stats", () => {
    const q = clean.pairs[0]
    const bt = backtestPair(q.logA.map((v, i) => v - q.beta * q.logB[i]), q.hl, { costPerLegBps: 55 })
    for (const v of Object.values(bt)) expect(Number.isFinite(v)).toBe(true)
  })
})

describe("calendarSignal — documented action bands", () => {
  // ประวัติ basis แบบเดียวกับเครื่องคิดเลขใน Alpha tab
  const hist = Array.from({ length: 60 }, (_, i) => 10 + 3 * Math.sin(i * 0.7) + 1.5 * Math.cos(i * 1.3))
  const at = (far: number) => calendarSignal({ px: 1358, T: 30 / 365 }, { px: far, T: 90 / 365 }, 1350, 0.025, hist)

  it("|z| > 3.5 → STOP (checked before the entry bands)", () => {
    expect(at(1369).z).toBeGreaterThan(3.5)
    expect(at(1369).action).toBe("STOP") // เดิม SHORT_SPREAD
    expect(at(1340).z).toBeLessThan(-3.5)
    expect(at(1340).action).toBe("STOP") // เดิม LONG_SPREAD
  })
  it("entry / exit bands unchanged", () => {
    const short = at(1362)
    expect(short.z).toBeGreaterThan(2)
    expect(short.z).toBeLessThanOrEqual(3.5)
    expect(short.action).toBe("SHORT_SPREAD")
    const exit = calendarSignal({ px: 1358, T: 30 / 365 }, { px: 1357.4, T: 90 / 365 }, 1350, 0.025, hist)
    expect(Math.abs(exit.z)).toBeLessThan(0.5)
    expect(exit.action).toBe("EXIT")
  })
})

describe("condorPlan — calculator inputs (blank field = 0)", () => {
  const base = { S: 1350, iv: 0.16, ivPct: 0.65, dte: 30, riskPct: 0.01, equity: 1_000_000 }

  it("zero / negative / NaN inputs → not open with a clear reason (never 'Infinity' contracts or NaN strikes)", () => {
    for (const bad of [{ iv: 0 }, { dte: 0 }, { dte: -5 }, { S: 0 }, { equity: 0 }, { ivPct: Number.NaN }]) {
      const plan = condorPlan({ ...base, ...bad })
      expect(plan.open).toBe(false)
      expect(plan.contracts).toBeUndefined()
      expect(plan.reason).toContain("ข้อมูลไม่ครบ")
    }
  })

  it("valid inputs unchanged: strikes at ±1.2/1.6 expected moves, contracts from the 1% risk budget", () => {
    const plan = condorPlan(base)
    const em = 1350 * 0.16 * Math.sqrt(30 / 365)
    expect(plan.open).toBe(true)
    expect(plan.strikes!.sC).toBeCloseTo(1350 + 1.2 * em, 9)
    expect(plan.maxLoss).toBeCloseTo(0.4 * em * 200, 9)
    expect(plan.contracts).toBe(Math.floor(10_000 / (0.4 * em * 200)))
    expect(condorPlan({ ...base, ivPct: 0.3 }).open).toBe(false) // กฎ ivPct < 0.45 เดิม
  })
})
