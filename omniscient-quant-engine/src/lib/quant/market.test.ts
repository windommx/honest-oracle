import { describe, expect, test } from "bun:test"
import { generateMarket, UNIVERSE } from "./market"

describe("market — synthetic SET universe generator", () => {
  const m = generateMarket(20250902)

  test("22 หุ้น × 750 วันทำการ · seed เดียวกันให้ผลเดิมทุก byte · seed ต่างกันให้ราคาต่างกัน", () => {
    expect(UNIVERSE).toHaveLength(22)
    expect(m.stocks).toHaveLength(22)
    expect(m.dates).toHaveLength(750)
    expect(m.marketClose).toHaveLength(750)
    const again = generateMarket(20250902)
    expect(again.stocks[0].series.close).toEqual(m.stocks[0].series.close)
    const other = generateMarket(1)
    expect(other.stocks[0].series.close).not.toEqual(m.stocks[0].series.close)
  })

  test("OHLC สอดคล้อง: low ≤ open/close ≤ high, ราคา/วอลุ่มเป็นบวก และมีค่าจำกัดทุกวัน", () => {
    for (const s of m.stocks) {
      const { open, high, low, close, volume } = s.series
      expect(close).toHaveLength(750)
      for (let t = 0; t < close.length; t++) {
        expect(Number.isFinite(close[t])).toBe(true)
        expect(close[t]).toBeGreaterThan(0)
        expect(volume[t]).toBeGreaterThan(0)
        expect(low[t]).toBeLessThanOrEqual(Math.min(open[t], close[t]) + 1e-9)
        expect(high[t]).toBeGreaterThanOrEqual(Math.max(open[t], close[t]) - 1e-9)
      }
    }
  })

  test("PIT fundamentals: announceDate เรียงขึ้น และเกิดหลังสิ้นงวด (กัน look-ahead)", () => {
    for (const s of m.stocks) {
      expect(s.fundamentals.length).toBeGreaterThan(4)
      for (let i = 1; i < s.fundamentals.length; i++) {
        expect(s.fundamentals[i].announceDate.getTime()).toBeGreaterThan(s.fundamentals[i - 1].announceDate.getTime())
      }
      for (const f of s.fundamentals) {
        // period "YYYY-Qn" → สิ้นงวด; ประกาศต้องช้ากว่าสิ้นงวด (ต้นฉบับ +45 วัน)
        const mm = /^(\d{4})-Q([1-4])$/.exec(f.period)
        expect(mm).not.toBeNull()
        const periodEnd = new Date(Number(mm![1]), Number(mm![2]) * 3, 0)
        expect(f.announceDate.getTime()).toBeGreaterThan(periodEnd.getTime())
      }
      expect(s.flows).toHaveLength(750)
    }
  })

  test("ธีม/sector ครบตาม universe และ TSE มี story event (eventAt) ตามสเปค", () => {
    const tse = UNIVERSE.find((u) => u.symbol === "TSE")!
    expect(tse.eventAt).toBeCloseTo(0.82, 6)
    const sectors = new Set(UNIVERSE.map((u) => u.sector))
    expect([...sectors].sort()).toEqual(["Banking", "Consumer", "Digital", "Energy", "Renewable", "Tourism"])
  })
})
