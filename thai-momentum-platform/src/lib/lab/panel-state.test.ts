/// <reference types="bun-types" />
// bun test — Shadow Lab trigger proxy T1 (แท่งปฏิเสธราคาต่ำแบบ 2 แท่ง) — แก้เงื่อนไขที่ขัดกันเอง (2026-09-23)
import { describe, expect, it } from "bun:test"

// panel-state.ts นำเข้า @/lib/db (PrismaClient สร้างแบบ lazy — ส่วน pure ไม่ query DB)
const { panelStatesFromRows, triggerProxy } = await import("./panel-state")
type PanelRow = import("./panel-state").PanelRow

describe("triggerProxy — pure", () => {
  it("แท่งก่อนหน้าลง ≥ 2% แล้ววันนี้ปิดแข็ง (+5%) → wick 2.5 + close_pos 0.70 → T1 (เดิม wick = 1.2 เสมอ → T1 เป็นไปไม่ได้)", () => {
    const prev = 97
    const t = triggerProxy(0.05, -0.03, prev * 1.05, prev)
    expect(t.wickRatio).toBe(2.5)
    expect(t.closePos).toBeCloseTo(0.7, 12)
    expect(t.pattern).toBe("T1")
  })

  it("ลงแล้วยืนได้แต่ปิดไม่แข็ง (+0.5%) → wick 2.5 แต่ไม่ใช่ T1 · ลงต่อ (−1%) → ไม่มีไส้ (1.2)", () => {
    const hold = triggerProxy(0.005, -0.03, 97 * 1.005, 97)
    expect(hold.wickRatio).toBe(2.5)
    expect(hold.pattern).toBeNull()
    const fall = triggerProxy(-0.01, -0.03, 97 * 0.99, 97)
    expect(fall.wickRatio).toBe(1.2)
    expect(fall.pattern).toBeNull()
  })

  it("T2 เดิมคงอยู่: ขึ้น > 3% หลังวันลงเล็กน้อย (ไม่ถึง −2%) → T2 · ลงวันเดียววันนี้ (ret1 ≤ −2%) ไม่ใช่ไส้", () => {
    expect(triggerProxy(0.035, -0.01, 100 * 1.035, 100).pattern).toBe("T2")
    expect(triggerProxy(-0.03, 0.01, 97, 100).wickRatio).toBe(1.2)
  })
})

describe("panelStatesFromRows — T1 เกิดได้จริงบนซีรีส์ที่สร้างขึ้น", () => {
  // 300 วันขาขึ้นนุ่ม ๆ แล้ว 2 วันสุดท้าย: AAA −3% → +5% (T1) · BBB −3% → +0.5% (ยืนได้ ไม่ปิดแข็ง) · CCC −3% → −1%
  const D = 302
  const dates = Array.from({ length: D }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10))
  const last2: Record<string, [number, number]> = { AAA: [-0.03, 0.05], BBB: [-0.03, 0.005], CCC: [-0.03, -0.01] }
  const rows: PanelRow[] = []
  const px: Record<string, number> = { AAA: 10, BBB: 12, CCC: 14 }
  for (let i = 0; i < D; i++) {
    for (const sym of ["AAA", "BBB", "CCC"]) {
      if (i > 0) px[sym] *= i === D - 2 ? 1 + last2[sym][0] : i === D - 1 ? 1 + last2[sym][1] : 1.002
      rows.push({ date: dates[i], symbol: sym, close: px[sym], val: 5e7, liq5: 1 })
    }
  }
  const st = panelStatesFromRows(rows)
  const of = (s: string) => st.states.find((x) => x.asset === s)!.packet.trigger

  it("AAA → pattern T1 + wick_ratio 2.5 (เดิมได้ T2 เพราะ wick_ratio = 1.2 ทุกกรณี)", () => {
    expect(st.date).toBe(dates[D - 1])
    expect(of("AAA").pattern).toBe("T1")
    expect(of("AAA").wick_ratio).toBe(2.5)
    expect(of("AAA").close_pos_in_range).toBeCloseTo(0.7, 4)
  })

  it("BBB ยืนได้แต่ปิดไม่แข็ง → wick 2.5 ไม่มี pattern · CCC ลงต่อ → wick 1.2 ไม่มี pattern", () => {
    expect(of("BBB").wick_ratio).toBe(2.5)
    expect(of("BBB").pattern).toBeNull()
    expect(of("CCC").wick_ratio).toBe(1.2)
    expect(of("CCC").pattern).toBeNull()
  })
})
