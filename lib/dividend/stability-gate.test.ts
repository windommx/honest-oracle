import { describe, it, expect } from "vitest";
import { stabilityGate, perturbRecord, DEFAULT_STABILITY } from "./stability-gate";
import { healthy, priorYear, threeYears } from "./testkit";

describe("stability gate (perturb → re-resolve → count)", () => {
  it("a comfortably covered firm holds its verdict under every draw and passes", () => {
    const s = stabilityGate(threeYears());
    expect(s.base.verdict).toBe("sustain");
    expect(s.k).toBe(8);
    expect(s.agree).toBe(8);
    expect(s.stability).toBe(1);
    expect(s.pass).toBe(true);
    expect(s.final).toBe("sustain");
    expect(s.draws).toHaveLength(8);
  });

  it("a firm sitting on a threshold flips under filing-sized noise and is refused (avisaya)", () => {
    // payout 0.98 of EPS, runway thin: a ±10% earnings shock crosses the payout gate
    const h = [priorYear({ fiscalYear: 2023 }), priorYear({ dps: 0.98, dividendsPaid: 98 }), healthy({ dps: 0.98, dividendsPaid: 98, cash: 30 })];
    const s = stabilityGate(h);
    expect(s.base.verdict).toBe("sustain"); // the point estimate looks fine…
    expect(s.counts.sustain + s.counts.watch + s.counts["at-risk"]).toBe(8);
    expect(s.agree).toBeLessThan(6); // …but it does not survive the draws
    expect(s.pass).toBe(false);
    expect(s.final).toBe("avisaya");
  });

  it("is reproducible: same filing + same seed → identical draws; a new seed changes draws, not the base", () => {
    const a = stabilityGate(threeYears());
    const b = stabilityGate(threeYears());
    expect(a.draws).toEqual(b.draws);
    const c = stabilityGate(threeYears(), undefined, { ...DEFAULT_STABILITY, seed: 1 });
    expect(c.draws.map((d) => d.earningsFactor)).not.toEqual(a.draws.map((d) => d.earningsFactor));
    expect(c.base.verdict).toBe(a.base.verdict);
  });

  it("discloses its schedule: the earnings shock is the firm's own EPS volatility, clamped", () => {
    const flat = stabilityGate(threeYears());
    expect(flat.schedule.earningsShock).toBe(0.1); // vol ≈ 0.1 floor
    const wild = stabilityGate([healthy({ fiscalYear: 2022, eps: 1 }), healthy({ fiscalYear: 2023, eps: 3 }), healthy({ fiscalYear: 2024, eps: 0.5 }), healthy()]);
    expect(wild.schedule.earningsShock).toBe(0.5); // capped
    expect(flat.schedule.seed).toBe(DEFAULT_STABILITY.seed);
  });

  it("every 4th draw is a 'quarter drop' (×0.75) rather than a random shock", () => {
    const s = stabilityGate(threeYears());
    expect(s.draws[3].earningsFactor).toBe(0.75);
    expect(s.draws[7].cfoFactor).toBe(0.75);
    expect(s.draws[0].earningsFactor).not.toBe(0.75);
  });

  it("perturbRecord scales only the fields it claims to", () => {
    const p = perturbRecord(healthy(), { earnings: 1.1, cfo: 0.9, debt: 1.2, price: 0.8 });
    expect(p.netIncome).toBeCloseTo(110);
    expect(p.eps).toBeCloseTo(1.1);
    expect(p.cfo).toBeCloseTo(126);
    expect(p.longTermDebt).toBeCloseTo(240);
    expect(p.price).toBeCloseTo(8);
    expect(p.dps).toBe(0.5); // untouched
    expect(p.totalAssets).toBe(1000);
  });
});
