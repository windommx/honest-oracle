import type { WeeklyBar } from '../market-sim'
import { deriveIndicators, toWeekly } from './resample'
import type { SymbolBars } from './types'
import type { MarketData } from '../backtest'

/**
 * Put every symbol and the benchmark on one calendar.
 *
 * Symbols list and delist, halt, and miss days. Running a backtest over series
 * that each have their own week indices silently compares week 40 of one stock
 * with week 40 of another when they are eighteen months apart. Everything is
 * therefore keyed by date and intersected with the benchmark: a week is used
 * only when the index and every included symbol traded in it.
 *
 * Symbols with too little history are REPORTED, not quietly dropped — a
 * universe that shrank from 61 to 12 without saying so is a survivorship
 * filter wearing the clothes of a data step.
 */
export function alignUniverse(
  symbols: SymbolBars[],
  benchmark: SymbolBars,
  opts: { minWeeks?: number; source?: string } = {},
): { market: MarketData; included: string[]; excluded: Array<{ symbol: string; weeks: number }> } {
  const minWeeks = opts.minWeeks ?? 120
  const index = toWeekly(benchmark)
  const indexByDate = new Map(index.map((b) => [b.t, b.c]))

  const weekly = new Map<string, WeeklyBar[]>()
  const included: string[] = []
  const excluded: Array<{ symbol: string; weeks: number }> = []

  for (const s of symbols) {
    const w = toWeekly(s).filter((b) => indexByDate.has(b.t))
    if (w.length < minWeeks) {
      excluded.push({ symbol: s.symbol, weeks: w.length })
      continue
    }
    weekly.set(s.symbol, w)
    included.push(s.symbol)
  }

  // The common window: dates every included symbol traded in.
  let common: string[] | null = null
  for (const w of Array.from(weekly.values())) {
    const dates = w.map((b) => b.t)
    common = common === null ? dates : common.filter((d) => dates.includes(d))
  }
  const dates = common ?? []

  const bars = new Map<string, WeeklyBar[]>()
  const benchCloses = dates.map((d) => indexByDate.get(d) ?? 0)
  for (const [symbol, w] of Array.from(weekly.entries())) {
    const byDate = new Map(w.map((b) => [b.t, b]))
    const aligned = dates.map((d, i) => ({ ...(byDate.get(d) as WeeklyBar), i }))
    bars.set(symbol, deriveIndicators(aligned, benchCloses))
  }

  return {
    market: { bars, benchmarkCloses: benchCloses, source: opts.source ?? 'imported' },
    included,
    excluded,
  }
}
