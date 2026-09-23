/// <reference types="bun-types" />
// bun test — Signals v2 ส่วนที่ pure (engine / crossZ / thai calendar+snapback)
// ไม่แตะ DB/เครือข่าย: io.ts ถูก import เฉพาะ buildCrossZ (PrismaClient ไม่ต่อ DB จนกว่าจะ query)
import { describe, expect, it } from "bun:test"

import { buildPanel, crossIC, spearman, summarize, timingCorr, type Row, type SnapRow } from "./engine"
import { buildCrossZ, CROSS_MAX_STALE_DAYS, type CrossAssetRow } from "./io"
import { calendarMult, snapback } from "./thai"

const W = { mom: 0.45, mfd: 0.25, sec: 0.2, vol: 0.1 }
const day = (i: number): string => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)

describe("spearman (average rank, paired sample)", () => {
  it("ranks only the pairs finite on both sides — a NaN in one array must not shift the other's ranks", () => {
    expect(spearman([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, NaN, 6, 7, 8, 9, 10])).toBeCloseTo(1, 12)
  })
  it("ties get their average rank (no tie-break by input/alphabetical order)", () => {
    const tied = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    const asc = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // ค่า Spearman มาตรฐาน (fractional ranking) = ±0.8704 — rank ตามลำดับเดิมเคยได้ ±1.0
    expect(spearman(tied, asc)).toBeCloseTo(0.8704, 4)
    expect(spearman(tied, [...asc].reverse())).toBeCloseTo(-0.8704, 4)
  })
  it("fewer than 8 usable pairs → NaN", () => {
    expect(Number.isNaN(spearman([1, 2, 3, 4, 5, 6, 7], [7, 6, 5, 4, 3, 2, 1]))).toBe(true)
  })
})

describe("summarize", () => {
  it("n < 2 or zero dispersion → ICIR/t = 0 (not IC/1e-9)", () => {
    expect(summarize([0.3])).toEqual({ meanIC: 0.3, ICIR: 0, t: 0, n: 1, hit: 1 })
    expect(summarize([0.1, 0.1]).ICIR).toBe(0)
    expect(summarize([])).toEqual({ meanIC: 0, ICIR: 0, t: 0, n: 0, hit: 0 })
  })
  it("normal case unchanged: ICIR = mean/std (population), t = ICIR·√n", () => {
    const s = summarize([0.1, 0.3, NaN])
    expect(s.n).toBe(2)
    expect(s.meanIC).toBeCloseTo(0.2, 12)
    expect(s.ICIR).toBeCloseTo(2, 12)
    expect(s.t).toBeCloseTo(2 * Math.SQRT2, 12)
  })
})

