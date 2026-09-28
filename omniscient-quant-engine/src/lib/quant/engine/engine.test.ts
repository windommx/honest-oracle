/// <reference types="bun-types" />
// ============================================================
// Invariant tests ของเอนจินทั้ง 7 ชั้นบน DB ชั่วคราว (preload src/test/setup.ts) — seed จำลอง deterministic
// ไม่ยึดตัวเลขผลลัพธ์ตายตัว (ค่าขึ้นกับวันที่รัน เพราะ generator anchor วันทำการล่าสุด) แต่ยึด "รูปร่าง + กฎ" ที่ต้องจริงเสมอ
// ============================================================

import { beforeAll, describe, expect, test } from "bun:test"
import { db } from "@/lib/db"
import { getBoard, getDecision, getFactorModel, getProbs, getSystemStatus, getThetaMatrix, getVolcano, seedDemoJournal, seedIfNeeded } from "./api"
import { buildApexDossier, MDX_OVERRIDE_FACTOR } from "./apex"
import { runBacktest, type BacktestResult } from "./backtest"
import { currentRegimeSummary, evaluateGates } from "./gates"
import { buildRiskMdx } from "./mdx"
import { buildMetaRiskDossier, recoveryNeeded, ruinTable } from "./meta-risk"
import { microstructureMetrics } from "./micro"
import { ensureSeeded, loadMarketState } from "./panel"
import { buildSynthesisDossier, renderReport } from "./synthesis"
import { getAnalyst, getQuotes, getSeries } from "./terminal"
import type { MarketState } from "./types"

let state: MarketState
let bt: BacktestResult

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toContain("oqe-bun-test-") // ห้ามแตะ db/custom.db
  const seeded = await ensureSeeded(false)
  expect(seeded.count).toBe(22)
  state = await loadMarketState()
  bt = runBacktest(state)
}, 120_000)

describe("L0 panel — seed + point-in-time panel", () => {
  test("seed ลง DB ครบ 22 หุ้น × 750 วัน และ seed ซ้ำไม่เพิ่มแถว", async () => {
    expect(await db.stock.count()).toBe(22)
    expect(await db.price.count()).toBe(22 * 750)
    expect(await db.fundFlow.count()).toBe(22 * 750)
    expect(await db.fundamental.count()).toBeGreaterThan(22 * 4)
    const again = await seedIfNeeded(false)
    expect(again.count).toBe(22)
    expect(await db.price.count()).toBe(22 * 750)
  })

  test("MarketState: วันที่เรียงขึ้น, ทุกหุ้นมี rows เท่ากัน, ฟีเจอร์เป็นตัวเลขจำกัด, z-score ตัดขวางเฉลี่ย ≈ 0", () => {
    const N = state.dates.length
    expect(N).toBeGreaterThan(500)
    expect(state.stocks).toHaveLength(22)
    for (let i = 1; i < N; i++) expect(state.dates[i].getTime()).toBeGreaterThan(state.dates[i - 1].getTime())
    for (const s of state.stocks) {
      expect(s.rows).toHaveLength(N)
      const r = s.rows[N - 1]
      for (const k of ["close", "ret1", "ret21", "vol21", "rsi14", "volRatio", "theta", "thetaZ", "ltd", "pe", "pb"] as const) {
        expect(Number.isFinite(r[k])).toBe(true)
      }
      expect(r.rsi14).toBeGreaterThanOrEqual(0)
      expect(r.rsi14).toBeLessThanOrEqual(100)
      expect(r.ltd).toBeGreaterThanOrEqual(0)
      expect(r.ltd).toBeLessThanOrEqual(1)
    }
    const zMean = state.stocks.reduce((a, s) => a + s.rows[N - 1].z.ret21, 0) / state.stocks.length
    expect(Math.abs(zMean)).toBeLessThan(1e-6)
    expect(state.fStress).toHaveLength(N)
    expect(state.regime.every((r) => r === "risk_on" || r === "risk_off")).toBe(true)
  })

  test("getSystemStatus: วันที่จาก DB และ regime มีป้าย", async () => {
    const st = await getSystemStatus()
    expect(st.stocks).toBe(22)
    expect(st.days).toBe(state.dates.length)
    expect(st.lastDate).toBe(state.dates[state.dates.length - 1].toISOString().slice(0, 10))
    expect(st.regime.regime).toMatch(/CRISIS|BULL|RECOVERY|DISTRIBUTION|SIDEWAYS/)
  })
})

