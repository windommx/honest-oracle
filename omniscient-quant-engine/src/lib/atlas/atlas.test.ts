import { beforeAll, describe, expect, test } from "bun:test"
import { runBacktest } from "@/lib/quant/engine/backtest"
import { buildMarketState } from "@/lib/quant/engine/panel"
import type { MarketState } from "@/lib/quant/engine/types"
import { mulberry32 } from "@/lib/quant/rng"
import { dayFeatureMatrix } from "@/lib/rhythm/compute"
import { rhythmBase } from "@/lib/rhythm/service"
import { ATLAS, BASE_EXIT, computeAtlas, simulateTrades, type AtlasInput } from "./compute"
import { getAtlas } from "./service"
import { aucSorted, bootMean, bootPaired, nEff, spearman } from "./stats"
import type { AtlasResponse } from "./types"

let state: MarketState
let input: AtlasInput
let atlas: AtlasResponse

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

beforeAll(async () => {
  state = await buildMarketState()
  const base = rhythmBase(state)!
  input = {
    state,
    t0: base.t0,
    t1: base.t1,
    gates: base.gates,
    dayMap: base.dayMap,
    breadth: base.breadth,
    features: dayFeatureMatrix(state, base.t0, base.t1),
    backtest: runBacktest(state),
    data: { kind: "synthetic", label: "ทดสอบ" },
  }
  atlas = computeAtlas(input)
}, 180_000)

describe("atlas/stats", () => {
  test("AUC: แยกได้สมบูรณ์ = 1 · กลับทาง = 0 · คะแนนเท่ากันหมด = 0.5 · น้ำหนัก 2 = แถวซ้ำ 2 ครั้ง", () => {
    const s = [1, 2, 3, 4]
    const order = [0, 1, 2, 3]
    expect(aucSorted(order, s, [0, 0, 1, 1])).toBe(1)
    expect(aucSorted(order, s, [1, 1, 0, 0])).toBe(0)
    expect(aucSorted(order, [5, 5, 5, 5], [0, 1, 0, 1])).toBe(0.5)
    const w = aucSorted([0, 1, 2], [1, 2, 3], [0, 1, 0], [2, 1, 1])
    const dup = aucSorted([0, 1, 2, 3], [1, 1, 2, 3], [0, 0, 1, 0])
    expect(w).toBeCloseTo(dup, 10)
  })

  test("bootstrap: deterministic ตาม seed · ช่วงครอบค่าเฉลี่ย · ผลต่างศูนย์ทุกคู่ = p 1", () => {
    const xs = Array.from({ length: 200 }, (_, i) => Math.sin(i) + 0.1)
    const a = bootMean(xs, mulberry32(1), 300, 5)
    const b = bootMean(xs, mulberry32(1), 300, 5)
    expect(a).toEqual(b)
    expect(a.lo).toBeLessThanOrEqual(a.mean)
    expect(a.hi).toBeGreaterThanOrEqual(a.mean)
    expect(bootPaired(xs, xs, mulberry32(2), 100, 5).p).toBe(1)
  })

  test("N_eff = (Σx)²/Σx² · Spearman ของลำดับเดียวกัน = 1", () => {
    expect(nEff([1, 1, 1, 1])).toBeCloseTo(4, 10)
    expect(nEff([5, 0, 0])).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 10)
  })
})

