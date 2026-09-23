/// <reference types="bun-types" />
// bun test — SET Sniper: เอนจิน pure บนข้อมูลแบบของจริง (แท่งไม่มี OHLC, แท่งแบน, หุ้นหยุดพัก, DB ว่าง)
import { describe, expect, it } from "bun:test"

import { detectFvgs, detectSweeps, keyLevels } from "./structure"
import { buildValueProfile } from "./value"
import { flowProxy } from "./flow"
import { evaluateSymbol } from "./confluence"
import { sectorRotation } from "./rotation"
import { crossAssetLeadLag } from "./leadlag"
import { computeBreaker } from "./breaker"
import type { OhlcBar } from "./types"

// report.ts โหลด @/lib/db (ฟังก์ชันที่ทดสอบไม่ query DB)
// DATABASE_URL ชี้ DB ชั่วคราวจาก preload (src/test/setup.ts) อยู่แล้ว — ห้ามทับเอง (bun test แชร์ Prisma singleton ข้ามไฟล์)
const { marketSeries, marketNote, recentAvgVal } = await import("./report")

// ---------- helpers ----------
const day = (i: number): string => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)
const bar = (i: number, o: number, h: number, l: number, c: number, val = 1e8): OhlcBar => ({ date: day(i), open: o, high: h, low: l, close: c, val })
/** แถวที่ CSV/feed ไม่มี open/high/low — loader เติม 0 (เหมือน report.ts / funnel.ts) */
const noOhlc = (i: number, c: number, val = 1e8): OhlcBar => ({ date: day(i), open: 0, high: 0, low: 0, close: c, val })
const flat100 = (i: number): OhlcBar => bar(i, 100, 101, 99, 100)

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** เดินราคาสุ่ม (seed คงที่) — missingEvery: ทุก ๆ k แท่งไม่มี OHLC · แท่งสุดท้ายมี OHLC เสมอ */
function randomBars(n: number, seed: number, missingRate: number): OhlcBar[] {
  const rnd = lcg(seed)
  const out: OhlcBar[] = []
  let px = 50
  for (let i = 0; i < n; i++) {
    const o = px * (1 + (rnd() - 0.5) * 0.02)
    const c = o * (1 + (rnd() - 0.5) * 0.04)
    const h = Math.max(o, c) * (1 + rnd() * 0.01)
    const l = Math.min(o, c) * (1 - rnd() * 0.01)
    const val = 5e7 + rnd() * 5e8
    out.push(i < n - 1 && rnd() < missingRate ? noOhlc(i, c, val) : bar(i, o, h, l, c, val))
    px = c
  }
  return out
}

/** ทุก number ใน object ต้อง finite (NaN/Infinity → JSON null → UI toFixed พัง) */
function nonFiniteNumbers(o: unknown, path = ""): string[] {
  if (typeof o === "number") return Number.isFinite(o) ? [] : [path]
  if (Array.isArray(o)) return o.flatMap((v, i) => nonFiniteNumbers(v, `${path}[${i}]`))
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => nonFiniteNumbers(v, `${path}.${k}`))
  return []
}