describe("L6 gates — 5-Gate decision engine", () => {
  test("ทุกหุ้น ณ วันล่าสุด: แผนสอดคล้อง (entry ต่ำกว่าราคา, stop ต่ำกว่า entry, size 0–100, failingGates ตรงกับ gates, signal ตามกฎ)", () => {
    const N = state.dates.length
    for (const s of state.stocks) {
      const ev = evaluateGates(state, s.symbol, N - 1, { riskBudgetPct: 1.0 })
      const p = ev.plan
      const close = s.rows[N - 1].close
      expect(p.entryLow).toBeLessThanOrEqual(p.entryHigh)
      expect(p.entryHigh).toBeLessThanOrEqual(close)
      expect(p.stopHard).toBeLessThan(close)
      expect(p.stopStruct).toBeLessThan(close)
      expect(p.sizePct).toBeGreaterThan(0)
      expect(p.sizePct).toBeLessThanOrEqual(100)
      expect(p.cvar).toBeGreaterThan(0)
      expect(p.probUp).toBeGreaterThanOrEqual(0.15)
      expect(p.probUp).toBeLessThanOrEqual(0.85)
      const failing = Object.entries(ev.gates).filter(([, ok]) => !ok).map(([k]) => k.toUpperCase())
      expect(p.failingGates).toEqual(failing)
      const allPass = Object.values(ev.gates).every(Boolean)
      if (allPass) expect(ev.signal).toBe("ENTRY_PULLBACK")
      if (ev.signal === "ENTRY_PULLBACK") expect(allPass).toBe(true)
      if (ev.signal === "ENTRY_MOMENTUM") expect(ev.gates.g1 && ev.gates.g2 && ev.gates.g3 && ev.gates.g4).toBe(true)
      expect(Object.keys(p.reasons).sort()).toEqual(["g1", "g2", "g3", "g4", "g5"])
    }
  })

  test("light mode (parametric) ให้ gate snapshot รูปแบบเดียวกันและเร็วพอสำหรับ history", () => {
    const N = state.dates.length
    const t0 = performance.now()
    for (let t = N - 120; t < N; t++) evaluateGates(state, "TSE", t, { light: true })
    expect(performance.now() - t0).toBeLessThan(5000)
  })

  test("currentRegimeSummary: ตัวเลขจำกัด, marketChg1d เป็นสัดส่วน (ไม่ใช่ %)", () => {
    const r = currentRegimeSummary(state)
    expect(Math.abs(r.marketChg1d)).toBeLessThan(0.2)
    expect(r.decoupleCount).toBeGreaterThanOrEqual(0)
    expect(r.decoupleCount).toBeLessThanOrEqual(22)
  })
})

describe("L4 backtest — walk-forward + attribution", () => {
  test("metrics จำกัด/อยู่ในช่วง, attribution ครบ 5 gates, calibration bucket มี n > 20, equity เริ่มที่ 1", () => {
    const m = bt.metrics
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true)
    expect(m.hitRate).toBeGreaterThanOrEqual(0)
    expect(m.hitRate).toBeLessThanOrEqual(100)
    expect(m.maxDD).toBeGreaterThanOrEqual(0)
    expect(m.profitFactor).toBeLessThanOrEqual(99)
    expect(bt.attribution.map((a) => a.gate)).toEqual(["G1", "G2", "G3", "G4", "G5"])
    for (const a of bt.attribution) {
      expect(["SPEAKS_TRUTH", "NOISE", "INSUFFICIENT"]).toContain(a.verdict)
      expect(a.p).toBeGreaterThanOrEqual(0)
      expect(a.p).toBeLessThanOrEqual(1)
    }
    for (const c of bt.calibration) expect(c.n).toBeGreaterThan(20)
    expect(bt.equity.length).toBeGreaterThan(20)
    expect(Math.abs(bt.equity[0].equity - 1)).toBeLessThan(0.05)
    expect(bt.trades.length).toBeGreaterThan(1000)
    expect(bt.trades.every((t) => Number.isFinite(t.fwdRet) && t.prob >= 0 && t.prob <= 1)).toBe(true)
  })

  test("backtest เป็น deterministic (รันซ้ำได้ผลเดิม) และ currentProbs อยู่ใน [0.4, 0.95]", async () => {
    const again = runBacktest(state)
    expect(again.metrics).toEqual(bt.metrics)
    const probs = await getProbs()
    expect(Object.keys(probs).sort()).toEqual(state.stocks.map((s) => s.symbol).sort())
    for (const p of Object.values(probs)) {
      expect(p).toBeGreaterThanOrEqual(0.4)
      expect(p).toBeLessThanOrEqual(0.95)
    }
  })
})

