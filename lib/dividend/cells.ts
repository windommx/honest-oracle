// ╔══════════════════════════════════════════════════════════════════╗
// ║  CELLS — the "grid" of a dividend stock.                          ║
// ║  Every cell is a direct count (paccakkha) or a disclosed ratio    ║
// ║  over counts (anumāna). A ratio whose denominator is zero or      ║
// ║  negative is `null`, not a made-up number.                        ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { AnnualRecord, Cell, DividendCells } from "./types";

function ratio(num: number, den: number): Cell {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

export function freeCashFlow(r: AnnualRecord): number {
  return r.cfo - r.capex;
}

export function netDebt(r: AnnualRecord): number {
  return r.longTermDebt + (r.shortTermDebt ?? 0) - r.cash;
}

export function ebitda(r: AnnualRecord): number {
  return r.ebit + (r.depreciationAmortization ?? 0);
}

export function marketCap(r: AnnualRecord): number {
  return r.sharesOutstanding * r.price;
}

/** Consecutive years (ending at the last element) in which DPS did not fall.
 *  A single year of history counts as a streak of 1 if it pays anything. */
export function dpsStreak(history: AnnualRecord[]): number {
  if (history.length === 0) return 0;
  let streak = history[history.length - 1].dps > 0 ? 1 : 0;
  for (let i = history.length - 1; i > 0 && streak > 0; i--) {
    const cur = history[i].dps;
    const prev = history[i - 1].dps;
    if (prev > 0 && cur >= prev) streak++;
    else break;
  }
  return streak;
}

/** Population stdev of year-on-year EPS growth. Growth is undefined when the
 *  prior EPS is ≤ 0, and those years are skipped rather than faked. */
export function epsVolatility(history: AnnualRecord[], window = 5): Cell {
  const slice = history.slice(-(window + 1));
  const growth: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].eps;
    if (prev > 0) growth.push(slice[i].eps / prev - 1);
  }
  if (growth.length < 2) return null;
  const mean = growth.reduce((a, b) => a + b, 0) / growth.length;
  const v = growth.reduce((a, g) => a + (g - mean) ** 2, 0) / growth.length;
  return Math.sqrt(v);
}

/** Faber's shareholder yield: dividends + buybacks + net-debt paydown, over
 *  market cap. Needs the prior year for the debt term; null without it. */
export function shareholderYield(r: AnnualRecord, prior?: AnnualRecord): Cell {
  if (!prior) return null;
  const paydown = netDebt(prior) - netDebt(r);
  return ratio(r.dividendsPaid + (r.buybacks ?? 0) + paydown, marketCap(r));
}

/**
 * `history` is ascending by fiscalYear and its LAST element is the record
 * being assessed. Prior years feed streak, volatility and shareholder yield.
 */
export function computeCells(history: AnnualRecord[]): DividendCells {
  const r = history[history.length - 1];
  const prior = history.length > 1 ? history[history.length - 2] : undefined;
  const fcf = freeCashFlow(r);
  const nd = netDebt(r);
  const std = r.shortTermDebt ?? 0;

  return {
    fcf,
    payoutEps: ratio(r.dps, r.eps),
    payoutFcf: ratio(r.dividendsPaid, fcf),
    cashRunway: ratio(r.cash + fcf - std, r.dividendsPaid),
    netDebt: nd,
    netDebtEbitda: ratio(nd, ebitda(r)),
    interestCoverage: r.interestExpense > 0 ? r.ebit / r.interestExpense : r.ebit >= 0 ? Infinity : null,
    dividendYield: ratio(r.dps, r.price),
    shareholderYield: shareholderYield(r, prior),
    streak: dpsStreak(history),
    epsVolatility: epsVolatility(history),
    loss: r.netIncome < 0,
    earningsShortfall: r.netIncome < r.dividendsPaid,
    priceReturn: prior ? ratio(r.price, prior.price) !== null ? r.price / prior.price - 1 : null : null,
  };
}
