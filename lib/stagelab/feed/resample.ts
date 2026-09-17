import type { DailyBar, SymbolBars } from './types'
import type { WeeklyBar } from '../market-sim'

// ─── Daily → weekly ──────────────────────────────────────────────────────────
// The whole method is weekly: a 30-week MA, a 10-week high, Stage detection on
// the weekly close. Resampling is therefore not a convenience, it is where a
// real series becomes something the engine can read.

/** ISO week key (Monday-anchored), so a short holiday week still groups. */
function weekKeyOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

export interface WeeklyOptions {
  /**
   * Compute returns from the adjusted close when the source has one. Without
   * this a split reads as a crash and the stop takes you out of it.
   */
  useAdjusted?: boolean
}

/**
 * Weekly OHLCV from daily bars.
 *
 * Open is the week's first trade, close its last, high and low the extremes
 * across the week, volume the sum. The date is the last TRADING day of the
 * week, not a nominal Friday — Thai markets close for Songkran and royal
 * holidays, and labelling a Wednesday close as Friday's misstates when a
 * signal could have been acted on.
 */
export function toWeekly(series: SymbolBars, opts: WeeklyOptions = {}): WeeklyBar[] {
  const useAdj = opts.useAdjusted !== false
  const groups = new Map<string, DailyBar[]>()
  for (const b of series.bars) {
    const k = weekKeyOf(b.t)
    const g = groups.get(k)
    if (g) g.push(b)
    else groups.set(k, [b])
  }

  const keys = Array.from(groups.keys()).sort()
  const out: WeeklyBar[] = []
  let i = 0
  for (const k of keys) {
    const days = groups.get(k)!.sort((a, b) => (a.t < b.t ? -1 : 1))
    const first = days[0]
    const last = days[days.length - 1]
    // Scale the whole bar by the adjustment factor of its closing day, so the
    // bar stays internally consistent: high >= close >= low still holds.
    const adj = useAdj && last.adjClose && last.c > 0 ? last.adjClose / last.c : 1
    out.push({
      i: i++,
      t: last.t,
      o: r2(first.o * adj),
      h: r2(Math.max(...days.map((d) => d.h)) * adj),
      l: r2(Math.min(...days.map((d) => d.l)) * adj),
      c: r2(last.c * adj),
      v: days.reduce((a, d) => a + d.v, 0),
      ma30: 0,
      stage: 1,
      rs: 0,
    })
  }
  return out
}

/**
 * Fill in the derived columns the engine reads: the 30-week MA, the stage, and
 * Mansfield relative strength against a benchmark series.
 *
 * These use exactly the same rules as the simulator, so a result computed on
 * real data is comparable with one computed on simulated data. That is the
 * point of doing it here rather than inventing a second set of definitions.
 */
export function deriveIndicators(bars: WeeklyBar[], benchmarkCloses: number[]): WeeklyBar[] {
  const n = bars.length
  const c = bars.map((b) => b.c)

  const ma: number[] = []
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - 29)
    let s = 0
    for (let j = from; j <= i; j++) s += c[j]
    ma.push(s / (i - from + 1))
  }

  // Mansfield RS: relative price against its own 52-week average, as a
  // percentage. Needs the benchmark aligned to the same bars.
  const rp = c.map((x, i) => {
    const b = benchmarkCloses[i]
    return b > 0 ? (x / b) * 100 : 0
  })
  const rs: number[] = []
  for (let i = 0; i < n; i++) {
    if (i < 52) { rs.push(0); continue }
    let s = 0
    for (let j = i - 51; j <= i; j++) s += rp[j]
    const avg = s / 52
    rs.push(avg > 0 ? (rp[i] / avg - 1) * 100 : 0)
  }

  return bars.map((b, i) => {
    let stage = 1
    if (i >= 35) {
      const slope = ma[i - 5] > 0 ? (ma[i] - ma[i - 5]) / ma[i - 5] : 0
      if (c[i] > ma[i] && slope > 0.005) stage = 2
      else if (c[i] < ma[i] && slope < -0.005) stage = 4
      else if (c[i] > ma[i]) stage = 3
      else stage = 1
    }
    return { ...b, i, ma30: r2(ma[i]), stage, rs: r2(rs[i]) }
  })
}

const r2 = (x: number) => Math.round(x * 100) / 100
