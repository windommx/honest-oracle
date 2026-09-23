/// <reference types="bun-types" />
// bun test — Cross-Asset Lead-Lag: ติดป้าย "leads" ต้องผ่านเกณฑ์นัยสำคัญ |r| ≥ 2/√n (2026-09-23)
import { describe, expect, it } from "bun:test"

import { corrSignificanceFloor, crossAssetLeadLag } from "./leadlag"

/** LCG + Box-Muller แบบกำหนด seed — ผลคงที่ทุกเครื่อง */
function gauss(seed: number) {
  let s = seed >>> 0
  const u = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s + 0.5) / 4294967296
  }
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())
}

function weekdays(n: number): string[] {
  const out: string[] = []
  for (let t = Date.parse("2025-01-06T00:00:00Z"); out.length < n; t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** asset ผลตอบแทน a_t · ตลาด m_t = beta·a_{t−lag} + noise (lag = 0 → เคลื่อนพร้อมกัน) */
function scenario(n: number, beta: number, lag: number, seed: number) {
  const g = gauss(seed)
  const dates = weekdays(n + 1)
  const a = dates.map(() => 0.01 * g())
  const cross: { date: string; asset: string; close: number }[] = []
  let px = 100
  dates.forEach((date, i) => {
    if (i > 0) px *= 1 + a[i]
    cross.push({ date, asset: "SPX", close: px })
  })
  const mkt = dates.slice(1).map((date, k) => {
    const i = k + 1
    const src = i - lag >= 1 ? a[i - lag] : 0
    return { date, ret: beta * src + 0.01 * g() }
  })
  return { cross, mkt }
}

describe("corrSignificanceFloor", () => {
  it("2/√n — n = 400 → 0.10 · n = 0 → ∞ (วัดไม่ได้ = ไม่มีทางผ่าน)", () => {
    expect(corrSignificanceFloor(400)).toBeCloseTo(0.1, 12)
    expect(corrSignificanceFloor(0)).toBe(Infinity)
  })
})

describe("crossAssetLeadLag — เกณฑ์นัยสำคัญก่อนติดป้าย lead", () => {
  it("lead อ่อน (|r| ต่ำกว่า 2/√n) → ไม่ติดป้าย leads และบอก 'ยังไม่มีนัยสำคัญ' (เดิม: leads + 'ใช้เป็นเรดาร์ได้')", () => {
    const { cross, mkt } = scenario(300, 0.06, 2, 17)
    const [row] = crossAssetLeadLag(cross, mkt)
    expect(row.bestLag).toBe(2) // lag ที่ |r| สูงสุดยังรายงานตามจริง
    expect(Math.abs(row.bestCorr)).toBeGreaterThan(Math.abs(row.corr0) * 1.1)
    expect(Math.abs(row.bestCorr)).toBeLessThan(corrSignificanceFloor(299))
    expect(row.direction).not.toBe("leads")
    expect(row.note).toContain("ยังไม่มีนัยสำคัญ (|r| < 2/√n")
    expect(row.note).not.toContain("ใช้เป็นเรดาร์ก่อนเปิดตลาดได้")
  })

  it("lead ชัด (|r| ≥ 2/√n) → leads พร้อมระบุ n และเกณฑ์ใน note", () => {
    const { cross, mkt } = scenario(300, 0.5, 1, 11)
    const [row] = crossAssetLeadLag(cross, mkt)
    expect(row.direction).toBe("leads")
    expect(row.bestLag).toBe(1)
    expect(Math.abs(row.bestCorr)).toBeGreaterThanOrEqual(corrSignificanceFloor(299))
    expect(row.note).toContain("ใช้เป็นเรดาร์ก่อนเปิดตลาดได้")
    expect(row.note).toMatch(/n=\d+ ≥ เกณฑ์ 2\/√n = 0\.\d\d/)
  })

  it("เคลื่อนพร้อมกันชัด → lags · ไม่สัมพันธ์เลย → flat (ความสัมพันธ์วันเดียวกันต้องผ่านเกณฑ์เดียวกัน)", () => {
    const s1 = scenario(300, 0.8, 0, 3)
    const same = crossAssetLeadLag(s1.cross, s1.mkt)[0]
    expect(same.direction).toBe("lags")
    expect(same.note).toContain("เคลื่อนพร้อมตลาดรายวัน")
    const s0 = scenario(300, 0, 0, 3)
    const none = crossAssetLeadLag(s0.cross, s0.mkt)[0]
    expect(Math.abs(none.corr0)).toBeLessThan(corrSignificanceFloor(299))
    expect(none.direction).toBe("flat") // เดิม: "leads" (lag 2, r = −0.09) ทั้งที่ไม่มีความสัมพันธ์จริงเลย
    expect(none.note).toContain("ยังไม่มีนัยสำคัญ")
  })
})