describe("buildPanel — real-data robustness", () => {
  const N = 60
  const dates = Array.from({ length: N }, (_, i) => day(i))

  it("val = 0 (no traded value in the import) → no flow information: MFD neutral, nobody blocked", () => {
    const syms = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ"]
    const rows: Row[] = []
    // AAA แรงสุด … JJJ อ่อนสุด (priceRank เรียงตามตัวอักษรพอดี — เดิม flowRank ก็เรียงตามตัวอักษรเพราะเสมอกันหมด)
    syms.forEach((s, k) =>
      dates.forEach((d, i) => rows.push({ date: d, symbol: s, close: 10 * Math.exp((4.5 - k) * 0.002 * i), val: 0, liq5: 0 }))
    )
    const snap: SnapRow[] = syms.map((s) => ({ date: dates[N - 1], symbol: s, timeframe: 5, rank: 1 }))
    const today = buildPanel(rows, snap, () => "X", new Map(), W).byDateStock.get(dates[N - 1])!
    expect(today).toHaveLength(10)
    for (const s of today) {
      expect(s.mfd).toBe(0)
      expect(s.flowRank).toBe(0.5)
    }
  })

  it("breadth counts only symbols that already have the MA (an IPO is neither above nor below MA20)", () => {
    const rows: Row[] = []
    dates.forEach((d, i) => rows.push({ date: d, symbol: "OLD", close: 10 + i * 0.1, val: 1e6, liq5: 1 }))
    dates.slice(N - 10).forEach((d, i) => rows.push({ date: d, symbol: "IPO", close: 5 + i * 0.1, val: 1e6, liq5: 1 }))
    const last = buildPanel(rows, [], () => "X", new Map(), W).market.at(-1)!
    expect(last.b20).toBe(1)
    expect(last.b50).toBe(1)
    expect(last.b200).toBeNaN() // ยังไม่มีหุ้นไหนมี MA200 → วัดไม่ได้ (NaN → null ใน JSON) ไม่ใช่ 0% ปลอม
  })

  it("warm-up breadth ที่วัดไม่ได้ไม่ปน z-score: breadthZ/regimeScore เป็นตัวเลขจริงทุกวัน และช่วงแรก thrust = NaN", () => {
    const rows: Row[] = []
    ;["A", "B", "C"].forEach((s, k) =>
      dates.forEach((d, i) => rows.push({ date: d, symbol: s, close: 10 + Math.sin(i / (3 + k)) + i * 0.01, val: 1e6, liq5: 1 }))
    )
    const market = buildPanel(rows, [], () => "X", new Map(), W).market
    expect(market[0].b20).toBeNaN() // วันแรกยังไม่มี MA20 ของใคร
    expect(market[0].thrust).toBeNaN()
    for (const m of market) {
      expect(Number.isFinite(m.breadthZ)).toBe(true)
      expect(Number.isFinite(m.regimeScore)).toBe(true)
      expect(Number.isFinite(m.grossMult)).toBe(true)
    }
    expect(Number.isFinite(market.at(-1)!.b20)).toBe(true)
  })

  it("percentiles need ≥ 20 points: a fresh IPO is vol-neutral (0.5), not top-vol (1.0)", () => {
    const rows: Row[] = []
    ;["A", "B", "C", "D", "E"].forEach((s, k) =>
      dates.forEach((d, i) => rows.push({ date: d, symbol: s, close: 10 + Math.sin(i * (k + 1)), val: 1e6, liq5: 1 }))
    )
    dates.slice(N - 21).forEach((d, i) => rows.push({ date: d, symbol: "NEW", close: 10 + 0.0001 * i, val: 1e6, liq5: 1 }))
    const snap: SnapRow[] = ["A", "B", "C", "D", "E", "NEW"].map((s) => ({ date: dates[N - 1], symbol: s, timeframe: 5, rank: 1 }))
    const p = buildPanel(rows, snap, () => "X", new Map(), W)
    expect(p.byDateStock.get(dates[N - 1])!.find((s) => s.symbol === "NEW")!.symVolPct).toBe(0.5)
    expect(p.market[19].volPct).toBe(0.5)
    expect(p.market[20].volPct).toBe(0.5)
  })

  it("short history (< 60 days): sector rotation does not rank sectors by size when Δshare is unknown", () => {
    const sizes: Record<string, number> = { BIG: 50e6, MID: 20e6, SMALL: 5e6, TINY: 1e6 }
    const rows: Row[] = []
    for (const [sec, v] of Object.entries(sizes))
      for (let k = 0; k < 3; k++)
        for (let i = 0; i < 40; i++) rows.push({ date: day(i), symbol: `${sec}${k}`, close: 10 * (1 + 0.003 * i), val: v, liq5: 1 })
    const p = buildPanel(rows, [], (s) => s.replace(/\d+$/, ""), new Map(), W)
    expect(p.sectors).toHaveLength(4)
    for (const s of p.sectors) expect(s.rotZ).toBe(0) // เดิม BIG +0.64 … TINY −0.37 (อันดับตามขนาด)
    expect(new Set(p.sectors.map((s) => s.rank)).size).toBe(1)
  })

  it("empty input → empty panel (no throw)", () => {
    const p = buildPanel([], [], () => "X", new Map(), W)
    expect(p.dates).toEqual([])
    expect(p.market).toEqual([])
    expect(p.sectors).toEqual([])
  })
})

