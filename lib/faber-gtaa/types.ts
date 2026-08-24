// ╔══════════════════════════════════════════════════════════════════╗
// ║  FABER GTAA — types & canonical configuration.                    ║
// ║                                                                    ║
// ║  Mebane Faber, "A Quantitative Approach to Tactical Asset          ║
// ║  Allocation" (2006/2013 update). This module encodes the           ║
// ║  AGGRESSIVE variant (GTAA Agg Top 6): a 13-asset universe,         ║
// ║  a 10-month-SMA absolute-trend gate, a relative-momentum score     ║
// ║  (mean of 1/3/6/12-month total returns), top-6 selection at        ║
// ║  equal weight, everything else parked in T-bills.                  ║
// ║                                                                    ║
// ║  Every rule below is configurable so the BACKTEST can probe the    ║
// ║  rules, not just replay them: SMA length, lookbacks, top-N,        ║
// ║  filter-vs-rank order, price-vs-total-return SMA, trading cost.    ║
// ╚══════════════════════════════════════════════════════════════════╝

export type AssetGroup =
  | "us-equity"
  | "global-equity"
  | "bond"
  | "alternative"
  | "real-estate";

export interface AssetSpec {
  ticker: string;
  name: string;
  group: AssetGroup;
  /** What the 2013 paper actually used (the ETF is a live-trading proxy). */
  paperProxy: string;
  /** ETF inception (YYYY-MM). Real backtests cannot start before the LATEST
   *  inception in the universe plus the 12-month momentum warm-up. */
  inception: string;
}

/** The 13-asset universe as laid out in the post (ETF proxies for the paper's indices). */
export const UNIVERSE_13: AssetSpec[] = [
  { ticker: "VTV",  name: "US Large Cap Value",     group: "us-equity",     paperProxy: "Fama-French Large Value",   inception: "2004-01" },
  { ticker: "MTUM", name: "US Large Cap Momentum",  group: "us-equity",     paperProxy: "Fama-French Large Momentum", inception: "2013-04" },
  { ticker: "VBR",  name: "US Small Cap Value",     group: "us-equity",     paperProxy: "Fama-French Small Value",   inception: "2004-01" },
  { ticker: "DWAS", name: "US Small Cap Momentum",  group: "us-equity",     paperProxy: "Fama-French Small Momentum", inception: "2012-07" },
  { ticker: "EFA",  name: "Foreign Developed",      group: "global-equity", paperProxy: "MSCI EAFE",                 inception: "2001-08" },
  { ticker: "EEM",  name: "Foreign Emerging",       group: "global-equity", paperProxy: "MSCI EEM",                  inception: "2003-04" },
  { ticker: "IEF",  name: "US 10Y Govt",            group: "bond",          paperProxy: "10Y Treasury",              inception: "2002-07" },
  { ticker: "IGOV", name: "Foreign 10Y Govt",       group: "bond",          paperProxy: "Foreign 10Y Govt",          inception: "2009-01" },
  { ticker: "LQD",  name: "US Corporate Bonds",     group: "bond",          paperProxy: "US Corporate Bonds",        inception: "2002-07" },
  { ticker: "TLT",  name: "US 30Y Govt",            group: "bond",          paperProxy: "30Y Treasury",              inception: "2002-07" },
  { ticker: "DBC",  name: "Commodities",            group: "alternative",   paperProxy: "GSCI",                      inception: "2006-02" },
  { ticker: "GLD",  name: "Gold",                   group: "alternative",   paperProxy: "Gold (spot)",               inception: "2004-11" },
  { ticker: "VNQ",  name: "Real Estate (REITs)",    group: "real-estate",   paperProxy: "NAREIT",                    inception: "2004-09" },
];

/** T-bill parking spot for capital cut by the absolute-trend gate. */
export const CASH_TICKER = "BIL";

/** When a top-N slot is empty because too few assets pass the gate, its
 *  capital sits in cash — never redistributed into the survivors. */
export type SelectionMode =
  /** The post's flow: gate first (SMA), then rank ONLY the survivors. */
  | "filterThenRank"
  /** The paper's per-slot reading: rank ALL by momentum, take top N,
   *  then each slot individually goes to cash if its asset fails its SMA. */
  | "rankThenFilter";

export interface GtaaConfig {
  smaMonths: number;
  /** Months used for the momentum score (mean of the k-month total returns). */
  lookbacks: number[];
  topN: number;
  mode: SelectionMode;
  /** SMA computed on raw price (the common practice) or on the total-return
   *  series (what a dividend-adjusted chart shows). The two disagree exactly
   *  when an asset hovers at the line — worth measuring, so configurable. */
  smaOn: "price" | "totalReturn";
  /** One-way trading cost in basis points, charged on traded notional. */
  costBps: number;
  cashTicker: string;
}

/** GTAA Aggressive Top 6 exactly as described in the post. */
export const GTAA_AGG_TOP6: GtaaConfig = {
  smaMonths: 10,
  lookbacks: [1, 3, 6, 12],
  topN: 6,
  mode: "filterThenRank",
  smaOn: "price",
  costBps: 0,
  cashTicker: CASH_TICKER,
};

/** One ticker's month-end history. `months` are "YYYY-MM", ascending.
 *  `close` is the raw close (SMA gate), `adj` is dividend-adjusted
 *  (total return — momentum + portfolio returns). NaN = not listed yet. */
export interface MonthlySeries {
  ticker: string;
  months: string[];
  close: number[];
  adj: number[];
}

/** All tickers aligned onto one month calendar. */
export interface Panel {
  months: string[];
  series: Record<string, { close: number[]; adj: number[] }>;
}

export interface AssetSignal {
  ticker: string;
  /** Momentum score (mean of lookback returns), null while warming up. */
  score: number | null;
  /** Month-end close vs its own SMA. Null while warming up. */
  aboveSma: boolean | null;
  /** Has enough history for BOTH the SMA and the longest lookback. */
  eligible: boolean;
  /** 1-based rank among ranked candidates (mode-dependent), null if unranked. */
  rank: number | null;
  selected: boolean;
  /** Portfolio weight next month (0 if not selected). */
  weight: number;
}

export interface SignalSnapshot {
  month: string;
  table: AssetSignal[];
  /** ticker → weight for every INVESTED slot (sums to 1 - cashWeight). */
  weights: Record<string, number>;
  cashWeight: number;
}
