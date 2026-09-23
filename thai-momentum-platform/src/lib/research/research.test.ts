/// <reference types="bun-types" />
// bun test — ส่วน pure ของห้องวิจัย: CPCV splits (purge/embargo), prereg (validate + hash), AUC
import { describe, expect, it } from "bun:test"

// prereg.ts import @/lib/db (สำหรับ get/freeze) · เทสต์นี้ไม่ query DB เลย
// DATABASE_URL ชี้ DB ชั่วคราวจาก preload (src/test/setup.ts) อยู่แล้ว — ห้ามทับเอง (bun test แชร์ Prisma singleton ข้ามไฟล์)
const { cpcvSplits, runCpcv, DEFAULT_CPCV } = await import("./cpcv")
const { parseTrialParams, paramsHash, DEFAULT_TRIAL_PARAMS } = await import("./prereg")
const { auc } = await import("./logistic")
import type { MetaPanel } from "./features"

const DATES = Array.from({ length: 60 }, (_, i) => `2025-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`)

function nCk(n: number, k: number): number {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

describe("cpcvSplits", () => {
  it("ได้ C(N,k) splits และ test ของแต่ละ split = k กลุ่มพอดี", () => {
    for (const [G, k] of [[6, 2], [6, 1], [10, 4], [4, 2]]) {
      const splits = cpcvSplits(DATES, G, k, 3, 2)
      expect(splits.length).toBe(nCk(G, k))
      // ทุกวันเป็น test ใน C(N−1, k−1) splits พอดี (กลุ่มของมันถูกเลือก)
      const cnt = new Map<string, number>()
      for (const s of splits) for (const d of s.test) cnt.set(d, (cnt.get(d) ?? 0) + 1)
      for (const d of DATES) expect(cnt.get(d)).toBe(nCk(G - 1, k - 1))
    }
  })

  it("ไม่มีวัน train อยู่ใน purge ก่อน test หรือใน purge+embargo หลัง test (label ไม่ซ้อนทั้งสองฝั่ง)", () => {
    const idx = new Map(DATES.map((d, i) => [d, i]))
    for (const [purge, embargo] of [[5, 2], [3, 0], [4, 4], [8, 1]]) {
      for (const s of cpcvSplits(DATES, 6, 2, purge, embargo)) {
        const test = new Set(s.test.map((d) => idx.get(d)!))
        for (const d of s.train) {
          const i = idx.get(d)!
          expect(test.has(i)).toBe(false)
          for (let t = i + 1; t <= i + purge; t++) expect(test.has(t)).toBe(false) // test หลัง train ภายใน purge
          for (let t = i - purge - embargo; t < i; t++) expect(test.has(t)).toBe(false) // train หลัง test ภายใน purge+embargo
        }
      }
    }
  })

  it("train ที่อยู่ติดกับ test เกิน purge+embargo ยังถูกใช้ (ไม่ตัดเกินจำเป็น)", () => {
    // 30 วัน N=6 → กลุ่มละ 5 วัน; k=1 split ที่ 2 = test d10..d14
    const ds = DATES.slice(0, 30)
    const s = cpcvSplits(ds, 6, 1, 3, 1)[2]
    expect(s.test).toEqual(ds.slice(10, 15))
    expect(s.train).toEqual([...ds.slice(0, 7), ...ds.slice(19)]) // ตัด d7..d9 (purge) และ d15..d18 (purge 3 + embargo 1)
  })

  it("purge/embargo ที่เป็นเศษยังตัด (ปัดขึ้น) — เดิมตั้งค่าที่ index เศษแล้วไม่ตัดอะไรเลย", () => {
    const ds = DATES.slice(0, 30)
    const frac = cpcvSplits(ds, 6, 1, 2.5, 0.5)[2]
    const whole = cpcvSplits(ds, 6, 1, 3, 1)[2]
    expect(frac.train).toEqual(whole.train)
  })

  it("จำนวนกลุ่มที่เป็นเศษ/เกินขอบเขตคืน [] ทันที (เดิม combinations วนไม่จบจน memory หมด)", () => {
    expect(cpcvSplits(DATES, 5.5, 2, 3, 1)).toEqual([])
    expect(cpcvSplits(DATES, 6, 1.5, 3, 1)).toEqual([])
    expect(cpcvSplits(DATES, 6, 7, 3, 1)).toEqual([])
    expect(cpcvSplits([], 6, 2, 3, 1)).toEqual([])
  })

  it("runCpcv กับ nGroups เศษจบได้ (paths = 0) ไม่ค้าง", () => {
    const rows = DATES.flatMap((date, i) =>
      Array.from({ length: 5 }, (_, s) => ({ date, symbol: `S${s}`, x: [i, s], y: ((i + s) % 2) as 0 | 1, fwd: 1 }))
    )
    const panel: MetaPanel = { rows, hold: 5, nDates: DATES.length }
    const r = runCpcv(panel, { ...DEFAULT_CPCV, nGroups: 5.5 })
    expect(r.paths).toBe(0)
  })
})

describe("parseTrialParams", () => {
  it("ค่าที่เป็นจำนวนนับถูกปัดเป็นจำนวนเต็ม (hold/maxPos/nGroups/purge เศษทำให้ trial พัง/วนไม่จบ/leverage)", () => {
    const { params, errors } = parseTrialParams({ k: 2.6, hold: 7.4, maxPos: 3.6, nGroups: 5.5, nTestGroups: 1.2, purge: 10.5, bootN: 250.4, seed: 7.7 })
    expect(errors).toEqual([])
    expect(params).toMatchObject({ k: 3, hold: 7, maxPos: 4, nGroups: 6, nTestGroups: 1, purge: 11, bootN: 250, seed: 8 })
    for (const key of ["k", "hold", "maxPos", "nGroups", "nTestGroups", "purge", "bootN", "seed"] as const) {
      expect(Number.isInteger(params![key])).toBe(true)
    }
  })

  it("ค่าที่ไม่ต้องเป็นจำนวนเต็มคงเดิม", () => {
    const { params } = parseTrialParams({ stopPct: 0.075, costBps: 12.5, hitGate: 0.525 })
    expect(params).toMatchObject({ stopPct: 0.075, costBps: 12.5, hitGate: 0.525 })
  })

  it("nTestGroups เกิน min(4, nGroups−2) ถูกปฏิเสธ (CPCV จะได้ 0 path ทุกครั้ง)", () => {
    expect(parseTrialParams({ nGroups: 4, nTestGroups: 3 }).params).toBeUndefined()
    expect(parseTrialParams({ nGroups: 4, nTestGroups: 3 }).errors.join(" ")).toContain("nTestGroups")
    expect(parseTrialParams({ nGroups: 4, nTestGroups: 2 }).params?.nTestGroups).toBe(2)
    expect(parseTrialParams({ nGroups: 10, nTestGroups: 4 }).params?.nTestGroups).toBe(4)
  })

  it("ค่าผิดรูปคืน error ภาษาไทย ไม่ throw", () => {
    const r = parseTrialParams({ k: "abc", hold: 0, purge: 99 })
    expect(r.params).toBeUndefined()
    expect(r.errors.length).toBe(3)
  })
})

describe("paramsHash", () => {
  it("นิ่งกับลำดับ key (canonical) และเปลี่ยนเมื่อค่าเปลี่ยน", () => {
    const a = { ...DEFAULT_TRIAL_PARAMS }
    const reversed = Object.fromEntries(Object.entries(a).reverse()) as typeof a
    expect(paramsHash(reversed)).toBe(paramsHash(a))
    expect(paramsHash({ ...a, hold: a.hold + 1 })).not.toBe(paramsHash(a))
    expect(paramsHash(a)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("auc", () => {
  it("คลาสเดียว = 0.5, แยกได้สมบูรณ์ = 1, กลับด้าน = 0, tie = 0.5", () => {
    expect(auc([1, 1, 1], [0.2, 0.5, 0.9])).toBe(0.5)
    expect(auc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1)
    expect(auc([1, 1, 0, 0], [0.1, 0.2, 0.8, 0.9])).toBe(0)
    expect(auc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBe(0.5)
  })
})