describe("crossIC / timingCorr forward alignment", () => {
  // 10 หุ้น, ติดโผเฉพาะวันที่ 30 · forward 5 วันทำการของ S_k = +k% · S9 พักการซื้อขายวันที่ 31–36
  // แล้วกลับมาที่ครึ่งราคา → ไม่มีราคาวันที่ 35 = ไม่มี forward return (เดิมไปหยิบราคาวันที่ 41 = −50%)
  const M = 60
  const dates = Array.from({ length: M }, (_, i) => day(i))
  const rows: Row[] = []
  for (let k = 0; k < 10; k++)
    dates.forEach((d, t) => {
      if (k === 9 && t >= 31 && t <= 36) return
      const close = k === 9 && t >= 37 ? 50 : t >= 35 ? 100 + k : 100
      rows.push({ date: d, symbol: "S" + k, close, val: 1e6, liq5: 1 })
    })
  const snap: SnapRow[] = Array.from({ length: 10 }, (_, k) => ({ date: dates[30], symbol: "S" + k, timeframe: 5, rank: k + 1 }))
  const panel = buildPanel(rows, snap, () => "X", new Map(), W)
  const bySymbolNo = (s: { symbol: string }) => Number(s.symbol.slice(1))

  it("uses the close hold trading days ahead on the market calendar (suspended at d+hold → dropped)", () => {
    const r = crossIC(panel, bySymbolNo, 5, rows)
    expect(r.n).toBe(1)
    expect(r.meanIC).toBeCloseTo(1, 12) // เดิม 0.4545
  })

  it("hold ≤ 0 / non-finite → no forward returns (no backward 'IC')", () => {
    expect(crossIC(panel, bySymbolNo, 0, rows).n).toBe(0)
    expect(crossIC(panel, bySymbolNo, -5, rows).n).toBe(0)
    expect(crossIC(panel, bySymbolNo, Number.NaN, rows).n).toBe(0)
  })

  it("timingCorr: n counts only dates that have forward returns; < 8 points → corr NaN", () => {
    const t = timingCorr(panel, (m) => m.b20, 5, rows)
    expect(t.n).toBe(M - 5)
    const few = buildPanel(rows.filter((r) => r.date <= dates[9]), [], () => "X", new Map(), W)
    expect(Number.isNaN(timingCorr(few, (m) => m.b20, 5, rows).corr)).toBe(true)
  })
})

describe("buildCrossZ — as-of alignment onto the SET calendar", () => {
  const M = 300
  const mk = (skipSpx: (i: number) => boolean = () => false): CrossAssetRow[] => {
    const ca: CrossAssetRow[] = []
    for (let i = 0; i < M; i++) {
      const d = day(i)
      if (!skipSpx(i)) ca.push({ date: d, asset: "SPX", close: 1000 * Math.exp(0.002 * i + 0.02 * Math.sin(i / 7)) })
      ca.push({ date: d, asset: "USDTHB", close: 34 * Math.exp(0.01 * Math.sin(i / 5)) })
      ca.push({ date: d, asset: "GOLD", close: 2000 * Math.exp(0.01 * Math.cos(i / 9)) })
    }
    return ca
  }
  const setDates = Array.from({ length: M }, (_, i) => day(i))

  it("uses only asset closes dated strictly before the SET date (no same-day look-ahead)", () => {
    const base = buildCrossZ(mk(), setDates)
    // แก้/ลบแถว asset ของวันที่ d ต้องไม่กระทบ crossZ(d)
    const tampered = mk().map((r) => (r.date === day(250) ? { ...r, close: r.close * 3 } : r))
    expect(buildCrossZ(tampered, setDates).get(day(250))).toBe(base.get(day(250)))
    expect(buildCrossZ(tampered, setDates).get(day(251))).not.toBe(base.get(day(251)))
  })

  it("an asset holiday (SPX row missing on a SET day) keeps the SPX term via the last known z", () => {
    const full = buildCrossZ(mk(), setDates)
    const hol = buildCrossZ(mk((i) => i === 280), setDates)
    // วันหยุด SPX = 280: crossZ(280) ใช้ z ก่อนวันนั้น (279) ทุก asset → เท่ากับกรณีข้อมูลครบพอดี
    // (เดิม crossZ ของวันหยุดขาดพจน์ 0.45·z(SPX) ทั้งก้อน → กระโดดทุกวันหยุดสหรัฐฯ)
    expect(hol.get(day(280))).toBe(full.get(day(280)))
    // วันถัดไป (281): พจน์ SPX ใช้ z ล่าสุดที่มี (279) ต่อ — เทียบด้วย SPX อย่างเดียวให้เห็นชัด
    const spx = (ca: CrossAssetRow[]) => buildCrossZ(ca.filter((r) => r.asset === "SPX"), setDates)
    expect(spx(mk((i) => i === 280)).get(day(281))).toBe(spx(mk()).get(day(280)))
  })

  it("stale beyond CROSS_MAX_STALE_DAYS → no contribution; empty table → empty map", () => {
    const ca = mk().filter((r) => r.date <= day(200))
    const z = buildCrossZ(ca, setDates)
    expect(z.has(day(200 + CROSS_MAX_STALE_DAYS))).toBe(true)
    expect(z.has(day(201 + CROSS_MAX_STALE_DAYS))).toBe(false)
    expect(buildCrossZ([], setDates).size).toBe(0)
  })

  it("non-positive closes never produce NaN/Infinity", () => {
    const ca = mk().map((r, i) => (r.asset === "SPX" && i % 17 === 0 ? { ...r, close: 0 } : r))
    for (const v of buildCrossZ(ca, setDates).values()) expect(Number.isFinite(v)).toBe(true)
  })
})