// ---------- structure ----------
describe("detectFvgs — แท่งที่ไม่มี OHLC", () => {
  it("ไม่สร้าง FVG ผีที่ขอบล่าง 0 (เดิม sizePct = Infinity → JSON null → แท็บพังทั้งแอป)", () => {
    const bars = [...Array.from({ length: 10 }, (_, i) => flat100(i)), noOhlc(10, 100), flat100(11), bar(12, 103, 104, 102, 103.5), flat100(13)]
    const fvgs = detectFvgs(bars)
    expect(fvgs.every((f) => Number.isFinite(f.sizePct) && f.bottom > 0)).toBe(true)
    expect(fvgs.some((f) => f.from === day(10))).toBe(false)
  })

  it("แท่งไม่มี OHLC ที่ close อยู่เหนือโซน ไม่นับว่า mitigate (เดิม low=0 ทำให้ทุก FVG ถูก mitigate)", () => {
    const base = Array.from({ length: 10 }, (_, i) => flat100(i))
    // FVG ขาขึ้น: high แท่ง 10 = 101 · low แท่ง 12 = 103 → โซน 101–103
    const bars = [...base, flat100(10), bar(11, 101, 104, 100.5, 103.5), bar(12, 103.5, 106, 103, 105), noOhlc(13, 105), bar(14, 105, 106, 104, 105.5)]
    const fvg = detectFvgs(bars).find((f) => f.to === day(12))
    expect(fvg).toBeDefined()
    expect(fvg!.mitigated).toBe(false)
    // close ≤ top = แตะโซนแน่นอน (low ≤ close) → mitigate
    const touched = [...bars.slice(0, 13), noOhlc(13, 102.5), bar(14, 104, 106, 103.5, 105.5)]
    expect(detectFvgs(touched).find((f) => f.to === day(12))!.mitigated).toBe(true)
  })

  it("sizePct finite และ bottom > 0 เสมอ บนข้อมูลสุ่มที่ขาด OHLC ~10%", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const f of detectFvgs(randomBars(120, seed, 0.1), 60)) {
        expect(Number.isFinite(f.sizePct)).toBe(true)
        expect(f.bottom).toBeGreaterThan(0)
      }
    }
  })
})

describe("detectSweeps — แท่งที่ไม่มี OHLC", () => {
  // swing low ที่แท่ง 10 (low 95) แล้วแท่ง 20 ไม่มี OHLC แต่ close 100 > 95
  const bars = [
    ...Array.from({ length: 10 }, (_, i) => flat100(i)),
    bar(10, 99, 100, 95, 98),
    ...Array.from({ length: 9 }, (_, k) => flat100(11 + k)),
    noOhlc(20, 100),
    flat100(21),
  ]
  it("low ที่เติม 0 ไม่ใช่การแทงทะลุ (เดิมได้ bullish sweep ลึก 100%)", () => {
    const sweeps = detectSweeps(bars)
    expect(sweeps.some((s) => s.date === day(20))).toBe(false)
    expect(sweeps.every((s) => s.depthPct < 100 && Number.isFinite(s.valZ))).toBe(true)
  })
  it("sweep จริง (มี low ทะลุ swing แล้วปิดกลับ) ยังจับได้", () => {
    const real = [...bars.slice(0, 20), bar(20, 99, 100, 94, 99.5), flat100(21)]
    const s = detectSweeps(real).find((e) => e.date === day(20))
    expect(s?.side).toBe("bullish")
    expect(s?.pierced).toBe(95)
  })
})

describe("keyLevels", () => {
  it("Low 20 วันไม่หายเมื่อในหน้าต่างมีแท่งไม่มี OHLC (เดิม min = 0 ถูกกรองทิ้งทั้งระดับ)", () => {
    const bars = Array.from({ length: 30 }, (_, i) => (i === 20 ? noOhlc(i, 100) : flat100(i)))
    const l20 = keyLevels(bars).find((l) => l.kind === "L20")
    expect(l20?.price).toBe(99)
  })
  it("แท่งเมื่อวานไม่มี OHLC → ไม่มี PDH/PDL (ไม่ใช้ 0)", () => {
    const bars = [...Array.from({ length: 29 }, (_, i) => flat100(i)), noOhlc(29, 100), flat100(30)]
    const kinds = keyLevels(bars).map((l) => l.kind)
    expect(kinds).not.toContain("PDH")
    expect(kinds).not.toContain("PDL")
    expect(keyLevels(bars).every((l) => l.price > 0 && Number.isFinite(l.gapPct))).toBe(true)
  })
})