describe("L2/L3 analytics — factors, volcano, dependence", () => {
  test("factor model: 4 factors, exposures ต่อหุ้น, explained ≤ 1, enrichment q ∈ [0,1]", async () => {
    const f = await getFactorModel()
    expect(f.factors.length).toBeGreaterThanOrEqual(3)
    expect(f.explainedTotal).toBeLessThanOrEqual(1 + 1e-9)
    expect(f.exposures).toHaveLength(f.factors.length) // per factor → symbol → z
    for (const ex of f.exposures) expect(Object.keys(ex)).toHaveLength(22)
    for (const rows of Object.values(f.enrichment)) {
      for (const e of rows) {
        expect(e.q).toBeGreaterThanOrEqual(0)
        expect(e.q).toBeLessThanOrEqual(1)
      }
    }
    expect(f.pcaScatter).toHaveLength(22)
    expect(f.trajectories.length).toBeGreaterThan(10)
  })

  test("volcano: 22 หุ้น × 16 ฟีเจอร์ = 352 จุด, q ∈ [0,1], significant = q < 0.05 && |d| ≥ 0.5", async () => {
    const v = await getVolcano()
    expect(v.points).toHaveLength(352)
    for (const p of v.points) {
      expect(p.q).toBeGreaterThanOrEqual(0)
      expect(p.q).toBeLessThanOrEqual(1)
    }
    expect(v.nSignificant).toBe(v.points.filter((p) => p.significant).length)
  })

  test("Θ matrix: สมมาตร, แนวทแยง 20, ค่า ≥ 0, decouples ครบ 22", async () => {
    const d = await getThetaMatrix()
    const n = d.symbols.length
    expect(n).toBe(22)
    for (let i = 0; i < n; i++) {
      expect(d.matrix[i][i]).toBe(20)
      for (let j = 0; j < n; j++) {
        expect(d.matrix[i][j]).toBe(d.matrix[j][i])
        expect(d.matrix[i][j]).toBeGreaterThanOrEqual(0)
      }
    }
    expect(d.decouples).toHaveLength(22)
  })
})

describe("Decision Board + Decision detail", () => {
  test("board: เรียงสัญญาณก่อน (PULLBACK → MOMENTUM → NO_TRADE) แล้ว probUp มาก→น้อย · summary นับถูก · drift ตาม PSI", async () => {
    const b = await getBoard()
    expect(b.rows).toHaveLength(22)
    const rank = (s: string) => (s === "ENTRY_PULLBACK" ? 0 : s === "ENTRY_MOMENTUM" ? 1 : 2)
    for (let i = 1; i < b.rows.length; i++) {
      const a = b.rows[i - 1]
      const c = b.rows[i]
      expect(rank(a.signal) < rank(c.signal) || (rank(a.signal) === rank(c.signal) && a.probUp >= c.probUp)).toBe(true)
    }
    expect(b.summary.nPullback + b.summary.nMomentum + b.summary.nNoTrade).toBe(22)
    expect([...b.summary.decoupleAlerts].sort()).toEqual(b.rows.filter((r) => r.decoupled).map((r) => r.symbol).sort())
    const psi = b.summary.psiStress
    expect(b.summary.drift).toBe(psi > 0.2 ? "HEAVY" : psi > 0.1 ? "MODERATE" : "STABLE")
    for (const r of b.rows) expect(r.failingGates).toEqual(Object.entries(r.gates).filter(([, ok]) => !ok).map(([k]) => k.toUpperCase()))
  })

  test("decision detail: series 250 จุด, gate history 120 วัน, fundamentals PIT ≤ 6, ไม่รู้จัก symbol = null", async () => {
    const d = await getDecision("TSE")
    expect(d).not.toBeNull()
    expect(d!.priceSeries).toHaveLength(250)
    expect(d!.gateHist).toHaveLength(120)
    expect(d!.depSeries).toHaveLength(250)
    expect(d!.fundamentals.length).toBeLessThanOrEqual(6)
    expect(d!.kde.xs).toHaveLength(80)
    expect(d!.risk.paths).toBe(20000)
    expect(d!.risk.lossHistogram).toHaveLength(30)
    expect(await getDecision("NOPE")).toBeNull()
  })
})