describe("calendarMult", () => {
  const sept = ["01", "02", "03", "04", "07", "08", "09", "10", "11", "14", "15", "16", "17", "18"].map((d) => `2026-09-${d}`)

  it("the latest date of the data is not automatically month-end (mid-month → 1.0)", () => {
    expect(calendarMult(sept, sept.length - 1, "neutral")).toBe(1.0)
  })
  it("latest date inside the last 3 weekdays of the month → 1.15; 4th-last → 1.0", () => {
    expect(calendarMult([...sept, "2026-09-28"], sept.length, "risk_on")).toBe(1.15) // เหลือ 29, 30
    expect(calendarMult([...sept, "2026-09-25"], sept.length, "risk_on")).toBe(1.0) // เหลือ 28, 29, 30
  })
  it("data starting mid-month: its first rows are not the month's first trading days", () => {
    expect(calendarMult(sept.slice(9), 0, "neutral")).toBe(1.0)
    expect(calendarMult(sept, 0, "neutral")).toBe(1.15) // 2026-09-01 = วันทำการแรกจริง
  })
  it("month boundary inside the data unchanged; January and risk_off rules unchanged", () => {
    const d = ["2026-08-27", "2026-08-28", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"]
    expect(calendarMult(d, 2, "neutral")).toBe(1.15) // วันทำการสุดท้ายของ ส.ค.
    expect(calendarMult(d, 6, "neutral")).toBe(1.0) // วันทำการที่ 4 ของ ก.ย. (ยังมีข้อมูลต่อ)
    expect(calendarMult(["2027-01-12", "2027-01-13", "2027-01-14"], 1, "neutral")).toBe(1.15)
    expect(calendarMult([...sept, "2026-09-28"], sept.length, "risk_off")).toBe(1.0)
  })
  it("does not depend on the server time zone (pure UTC date math)", () => {
    // ไฟล์นี้ถูกรันซ้ำภายใต้ TZ=UTC / Asia/Bangkok / America/Los_Angeles — ผลต้องเท่ากัน
    expect(calendarMult(["2026-10-26", "2026-10-27", "2026-10-28"], 2, "neutral")).toBe(1.15) // เหลือ 29, 30
    expect(calendarMult(["2026-10-26", "2026-10-27"], 1, "neutral")).toBe(1.0) // เหลือ 28, 29, 30
  })
})

describe("snapback", () => {
  it("NaN inputs never pass the gate", () => {
    expect(snapback({ zRet5: NaN, turnoverPct: NaN, mfd: NaN, liq: true })).toBeNull()
    expect(snapback({ zRet5: -3, turnoverPct: 0.7, mfd: NaN, liq: true })).toBeNull()
  })
  it("valid inputs keep the documented rule", () => {
    const s = snapback({ zRet5: -3, turnoverPct: 0.6, mfd: -0.2, liq: true })
    expect(s?.action).toBe("buy")
    expect(s?.conf).toBeCloseTo(0.79, 12)
    expect(snapback({ zRet5: -2.4, turnoverPct: 0.9, mfd: -0.5, liq: true })).toBeNull()
    expect(snapback({ zRet5: -3, turnoverPct: 0.9, mfd: -0.5, liq: false })).toBeNull()
  })
})
