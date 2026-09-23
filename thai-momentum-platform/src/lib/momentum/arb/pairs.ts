// ============================================================
// Engine 1: Pairs Stat-Arb — รันได้ทันทีจาก RawDaily ที่มีอยู่
//
// - คัดคู่ same-sector ด้วย correlation pre-filter → Engle-Granger β (OLS)
//   → ทดสอบ mean-reversion ของ spread ด้วย OU half-life (3..40 วัน)
//   (ต้อง hl อยู่ในกรอบ: สั้นเกิน = noise, ยาวเกิน = เงินจม)
// - สัญญาณ: ENTER |z|>2, TAKE |z|<0.5, TIME_EXIT > 2×hl, STOP |z|>3.5
// - Backtest: dollar-neutral spread trade ต้นทุน 4 ขา (เปิด 2 + ปิด 2)
// ============================================================

import type { Row } from "@/lib/momentum/signals/engine"

export const mean = (a: number[]): number => a.reduce((s, b) => s + b, 0) / (a.length || 1)
export const std = (a: number[]): number => {
  const m = mean(a)
  return Math.sqrt(a.reduce((s, b) => s + (b - m) ** 2, 0) / (a.length || 1))
}

const ols = (x: number[], y: number[]): { b: number; a: number } => {
  const mx = mean(x)
  const my = mean(y)
  const b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (x.reduce((s, v) => s + (v - mx) ** 2, 0) || 1e-12)
  return { b, a: my - b * mx }
}

export interface PairStats {
  meanRev: boolean
  hl: number // half-life (วันทำการ)
  mu: number
  sd: number
}

/** ครึ่งชีวิตของ spread (OU process) — ตัวกรองคู่ที่ "worth trade" จริง */
export function pairStats(spread: number[]): PairStats {
  const x = spread.slice(0, -1)
  const y = spread.slice(1).map((v, i) => v - x[i])
  const { b, a } = ols(x, y)
  const sd = std(spread)
  if (!(b < 0 && b > -1)) return { meanRev: false, hl: Infinity, mu: NaN, sd }
  const theta = Math.log1p(b) // ln(1+b) < 0
  // จุดสมดุล: Δs = a + b·s → s* = −a/b (= AR(1) รูป a/(1−c) เมื่อ c = 1+b)
  const mu = -a / b
  return { meanRev: true, hl: -Math.log(2) / theta, mu, sd }
}

export type PairAction = "ENTER" | "HOLD" | "TAKE" | "TIME_EXIT" | "STOP"

export const pairSignal = (z: number, hl: number, held: number): PairAction =>
  Math.abs(z) > 3.5 ? "STOP" : Math.abs(z) < 0.5 ? "TAKE" : held > 2 * hl ? "TIME_EXIT" : Math.abs(z) > 2 ? "ENTER" : "HOLD"

/** คัดคู่: cointegration ต้องผ่านทั้ง train และ validation (กัน data mining) */
export function cointOK(logA: number[], logB: number[], beta: number): PairStats | null {
  const spread = logA.map((v, i) => v - beta * logB[i])
  const s = pairStats(spread)
  return s.meanRev && s.hl >= 3 && s.hl <= 40 ? s : null
}

export function olsBeta(logA: number[], logB: number[]): number {
  return ols(logB, logA).b // logA = β·logB + ε
}

// ---------- scanner ----------

export interface ScanOptions {
  lookback?: number // ใช้ข้อมูลย้อนหลังกี่วันในการ fit (default 250)
  corrMin?: number // pre-filter correlation ขั้นต่ำ
  maxTest?: number // จำนวนคู่ (บวกสุด) ที่ปล่อยเข้าสู่ขั้น cointegration test
  maxOut?: number // จำนวนคู่ที่คืนผล
  minAvgVal?: number // ขาต้องมีสภาพคล่องเฉลี่ย (บาท/วัน) เกินค่านี้
}

export interface ScanResult {
  scanned: number
  tested: number
  pairs: {
    a: string
    b: string
    sector: string
    corr: number
    beta: number
    hl: number
    z: number
    mu: number
    sd: number
    action: "ENTER" | "HOLD" | "TAKE" | "TIME_EXIT" | "STOP" | "SKIP"
    logA: number[]
    logB: number[]
  }[]
}

