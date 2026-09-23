/// <reference types="bun-types" />
// bun test — sector/group risk layer (applySectorConstraints + exposure) ส่วนที่ pure
import { describe, expect, it } from "bun:test"

// sector.ts นำเข้า @/lib/db (PrismaClient สร้างแบบ lazy — ฟังก์ชันที่ทดสอบไม่ query DB)
// DATABASE_URL ชี้ DB ชั่วคราวจาก preload (src/test/setup.ts) อยู่แล้ว — ห้ามทับเอง (bun test แชร์ Prisma singleton ข้ามไฟล์)
const { applySectorConstraints, computeGroupExposure, computeSectorExposure } = await import("./sector")

const SM = new Map<string, string>(
  Object.entries({
    BBL: "Banking",
    KBANK: "Banking",
    SCB: "Banking",
    KTB: "Banking",
    TIDLOR: "Finance",
    PTT: "Energy",
    IVL: "Material",
    CPALL: "Commerce",
    ADVANC: "ICT",
    BA: "Transport",
    BH: "Health",
    PLANB: "Media",
    AP: "Property",
    CK: "Construction",
  })
)
const one = (...syms: string[]) => syms.map((symbol) => ({ symbol, slots: 1 }))
const total = (r: { accepted: { slots: number }[]; downsized: { slots: number }[] }) =>
  [...r.accepted, ...r.downsized].reduce((a, x) => a + x.slots, 0)

describe("applySectorConstraints — งบ slots ของรอบ (maxSlots)", () => {
  it("บังคับ slotBudget จริง: 7 ตัว × 1 slot กับงบ 4 → รับแค่ 4 slots (เดิมรับครบ 7 เพราะใช้ maxPos)", () => {
    const cands = one("PTT", "CPALL", "ADVANC", "BA", "BH", "PLANB", "AP")
    const r = applySectorConstraints(cands, [], SM, { maxSlots: 4 })
    expect(total(r)).toBe(4)
    expect(r.accepted.map((a) => a.symbol)).toEqual(["PTT", "CPALL", "ADVANC", "BA"])
    expect(r.rejected.map((x) => x.symbol)).toEqual(["BH", "PLANB", "AP"])
    for (const x of r.rejected) expect(x.reason).toContain("พื้นที่พอร์ตเต็ม")
  })

  it("นับสถานะเดิมเข้างบด้วย: ถือ 3 slots + งบ 4 → รับเพิ่มได้ 1 slot", () => {
    const r = applySectorConstraints(one("PTT", "CPALL"), one("BA", "BH", "PLANB"), SM, { maxSlots: 4 })
    expect(total(r)).toBe(1)
    expect(r.accepted).toEqual([{ symbol: "PTT", slots: 1 }])
  })

  it("ไม่ระบุ maxSlots = งบเต็ม maxPos 7 · maxSlots เกิน 7 ถูก clamp · NaN ไม่ทำให้งบพัง", () => {
    const cands = one("PTT", "CPALL", "ADVANC", "BA", "BH", "PLANB", "AP", "CK")
    expect(total(applySectorConstraints(cands, [], SM))).toBe(7)
    expect(total(applySectorConstraints(cands, [], SM, { maxSlots: 8 }))).toBe(7)
    expect(total(applySectorConstraints(cands, [], SM, { maxSlots: Number.NaN }))).toBe(7)
  })

  it("ถูกจำกัดด้วยพื้นที่ที่เหลือ → อยู่ใน downsized พร้อมเหตุผล (เดิมเป็น accepted แล้ว route ซื้อเต็ม 1.0)", () => {
    // เคส demo: ถือ 3.5 slots → szw/pb/svr รับ 1.0 → osp เหลือพื้นที่ 0.5
    const existing = [
      { symbol: "KBANK", slots: 0.5 },
      { symbol: "SCB", slots: 0.75 },
      { symbol: "AP", slots: 1 },
      { symbol: "IVL", slots: 0.5 },
      { symbol: "KTB", slots: 0.75 },
    ]
    const r = applySectorConstraints(one("CK", "CPALL", "BA", "PTT"), existing, SM)
    expect(r.accepted.map((a) => a.symbol)).toEqual(["CK", "CPALL", "BA"])
    expect(r.downsized).toHaveLength(1)
    expect(r.downsized[0].symbol).toBe("PTT")
    expect(r.downsized[0].slots).toBe(0.5)
    expect(r.downsized[0].reason).toContain("พื้นที่พอร์ตเหลือ 0.5")
    expect(total(r) + 3.5).toBeLessThanOrEqual(7)
  })
})

