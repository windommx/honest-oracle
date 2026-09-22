// ============================================================
// Backtest engine (lib กลาง) — ใช้ทั้งโดย /api/backtest และ Profit Engine
// - runBacktest(params, signals) : T+1 fill, stop/time exit, cost+slippage สองขา
// - buildMomentumSignals(k)      : หุ้นที่ติดโผ >= k timeframes พร้อมกัน
// - buildNaiveSignals(topN)      : naive baseline = Top-N โดย ret20 (กรองสภาพคล่องเดียวกัน)
// - valuePivot()                 : matrix มูลค่าซื้อขาย (cache เหมือน closePivot)
// ============================================================

import { db } from "@/lib/db"
import { MIN_VALUE, closePivot, snapshotMembers, type Pivot } from "./core"
import type { BacktestParams, BacktestStats, EquityPoint, TradeRow } from "./contracts"

const r2 = (x: number) => Math.round(x * 100) / 100
const r3 = (x: number) => Math.round(x * 1000) / 1000
const r4 = (x: number) => Math.round(x * 10000) / 10000

// ---------------- value pivot (cached) ----------------

export interface ValPivot {
  dates: string[]
  symbols: string[]
  val: number[][] // dates × symbols (NaN = ไม่มีข้อมูล)
}

let _valCache: { key: string; val: ValPivot } | null = null

export async function valuePivot(): Promise<ValPivot> {
  const [count, last] = await Promise.all([
    db.rawDaily.count(),
    db.rawDaily.aggregate({ _max: { date: true } }),
  ])
  const key = `${count}:${last._max.date ?? ""}`
  if (_valCache && _valCache.key === key) return _valCache.val

  const rows = await db.rawDaily.findMany({
    orderBy: [{ date: "asc" }, { symbol: "asc" }],
    select: { date: true, symbol: true, val: true },
  })
  const dates: string[] = []
  const symbols: string[] = []
  const dateIdx = new Map<string, number>()
  const symIdx = new Map<string, number>()
  for (const r of rows) {
    if (!dateIdx.has(r.date)) {
      dateIdx.set(r.date, dates.length)
      dates.push(r.date)
    }
    if (!symIdx.has(r.symbol)) {
      symIdx.set(r.symbol, symbols.length)
      symbols.push(r.symbol)
    }
  }
  const val: number[][] = Array.from({ length: dates.length }, () =>
    new Array<number>(symbols.length).fill(NaN)
  )
  for (const r of rows) val[dateIdx.get(r.date) as number][symIdx.get(r.symbol) as number] = r.val

  const vp: ValPivot = { dates, symbols, val }
  _valCache = { key, val: vp }
  return vp
}

// ---------------- signal builders ----------------

// สัญญาณกลยุทธ์: หุ้นที่ติด top-30 ใน >= k timeframes พร้อมกัน (ต่อวัน)
export async function buildMomentumSignals(k: number): Promise<Map<string, Set<string>>> {
  const { tfByDate } = await snapshotMembers()
  const signals = new Map<string, Set<string>>()
  for (const [date, tfMap] of tfByDate) {
    const cnt = new Map<string, number>()
    for (const set of tfMap.values()) {
      for (const sym of set) cnt.set(sym, (cnt.get(sym) ?? 0) + 1)
    }
    const sig = new Set<string>()
    for (const [sym, c] of cnt) if (c >= k) sig.add(sym)
    signals.set(date, sig)
  }
  return signals
}

