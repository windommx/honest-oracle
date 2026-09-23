/// <reference types="bun-types" />
// bun test — AI-Score radar (%CMPR + 4 องค์ประกอบ): คาลิเบรตการ์ดอ้างอิง + ความทนทานกับข้อมูลจริง
import { describe, expect, it } from "bun:test"

import {
  buildAiInputs,
  buildAiScoreRadar,
  computeAiScore,
  heikinFromClose,
  scoreCmpr,
  scorePerc,
  TREND_SCORE,
} from "./ai-score"

// closes: 30 แท่งนิ่ง แล้วขึ้นต่อเนื่อง k แท่ง → pseudo-HA ขาขึ้นติดกัน k แท่ง
const flatThenUp = (k: number) => [...Array.from({ length: 30 }, () => 100), ...Array.from({ length: k }, (_, i) => 101 + i)]

describe("การ์ดอ้างอิงในหัวไฟล์ ai-score.ts (Cmpr + PerC + Trend + Heikin)", () => {
  const ha36 = heikinFromClose(flatThenUp(4)).score // "HA 3-6 แท่ง"
  const ha7p = heikinFromClose(flatThenUp(8)).score // "HA >7 แท่ง"
  it("tier ของ Heikin Ashi", () => {
    expect(ha36).toBe(2.0)
    expect(ha7p).toBe(3.5)
    expect(heikinFromClose(flatThenUp(4)).streak).toBe(4)
  })
  it.each([
    ["FTREIT", 1255.02, 1.27, "แนวโน้มขึ้น", "3-6", 7.0],
    ["THAI", 506.12, -0.01, "แนวโน้มขึ้น", ">7", 6.0],
    ["RCL", 421.32, 4.03, "แนวโน้มขึ้นแรง", "3-6", 6.0],
    ["TTB", 168.01, 2.13, "Sideway UP", ">7", 8.0],
  ] as const)("%s = %d", (_sym, cmpr, perc, trend, ha, total) => {
    const s = scoreCmpr(cmpr) + scorePerc(perc) + TREND_SCORE[trend] + (ha === "3-6" ? ha36 : ha7p)
    expect(s).toBeCloseTo(total, 10)
  })
})

describe("computeAiScore — ไม่ปล่อย NaN/Infinity", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 10 + i * 0.1)
  const vals = closes.map((c) => c * 1_000_000)
  it("val วันนี้ = 0 หรือเฉลี่ย 5 วัน = 0 → null (ไม่ใช่ Infinity%)", () => {
    expect(computeAiScore({ symbol: "Z", closes, vals: [...vals.slice(0, -1), 0] })).toBeNull()
    const v5 = [...vals]
    for (let i = 34; i < 39; i++) v5[i] = 0
    expect(computeAiScore({ symbol: "Z", closes, vals: v5 })).toBeNull()
  })
  it("แท่งไม่พอ (< 36) → null", () => {
    expect(computeAiScore({ symbol: "Z", closes: closes.slice(0, 35), vals: vals.slice(0, 35) })).toBeNull()
  })
  it("ข้อมูลปกติ → ตัวเลขจำกัดทุกช่อง และ JSON ไม่มี null แฝง", () => {
    const r = computeAiScore({ symbol: "OK", closes, vals: [...vals.slice(0, -1), vals[39] * 3] })
    expect(r).not.toBeNull()
    expect(r!.cmprPct).toBeCloseTo(300, 0)
    const json = JSON.stringify(r)
    expect(json.includes("null")).toBe(false)
    expect(r!.aiScore).toBeCloseTo(r!.parts.cmpr + r!.parts.perc + r!.parts.trend + r!.parts.heikin, 10)
  })
})

describe("buildAiInputs — หุ้นที่ขาดบางวันในหน้าต่างยังต้องติดเรดาร์ถ้ามีข้อมูลวันล่าสุด", () => {
  const dates = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 1) + i * 86400000)
    return d.toISOString().slice(0, 10)
  })
  const target = dates[dates.length - 1]
  const row = (date: string, symbol: string, i: number) => ({ date, symbol, close: 10 + i * 0.05, val: 5e6 + (i % 7) * 1e5 })
  const rows = [
    ...dates.map((d, i) => row(d, "FULL", i)),
    ...dates.filter((_, i) => i !== 20 && i !== 41).map((d, i) => row(d, "GAPPY", i)), // หยุดพัก 2 วัน
    ...dates.slice(0, -3).map((d, i) => row(d, "HALTED", i)), // หยุดซื้อขาย 3 วันก่อน target
    ...dates.slice(-40).map((d, i) => row(d, "IPO", i)), // เข้าตลาดกลางหน้าต่าง
  ].sort((a, b) => (a.date === b.date ? a.symbol.localeCompare(b.symbol) : a.date.localeCompare(b.date)))

  it("นับ FULL/GAPPY/IPO (มีแถววัน target) และตัด HALTED", () => {
    const syms = buildAiInputs(rows, target).map((x) => x.symbol).sort()
    expect(syms).toEqual(["FULL", "GAPPY", "IPO"])
  })
  it("เรดาร์คำนวณได้ครบทุกตัวที่มีแท่ง ≥ 36 และจัดอันดับ 1..n", () => {
    const radar = buildAiScoreRadar(buildAiInputs(rows, target), 30)
    expect(radar.map((r) => r.symbol).sort()).toEqual(["FULL", "GAPPY", "IPO"])
    expect(radar.map((r) => r.rank)).toEqual([1, 2, 3])
    for (let i = 1; i < radar.length; i++) expect(radar[i - 1].cmprPct).toBeGreaterThanOrEqual(radar[i].cmprPct)
  })
})
