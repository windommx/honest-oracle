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
}

export interface BacktestResult {
  config: BacktestConfig
  trades: BacktestTrade[]
  equity: EquityPoint[]
  stats: BacktestStats
  exitBreakdown: ExitBreakdownRow[]
  topTrades: BacktestTrade[]
  worstTrades: BacktestTrade[]
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
    })
    positions.delete(pos.symbol)
  }

  for (let i = WARMUP; i < WEEKS; i++) {
    // ── 1. Manage exits ─────────────────────────────────────────────────
    for (const pos of Array.from(positions.values())) {
      const d = data.find((x) => x.symbol === pos.symbol)!
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
          const equityNow = cash + Array.from(positions.values()).reduce((a, p) => {
            const pd = data.find((x) => x.symbol === p.symbol)!
            return a + p.shares * priceOf(pd, i)
          }, 0)
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
          })
        }
      }
    }

    // ── 3. Record equity ────────────────────────────────────────────────
    let invested = 0
    for (const p of Array.from(positions.values())) {
      const pd = data.find((x) => x.symbol === p.symbol)!
      invested += p.shares * priceOf(pd, i)
    }
    const value = cash + invested
    if (value > peak) peak = value
    const dd = ((value - peak) / peak) * 100
    if (dd < maxDd) maxDd = dd
    equity.push({ t: dates[i], value: Math.round(value), drawdown: r2(dd), positions: positions.size })
  }

  // Close remaining at end
  const lastIdx = WEEKS - 1
  for (const pos of Array.from(positions.values())) {
    const d = data.find((x) => x.symbol === pos.symbol)!
    closePosition(pos, d, lastIdx, 'End of Test')
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

  return {
    config: cfg,
    trades,
    equity,
    stats: {
      initialCapital: cfg.capital,
      finalValue,
      totalReturnPct: r2((finalValue / cfg.capital - 1) * 100),
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
    },
    exitBreakdown,
    topTrades: sorted.slice(0, 5),
    worstTrades: sorted.slice(-5).reverse(),
  }
}

function r2(x: number): number {
  return Math.round(x * 100) / 100
}