export function scanPairs(
  rows: Row[],
  sectorOf: (s: string) => string,
  opts: ScanOptions = {}
): ScanResult {
  const lookback = opts.lookback ?? 250
  const corrMin = opts.corrMin ?? 0.45
  const maxTest = opts.maxTest ?? 60
  const maxOut = opts.maxOut ?? 15
  const minAvgVal = opts.minAvgVal ?? 1_000_000

  // จัดข้อมูลต่อสัญลักษณ์
  const bySym = new Map<string, { dates: string[]; close: number[]; val: number[] }>()
  for (const r of rows) {
    const o = bySym.get(r.symbol) ?? { dates: [], close: [], val: [] }
    o.dates.push(r.date)
    o.close.push(r.close)
    o.val.push(r.val)
    bySym.set(r.symbol, o)
  }
  // วันทำการล่าสุดของตลาด — ขาที่ไม่มีราคาวันนี้ (พักการซื้อขาย/เลิกเทรด) ให้ z ของ "วันนี้" ไม่ได้
  let lastDate = ""
  for (const o of bySym.values()) {
    const d = o.dates[o.dates.length - 1]
    if (d > lastDate) lastDate = d
  }
  // จำกัดหน้าต่าง lookback + กรองสภาพคล่อง + จำนวนจุดขั้นต่ำ
  const cands: { sym: string; sector: string; logc: number[]; dates: string[]; retMap: Map<string, number> }[] = []
  for (const [sym, o] of bySym) {
    const n0 = o.dates.length
    if (n0 < lookback + 30) continue
    if (o.dates[n0 - 1] !== lastDate) continue
    const start = n0 - lookback - 1
    const recentVal = o.val.slice(-60)
    const avgVal = recentVal.reduce((a, b) => a + b, 0) / (recentVal.length || 1)
    if (avgVal < minAvgVal) continue
    const logc = o.close.slice(start).map((v) => Math.log(v))
    const dates = o.dates.slice(start)
    const retMap = new Map<string, number>()
    for (let i = 1; i < logc.length; i++) retMap.set(dates[i], logc[i] - logc[i - 1])
    cands.push({ sym, sector: sectorOf(sym), logc, dates, retMap })
  }

  // จัดกลุ่ม sector → คู่ภายใน sector เท่านั้น (same-sector + economic link)
  const bySector = new Map<string, typeof cands>()
  for (const c of cands) {
    const a = bySector.get(c.sector) ?? []
    a.push(c)
    bySector.set(c.sector, a)
  }

  // corr pre-filter รายคู่
  const candidates: { a: (typeof cands)[0]; b: (typeof cands)[0]; corr: number }[] = []
  for (const [, list] of bySector) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i]
        const B = list[j]
        const xs: number[] = []
        const ys: number[] = []
        const [src, dst] = A.retMap.size <= B.retMap.size ? [A, B] : [B, A]
        for (const [d, v] of src.retMap) {
          const w = dst.retMap.get(d)
          if (w !== undefined) {
            xs.push(v)
            ys.push(w)
          }
        }
        if (xs.length < lookback * 0.7) continue
        const mx = mean(xs)
        const my = mean(ys)
        const cov = xs.reduce((s, v, k) => s + (v - mx) * (ys[k] - my), 0)
        const den = Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0)) * Math.sqrt(ys.reduce((s, v) => s + (v - my) ** 2, 0))
        const corr = den > 0 ? cov / den : NaN
        if (Number.isFinite(corr) && corr >= corrMin) candidates.push({ a: A, b: B, corr })
      }
  }

  candidates.sort((x, y) => y.corr - x.corr)
  const tested = candidates.slice(0, maxTest)

  const out: ScanResult["pairs"] = []
  for (const c of tested) {
    // จับคู่ราคาตาม "วันที่เดียวกัน" — เดิมจับตามลำดับแถว ทำให้ขาที่มีวันพักการซื้อขาย
    // เลื่อนวันกันทั้งชุด (spread/β/half-life/z ผิดหมด)
    const posB = new Map(c.b.dates.map((d, i) => [d, i]))
    const A: number[] = []
    const B: number[] = []
    c.a.dates.forEach((d, i) => {
      const j = posB.get(d)
      if (j === undefined) return
      A.push(c.a.logc[i])
      B.push(c.b.logc[j])
    })
    const n = A.length
    if (n < 120) continue
    const beta = olsBeta(A, B)
    const stats = cointOK(A, B, beta)
    if (!stats) continue
    const spread = A.map((v, i) => v - beta * B[i])
    const z = (spread[spread.length - 1] - stats.mu) / (stats.sd || 1e-9)
    const flat: PairAction = Math.abs(z) > 3.5 ? "STOP" : Math.abs(z) > 2 ? "ENTER" : "HOLD"
    out.push({
      a: c.a.sym,
      b: c.b.sym,
      sector: c.a.sector,
      corr: c.corr,
      beta,
      hl: stats.hl,
      z,
      mu: stats.mu,
      sd: stats.sd,
      action: flat,
      logA: A,
      logB: B,
    })
  }
  out.sort((x, y) => Math.abs(y.z) - Math.abs(x.z))
  return { scanned: candidates.length, tested: out.length, pairs: out.slice(0, maxOut) }
}