describe("atlas/ไม้จำลอง — กติกาออกตรงกับ OHLC จริง", () => {
  test("ทุกไม้เป็นไปตามกติกา: stop ≤ −1R (เปิดกระโดดได้แย่กว่า) · เป้า ≥ +2R · หมดเวลาบวก/ลบตามเครื่องหมาย · ถือไม่เกิน 5 วัน", () => {
    const { trades, perDay } = simulateTrades(input)
    expect(trades.length).toBe(sum(perDay))
    for (const t of trades) {
      expect(t.days).toBeLessThanOrEqual(ATLAS.holdDays)
      if (t.end === "open") {
        expect(t.ret).toBeNull()
        continue
      }
      if (t.end === "stop") expect(t.r!).toBeLessThanOrEqual(-1 + 1e-6)
      if (t.end === "target") expect(t.r!).toBeGreaterThanOrEqual(ATLAS.targetR - 1e-6)
      if (t.end === "timeUp") expect(t.ret!).toBeGreaterThan(0)
      if (t.end === "timeDown") expect(t.ret!).toBeLessThanOrEqual(0)
    }
  })

  test("คำนวณมือหนึ่งไม้ที่โดน stop: วันแรกที่ low ≤ stop ออกที่ min(open, stop)", () => {
    const { trades } = simulateTrades(input)
    const t = trades.find((x) => x.end === "stop")!
    const si = state.stocks.findIndex((s) => s.symbol === t.symbol)
    const t0 = state.dates.findIndex((d) => d.toISOString().slice(0, 10) === t.date)
    const s = state.stocks[si]
    const entry = s.rows[t0].close
    const stop = input.gates.stop[si][t0 - input.t0]
    const R = entry - stop
    let expected: number | null = null
    for (let u = t0 + 1; u <= t0 + ATLAS.holdDays; u++) {
      if (s.ohlcv.low[u] <= stop) {
        expected = Math.min(s.ohlcv.open[u], stop)
        expect(t.days).toBe(u - t0)
        break
      }
      expect(s.ohlcv.high[u]).toBeLessThan(entry + ATLAS.targetR * R)
    }
    expect(t.ret!).toBeCloseTo(((expected! / entry) - 1) * 100, 2)
  })

  test("กติกาออกแบบกว้าง/ไม่มีเป้า เปลี่ยนผลตามทิศที่ควร: stop กว้างขึ้น = โดน stop น้อยลง · ไม่มีเป้า = ไม่มีไม้ถึงเป้า", () => {
    const base = simulateTrades(input).trades
    const wide = simulateTrades(input, { ...BASE_EXIT, stopMult: 1.5 }).trades
    const noTarget = simulateTrades(input, { ...BASE_EXIT, targetR: null }).trades
    expect(wide.filter((t) => t.end === "stop").length).toBeLessThanOrEqual(base.filter((t) => t.end === "stop").length)
    expect(noTarget.filter((t) => t.end === "target").length).toBe(0)
  })
})

