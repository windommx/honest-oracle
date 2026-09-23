/// <reference types="bun-types" />
// bun test — regression ของเอนจิน GTAA ส่วนที่ pure (ไม่แตะ DB / data/gtaa/panel.json / เครือข่าย)
import { afterEach, describe, expect, it } from "bun:test"

import { backtestReturns, warmupMonths } from "./backtest"
import { computeMonthSignals } from "./signals"
import { computeMacroState } from "./macro"
import { evaluateTracking, trackingSummary, type StoredSignalLike } from "./tracking"
import { normalizePanel, parseCsvPanel } from "./data"
import { checkQuality } from "./quality"
import { blockBootstrap } from "./montecarlo"
import { computeStats, drawdownSeries, equityCurve } from "./stats"
import { runSelfTests } from "./selftest"
import { fetchRealPanel } from "./fetcher"
import { ALL_ASSETS } from "./defaults"
import { DEFAULT_GTAA_CONFIG, type GtaaConfig, type GtaaPanel } from "./types"

/** ป้ายเดือนต่อเนื่อง n เดือนเริ่ม 2010-01 */
function months(n: number, startYear = 2010): string[] {
  return Array.from({ length: n }, (_, i) => {
    const t = startYear * 12 + i
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`
  })
}

/** ราคาจากผลตอบแทนรายเดือน: r(i) = ผลตอบแทนจากช่อง i-1 → i */
function prices(n: number, r: (i: number) => number, start = 100): number[] {
  const out = [start]
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + r(i)))
  return out
}

function panelOf(closes: Record<string, (number | null)[]>, extra: Partial<GtaaPanel["meta"]> = {}): GtaaPanel {
  const n = Math.max(...Object.values(closes).map((s) => s.length))
  return {
    meta: { source: "yahoo", fetchedAt: "2030-01-01T00:00:00.000Z", notes: [], ...extra },
    dates: months(n),
    assets: ALL_ASSETS,
    closes,
  }
}

const cfg = (patch: Partial<GtaaConfig>): GtaaConfig => ({ ...DEFAULT_GTAA_CONFIG, ...patch })

describe("backtest — น้ำหนักหลังรีบาลานซ์", () => {
  // VTV นำ 30 เดือนแรก แล้ว EFA นำ → สลับครั้งเดียว
  const n = 60
  const panel = panelOf({
    VTV: prices(n, (i) => (i <= 30 ? 0.02 : 0.005)),
    EFA: prices(n, (i) => (i <= 30 ? 0.005 : 0.02)),
    BIL: prices(n, () => 0.001),
    SPY: prices(n, () => 0.01),
  })

  for (const K of [1, 2]) {
    it(`ตัวที่ขายแล้วต้องหายจาก tranche (K=${K}) — ไม่ถูกนับขายซ้ำ/ไม่ได้ผลตอบแทนต่อ`, () => {
      const r = backtestReturns(panel, cfg({ topN: 1, smaMonths: 3, costBps: 10, tranches: K }))
      // หลังสลับเสร็จ ถือ EFA อย่างเดียว → +2% เป๊ะทุกเดือน ไม่มีต้นทุนหลอน
      for (const x of r.strat.slice(-10)) expect(Math.abs(x - 0.02)).toBeLessThan(1e-12)
      // เทรดจริง: ซื้อครั้งแรก (1) + สลับ (ขาย 1 + ซื้อ 1) = 3 หน่วยตลอดช่วง
      expect(Math.abs(r.turnoverAnnual - (3 * 12) / r.strat.length)).toBeLessThan(1e-9)
    })
  }

  it("ทุก tranche ลงทุนตั้งแต่เดือนแรก — เดือนแรกของ K=2..4 เท่ากับ K=1 (ไม่มี tranche ถือเงินเปล่า 0%)", () => {
    const first = (K: number) => backtestReturns(panel, cfg({ topN: 1, smaMonths: 3, costBps: 10, tranches: K })).strat[0]
    for (const K of [2, 3, 4]) expect(Math.abs(first(K) - first(1))).toBeLessThan(1e-12)
    expect(first(1)).toBeGreaterThan(0.01)
  })

  it("น้ำหนักหลัง drift รวม = 1 แม้มีต้นทุน — ถือตัวเดิมต่อต้องไม่เสียต้นทุนเพิ่ม", () => {
    const flat = panelOf({ VTV: prices(n, () => 0.01), BIL: prices(n, () => 0.0016), SPY: prices(n, () => 0.01) })
    const r = backtestReturns(flat, cfg({ topN: 1, smaMonths: 3, costBps: 50 }))
    expect(Math.abs(r.strat[0] - (0.01 - 0.005))).toBeLessThan(1e-12) // เดือนแรกจ่ายค่าซื้อ 50bps
    for (const x of r.strat.slice(1)) expect(Math.abs(x - 0.01)).toBeLessThan(1e-12)
  })

  it("ตรงกับ implementation อ้างอิงแบบตรงไปตรงมา (K=1)", () => {
    const m = 120
    const p = panelOf({
      VTV: prices(m, (i) => 0.008 + 0.03 * Math.sin(i / 5)),
      EFA: prices(m, (i) => 0.006 + 0.028 * Math.sin(i / 7 + 1)),
      GLD: prices(m, (i) => 0.005 + 0.02 * Math.sin(i / 4 + 2)),
      TLT: prices(m, (i) => 0.003 + 0.018 * Math.sin(i / 6 + 3)),
      IEF: prices(m, (i) => 0.002 + 0.01 * Math.sin(i / 9)),
      BIL: prices(m, () => 0.0016),
      SPY: prices(m, (i) => 0.007 + 0.03 * Math.sin(i / 9)),
    })
    for (const c of [cfg({ topN: 2, costBps: 30 }), cfg({ topN: 3, cashMode: "trendedBond", costBps: 10 })]) {
      const ret = (tk: string, t: number) => {
        const s = p.closes[tk] ?? []
        const a = s[t]
        const b = s[t + 1]
        return a == null || b == null ? 0 : b / a - 1
      }
      const ref: number[] = []
      let drifted: Record<string, number> = {}
      for (let t = warmupMonths(c); t < p.dates.length - 1; t++) {
        const w = computeMonthSignals(p, t, c).weights
        let traded = 0
        for (const k of new Set([...Object.keys(drifted), ...Object.keys(w)])) traded += Math.abs((w[k] ?? 0) - (drifted[k] ?? 0))
        let g = 0
        for (const [k, x] of Object.entries(w)) g += x * ret(k, t)
        ref.push(g - (traded * c.costBps) / 1e4)
        const nd: Record<string, number> = {}
        for (const [k, x] of Object.entries(w)) nd[k] = (x * (1 + ret(k, t))) / (1 + g)
        drifted = nd
      }
      const eng = backtestReturns(p, c).strat
      expect(eng.length).toBe(ref.length)
      for (let i = 0; i < ref.length; i++) expect(Math.abs(eng[i] - ref[i])).toBeLessThan(1e-12)
    }
  })
})

describe("cashMode trendedBond + Macro Gate", () => {
  // IEF: 80 นาน → กระโดดขึ้น 110 เจ็ดเดือน → ย่อเหลือ 105 เดือนล่าสุด
  // SMA10 = 103.5 < 105 < SMA8 = 109.375 → กฎ SMA-10 ได้ IEF · ถ้าใช้ SMA8 จะตกไป BIL ผิดกฎ
  const n = 40
  const ief = Array.from({ length: n }, (_, k) => (k < n - 8 ? 80 : k < n - 1 ? 110 : 105))

  it("ใช้ SMA-10 ของ IEF เสมอ ไม่ผูกกับ smaMonths ของ trend filter (docs §1)", () => {
    const panel = panelOf({ IEF: ief, VTV: prices(n, () => -0.02), BIL: prices(n, () => 0.001), SPY: prices(n, () => 0.01) })
    const t = n - 1
    const sma = (k: number) => ief.slice(t - k + 1, t + 1).reduce((a, b) => a + b, 0) / k
    expect(ief[t]).toBeGreaterThan(sma(10))
    expect(ief[t]).toBeLessThan(sma(8))
    expect(computeMonthSignals(panel, t, cfg({ cashMode: "trendedBond", smaMonths: 8 })).cashTicker).toBe("IEF")
  })

  it("IEF ถูกเลือกเป็นตัวถือด้วย → เงินสด = ส่วนที่ไม่ได้ถือจริง (slot ของ IEF ไม่ถูกนับเป็นเงินสด)", () => {
    const up = prices(n, () => 0.012)
    const panel = panelOf({ VTV: up, EFA: prices(n, () => 0.011), IEF: prices(n, () => 0.004), BIL: prices(n, () => 0.001), SPY: up })
    const c = cfg({ cashMode: "trendedBond", topN: 6 })
    const sig = computeMonthSignals(panel, n - 1, c)
    expect(sig.cashTicker).toBe("IEF")
    expect(sig.rows.find((r) => r.ticker === "IEF")?.status).toBe("selected")
    const m = computeMacroState(panel, c, new Date(Date.UTC(2030, 0, 1)))
    expect(Math.abs(m.cashPct - 0.5)).toBeLessThan(1e-12) // ถือ 3/6 → เงินสด 50% (เดิมรายงาน 66.7%)
    const ief6 = m.holdings.find((h) => h.ticker === "IEF")
    expect(ief6 && Math.abs(ief6.weight - 1 / 6)).toBeLessThan(1e-12)
    expect(Math.abs(m.cashPct + m.holdings.reduce((a, h) => a + h.weight, 0) - 1)).toBeLessThan(1e-12)
    expect(m.stance).toBe("caution") // เงินสด ≥ 50% แต่ SPY ยืนเหนือเส้น
  })
})

describe("evaluateTracking", () => {
  const n = 30
  const vtv = prices(n, () => 0.012)
  const bil = prices(n, () => 0.0016)
  const spy = prices(n, (i) => (i % 2 === 0 ? 0.02 : -0.01))
  const panel = panelOf({ VTV: vtv, BIL: bil, SPY: spy }) // fetchedAt 2030 = ข้อมูลทุกเดือนปิดแล้ว
  const after = new Date(Date.UTC(2030, 0, 1))
  const i = 20
  const row = (patch: Partial<StoredSignalLike>): StoredSignalLike => ({
    id: 1,
    decisionMonth: panel.dates[i],
    appliesMonth: panel.dates[i + 1],
    cashPct: 0.5,
    cashTicker: "BIL",
    holdings: JSON.stringify([{ ticker: "VTV", weight: 0.5 }]),
    failed: "[]",
    stance: "caution",
    dataSource: "yahoo",
    configHash: "t",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  })
  const r = (s: number[], k: number) => s[k + 1] / s[k] - 1

  it("นับส่วนเงินสด (BIL ไม่อยู่ใน holdings ที่บันทึก) — พอร์ต = 0.5·VTV + 0.5·BIL", () => {
    const [ev] = evaluateTracking(panel, [row({})], after)
    expect(ev.realized?.state).toBe("scored")
    expect(Math.abs((ev.realized?.portfolioRet ?? 9) - (0.5 * r(vtv, i) + 0.5 * r(bil, i)))).toBeLessThan(1e-12)
  })

  it("สัญญาณเงินสด 100% (holdings ว่าง) ต้องได้คะแนน ไม่ใช่ขาดข้อมูลตลอดไป", () => {
    const [ev] = evaluateTracking(panel, [row({ cashPct: 1, holdings: "[]" })], after)
    expect(ev.realized?.state).toBe("scored")
    expect(Math.abs((ev.realized?.portfolioRet ?? 9) - r(bil, i))).toBeLessThan(1e-12)
    expect(trackingSummary([ev]).scored).toBe(1)
  })

  it("สรุป 'บันทึกกี่เดือน' นับเดือน ไม่ใช่จำนวน config ที่บันทึกในเดือนเดียวกัน", () => {
    const evs = evaluateTracking(panel, [row({ id: 1 }), row({ id: 2, configHash: "other" }), row({ id: 3, decisionMonth: panel.dates[i - 1] })], after)
    const s = trackingSummary(evs)
    expect(s.saved).toBe(2)
    expect(s.scored).toBe(3)
  })

  it("เดือนที่ใช้ยังไม่ปิด (ปฏิทิน) หรือ panel ดึงมาก่อนปิดเดือน → รอผล", () => {
    const applies = panel.dates[i + 1]
    const [y, m] = applies.split("-").map(Number)
    const mid = new Date(Date.UTC(y, m - 1, 20))
    expect(evaluateTracking(panel, [row({})], mid)[0].realized).toBeNull()
    const fetchedMid: GtaaPanel = { ...panel, meta: { ...panel.meta, fetchedAt: mid.toISOString() } }
    expect(evaluateTracking(fetchedMid, [row({})], after)[0].realized).toBeNull()
    const fetchedAfter: GtaaPanel = { ...panel, meta: { ...panel.meta, fetchedAt: new Date(Date.UTC(y, m, 2)).toISOString() } }
    expect(evaluateTracking(fetchedAfter, [row({})], after)[0].realized?.state).toBe("scored")
  })

  it("สัญญาณจริงห้ามตรวจกับราคาสังเคราะห์ · เดือนหลัง panel = รอผล · กริดขาด = ขาดข้อมูล", () => {
    const synth: GtaaPanel = { ...panel, meta: { ...panel.meta, source: "synthetic" } }
    expect(evaluateTracking(synth, [row({})], after)[0].realized?.state).toBe("missing-data")
    expect(evaluateTracking(synth, [row({ dataSource: "synthetic" })], after)[0].realized?.state).toBe("scored")
    expect(evaluateTracking(panel, [row({ decisionMonth: "2029-05", appliesMonth: "2029-06" })], after)[0].realized).toBeNull()
    expect(evaluateTracking(panel, [row({ decisionMonth: "2001-05", appliesMonth: "2001-06" })], after)[0].realized?.state).toBe("missing-data")
    const gap: GtaaPanel = { ...panel, dates: panel.dates.map((d, k) => (k > i ? months(n + 1)[k + 1] : d)) }
    expect(evaluateTracking(gap, [row({})], after)[0].realized?.state).toBe("missing-data")
  })
})

describe("parseCsvPanel", () => {
  const TICK = ["VTV", "EFA", "TLT", "GLD"]
  const M = months(30, 2022)
  const lastDay = (lab: string) => {
    const [y, m] = lab.split("-").map(Number)
    return `${lab}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`
  }
  const savedTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = savedTz
  })

  it("long format ที่มีทั้ง close และ adj close → ใช้ adj close", () => {
    const lines = ["date,ticker,close,adj close"]
    M.forEach((d, k) => TICK.forEach((t) => lines.push(`${lastDay(d)},${t},${100 + k},${50 + k}`)))
    const p = parseCsvPanel(lines.join("\n")).panel
    expect(p?.closes.VTV[0]).toBe(50)
  })

  it("ไฟล์รายวันเรียงใหม่→เก่า → เก็บราคาวันท้ายสุดของเดือน", () => {
    const rows: string[] = []
    M.forEach((d, k) => {
      rows.push(`${d}-02,${100 + k},1,1,1`)
      rows.push(`${lastDay(d)},${100 + k}.5,1,1,1`)
    })
    const p = parseCsvPanel(["Date," + TICK.join(","), ...rows.reverse()].join("\n")).panel
    expect(p?.dates[0]).toBe("2022-01")
    expect(p?.closes.VTV[0]).toBe(100.5)
    expect(p?.closes.VTV[29]).toBe(129.5)
  })

  for (const tz of ["UTC", "Asia/Bangkok", "America/Los_Angeles"]) {
    it(`วันที่ 1 ของเดือนแบบไม่ใช่ ISO ไม่เลื่อนเดือน (TZ=${tz})`, () => {
      process.env.TZ = tz
      const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      const a = ["Date," + TICK.join(","), ...M.map((d, k) => `${names[Number(d.slice(5)) - 1]} 1 ${d.slice(0, 4)},${100 + k},1,1,1`)]
      const b = ["Date," + TICK.join(","), ...M.map((d, k) => `${d.replace("-", "/")}/01,${100 + k},1,1,1`)]
      for (const csv of [a, b]) {
        const p = parseCsvPanel(csv.join("\n")).panel
        expect(p?.dates[0]).toBe("2022-01")
        expect(p?.dates.at(-1)).toBe(M.at(-1))
      }
    })
  }

  it("รองรับ BOM + CRLF + เซลล์ในเครื่องหมายคำพูด (มี , ข้างใน) · เดือน 13 ถูกข้าม", () => {
    const lines = ['"Date","VTV","EFA","TLT","GLD"', ...M.map((d, k) => `"${lastDay(d)}","1,${100 + k}.25","1","1","1"`), '"2023-13-01","9","9","9","9"']
    const p = parseCsvPanel("﻿" + lines.join("\r\n")).panel
    expect(p?.dates.length).toBe(30)
    expect(p?.closes.VTV[0]).toBe(1100.25)
    expect(p?.dates.includes("2023-13")).toBe(false)
  })
})

describe("normalizePanel / quality gate", () => {
  const base = { meta: { source: "yahoo", fetchedAt: "x", notes: [] }, dates: ["2024-01", "2024-02"], closes: { SPY: [1, 2] } }

  it("เติม notes/assets ที่ขาด แทนการพังตอน spread/filter", () => {
    const p = normalizePanel({ ...base, meta: { source: "yahoo", fetchedAt: "x" } })
    expect(typeof p).not.toBe("string")
    if (typeof p !== "string") {
      expect(p.meta.notes).toEqual([])
      expect(p.assets.map((a) => a.ticker)).toEqual(["SPY"])
    }
  })

  it("ซีรีส์ยาวไม่เท่า dates / ไม่ใช่ออบเจ็กต์ → ใช้ไม่ได้พร้อมเหตุผล", () => {
    expect(typeof normalizePanel({ ...base, closes: { SPY: [1] } })).toBe("string")
    expect(typeof normalizePanel(null)).toBe("string")
    expect(typeof normalizePanel({ ...base, dates: [] })).toBe("string")
  })

  it("กริดเดือนขาด (เดือนหายทั้งแถว) = hole ที่บล็อกการบันทึก", () => {
    const n = 40
    const dates = months(n + 1).filter((_, k) => k !== 20)
    const closes: Record<string, number[]> = {}
    for (const t of ["VTV", "EFA", "TLT", "GLD", "SPY", "BIL"]) closes[t] = prices(n, () => 0.01)
    const q = checkQuality({ meta: { source: "upload", fetchedAt: "x", notes: [] }, dates, assets: ALL_ASSETS, closes })
    expect(q.ok).toBe(false)
    expect(q.issues.some((x) => x.type === "hole" && x.detail.includes(months(n + 1)[20 - 1]))).toBe(true)
  })
})

describe("stats / Monte Carlo edge cases", () => {
  it("drawdown series เริ่มยอดที่ทุน 1 — ตรงกับ maxDD ของ computeStats เมื่อเดือนแรกติดลบ", () => {
    const r = [-0.1, 0.05, 0.02]
    expect(Math.min(...drawdownSeries(equityCurve(r)))).toBeCloseTo(computeStats(r).maxDD, 12)
  })

  it("block bootstrap บนผลตอบแทนว่างไม่คืน NaN", () => {
    const b = blockBootstrap([], 100)
    for (const v of [b.cagr.p5, b.cagr.p50, b.cagr.p95, b.maxDD.p50, b.sharpe.p50]) expect(Number.isFinite(v)).toBe(true)
    expect(b.histogram.every((h) => !h.bucket.includes("NaN"))).toBe(true)
  })
})

describe("self-test suite", () => {
  it("ผ่านครบ 14 ข้อ", () => {
    const r = runSelfTests()
    expect(r.length).toBe(14)
    expect(r.filter((t) => !t.pass).map((t) => t.id)).toEqual([])
  })
})

describe("fetchRealPanel (mock fetch — ไม่ออกเครือข่าย)", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const monthlyTs = Array.from({ length: 30 }, (_, k) => Date.UTC(2023, k, 1, 5) / 1000)

  it("Yahoo ล้มทุกตัว → รายงานเหตุผลจริง (HTTP 403) ไม่ใช่ 429 ที่เดาเอง", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("yahoo.com")) return new Response("forbidden", { status: 403 })
      return new Response("blocked", { status: 403 })
    }) as typeof fetch
    const out = await fetchRealPanel()
    expect(out.ok).toBe(false)
    expect(out.attempts[0].detail).toContain("HTTP 403")
    expect(out.attempts[0].detail).not.toContain("429")
  })

  it("ตัวที่มาจาก Stooq ต้องติดป้ายว่าไม่ปรับปันผล ไม่ใช่ 'Yahoo adjclose' ทั้งหมด", async () => {
    const stooqCsv = ["Date,Open,High,Low,Close,Volume", ...monthlyTs.map((ts, k) => `${new Date(ts * 1000).toISOString().slice(0, 7)}-28,1,1,1,${50 + k},1`)].join("\n")
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("yahoo.com")) {
        if (/chart\/(TLT|IEF)\?/.test(url)) return new Response("forbidden", { status: 403 })
        return new Response(
          JSON.stringify({ chart: { result: [{ timestamp: monthlyTs, indicators: { adjclose: [{ adjclose: monthlyTs.map((_, k) => 100 + k) }] } }] } }),
          { status: 200 },
        )
      }
      if (url.includes("stooq.com/q/?s=")) return new Response('<script>c="abc";d=1</script>', { status: 200 })
      if (url.includes("stooq.com/__verify")) return new Response("ok", { status: 200, headers: { "Set-Cookie": "sid=1; Path=/" } })
      if (url.includes("stooq.com/q/d/l/")) return new Response(stooqCsv, { status: 200 })
      return new Response("?", { status: 404 })
    }) as typeof fetch
    const out = await fetchRealPanel()
    expect(out.ok).toBe(true)
    expect(out.panel?.meta.source).toBe("yahoo")
    expect(out.panel?.meta.notes.some((x) => x.includes("TLT, IEF") && x.includes("Stooq"))).toBe(true)
  })
})