describe("หลอมรวม (synthesis) — 13 evidence strands", () => {
  test("13 สาย, score ∈ [−100, 100], agreement ∈ [0,1], verdict สอดคล้องกับ score, renderReport มีหัวข้อครบ", async () => {
    const factors = await getFactorModel()
    for (const sym of ["TSE", "SCB", "INTUCH"]) {
      const d = buildSynthesisDossier(state, sym, factors, bt)!
      expect(d).not.toBeNull()
      expect(d.strands).toHaveLength(13)
      expect(d.score).toBeGreaterThanOrEqual(-100)
      expect(d.score).toBeLessThanOrEqual(100)
      expect(d.agreement).toBeGreaterThanOrEqual(0)
      expect(d.agreement).toBeLessThanOrEqual(1)
      expect(d.nLong + d.nShort + d.nNeutral).toBe(13)
      const keys = d.strands.map((s) => s.key)
      expect(keys).toContain("REFLEXIVITY")
      expect(keys).toContain("MICROSTRUCTURE")
      for (const s of d.strands) {
        expect(["LONG", "SHORT", "NEUTRAL"]).toContain(s.vote)
        expect(s.effWeight).toBeLessThanOrEqual(s.weight + 1e-9)
        if (s.gate) expect(s.trusted ? s.effWeight === s.weight : s.effWeight <= s.weight / 2 + 1e-9).toBe(true)
      }
      if (d.score >= 55 && d.agreement >= 0.6) expect(d.verdict.code).toBe("STRONG_LONG")
      if (d.score <= -55 && d.agreement >= 0.6) expect(d.verdict.code).toBe("STRONG_SHORT")
      if (Math.abs(d.score) < 25) expect(d.verdict.code).toBe("MIXED")
      expect(d.killSwitches.length).toBeGreaterThanOrEqual(2)
      const text = renderReport(d)
      expect(text).toContain(sym)
      expect(text).toContain("คะแนนบรรจบ")
    }
    expect(buildSynthesisDossier(state, "NOPE", factors, bt)).toBeNull()
  })
})

