import { beforeAll, describe, expect, test } from "bun:test"
import { buildMarketState } from "@/lib/quant/engine/panel"
import type { MarketState } from "@/lib/quant/engine/types"
import { mulberry32 } from "@/lib/quant/rng"
import { rhythmBase } from "@/lib/rhythm/service"
import { EXEC, floorToTick } from "@/lib/workflow/execution"
import { signalSet } from "@/lib/winrate/signals"
import { bridgeCounts, bridgeCsv, bridgeScript, PYBROKER_VERSION } from "./bridge"
import { computeWalkforward, holm, maxDrawdown, OPTIMIZERS, WF, weekBootstrap, type WfComputed } from "./compute"
import { buildWalkforward, type WalkforwardContext } from "./report"
import { getBridgeFile, getWalkforward } from "./service"
import type { WfOptimizer } from "./types"

let state: MarketState
let wf: WfComputed

beforeAll(async () => {
  state = await buildMarketState()
  wf = computeWalkforward(state, rhythmBase(state)!.gates)
}, 180_000)

describe("walkforward/สถิติ", () => {
  test("Holm: คูณตามอันดับและไม่ลดลง · null คงเป็น null · drawdown จากยอดสะสมสูงสุด", () => {
    const adj = holm([0.01, 0.04, null, 0.03])
    expect(adj[0]).toBeCloseTo(0.03, 12)
    expect(adj[1]).toBeCloseTo(0.06, 12)
    expect(adj[2]).toBeNull()
    expect(adj[3]).toBeCloseTo(0.06, 12)
    expect(maxDrawdown([1, -2, 3, -4, 1])).toBe(4)
    expect(maxDrawdown([1, 2, 3])).toBe(0)
  })

  test("bootstrap รายสัปดาห์: deterministic ต่อ seed · ไม่มีไม้ขาดทุน = profit factor ไม่มีค่า drawdown 0 · กลุ่มน้อยกว่า 3 = ไม่คำนวณ", () => {
    const xs = [1, -0.5, 2, -1, 0.5, -2, 1.5, 0.2].map((ret, i) => ({ ret, week: `w${i % 4}` }))
    const a = weekBootstrap(xs, 200, mulberry32(7))!
    const b = weekBootstrap(xs, 200, mulberry32(7))!
    expect(a).toEqual(b)
    expect(a.pfLo!).toBeLessThanOrEqual(a.pfHi!)
    expect(a.dd95).toBeGreaterThanOrEqual(0)
    const up = weekBootstrap([1, 2, 3, 1].map((ret, i) => ({ ret, week: `w${i}` })), 100, mulberry32(1))!
    expect(up.pfLo).toBeNull()
    expect(up.dd95).toBe(0)
    expect(weekBootstrap([{ ret: 1, week: "a" }, { ret: -1, week: "b" }], 50, mulberry32(1))).toBeNull()
  })
})

