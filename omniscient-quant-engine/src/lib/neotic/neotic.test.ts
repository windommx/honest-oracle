import { beforeAll, describe, expect, test } from "bun:test"
import { buildMarketState, buildPanel, generatedToPanelInput, type PanelStockInput } from "@/lib/quant/engine/panel"
import { RULES } from "@/lib/quant/engine/rules"
import type { MarketState } from "@/lib/quant/engine/types"
import { generateMarket } from "@/lib/quant/market"
import { mulberry32, tradingDates } from "@/lib/quant/rng"
import { computeNeotic, gridConfigs, growthStatus, NEO, NEO_EMBARGO, NEO_LOOSE, neoFeatures, passes, pointAt, zoneOf, type NeoComputed } from "./compute"
import { NEO_BRIDGE_CSV, NEO_BRIDGE_PY, neoBridgeCounts, neoBridgeCsv, neoBridgeScript } from "./bridge"
import { buildNeotic } from "./report"

const END = new Date(2026, 8, 30)
/** ตรึงวันสุดท้ายของข้อมูลจำลอง — ปฏิทินงบเทียบกับราคาเลื่อนตามวันที่รัน จำนวนสัญญาณจึงต่างกันได้ทุกวันถ้าไม่ตรึง */
const FIX_END = new Date(2026, 9, 2)

/** แผงทดสอบที่คำนวณมือได้: open = close · high = close × 1.01 · low = close × 0.99 */
function mini(
  stocks: Array<{ symbol: string; close: (t: number) => number; volume?: (t: number) => number; quarters?: Array<{ period: string; announce: string; np: number }> }>,
  N = 300,
): MarketState {
  const dates = tradingDates(N, END)
  const input: PanelStockInput[] = stocks.map((s) => ({
    symbol: s.symbol,
    name: s.symbol,
    sector: "Test",
    theme: "Test",
    beta: 1,
    prices: dates.map((date, t) => {
      const c = s.close(t)
      return { date, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: s.volume ? s.volume(t) : 1 }
    }),
    fundamentals: (s.quarters ?? []).map((q) => ({ announceDate: new Date(`${q.announce}T00:00:00Z`), pe: 10, pb: 1, roe: 10, de: 0.5, revenueGrowth: 5, period: q.period, netProfitM: q.np })),
    flows: [],
  }))
  return buildPanel(input)
}

/** ข้อมูลจำลองของแพลตฟอร์ม + วันปริมาณพุ่ง (15% ของวัน × 4) — ใช้ทดสอบกลไกเท่านั้น ข้อมูลสาธิตจริงไม่มีวันแบบนี้ */
function spiked(rate = 0.15, mult = 4, cutoff?: Date): MarketState {
  const input = generatedToPanelInput(generateMarket(RULES.seed, FIX_END))
  const rng = mulberry32(7)
  for (const s of input) {
    for (const p of s.prices) if (rng() < rate) p.volume *= mult
    if (cutoff) s.prices = s.prices.filter((p) => p.date.getTime() <= cutoff.getTime())
  }
  return buildPanel(input)
}

const same = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || a === b

let spikedState: MarketState
let spikedC: NeoComputed

beforeAll(() => {
  spikedState = spiked()
  spikedC = computeNeotic(spikedState)!
}, 120_000)