// Naive baseline: Top-N โดย ret20 รายวัน ในหุ้นที่มูลค่าซื้อขาย > 1 ล้านบาท 5 วันติด
export async function buildNaiveSignals(topN: number): Promise<Map<string, Set<string>>> {
  const [pivot, vp] = await Promise.all([closePivot(), valuePivot()])
  const { dates, symbols, px } = pivot
  const signals = new Map<string, Set<string>>()
  for (let i = 20; i < dates.length; i++) {
    const cands: { s: number; ret: number }[] = []
    for (let s = 0; s < symbols.length; s++) {
      const now = px[i][s]
      const ref = px[i - 20][s]
      if (!isFinite(now) || !isFinite(ref) || ref <= 0) continue
      // สภาพคล่อง: val > 1M ติดกัน 5 วัน (เงื่อนไขเดียวกับ pipeline หลัก)
      let liquid = true
      for (let j = i - 4; j <= i; j++) {
        const v = vp.val[j]?.[s]
        if (!(v > MIN_VALUE)) {
          liquid = false
          break
        }
      }
      if (!liquid) continue
      cands.push({ s, ret: now / ref - 1 })
    }
    cands.sort((a, b) => b.ret - a.ret)
    signals.set(
      dates[i],
      new Set(cands.slice(0, topN).map((c) => symbols[c.s]))
    )
  }
  return signals
}

// ---------------- backtest core ----------------

interface PosState {
  s: number // symbol index ใน pivot
  ei: number // entry date index
  entry: number
  stop: number
  prev: number
}

export interface BacktestFull {
  params: BacktestParams
  equity: EquityPoint[]
  stats: BacktestStats
  trades: TradeRow[]
  dailyRet: number[] // ผลตอบแทนรายวันเต็มชุด (สำหรับงานวิจัย — ไม่ได้ส่งให้ UI)
  nDates: number
}