describe("walkforward/compute — หน้าต่างเดินหน้าบนข้อมูลจำลอง", () => {
  test("deterministic · หน้าต่าง test เรียงไม่ทับกัน · train จบก่อน test อย่างน้อยเท่าช่วงตัดรอยต่อ", () => {
    expect(JSON.stringify(computeWalkforward(state, rhythmBase(state)!.gates))).toBe(JSON.stringify(wf))
    expect(wf.folds.length).toBeGreaterThan(0)
    expect(wf.folds.length).toBeLessThanOrEqual(WF.folds)
    const day = new Map(state.dates.map((d, i) => [d.toISOString().slice(0, 10), i]))
    let prevEnd = -1
    for (const f of wf.folds) {
      const ts = day.get(f.testStart)!
      const te = day.get(f.testEnd)!
      expect(ts).toBeGreaterThan(prevEnd)
      expect(te).toBeGreaterThanOrEqual(ts)
      prevEnd = te
      expect(ts - day.get(f.trainEnd)!).toBeGreaterThan(WF.embargo)
      expect(f.trainSignals).toBeGreaterThan(0)
    }
  })

  test("กติกาที่ล็อกถูกใช้ทุกหน้าต่าง · วิธีอื่นใช้ไม้ใน train ≥ เกณฑ์ (หรือถอยไปกติกาที่ล็อก)", () => {
    for (const f of wf.folds) {
      expect(f.picks.locked.exit).toEqual({ targetR: EXEC.targetR, stopMult: EXEC.stopMult, holdDays: EXEC.holdDays, filter: "all" })
      expect(f.picks.locked.fallback).toBe(false)
      for (const o of OPTIMIZERS) {
        const p = f.picks[o.key]
        if (o.key !== "locked" && !p.fallback) expect(p.isTrades).toBeGreaterThanOrEqual(WF.minTrain)
      }
      expect(f.picks.maeMfe.exit.holdDays).toBe(WF.excursionHold)
    }
  })

  test("ตารางไม้/เส้นผลรวม/สรุป สอดคล้องกัน · p หลังปรับ ≥ p ดิบ", () => {
    for (const o of wf.optimizers) {
      const ts = wf.trades.filter((t) => t.optimizer === o.key)
      expect(ts.length).toBe(o.trades)
      for (const t of ts) {
        expect(t.entryDate <= t.exitDate).toBe(true)
        expect(t.fold).toBeGreaterThanOrEqual(1)
        expect(t.maeR!).toBeGreaterThanOrEqual(0)
        expect(t.mfeR!).toBeGreaterThanOrEqual(0)
      }
      const curve = wf.curves.find((c) => c.key === o.key)!
      if (o.trades) expect(curve.points[curve.points.length - 1].cum).toBeCloseTo(o.sumPct, 1)
      if (o.key === "locked") expect(o.vsLocked).toBeNull()
      else if (o.pVsLocked !== null) expect(o.pVsLockedAdj!).toBeGreaterThanOrEqual(o.pVsLocked - 1e-12)
    }
  })

  test("MAE/MFE: เปอร์เซ็นไทล์เรียงขึ้น · E-ratio เป็นบวก · ทุกช่วงถือมีทั้งสัญญาณและการสุ่ม", () => {
    const m = wf.maeMfe
    for (const q of [m.signal, m.random]) {
      expect(q.n).toBeGreaterThan(5)
      expect(q.maeP50!).toBeLessThanOrEqual(q.maeP75!)
      expect(q.maeP75!).toBeLessThanOrEqual(q.maeP95!)
      expect(q.mfeP50!).toBeLessThanOrEqual(q.mfeP95!)
      expect(q.eRatio!).toBeGreaterThan(0)
    }
    expect(m.byHorizon.map((h) => h.horizon)).toEqual(WF.horizons)
    expect(m.points.length).toBeLessThanOrEqual(400)
    expect(m.fullWindowRule!.stopMult).toBeLessThanOrEqual(WF.wideStop)
  })
})

const opt = (o: Partial<WfOptimizer> & { key: WfOptimizer["key"] }): WfOptimizer => ({
  label: o.key,
  description: "",
  trades: 40,
  wins: 20,
  winRate: 50,
  wilson: { lo: 35, hi: 65 },
  expectancy: { mean: 0.1, lo: -0.5, hi: 0.7 },
  meanRNet: 0.05,
  sumPct: 4,
  profitFactor: 1.1,
  pfCI: { lo: 0.6, hi: 2 },
  maxDD: 5,
  maxDD95: 9,
  random: { winRate: 50, expectancy: 0.1 },
  excess: { mean: 0, lo: -0.6, hi: 0.6 },
  pExcess: 0.5,
  vsLocked: o.key === "locked" ? null : { mean: 0, lo: -0.5, hi: 0.5 },
  pVsLocked: o.key === "locked" ? null : 0.5,
  pVsLockedAdj: o.key === "locked" ? null : 0.9,
  isExpectancy: 0.5,
  wfe: 0.2,
  ...o,
})
const ctx = (kind = "synthetic"): WalkforwardContext => ({ data: { kind, label: kind === "real" ? "Yahoo" : "จำลอง" }, bridge: { rows: 10, symbols: 2, signals: 3 } })

