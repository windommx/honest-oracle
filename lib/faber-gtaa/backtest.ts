// ╔══════════════════════════════════════════════════════════════════╗
// ║  FABER GTAA — backtest loop & statistics.                         ║
// ║                                                                    ║
// ║  Semantics (stated, because every backtester quietly picks them):  ║
// ║  · Signals use month-end t data; the position is held over month   ║
// ║    t+1. No look-ahead: the return earned in t+1 never feeds the    ║
// ║    weights that earn it.                                           ║
// ║  · Returns are total returns (dividend-adjusted closes).           ║
// ║  · Cash earns the cash ticker's return when its series exists,     ║
// ║    else 0% — reported, not hidden.                                 ║
// ║  · Cost = one-way costBps × traded notional (Σ|Δw|), charged the   ║
// ║    month the trade happens. Intra-month weight drift is ignored    ║
// ║    (equal-weight targets, monthly reset — the drift error is a     ║
// ║    second-order term and is called out in the research note).      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { computeSignals } from "./engine";
import type { GtaaConfig, Panel, SignalSnapshot } from "./types";

export interface BacktestStats {
  months: number;
  years: number;
  cagr: number;
  /** Annualised stdev of monthly returns. */
  vol: number;
  /** Annualised mean excess return over cash / vol of excess. */
  sharpe: number;
  /** Same numerator, downside deviation denominator. */
  sortino: number;
  maxDrawdown: number;
  /** Longest peak-to-recovery stretch, in months. */
  longestUnderwaterMonths: number;
  winRate: number;
  bestMonth: number;
  worstMonth: number;
  /** Mean invested (non-cash) weight across all held months. */
  avgExposure: number;
  /** Mean one-way traded notional per month (Σ|Δw|). */
  avgMonthlyTurnover: number;
  totalCostDrag: number;
}

export interface BacktestResult {
  /** Months over which returns were actually earned (post warm-up). */
  months: string[];
  /** Equity curve, starts at 1 the month before `months[0]`. */
  equity: number[];
  returns: number[];
  cashReturns: number[];
  snapshots: SignalSnapshot[];
  turnover: number[];
  stats: BacktestStats;
  yearly: { year: string; ret: number }[];
  drawdown: number[];
  warmupMonths: number;
}

function annualise(mean: number): number {
  return mean * 12;
}

export function computeStats(
  returns: number[],
  cashReturns: number[],
  equity: number[],
  extra: { avgExposure: number; avgMonthlyTurnover: number; totalCostDrag: number },
): BacktestStats {
  const n = returns.length;
  const years = n / 12;
  const last = equity[equity.length - 1];
  const cagr = n > 0 ? Math.pow(last, 1 / years) - 1 : 0;

  const mean = returns.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const varSum = returns.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  const sd = n > 1 ? Math.sqrt(varSum / (n - 1)) : 0;
  const vol = sd * Math.sqrt(12);

  const excess = returns.map((r, i) => r - (cashReturns[i] ?? 0));
  const meanEx = excess.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const varEx = excess.reduce((a, b) => a + (b - meanEx) * (b - meanEx), 0);
  const sdEx = n > 1 ? Math.sqrt(varEx / (n - 1)) : 0;
  const downside = excess.filter((r) => r < 0);
  const ddevSum = downside.reduce((a, b) => a + b * b, 0);
  const ddev = n > 0 ? Math.sqrt(ddevSum / n) : 0;

  const sharpe = sdEx > 0 ? annualise(meanEx) / (sdEx * Math.sqrt(12)) : 0;
  const sortino = ddev > 0 ? annualise(meanEx) / (ddev * Math.sqrt(12)) : 0;

  let peak = -Infinity;
  let maxDrawdown = 0;
  let underwater = 0;
  let longestUnderwaterMonths = 0;
  for (const v of equity) {
    if (v >= peak) {
      peak = v;
      underwater = 0;
    } else {
      underwater += 1;
      longestUnderwaterMonths = Math.max(longestUnderwaterMonths, underwater);
      maxDrawdown = Math.min(maxDrawdown, v / peak - 1);
    }
  }

  const wins = returns.filter((r) => r > 0).length;

  return {
    months: n,
    years,
    cagr,
    vol,
    sharpe,
    sortino,
    maxDrawdown,
    longestUnderwaterMonths,
    winRate: n > 0 ? wins / n : 0,
    bestMonth: n > 0 ? Math.max(...returns) : 0,
    worstMonth: n > 0 ? Math.min(...returns) : 0,
    ...extra,
  };
}

/** Warm-up before the first tradeable signal: the gate needs smaMonths values
 *  and the score needs max(lookbacks) past values at the SIGNAL month, and the
 *  first earned return lands one month later. */
export function warmupMonths(cfg: GtaaConfig): number {
  return Math.max(cfg.smaMonths, Math.max(...cfg.lookbacks) + 1);
}