describe("neotic/สเปก", () => {
  test("กริด 300 ชุดตามช่วง Optuna ของต้นแบบ · เกณฑ์ตามสเปกอยู่ในกริด · เกณฑ์หลวมสุดครอบทุกชุด · embargo = รอคำสั่ง + ถือสูงสุด", () => {
    const grid = gridConfigs()
    expect(grid.length).toBe(300)
    expect(grid).toContainEqual(NEO.locked)
    expect(NEO_EMBARGO).toBe(3 + NEO.maxHold)
    const rng = mulberry32(3)
    for (let k = 0; k < 2000; k++) {
      const p = { rs: rng() * 99, dist: rng() * 25, vr: rng() * 4, green: rng() < 0.7 }
      const any = grid.some((th) => passes(p, th))
      if (any) expect(passes(p, NEO_LOOSE)).toBe(true)
    }
  })

  test("สีการเติบโต (เขียวตามสเปก = QoQ > 0 และ YoY > 0) · โซนจาก RS และระยะจากจุดสูงสุด", () => {
    expect([growthStatus(5, 3), growthStatus(5, -1), growthStatus(-2, 0), growthStatus(NaN, 4)]).toEqual(["green", "mixed", "red", "unknown"])
    const L = NEO.locked
    expect([zoneOf(85, 7, L), zoneOf(85, 4.99, L), zoneOf(85, 15, L), zoneOf(79.9, 7, L), zoneOf(NaN, 7, L)]).toEqual(["B", "near", "far", "weak", "na"])
    expect(passes({ rs: 80, dist: 5, vr: 2.5, green: true }, L)).toBe(true)
    expect(passes({ rs: 80, dist: 5, vr: 2.5, green: false }, L)).toBe(false)
  })
})