export async function runBacktest(
  params: BacktestParams,
  signalsByDate: Map<string, Set<string>>
): Promise<BacktestFull> {
  const pivot: Pivot = await closePivot()
  const { dates, symbols, px, symIdx } = pivot
  const N = dates.length
  const { k, hold, stopPct, maxPos, costBps, slipBps } = params
  // ต้นทุนต่อขา = commission + slippage (round trip = 2×(cost+slip))
  const cost = (costBps + slipBps) / 1e4

  const EMPTY: Set<string> = new Set()
  const pos = new Map<string, PosState>()
  let pending: Set<string> = EMPTY
  const equity: number[] = [1]
  const bench: number[] = [1]
  const trades: TradeRow[] = []
  let exposureSum = 0

  for (let i = 1; i < N; i++) {
    // (1) ซื้อ pending (สัญญาณจากวันก่อน) ที่ราคาปิดวันนี้ — T+1 fill กัน look-ahead
    let nEntries = 0
    if (pending.size > 0) {
      for (const sym of pending) {
        if (pos.size >= maxPos) break
        if (pos.has(sym)) continue
        const s = symIdx.get(sym)
        if (s === undefined) continue
        const pxi = px[i][s]
        if (!isFinite(pxi) || pxi <= 0) continue
        pos.set(sym, { s, ei: i, entry: pxi, stop: pxi * (1 - stopPct), prev: pxi })
        nEntries++
      }
      pending = EMPTY
    }

    // (2) mark-to-market
    let dayR = 0
    for (const p of pos.values()) {
      const pxn = px[i][p.s]
      if (!isFinite(pxn)) continue
      dayR += (pxn / p.prev - 1) / maxPos
    }

    // (3) exits (stop/time)
    const exits: { sym: string; p: PosState; pxn: number; retPct: number; reason: "stop" | "time" }[] = []
    for (const [sym, p] of pos) {
      const pxn = px[i][p.s]
      if (!isFinite(pxn)) continue
      if (pxn <= p.stop) {
        exits.push({ sym, p, pxn, retPct: (pxn / p.entry - 1 - 2 * cost) * 100, reason: "stop" })
      } else if (i - p.ei >= hold) {
        exits.push({ sym, p, pxn, retPct: (pxn / p.entry - 1 - 2 * cost) * 100, reason: "time" })
      }
    }
    for (const e of exits) {
      pos.delete(e.sym)
      trades.push({
        symbol: e.sym,
        entryDate: dates[e.p.ei],
        exitDate: dates[i],
        entryPx: e.p.entry,
        exitPx: e.pxn,
        ret: r2(e.retPct),
        reason: e.reason,
      })
    }

    // (3b) หักต้นทุนธุรกรรมจาก equity จริง (entry + exit ต่างกัน cost × 1 ครั้ง)
    dayR -= (cost * (nEntries + exits.length)) / maxPos

    // (4) survivors อัปเดตราคาอ้างอิง
    for (const p of pos.values()) {
      const pxn = px[i][p.s]
      if (isFinite(pxn)) p.prev = pxn
    }

    // (5) exposure
    exposureSum += pos.size / maxPos

    // (6) สัญญาณวันนี้ → รอซื้อวันถัดไป
    const sig = signalsByDate.get(dates[i])
    pending = sig && sig.size > 0 ? sig : EMPTY

    // (7) equity
    equity.push(equity[equity.length - 1] * (1 + dayR))

    // benchmark equal-weight รายวัน
    const rowPrev = px[i - 1]
    const rowNow = px[i]
    let rb = 0
    let nb = 0
    for (let s = 0; s < symbols.length; s++) {
      const a = rowPrev[s]
      const b = rowNow[s]
      if (isFinite(a) && isFinite(b) && a > 0) {
        rb += b / a - 1
        nb++
      }
    }
    bench.push(bench[bench.length - 1] * (1 + (nb > 0 ? rb / nb : 0)))
  }

  const b0 = bench[0]
  if (b0 !== 1) for (let i = 0; i < bench.length; i++) bench[i] /= b0

  // ---- stats ----
  const nTrades = trades.length
  let wins = 0
  let stops = 0
  let retSum = 0
  for (const t of trades) {
    if (t.ret > 0) wins++
    if (t.reason === "stop") stops++
    retSum += t.ret
  }
  const lastEq = equity[equity.length - 1]
  const totalRet = lastEq - 1
  const cagr = lastEq > 0 ? Math.pow(lastEq, 252 / N) - 1 : -1

  let cummax = equity[0]
  let maxDD = 0
  for (const eq of equity) {
    if (eq > cummax) cummax = eq
    const dd = eq / cummax - 1
    if (dd < maxDD) maxDD = dd
  }

  const dailyRet: number[] = []
  for (let i = 1; i < equity.length; i++) dailyRet.push(equity[i] / equity[i - 1] - 1)
  let mRet = 0
  for (const dr of dailyRet) mRet += dr
  mRet /= dailyRet.length
  let varRet = 0
  for (const dr of dailyRet) varRet += (dr - mRet) ** 2
  const sd = Math.sqrt(varRet / dailyRet.length)
  const sharpe = sd > 0 ? (mRet / sd) * Math.sqrt(252) : 0

  const lastBench = bench[bench.length - 1]
  const stats: BacktestStats = {
    trades: nTrades,
    winRate: r3(nTrades > 0 ? wins / nTrades : 0),
    avgRet: r2(nTrades > 0 ? retSum / nTrades : 0),
    stopShare: r3(nTrades > 0 ? stops / nTrades : 0),
    timeShare: r3(nTrades > 0 ? (nTrades - stops) / nTrades : 0),
    totalRet: r4(totalRet),
    cagr: r4(cagr),
    maxDD: r4(maxDD),
    sharpe: r2(sharpe),
    exposure: r3(exposureSum / (N - 1)),
    benchTotal: r4(lastBench - 1),
    benchCagr: r4(lastBench > 0 ? Math.pow(lastBench, 252 / N) - 1 : -1),
  }

  const step = Math.max(1, Math.ceil(N / 400))
  const eqPts: EquityPoint[] = []
  for (let i = 0; i < N; i += step) {
    eqPts.push({ date: dates[i], strategy: r4(equity[i]), benchmark: r4(bench[i]) })
  }
  if (eqPts.length === 0 || eqPts[eqPts.length - 1].date !== dates[N - 1]) {
    eqPts.push({ date: dates[N - 1], strategy: r4(lastEq), benchmark: r4(lastBench) })
  }

  return {
    params: { k, hold, stopPct, maxPos, costBps, slipBps },
    equity: eqPts,
    stats,
    trades: trades.slice(-200),
    dailyRet,
    nDates: N,
  }
}
