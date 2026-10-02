import { beforeAll, describe, expect, test } from "bun:test"
import { buildMarketState } from "@/lib/quant/engine/panel"
import type { MarketState } from "@/lib/quant/engine/types"
import { rhythmBase } from "@/lib/rhythm/service"
import type { PaperResult } from "@/lib/workflow/execution"
import { computeLab, configLabel, EMBARGO, LAB, powerFor, selectConfig, statsFor, trapOf, weekOf, type LabResult } from "./lab"
import { buildWinrate, type WinrateContext } from "./report"
import { getWinrate } from "./service"
import { binomTailGE, clusterMean, normInv, sampleSize, tInv, tSf } from "./stats"
import type { WinFilter, WinRow, WinStats } from "./types"

let state: MarketState
let lab: LabResult

beforeAll(async () => {
  state = await buildMarketState()
  lab = computeLab(state, rhythmBase(state)!.gates)
}, 180_000)

describe("winrate/stats", () => {
  test("หางทวินามแม่นตรง · normal/t quantile ตรงตาราง", () => {
    expect(binomTailGE(8, 10, 0.5)).toBeCloseTo(0.0546875, 12)
    expect(binomTailGE(5, 10, 0.5)).toBeCloseTo(0.623046875, 12)
    expect(binomTailGE(0, 10, 0.3)).toBe(1)
    expect(binomTailGE(11, 10, 0.3)).toBe(0)
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5)
    expect(normInv(0.01)).toBeCloseTo(-normInv(0.99), 9)
    expect(tSf(2, 10)).toBeCloseTo(0.036694, 6)
    expect(tSf(-2, 10)).toBeCloseTo(0.963306, 6)
    expect(tSf(3, 1)).toBeCloseTo(0.102416, 6) // Cauchy
    expect(tInv(0.975, 10)).toBeCloseTo(2.228139, 5)
    expect(tInv(0.975, 30)).toBeCloseTo(2.042272, 5)
    expect(tInv(0.975, 1e6)).toBeCloseTo(1.959966, 4)
  })

  test("จำนวนไม้: 60% → 80% ต้อง 33 ไม้ · เป้าไม่สูงกว่าการสุ่ม = พิสูจน์ฝีมือไม่ได้ (null)", () => {
    expect(sampleSize(0.6, 0.8)).toBe(33)
    expect(sampleSize(0.7, 0.8)!).toBeGreaterThan(sampleSize(0.6, 0.8)!)
    expect(sampleSize(0.8, 0.8)).toBeNull()
    expect(sampleSize(0.85, 0.8)).toBeNull()
  })

  test("cluster-robust: กลุ่มละไม้ = design effect 1 · ไม้ซ้ำในกลุ่มเดียวกัน = หลักฐานน้อยกว่าจำนวนไม้", () => {
    const xs = [0.4, -0.1, 0.3, 0.2, -0.2, 0.5, 0.1, 0.0, 0.3, -0.1]
    const solo = clusterMean(xs, xs.map((_, i) => `w${i}`))!
    expect(solo.deff).toBeCloseTo(1, 9)
    expect(solo.mean).toBeCloseTo(0.14, 12)
    expect(solo.lo).toBeLessThan(solo.mean)
    expect(solo.hi).toBeGreaterThan(solo.mean)
    const twice = clusterMean([...xs, ...xs], [...xs, ...xs].map((_, i) => `w${i % xs.length}`))!
    expect(twice.mean).toBeCloseTo(solo.mean, 12)
    expect(twice.deff).toBeGreaterThan(1.8)
    // ไม้ซ้ำไม่ได้เพิ่มหลักฐาน: p ไม่ดีขึ้นกว่าชุดเดิม
    expect(twice.p).toBeGreaterThanOrEqual(solo.p * 0.99)
    expect(clusterMean([1, 2], ["a", "b"])).toBeNull()
    expect(clusterMean([1, 2, 3, 4], ["a", "a", "b", "b"])).toBeNull() // 2 กลุ่ม ประมาณความแปรปรวนไม่ได้
  })
})