// ---------- value ----------
describe("buildValueProfile", () => {
  it("แท่งไม่มี OHLC ไม่ยืดโปรไฟล์ลงถึง 0 (เดิม POC/VA ยุบไปถังเดียวใกล้ 0–101 → closePos เพี้ยนเป็น above_va)", () => {
    const withHole = Array.from({ length: 40 }, (_, i) => (i === 30 ? noOhlc(i, 100) : flat100(i)))
    const complete = Array.from({ length: 40 }, (_, i) => flat100(i))
    const p = buildValueProfile(withHole)!
    const q = buildValueProfile(complete)!
    expect(p).not.toBeNull()
    expect(p.valLow).toBeGreaterThanOrEqual(99)
    expect(p.valHigh).toBeLessThanOrEqual(101)
    expect([...p.hvn, ...p.lvn].every((x) => x >= 99 && x <= 101)).toBe(true)
    // แท่งที่ขาด OHLC มีผลแค่น้ำหนักที่ราคาปิด — โครงโปรไฟล์ต้องเหมือนหน้าต่างที่ข้อมูลครบ
    expect(p.poc).toBeCloseTo(q.poc, 10)
    expect(p.valLow).toBeCloseTo(q.valLow, 10)
    expect(p.valHigh).toBeCloseTo(q.valHigh, 10)
    expect(p.closePos).toBe(q.closePos)
  })
  it("ราคาปิดอยู่ในถัง POC (VA ถังเดียว) = อยู่ใน Value Area (เดิมขอบ VA เป็นกึ่งกลางถัง → 'ใต้ VA' ขัดกับ 'ใกล้ POC')", () => {
    // 59 แท่งซื้อขาย 99.8–100.2 ปิด 100 + แท่งกว้าง 1 แท่ง (90–110) ให้ช่วงโปรไฟล์กว้าง
    const bars = Array.from({ length: 60 }, (_, i) => (i === 10 ? bar(i, 100, 110, 90, 100) : bar(i, 100, 100.2, 99.8, 100)))
    const p = buildValueProfile(bars)!
    expect(p.closePos).toBe("inside_va")
    expect(p.valLow).toBeLessThanOrEqual(p.poc)
    expect(p.valHigh).toBeGreaterThanOrEqual(p.poc)
    const row = evaluateSymbol({ symbol: "T", sector: "X", bars, hasOhlc: true })
    expect(row.value!.reasons[0]).toContain("ราคาใน Value Area")
    expect(row.value!.score).toBe(90) // ใน VA 55 + ใกล้ POC 20 + ใกล้ HVN 15
  })

  it("ช่วงราคาแบนทั้งหน้าต่าง (max = min) → null ไม่ throw", () => {
    const bars = Array.from({ length: 40 }, (_, i) => bar(i, 10, 10, 10, 10, 0))
    expect(buildValueProfile(bars)).toBeNull()
  })
})

// ---------- flow ----------
describe("flowProxy", () => {
  const quiet = Array.from({ length: 20 }, (_, i) => bar(i, 100, 101, 99, 100, 1e8))
  it("แท่งแบน (high = low เช่นติดซิลลิ่งทั้งวัน) ไม่ถูกตีเป็น absorption ฝั่งขาย", () => {
    const f = flowProxy([...quiet, bar(20, 130, 130, 130, 130, 5e8)])
    expect(f.valZ).toBeGreaterThanOrEqual(1)
    expect(f.absorptionSide).toBeNull()
    expect(f.absorptionScore).toBe(0)
    expect(f.closePosBar).toBe(0.5)
    expect(f.bodyPct).toBe(0)
  })
  it("แท่งล่าสุดไม่มี OHLC → ค่า finite และไม่มี absorption (เดิม bodyPct ~1e11)", () => {
    const f = flowProxy([...quiet, noOhlc(20, 100, 5e8)])
    expect(nonFiniteNumbers(f)).toEqual([])
    expect(f.bodyPct).toBe(0)
    expect(f.absorptionSide).toBeNull()
  })
  it("absorption ปกติยังทำงาน (effort สูง + body สั้น + ปิดใกล้ high)", () => {
    const f = flowProxy([...quiet, bar(20, 100.2, 101, 98, 100.6, 5e8)])
    expect(f.absorptionSide).toBe("buy")
    expect(f.absorptionScore).toBeGreaterThan(0)
  })
})