describe("neotic/ชั้น 1 — ตัวแปรของสแกน", () => {
  test("RS Rank ตัดขวางเฉพาะหุ้นที่ซื้อขายวันนั้น (ค่าเท่ากัน = อันดับเฉลี่ย) · ระยะจากจุดสูงสุด 52 สัปดาห์ · ปริมาณ ÷ ค่าเฉลี่ย 50 วันก่อนหน้า", () => {
    const g = [0, 0.001, 0.002, 0.002, 0.003]
    const state = mini([
      ...g.map((r, k) => ({
        symbol: `S${k}`,
        close: (t: number) => 10 * (1 + r) ** t,
        // S0 หยุดซื้อขายวันสุดท้าย · S4 ปริมาณ 3 เท่าในวันสุดท้าย
        volume: (t: number) => (t === 299 ? (k === 0 ? 0 : k === 4 ? 3 : 1) : 1),
      })),
      { symbol: "DROP", close: (t: number) => (t < 280 ? 10 : 10 * (1 - 0.005 * (t - 279))) },
    ])
    const f = neoFeatures(state)
    expect(f.tStart).toBe(252)
    const t = 299
    const rank = state.stocks.map((_, si) => f.rsRank[si][t])
    // หุ้นที่ซื้อขาย 5 ตัว: DROP อันดับ 1 · S1 อันดับ 2 · S2 = S3 อันดับ 3.5 · S4 อันดับ 5 (× 99 ÷ 5)
    expect(Number.isNaN(rank[0])).toBe(true)
    expect(rank.slice(1)).toEqual([39.6, 69.3, 69.3, 99, 19.8].map((v) => expect.closeTo(v, 9) as unknown as number))
    // วันก่อนหน้าทุกตัวซื้อขาย: S0 (คงที่) อันดับ 2 จาก 6
    expect(f.rsRank[0][t - 1]).toBeCloseTo((2 / 6) * 99, 9)
    // คะแนนดิบ = 0.4·ROC63 + 0.2·ROC126 + 0.2·ROC189 + 0.2·ROC252 (%)
    const raw = 100 * (0.4 * (1.003 ** 63 - 1) + 0.2 * (1.003 ** 126 - 1) + 0.2 * (1.003 ** 189 - 1) + 0.2 * (1.003 ** 252 - 1))
    expect(f.rsRaw[4][t]).toBeCloseTo(raw, 9)
    // ขาขึ้น: high สูงสุด = high วันนี้ → ต่ำกว่าจุดสูงสุด 1 − 1/1.01 · DROP: ปิด 9.0 เทียบ high 10.1
    expect(f.dist[4][t]).toBeCloseTo((1 - 1 / 1.01) * 100, 9)
    expect(f.dist[5][t]).toBeCloseTo((1 - 9 / 10.1) * 100, 9)
    expect(f.volRatio[4][t]).toBeCloseTo(3, 12)
    expect(f.volRatio[1][t]).toBeCloseTo(1, 12)
    expect(Number.isNaN(f.volRatio[0][t])).toBe(true)
    expect(f.ema[0][t]).toBeCloseTo(10, 9)
    expect(pointAt(f, 0, t)).toBeNull()
  })

  test("การเติบโตแบบ point-in-time: ใช้งบตั้งแต่วันประกาศ · ประกาศเร็วผิดปกติ = สิ้นงวด + 60 วัน · งวดล่าสุดตามป้าย (งบแก้ย้อนหลังไม่แทนงวดล่าสุด)", () => {
    const quarters = [
      { period: "2025-Q1", announce: "2025-05-15", np: 100 },
      { period: "2025-Q2", announce: "2025-08-14", np: 110 },
      { period: "2025-Q3", announce: "2025-11-14", np: 120 },
      { period: "2025-Q4", announce: "2026-02-14", np: 90 },
      // ประกาศวันสิ้นงวดเลย = ไม่น่าเชื่อ → ใช้ได้ 2026-05-30
      { period: "2026-Q1", announce: "2026-03-31", np: 130 },
      // งบไตรมาส 3 ปีก่อนแก้ย้อนหลัง — ไม่ใช่งวดล่าสุด
      { period: "2025-Q3", announce: "2026-06-10", np: 125 },
      { period: "2026-Q2", announce: "2026-08-14", np: 99 },
      { period: "FY2025", announce: "2026-02-20", np: 400 },
    ]
    const state = mini([
      { symbol: "A", close: (t) => 10 + t * 0.01, quarters },
      { symbol: "B", close: () => 10 },
    ])
    const f = neoFeatures(state)
    const at = (d: string) => {
      const t = f.dates.findIndex((x) => x >= d)
      return { qoq: f.qoq[0][t], yoy: f.yoy[0][t], period: f.periods[0][f.periodIdx[0][t]] ?? null, growth: growthStatus(f.qoq[0][t], f.yoy[0][t]) }
    }
    expect(f.quarterInfo).toMatchObject({ parsed: 7, unparsed: 1, early: 1, stocks: 1 })
    // ก่อน Q4/2025 ประกาศ: งวดล่าสุด = Q3/2025 (QoQ จาก Q2 · ไม่มี Q3/2024 → YoY ไม่รู้)
    expect(at("2026-01-15")).toMatchObject({ period: "2025-Q3", growth: "unknown" })
    expect(at("2026-01-15").qoq).toBeCloseTo((120 / 110 - 1) * 100, 9)
    // หลังวันสิ้นงวด Q1/2026 แต่ก่อน +60 วัน: ยังเป็น Q4/2025
    expect(at("2026-04-15").period).toBe("2025-Q4")
    expect(at("2026-04-15").qoq).toBeCloseTo(-25, 9)
    const q1 = at("2026-06-01")
    expect(q1).toMatchObject({ period: "2026-Q1", growth: "green" })
    expect(q1.qoq).toBeCloseTo((130 / 90 - 1) * 100, 9)
    expect(q1.yoy).toBeCloseTo(30, 9)
    // งบแก้ย้อนหลังของ Q3/2025 (2026-06-10) ไม่เปลี่ยนงวดล่าสุด
    expect(at("2026-06-15")).toMatchObject({ period: "2026-Q1", growth: "green" })
    const q2 = at("2026-08-20")
    expect(q2).toMatchObject({ period: "2026-Q2", growth: "red" })
    expect(q2.qoq).toBeCloseTo((99 / 130 - 1) * 100, 9)
    expect(q2.yoy).toBeCloseTo(-10, 9)
  })

  test("point-in-time: ตัดแท่งอนาคตทิ้ง (งบอนาคตยังอยู่ครบ) แล้วตัวแปรทุกตัวของวันก่อนหน้าไม่เปลี่ยน", () => {
    const fFull = neoFeatures(spikedState)
    const cut = spikedState.dates[spikedState.dates.length - 61]
    const fCut = neoFeatures(spiked(0.15, 4, cut))
    const T = fCut.tEnd
    expect(fCut.dates[T]).toBe(fFull.dates[T])
    for (let si = 0; si < spikedState.stocks.length; si++) {
      for (let t = fFull.tStart; t <= T; t++) {
        for (const k of ["rsRaw", "rsRank", "dist", "volRatio", "ema", "qoq", "yoy"] as const) {
          if (!same(fFull[k][si][t], fCut[k][si][t])) throw new Error(`${k} ${spikedState.stocks[si].symbol} ${fFull.dates[t]}: ${fFull[k][si][t]} ≠ ${fCut[k][si][t]}`)
        }
      }
    }
  }, 60_000)
})

