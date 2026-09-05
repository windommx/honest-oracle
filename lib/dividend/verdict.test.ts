import { describe, it, expect } from "vitest";
import { assess } from "./verdict";
import { DEFAULT_POLICY } from "./types";
import { healthy, priorYear, threeYears } from "./testkit";

const rules = (h: ReturnType<typeof threeYears>) => assess(h).reasons.map((r) => r.rule);

describe("verdict rule set", () => {
  it("a covered, improving, three-year payer is 'sustain' with no reasons and echoes its policy", () => {
    const a = assess(threeYears());
    expect(a.verdict).toBe("sustain");
    expect(a.reasons).toEqual([]);
    expect(a.flags).toEqual([]);
    expect(a.policy).toBe(DEFAULT_POLICY);
    expect(a.fScore?.score).toBe(9);
  });

  it("an annual loss is a hard gate (DeAngelo, DeAngelo & Skinner 1992)", () => {
    const a = assess(threeYears({ netIncome: -20, eps: -0.2 }));
    expect(a.verdict).toBe("at-risk");
    expect(a.reasons[0].rule).toBe("loss");
    expect(a.reasons[0].tier).toBe("paccakkha");
    expect(a.reasons[0].source).toMatch(/DeAngelo/);
  });

  it("payout above 100% of EPS for two consecutive years is at-risk; one year is only watch", () => {
    const one = assess([priorYear({ fiscalYear: 2023 }), priorYear(), healthy({ dps: 1.2, dividendsPaid: 120 })]);
    expect(one.verdict).toBe("watch");
    expect(one.reasons.map((r) => r.rule)).toContain("payout_eps_1y");
    const two = assess([priorYear({ fiscalYear: 2023 }), priorYear({ dps: 1.0, dividendsPaid: 100 }), healthy({ dps: 1.2, dividendsPaid: 120 })]);
    expect(two.verdict).toBe("at-risk");
    expect(two.reasons.map((r) => r.rule)).toContain("payout_eps_2y");
  });

  it("uncovered FCF is at-risk only when cash runway also fails; otherwise watch", () => {
    // fcf = 30 − 40 = −10 → uncovered; runway (100 − 10 − 20)/50 = 1.4 ≥ 1 → watch
    expect(assess(threeYears({ cfo: 30 })).verdict).toBe("watch");
    expect(rules(threeYears({ cfo: 30 }))).toContain("fcf_uncovered_runway_ok");
    // same but cash 40 → runway 0.2 → at-risk
    const a = assess(threeYears({ cfo: 30, cash: 40 }));
    expect(a.verdict).toBe("at-risk");
    expect(a.reasons.map((r) => r.rule)).toContain("fcf_uncovered");
  });

  it("Altman distress and the double leverage breach are hard gates", () => {
    const d = assess(threeYears({ ebit: -50, retainedEarnings: -400, currentAssets: 60, totalLiabilities: 950, netIncome: 1, eps: 0.01 }));
    expect(d.reasons.map((r) => r.rule)).toContain("altman_distress");
    const l = assess(threeYears({ longTermDebt: 900, shortTermDebt: 100, interestExpense: 100 }));
    expect(l.reasons.map((r) => r.rule)).toContain("leverage");
    expect(l.verdict).toBe("at-risk");
  });

  it("quality gates downgrade to watch: short streak, weak F-score, grey Altman zone", () => {
    expect(rules([priorYear(), healthy()])).toContain("streak"); // streak 2 < 3
    const weak = assess(threeYears({ sharesOutstanding: 110, cfo: 90, revenue: 900, grossProfit: 340, currentAssets: 250, longTermDebt: 230 }));
    expect(weak.reasons.map((r) => r.rule)).toContain("f_score");
    expect(weak.verdict).toBe("watch");
  });

  it("Beneish and yield-trap are flags (saññā) that never change the verdict by themselves", () => {
    const cooked = assess(threeYears({ receivables: 300, cfo: 20, cash: 300 }));
    expect(cooked.flags.map((f) => f.rule)).toContain("beneish");
    expect(cooked.flags.find((f) => f.rule === "beneish")?.tier).toBe("sanna");
    const trap = assess(threeYears({ price: 5, dps: 1.2, dividendsPaid: 120 }));
    expect(trap.flags.map((f) => f.rule)).toContain("yield_trap");
    expect(trap.verdict).toBe("watch"); // from payout_eps_1y, not from the flag
  });

  it("an extreme dividend yield is a watch gate with a disclosed threshold (Welch & Goyal 2025)", () => {
    // dps 0.5 on price 3 → 16.7% yield; payout stays 0.5 so nothing else fires
    const a = assess(threeYears({ price: 3 }));
    expect(a.verdict).toBe("watch");
    const r = a.reasons.find((x) => x.rule === "yield_extreme");
    expect(r?.tier).toBe("anumana");
    expect(r?.detail).toMatch(/16\.7% > 12%/);
    expect(r?.source).toMatch(/Welch & Goyal 2025/);
    // policy is echoed, so the threshold is never hidden
    expect(a.policy.yieldExtreme).toBe(0.12);
    expect(assess(threeYears({ price: 5 })).reasons.map((x) => x.rule)).not.toContain("yield_extreme"); // 10%
  });

  it("a missing Beneish input is reported as avisaya, not silently skipped", () => {
    const a = assess(threeYears({ receivables: undefined }));
    expect(a.flags.find((f) => f.rule === "beneish_not_computable")?.tier).toBe("avisaya");
  });

  it("is deterministic and pure", () => {
    const h = threeYears();
    expect(assess(h)).toEqual(assess(h));
    expect(() => assess([])).toThrow();
  });
});
