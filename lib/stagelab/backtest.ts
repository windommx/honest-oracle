// ─── Stage Analysis Backtester (in-app port of the Python framework) ────────
// Runs the Weinstein Stage 2 strategy over deterministic synthetic weekly
// series for the whole stock universe. Pure functions — no I/O.

import { genSeries, setIndexCloses } from './market-sim'

export interface BacktestConfig {
  capital: number
  riskPct: number // risk per trade, % of equity
  maxPositions: number
  commissionPct: number // per side
  requireVolume: boolean
  requireRs: boolean
  marketFilter: boolean // only enter when SET index stage == 2
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  capital: 1_000_000,
  riskPct: 1,
  maxPositions: 8,
  commissionPct: 0.25,
  requireVolume: true,
  requireRs: true,
  marketFilter: false,
}

export interface BacktestTrade {
  symbol: string
  sector: string
  entryDate: string
  exitDate: string
  entryPrice: number
  exitPrice: number
  shares: number
  pnl: number
  pnlPct: number
  holdWeeks: number
  exitReason: 'Stage Exit' | 'Stop Loss' | 'Trailing Stop' | 'End of Test'
  /** Bar index the trade closed on — used to assign it to a period. */
  exitIdx: number
}

export interface EquityPoint {
  t: string
  value: number
  drawdown: number
  positions: number
}

export interface ExitBreakdownRow {
  reason: string
  count: number
  totalPnl: number
  avgPct: number
}

export interface BacktestStats {
  initialCapital: number
  finalValue: number
  totalReturnPct: number
  cagrPct: number
  maxDdPct: number
  winRatePct: number
  profitFactor: number
  avgWinPct: number
  avgLossPct: number
  avgHoldWeeks: number
  totalTrades: number
  bestPct: number
  worstPct: number
  /** Annualised return per unit of DOWNSIDE deviation. Sharpe punishes upside
   *  volatility, which no one has ever complained about. */
  sortino: number
  /** CAGR per unit of worst drawdown — return measured against the pain. */
  calmar: number
  /** Share of weeks holding at least one position. A strategy that returns 8%
   *  while invested a third of the time is not the same as one that returns 8%
   *  fully invested, and the equity curve alone will not tell you which. */
  exposurePct: number
  /** Average % outcome per trade, wins and losses together. */
  expectancyPct: number
  /** Longest run of consecutive weeks below a prior equity peak. */
  longestDdWeeks: number
  /** Weeks from the deepest trough back to that peak; null if never recovered. */
  recoveryWeeks: number | null
}

/** Stats for one slice of the test window. */
export interface PeriodStats {
  label: string
  fromDate: string
  toDate: string
  weeks: number
  startValue: number
  endValue: number
  returnPct: number
  cagrPct: number
  maxDdPct: number
  trades: number
  winRatePct: number
  profitFactor: number
}

/** Buy-and-hold the index over the same window, same capital, same costs. */
export interface Benchmark {
  label: string
  finalValue: number
  totalReturnPct: number
  cagrPct: number
  maxDdPct: number
  equity: number[]
  /** Strategy return minus benchmark return, in points. */
  excessReturnPct: number
}

export type RobustnessVerdict = 'consistent' | 'degraded' | 'reversed' | 'insufficient'

/**
 * A plain reading of the in-sample / out-of-sample gap.
 *
 * The strategy rules are fixed, but the knobs above them are not — and a user
 * who turns seven dials until the number goes up has fitted the config to the
 * series whether they meant to or not. Splitting the window is the cheapest
 * honest check there is, so the result carries it whether it flatters the run
 * or not.
 */
export interface Robustness {
  verdict: RobustnessVerdict
  /** Out-of-sample CAGR minus in-sample CAGR, in points. */
  cagrGapPct: number
  note: string
}