describe("walkforward/report — คำตัดสินจากไม้นอกตัวอย่าง", () => {
  test("มีวิธีที่ผลสุทธิ > 0 และเหนือการสุ่มอย่างมีนัย = evidence · ทุกวิธีแย่กว่าการสุ่ม = worse · นอกนั้น = none", () => {
    const base = { ...wf, optimizers: (["locked", "maxExp", "maxWin", "maeMfe"] as const).map((key) => opt({ key })) }
    expect(buildWalkforward(base, ctx()).verdict.level).toBe("none")
    const good = { ...base, optimizers: base.optimizers.map((o) => (o.key === "maxExp" ? { ...o, expectancy: { mean: 1, lo: 0.3, hi: 1.7 }, excess: { mean: 0.8, lo: 0.2, hi: 1.4 }, pExcess: 0.001 } : o)) }
    const g = buildWalkforward(good, ctx("real"))
    expect(g.verdict.level).toBe("evidence")
    expect(g.verdict.title).toContain("maxExp")
    const worse = { ...base, optimizers: base.optimizers.map((o) => ({ ...o, excess: { mean: -1, lo: -2, hi: -0.2 } })) }
    expect(buildWalkforward(worse, ctx()).verdict.level).toBe("worse")
    // ไม้น้อยกว่าเกณฑ์ไม่นับในคำตัดสิน
    const thin = { ...good, optimizers: good.optimizers.map((o) => ({ ...o, trades: 5 })) }
    expect(buildWalkforward(thin, ctx()).verdict.level).toBe("none")
  })

  test("กับดัก 9 ข้อ: ข้อมูลจำลอง = survivorship ข้อมูลอย่างเดียว + ตัวเชื่อมเตือน · ข้อมูลจริงไม่มีหุ้นหยุดซื้อขาย = เตือน · มี = บอกชื่อ", () => {
    const syn = buildWalkforward(wf, ctx())
    expect(syn.traps.length).toBe(9)
    expect(syn.traps.find((t) => t.key === "survivorship")!.status).toBe("info")
    expect(syn.traps.find((t) => t.key === "connector")!.status).toBe("warn")
    expect(syn.verdict.reasons[0]).toContain("จำลอง")
    const real = buildWalkforward({ ...wf, delisted: [] }, ctx("real"))
    expect(real.traps.find((t) => t.key === "survivorship")!.status).toBe("warn")
    expect(real.traps.find((t) => t.key === "connector")!.status).toBe("ok")
    const gone = buildWalkforward({ ...wf, delisted: ["OLD1", "OLD2"] }, ctx("real"))
    expect(gone.traps.find((t) => t.key === "survivorship")!.detail).toContain("OLD1")
  })
})

describe("walkforward/bridge — ส่งออกไป PyBroker", () => {
  test("CSV: หัวตาราง · แถว = หุ้น × วัน · แถวสัญญาณ = จำนวนสัญญาณ · ราคาตั้งซื้อของ pullback ตรง tick", () => {
    const g = rhythmBase(state)!.gates
    const b = bridgeCsv(state, g)
    const lines = b.csv.trim().split("\n")
    expect(lines[0]).toBe("date,symbol,open,high,low,close,volume,oqe_signal,oqe_kind,oqe_ref,oqe_stophard")
    expect(lines.length - 1).toBe(b.rows)
    expect(b.rows).toBe(bridgeCounts(state, g).rows)
    const sig = lines.slice(1).map((l) => l.split(",")).filter((c) => c[7] === "1")
    expect(sig.length).toBe(signalSet(state, g).sigs.length)
    for (const c of sig.filter((c) => c[8] === "1")) expect(Number(c[9])).toBeCloseTo(floorToTick(Number(c[9])), 6)
    for (const c of sig) expect(Number(c[10])).toBeLessThan(Number(c[9]))
  })

  test("สคริปต์ Python: hyperparam เป็นทศนิยมทั้งชุด (PyBroker บังคับ) · ค่าเริ่มต้น = กติกาที่ล็อก · ไม่มีเศษ template", () => {
    const py = bridgeScript({ rulesHash: "abcdef0123456789", dataLabel: "ทดสอบ" })
    expect(py).toContain(`pip install -U lib-pybroker==${PYBROKER_VERSION}`)
    expect(py).toContain(`hyperparam("target_r", default=${Number.isInteger(EXEC.targetR ?? 0) ? `${EXEC.targetR ?? 0}.0` : EXEC.targetR}, low=0.5, high=2.0, step=0.5)`)
    expect(py).toContain(`hyperparam("stop_mult", default=${EXEC.stopMult}.0, low=1.0, high=2.0, step=0.5)`)
    expect(py).toContain(`hyperparam("hold", default=${EXEC.holdDays}, low=5, high=10, step=5)`)
    expect(py).toContain(`ORDER_DAYS = ${EXEC.orderDays}`)
    expect(py).toContain("abcdef012345")
    expect(py).not.toContain("${")
    expect(py).toContain('print("\\n== Walk-forward optimize')
  })
})

describe("walkforward/service", () => {
  test("ข้อมูลจำลองของ test DB: ครบทุกส่วน · ไฟล์ส่งออกทั้งสองแบบ · เรียกซ้ำได้ผลเดิม (cache)", async () => {
    const r = (await getWalkforward())!
    expect(["evidence", "none", "worse"]).toContain(r.verdict.level)
    expect(r.optimizers.map((o) => o.key)).toEqual(["locked", "maxExp", "maxWin", "maeMfe"])
    expect(r.traps.length).toBe(9)
    expect(r.bridge.pybroker).toBe(PYBROKER_VERSION)
    const again = (await getWalkforward())!
    expect(again.trades).toEqual(r.trades)
    expect((await getBridgeFile("csv"))!.startsWith("date,symbol,")).toBe(true)
    expect(await getBridgeFile("py")).toContain("pybroker.register_columns")
  }, 180_000)
})
