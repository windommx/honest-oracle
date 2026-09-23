/// <reference types="bun-types" />
// bun test — ส่วนตัดสินของ evidence-real (pure): ป้าย REAL/NOT_REAL + walk-forward ไม่มองอนาคต
import { describe, expect, it } from "bun:test"
import { annualSharpe, evidenceVerdict, MIN_HISTORY_DAYS, walkForward } from "./evidence"

describe("evidenceVerdict — REAL ต้องข้อมูลจริงล้วน + ประวัติ ≥ 250 วัน", () => {
  it("REAL เฉพาะเมื่อครบทั้งสองเงื่อนไข", () => {
    expect(evidenceVerdict({ dataLabel: "REAL", tradingDays: 1260 })).toEqual({ realEvidence: true, label: "REAL", reasons: [] })
    const syn = evidenceVerdict({ dataLabel: "SYNTHETIC", tradingDays: 1260 })
    expect(syn.label).toBe("NOT_REAL")
    expect(syn.reasons[0]).toContain("SYNTHETIC")
    const short = evidenceVerdict({ dataLabel: "REAL", tradingDays: MIN_HISTORY_DAYS - 1 })
    expect(short.label).toBe("NOT_REAL")
    expect(short.reasons[0]).toContain("249")
    expect(evidenceVerdict({ dataLabel: "UNVERIFIED_SOURCE", tradingDays: 100 }).reasons).toHaveLength(2)
  })
})

describe("walkForward — เลือก config จาก in-sample เท่านั้น", () => {
  const R = 400
  const dates = Array.from({ length: R }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10))
  // A: ครึ่งแรกดีมาก (+0.3%/วัน สลับ) ครึ่งหลังแย่ · B: บวกน้อยคงที่ · P (ลงทะเบียนล่วงหน้า) = B
  const wave = (i: number, m: number) => m + (i % 2 ? 0.004 : -0.004)
  const A = dates.map((_, i) => (i < 200 ? wave(i, 0.003) : wave(i, -0.003)))
  const B = dates.map((_, i) => wave(i, 0.0005))
  const bench = dates.map((_, i) => wave(i, 0))
  const wf = walkForward({ dates, configs: [{ key: "A", rets: A }, { key: "B", rets: B }], bench, preregKey: "B", warmup: 60, nFolds: 5 })

  it("เลือก A เพราะดีใน IS แล้วพังนอกตัวอย่าง · fold ท้ายเรียนรู้จาก IS ที่ยาวขึ้นแล้วเปลี่ยนเป็น B · OOS เสื่อมจาก IS", () => {
    expect(wf.folds).toHaveLength(4)
    expect(wf.folds.every((f) => f.isTo < f.oosFrom)).toBe(true) // IS จบก่อน OOS เริ่มทุก fold
    expect(wf.folds[1]).toMatchObject({ chosen: "A" })
    expect(wf.folds[1].oosReturnPct).toBeLessThan(0)
    expect(wf.folds[3].chosen).toBe("B")
    expect(wf.summary.sufficient).toBe(true)
    expect(wf.summary.medianOosSharpe as number).toBeLessThan(wf.summary.medianIsSharpe as number)
    expect(wf.folds.every((f) => f.preregOosSharpe !== null)).toBe(true)
  })

  it("ประวัติสั้นกว่าเกณฑ์ = insufficient (ไม่สรุปผล)", () => {
    const s = walkForward({ dates: dates.slice(0, 200), configs: [{ key: "B", rets: B.slice(0, 200) }], bench: bench.slice(0, 200), preregKey: null })
    expect(s.summary.sufficient).toBe(false)
    expect(s.summary.verdict).toContain("สั้นเกินไป")
  })

  it("annualSharpe: < 20 วัน = null · ผลตอบแทนคงที่ = null", () => {
    expect(annualSharpe([0.01, 0.02])).toBeNull()
    expect(annualSharpe(new Array(30).fill(0.001))).toBeNull()
    expect(annualSharpe(B.slice(0, 100)) as number).toBeGreaterThan(0)
  })
})
