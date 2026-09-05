import { describe, it, expect } from "vitest";
import { confusion, labelCases, walkForward, benchmark, verdictPredictor, BASELINES, skill, permutationTest, type LabeledCase, type Predictor } from "./validation";
import { syntheticUniverse, byTicker } from "./fixtures";
import { healthy } from "./testkit";

function cases(noise: number, seed = 42): LabeledCase[] {
  const out: LabeledCase[] = [];
  byTicker(syntheticUniverse({ firms: 40, years: 12, noise, seed })).forEach((s) => out.push(...labelCases(s)));
  return out;
}
const lossOnly = BASELINES[1];
const neverCut = BASELINES[0];

describe("confusion metrics", () => {
  it("computes the counts and the disclosed ratios; undefined ratios are null", () => {
    const m = confusion([true, true, false, false, true], [true, false, false, true, true]);
    expect([m.tp, m.fp, m.fn, m.tn]).toEqual([2, 1, 1, 1]);
    expect(m.precision).toBeCloseTo(2 / 3);
    expect(m.recall).toBeCloseTo(2 / 3);
    expect(m.specificity).toBeCloseTo(1 / 2);
    expect(m.balancedAccuracy).toBeCloseTo((2 / 3 + 1 / 2) / 2);
    expect(confusion([false, false], [false, false]).recall).toBeNull();
  });
});

describe("labelCases", () => {
  it("labels a cut as DPS falling next year, counts omissions, and only for current payers", () => {
    const s = [0.5, 0.5, 0.4, 0, 0].map((dps, i) => healthy({ fiscalYear: 2020 + i, dps }));
    const c = labelCases(s);
    expect(c.map((x) => [x.year, x.cutNextYear])).toEqual([
      [2021, true], // 0.5 → 0.4
      [2022, true], // 0.4 → 0 (omission)
    ]);
    // 2020 needs 2 years of history (minHistory); 2023/2024 pay nothing → not cases
  });
});

describe("walk-forward with embargo", () => {
  it("never trains on the year before the test year (embargo 1) and refits per fold", () => {
    const seen: number[][] = [];
    const spy: Predictor = { name: "spy", fit: (t) => seen.push(Array.from(new Set(t.map((c) => c.year)))), predict: () => false };
    const r = walkForward(cases(0.1), spy, { embargo: 1, minTrainYears: 3 });
    for (const f of r.folds) {
      expect(Math.max(...f.trainYears)).toBeLessThanOrEqual(f.year - 2);
      expect(f.trainYears.length).toBeGreaterThanOrEqual(3);
    }
    expect(seen.length).toBe(r.folds.length);
    expect(r.metrics.n).toBe(r.predictions.length);
  });

  it("keeps a confusion per test year so a one-regime model cannot hide in the pooled number", () => {
    const cs = cases(0.1);
    const r = walkForward(cs, lossOnly);
    expect(r.folds.reduce((a, f) => a + f.metrics.n, 0)).toBe(r.metrics.n);
    expect(r.folds.reduce((a, f) => a + f.metrics.tp, 0)).toBe(r.metrics.tp);
    const b = benchmark(cs, lossOnly, { baselines: [neverCut], draws: 10 });
    expect(b.byYear.map((y) => y.year)).toEqual(r.folds.map((f) => f.year));
    expect(b.byYear.every((y) => y.cuts <= y.n)).toBe(true);
    if (b.worstYear) {
      const defined = b.byYear.filter((y) => y.balancedAccuracy !== null).map((y) => y.balancedAccuracy as number);
      expect(b.worstYear.balancedAccuracy).toBe(Math.min(...defined));
    }
  });
});

describe("harness integrity (synthetic universe with a planted loss→cut mechanism)", () => {
  it("detects the planted mechanism: 'loss-only' beats never-cut with positive skill and survives permutation", () => {
    const b = benchmark(cases(0.1), lossOnly, { baselines: [neverCut], draws: 100 });
    expect(b.baselines[0].skill as number).toBeGreaterThan(0.1);
    expect(b.permutation.pValue).toBeLessThan(0.05);
    expect(b.adequateModelFound).toBe(true);
  });

  it("a deliberately wrong model (inverted rule) scores NEGATIVE skill", () => {
    const wrong: Predictor = { name: "anti-loss", predict: (c) => !lossOnly.predict(c) };
    const cs = cases(0.1);
    const m = walkForward(cs, wrong).metrics;
    expect(skill(m, walkForward(cs, neverCut).metrics) as number).toBeLessThan(0);
    expect(benchmark(cs, wrong, { draws: 50 }).adequateModelFound).toBe(false);
  });

  it("no false discovery on coin-flip labels: nothing is flagged adequate", () => {
    const cs = cases(1.0);
    for (const p of [lossOnly, BASELINES[2], verdictPredictor()]) {
      const b = benchmark(cs, p, { draws: 100 });
      expect(b.adequateModelFound).toBe(false);
    }
    expect(permutationTest(cs, verdictPredictor(), 100).pValue).toBeGreaterThanOrEqual(0.05);
  });

  it("refuses to crown the composite verdict when it does not beat the single-rule baselines — 'no signal claimed'", () => {
    // The generator's true mechanism IS loss + coverage, so the extra gates
    // can only add false positives here. The harness must say so rather than
    // rank the composite anyway. Its worth is decided on real filings, not here.
    const b = benchmark(cases(0.1), verdictPredictor(), { draws: 50 });
    expect(b.baselines.find((x) => x.name === "never-cut")!.skill as number).toBeGreaterThan(0);
    expect(b.adequateModelFound).toBe(false);
    expect(b.verdict).toMatch(/no signal claimed|not distinguishable/);
  });
});
