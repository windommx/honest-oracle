import { beforeAll, describe, expect, test } from "bun:test"
import { generateMarket } from "../market"
import { runBacktest } from "./backtest"
import { buildMarketState, buildPanel, ensureSeeded, generatedToPanelInput, loadMarketState } from "./panel"
import { getSeedRobustness, runSeedRobustness, type RobustnessReport } from "./robustness"
import { RULES, RULES_HASH } from "./rules"

let report: RobustnessReport

beforeAll(async () => {
  report = await runSeedRobustness([RULES.seed, 11])
}, 120_000)

describe("panel — ท่อเดียวสำหรับข้อมูลจำลอง/DB/ข้อมูลจริง", () => {
  test("buildMarketState (ในหน่วยความจำ) = loadMarketState (อ่านจาก DB) ทุกตัวเลขที่เอนจินใช้ (ต่างได้แค่ระดับปัดเศษ float ของ DB)", async () => {
    await ensureSeeded(false)
    const fromDb = await loadMarketState()
    const mem = await buildMarketState()
    // ค่าที่ผ่าน DB ต่างจากในหน่วยความจำได้ที่หลักสุดท้ายของ float64 (~1e-16 ต่อราคา) — เทียบแบบสัมพัทธ์ 1e-9
    const close = (a: number[], b: number[]) => {
      expect(a).toHaveLength(b.length)
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(b[i])))
    }
    expect(mem.dates.map((d) => d.getTime())).toEqual(fromDb.dates.map((d) => d.getTime()))
    expect(mem.stocks.map((s) => s.symbol)).toEqual(fromDb.stocks.map((s) => s.symbol))
    close(mem.marketClose, fromDb.marketClose)
    close(mem.fStress, fromDb.fStress)
    close(mem.fMomentum, fromDb.fMomentum)
    expect(mem.regime).toEqual(fromDb.regime)
    for (let si = 0; si < mem.stocks.length; si++) {
      const a = mem.stocks[si].rows
      const b = fromDb.stocks[si].rows
      for (const key of ["close", "ret21", "vol21", "rsi14", "theta", "ltd", "flow5", "pe"] as const) close(a.map((r) => r[key]), b.map((r) => r[key]))
      expect(a.map((r) => r.decoupled)).toEqual(b.map((r) => r.decoupled))
      close(Object.values(a[300].z), Object.values(b[300].z))
    }
    expect(mem.qc).toEqual({ filledCells: 0, trimmedLeadingDays: 0 })
  })

  test("ข้อมูลขาดช่วง: ตัดหัวที่บางตัวยังไม่มีราคา · ช่องว่างกลางทางเติมด้วยราคาล่าสุด (ปริมาณ 0) · ไม่มี NaN หลุดเข้า z-score", () => {
    const input = generatedToPanelInput(generateMarket(RULES.seed)).slice(0, 4)
    input[0] = { ...input[0], prices: input[0].prices.slice(10) } // เข้าตลาดช้า 10 วัน
    input[1] = { ...input[1], prices: input[1].prices.filter((_, i) => i !== 400 && i !== 401) } // หยุดพัก 2 วัน
    const st = buildPanel(input)
    expect(st.qc).toEqual({ filledCells: 2, trimmedLeadingDays: 10 })
    expect(st.dates).toHaveLength(740)
    const gapRow = st.stocks[1].rows[390] // วันเดิม i=400 หลังตัดหัว 10 วัน
    expect(gapRow.close).toBe(st.stocks[1].rows[389].close)
    for (const s of st.stocks) for (const r of s.rows) for (const v of Object.values(r.z)) expect(Number.isFinite(v)).toBe(true)
  })
})

describe("robustness — กติกาเดียวกันข้าม seed", () => {
  test("seed ของ demo ให้ผลเดียวกับแท็บ Backtest บน DB (ไม่ใช่ตัวเลขจากท่อคู่ขนาน)", async () => {
    await ensureSeeded(false)
    const bt = runBacktest(await loadMarketState())
    const demo = report.runs[0]
    expect(demo.seed).toBe(RULES.seed)
    expect(demo.nSignals).toBe(bt.metrics.nSignals)
    expect(demo.hitRate).toBe(bt.metrics.hitRate)
    expect(demo.sharpe).toBe(bt.metrics.sharpe)
    expect(demo.maxDD).toBe(bt.metrics.maxDD)
  })

  test("รายงาน: run ต่อ seed, gate ครบ 5 พร้อมป้าย, สรุปสอดคล้องกับ run, verdict อยู่ในชุดที่กำหนด", () => {
    expect(report.rulesHash).toBe(RULES_HASH)
    expect(report.seeds).toEqual([RULES.seed, 11])
    expect(report.runs).toHaveLength(2)
    // seed ต่างกัน = โลกต่างกันจริง
    expect(report.runs[0].nSignals === report.runs[1].nSignals && report.runs[0].hitRate === report.runs[1].hitRate).toBe(false)
    for (const r of report.runs) {
      expect(r.hitRateCI[0]).toBeLessThanOrEqual(r.hitRate)
      expect(r.hitRateCI[1]).toBeGreaterThanOrEqual(r.hitRate)
      expect(r.attribution.map((a) => a.gate)).toEqual(["G1", "G2", "G3", "G4", "G5"])
    }
    const s = report.summary
    expect(s.hitRate.min).toBe(Math.min(...report.runs.map((r) => r.hitRate)))
    expect(s.hitRate.max).toBe(Math.max(...report.runs.map((r) => r.hitRate)))
    expect(s.beatsBuyHold).toBe(report.runs.filter((r) => r.cumStrat > r.cumBase).length)
    expect(s.gates.map((g) => g.gate)).toEqual(["G1", "G2", "G3", "G4", "G5"])
    for (const g of s.gates) {
      expect(["ROBUST", "FRAGILE", "NOISE"]).toContain(g.label)
      expect(g.speaksTruth).toBeLessThanOrEqual(2)
      expect(g.minEdge).toBeLessThanOrEqual(g.maxEdge)
      if (g.speaksTruth === 2) expect(g.label).toBe("ROBUST")
    }
    expect(["STABLE", "MIXED", "UNSTABLE"]).toContain(s.verdict)
    expect(s.note).toContain("seed")
  })

  test("getSeedRobustness: cache ต่อ (rules hash, seeds) — เรียกซ้ำได้ promise เดิม · seeds ต่างกันได้ผลแยกกัน", async () => {
    const a = getSeedRobustness([RULES.seed])
    const b = getSeedRobustness([RULES.seed])
    const c = getSeedRobustness([11])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    const [ra, rc] = await Promise.all([a, c])
    expect(ra.runs[0].hitRate).toBe(report.runs[0].hitRate)
    expect(rc.runs[0].hitRate).toBe(report.runs[1].hitRate)
  }, 60_000)
})