const res = (rNet: number | null, state: PaperResult["state"] = "closed"): PaperResult => ({
  state,
  fill: state === "closed" || state === "open" ? { index: 1, date: "2026-01-02", price: 10 } : null,
  exit: state === "closed" ? { index: 3, date: "2026-01-06", price: 10, kind: rNet! > 0 ? "target" : "stop" } : null,
  target: null,
  r: rNet,
  retPct: rNet,
  rNet,
  retNetPct: rNet,
  days: state === "closed" ? 2 : null,
  barsSeen: 5,
  eventDate: null,
  maePct: null,
  mfePct: null,
  maeR: null,
  mfeR: null,
})

describe("winrate/lab", () => {
  test("statsFor: นับชนะสุทธิ > 0 · ฐานการสุ่มเฉพาะไม้ที่จับคู่ได้ · คำสั่งหมดอายุ/gap ไม่นับเป็นไม้", () => {
    const rs = [res(0.5), res(0.2), res(-1), res(0.1), res(-0.3), res(0.4), res(null, "expired"), res(null, "gap")]
    const weeks = ["w1", "w1", "w2", "w3", "w4", "w5", "w6", "w6"]
    const q = [0.5, 0.5, 0.5, 0.5, null, 0.5, 0.5, 0.5]
    const s = statsFor(rs.map((_, i) => i), weeks, rs, q)
    expect(s).toMatchObject({ signals: 8, filled: 6, closed: 6, wins: 4, winRate: 66.7, fillRate: 75, baseline: 50 })
    expect(s.wilson!.lo).toBeLessThan(66.7)
    expect(s.breakevenWin).toBeCloseTo((100 * 0.65) / (0.3 + 0.65), 0)
    expect(weekOf("2026-10-02")).toBe("2026-09-28") // ศุกร์ → จันทร์ของสัปดาห์
    expect(weekOf("2026-09-28")).toBe("2026-09-28")
  })

  test("กริดครบ · deterministic · แบ่งช่วงครบทุกสัญญาณ · ตัดรอยต่อเท่าวันรอคำสั่ง + วันถือสูงสุด", () => {
    expect(lab.rows.length).toBe(LAB.targetsR.length * LAB.stopMults.length * LAB.holds.length * LAB.filters.length)
    expect(new Set(lab.rows.map((r) => r.key)).size).toBe(lab.rows.length)
    expect(lab.discoverySignals + lab.holdoutSignals + lab.embargoSignals).toBe(lab.signals)
    expect(lab.discoverySignals).toBeGreaterThan(0)
    expect(lab.holdoutSignals).toBeGreaterThan(0)
    expect(EMBARGO).toBe(3 + Math.max(...LAB.holds))
    expect(lab.split > lab.start && lab.split <= lab.end).toBe(true)
    const again = computeLab(state, rhythmBase(state)!.gates)
    expect(JSON.stringify(again)).toBe(JSON.stringify(lab))
  })

  test("กับดักรูปทรง: เป้าใกล้ทำให้การสุ่มก็ชนะมากขึ้น — ทุกเส้น stop × วันถือ", () => {
    expect(lab.curves.length).toBe(LAB.stopMults.length * LAB.holds.length)
    for (const s of LAB.stopMults) {
      for (const h of LAB.holds) {
        const pts = lab.curves.find((c) => c.stopMult === s && c.holdDays === h)!.points
        expect(pts.map((p) => p.targetR)).toEqual(LAB.targetsR)
        expect(pts[0].randomWin!).toBeGreaterThan(pts[pts.length - 1].randomWin!)
        expect(pts[0].signalWin!).toBeGreaterThan(pts[pts.length - 1].signalWin!)
      }
    }
  })

  test("q ของ Benjamini–Hochberg ≥ p เสมอ · config ที่ไม้ไม่พอไม่ถูกทดสอบ", () => {
    for (const r of lab.rows) {
      if (r.discovery.closed < LAB.minTrades) expect(r.q).toBeNull()
      if (r.q !== null) expect(r.q).toBeGreaterThanOrEqual(r.discovery.pExcess! - 1e-12)
    }
  })

  test("เลือกตามเกณฑ์ที่ตั้งไว้: ผู้ผ่านทุกตัวถึงเกณฑ์ · ตัวที่ใกล้ที่สุดมาจากช่วงค้นหาเท่านั้น", () => {
    const sel = selectConfig(lab.rows)
    for (const r of sel.reach) {
      expect(r.discovery.closed).toBeGreaterThanOrEqual(LAB.minTrades)
      expect(r.discovery.winRate!).toBeGreaterThanOrEqual(80)
    }
    expect(sel.closest).not.toBeNull()
    if (sel.selected) expect(sel.selected.q!).toBeLessThan(LAB.fdr)
    else expect(sel.holdoutPass).toBeNull()
    // แก้ผลช่วงทดสอบทั้งหมด → ตัวที่ถูกเลือก/ใกล้ที่สุดต้องไม่เปลี่ยน (ช่วงทดสอบไม่มีส่วนในการเลือก)
    const shuffled = lab.rows.map((r) => ({ ...r, holdout: { ...r.holdout, winRate: 100 - (r.holdout.winRate ?? 0) } }))
    const sel2 = selectConfig(shuffled)
    expect(sel2.closest?.key).toBe(sel.closest?.key)
    expect(sel2.selected?.key).toBe(sel.selected?.key)
    const trap = trapOf(lab.rows)!
    expect(trap.pVs50).toBeLessThan(0.001) // เทียบ 50% ดูมีนัยมาก…
    expect(trap.baseline!).toBeGreaterThan(60) // …แต่การสุ่มด้วยกติกาออกเดียวกันก็ชนะสูง
  })
})

