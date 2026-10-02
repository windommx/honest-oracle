import { describe, expect, test } from "bun:test"
import { gaussianFactory, mulberry32, studentTFactory, tradingDates } from "./rng"

describe("rng — deterministic generators", () => {
  test("mulberry32: seed เดียวกัน = ลำดับเดียวกัน · seed ต่างกัน = ต่างกัน · ค่าอยู่ใน [0,1)", () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const xs = Array.from({ length: 1000 }, () => a())
    const ys = Array.from({ length: 1000 }, () => b())
    const zs = Array.from({ length: 1000 }, () => c())
    expect(xs).toEqual(ys)
    expect(xs).not.toEqual(zs)
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  test("gaussianFactory: mean ≈ 0, std ≈ 1 (20k ตัวอย่าง)", () => {
    const g = gaussianFactory(mulberry32(7))
    const n = 20_000
    let s = 0
    let s2 = 0
    for (let i = 0; i < n; i++) {
      const v = g()
      s += v
      s2 += v * v
    }
    const mean = s / n
    const std = Math.sqrt(s2 / n - mean * mean)
    expect(Math.abs(mean)).toBeLessThan(0.03)
    expect(Math.abs(std - 1)).toBeLessThan(0.03)
  })

  test("studentTFactory: จำกัดค่าได้ทุกตัว หางหนากว่า normal (kurtosis > 3) สำหรับ ν=4", () => {
    const t = studentTFactory(mulberry32(11), 4)
    const n = 20_000
    const xs = Array.from({ length: n }, () => t())
    expect(xs.every(Number.isFinite)).toBe(true)
    const m = xs.reduce((a, b) => a + b, 0) / n
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / n
    const k = xs.reduce((a, b) => a + (b - m) ** 4, 0) / n / (v * v)
    expect(k).toBeGreaterThan(3)
  })

  test("tradingDates: ได้ n วันทำการ เรียงขึ้น ไม่มีเสาร์–อาทิตย์ และวันสุดท้าย = วันทำการล่าสุดไม่เกิน endDate", () => {
    const end = new Date(2026, 8, 27) // อาทิตย์ 27 ก.ย. 2026 → ต้องถอยไปศุกร์ 25
    const ds = tradingDates(10, end)
    expect(ds).toHaveLength(10)
    for (const d of ds) expect([0, 6]).not.toContain(d.getDay())
    for (let i = 1; i < ds.length; i++) expect(ds[i].getTime()).toBeGreaterThan(ds[i - 1].getTime())
    const last = ds[ds.length - 1]
    expect([last.getFullYear(), last.getMonth(), last.getDate()]).toEqual([2026, 8, 25])
  })
})
