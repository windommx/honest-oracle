import type { DailyBar, SymbolBars } from './types'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Nobody's price file is clean.                                           ║
// ║                                                                          ║
// ║  A backtest silently consuming bad data produces a confident wrong       ║
// ║  answer, which is the worst outcome available. These checks are the      ║
// ║  ones that have actually changed a published result: an unadjusted       ║
// ║  split reads as a -50% week and stops you out of the best trade in the   ║
// ║  sample; a duplicated date double-counts a return; a long gap turns a    ║
// ║  suspension into a phantom gain. Each is reported with the date so it    ║
// ║  can be looked up, not just counted.                                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export type Severity = 'error' | 'warning'

export interface Issue {
  severity: Severity
  code: string
  message: string
  at?: string
}

export interface Report {
  symbol: string
  bars: number
  from: string
  to: string
  issues: Issue[]
  /** No errors. Warnings do not block a run; they belong in the result. */
  usable: boolean
}

export function validate(series: SymbolBars, opts: { minBars?: number } = {}): Report {
  const { bars, symbol } = series
  const issues: Issue[] = []
  const minBars = opts.minBars ?? 250
  const add = (severity: Severity, code: string, message: string, at?: string) =>
    issues.push({ severity, code, message, at })

  if (bars.length < minBars) {
    add('error', 'too_short',
      `${bars.length} bars; at least ${minBars} are needed for a 30-week MA plus a warm-up`)
  }

  const seen = new Set<string>()
  let prev: DailyBar | null = null
  let jumps = 0

  for (const b of bars) {
    if (seen.has(b.t)) add('error', 'duplicate_date', `${b.t} appears more than once`, b.t)
    seen.add(b.t)

    if (!(b.c > 0)) add('error', 'non_positive', `close is ${b.c}`, b.t)
    if (!(b.o > 0) || !(b.h > 0) || !(b.l > 0)) {
      add('error', 'non_positive', `an OHLC value is zero or negative`, b.t)
    }
    if (b.h < b.l) add('error', 'impossible_bar', `high ${b.h} is below low ${b.l}`, b.t)
    if (b.c > b.h + 1e-9 || b.c < b.l - 1e-9) {
      add('error', 'impossible_bar', `close ${b.c} is outside the high-low range`, b.t)
    }
    if (b.o > b.h + 1e-9 || b.o < b.l - 1e-9) {
      add('warning', 'impossible_bar', `open ${b.o} is outside the high-low range`, b.t)
    }
    if (b.v < 0) add('error', 'negative_volume', `volume is ${b.v}`, b.t)

    if (prev) {
      const gapDays = (Date.parse(b.t) - Date.parse(prev.t)) / 86_400_000
      if (gapDays > 10) {
        add('warning', 'gap',
          `${Math.round(gapDays)} days with no bar — a suspension or missing data, not a flat market`, b.t)
      }
      const move = b.c / prev.c - 1
      // A 40% one-day move on the SET is a corporate action far more often
      // than it is a price. Ratios near a round fraction are the giveaway.
      if (Math.abs(move) > 0.4) {
        jumps++
        const ratio = prev.c / b.c
        const looksLikeSplit = [2, 3, 4, 5, 10].some((k) => Math.abs(ratio - k) < 0.06 || Math.abs(1 / ratio - k) < 0.06)
        add(looksLikeSplit ? 'error' : 'warning',
          looksLikeSplit ? 'unadjusted_split' : 'large_move',
          looksLikeSplit
            ? `close moves ${(move * 100).toFixed(0)}% (ratio ${ratio.toFixed(2)}:1) — this looks like an unadjusted split. Re-export with adjusted prices.`
            : `close moves ${(move * 100).toFixed(0)}% in one bar`,
          b.t)
      }
    }
    prev = b
  }

  if (jumps > bars.length * 0.02) {
    add('error', 'too_noisy',
      `${jumps} bars move more than 40% — this does not look like an adjusted daily series`)
  }

  const hasVolume = bars.some((b) => b.v > 0)
  if (!hasVolume) {
    add('warning', 'no_volume',
      'every volume is zero — volume confirmation cannot be evaluated and will be skipped')
  }

  return {
    symbol,
    bars: bars.length,
    from: bars[0]?.t ?? '',
    to: bars[bars.length - 1]?.t ?? '',
    issues,
    usable: !issues.some((i) => i.severity === 'error'),
  }
}
