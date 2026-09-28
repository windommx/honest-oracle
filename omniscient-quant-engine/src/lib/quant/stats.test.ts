import { describe, expect, test } from "bun:test"
import {
  bhFdr, clamp, claytonThetaFromTau, cohensD, hypergeomSf, kde1d, kendallTau, linregSlope,
  mannWhitneyU, mean, median, normalCdf, normalSf, pca, pearson, psi, quantile, std, zscoreSeries,
} from "./stats"

describe("stats — descriptive", () => {
  test("mean/std/median/quantile", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(std([2, 4, 4, 4, 5, 5, 7, 9], 0)).toBeCloseTo(2, 6)
    expect(median([5, 1, 3])).toBe(3)
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1)
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5)
  })

  test("pearson: เหมือนกัน = 1 · กลับด้าน = −1 · linregSlope ของ y=2x+1 = 2", () => {
    const x = [1, 2, 3, 4, 5, 6]
    expect(pearson(x, x)).toBeCloseTo(1, 9)
    expect(pearson(x, x.map((v) => -v))).toBeCloseTo(-1, 9)
    expect(linregSlope(x, x.map((v) => 2 * v + 1))).toBeCloseTo(2, 9)
  })

  test("clamp / zscoreSeries", () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    const z = zscoreSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)
    expect(z).toHaveLength(10)
    expect(z.every(Number.isFinite)).toBe(true)
  })
})

describe("stats — distributions", () => {
  test("normalCdf(0)=0.5 · normalSf หางไกลไม่ underflow เป็น 0", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalSf(0)).toBeCloseTo(0.5, 6)
    expect(normalSf(1.96)).toBeCloseTo(0.025, 3)
    const far = normalSf(12)
    expect(far).toBeGreaterThan(0)
    expect(far).toBeLessThan(1e-20)
  })

  test("mannWhitneyU: กลุ่มที่สูงกว่าชัดเจน → p เล็ก · กลุ่มเหมือนกัน → p ใหญ่", () => {
    const a = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
    const b = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
    const r = mannWhitneyU(a, b, "greater")
    expect(r.p).toBeLessThan(0.001)
    const same = mannWhitneyU(a, a, "two-sided")
    expect(same.p).toBeGreaterThan(0.5)
  })

  test("bhFdr: q ≥ p, q ≤ 1, ลำดับไม่ลดเมื่อ p เพิ่ม", () => {
    const p = [0.001, 0.02, 0.03, 0.5, 0.9]
    const q = bhFdr(p)
    expect(q).toHaveLength(p.length)
    for (let i = 0; i < p.length; i++) {
      expect(q[i]).toBeGreaterThanOrEqual(p[i] - 1e-12)
      expect(q[i]).toBeLessThanOrEqual(1)
    }
    for (let i = 1; i < q.length; i++) expect(q[i]).toBeGreaterThanOrEqual(q[i - 1] - 1e-12)
  })

  test("cohensD(a, b) = (mean_b − mean_a)/pooled: กลุ่ม b เลื่อนขึ้น 1σ ≈ +1", () => {
    const a = Array.from({ length: 200 }, (_, i) => (i % 10) - 4.5)
    const b = a.map((v) => v + std(a))
    expect(cohensD(a, b)).toBeCloseTo(1, 1)
    expect(cohensD(b, a)).toBeCloseTo(-1, 1)
  })

  test("hypergeomSf: P(X ≥ 0) = 1 · เกินขอบ = 0 · ลดลงตาม k", () => {
    expect(hypergeomSf(0, 50, 10, 5)).toBeCloseTo(1, 9)
    expect(hypergeomSf(6, 50, 10, 5)).toBeCloseTo(0, 9)
    expect(hypergeomSf(1, 50, 10, 5)).toBeGreaterThan(hypergeomSf(2, 50, 10, 5))
  })
})

describe("stats — dependence & factors", () => {
  test("kendallTau: ลำดับเดียวกัน = 1 · กลับด้าน = −1 · claytonThetaFromTau(0.5) = 2", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(kendallTau(x, x)).toBeCloseTo(1, 9)
    expect(kendallTau(x, [...x].reverse())).toBeCloseTo(-1, 9)
    expect(claytonThetaFromTau(0.5)).toBeCloseTo(2, 9)
    expect(claytonThetaFromTau(-0.9)).toBeGreaterThanOrEqual(0.02) // clamp ขั้นต่ำ
  })

  test("pca: explained variance ไม่ลบ รวม ≤ 1 และ component แรกอธิบายมากสุด", () => {
    const rand = (() => {
      let s = 123
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296
        return s / 4294967296 - 0.5
      }
    })()
    const X = Array.from({ length: 200 }, () => {
      const f = rand() * 4
      return [f + rand() * 0.1, 2 * f + rand() * 0.1, -f + rand() * 0.1, rand()]
    })
    const r = pca(X, 2)
    expect(r.explained).toHaveLength(2)
    expect(r.explained[0]).toBeGreaterThanOrEqual(r.explained[1])
    expect(r.explained[0]).toBeGreaterThan(0.5)
    const total = r.explained.reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(1 + 1e-9)
  })

  test("psi: การกระจายเดียวกัน ≈ 0 · เลื่อนมาก → มาก", () => {
    const base = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 2)
    expect(psi(base, base)).toBeLessThan(0.01)
    expect(psi(base, base.map((v) => v + 5))).toBeGreaterThan(1)
  })

  test("kde1d: จุดตามที่ขอ ครอบคลุมช่วงข้อมูล ความหนาแน่นไม่ลบ", () => {
    const data = Array.from({ length: 100 }, (_, i) => 10 + (i % 7))
    const k = kde1d(data, 40)
    expect(k.xs).toHaveLength(40)
    expect(k.ys).toHaveLength(40)
    expect(k.xs[0]).toBeLessThanOrEqual(10)
    expect(k.xs[39]).toBeGreaterThanOrEqual(16)
    expect(k.ys.every((y) => y >= 0)).toBe(true)
  })
})
