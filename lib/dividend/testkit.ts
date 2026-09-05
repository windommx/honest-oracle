// Hand-built filings for tests: a healthy firm and its slightly weaker prior year.
import type { AnnualRecord } from "./types";

export function healthy(over: Partial<AnnualRecord> = {}): AnnualRecord {
  return {
    ticker: "GOOD",
    fiscalYear: 2025,
    sector: "utilities",
    revenue: 1000,
    grossProfit: 400,
    ebit: 150,
    interestExpense: 10,
    netIncome: 100,
    eps: 1.0,
    cfo: 140,
    capex: 40,
    dividendsPaid: 50,
    depreciationAmortization: 30,
    totalAssets: 1000,
    currentAssets: 300,
    currentLiabilities: 150,
    totalLiabilities: 400,
    longTermDebt: 200,
    shortTermDebt: 20,
    cash: 100,
    retainedEarnings: 300,
    sharesOutstanding: 100,
    dps: 0.5,
    price: 10,
    receivables: 100,
    cogs: 600,
    ppeNet: 400,
    sga: 100,
    ...over,
  };
}

/** The year before `healthy()`: every Piotroski test should pass going from here. */
export function priorYear(over: Partial<AnnualRecord> = {}): AnnualRecord {
  return healthy({
    fiscalYear: 2024,
    revenue: 950,
    grossProfit: 370,
    netIncome: 90,
    eps: 0.9,
    cfo: 120,
    longTermDebt: 220,
    currentAssets: 280,
    receivables: 95,
    cogs: 580,
    price: 9,
    ...over,
  });
}

export function threeYears(last: Partial<AnnualRecord> = {}): AnnualRecord[] {
  return [priorYear({ fiscalYear: 2023, price: 8.5 }), priorYear(), healthy(last)];
}