describe("neotic/ชั้น 2–4 — ส่งคำสั่ง · เดินหน้า · MAE/MFE (ข้อมูลจำลอง + วันปริมาณพุ่ง)", () => {
  test("ทุกสัญญาณผ่านเกณฑ์ตามสเปก · ซื้อราคาเปิดวันถัดไป · stop 5% จากราคาได้ของ · นับทางออกครบ · เส้นสะสมตรงกับผลรวม", () => {
    const c = spikedC
    const f = neoFeatures(spikedState)
    const st = c.backtest.stats
    expect(st.signals).toBeGreaterThan(5)
    expect(st.trades).toBe(c.backtest.trades.length)
    expect(Object.values(st.byExit).reduce((a, b) => a + b, 0)).toBe(st.trades)
    const sum = c.backtest.trades.reduce((a, x) => a + x.retNetPct, 0)
    expect(c.backtest.curve.at(-1)!.cum).toBeCloseTo(sum, 1)
    for (const tr of c.backtest.trades) {
      const si = spikedState.stocks.findIndex((s) => s.symbol === tr.symbol)
      const t = f.dates.indexOf(tr.signalDate)
      const p = pointAt(f, si, t)!
      expect(passes(p, NEO.locked)).toBe(true)
      const fill = f.dates.indexOf(tr.entryDate)
      expect(fill).toBeGreaterThan(t)
      expect(tr.entry).toBeCloseTo(f.bars[si].open[fill], 3)
      if (tr.exitKind === "stop") expect(tr.retNetPct).toBeLessThan(0)
      expect(tr.days).toBeLessThanOrEqual(NEO.maxHold)
    }
    expect(c.recent.length).toBe(Math.min(15, st.signals))
  })

  test("เดินหน้า: train ปิดก่อน test − embargo · ชุดที่เลือกมาจากกริด (ไม่มีชุดที่มีไม้พอ = สเปก) · ไม้นอกตัวอย่างรวมตรงกับรายหน้าต่าง", () => {
    const wf = spikedC.walkforward
    const f = neoFeatures(spikedState)
    expect(wf.ready).toBe(true)
    expect(wf.candidates).toBe(spikedC.candidates)
    expect(wf.folds.length).toBeGreaterThanOrEqual(2)
    const grid = gridConfigs()
    for (const fold of wf.folds) {
      if (fold.trainEnd) expect(f.dates.indexOf(fold.trainEnd)).toBeLessThan(f.dates.indexOf(fold.testStart) - NEO_EMBARGO)
      expect(grid).toContainEqual(fold.pick)
      if (fold.fallback) expect(fold.pick).toEqual(NEO.locked)
      else expect(fold.isTrades).toBeGreaterThanOrEqual(NEO.minTrain)
    }
    expect(wf.folds.reduce((a, x) => a + x.tuned.trades, 0)).toBe(wf.tuned!.trades)
    expect(wf.folds.reduce((a, x) => a + x.locked.trades, 0)).toBe(wf.locked!.trades)
    // ไม่มีชุดเกณฑ์ใดมีไม้ใน train พอ → ทุกหน้าต่างใช้เกณฑ์ตามสเปก = ผลนอกตัวอย่างของ "จูนแล้ว" เท่ากับสเปกทุกไม้
    const minTrain = NEO.minTrain
    NEO.minTrain = 1e9
    try {
      const fb = computeNeotic(spikedState)!.walkforward
      expect(fb.folds.every((x) => x.fallback && JSON.stringify(x.pick) === JSON.stringify(NEO.locked))).toBe(true)
      expect(fb.tuned!.trades).toBe(fb.locked!.trades)
      expect(fb.vsLocked?.mean ?? 0).toBe(0)
    } finally {
      NEO.minTrain = minTrain
    }
  })

  test("MAE/MFE: วัดจากสัญญาณตามสเปกแบบ stop กว้าง · เทียบวันสุ่ม · ข้อเสนอ SL/TP อยู่ในช่วงที่ตั้งไว้", () => {
    const e = spikedC.excursion
    expect(e.signal.n).toBeLessThanOrEqual(spikedC.backtest.stats.signals)
    expect(e.signal.n).toBeGreaterThanOrEqual(5)
    expect(e.random.n).toBeGreaterThan(e.signal.n)
    // stop กว้างตัดการวิ่งสวนไว้ (เปิดกระโดดต่ำกว่า stop ออกที่ราคาเปิดได้ จึงเกินได้เล็กน้อย)
    for (const p of e.points) expect(p.mae).toBeGreaterThanOrEqual(0)
    expect(e.points.filter((p) => p.mae > NEO.wideStopPct + 0.5).length).toBeLessThanOrEqual(1)
    // ข้อเสนอ SL/TP ต้องมีสัญญาณที่วัดได้อย่างน้อย 10 ครั้ง
    expect(e.suggestion === null).toBe(e.signal.n < 10)
    if (e.suggestion) {
      expect(e.suggestion.stopPct).toBeGreaterThanOrEqual(1)
      expect(e.suggestion.stopPct).toBeLessThanOrEqual(NEO.wideStopPct)
    }
  })
})