// ---------- confluence ----------
describe("evaluateSymbol บนข้อมูลแบบของจริง", () => {
  it("ทุกตัวเลขในแถวต้อง finite แม้ขาด OHLC ~10% (ไม่มี null หลุดไปจอ)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const row = evaluateSymbol({ symbol: "TEST", sector: "Banking", bars: randomBars(260, seed, 0.1), hasOhlc: true })
      expect(nonFiniteNumbers(row)).toEqual([])
      expect(row.fvgs.every((f) => f.bottom > 0)).toBe(true)
      expect(row.total).toBe(Math.round((row.location?.score ?? 0) * 0.4 + (row.value?.score ?? 0) * 0.3 + row.behavior.score * 0.3))
    }
  })
  it("แท่งล่าสุดไม่มี OHLC → Location/Value = null, verdict low, ไม่ throw", () => {
    const bars = [...randomBars(100, 7, 0), noOhlc(100, 50)]
    const row = evaluateSymbol({ symbol: "X", sector: "Energy", bars, hasOhlc: false })
    expect(row.location).toBeNull()
    expect(row.value).toBeNull()
    expect(row.verdict).toBe("low")
    expect(nonFiniteNumbers(row)).toEqual([])
  })
  it("หุ้น IPO ประวัติสั้น (12 แท่ง) → ไม่ throw", () => {
    const row = evaluateSymbol({ symbol: "IPO", sector: "ICT", bars: randomBars(12, 3, 0.1), hasOhlc: true })
    expect(row.ret20).toBeNull()
    expect(row.profile).toBeNull()
    expect(nonFiniteNumbers(row)).toEqual([])
  })
})

// ---------- rotation ----------
describe("sectorRotation", () => {
  const N = 100
  const mk = (symbol: string, days: number, px: (i: number) => number) =>
    Array.from({ length: days }, (_, i) => ({ date: day(i), symbol, close: px(i), val: 5e6, liq5: 1 }))
  const latest = day(N - 1)

  it("หุ้นที่หยุดซื้อขายก่อนวันล่าสุดไม่ถูกนับในภาพกลุ่มวันนี้ (เดิมใช้ ret20 ของหน้าต่างเก่า)", () => {
    const rows = [
      ...mk("AAA", N, () => 10),
      ...mk("BBB", N, () => 20),
      // หยุดซื้อขายตั้งแต่วันที่ 70 — 20 แท่งสุดท้ายของตัวเองวิ่ง +50%
      ...mk("STALE", 70, (i) => (i < 50 ? 30 : 30 * (1 + (0.5 * (i - 49)) / 20))),
      ...mk("CCC", N, () => 5),
      ...mk("DDD", N, () => 6),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol))
    const sec = (s: string) => (s === "CCC" || s === "DDD" ? "Energy" : "Banking")
    const bank = sectorRotation(rows, sec, latest).find((r) => r.sector === "Banking")!
    expect(bank.stocks).toBe(2)
    expect(bank.ret20).toBeCloseTo(0, 10)
  })

  it("ถัง Unknown / OTHER ไม่ถูกตั้งเป็นผู้นำกลุ่ม", () => {
    const rows = [
      ...mk("U1", N, (i) => 10 * (1 + i / 200)),
      ...mk("U2", N, (i) => 12 * (1 + i / 200)),
      ...mk("B1", N, () => 10),
      ...mk("B2", N, () => 11),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol))
    for (const bucket of ["Unknown", "OTHER"]) {
      const out = sectorRotation(rows, (s) => (s.startsWith("U") ? bucket : "Banking"), latest)
      expect(out[0].sector).toBe(bucket)
      expect(out[0].rankNow).toBe(1)
      expect(out.some((r) => r.leader)).toBe(false)
    }
    expect(sectorRotation(rows, (s) => (s.startsWith("U") ? "Energy" : "Banking"), latest)[0].leader).toBe(true)
  })

  it("ข้อมูลว่าง / สั้นกว่า 61 วัน → []", () => {
    expect(sectorRotation([], () => "Banking", "")).toEqual([])
    expect(sectorRotation(mk("A", 30, () => 1), () => "Banking", day(29))).toEqual([])
  })
})

