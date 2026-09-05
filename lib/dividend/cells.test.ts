import { describe, it, expect } from "vitest";
import { computeCells, dpsStreak, epsVolatility, shareholderYield } from "./cells";
import { healthy, priorYear, threeYears } from "./testkit";

describe("cells", () => {
  it("derives the coverage ratios from the filing with disclosed formulas", () => {
    const c = computeCells([healthy()]);
    expect(c.fcf).toBe(100); // cfo 140 − capex 40
    expect(c.payoutEps).toBeCloseTo(0.5); // dps 0.5 / eps 1.0
    expect(c.payoutFcf).toBeCloseTo(0.5); // dividends 50 / fcf 100
    expect(c.cashRunway).toBeCloseTo(3.6); // (100 + 100 − 20) / 50
    expect(c.netDebt).toBe(120); // 200 + 20 − 100
    expect(c.netDebtEbitda).toBeCloseTo(120 / 180);
    expect(c.interestCoverage).toBe(15);
    expect(c.dividendYield).toBeCloseTo(0.05);
    expect(c.loss).toBe(false);
    expect(c.earningsShortfall).toBe(false);
  });

  it("returns null — never a fake number — when a denominator is zero or negative", () => {
    const c = computeCells([healthy({ eps: 0, cfo: 10, capex: 40, dividendsPaid: 0 })]);
    expect(c.payoutEps).toBeNull();
    expect(c.payoutFcf).toBeNull(); // fcf −30
    expect(c.cashRunway).toBeNull(); // no dividends paid
    expect(computeCells([healthy({ interestExpense: 0 })]).interestCoverage).toBe(Infinity);
    expect(computeCells([healthy({ interestExpense: 0, ebit: -5 })]).interestCoverage).toBeNull();
  });

  it("counts the DPS streak and stops at the first cut", () => {
    const mk = (dps: number[]) => dps.map((d, i) => healthy({ fiscalYear: 2020 + i, dps: d }));
    expect(dpsStreak(mk([0.5, 0.5, 0.6]))).toBe(3);
    expect(dpsStreak(mk([0.5, 0.4, 0.4, 0.5]))).toBe(3);
    expect(dpsStreak(mk([0.5, 0.4]))).toBe(1);
    expect(dpsStreak(mk([0.5, 0]))).toBe(0);
    expect(dpsStreak([])).toBe(0);
  });

  it("EPS volatility needs at least two valid growth observations", () => {
    expect(epsVolatility([healthy({ eps: 1 }), healthy({ eps: 1.1 })])).toBeNull();
    expect(epsVolatility([healthy({ eps: 1 }), healthy({ eps: 1.1 }), healthy({ eps: 1.21 })])).toBeCloseTo(0);
    // a negative prior EPS is skipped, not turned into a bogus growth rate
    expect(epsVolatility([healthy({ eps: -1 }), healthy({ eps: 1 }), healthy({ eps: 1.5 })])).toBeNull();
  });

  it("shareholder yield adds buybacks and net-debt paydown, and needs a prior year", () => {
    expect(shareholderYield(healthy())).toBeNull();
    const prev = priorYear(); // net debt 220 + 20 − 100 = 140
    const cur = healthy({ buybacks: 10 }); // net debt 120 → paydown 20; market cap 1000
    expect(shareholderYield(cur, prev)).toBeCloseTo((50 + 10 + 20) / 1000);
  });

  it("price return and streak read across the history", () => {
    const c = computeCells(threeYears());
    expect(c.streak).toBe(3);
    expect(c.priceReturn).toBeCloseTo(10 / 9 - 1);
    expect(c.shareholderYield).not.toBeNull();
  });
});
