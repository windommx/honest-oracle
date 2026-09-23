/// <reference types="bun-types" />
// bun test — หุ้นไม่รู้ sector: cap ต่อ sector คิดถังละตัว ("Unknown:SYM") แต่รายงานรวมเป็น "Unknown" (2026-09-23)
import { describe, expect, it } from "bun:test"

// sector.ts นำเข้า @/lib/db (PrismaClient สร้างแบบ lazy — ฟังก์ชันที่ทดสอบไม่ query DB)
const { applySectorConstraints, capBucketOf, computeGroupExposure, computeSectorExposure, sectorOf } = await import("./sector")
const { TH_HARD_REJECT_UNKNOWN } = await import("@/lib/config/thai")

const SM = new Map<string, string>(Object.entries({ BBL: "Banking", KBANK: "Banking", SCB: "Banking", KTB: "Banking", PTT: "Energy" }))
const one = (...syms: string[]) => syms.map((symbol) => ({ symbol, slots: 1 }))

describe("capBucketOf / sectorOf", () => {
  it("หุ้นมีแผนที่ = sector จริงทั้งคู่ · หุ้นไม่รู้ sector = ถังของตัวเองสำหรับ cap แต่รายงานเป็น Unknown", () => {
    expect(capBucketOf(SM, "BBL")).toBe("Banking")
    expect(sectorOf(SM, "NEW1")).toBe("Unknown")
    expect(capBucketOf(SM, "NEW1")).toBe("Unknown:NEW1")
    expect(capBucketOf(SM, "NEW2")).not.toBe(capBucketOf(SM, "NEW1"))
  })
})

describe("applySectorConstraints — หุ้นไม่รู้ sector ไม่ถูกรวมเป็นถังเดียว", () => {
  it("หุ้นไม่รู้ sector 4 ตัวบนพอร์ตว่าง → รับครบ 4 (เดิมรับ 3 แล้วตัดตัวที่ 4 'เต็มจำนวนชื่อแล้ว (3)')", () => {
    expect(TH_HARD_REJECT_UNKNOWN).toBe(false) // ค่าเริ่มต้นของระบบ — โหมด hard reject ยังเปิดได้ตามเดิม
    const r = applySectorConstraints(one("NEW1", "NEW2", "NEW3", "NEW4"), [], SM)
    expect(r.rejected).toEqual([])
    expect(r.accepted.map((a) => a.symbol)).toEqual(["NEW1", "NEW2", "NEW3", "NEW4"])
    // รายงานรวมเป็นแถว Unknown เดียว (น้ำหนักรวม 100% ของที่ถือ) แต่ไม่ breached เพราะ cap คิดต่อตัว (1/4 = 25% ≤ 30%)
    const unk = r.sectorExposure.find((x) => x.sector === "Unknown")!
    expect(unk).toMatchObject({ names: 4, weight: 1, breached: false })
    expect(r.sectorExposure.some((x) => x.sector.startsWith("Unknown:"))).toBe(false)
  })

  it("หุ้นไม่รู้ sector ที่ถืออยู่แล้ว 3 ตัว ไม่กันตัวใหม่ · sector จริงยังโดน cap จำนวนชื่อ ≤ 3 ตามเดิม", () => {
    const existing = one("NEW1", "NEW2", "NEW3")
    const r = applySectorConstraints(one("NEW4", "KTB"), [...existing, { symbol: "BBL", slots: 0.25 }, { symbol: "KBANK", slots: 0.25 }, { symbol: "SCB", slots: 0.25 }], SM)
    expect(r.accepted.map((a) => a.symbol)).toContain("NEW4")
    expect(r.rejected).toEqual([expect.objectContaining({ symbol: "KTB" })])
    expect(r.rejected[0].reason).toContain("เต็มจำนวนชื่อแล้ว (3)")
  })

  it("cap น้ำหนักต่อถังยังทำงานกับหุ้นไม่รู้ sector ตัวเดียวกัน (ถังของตัวเอง ≤ 30%)", () => {
    // พอร์ตสมมติถือ NEW1 อยู่ 2.0 slots (≈ 28.6%) แล้วมีคำขอ NEW1 เพิ่ม 1 slot → ต้องลดขนาด/ตัด (ถัง NEW1 จะเกิน 30%)
    const r = applySectorConstraints(one("NEW1"), [{ symbol: "NEW1", slots: 2 }], SM)
    expect(r.accepted).toEqual([])
    expect(r.rejected.map((x) => x.symbol)).toEqual(["NEW1"])
  })
})

describe("computeSectorExposure / computeGroupExposure — แถว Unknown", () => {
  it("breached ของแถว Unknown เทียบ cap ต่อถัง: 3 ตัว × 1 จาก 7 slots → รวม 43% แต่ต่อตัว 14% → ไม่ breached", () => {
    const pos = [...one("NEW1", "NEW2", "NEW3"), { symbol: "PTT", slots: 1 }, { symbol: "BBL", slots: 1 }, { symbol: "KBANK", slots: 1 }, { symbol: "SCB", slots: 1 }]
    const unk = computeSectorExposure(pos, SM).find((x) => x.sector === "Unknown")!
    expect(unk.weight).toBe(0.43)
    expect(unk.names).toBe(3)
    expect(unk.breached).toBe(false) // เดิม true (รวมเป็นถังเดียว 43% > 30%)
    expect(computeGroupExposure(pos, SM).some((g) => g.sectors.includes("Unknown"))).toBe(false)
  })

  it("หุ้นไม่รู้ sector ตัวเดียวหนักเกิน 30% → breached (เกณฑ์เดียวกับที่ gate จริง)", () => {
    const unk = computeSectorExposure([{ symbol: "NEW1", slots: 3 }, { symbol: "PTT", slots: 4 }], SM).find((x) => x.sector === "Unknown")!
    expect(unk.breached).toBe(true)
  })
})