export interface BacktestResult {
  config: BacktestConfig
  trades: BacktestTrade[]
  equity: EquityPoint[]
  stats: BacktestStats
  exitBreakdown: ExitBreakdownRow[]
  topTrades: BacktestTrade[]
  worstTrades: BacktestTrade[]
  benchmark: Benchmark
  splits: { inSample: PeriodStats; outOfSample: PeriodStats }
  robustness: Robustness
}

interface OpenPos {
  symbol: string
  sector: string
  shares: number
  entryPrice: number
  entryDate: string
  stop: number
  highest: number
  entryIdx: number
  /**
   * The symbol's series, carried on the position itself.
   *
   * This used to be a linear scan of the universe by symbol, run four times
   * per open position per week. At 61 symbols, 8 positions and 252 active
   * weeks that is roughly half a million string comparisons spent re-finding
   * something the caller already had in hand.
   */
  d: SymbolData
}

interface SymbolData {
  symbol: string
  sector: string
  bars: ReturnType<typeof genSeries>['bars']
  // Pre-extracted arrays for speed
  c: number[]
  h: number[]
  vol: number[]
  volAvg10: number[]
  stage: number[]
  rs: number[]
  atr10: number[]
  hh10: number[] // highest high of prior 10 bars
}

function buildData(symbol: string, sector: string): SymbolData {
  const { bars } = genSeries(symbol)
  const n = bars.length
  const c = bars.map((b) => b.c)
  const h = bars.map((b) => b.h)
  const vol = bars.map((b) => b.v)
  const stage = bars.map((b) => b.stage)
  const rs = bars.map((b) => b.rs)
  const volAvg10: number[] = new Array(n).fill(0)
  const atr10: number[] = new Array(n).fill(0)
  const hh10: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    if (i >= 11) {
      let vs = 0
      let trs = 0
      let hh = 0
      for (let j = i - 10; j < i; j++) {
        vs += vol[j]
        const tr = Math.max(
          bars[j].h - bars[j].l,
          Math.abs(bars[j].h - bars[j - 1].c),
          Math.abs(bars[j].l - bars[j - 1].c),
        )
        trs += tr
        hh = Math.max(hh, bars[j].h)
      }
      volAvg10[i] = vs / 10
      atr10[i] = trs / 10
      hh10[i] = hh
    }
  }
  return { symbol, sector, bars, c, h, vol, volAvg10, stage, rs, atr10, hh10 }
}

function indexStages(weeks: number): number[] {
  const idx = setIndexCloses(weeks)
  const stages: number[] = []
  const ma: number[] = []
  for (let i = 0; i < weeks; i++) {
    const win = idx.slice(Math.max(0, i - 29), i + 1)
    ma.push(win.reduce((a, b) => a + b, 0) / win.length)
  }
  for (let i = 0; i < weeks; i++) {
    if (i < 35) {
      stages.push(1)
      continue
    }
    const slope = (ma[i] - ma[i - 5]) / ma[i - 5]
    if (idx[i] > ma[i] && slope > 0.005) stages.push(2)
    else if (idx[i] < ma[i] && slope < -0.005) stages.push(4)
    else if (idx[i] > ma[i]) stages.push(3)
    else stages.push(1)
  }
  return stages
}

// ─── Risk analytics ──────────────────────────────────────────────────────────

/** Compound growth rate from a start/end pair over a number of years. */
function cagrOf(start: number, end: number, years: number): number {
  if (years <= 0 || start <= 0 || end <= 0) return 0
  return (Math.pow(end / start, 1 / years) - 1) * 100
}

/**
 * Sortino, annualised from weekly returns.
 *
 * Sharpe divides by total volatility, which counts a +12% week as risk. For a
 * trend strategy — whose whole design is to have a few very large up weeks —
 * that systematically understates the result. Sortino divides by downside
 * deviation only, which is the thing a customer actually minds.
 */