const st = (o: Partial<WinStats> = {}): WinStats => ({
  signals: 60,
  filled: 50,
  fillRate: 83.3,
  closed: 50,
  wins: 42,
  winRate: 84,
  wilson: { lo: 71, hi: 92 },
  baseline: 60,
  excess: { mean: 24, lo: 12, hi: 36 },
  pExcess: 0.0001,
  expectancy: { mean: 0.8, lo: 0.2, hi: 1.4 },
  meanRNet: 0.2,
  profitFactor: 2,
  breakevenWin: 65,
  deff: 1.5,
  ...o,
})
const row = (o: Partial<WinRow> & { targetR: number; stopMult: number; holdDays: number; filter?: WinFilter }): WinRow => ({
  key: `t${o.targetR}-s${o.stopMult}-h${o.holdDays}-${o.filter ?? "all"}`,
  filter: "all",
  discovery: st(),
  holdout: st(),
  q: 0.01,
  ...o,
})
const fakeLab = (rows: WinRow[]): LabResult => ({
  start: "2024-01-02",
  end: "2026-09-30",
  split: "2026-01-05",
  sessions: 660,
  years: 2.7,
  signals: 200,
  discoverySignals: 110,
  holdoutSignals: 80,
  embargoSignals: 10,
  rows,
  curves: [],
})
const ctx = (o: Partial<WinrateContext> = {}): WinrateContext => ({
  data: { kind: "real", label: "Yahoo" },
  rules: { hashShort: "abc", locked: true, matches: true },
  exec: { orderDays: 3, targetR: 0.5, stopMult: 2, holdDays: 10, costPct: 0.3 },
  forward: { closed: 0, wins: 0 },
  ...o,
})

