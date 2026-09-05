// ╔══════════════════════════════════════════════════════════════════╗
// ║  DIVIDEND — types.                                                ║
// ║  One annual filing per record. Everything downstream is a         ║
// ║  deterministic function of these numbers: same filing → same      ║
// ║  verdict, every run. No prices from the network, no clock, no LLM.║
// ╚══════════════════════════════════════════════════════════════════╝

import type { EpistemicTier } from "@/lib/rush-engine/epistemics";

/** One fiscal year of a company. Cash-flow signs: money leaving the firm is
 *  POSITIVE (capex, dividendsPaid, buybacks) so `cfo - capex` is FCF. */
export interface AnnualRecord {
  ticker: string;
  fiscalYear: number;
  sector?: string;

  // income statement
  revenue: number;
  grossProfit?: number;
  ebit: number;
  interestExpense: number;
  netIncome: number;
  eps: number;

  // cash flow
  cfo: number;
  capex: number;
  dividendsPaid: number;
  buybacks?: number;
  depreciationAmortization?: number;

  // balance sheet
  totalAssets: number;
  currentAssets: number;
  currentLiabilities: number;
  totalLiabilities: number;
  longTermDebt: number;
  shortTermDebt?: number;
  cash: number;
  retainedEarnings: number;
  sharesOutstanding: number;

  // per-share / market, as of the screening date
  dps: number;
  price: number;

  // optional — only needed for the Beneish M-score
  receivables?: number;
  cogs?: number;
  ppeNet?: number;
  sga?: number;
}

/** A value that could not be computed from the filing is `null`, never 0 —
 *  a missing number must not masquerade as a measured one. */
export type Cell = number | null;

export interface DividendCells {
  fcf: Cell;
  payoutEps: Cell;
  payoutFcf: Cell;
  cashRunway: Cell;
  netDebt: Cell;
  netDebtEbitda: Cell;
  interestCoverage: Cell;
  dividendYield: Cell;
  shareholderYield: Cell;
  /** consecutive fiscal years (ending at this one) in which DPS did not fall */
  streak: number;
  /** stdev of year-on-year EPS growth over the trailing window; null if < 2 growth obs */
  epsVolatility: Cell;
  loss: boolean;
  earningsShortfall: boolean;
  priceReturn: Cell;
}

export type Verdict = "sustain" | "watch" | "at-risk";

export interface Reason {
  rule: string;
  tier: EpistemicTier;
  /** what was measured, in words a reader can re-derive */
  detail: string;
  /** the source this rule is borrowed from */
  source: string;
}

export interface VerdictPolicy {
  /** DPS/EPS above this for two consecutive years → at-risk */
  payoutEpsMax: number;
  /** dividends / FCF above this AND runway below `cashRunwayMin` → at-risk */
  payoutFcfMax: number;
  cashRunwayMin: number;
  /** Altman Z'' below this → at-risk */
  altmanDistress: number;
  /** BOTH leverage limits breached → at-risk */
  netDebtEbitdaMax: number;
  interestCoverageMin: number;
  /** Piotroski F below this (of computable tests, scaled to 9) → watch */
  fScoreMin: number;
  /** DPS streak below this → watch */
  streakMin: number;
  /** Beneish M above this → manipulation flag (saññā) */
  beneishFlag: number;
  /** yield-trap: price fell more than this while payout > 1 */
  trapDrawdown: number;
}

export const DEFAULT_POLICY: VerdictPolicy = {
  payoutEpsMax: 1.0,
  payoutFcfMax: 1.0,
  cashRunwayMin: 1.0,
  altmanDistress: 1.1,
  netDebtEbitdaMax: 4.0,
  interestCoverageMin: 2.0,
  fScoreMin: 5,
  streakMin: 3,
  beneishFlag: -1.78,
  trapDrawdown: -0.3,
};