function sortinoOf(weekly: number[]): number {
  if (weekly.length < 2) return 0
  const mean = weekly.reduce((a, b) => a + b, 0) / weekly.length
  let downSq = 0
  let downN = 0
  for (const r of weekly) {
    if (r < 0) {
      downSq += r * r
      downN++
    }
  }
  if (downN === 0) return mean > 0 ? 99 : 0
  const downDev = Math.sqrt(downSq / downN)
  if (downDev === 0) return 0
  return (mean / downDev) * Math.sqrt(52)
}

/**
 * Longest stretch under water, and how long the deepest hole took to climb out
 * of. A 40% drawdown that recovers in eight weeks and one that takes three
 * years are the same number on a stats card and completely different to live
 * through.
 */
function drawdownDuration(values: number[]): { longest: number; recovery: number | null } {
  let peak = values[0] ?? 0
  let peakIdx = 0
  let longest = 0
  let runStart = -1
  let deepest = 0
  let deepestPeakIdx = 0
  let deepestTroughIdx = 0

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v >= peak) {
      if (runStart >= 0) longest = Math.max(longest, i - runStart)
      peak = v
      peakIdx = i
      runStart = -1
      continue
    }
    if (runStart < 0) runStart = peakIdx
    const dd = (v - peak) / peak
    if (dd < deepest) {
      deepest = dd
      deepestPeakIdx = peakIdx
      deepestTroughIdx = i
    }
  }
  if (runStart >= 0) longest = Math.max(longest, values.length - runStart)

  // Recovery: first bar after the trough that regains the pre-drawdown peak.
  let recovery: number | null = null
  if (deepest < 0) {
    const target = values[deepestPeakIdx]
    for (let i = deepestTroughIdx; i < values.length; i++) {
      if (values[i] >= target) {
        recovery = i - deepestTroughIdx
        break
      }
    }
  }
  return { longest, recovery }
}

/** Max drawdown (negative %) of a raw value series. */
function maxDrawdownOf(values: number[]): number {
  let peak = values[0] ?? 0
  let worst = 0
  for (const v of values) {
    if (v > peak) peak = v
    if (peak > 0) worst = Math.min(worst, ((v - peak) / peak) * 100)
  }
  return worst
}