describe("Meta-Risk (L∞) — ruin math, MDX, antifragility", () => {
  test("recoveryNeeded: −50% ต้อง +100%, −90% ต้อง +900% · ruinTable เรียงยากขึ้น", () => {
    expect(recoveryNeeded(50)).toBeCloseTo(100, 6)
    expect(recoveryNeeded(90)).toBeCloseTo(900, 6)
    expect(recoveryNeeded(10)).toBeCloseTo(11.1, 1)
    const rows = ruinTable()
    expect(rows).toHaveLength(7)
    for (let i = 1; i < rows.length; i++) expect(rows[i].recoveryPct).toBeGreaterThan(rows[i - 1].recoveryPct)
  })

  test("dossier: P(ruin) ∈ [0,100], scaled ≤ fixed, checklist 12 ข้อ, deaths 5 เงื่อนไข, MDX 7 มิติน้ำหนักรวม 1, composite = Σ w·score, override ตามเกณฑ์", async () => {
    const board = await getBoard()
    const probs = await getProbs()
    for (const sym of ["TSE", "SCB", "PTTEP"]) {
      const d = buildMetaRiskDossier(
        state, sym, bt,
        { rows: board.rows.map((r) => ({ symbol: r.symbol, theme: r.theme, signal: r.signal, maxSizePct: r.maxSizePct })), summary: { psiStress: board.summary.psiStress } },
        [], probs[sym] ?? 0.5,
      )!
      expect(d).not.toBeNull()
      for (const r of [d.ruinFixed, d.ruinScaled]) {
        expect(r.pRuin50).toBeGreaterThanOrEqual(0)
        expect(r.pRuin50).toBeLessThanOrEqual(100)
        expect(r.pRuin30).toBeGreaterThanOrEqual(r.pRuin50)
      }
      expect(d.ruinScaled.pRuin50).toBeLessThanOrEqual(d.ruinFixed.pRuin50 + 1e-9)
      expect(d.checklist).toHaveLength(12)
      expect(d.deaths).toHaveLength(5)
      expect(d.defense).toHaveLength(5)
      expect(d.riskMdx.dims).toHaveLength(7)
      const wSum = d.riskMdx.dims.reduce((a, x) => a + x.weight, 0)
      expect(wSum).toBeCloseTo(1, 6)
      const composite = Math.round(d.riskMdx.dims.reduce((a, x) => a + x.weight * x.score, 0))
      expect(Math.abs(d.riskMdx.composite - composite)).toBeLessThanOrEqual(1)
      const c = d.riskMdx.composite
      expect(d.riskMdx.override).toBe(c >= 75 ? "ZERO" : c >= 50 ? "HALF" : "OK")
      for (const dim of d.riskMdx.dims) {
        expect(dim.score).toBeGreaterThanOrEqual(0)
        expect(dim.score).toBeLessThanOrEqual(100)
      }
      expect(d.antifragility.index).toBeGreaterThanOrEqual(0)
      expect(d.antifragility.index).toBeLessThanOrEqual(100)
      expect(typeof d.absorbingBarrier.inGame).toBe("boolean")
    }
  })

  test("buildRiskMdx ตอบสนองต่อความเสี่ยงที่สูงขึ้น: สภาพตลาดวิกฤต/สภาพคล่องแย่ → composite สูงกว่า", async () => {
    const probs = await getProbs()
    const N = state.dates.length
    const s = state.stocks.find((x) => x.symbol === "SCB")!
    const row = s.rows[N - 1]
    const plan = evaluateGates(state, "SCB", N - 1, { riskBudgetPct: 1.0, probUp: probs.SCB }).plan
    const micro = microstructureMetrics(state, "SCB")!
    const base = {
      plan, row, reg: currentRegimeSummary(state), reflexPhase: "PRE_IGNITION" as const, micro, psiStress: 0.05,
      sameThemeActive: 0, totalPlannedPct: 20, cashImpliedPct: 80, losingStreak: 0, planReady: true, rr: 2, entryMid: (plan.entryLow + plan.entryHigh) / 2,
      lossAtStopPct: 5, ruinFixedP50: 1, ruinScaledP50: 0.5, calibrationSkew: 2, deathsTriggered: 0, mlHitRate: 60,
    }
    const calm = buildRiskMdx(base)
    const stressed = buildRiskMdx({
      ...base,
      reg: { ...base.reg, stress: 1.2, regime: "CRISIS / Risk-Off", momentumSlope20: -0.02 },
      micro: { ...micro, spreadBps: 300, amihudBps: 200, exitComplexity: 90, mirage: { flagged: true, reason: "test" } },
      psiStress: 0.5, losingStreak: 4, deathsTriggered: 3, mlHitRate: 40, ruinFixedP50: 20, ruinScaledP50: 10, totalPlannedPct: 95, cashImpliedPct: 5,
    })
    expect(stressed.composite).toBeGreaterThan(calm.composite)
    expect(stressed.override).not.toBe("OK")
  })
})

