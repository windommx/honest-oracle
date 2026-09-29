import { describe, expect, test } from "bun:test"
import { generateCot, latestReportDate } from "./generate"
import { COT_MARKETS, findMarket } from "./markets"
import { buildCotDashboard, cotIndexAt, RANGE_WEEKS } from "./report"
import type { CotPosition } from "./types"

const SRC = { kind: "synthetic" as const, label: "test", note: "test" }
const gold = findMarket("gold")!
const hist = generateCot(gold, "2026-09-22")
const sum = (xs: CotPosition[], k: "long" | "short" | "spread") => xs.reduce((a, p) => a + p[k], 0)

describe("cot/generate — เอกลักษณ์ของรายงาน CFTC", () => {
  test("ทุกสัปดาห์: OI = Σlong + Σspread = Σshort + Σspread ทั้ง Disaggregated และ Legacy · Σnet = 0 · ไม่มีค่าติดลบ", () => {
    for (const w of hist) {
      const d = Object.values(w.disagg)
      const l = Object.values(w.legacy)
      expect(sum(d, "long") + sum(d, "spread")).toBe(w.openInterest)
      expect(sum(d, "short") + sum(d, "spread")).toBe(w.openInterest)
      expect(sum(l, "long") + sum(l, "spread")).toBe(w.openInterest)
      expect(sum(l, "short") + sum(l, "spread")).toBe(w.openInterest)
      for (const p of [...d, ...l]) for (const v of Object.values(p)) expect(v).toBeGreaterThanOrEqual(0)
      expect(w.price.l).toBeLessThanOrEqual(Math.min(w.price.o, w.price.c))
      expect(w.price.h).toBeGreaterThanOrEqual(Math.max(w.price.o, w.price.c))
    }
  })

  test("Legacy = ผลรวมของ Disaggregated · วันที่เป็นวันอังคาร เรียงห่างกัน 7 วัน · deterministic", () => {
    const w = hist.at(-1)!
    expect(w.legacy.commercials.long).toBe(w.disagg.producer.long + w.disagg.swap.long + w.disagg.swap.spread)
    expect(w.legacy.largeSpecs.spread).toBe(w.disagg.managed.spread + w.disagg.other.spread)
    expect(w.legacy.smallTraders).toEqual(w.disagg.nonrept)
    expect(new Date(`${w.date}T00:00:00Z`).getUTCDay()).toBe(2)
    expect(w.date).toBe("2026-09-22")
    expect(Date.parse(hist[1].date) - Date.parse(hist[0].date)).toBe(7 * 86_400_000)
    expect(generateCot(gold, "2026-09-22")).toEqual(hist)
    expect(generateCot(findMarket("silver")!, "2026-09-22").at(-1)!.openInterest).not.toBe(w.openInterest)
  })

  test("latestReportDate: ข้อมูลอังคาร เผยแพร่ศุกร์ ~19:30 UTC", () => {
    expect(latestReportDate(new Date("2026-09-29T03:00:00Z"))).toBe("2026-09-22") // จันทร์
    expect(latestReportDate(new Date("2026-09-25T12:00:00Z"))).toBe("2026-09-15") // ศุกร์ก่อนเผยแพร่
    expect(latestReportDate(new Date("2026-09-25T21:00:00Z"))).toBe("2026-09-22") // ศุกร์หลังเผยแพร่
  })

  test("Managed Money เป็นผู้ตามเทรนด์: net สัมพันธ์บวกกับผลตอบแทนราคา 8 สัปดาห์", () => {
    const ret = hist.map((w, i) => (i >= 8 ? Math.log(w.price.c / hist[i - 8].price.c) : 0)).slice(8)
    const mm = hist.map((w) => w.disagg.managed.long - w.disagg.managed.short).slice(8)
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length
    const mr = mean(ret)
    const mm0 = mean(mm)
    const cov = ret.reduce((a, r, i) => a + (r - mr) * (mm[i] - mm0), 0)
    expect(cov).toBeGreaterThan(0)
  })
})

describe("cot/report", () => {
  test("cotIndexAt: ต่ำสุด = 0 สูงสุด = 100 · ประวัติไม่พอ = null · แบน = 50", () => {
    const v = [5, 1, 9, 3]
    expect(cotIndexAt(v, 2, 3)).toBe(100)
    expect(cotIndexAt(v, 3, 3)).toBe(25)
    expect(cotIndexAt([4, 4, 4], 2, 3)).toBe(50)
    expect(cotIndexAt(v, 1, 3)).toBeNull()
  })

  test("แดชบอร์ด: ความยาวตามช่วง · การเปลี่ยนแปลง = ส่วนต่างจากสัปดาห์ก่อน · % OI · COT index ใน [0,100]", () => {
    for (const range of ["6m", "1y", "2y", "3y"] as const) {
      const d = buildCotDashboard(gold, hist, range, "commercials", SRC)
      expect(d.series).toHaveLength(RANGE_WEEKS[range])
      expect(d.series.every((p) => p.cotIndex36m !== null && p.cotIndex36m >= 0 && p.cotIndex36m <= 100)).toBe(true)
    }
    const d = buildCotDashboard(gold, hist, "1y", "commercials", SRC)
    const [last, prev] = [hist.at(-1)!, hist.at(-2)!]
    const com = d.legacy.rows.find((r) => r.key === "commercials")!
    expect(com.changeLong).toBe(last.legacy.commercials.long - prev.legacy.commercials.long)
    expect(com.net).toBe(last.legacy.commercials.long - last.legacy.commercials.short)
    expect(com.pctOiLong).toBeCloseTo((last.legacy.commercials.long / last.openInterest) * 100, 1)
    expect(d.legacy.rows.find((r) => r.key === "smallTraders")!.tradersLong).toBe(0)
    expect(d.disagg.rows.map((r) => r.key)).toEqual(["producer", "swap", "managed", "other", "nonrept"])
    expect(d.disagg.rows.reduce((a, r) => a + r.net, 0)).toBe(0)
    expect(d.cotIndex.m6).toBe(d.series.at(-1)!.cotIndex6m!)
    expect(d.reportDate).toBe("2026-09-22")
    expect(d.prevReportDate).toBe("2026-09-15")
  })

  test("ทุกตลาดสร้างแดชบอร์ดได้ ตัวเลขจำกัดทั้งหมด", () => {
    for (const m of COT_MARKETS) {
      const d = buildCotDashboard(m, generateCot(m, "2026-09-22"), "3y", "managed", SRC)
      const nums = d.series.flatMap((p) => Object.values(p).filter((v): v is number => typeof v === "number"))
      expect(nums.every(Number.isFinite)).toBe(true)
    }
  })
})