function periodStats(
  label: string,
  values: number[],
  dates: string[],
  periodTrades: BacktestTrade[],
): PeriodStats {
  const start = values[0] ?? 0
  const end = values[values.length - 1] ?? start
  const weeks = values.length
  const wins = periodTrades.filter((t) => t.pnl > 0)
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0)
  const grossLoss = Math.abs(
    periodTrades.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0),
  )
  return {
    label,
    fromDate: dates[0] ?? '',
    toDate: dates[dates.length - 1] ?? '',
    weeks,
    startValue: Math.round(start),
    endValue: Math.round(end),
    returnPct: start > 0 ? r2((end / start - 1) * 100) : 0,
    cagrPct: r2(cagrOf(start, end, weeks / 52)),
    maxDdPct: r2(maxDrawdownOf(values)),
    trades: periodTrades.length,
    winRatePct: periodTrades.length ? r2((wins.length / periodTrades.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? r2(grossWin / grossLoss) : grossWin > 0 ? 99 : 0,
  }
}

/**
 * Buy and hold the index over the same window.
 *
 * A backtest with no benchmark answers "did this make money", which in a rising
 * market is close to meaningless. The question worth asking is whether all the
 * screening, sizing and stop discipline beat doing nothing — and often enough
 * it does not, which the customer is entitled to see.
 */
function buildBenchmark(
  cfg: BacktestConfig,
  warmup: number,
  weeks: number,
  strategyReturnPct: number,
): Benchmark {
  const closes = setIndexCloses(weeks)
  const entry = closes[warmup]
  const commission = cfg.commissionPct / 100
  // Same costs as the strategy: one round trip on the whole book.
  const invested = cfg.capital * (1 - commission)
  const units = entry > 0 ? invested / entry : 0

  const equity: number[] = []
  for (let i = warmup; i < weeks; i++) equity.push(Math.round(units * closes[i]))
  const finalValue = Math.round((equity[equity.length - 1] ?? cfg.capital) * (1 - commission))
  const years = (weeks - warmup) / 52

  const totalReturnPct = r2((finalValue / cfg.capital - 1) * 100)
  return {
    label: 'ซื้อดัชนีแล้วถือ',
    finalValue,
    totalReturnPct,
    cagrPct: r2(cagrOf(cfg.capital, finalValue, years)),
    maxDdPct: r2(maxDrawdownOf(equity)),
    equity,
    excessReturnPct: r2(strategyReturnPct - totalReturnPct),
  }
}

/** Read the in-sample / out-of-sample gap without softening it. */
function assessRobustness(inSample: PeriodStats, outOfSample: PeriodStats): Robustness {
  const gap = r2(outOfSample.cagrPct - inSample.cagrPct)

  if (inSample.trades < 10 || outOfSample.trades < 10) {
    return {
      verdict: 'insufficient',
      cagrGapPct: gap,
      note: `เทรดน้อยเกินไปในบางช่วง (${inSample.trades} / ${outOfSample.trades} ไม้) — ยังสรุปเรื่องความทนทานไม่ได้ ต้องมีอย่างน้อยช่วงละ 10 ไม้`,
    }
  }
  if (outOfSample.cagrPct < 0 && inSample.cagrPct > 0) {
    return {
      verdict: 'reversed',
      cagrGapPct: gap,
      note: 'ช่วงแรกกำไร ช่วงหลังขาดทุน — เป็นลายเซ็นของการปรับค่าจนเข้ากับข้อมูลชุดที่ใช้ทดสอบ อย่าเชื่อผลรวม',
    }
  }
  if (gap < -5) {
    return {
      verdict: 'degraded',
      cagrGapPct: gap,
      note: `ผลช่วงหลังแย่กว่าช่วงแรก ${Math.abs(gap).toFixed(1)} จุด — ค่าที่ตั้งไว้อาจเข้ากับช่วงแรกมากเป็นพิเศษ ลองผ่อนค่าที่ปรับละเอียดที่สุดลง`,
    }
  }
  return {
    verdict: 'consistent',
    cagrGapPct: gap,
    note: 'ผลสองช่วงใกล้เคียงกัน — ยังไม่เห็นสัญญาณว่าค่าที่ตั้งไว้เข้ากับข้อมูลชุดนี้เป็นพิเศษ',
  }
}

export function runBacktest(
  universe: { symbol: string; sector: string }[],
  cfg: BacktestConfig,
): BacktestResult {
  const WEEKS = 312
  const WARMUP = 60 // skip first 60 weeks
  const data = universe.map((u) => buildData(u.symbol, u.sector))
  const idxStages = indexStages(WEEKS)
  const dates = data[0]?.bars.map((b) => b.t) ?? []

  let cash = cfg.capital
  let peak = cfg.capital
  let maxDd = 0
  let exposedWeeks = 0
  const positions = new Map<string, OpenPos>()
  const trades: BacktestTrade[] = []
  const equity: EquityPoint[] = []

  const commission = cfg.commissionPct / 100

  const priceOf = (d: SymbolData, i: number) => d.c[i]

  const closePosition = (
    pos: OpenPos,
    d: SymbolData,
    i: number,
    reason: BacktestTrade['exitReason'],
  ) => {
    const exitPrice = priceOf(d, i)
    const proceeds = pos.shares * exitPrice
    const cost = proceeds * commission
    const pnl = (exitPrice - pos.entryPrice) * pos.shares - cost
    cash += proceeds - cost
    trades.push({
      symbol: pos.symbol,
      sector: pos.sector,
      entryDate: pos.entryDate,
      exitDate: dates[i],
      entryPrice: r2(pos.entryPrice),
      exitPrice: r2(exitPrice),
      shares: pos.shares,
      pnl: Math.round(pnl),
      pnlPct: r2((exitPrice / pos.entryPrice - 1) * 100),
      holdWeeks: i - pos.entryIdx,
      exitReason: reason,
      exitIdx: i,
    })
    positions.delete(pos.symbol)
  }

  for (let i = WARMUP; i < WEEKS; i++) {
    // ── 1. Manage exits ─────────────────────────────────────────────────
    for (const pos of Array.from(positions.values())) {
      const d = pos.d
      const px = priceOf(d, i)
      if (px <= 0) continue

      // update highest
      if (px > pos.highest) pos.highest = px

      // Stage exit: was Stage 2, no longer
      if (d.stage[i - 1] === 2 && d.stage[i] !== 2) {
        closePosition(pos, d, i, 'Stage Exit')
        continue
      }
      // Stop loss
      if (px <= pos.stop) {
        closePosition(pos, d, i, 'Stop Loss')
        continue
      }
      // Trailing stop when profit > 20%
      if (px > pos.entryPrice * 1.2) {
        const trail = pos.highest * 0.9
        if (px <= trail) {
          closePosition(pos, d, i, 'Trailing Stop')
          continue
        }
      }
      // Tighten stop under rising MA while in Stage 2 (optional system rule)
      if (d.stage[i] === 2 && d.bars[i].ma30 > pos.stop) {
        pos.stop = Math.max(pos.stop, d.bars[i].ma30 * 0.97)
      }
    }

    // ── 2. Look for entries ─────────────────────────────────────────────
    if (positions.size < cfg.maxPositions) {
      const mktOk = !cfg.marketFilter || idxStages[i] === 2
      if (mktOk) {
        for (const d of data) {
          if (positions.size >= cfg.maxPositions) break
          if (positions.has(d.symbol)) continue
          if (i < 40) continue
          // Breakout entry: fresh Stage 2 + price over prior 10w high + confirmations
          const freshStage2 = d.stage[i] === 2 && d.stage[i - 1] !== 2
          const px = priceOf(d, i)
          if (!freshStage2 || px <= 0) continue
          const priceOk = px > d.hh10[i]
          if (!priceOk) continue
          const volOk = !cfg.requireVolume || d.vol[i] > d.volAvg10[i] * 1.5
          const rsOk = !cfg.requireRs || d.rs[i] > 0
          if (!volOk || !rsOk) continue

          const stopDist = d.atr10[i] * 2
          if (stopDist <= 0) continue
          const equityNow =
            cash +
            Array.from(positions.values()).reduce((a, p) => a + p.shares * priceOf(p.d, i), 0)
          const riskAmount = equityNow * (cfg.riskPct / 100)
          const shares = Math.floor(riskAmount / stopDist)
          if (shares <= 0) continue
          const cost = shares * px * (1 + commission)
          if (cost > cash) continue

          cash -= cost
          positions.set(d.symbol, {
            symbol: d.symbol,
            sector: d.sector,
            shares,
            entryPrice: px,
            entryDate: dates[i],
            stop: px - stopDist,
            highest: px,
            entryIdx: i,
            d,
          })
        }
      }
    }

    // ── 3. Record equity ────────────────────────────────────────────────
    let invested = 0
    for (const p of Array.from(positions.values())) invested += p.shares * priceOf(p.d, i)
    if (positions.size > 0) exposedWeeks++
    const value = cash + invested
    if (value > peak) peak = value
    const dd = ((value - peak) / peak) * 100
    if (dd < maxDd) maxDd = dd
    equity.push({ t: dates[i], value: Math.round(value), drawdown: r2(dd), positions: positions.size })
  }

  // Close remaining at end
  const lastIdx = WEEKS - 1
  for (const pos of Array.from(positions.values())) {
    closePosition(pos, pos.d, lastIdx, 'End of Test')
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  const finalValue = equity.length ? equity[equity.length - 1].value : cfg.capital
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
  const years = (WEEKS - WARMUP) / 52
  const cagr = years > 0 && finalValue > 0 ? (Math.pow(finalValue / cfg.capital, 1 / years) - 1) * 100 : 0

  const exitReasons = ['Stage Exit', 'Stop Loss', 'Trailing Stop', 'End of Test']
  const exitBreakdown: ExitBreakdownRow[] = exitReasons
    .map((reason) => {
      const rows = trades.filter((t) => t.exitReason === reason)
      return {
        reason,
        count: rows.length,
        totalPnl: rows.reduce((a, t) => a + t.pnl, 0),
        avgPct: rows.length ? r2(rows.reduce((a, t) => a + t.pnlPct, 0) / rows.length) : 0,
      }
    })
    .filter((r) => r.count > 0)

  const sorted = [...trades].sort((a, b) => b.pnlPct - a.pnlPct)

  // ── Risk, measured on the weekly equity series ────────────────────────
  const values = equity.map((e) => e.value)
  const weeklyReturns: number[] = []
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) weeklyReturns.push((values[i] - values[i - 1]) / values[i - 1])
  }
  const { longest: longestDdWeeks, recovery: recoveryWeeks } = drawdownDuration(values)
  const activeWeeks = WEEKS - WARMUP
  const expectancyPct = trades.length
    ? trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length
    : 0

  // ── In-sample / out-of-sample split ───────────────────────────────────
  // 70/30 by time. The split point is fixed rather than configurable on
  // purpose: a movable boundary is one more knob to tune until the answer
  // is the one you wanted.
  const splitOffset = Math.floor(values.length * 0.7)
  const splitIdx = WARMUP + splitOffset
  const periodDates = equity.map((e) => e.t)
  const inSample = periodStats(
    'ช่วงแรก (70%)',
    values.slice(0, splitOffset),
    periodDates.slice(0, splitOffset),
    trades.filter((t) => t.exitIdx < splitIdx),
  )
  const outOfSample = periodStats(
    'ช่วงหลัง (30%)',
    values.slice(splitOffset),
    periodDates.slice(splitOffset),
    trades.filter((t) => t.exitIdx >= splitIdx),
  )

  const totalReturnPct = r2((finalValue / cfg.capital - 1) * 100)
  const benchmark = buildBenchmark(cfg, WARMUP, WEEKS, totalReturnPct)

  return {
    config: cfg,
    trades,
    equity,
    benchmark,
    splits: { inSample, outOfSample },
    robustness: assessRobustness(inSample, outOfSample),
    stats: {
      initialCapital: cfg.capital,
      finalValue,
      totalReturnPct,
      cagrPct: r2(cagr),
      maxDdPct: r2(maxDd),
      winRatePct: r2(winRate),
      profitFactor: r2(profitFactor),
      avgWinPct: wins.length ? r2(wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length) : 0,
      avgLossPct: losses.length ? r2(losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length) : 0,
      avgHoldWeeks: trades.length ? r2(trades.reduce((a, t) => a + t.holdWeeks, 0) / trades.length) : 0,
      totalTrades: trades.length,
      bestPct: sorted.length ? sorted[0].pnlPct : 0,
      worstPct: sorted.length ? sorted[sorted.length - 1].pnlPct : 0,
      sortino: r2(sortinoOf(weeklyReturns)),
      calmar: maxDd < 0 ? r2(cagr / Math.abs(maxDd)) : 0,
      exposurePct: activeWeeks > 0 ? r2((exposedWeeks / activeWeeks) * 100) : 0,
      expectancyPct: r2(expectancyPct),
      longestDdWeeks,
      recoveryWeeks,
    },
    exitBreakdown,
    topTrades: sorted.slice(0, 5),
    worstTrades: sorted.slice(-5).reverse(),
  }
}

function r2(x: number): number {
  return Math.round(x * 100) / 100
}