describe("neotic/รายงาน", () => {
  test("ข้อมูลจำลองจริงของแพลตฟอร์ม: ยังไม่มีสัญญาณ เพราะปริมาณไม่เคยถึง 2.5× (เงื่อนไขที่หายากสุด) · รายการความพร้อมบอกสิ่งที่ขาด", async () => {
    const state = await buildMarketState(generateMarket(RULES.seed, FIX_END))
    const c = computeNeotic(state)!
    const r = buildNeotic(c, { data: { kind: "synthetic", label: "จำลอง" }, bridge: { rows: 1, symbols: 1, signals: 0 } })
    expect(r.verdict.level).toBe("insufficient")
    expect(r.funnel.binding).toBe("volume")
    expect(r.funnel.steps.map((s) => s.key)).toEqual(["days", "rs", "zone", "growth", "volume"])
    expect(r.funnel.steps.at(-1)!.count).toBe(0)
    expect(r.funnel.volume.max!).toBeLessThan(NEO.locked.volTrigger * 2)
    const status = Object.fromEntries(r.readiness.map((x) => [x.key, x.status]))
    expect(status).toMatchObject({ kind: "warn", fundamentals: "ok", sample: "block", survivorship: "info" })
    expect(["block", "warn"]).toContain(status.volume)
    expect(r.walkforward.ready).toBe(false)
    expect(r.scan.length).toBe(state.stocks.length)
    expect(Object.values(r.zones).reduce((a, b) => a + b, 0)).toBe(state.stocks.length)
    expect(r.method.length).toBeGreaterThanOrEqual(10)
  }, 60_000)

  test("ไม่มีงบ = ประเมินไม่ได้ (nodata) · มีไม้พอ = ตัดสินด้วยผลสุทธิและส่วนต่างจากการสุ่มเท่านั้น", () => {
    const noFund: MarketState = { ...spikedState, stocks: spikedState.stocks.map((s) => ({ ...s, quarters: [] })) }
    const c0 = computeNeotic(noFund)!
    const r0 = buildNeotic(c0, { data: { kind: "real", label: "จริง" }, bridge: { rows: 1, symbols: 1, signals: 0 } })
    expect(r0.verdict.level).toBe("nodata")
    expect(r0.readiness.find((x) => x.key === "fundamentals")!.status).toBe("block")
    expect(c0.backtest.stats.signals).toBe(0)

    const ctx = { data: { kind: "real", label: "จริง" }, bridge: { rows: 1, symbols: 1, signals: 0 } }
    const base = spikedC.backtest.stats
    const withStats = (over: Partial<typeof base>): NeoComputed => ({ ...spikedC, backtest: { ...spikedC.backtest, stats: { ...base, trades: 40, ...over } } })
    expect(buildNeotic(withStats({ expectancy: { mean: 1.2, lo: 0.3, hi: 2.1 }, excess: { mean: 0.9, lo: 0.2, hi: 1.6 }, pExcess: 0.004 }), ctx).verdict.level).toBe("evidence")
    expect(buildNeotic(withStats({ expectancy: { mean: 1.2, lo: 0.3, hi: 2.1 }, excess: { mean: 0.9, lo: -0.2, hi: 1.6 }, pExcess: 0.08 }), ctx).verdict.level).toBe("none")
    expect(buildNeotic(withStats({ expectancy: { mean: -1, lo: -2, hi: -0.1 }, excess: { mean: -1.4, lo: -2.2, hi: -0.6 }, pExcess: 0.99 }), ctx).verdict.level).toBe("worse")
    // ข้อมูลจริงที่ทุกหุ้นยังซื้อขาย = เตือน survivorship
    expect(buildNeotic(spikedC, ctx).readiness.find((x) => x.key === "survivorship")!.status).toBe("warn")
  })
})

