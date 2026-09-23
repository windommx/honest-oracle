/// <reference types="bun-types" />
// bun test — FLAGSHIP: ป้ายที่มาข้อมูล (provenance) จาก EventLog seed / ingest (CSV + feed)
import { describe, expect, it } from "bun:test"

// funnel.ts โหลด @/lib/db (classifyProvenance เป็น pure ไม่ query DB)
// DATABASE_URL ชี้ DB ชั่วคราวจาก preload (src/test/setup.ts) อยู่แล้ว — ห้ามทับเอง (bun test แชร์ Prisma singleton ข้ามไฟล์)
const { classifyProvenance } = await import("./funnel")

const seed = (id: number) => ({ id, kind: "seed", payload: JSON.stringify({ days: 520, symbols: 240 }) })
const csv = (id: number) => ({ id, kind: "ingest", payload: JSON.stringify({ kind: "history", insertedRaw: 100 }) })
const feed = (id: number, replacedDemo: boolean, source = "yahoo") => ({
  id,
  kind: "ingest",
  payload: JSON.stringify({ kind: "feed", source, symbols: 78, insertedRaw: 38303, replacedDemo }),
})

describe("classifyProvenance", () => {
  it("DB ว่าง (ติดตั้งใหม่) → NO DATA ไม่ใช่ REAL (เดิมขึ้น 'REAL (CSV ingest)' สีเขียว)", () => {
    const p = classifyProvenance([], 0)
    expect(p.isSynthetic).toBe(true)
    expect(p.dataLabel).toStartWith("NO DATA")
  })

  it("seed ล่าสุดไม่มี ingest ตามหลัง → SYNTHETIC", () => {
    expect(classifyProvenance([csv(1), seed(2)], 1000)).toEqual({ isSynthetic: true, dataLabel: "SYNTHETIC (demo seed)" })
  })

  it("feed ที่ล้าง demo หลัง seed → REAL พร้อมชื่อแหล่ง feed (เดิมบอกว่า CSV ingest)", () => {
    expect(classifyProvenance([seed(1), feed(2, true, "fixture-real-like")], 1000)).toEqual({
      isSynthetic: false,
      dataLabel: "REAL (feed: fixture-real-like)",
    })
  })

  it("ingest หลัง seed โดยไม่ล้าง demo → MIXED (หุ้นจำลองยังอยู่ ห้ามติดป้าย REAL)", () => {
    for (const ev of [csv(2), feed(2, false)]) {
      const p = classifyProvenance([seed(1), ev], 1000)
      expect(p.isSynthetic).toBe(true)
      expect(p.dataLabel).toStartWith("MIXED")
    }
    // ล้าง demo ครั้งไหนก็ได้หลัง seed → ข้อมูลตลาดเหลือแต่ของจริง แม้ ingest ครั้งหลังเป็น CSV
    expect(classifyProvenance([seed(1), feed(2, true), csv(3)], 1000)).toEqual({ isSynthetic: false, dataLabel: "REAL (CSV ingest)" })
  })

  it("ไม่เคย seed + มี ingest → REAL ตามแหล่งล่าสุด", () => {
    expect(classifyProvenance([csv(5)], 10).dataLabel).toBe("REAL (CSV ingest)")
    expect(classifyProvenance([csv(5), feed(9, false, "settrade")], 10).dataLabel).toBe("REAL (feed: settrade)")
  })

  it("มีข้อมูลแต่ไม่มีบันทึก seed/ingest → UNKNOWN (ไม่เดาว่าเป็นของจริง)", () => {
    const p = classifyProvenance([], 500)
    expect(p.isSynthetic).toBe(true)
    expect(p.dataLabel).toStartWith("UNKNOWN")
  })

  it("payload เสีย/ไม่ใช่ JSON → ไม่ throw", () => {
    expect(classifyProvenance([{ id: 1, kind: "ingest", payload: "{not json" }], 10)).toEqual({ isSynthetic: false, dataLabel: "REAL (ingest)" })
    expect(classifyProvenance([seed(1), { id: 2, kind: "ingest", payload: "null" }], 10).dataLabel).toStartWith("MIXED")
  })

  it("ลำดับที่รับเข้ามาไม่สำคัญ — ใช้ id ของ EventLog", () => {
    expect(classifyProvenance([feed(3, false), seed(1)], 10).dataLabel).toStartWith("MIXED")
    expect(classifyProvenance([feed(1, false), seed(3)], 10).dataLabel).toBe("SYNTHETIC (demo seed)")
  })
})