// ---------- lead-lag ----------
describe("crossAssetLeadLag", () => {
  const cross = (y: number) => Array.from({ length: 150 }, (_, i) => ({ date: new Date(Date.UTC(y, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), asset: "SPX", close: 100 + Math.sin(i) * 3 + i * 0.1 }))
  const mkt = (y: number) => Array.from({ length: 150 }, (_, i) => ({ date: new Date(Date.UTC(y, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), ret: Math.cos(i) * 0.01 }))

  it("วันที่ของ asset ไม่ทับกับตลาดไทย → ไม่ออกแถว (เดิม r=0 ปลอม + โน้ต 'r=NaN')", () => {
    expect(crossAssetLeadLag(cross(2020), mkt(2025))).toEqual([])
  })
  it("วันที่ทับกัน → ตัวเลข finite และโน้ตไม่มี NaN", () => {
    const out = crossAssetLeadLag(cross(2025), mkt(2025))
    expect(out.length).toBe(1)
    expect(nonFiniteNumbers(out)).toEqual([])
    expect(out[0].note).not.toContain("NaN")
  })
  it("CrossAsset ว่าง → []", () => {
    expect(crossAssetLeadLag([], mkt(2025))).toEqual([])
  })
})

// ---------- breaker ----------
describe("computeBreaker", () => {
  const base = { latestDate: "2026-09-22", mkt1d: 0, mkt5d: 0, closedTrades: [], openPositions: 0, dqFlags: 0 }
  it("ไม่มีไม้ปิด → เมตริกไม้เป็น null ไม่ทริกเกอร์ ไม่พัง", () => {
    const b = computeBreaker(base)
    expect(b.level).toBe(0)
    expect(b.metrics.lastClosedPnlPct).toBeNull()
    expect(b.metrics.winRate10).toBeNull()
  })
  it("เกณฑ์ตามตาราง Protocol ในเอกสาร", () => {
    expect(computeBreaker({ ...base, mkt1d: -0.02 }).level).toBe(1)
    expect(computeBreaker({ ...base, mkt1d: -0.03 }).level).toBe(2)
    expect(computeBreaker({ ...base, mkt1d: -0.05 }).level).toBe(3)
    expect(computeBreaker({ ...base, closedTrades: [{ exitDate: "2026-09-22", ret: -1.5 }] }).level).toBe(1)
    expect(computeBreaker({ ...base, closedTrades: [{ exitDate: "2026-09-22", ret: -9.6 }] }).level).toBe(2)
    expect(computeBreaker({ ...base, dqFlags: 3 }).level).toBe(2)
    const losers = Array.from({ length: 8 }, (_, i) => ({ exitDate: `2026-09-${String(10 + i).padStart(2, "0")}`, ret: i < 5 ? -0.5 : 1 })).reverse()
    expect(computeBreaker({ ...base, closedTrades: losers }).metrics.winRate10).toBeCloseTo(3 / 8, 10)
    expect(computeBreaker({ ...base, closedTrades: losers }).level).toBe(1)
  })
})

// ---------- report helpers (ตลาด / breadth / watchlist) ----------
describe("marketSeries", () => {
  const rowsOf = (symbol: string, n: number, px: (i: number) => number, skip: number[] = [], val = 5e6) =>
    Array.from({ length: n }, (_, i) => i)
      .filter((i) => !skip.includes(i))
      .map((i) => ({ date: day(i), symbol, close: px(i), val }))

  it("ทุกหุ้นมีรู (หยุดพักคนละวัน) → ยังวัดตลาดได้จริง (เดิม 0% และ breadth 50% ตลอด)", () => {
    const rows = [...rowsOf("A", 25, (i) => 10 * 1.01 ** i, [7]), ...rowsOf("B", 25, (i) => 20 * 1.02 ** i, [12])]
    const m = marketSeries(rows)
    expect(m.dates.length).toBe(25)
    expect(m.ret1d).toBeCloseTo(0.015, 10)
    expect(m.breadth).toBe(1)
    // วันที่หุ้นกลับมาหลังหยุดพัก: วันก่อนหน้าไม่มีแถว → ไม่นับตัวนั้นในวันนั้น
    expect(m.mktRet[8]).toBeCloseTo(0.02, 10)
    expect(m.ret5d).toBeCloseTo(1.015 ** 5 - 1, 10)
  })

  it("DB ว่าง → ค่าสรุปเป็น null (ไม่เติม 0 / 0.5 ปลอม)", () => {
    const m = marketSeries([])
    expect(m).toMatchObject({ dates: [], ret1d: null, ret5d: null, breadth: null })
  })

  it("ข้อมูลสั้นกว่า 21 วัน → breadth null · มูลค่าต่ำกว่าเกณฑ์ทั้งหมด → ret1d null", () => {
    expect(marketSeries(rowsOf("A", 10, (i) => 10 + i)).breadth).toBeNull()
    expect(marketSeries(rowsOf("A", 30, (i) => 10 + i, [], 1000)).ret1d).toBeNull()
  })

  it("split ที่ไม่ได้ปรับราคา (วันเดียว > 35% เกินเพดาน SET) ไม่ดึงตลาดจน breaker ทริกเกอร์ปลอม", () => {
    // 20 ตัวราคานิ่ง + 1 ตัวร่วง 50% วันสุดท้าย (split 1:2) — เดิมจะเป็นตลาด −2.4% = Caution ปลอม
    const flat = Array.from({ length: 20 }, (_, k) => rowsOf(`S${k}`, 30, () => 10 + k))
    const split = rowsOf("SPLIT", 30, (i) => (i < 29 ? 40 : 20))
    const m = marketSeries([...flat.flat(), ...split])
    expect(m.ret1d).toBeCloseTo(0, 12)
    expect(computeBreaker({ latestDate: day(29), mkt1d: m.ret1d ?? 0, mkt5d: m.ret5d ?? 0, closedTrades: [], openPositions: 0, dqFlags: 0 }).level).toBe(0)
    // การขยับจริงภายในเพดาน (−30%) ยังนับ
    const crash = rowsOf("CRASH", 30, (i) => (i < 29 ? 40 : 28))
    expect(marketSeries([...flat.flat(), ...crash]).ret1d).toBeCloseTo(-0.3 / 21, 12)
  })

  it("ข้อมูลครบทุกวัน → เท่ากับค่าเฉลี่ยแบบเดิม", () => {
    const rows = [...rowsOf("A", 30, (i) => 10 + i), ...rowsOf("B", 30, (i) => 50 - i * 0.5)]
    const m = marketSeries(rows)
    expect(m.ret1d).toBeCloseTo((39 / 38 - 1 + 35.5 / 36 - 1) / 2, 12)
    expect(m.breadth).toBe(0.5)
  })
})

describe("marketNote", () => {
  it("DB ว่าง → บอกว่าไม่มีข้อมูล ไม่มี 'NaN%'", () => {
    const s = marketNote(null, null, 0)
    expect(s).not.toContain("NaN")
    expect(s).toContain("ยังไม่มีข้อมูลตลาด")
  })
  it("breadth วัดไม่ได้แต่มีข้อมูล → บอกว่าข้อมูลยังไม่พอ", () => {
    expect(marketNote(0.001, null, 10)).toContain("ยังไม่พอ")
  })
  it("ข้อความตามเกณฑ์เดิม", () => {
    expect(marketNote(-0.03, 0.9, 100)).toContain("ตลาดร่วง -3.0%")
    expect(marketNote(0, 0.7, 100)).toContain("Breadth 20 วัน 70%")
    expect(marketNote(0, 0.4, 100)).toContain("breadth 40%")
  })
})

describe("recentAvgVal", () => {
  it("หุ้นที่หยุดซื้อขายไปแล้ว → สภาพคล่อง 20 วันล่าสุด = 0 (เดิมใช้ 20 แถวสุดท้ายของตัวเอง)", () => {
    const v = new Float64Array(100).fill(NaN)
    for (let i = 0; i < 70; i++) v[i] = 3e9
    expect(recentAvgVal(v)).toBe(0)
  })
  it("วันที่หยุดพักนับเป็น 0 · ข้อมูลสั้นกว่า 20 วันหารด้วยจำนวนวันที่มี", () => {
    const v = new Float64Array(40).fill(2e6)
    v[39] = NaN
    expect(recentAvgVal(v)).toBeCloseTo((19 * 2e6) / 20, 6)
    expect(recentAvgVal(new Float64Array([4e6, 6e6]))).toBe(5e6)
  })
})