describe("neotic/สะพาน PyBroker", () => {
  test("CSV: คอลัมน์ชื่อเดียวกับโค้ดตัวอย่าง · ทุกหุ้นทุกวันในหน้าต่าง · neo_signal ตรงกับสัญญาณของหน้าสแกน · สคริปต์ใช้ API จริงของ PyBroker", () => {
    const f = neoFeatures(spikedState)
    const out = neoBridgeCsv(spikedState, f)
    const lines = out.csv.trim().split("\n")
    expect(lines[0]).toBe("date,symbol,open,high,low,close,volume,rs_rank,dist_52wh,vol_ratio,eps_qoq,eps_yoy,ema_20,neo_signal")
    expect(lines.length - 1).toBe(out.rows)
    expect(neoBridgeCounts(spikedState, f)).toEqual({ rows: out.rows, symbols: spikedState.stocks.length })
    expect(out.signals).toBe(spikedC.backtest.stats.signals)
    expect(lines.slice(1).filter((l) => l.endsWith(",1")).length).toBe(out.signals)
    const sig = lines.slice(1).find((l) => l.endsWith(",1"))!.split(",")
    expect(Number(sig[7])).toBeGreaterThanOrEqual(NEO.locked.rsDiv)
    expect(Number(sig[9])).toBeGreaterThanOrEqual(NEO.locked.volTrigger)
    const py = neoBridgeScript({ dataLabel: "ทดสอบ" })
    for (const needle of ['register_columns("rs_rank", "dist_52wh", "vol_ratio", "eps_qoq", "eps_yoy", "ema_20")', "ctx.stop_loss_pct = STOP_PCT", "ctx.stop_profit_pct = TARGET_PCT", "ctx.sell_all_shares()", "RS_DIV = 80", "VOL_TRIGGER = 2.5", "KNEE = 5.0", "DIST_B = 15.0"]) {
      expect(py).toContain(needle)
    }
    expect(py).not.toContain("take_profit_pct =")
    expect(py).toContain(NEO_BRIDGE_CSV)
    expect(py).toContain(NEO_BRIDGE_PY)
  })
})
