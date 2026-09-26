import { describe, it, expect } from "vitest";
import {
  EXACT_PERMUTATION_MAX_N,
  incompleteBeta,
  logGamma,
  pearson,
  rank,
  spearman,
  spearmanApproxP,
  spearmanExactP,
  spearmanP,
  tTestTwoTailed,
} from "./stats";

describe("logGamma", () => {
  it("reproduces the factorials it generalises", () => {
    // Γ(n) = (n−1)!  — the check that does not depend on a table.
    for (const [x, fact] of [[1, 1], [2, 1], [3, 2], [4, 6], [5, 24], [11, 3_628_800]] as const) {
      expect(Math.exp(logGamma(x))).toBeCloseTo(fact, 6);
    }
  });

  it("gets the half-integer case right", () => {
    // Γ(1/2) = √π, the value the reflection branch has to reach.
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 10);
    expect(Math.exp(logGamma(1.5))).toBeCloseTo(Math.sqrt(Math.PI) / 2, 10);
  });

  it("stays accurate where a naive factorial would overflow", () => {
    // Γ(172) = 171!, the first factorial that overflows a double — 170! is
    // the last one that fits. Checked against the sum of logs rather than a
    // remembered constant.
    let direct = 0;
    for (let k = 2; k <= 171; k++) direct += Math.log(k);
    expect(logGamma(172)).toBeCloseTo(direct, 6);
    expect(direct).toBeGreaterThan(Math.log(Number.MAX_VALUE));
  });
});