describe("Apex (L7) — Kelly-Vol sizing, MDX override, crisis MC, registry", () => {
  test("finalSize = min(Kelly, CVaR, 25) × MDX · ZERO → 0 · HALF → ครึ่ง · registry 11 โมเดล · crisis 6 สถานการณ์ · survival 0–100", async () => {
    const probs = await getProbs()
    for (const sym of ["TSE", "SCB"]) {
      const plain = buildApexDossier(state, sym, bt, probs[sym] ?? 0.5)!
      expect(plain).not.toBeNull()
      const k = plain.kelly
      expect(k.mdxOverride).toBe("NONE")
      expect(k.mdxComposite).toBeNull()
      expect(k.finalSizePct).toBe(k.sizeBeforeMdxPct)
      if (!k.edgeGuard) expect(k.sizeBeforeMdxPct).toBeCloseTo(Math.min(k.kellySizePct, k.cvarSizePct, 25), 1)
      else expect(k.sizeBeforeMdxPct).toBe(0)
      expect(k.finalSizePct).toBeLessThanOrEqual(25)
      expect(plain.crisis.scenarios).toHaveLength(6)
      expect(plain.crisis.survivalScore).toBeGreaterThanOrEqual(0)
      expect(plain.crisis.survivalScore).toBeLessThanOrEqual(100)
      expect(plain.registry.rows).toHaveLength(11)
      expect(plain.registry.nActive + plain.registry.nProbation + plain.registry.nDead).toBe(11)
      expect(plain.micro.exitComplexity).toBeGreaterThanOrEqual(0)
      expect(plain.micro.exitComplexity).toBeLessThanOrEqual(100)
      expect(plain.micro.spreadBps).toBeGreaterThanOrEqual(0)

      const half = buildApexDossier(state, sym, bt, probs[sym] ?? 0.5, { riskMdx: { override: "HALF", composite: 60 } })!
      expect(half.kelly.mdxOverride).toBe("HALF")
      expect(half.kelly.mdxComposite).toBe(60)
      expect(half.kelly.finalSizePct).toBeCloseTo(+(k.sizeBeforeMdxPct * MDX_OVERRIDE_FACTOR.HALF).toFixed(1), 1)
      expect(half.verdict.risky).toBe(true)

      const zero = buildApexDossier(state, sym, bt, probs[sym] ?? 0.5, { riskMdx: { override: "ZERO", composite: 80 } })!
      expect(zero.kelly.finalSizePct).toBe(0)
      expect(zero.verdict.finalSizePct).toBe(0)
      expect(zero.verdict.risky).toBe(true)
      if (k.sizeBeforeMdxPct > 0) {
        expect(zero.verdict.headline).toContain("MDX")
        expect(zero.verdict.execution[0]).toContain("Risk MDX")
      }

      const ok = buildApexDossier(state, sym, bt, probs[sym] ?? 0.5, { riskMdx: { override: "OK", composite: 30 } })!
      expect(ok.kelly.finalSizePct).toBe(k.finalSizePct)
    }
    expect(buildApexDossier(state, "NOPE", bt, 0.5)).toBeNull()
  })
})

describe("Terminal — quotes, series, analyst (ไม่ใช้ LLM)", () => {
  test("quotes 22 ตัว sparkline 30 จุด · series 1D/1W วันสุดท้ายตรงกับ DB · analyst มี plan/indicators/brief", async () => {
    const q = await getQuotes()
    expect(q.quotes).toHaveLength(22)
    for (const r of q.quotes) expect(r.spark).toHaveLength(30)
    const lastDb = state.dates[state.dates.length - 1].toISOString().slice(0, 10)
    expect(q.lastDate).toBe(lastDb)

    const d1 = (await getSeries("TSE", "1D", 180))!
    expect(d1.bars).toHaveLength(180)
    expect(d1.bars[d1.bars.length - 1].date).toBe(lastDb)
    for (const b of d1.bars) {
      expect(b.l).toBeLessThanOrEqual(Math.min(b.o, b.c) + 1e-9)
      expect(b.h).toBeGreaterThanOrEqual(Math.max(b.o, b.c) - 1e-9)
    }
    const w = (await getSeries("TSE", "1W", 750))!
    expect(w.bars.length).toBeGreaterThan(100)
    expect(w.bars.length).toBeLessThan(200)
    expect(await getSeries("NOPE", "1D", 100)).toBeNull()

    const a = (await getAnalyst("SCB"))!
    expect(a.symbol).toBe("SCB")
    expect(["UP", "DOWN", "SIDE"]).toContain(a.trend.dir)
    expect(a.brief.length).toBeGreaterThanOrEqual(3)
    expect(a.plan.sizePct).toBeGreaterThan(0)
    expect(a.indicators.rsi).toBeGreaterThanOrEqual(0)
    expect(a.date).toBe(lastDb)
    expect(await getAnalyst("NOPE")).toBeNull()
  })
})

describe("Journal", () => {
  test("seedDemoJournal เติมจาก board ไม่ซ้ำเมื่อเรียกซ้ำ", async () => {
    const n1 = await seedDemoJournal()
    expect(n1).toBeGreaterThan(0)
    expect(n1).toBeLessThanOrEqual(4)
    const n2 = await seedDemoJournal()
    expect(n2).toBe(n1)
  })
})
