/// <reference types="bun-types" />
// bun test — price-series helpers ที่ทนรูข้อมูลจริง (พัก/หยุดซื้อขาย/IPO) — pure ไม่แตะ db
import { describe, expect, it } from "bun:test"

import {
  forwardReturnPct,
  heldPeriodReturn,
  lastKnownIndex,
  observedReturns,
} from "./returns"

const N = NaN
// px: dates × symbols (NaN = ไม่มีแถว) — คอลัมน์ 0 = AAA, 1 = BBB
const col = (xs: number[]) => xs.map((v) => [v])

describe("lastKnownIndex", () => {
  it("หา index ราคาล่าสุดที่มีจริง ณ/ก่อน i · ข้าม NaN/0/ติดลบ · เคารพ minIdx", () => {
    const px = col([10, 11, N, 0, -1, N])
    expect(lastKnownIndex(px, 0, 5)).toBe(1)
    expect(lastKnownIndex(px, 0, 1)).toBe(1)
    expect(lastKnownIndex(px, 0, 5, 2)).toBe(-1)
    expect(lastKnownIndex(px, 0, 99)).toBe(1) // i เกินขอบ → clamp
    expect(lastKnownIndex(col([N, N]), 0, 1)).toBe(-1)
  })
})

describe("observedReturns", () => {
  it("วันกลับมาเทรดหลังพักเทียบราคาล่าสุดที่มี — gap −20% ไม่หาย (เดิมคู่ NaN→ราคา ถูกทิ้ง)", () => {
    const r = observedReturns(col([100, 101, N, 80.8]), 0, 1, 3)
    expect(r[0]).toBeCloseTo(0.01, 12)
    expect(Number.isNaN(r[1])).toBe(true)
    expect(r[2]).toBeCloseTo(80.8 / 101 - 1, 12)
  })

  it("หน้าต่างเริ่มในวันพัก → ใช้ราคาก่อนหน้าหน้าต่าง · ก่อน IPO = NaN และวันแรกหลัง IPO = NaN", () => {
    expect(observedReturns(col([50, N, N, 55]), 0, 2, 3)[1]).toBeCloseTo(0.1, 12)
    const ipo = observedReturns(col([N, N, 20, 22]), 0, 1, 3)
    expect(Number.isNaN(ipo[0])).toBe(true)
    expect(Number.isNaN(ipo[1])).toBe(true)
    expect(ipo[2]).toBeCloseTo(0.1, 12)
  })
})

describe("forwardReturnPct (verify outcome)", () => {
  const px = col([100, 101, 102, N, N, 90])
  it("หน้าต่างยังไม่ครบ → null (ห้ามเติม outcome จากข้อมูลที่ยังไม่เกิด)", () => {
    expect(forwardReturnPct(px, 1, 0, 5)).toBeNull()
    expect(forwardReturnPct(px, 0, 0, 6)).toBeNull()
  })
  it("ครบกำหนดตรงวันพักการซื้อขาย → ใช้ราคาปิดล่าสุดในหน้าต่าง (เดิมไม่ถูกวัดผลตลอดไป)", () => {
    expect(forwardReturnPct(px, 0, 0, 4)).toBeCloseTo(2, 10) // 102/100
    expect(forwardReturnPct(px, 0, 0, 5)).toBeCloseTo(-10, 10) // 90/100
  })
  it("หยุดซื้อขายทันทีหลังวันตัดสินใจ / ไม่มีราคาวันตัดสินใจ → null", () => {
    expect(forwardReturnPct(col([100, N, N, N]), 0, 0, 3)).toBeNull()
    expect(forwardReturnPct(col([N, 100, 101]), 0, 0, 2)).toBeNull()
  })
})

describe("heldPeriodReturn (weeklyDD / kill switch)", () => {
  const dates = ["d0", "d1", "d2", "d3", "d4", "d5", "d6"].map((_, i) => `2026-09-${String(10 + i).padStart(2, "0")}`)
  const symIdx = new Map([
    ["AAA", 0],
    ["BBB", 1],
  ])
  // AAA ร่วง 10% ในสัปดาห์ · BBB ทรงตัวแล้วพักการซื้อขายวันสุดท้าย
  const px = [
    [100, 50],
    [100, 50],
    [98, 50],
    [96, 50],
    [94, 50],
    [92, 55],
    [90, N],
  ]
  const pivot = { dates, px, symIdx }

  it("ซื้อวันนี้ → ไม่เอาการร่วงก่อนซื้อมานับ (เดิม −10% ทริกเกอร์ kill switch ทั้งที่ยังไม่ขาดทุน)", () => {
    const r = heldPeriodReturn([{ symbol: "AAA", entryDate: dates[6], entryPx: 90, slots: 1 }], pivot, 6)
    expect(r).toBeCloseTo(0, 12)
  })

  it("ถือมาทั้งสัปดาห์ → ผลตอบแทน 5 วันเต็ม · เข้ากลางสัปดาห์ → เทียบราคาเข้า", () => {
    // ฐาน = ราคาวัน pi−5 (index 1 = 100)
    expect(heldPeriodReturn([{ symbol: "AAA", entryDate: "2026-09-01", entryPx: 120, slots: 1 }], pivot, 6)).toBeCloseTo(
      90 / 100 - 1,
      12
    )
    expect(heldPeriodReturn([{ symbol: "AAA", entryDate: dates[3], entryPx: 96, slots: 1 }], pivot, 6)).toBeCloseTo(
      90 / 96 - 1,
      12
    )
  })

  it("หุ้นพักการซื้อขายวันล่าสุดใช้ราคาล่าสุดที่มี (ไม่หลุดจากการคำนวณ) · ถ่วงด้วย slots", () => {
    const r = heldPeriodReturn(
      [
        { symbol: "AAA", entryDate: "2026-09-01", entryPx: 120, slots: 1 },
        { symbol: "BBB", entryDate: "2026-09-01", entryPx: 40, slots: 0.5 },
      ],
      pivot,
      6
    )
    expect(r).toBeCloseTo((1 * (90 / 100 - 1) + 0.5 * (55 / 50 - 1)) / 1.5, 12)
  })

  it("ประวัติไม่ถึง 5 วัน / ไม่มีสถานะที่คำนวณได้ → null", () => {
    expect(heldPeriodReturn([{ symbol: "AAA", entryDate: dates[0], entryPx: 100, slots: 1 }], pivot, 4)).toBeNull()
    expect(heldPeriodReturn([{ symbol: "ZZZ", entryDate: dates[0], entryPx: 100, slots: 1 }], pivot, 6)).toBeNull()
  })
})
