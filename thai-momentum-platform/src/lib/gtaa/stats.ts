// สถิติผลตอบแทน — CAGR / Vol / Sharpe / MaxDD / Hit rate

import { mean, std } from "./math"
import type { BacktestStats } from "./types"

/** สถิติจากชุดผลตอบแทนรายเดือน (ทศนิยม เช่น 0.01 = 1%) */
export function computeStats(returns: number[], turnoverAnnual = 0): BacktestStats {
  const n = returns.length
  if (n === 0) {
    return { cagr: 0, vol: 0, sharpe: 0, maxDD: 0, hitRate: 0, turnoverAnnual, months: 0, finalEquity: 1 }
  }
  let eq = 1
  let peak = 1
  let maxDD = 0
  let wins = 0
  for (const r of returns) {
    eq *= 1 + r
    if (eq > peak) peak = eq
    const dd = eq / peak - 1
    if (dd < maxDD) maxDD = dd
    if (r > 0) wins++
  }
  const years = n / 12
  const cagr = eq > 0 ? Math.pow(eq, 1 / years) - 1 : -1
  const vol = std(returns) * Math.sqrt(12)
  const sharpe = vol > 1e-9 ? cagr / vol : 0
  return {
    cagr,
    vol,
    sharpe,
    maxDD,
    hitRate: wins / n,
    turnoverAnnual,
    months: n,
    finalEquity: eq,
  }
}

export function equityCurve(returns: number[]): number[] {
  const out: number[] = []
  let eq = 1
  for (const r of returns) {
    eq *= 1 + r
    out.push(eq)
  }
  return out
}

export function drawdownSeries(equity: number[]): number[] {
  let peak = 0
  return equity.map((e) => {
    if (e > peak) peak = e
    return e / peak - 1
  })
}
