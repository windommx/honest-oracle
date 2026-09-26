import { describe, it, expect } from "vitest";
import { ALPHA, associate, criticalRho, minimumPairs, type PairedObservation } from "./association";
import { spearmanExactP } from "./stats";

const pair = (label: string, dose: number, outcome: number): PairedObservation => ({
  label,
  dose,
  outcome,
});

/** n periods where more practice goes with a lower score, perfectly. */
const perfect = (n: number) =>
  Array.from({ length: n }, (_, i) => pair(`w${i + 1}`, i * 10, 20 - i));

describe("the arithmetic floor", () => {
  it("is five pairs at the usual alpha", () => {
    // 2/4! = .083 > .05, 2/5! = .017 < .05. Computed, not asserted.
    expect(minimumPairs(0.05)).toBe(5);
  });

  it("moves with alpha, because it is arithmetic and not a convention", () => {
    expect(minimumPairs(0.1)).toBe(4);
    expect(minimumPairs(0.01)).toBe(6);
  });

  it("agrees with what the exact test can actually attain", () => {
    // The floor's claim, checked against the test it is a claim about: at one
    // pair below the floor, even a perfect fit cannot clear alpha.
    const below = minimumPairs(ALPHA) - 1;
    const xs = Array.from({ length: below }, (_, i) => i);
    expect(spearmanExactP(xs, xs)).toBeGreaterThan(ALPHA);
    const atFloor = Array.from({ length: minimumPairs(ALPHA) }, (_, i) => i);
    expect(spearmanExactP(atFloor, atFloor)).toBeLessThanOrEqual(ALPHA);
  });
});

describe("the bar a given sample size has to clear", () => {
  it("reproduces the published critical values for Spearman's rho", () => {
    // Two-tailed .05, from any table of critical values for rho.
    expect(criticalRho(5)).toBeCloseTo(1.0, 2);
    expect(criticalRho(6)).toBeCloseTo(0.886, 2);
    expect(criticalRho(7)).toBeCloseTo(0.786, 2);
    expect(criticalRho(8)).toBeCloseTo(0.738, 2);
  });

  it("falls as the sample grows", () => {
    const values = [5, 6, 7, 8, 10, 15, 30, 60].map((n) => criticalRho(n));
    for (let i = 1; i < values.length; i++) {
      expect(values[i], `n index ${i}`).toBeLessThanOrEqual(values[i - 1]);
    }
  });

  it("stays below 1 once a test is possible at all", () => {
    for (const n of [6, 9, 12, 40]) {
      expect(criticalRho(n)).toBeLessThan(1);
      expect(criticalRho(n)).toBeGreaterThan(0);
    }
  });

  it("is 1 below the floor — nothing can clear it there", () => {
    expect(criticalRho(4)).toBe(1);
    expect(criticalRho(2)).toBe(1);
  });

  it("the exact and approximate regimes meet without a jump", () => {
    // n = 8 is enumerated and n = 9 is approximated; a large discontinuity
    // between them would mean one of the two branches was wrong.
    expect(Math.abs(criticalRho(9) - criticalRho(8))).toBeLessThan(0.08);
  });

  it("caches without changing the answer", () => {
    expect(criticalRho(7)).toBe(criticalRho(7));
  });
});

describe("refusing to compute what cannot be computed", () => {
  it("says nothing at all below the floor", () => {
    const r = associate(perfect(4));
    expect(r.verdict).toBe("impossible");
    expect(r.rho).toBeNull();
    expect(r.p).toBeNull();
    expect(r.noteTh).toContain("5");
  });

  it("gives no number even when the four points are perfect", () => {
    // The seductive case: four points in a perfect line. A trend line here is
    // the exact thing this module exists to refuse.
    const r = associate(perfect(4));
    expect(r.rho).toBeNull();
  });

  it("refuses when one side never varies", () => {
    const flat = Array.from({ length: 8 }, (_, i) => pair(`w${i}`, 20, 15 - i));
    const r = associate(flat);
    expect(r.verdict).toBe("impossible");
    expect(r.rho).toBeNull();
    expect(r.noteTh).toContain("ความแปรปรวน");
  });

  it("refuses an empty course rather than throwing", () => {
    const r = associate([]);
    expect(r.n).toBe(0);
    expect(r.verdict).toBe("impossible");
  });
});

describe("a real but inconclusive result", () => {
  const noisy: PairedObservation[] = [
    pair("w1", 0, 14),
    pair("w2", 40, 12),
    pair("w3", 20, 15),
    pair("w4", 60, 11),
    pair("w5", 10, 13),
    pair("w6", 30, 14),
  ];

  it("reports the value and that it did not clear the bar", () => {
    const r = associate(noisy);
    expect(r.verdict).toBe("inconclusive");
    expect(r.rho).not.toBeNull();
    expect(Math.abs(r.rho!)).toBeLessThan(r.requiredRho);
  });

  it("says the data was too small to see it, NOT that there is no effect", () => {
    // The single most important sentence in the module. A null result from an
    // underpowered test is not evidence of absence, and phrasing it as such
    // is how a tracker talks someone out of a treatment that works.
    const r = associate(noisy);
    expect(r.noteTh).toContain("ไม่ใช่ว่าไม่มีผล");
  });

  it("prints the bar the sample size set", () => {
    const r = associate(noisy);
    expect(r.noteTh).toContain(r.requiredRho.toFixed(2));
  });
});

describe("a result worth taking to someone", () => {
  it("clears the bar when the relationship really is that strong", () => {
    const r = associate(perfect(6));
    expect(r.verdict).toBe("worth-discussing");
    expect(r.p!).toBeLessThan(ALPHA);
    expect(r.rho!).toBeLessThan(0);
  });

  it("names the direction in the scale's own terms", () => {
    // Higher score = more symptoms on both instruments, so a NEGATIVE rho is
    // the direction that favours practising. Getting this backwards would
    // congratulate someone on getting worse.
    expect(associate(perfect(6)).noteTh).toContain("คะแนนอาการต่ำลง");
    const reversed = Array.from({ length: 6 }, (_, i) => pair(`w${i}`, i * 10, 8 + i));
    expect(associate(reversed).noteTh).toContain("คะแนนอาการสูงขึ้น");
  });

  it("still refuses to claim a cause, at the strongest verdict there is", () => {
    const r = associate(perfect(7));
    expect(r.verdict).toBe("worth-discussing");
    expect(r.noteTh).toContain("ทิศทางของเหตุไม่ได้");
    expect(r.noteTh).toContain("คนเดียว");
  });

  it("uses the exact test at the sizes this product produces", () => {
    expect(associate(perfect(6)).exact).toBe(true);
    expect(associate(perfect(12)).exact).toBe(false);
  });

  it("never emits a field that could be rendered as a causal claim", () => {
    const r = associate(perfect(6));
    expect(Object.keys(r).sort()).toEqual(
      ["exact", "minimumPairs", "n", "noteTh", "p", "requiredRho", "rho", "verdict"].sort()
    );
  });
});

describe("determinism", () => {
  it("the same pairs give the same answer", () => {
    const pairs = perfect(6);
    expect(JSON.stringify(associate(pairs))).toBe(JSON.stringify(associate(pairs)));
  });

  it("ranks make it robust to one enormous week", () => {
    // A self-tracker's outlier week should not be able to manufacture or
    // destroy a finding on its own, which is why this is Spearman.
    const base = perfect(6);
    const withOutlier = base.map((p, i) => (i === 5 ? { ...p, dose: 100000 } : p));
    expect(associate(withOutlier).rho).toBeCloseTo(associate(base).rho!, 12);
  });
});
