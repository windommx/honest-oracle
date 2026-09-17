// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Real price data.                                                        ║
// ║                                                                          ║
// ║  Everything in StageLab has run on a deterministic simulator. That is    ║
// ║  fine for teaching the method and useless for answering "would this have ║
// ║  worked", because the simulator's properties are chosen, not observed.   ║
// ║  This module is the seam where observed data comes in.                   ║
// ║                                                                          ║
// ║  Two providers, one interface. A file importer, which works today and    ║
// ║  is what most SET data actually arrives as — a broker or vendor export.  ║
// ║  And an HTTP provider, for when outbound access to a market-data host is ║
// ║  permitted; it is written and tested against recorded payloads, so the   ║
// ║  day the host is allowed it needs no new code.                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** One trading day, as the exchange reported it. Prices in baht. */
export interface DailyBar {
  /** ISO date, YYYY-MM-DD, in the exchange's own calendar. */
  t: string
  o: number
  h: number
  l: number
  c: number
  v: number
  /**
   * Close adjusted for splits and dividends, when the source supplies one.
   * A backtest must compute RETURNS from adjusted prices — an unadjusted
   * series shows a 2-for-1 split as a 50% crash and will stop you out of it —
   * but must size positions from the raw close, because that is the price
   * you actually pay. Keeping both is the only way to do each correctly.
   */
  adjClose?: number
}

export interface SymbolBars {
  symbol: string
  /** Where these came from, so a result can always be traced to its input. */
  source: string
  /** When this series was retrieved. */
  fetchedAt: string
  currency: string
  bars: DailyBar[]
}

export interface PriceFeed {
  readonly name: string
  /** Throws FeedError on a failure the caller should see rather than retry. */
  fetch(symbol: string): Promise<SymbolBars>
}

export class FeedError extends Error {
  constructor(
    message: string,
    readonly symbol: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'FeedError'
  }
}