describe("the incomplete beta", () => {
  it("runs from 0 to 1 across its range", () => {
    expect(incompleteBeta(2, 3, 0)).toBe(0);
    expect(incompleteBeta(2, 3, 1)).toBe(1);
  });

  it("is a half at the symmetric midpoint", () => {
    for (const a of [0.5, 1, 2, 5, 20]) expect(incompleteBeta(a, a, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("satisfies its own symmetry: I_x(a,b) = 1 − I_(1−x)(b,a)", () => {
    // The identity the continued fraction's branch swap relies on. If the
    // swap were wrong this is what would catch it.
    for (const [a, b, x] of [[2, 5, 0.3], [0.5, 3, 0.8], [7, 2, 0.15], [1.5, 1.5, 0.62]] as const) {
      expect(incompleteBeta(a, b, x)).toBeCloseTo(1 - incompleteBeta(b, a, 1 - x), 12);
    }
  });

  it("matches the closed form for a = b = 1, where it is just x", () => {
    for (const x of [0.1, 0.25, 0.5, 0.9]) expect(incompleteBeta(1, 1, x)).toBeCloseTo(x, 12);
  });
});

describe("the t distribution", () => {
  it("reproduces printed critical values", () => {
    // Two-tailed α = .05 critical values from any t-table.
    for (const [t, df] of [
      [12.706, 1],
      [4.303, 2],
      [2.228, 10],
      [2.086, 20],
      [2.042, 30],
      [1.984, 100],
    ] as const) {
      expect(tTestTwoTailed(t, df), `t=${t}, df=${df}`).toBeCloseTo(0.05, 3);
    }
  });

  it("reproduces the α = .01 column too", () => {
    for (const [t, df] of [[3.169, 10], [2.845, 20], [2.626, 100]] as const) {
      expect(tTestTwoTailed(t, df), `t=${t}, df=${df}`).toBeCloseTo(0.01, 3);
    }
  });

  it("approaches the normal as df grows", () => {
    expect(tTestTwoTailed(1.959964, 100000)).toBeCloseTo(0.05, 4);
  });

  it("is 1 at t = 0 and falls monotonically", () => {
    expect(tTestTwoTailed(0, 10)).toBeCloseTo(1, 12);
    let previous = 1;
    for (const t of [0.5, 1, 1.5, 2, 3, 5]) {
      const p = tTestTwoTailed(t, 10);
      expect(p).toBeLessThan(previous);
      previous = p;
    }
  });

  it("is symmetric in the sign of t", () => {
    expect(tTestTwoTailed(-2.3, 12)).toBeCloseTo(tTestTwoTailed(2.3, 12), 12);
  });

  it("returns 1 rather than NaN for nonsense input", () => {
    expect(tTestTwoTailed(NaN, 10)).toBe(1);
    expect(tTestTwoTailed(2, 0)).toBe(1);
  });
});

describe("ranking", () => {
  it("is 1-based and ordered", () => {
    expect(rank([10, 30, 20])).toEqual([1, 3, 2]);
  });

  it("gives tied values the mean of the ranks they span", () => {
    // Ties are the normal case here: a week of 0 minutes repeats a lot.
    expect(rank([5, 5, 9])).toEqual([1.5, 1.5, 3]);
    expect(rank([7, 7, 7, 7])).toEqual([2.5, 2.5, 2.5, 2.5]);
    expect(rank([1, 2, 2, 2, 5])).toEqual([1, 3, 3, 3, 5]);
  });

  it("does not depend on the input order for tied values", () => {
    // Assigning ties arbitrary distinct ranks would make the correlation
    // change when the store returned rows in a different order.
    expect(rank([0, 0, 4])).toEqual([1.5, 1.5, 3]);
    expect(rank([0, 4, 0])).toEqual([1.5, 3, 1.5]);
  });
});

describe("correlation", () => {
  it("is 1 for a perfect rise and −1 for a perfect fall", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
  });

  it("Spearman sees a monotone curve Pearson does not", () => {
    // The reason this module uses ranks: a real dose-response need not be a
    // straight line, and Pearson would understate it.
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => v ** 3);
    expect(spearman(x, y)).toBeCloseTo(1, 12);
    expect(pearson(x, y)).toBeLessThan(1);
  });

  it("returns 0 rather than NaN against a constant series", () => {
    // A week of identical practice is a real input, and NaN must not reach a
    // template.
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(spearman([4, 4, 4, 4], [1, 2, 3, 4])).toBe(0);
    expect(Number.isFinite(spearman([0, 0], [0, 0]))).toBe(true);
  });

  it("returns 0 for fewer than two pairs", () => {
    expect(spearman([1], [1])).toBe(0);
    expect(spearman([], [])).toBe(0);
  });
});

describe("the exact permutation test", () => {
  it("cannot reach p < .05 with four pairs, however perfect the fit", () => {
    // The fact the dashboard's gate is built on. With n = 4 there are 24
    // orderings and 2 of them are at least as extreme as a perfect one, so
    // the smallest attainable two-tailed p is 2/24 = 0.083.
    const p = spearmanExactP([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(p).toBeCloseTo(2 / 24, 12);
    expect(p).toBeGreaterThan(0.05);
  });

  it("reaches exactly 2/120 for a perfect fit at five pairs", () => {
    expect(spearmanExactP([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(2 / 120, 12);
  });

  it("gives the same answer for a perfect fall as a perfect rise", () => {
    // Two-tailed: direction must not change the p-value.
    expect(spearmanExactP([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(
      spearmanExactP([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
      12
    );
  });

  it("reproduces the published critical value at n = 6", () => {
    // ρ = 0.886 is the tabled two-tailed .05 critical value for n = 6; the
    // ranking below gives exactly that, and its p must sit at or just under
    // .05 for the table and this code to agree.
    // Two adjacent swaps give Σd² = 4, so ρ = 1 − 6(4)/(6·35) = 0.8857.
    const p = spearmanExactP([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 5, 6]);
    expect(spearman([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 5, 6])).toBeCloseTo(0.8857, 3);
    expect(p).toBeLessThanOrEqual(0.05);
    expect(p).toBeGreaterThan(0.01);
  });

  it("is 1 when the observed arrangement is the least extreme there is", () => {
    // Every permutation is at least as extreme as ρ = 0.
    const p = spearmanExactP([1, 2, 3, 4], [1, 1, 1, 1]);
    expect(p).toBe(1);
  });

  it("never returns a p outside 0..1", () => {
    for (const ys of [[1, 5, 2, 8, 3], [3, 3, 1, 9, 2], [7, 1, 1, 1, 7]]) {
      const p = spearmanExactP([1, 2, 3, 4, 5], ys);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("refuses to enumerate past its stated limit", () => {
    const n = EXACT_PERMUTATION_MAX_N + 1;
    const xs = Array.from({ length: n }, (_, i) => i);
    expect(() => spearmanExactP(xs, xs)).toThrow(RangeError);
  });
});

describe("choosing exact over approximate", () => {
  it("uses the exact test at the sizes this product produces", () => {
    const r = spearmanP([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 6, 5]);
    expect(r.exact).toBe(true);
    expect(r.n).toBe(6);
  });

  it("switches to the approximation only past the limit", () => {
    const xs = Array.from({ length: 12 }, (_, i) => i);
    const r = spearmanP(xs, xs.map((v) => v * 2));
    expect(r.exact).toBe(false);
    expect(r.p).toBeLessThan(0.001);
  });

  it("the approximation is anti-conservative at small n, which is why it is not used there", () => {
    // Measured, not assumed: the large-sample formula reports significance at
    // n = 5 that enumerating all 120 orderings does not support.
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 2, 3, 5, 4];
    const exact = spearmanExactP(xs, ys);
    const approx = spearmanApproxP(spearman(xs, ys), 5);
    expect(approx).toBeLessThan(0.05);
    expect(exact).toBeGreaterThan(0.05);
  });

  it("says nothing with fewer than three pairs", () => {
    expect(spearmanP([1, 2], [1, 2]).p).toBe(1);
  });

  it("is deterministic", () => {
    const xs = [3, 1, 4, 1, 5, 9];
    const ys = [2, 7, 1, 8, 2, 8];
    expect(spearmanP(xs, ys)).toEqual(spearmanP(xs, ys));
  });
});