export function runBacktest(panel: Panel, tickers: string[], cfg: GtaaConfig): BacktestResult {
  const warm = warmupMonths(cfg);
  const first = warm - 1; // earliest index with a full signal
  const months: string[] = [];
  const returns: number[] = [];
  const cashReturns: number[] = [];
  const snapshots: SignalSnapshot[] = [];
  const turnover: number[] = [];
  const equity: number[] = [1];

  const cash = panel.series[cfg.cashTicker];
  let prevWeights: Record<string, number> = {};
  let exposureSum = 0;
  let costSum = 0;

  for (let t = first; t < panel.months.length - 1; t++) {
    const snap = computeSignals(panel, tickers, t, cfg);
    snapshots.push(snap);

    // Return earned over month t+1 with the weights decided at t.
    const i = t + 1;
    let r = 0;
    for (const [ticker, w] of Object.entries(snap.weights)) {
      const s = panel.series[ticker];
      const a = s?.adj[t];
      const b = s?.adj[i];
      if (s && Number.isFinite(a) && Number.isFinite(b) && a > 0) r += w * (b / a - 1);
      // A selected asset with a missing next-month print contributes 0 —
      // equivalent to that slot sitting in 0%-cash for the month.
    }
    let cr = 0;
    if (cash && Number.isFinite(cash.adj[t]) && Number.isFinite(cash.adj[i]) && cash.adj[t] > 0) {
      cr = cash.adj[i] / cash.adj[t] - 1;
    }
    r += snap.cashWeight * cr;

    // One-way traded notional against last month's targets.
    const all = new Set([...Object.keys(prevWeights), ...Object.keys(snap.weights)]);
    let traded = 0;
    for (const ticker of Array.from(all)) {
      traded += Math.abs((snap.weights[ticker] ?? 0) - (prevWeights[ticker] ?? 0));
    }
    const cost = traded * (cfg.costBps / 10_000);
    r -= cost;
    costSum += cost;

    months.push(panel.months[i]);
    returns.push(r);
    cashReturns.push(cr);
    turnover.push(traded);
    equity.push(equity[equity.length - 1] * (1 + r));
    exposureSum += 1 - snap.cashWeight;
    prevWeights = snap.weights;
  }

  const n = returns.length;
  const stats = computeStats(returns, cashReturns, equity, {
    avgExposure: n > 0 ? exposureSum / n : 0,
    avgMonthlyTurnover: n > 0 ? turnover.reduce((a, b) => a + b, 0) / n : 0,
    totalCostDrag: costSum,
  });

  const yearlyMap = new Map<string, number>();
  months.forEach((m, i) => {
    const y = m.slice(0, 4);
    yearlyMap.set(y, (yearlyMap.get(y) ?? 1) * (1 + returns[i]));
  });
  const yearly = Array.from(yearlyMap.entries()).map(([year, g]) => ({ year, ret: g - 1 }));

  let peak = -Infinity;
  const drawdown = equity.map((v) => {
    peak = Math.max(peak, v);
    return v / peak - 1;
  });

  return { months, equity, returns, cashReturns, snapshots, turnover, stats, yearly, drawdown, warmupMonths: warm };
}

/** Buy & hold one ticker over the SAME months the strategy traded, so the
 *  comparison is apples-to-apples (identical warm-up window). */
export function buyAndHold(panel: Panel, ticker: string, cfg: GtaaConfig): BacktestResult {
  const warm = warmupMonths(cfg);
  const s = panel.series[ticker];
  const months: string[] = [];
  const returns: number[] = [];
  const cashReturns: number[] = [];
  const equity: number[] = [1];
  const cash = panel.series[cfg.cashTicker];
  for (let t = warm - 1; t < panel.months.length - 1; t++) {
    const i = t + 1;
    const a = s?.adj[t];
    const b = s?.adj[i];
    const r = s && Number.isFinite(a) && Number.isFinite(b) && a > 0 ? b / a - 1 : 0;
    let cr = 0;
    if (cash && Number.isFinite(cash.adj[t]) && Number.isFinite(cash.adj[i]) && cash.adj[t] > 0) {
      cr = cash.adj[i] / cash.adj[t] - 1;
    }
    months.push(panel.months[i]);
    returns.push(r);
    cashReturns.push(cr);
    equity.push(equity[equity.length - 1] * (1 + r));
  }
  const stats = computeStats(returns, cashReturns, equity, {
    avgExposure: 1,
    avgMonthlyTurnover: 0,
    totalCostDrag: 0,
  });
  const yearlyMap = new Map<string, number>();
  months.forEach((m, i) => {
    const y = m.slice(0, 4);
    yearlyMap.set(y, (yearlyMap.get(y) ?? 1) * (1 + returns[i]));
  });
  let peak = -Infinity;
  const drawdown = equity.map((v) => {
    peak = Math.max(peak, v);
    return v / peak - 1;
  });
  return {
    months,
    equity,
    returns,
    cashReturns,
    snapshots: [],
    turnover: [],
    stats,
    yearly: Array.from(yearlyMap.entries()).map(([year, g]) => ({ year, ret: g - 1 })),
    drawdown,
    warmupMonths: warm,
  };
}
