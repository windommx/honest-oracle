import { describe, it, expect } from "vitest";
import { selectPortfolio, compareCandidates, RANKING_KEY } from "./portfolio";
import { stabilityGate } from "./stability-gate";
import { healthy, priorYear, threeYears } from "./testkit";
import type { AnnualRecord } from "./types";

const firm = (ticker: string, sector: string, last: Partial<AnnualRecord> = {}) =>
  stabilityGate(threeYears({ ticker, sector, ...last }).map((r) => ({ ...r, ticker, sector })));

describe("portfolio selection", () => {
  it("equal-weights the eligible names, caps per sector, and explains every exclusion", () => {
    const c = [
      firm("A", "banks"),
      firm("B", "banks"),
      firm("C", "banks"),
      firm("D", "energy"),
      firm("E", "energy", { netIncome: -5, eps: -0.05 }), // at-risk
      firm("F", "telecom", { cfo: 30 }), // watch (fcf uncovered, runway ok)
    ];
    const s = selectPortfolio(c, { maxPositions: 10, maxPerSector: 2, minYield: null, allowWatch: false });
    expect(s.holdings.map((h) => h.ticker).sort()).toEqual(["A", "B", "D"]);
    expect(s.holdings.reduce((a, h) => a + h.weight, 0)).toBeCloseTo(1);
    expect(s.holdings.every((h) => h.weight === 1 / 3)).toBe(true);
    const why = Object.fromEntries(s.excluded.map((e) => [e.ticker, e.reason]));
    expect(why.C).toMatch(/sector cap 2/);
    expect(why.E).toMatch(/at-risk: loss/);
    expect(why.F).toMatch(/watch:/);
    expect(s.rankingKey).toBe(RANKING_KEY);
  });

  it("admits 'watch' names only after 'sustain' and only when allowed; applies the yield floor", () => {
    const c = [firm("W", "x", { cfo: 30 }), firm("S", "y")];
    expect(selectPortfolio(c, { maxPositions: 5, maxPerSector: 5, minYield: null, allowWatch: true }).holdings.map((h) => h.ticker)).toEqual(["S", "W"]);
    const floor = selectPortfolio(c, { maxPositions: 5, maxPerSector: 5, minYield: 0.06, allowWatch: true });
    expect(floor.holdings).toEqual([]);
    expect(floor.excluded[0].reason).toMatch(/yield .* < floor/);
  });

  it("ranks lexicographically over disclosed cells, never by an invented composite", () => {
    const highF = firm("HI", "x");
    const lowF = firm("LO", "x", { sharesOutstanding: 110, cfo: 120 }); // F 7, still sustain? cfo 120 > ni ✓; dilution ✗ → F 8
    expect(lowF.base.fScore!.scaled).toBeLessThan(highF.base.fScore!.scaled);
    expect(compareCandidates(highF, lowF)).toBeLessThan(0);
    // tie on everything but ticker → ticker order
    expect(compareCandidates(firm("AAA", "x"), firm("BBB", "x"))).toBeLessThan(0);
  });

  it("refuses unstable names even when their base verdict is sustain", () => {
    const shaky = stabilityGate([priorYear({ fiscalYear: 2023 }), priorYear({ dps: 0.98, dividendsPaid: 98 }), healthy({ ticker: "SHK", dps: 0.98, dividendsPaid: 98, cash: 30 })]);
    expect(shaky.base.verdict).toBe("sustain");
    expect(shaky.pass).toBe(false);
    const s = selectPortfolio([shaky, firm("OK", "x")]);
    expect(s.holdings.map((h) => h.ticker)).toEqual(["OK"]);
    expect(s.excluded.find((e) => e.ticker === "SHK")?.reason).toMatch(/unstable/);
  });
});
