import { describe, it, expect } from "vitest";
import { piotroskiFScore } from "./piotroski";
import { altmanZDoublePrime } from "./altman";
import { beneishMScore } from "./beneish";
import { healthy, priorYear } from "./testkit";

describe("Piotroski F-score", () => {
  it("passes all nine tests for a firm improving on every axis", () => {
    const f = piotroskiFScore(healthy(), priorYear());
    expect(f.computable).toBe(9);
    expect(f.score).toBe(9);
    expect(f.scaled).toBe(9);
    expect(f.notComputable).toEqual([]);
  });

  it("fails the specific test that regressed and names it", () => {
    const f = piotroskiFScore(healthy({ sharesOutstanding: 110, cfo: 90 }), priorYear());
    const failed = f.tests.filter((t) => !t.pass).map((t) => t.id);
    expect(failed).toEqual(["accrual", "no_dilution"]); // cfo 90 < ni 100; shares rose
    expect(f.score).toBe(7);
  });

  it("drops a test it cannot compute instead of guessing, and rescales", () => {
    const f = piotroskiFScore(healthy({ grossProfit: undefined }), priorYear());
    expect(f.notComputable).toEqual(["margin_rising"]);
    expect(f.computable).toBe(8);
    expect(f.scaled).toBe(9); // 8/8 → 9/9
  });
});

describe("Altman Z''", () => {
  it("computes the disclosed four-term formula and zone", () => {
    const z = altmanZDoublePrime(healthy());
    // 6.56·0.15 + 3.26·0.30 + 6.72·0.15 + 1.05·1.5
    expect(z.z).toBeCloseTo(0.984 + 0.978 + 1.008 + 1.575, 3);
    expect(z.zone).toBe("safe");
  });
  it("flags distress and refuses on a degenerate balance sheet", () => {
    const d = altmanZDoublePrime(healthy({ ebit: -200, retainedEarnings: -500, currentAssets: 50, totalLiabilities: 950 }));
    expect(d.zone).toBe("distress");
    expect(altmanZDoublePrime(healthy({ totalAssets: 0 })).z).toBeNull();
  });
});

describe("Beneish M-score", () => {
  it("is quiet for a clean firm and loud when receivables balloon and accruals dominate", () => {
    const clean = beneishMScore(healthy(), priorYear());
    expect(clean.m).not.toBeNull();
    expect(clean.m as number).toBeLessThan(-1.78);
    const cooked = beneishMScore(healthy({ receivables: 300, cfo: 20 }), priorYear());
    expect(cooked.m as number).toBeGreaterThan(-1.78);
    expect(cooked.variables?.DSRI).toBeGreaterThan(2.5);
  });
  it("lists the missing inputs rather than computing on defaults", () => {
    const m = beneishMScore(healthy({ receivables: undefined, sga: undefined }), priorYear());
    expect(m.m).toBeNull();
    expect(m.missing.sort()).toEqual(["receivables", "sga"]);
  });
});