describe("atlas/computeAtlas — 6 มุม", () => {
  test("ผลคงที่ทุกครั้ง (seed คงที่) · หัวข้อ/ฐาน/สรุป/ที่มาครบทุกมุม", () => {
    expect(JSON.stringify(computeAtlas(input))).toBe(JSON.stringify(atlas))
    for (const k of ["stateMap", "timing", "depth", "mix", "lifecycle", "intel"] as const) {
      const sec = atlas[k]
      expect(sec.title.length).toBeGreaterThan(10)
      expect(sec.basis.length).toBeGreaterThan(10)
      expect(sec.conclusion.length).toBeGreaterThan(20)
      expect(sec.source).toContain("src/lib/atlas/compute.ts")
    }
    expect(atlas.intro).toContain("ไม่ใช่ผลเทรดจริง")
  })

  test("ตัวเลขหัวหน้าสอดคล้องกัน: สัญญาณ = ผลรวมรายวัน = ผลรวมช่อง heatmap · ปิด + เปิด = ทั้งหมด", () => {
    const h = atlas.header
    expect(sum(atlas.depth.days.map((d) => d.n))).toBe(h.nSignals)
    expect(sum(atlas.timing.cells.flat())).toBe(h.nSignals)
    const open = atlas.lifecycle.ends.find((e) => e.key === "open")!.n
    expect(h.nClosed + open).toBe(h.nSignals)
    expect(h.backtest.nSignals).toBe(input.backtest.metrics.nSignals)
    expect(atlas.mix.totals.gain + atlas.mix.totals.loss).toBeCloseTo(h.sumRet, 1)
    expect(atlas.mix.months.length).toBe(new Set(input.breadth.days.map((d) => d.date.slice(0, 7))).size)
  })

  test("F: AUC อยู่ใน [0,1] และช่วงครอบค่ากลาง · คันโยกแรก = กติกาปัจจุบัน · q ≥ p · คำตัดสินตาม q + ช่วงความเชื่อมั่น", () => {
    for (const a of atlas.intel.auc) {
      expect(a.auc).toBeGreaterThanOrEqual(0)
      expect(a.auc).toBeLessThanOrEqual(1)
      expect(a.lo).toBeLessThanOrEqual(a.hi)
      expect(a.p).toBeGreaterThan(0)
    }
    const [base, ...rest] = atlas.intel.levers
    expect(base.verdict).toBe("baseline")
    expect(base.nSignals).toBe(input.backtest.metrics.nSignals)
    for (const l of rest) {
      expect(l.q).toBeGreaterThanOrEqual(l.p - 1e-9)
      if (l.verdict === "better") expect(l.diff.lo).toBeGreaterThan(0)
      if (l.verdict === "worse") expect(l.diff.hi).toBeLessThan(0)
      if (l.verdict === "better" || l.verdict === "worse") expect(l.q).toBeLessThan(0.1)
      // "ไม่เปลี่ยนสัญญาณ" = ผลรายวันเท่ากติกาปัจจุบันทุกวัน → ส่วนต่างเป็นศูนย์พอดีและจำนวนสัญญาณเท่ากัน
      if (l.verdict === "same") {
        expect(l.diff).toEqual({ mean: 0, lo: 0, hi: 0 })
        expect(l.nSignals).toBe(base.nSignals)
      }
    }
    const idle = atlas.intel.levers.filter((l) => l.verdict === "same")
    if (idle.length) expect(atlas.actions.some((a) => a.tone === "watch" && idle.every((l) => a.text.includes(l.label)))).toBe(true)
  })

  test("E: กติกาออกทางเลือกเทียบกับกติกาปัจจุบันบนสัญญาณชุดเดียวกัน · ข้อเสนอ 'ทดลอง' มาจากผลที่ผ่านเกณฑ์เท่านั้น", () => {
    const ex = atlas.lifecycle.exitLevers
    expect(ex[0].verdict).toBe("baseline")
    expect(ex[0].meanRet).toBe(atlas.header.meanRet)
    const tries = atlas.actions.filter((a) => a.tone === "try")
    const better = [...ex.filter((l) => l.verdict === "better"), ...atlas.intel.levers.filter((l) => l.verdict === "better")]
    expect(tries.length).toBeGreaterThanOrEqual(better.length)
    for (const b of better) expect(tries.some((t) => t.text.includes(b.label))).toBe(true)
    if (!atlas.intel.levers.some((l) => l.verdict === "better")) expect(atlas.actions.some((a) => a.tone === "keep" && a.text.includes("อย่าจูนเพิ่ม"))).toBe(true)
  })

  test("A: ρ ของเพื่อนบ้านมี p จากการเลื่อนวงกลม · กลุ่มวันรวมเท่าจำนวนวัน · ภาวะตลาดมี CI ทั้งสองฝั่ง", () => {
    const m = atlas.stateMap
    expect(m.neighbor.p).toBeGreaterThan(0)
    expect(m.neighbor.p).toBeLessThanOrEqual(1)
    expect(sum(m.clusters.map((c) => c.nDays))).toBe(m.points.length)
    expect(sum(m.clusters.map((c) => c.nSignals))).toBe(atlas.header.nSignals)
    expect(m.regime.map((r) => r.key)).toEqual(["risk_on", "risk_off"])
    expect(m.points.filter((p) => p.outcome !== null).length).toBe(m.neighbor.n)
  })

  test("getAtlas ใช้ข้อมูลใน DB + cache ต่อเวอร์ชันข้อมูล", async () => {
    const a = await getAtlas()
    expect(a).not.toBeNull()
    expect(a!.header.data.kind).toBe("synthetic")
    expect(await getAtlas()).toBe(a)
  }, 180_000)
})
