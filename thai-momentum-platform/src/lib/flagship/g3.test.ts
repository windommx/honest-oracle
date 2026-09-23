/// <reference types="bun-types" />
// bun test — FLAGSHIP G3: ตัด 2 กลุ่มท้ายเฉพาะเมื่อข้อมูลมี > 2 กลุ่ม (2026-09-23)
import { describe, expect, it } from "bun:test"

// funnel.ts โหลด @/lib/db (sectorBottomVeto เป็น pure ไม่ query DB)
const { sectorBottomVeto } = await import("./funnel")

describe("sectorBottomVeto — เกณฑ์เดียวกับตัวกรอง sector ของ Jev", () => {
  it("ข้อมูลมี ≤ 2 กลุ่ม → ไม่ตัดใครเลย (เดิม sectorCut = nSectors − 2 ≤ 0 ตัดทุกตัว รวมกลุ่มอันดับ 1)", () => {
    for (const n of [1, 2]) {
      for (let rank = 1; rank <= n; rank++) expect(sectorBottomVeto(rank, n)).toBe(false)
    }
  })

  it("> 2 กลุ่ม → ตัดเฉพาะ 2 อันดับท้าย", () => {
    expect([1, 2, 3].map((r) => sectorBottomVeto(r, 3))).toEqual([false, true, true])
    expect([1, 2, 3, 4, 5].map((r) => sectorBottomVeto(r, 5))).toEqual([false, false, false, true, true])
    expect(sectorBottomVeto(11, 13)).toBe(false)
    expect(sectorBottomVeto(12, 13)).toBe(true)
  })

  it("เท่ากับเงื่อนไขของ Jev ทุกกรณี: nSec > 2 && rank > nSec − 2", () => {
    for (let n = 1; n <= 15; n++) {
      for (let rank = 1; rank <= n; rank++) expect(sectorBottomVeto(rank, n)).toBe(n > 2 && rank > n - 2)
    }
  })
})