describe("applySectorConstraints — cap sector / กลุ่ม / จำนวนชื่อ", () => {
  it("sector ≤ 30%: Banking ถือ 1.5 + ขอ 1.0 → ลดเหลือ 0.5 (กริด 0.25)", () => {
    const r = applySectorConstraints(one("SCB"), [{ symbol: "BBL", slots: 1 }, { symbol: "KBANK", slots: 0.5 }], SM)
    expect(r.downsized).toEqual([
      expect.objectContaining({ symbol: "SCB", slots: 0.5 }),
    ])
    expect(r.downsized[0].reason).toContain("sector Banking จะเกิน 30%")
  })

  it("กลุ่ม Financials ≤ 35%: Banking 1.5 + TIDLOR (Finance) 1.0 → ลดเหลือ 0.75", () => {
    const r = applySectorConstraints(one("TIDLOR"), [{ symbol: "BBL", slots: 1 }, { symbol: "KBANK", slots: 0.5 }], SM)
    expect(r.downsized).toHaveLength(1)
    expect(r.downsized[0].slots).toBe(0.75)
    expect(r.downsized[0].reason).toContain("กลุ่ม Financials จะเกิน 35%")
  })

  it("จำนวนชื่อต่อ sector ≤ 3", () => {
    const r = applySectorConstraints(
      one("KTB"),
      [
        { symbol: "BBL", slots: 0.25 },
        { symbol: "KBANK", slots: 0.25 },
        { symbol: "SCB", slots: 0.25 },
      ],
      SM
    )
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].reason).toContain("เต็มจำนวนชื่อแล้ว (3)")
  })
})

describe("applySectorConstraints — ขนาดที่ขอมาผิดปกติ", () => {
  it("ขนาด < 0.25 (เช่น 0.5×vol0.7×meta0.5) → ตัดด้วยเหตุผลขนาด ไม่ใช่ 'พื้นที่พอร์ตเต็ม'", () => {
    const r = applySectorConstraints([{ symbol: "PTT", slots: 0.175 }], [], SM)
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].reason).toContain("ต่ำกว่าขั้นต่ำ")
    expect(r.rejected[0].reason).not.toContain("พื้นที่พอร์ตเต็ม")
  })

  it("ขนาด NaN/0 → ตัด และไม่ลาม NaN ไปทำให้ตัวถัดไปผ่านทั้งหมด", () => {
    const r = applySectorConstraints(
      [{ symbol: "PTT", slots: Number.NaN }, { symbol: "BA", slots: 0 }, ...one("CPALL")],
      one("BH", "PLANB", "AP", "CK", "ADVANC", "IVL"),
      SM
    )
    expect(r.rejected.map((x) => x.symbol)).toEqual(["PTT", "BA"])
    expect(r.accepted).toEqual([{ symbol: "CPALL", slots: 1 }])
    expect(r.sectorExposure.every((row) => Number.isFinite(row.weight))).toBe(true)
  })
})

describe("computeSectorExposure / computeGroupExposure", () => {
  it("หุ้นไม่มีใน SymbolMeta = Unknown (ไม่มีกลุ่ม) · weight ปัด 2 ตำแหน่ง · breached เทียบค่าจริง", () => {
    const pos = [
      { symbol: "BBL", slots: 1 },
      { symbol: "TIDLOR", slots: 1 },
      { symbol: "NEWIPO", slots: 1 },
    ]
    const sec = computeSectorExposure(pos, SM)
    expect(sec.map((r) => r.sector).sort()).toEqual(["Banking", "Finance", "Unknown"])
    for (const r of sec) {
      expect(r.weight).toBe(0.33)
      expect(r.breached).toBe(true) // 1/3 > 30%
    }
    const grp = computeGroupExposure(pos, SM)
    expect(grp).toEqual([
      expect.objectContaining({ group: "Financials", weight: 0.67, cap: 0.35, breached: true }),
    ])
  })

  it("พอร์ตว่าง / slots รวม 0 → []", () => {
    expect(computeSectorExposure([], SM)).toEqual([])
    expect(computeGroupExposure([{ symbol: "BBL", slots: 0 }], SM)).toEqual([])
  })
})