describe("winrate/report", () => {
  const good = row({ targetR: 0.5, stopMult: 2, holdDays: 10 })
  const loser = row({ targetR: 2, stopMult: 1, holdDays: 5, discovery: st({ winRate: 45, wins: 22, baseline: 48 }), q: 0.9 })

  test("จำนวนไม้ forward ของ config อ้างอิง: 60% → 80% × design effect", () => {
    const p = powerFor(good, 2.7)
    expect(p.nIid).toBe(33)
    expect(p.nNeeded).toBe(Math.ceil(33 * 1.5))
    expect(p.closedPerYear).toBeCloseTo(100 / 2.7, 1)
    const tooEasy = powerFor(row({ targetR: 0.25, stopMult: 2, holdDays: 10, discovery: st({ baseline: 82 }) }), 2.7)
    expect(tooEasy.nIid).toBeNull()
    expect(tooEasy.note).toContain("82.0%")
  })

  test("ไม่มีผู้ผ่าน = none · ข้อมูลจำลองบอกในเหตุผลข้อแรกและบล็อกขั้นข้อมูล", () => {
    const r = buildWinrate(fakeLab([loser, { ...good, q: 0.5 }]), ctx({ data: { kind: "synthetic", label: "จำลอง" } }))
    expect(r.verdict.level).toBe("none")
    expect(r.verdict.reasons[0]).toContain("จำลอง")
    expect(r.plan.map((p) => p.key)).toEqual(["data", "search", "holdout", "lock", "forward", "decide"])
    expect(r.plan[0].status).toBe("block")
    expect(r.plan[1].status).toBe("block")
    expect(r.plan[1].detail).toContain(configLabel(good)) // ทางเลือก: ประกาศ config เดียวล่วงหน้า
    expect(r.funnel).toMatchObject({ configs: 2, tested: 2, reach: 1, positive: 1, candidates: 0, selected: false })
  })

  test("ผ่านช่วงค้นหาแต่ตกช่วงทดสอบ = discovery · ห้ามเลือกตัวอื่นจากผลช่วงทดสอบ", () => {
    const failHold = { ...good, holdout: st({ winRate: 70, pExcess: 0.4 }) }
    const r = buildWinrate(fakeLab([failHold, loser]), ctx())
    expect(r.verdict.level).toBe("discovery")
    expect(r.plan.find((p) => p.key === "holdout")!.status).toBe("block")
    expect(r.plan.find((p) => p.key === "lock")!.status).toBe("wait")
  })

  test("ผ่านทั้งสองช่วง: ยังไม่ล็อก config นี้ = บล็อกพร้อมค่าที่ต้องตั้ง · ล็อกแล้ว = รอ forward", () => {
    const notLocked = buildWinrate(fakeLab([good, loser]), ctx({ exec: { orderDays: 3, targetR: 2, stopMult: 1, holdDays: 5, costPct: 0.3 } }))
    expect(notLocked.verdict.level).toBe("holdout")
    expect(notLocked.plan.find((p) => p.key === "lock")).toMatchObject({ status: "block" })
    expect(notLocked.plan.find((p) => p.key === "lock")!.detail).toContain("targetR: 0.5, stopMult: 2, holdDays: 10")
    expect(notLocked.forward.matchesReference).toBe(false)
    expect(notLocked.current.row?.key).toBe(loser.key)
    const locked = buildWinrate(fakeLab([good, loser]), ctx({ forward: { closed: 10, wins: 9 } }))
    expect(locked.verdict.level).toBe("holdout")
    expect(locked.forward).toMatchObject({ matchesReference: true, closed: 10, needed: 50 })
    expect(locked.plan.find((p) => p.key === "forward")!.detail).toContain("10/50")
  })

  test("forward ครบ: ชนะ ≥ 80% และเหนือการสุ่ม = confirmed · ไม่ถึง = rejected", () => {
    const ok = buildWinrate(fakeLab([good, loser]), ctx({ forward: { closed: 50, wins: 42 } }))
    expect(ok.verdict.level).toBe("confirmed")
    expect(ok.forward.pVsBaseline!).toBeLessThan(0.05)
    expect(ok.forward.pVsBaseline!).toBeCloseTo(binomTailGE(42, 50, 0.6), 4)
    const bad = buildWinrate(fakeLab([good, loser]), ctx({ forward: { closed: 50, wins: 33 } }))
    expect(bad.verdict.level).toBe("rejected")
    expect(bad.plan.find((p) => p.key === "decide")!.status).toBe("block")
  })
})

describe("winrate/service", () => {
  test("ข้อมูลจำลองของ test DB: ครบทุกส่วน · ขั้นข้อมูลถูกบล็อก · cache คืนผลเดิม", async () => {
    const r = (await getWinrate())!
    expect(r).not.toBeNull()
    expect(r.cells.length).toBe(r.grid.configs)
    expect(r.plan[0]).toMatchObject({ key: "data", status: "block" })
    expect(["none", "discovery", "holdout"]).toContain(r.verdict.level)
    expect(r.forward.closed).toBe(0) // ข้อมูลจำลองไม่นับเป็นไม้ forward
    expect(r.current.label).toBe("เป้า 2R · stop 1× · ถือ 5 วัน")
    const again = (await getWinrate())!
    expect(again.cells).toEqual(r.cells)
  }, 180_000)
})