// ---------- backtest (dollar-neutral spread, ต้นทุน 4 ขา) ----------

export interface PairBacktestResult {
  trades: number
  winRate: number
  avgGross: number // % ต่อรอบ
  avgNet: number // % ต่อรอบ หลังต้นทุน
  totalNet: number // % สะสม (ผลรวมของ net ต่อรอบ)
}

export function backtestPair(
  spread: number[],
  hl: number,
  opts: { zWindow?: number; zIn?: number; zExit?: number; zStop?: number; costPerLegBps?: number } = {}
): PairBacktestResult {
  const w = opts.zWindow ?? 60
  const zIn = opts.zIn ?? 2
  const zExit = opts.zExit ?? 0.5
  const zStop = opts.zStop ?? 3.5
  const costLeg = (opts.costPerLegBps ?? 55) / 10000

  const rets: number[] = []
  if (!isFinite(hl) || hl <= 0 || spread.length < w + 10) {
    return { trades: 0, winRate: 0, avgGross: 0, avgNet: 0, totalNet: 0 }
  }
  let dir = 0
  let entry = 0
  let held = 0
  for (let t = w; t < spread.length; t++) {
    const win = spread.slice(t - w, t)
    const mu = mean(win)
    const sd = std(win) || 1e-9
    const z = (spread[t] - mu) / sd
    if (dir !== 0) {
      held++
      const exitNow =
        (dir === -1 && z < zExit) || // short spread กลับเข้าใกล้ 0 → ปิดกำไร
        (dir === 1 && z > -zExit) ||
        held > 2 * hl ||
        Math.abs(z) > zStop
      if (exitNow) {
        // dir=+1 long spread: กำไรเมื่อ spread ขึ้น (exit > entry)
        // dir=−1 short spread: กำไรเมื่อ spread ลง (exit < entry) → P&L = dir·(exit−entry)
        const gross = dir * (spread[t] - entry) * 100 // log-spread diff ≈ % dollar-neutral
        rets.push(gross - 4 * costLeg * 100)
        dir = 0
      }
    } else if (Math.abs(z) > zIn && Math.abs(z) <= zStop) {
      dir = z > 0 ? -1 : 1 // spread สูงเกิน → short spread (short A long B)
      entry = spread[t]
      held = 0
    }
  }
  if (rets.length === 0) return { trades: 0, winRate: 0, avgGross: 0, avgNet: 0, totalNet: 0 }
  const grossRets = rets.map((r) => r + 4 * costLeg * 100)
  return {
    trades: rets.length,
    winRate: rets.filter((r) => r > 0).length / rets.length,
    avgGross: mean(grossRets),
    avgNet: mean(rets),
    totalNet: rets.reduce((a, b) => a + b, 0),
  }
}

// ---------- cache สำหรับ jev/run (กันสแกนซ้ำทุก request) ----------
let _cache: { key: string; res: ScanResult } | null = null

export function getCachedScan(
  key: string,
  rows: Row[],
  sectorOf: (s: string) => string
): ScanResult {
  if (_cache?.key === key) return _cache.res
  const res = scanPairs(rows, sectorOf)
  _cache = { key, res }
  return res
}
