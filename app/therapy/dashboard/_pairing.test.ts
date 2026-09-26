import { describe, it, expect } from "vitest";
import {
  RECALL_WINDOW_DAYS,
  describePairing,
  pairDoseWithScores,
  type DoseSession,
  type ScoredAssessment,
} from "./_pairing";

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;
const label = (ms: number) => `d${Math.round((ms - T0) / DAY)}`;

const assess = (day: number, total: number, instrument: "gad7" | "phq9" = "gad7"): ScoredAssessment => ({
  at: T0 + day * DAY,
  instrument,
  total,
});
const practice = (day: number, completedMin = 20): DoseSession => ({
  at: T0 + day * DAY,
  completedMin,
});

describe("the lookback window", () => {
  it("is the instrument's own recall window", () => {
    // Both instruments ask "over the last 2 weeks", so that is the only span
    // of practice a score could plausibly reflect.
    expect(RECALL_WINDOW_DAYS).toBe(14);
  });

  it("counts practice inside the window and nothing outside it", () => {
    const p = pairDoseWithScores(
      [assess(20, 12)],
      [practice(5), practice(10), practice(19)],
      "gad7",
      label
    );
    // Day 5 is 15 days before the assessment — outside. 10 and 19 are inside.
    expect(p.pairs[0].dose).toBe(40);
  });

  it("does not count practice done AFTER the score it would explain", () => {
    // A window centred on the assessment would let later practice into the
    // pair, which builds the conclusion into the measurement.
    const p = pairDoseWithScores([assess(10, 12)], [practice(11), practice(12)], "gad7", label);
    expect(p.pairs[0].dose).toBe(0);
  });

  it("includes practice logged at the same moment as the assessment", () => {
    const p = pairDoseWithScores([assess(10, 12)], [practice(10)], "gad7", label);
    expect(p.pairs[0].dose).toBe(20);
  });

  it("accepts a different window when the caller has a reason", () => {
    const p = pairDoseWithScores([assess(20, 12)], [practice(5)], "gad7", label, 30);
    expect(p.windowDays).toBe(30);
    expect(p.pairs[0].dose).toBe(20);
  });
});

describe("what a pair is made of", () => {
  it("one pair per administration, in time order", () => {
    const p = pairDoseWithScores([assess(28, 9), assess(0, 15), assess(14, 12)], [], "gad7", label);
    expect(p.pairs.map((x) => x.outcome)).toEqual([15, 12, 9]);
  });

  it("keeps a baseline with no practice as a real zero", () => {
    // The first assessment is usually taken before anything starts. A dose of
    // zero is data, not a missing value.
    const p = pairDoseWithScores([assess(0, 16), assess(20, 10)], [practice(15)], "gad7", label);
    expect(p.pairs[0].dose).toBe(0);
    expect(p.pairs.length).toBe(2);
  });

  it("drops the other instrument rather than mixing the scales", () => {
    const p = pairDoseWithScores(
      [assess(0, 15, "gad7"), assess(1, 20, "phq9"), assess(20, 9, "gad7")],
      [],
      "gad7",
      label
    );
    expect(p.pairs.length).toBe(2);
  });

  it("ignores negative minutes instead of subtracting them", () => {
    const p = pairDoseWithScores([assess(10, 12)], [practice(5, -100), practice(6, 20)], "gad7", label);
    expect(p.pairs[0].dose).toBe(20);
  });

  it("labels each pair with its assessment's date", () => {
    const p = pairDoseWithScores([assess(7, 12)], [], "gad7", label);
    expect(p.pairs[0].label).toBe("d7");
  });
});

describe("overlap, which the p-value cannot see by itself", () => {
  it("counts pairs whose windows share practice", () => {
    // Assessments a week apart with a fortnight window share seven days of
    // practice, so the two pairs are not independent.
    const p = pairDoseWithScores([assess(0, 15), assess(7, 13), assess(14, 12)], [], "gad7", label);
    expect(p.overlappingPairs).toBe(2);
  });

  it("counts none when the assessments are spaced at least the window apart", () => {
    const p = pairDoseWithScores([assess(0, 15), assess(14, 13), assess(28, 12)], [], "gad7", label);
    expect(p.overlappingPairs).toBe(0);
  });

  it("says so in the description, and says which way it biases the result", () => {
    const overlapping = pairDoseWithScores([assess(0, 15), assess(3, 13)], [], "gad7", label);
    const note = describePairing(overlapping);
    expect(note).toContain("ซ้อนทับ");
    expect(note).toContain("ดูดีกว่าความเป็นจริง");
  });

  it("describes a clean pairing without inventing a caveat", () => {
    const clean = pairDoseWithScores([assess(0, 15), assess(20, 12)], [], "gad7", label);
    expect(describePairing(clean)).toContain("ไม่มีช่วงใดซ้อนทับ");
  });

  it("says plainly when there is nothing to pair", () => {
    expect(describePairing(pairDoseWithScores([], [], "gad7", label))).toContain("ยังไม่มีผลประเมิน");
  });
});

describe("determinism", () => {
  it("the same inputs give the same pairs, in any store order", () => {
    const a = [assess(20, 9), assess(0, 15), assess(10, 12)];
    const s = [practice(18), practice(2), practice(9)];
    const first = pairDoseWithScores(a, s, "gad7", label);
    const second = pairDoseWithScores(a.slice().reverse(), s.slice().reverse(), "gad7", label);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
