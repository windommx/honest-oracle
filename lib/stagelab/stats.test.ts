import { describe, it, expect } from "vitest";
import { percentileOf, percentileSorted, selectKth } from "./stats";

// The selection routine replaced a sort-per-column in the Monte Carlo, so it is
// tested against the thing it replaced: a brute-force sort. Any input where the
// two disagree is a bug in the fast path, and the adversarial inputs below
// (already sorted, reverse sorted, all-equal) are the ones that break naive
// quickselect implementations.

function bruteForce(values: number[], p: number): number {
  return percentileSorted([...values].sort((a, b) => a - b), p);
}

const CASES: Record<string, number[]> = {
  random: [17, 3, 99, 42, 8, 61, 25, 4, 77, 51, 33, 12],
  ascending: Array.from({ length: 200 }, (_, i) => i),
  descending: Array.from({ length: 200 }, (_, i) => 200 - i),
  allEqual: new Array(64).fill(7),
  twoValues: [...new Array(32).fill(1), ...new Array(32).fill(9)],
  negatives: [-50, -3, -18, 0, 4, -99, 12, -7],
  single: [42],
  pair: [10, 20],
};

describe("selectKth", () => {
  it("returns the same order statistic as a sort, for every k", () => {
    for (const [name, values] of Object.entries(CASES)) {
      const sorted = [...values].sort((a, b) => a - b);
      for (let k = 0; k < values.length; k++) {
        const got = selectKth(Float64Array.from(values), k);
        expect(got, `${name}[${k}]`).toBe(sorted[k]);
      }
    }
  });

  it("clamps an out-of-range k rather than reading past the buffer", () => {
    const values = [5, 1, 9];
    expect(selectKth(Float64Array.from(values), -10)).toBe(1);
    expect(selectKth(Float64Array.from(values), 99)).toBe(9);
  });

  it("handles an empty buffer", () => {
    expect(selectKth(new Float64Array(0), 0)).toBe(0);
  });

  it("stays fast on already-sorted input", () => {
    // Near-sorted columns are the common case (equity curves rise together)
    // and the pathological one for a naive pivot. 20k elements would take
    // ~200M comparisons at O(n²); this completes in milliseconds.
    const n = 20_000;
    const ascending = Float64Array.from({ length: n }, (_, i) => i);
    const started = Date.now();
    expect(selectKth(ascending, n >> 1)).toBe(n >> 1);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("percentileOf", () => {
  it("agrees with a brute-force sort across the percentile range", () => {
    for (const [name, values] of Object.entries(CASES)) {
      for (const p of [0, 5, 25, 50, 75, 95, 100]) {
        const fast = percentileOf(Float64Array.from(values), p);
        expect(fast, `${name} p${p}`).toBeCloseTo(bruteForce(values, p), 9);
      }
    }
  });

  it("interpolates on an even count instead of picking a side", () => {
    // p50 of [10, 20] is 15, not 10 or 20.
    expect(percentileOf(Float64Array.from([10, 20]), 50)).toBe(15);
  });

  it("clamps percentiles outside 0..100", () => {
    const values = Float64Array.from([1, 2, 3]);
    expect(percentileOf(values, -20)).toBe(1);
    expect(percentileOf(Float64Array.from([1, 2, 3]), 400)).toBe(3);
  });

  it("returns zero for an empty buffer rather than NaN", () => {
    expect(percentileOf(new Float64Array(0), 50)).toBe(0);
  });
});
