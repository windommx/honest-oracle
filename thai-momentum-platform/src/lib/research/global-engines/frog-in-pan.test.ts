/// <reference types="bun-types" />
// bun test — Frog-in-the-Pan (Da, Gurun & Warachka 2014): สัญญาณแยกทิศ sign(PRET)·(1 − ID)/2 (2026-09-23)
import { describe, expect, it } from "bun:test"

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { dailyReturns } from "./helpers"
import { evalFrogInPan, fipScore, frogInPanSig, informationDiscreteness } from "./frog-in-pan"

/** pivot จากผลตอบแทนรายวัน [day][sym] (วันแรกไม่มีผลตอบแทน) — liq ทุกตัว */
function pivFromReturns(r: number[][]): ThaiPivots {
  const nD = r.length
  const nSym = r[0]?.length ?? 0
  const close: Mat = []
  let prev = new Array<number>(nSym).fill(10)
  for (let i = 0; i < nD; i++) {
    const row = i === 0 ? prev : prev.map((p, j) => p * (1 + (r[i]?.[j] ?? 0)))
    close.push([...row])
    prev = row
  }
  const d0 = Date.parse("2024-01-01T00:00:00Z")
  return {
    dates: Array.from({ length: nD }, (_, i) => new Date(d0 + i * 86400000).toISOString().slice(0, 10)),
    symbols: ["UP", "DOWN", "DW", "DL", "FLAT"],
    nSym,
    close,
    val: close.map((row) => row.map(() => 5e6)),
    liq: close.map((row) => row.map(() => true)),
  }
}

// 30 วัน: UP ขึ้น 0.5% ทุกวัน · DOWN ลง 0.5% ทุกวัน · DW ลง 0.2% เกือบทุกวันแต่กระโดด +10% วันเดียว (ชนะแบบ discrete)
// · DL ขึ้น 0.2% เกือบทุกวันแต่ทุบ −10% วันเดียว (แพ้แบบ discrete) · FLAT ไม่ขยับ (PRET = 0)
const N = 30
const JUMP = 15
const rets = Array.from({ length: N }, (_, i) => [0.005, -0.005, i === JUMP ? 0.1 : -0.002, i === JUMP ? -0.1 : 0.002, 0])

describe("informationDiscreteness / fipScore — นิยามตามต้นฉบับ", () => {
  it("ID = sign(PRET)·(%ลง − %ขึ้น): ต่อเนื่อง = −1 ทั้งผู้ชนะและผู้แพ้ · discrete = ค่าบวก", () => {
    expect(informationDiscreteness(1, 20, 0, 20)).toBe(-1) // ผู้ชนะต่อเนื่อง
    expect(informationDiscreteness(-1, 0, 20, 20)).toBe(-1) // ผู้แพ้ต่อเนื่อง — ID ต่ำเท่ากัน
    expect(informationDiscreteness(1, 1, 19, 20)).toBeCloseTo(0.9, 12) // ผู้ชนะ discrete
    expect(informationDiscreteness(-1, 19, 1, 20)).toBeCloseTo(0.9, 12) // ผู้แพ้ discrete
  })

  it("fipScore = sign(PRET)·(1 − ID)/2 แยกทิศ: ผู้แพ้ต่อเนื่อง = −1 (เดิม −ID = +1 เท่าผู้ชนะต่อเนื่อง)", () => {
    expect(fipScore(1, 20, 0, 20)).toBe(1)
    expect(fipScore(-1, 0, 20, 20)).toBe(-1)
    expect(fipScore(1, 1, 19, 20)).toBeCloseTo(0.05, 12)
    expect(fipScore(-1, 19, 1, 20)).toBeCloseTo(-0.05, 12)
    expect(fipScore(0, 10, 10, 20)).toBe(0)
  })
})

describe("frogInPanSig — ซีรีส์สังเคราะห์ ขึ้นต่อเนื่อง vs ลงต่อเนื่อง", () => {
  const piv = pivFromReturns(rets)
  const sig = frogInPanSig(piv, dailyReturns(piv))
  const at = N - 1 // หน้าต่าง formation 20 วัน (วันที่ 10–29) ครอบวันกระโดด JUMP = 15

  it("ขึ้นต่อเนื่องได้คะแนนสูงสุด (+1) · ลงต่อเนื่องต่ำสุด (−1) — เดิมทั้งคู่ได้ +1", () => {
    expect(sig[at][0]).toBeCloseTo(1, 12)
    expect(sig[at][1]).toBeCloseTo(-1, 12)
  })

  it("อันดับตาม DGW: ชนะต่อเนื่อง > ชนะ discrete > เป็นกลาง > แพ้ discrete > แพ้ต่อเนื่อง", () => {
    const [up, down, dw, dl, flat] = sig[at] as number[]
    expect(dw).toBeCloseTo(0.05, 12)
    expect(dl).toBeCloseTo(-0.05, 12)
    expect(flat).toBe(0)
    expect(up).toBeGreaterThan(dw)
    expect(dw).toBeGreaterThan(flat)
    expect(flat).toBeGreaterThan(dl)
    expect(dl).toBeGreaterThan(down)
  })

  it("ภายในฝั่งผู้ชนะ อันดับเท่ากับอันดับตาม −ID ตามต้นฉบับ", () => {
    // UP: ID = −1 · DW: ID = +0.9 → −ID เรียง UP > DW เหมือนคะแนน
    expect(sig[at][0]! > sig[at][2]!).toBe(-informationDiscreteness(1, 20, 0, 20) > -informationDiscreteness(1, 1, 19, 20))
  })

  it("ประวัติไม่ครบหน้าต่าง → ไม่มีค่า (undefined) ไม่ใช่ 0 ปลอม", () => {
    expect(sig[5].every((v) => v === undefined)).toBe(true)
  })
})

describe("evalFrogInPan — รายงานฐานเทียบโมเมนตัมดิบ (ส่วนเพิ่มของ continuity ต้องมองเห็นได้)", () => {
  it("stats มี momICIR (PRET 20 วัน ที่ hold เดียวกัน) และ fipVsMomICIR = ICIR − momICIR · verdictWhy อ้างฐานเทียบ", () => {
    // 40 หุ้น × 160 วัน: ผลตอบแทนสุ่มแบบกำหนด seed (ต้องมี ≥ 30 หุ้นต่อวันจึงวัด IC ได้)
    let s = 12345
    const u = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296
    const r = Array.from({ length: 160 }, () => Array.from({ length: 40 }, () => 0.02 * (u() - 0.5)))
    const pv = { ...pivFromReturns(r), symbols: Array.from({ length: 40 }, (_, j) => `S${j}`) }
    const e = evalFrogInPan(pv, dailyReturns(pv))
    expect(typeof e.stats.momICIR).toBe("number")
    expect(e.stats.fipVsMomICIR as number).toBeCloseTo((e.stats.ICIR as number) - (e.stats.momICIR as number), 3)
    expect(e.verdictWhy).toContain("ฐานเทียบโมเมนตัมดิบ")
  })
})
