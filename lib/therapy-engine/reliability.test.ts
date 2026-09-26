import { describe, it, expect } from "vitest";
import {
  OUTCOME_LABEL,
  PSYCHOMETRICS,
  RCI_Z,
  noiseBand,
  reliableChange,
  reliableChangePoints,
  standardErrorOfDifference,
  standardErrorOfMeasurement,
  summariseOutcome,
  type Administration,
} from "./reliability";
import { BANDS, CUTPOINTS, MCID, score } from "./scoring";
import type { InstrumentId } from "./types";

/** Responses summing to `total`, for an instrument whose items take 0..3. */
function answersFor(id: InstrumentId, total: number): number[] {
  const items = id === "gad7" ? 7 : 9;
  const out = new Array(items).fill(0);
  let left = total;
  for (let i = 0; i < items && left > 0; i++) {
    const take = Math.min(3, left);
    out[i] = take;
    left -= take;
  }
  if (left > 0) throw new RangeError(`${total} is above the maximum for ${id}`);
  return out;
}

const at = (id: InstrumentId, total: number) => score(id, answersFor(id, total));

describe("the standard errors", () => {
  it("a perfectly reliable instrument would have no measurement error", () => {
    // Sanity on the formula itself: SEm = SD × √(1 − α), so α = 1 gives zero.
    const sd = PSYCHOMETRICS.gad7.sd;
    expect(sd * Math.sqrt(1 - 1)).toBe(0);
  });

  it("the difference carries BOTH measurements' error, not one", () => {
    // The √2 is the part most easily left out, and leaving it out understates
    // the threshold by 41% — turning noise into 'progress'.
    for (const id of ["gad7", "phq9"] as const) {
      expect(standardErrorOfDifference(id)).toBeCloseTo(
        Math.SQRT2 * standardErrorOfMeasurement(id),
        12
      );
      expect(standardErrorOfDifference(id)).toBeGreaterThan(standardErrorOfMeasurement(id));
    }
  });

  it("matches the published psychometrics it is derived from", () => {
    // GAD-7: α = .92, SD = 5.1 → SEm 1.4425, S_diff 2.0400, ×1.96 = 3.998
    expect(standardErrorOfMeasurement("gad7")).toBeCloseTo(1.4425, 4);
    expect(standardErrorOfDifference("gad7")).toBeCloseTo(2.0400, 4);
    expect(standardErrorOfDifference("gad7") * RCI_Z).toBeCloseTo(3.998, 3);
    // PHQ-9: α = .89, SD = 6.1 → SEm 2.0231, S_diff 2.8611, ×1.96 = 5.608
    expect(standardErrorOfMeasurement("phq9")).toBeCloseTo(2.0231, 4);
    expect(standardErrorOfDifference("phq9")).toBeCloseTo(2.86115, 4);
    expect(standardErrorOfDifference("phq9") * RCI_Z).toBeCloseTo(5.608, 3);
  });

  it("a less reliable instrument needs a bigger change to be believed", () => {
    expect(PSYCHOMETRICS.phq9.alpha).toBeLessThan(PSYCHOMETRICS.gad7.alpha);
    expect(reliableChangePoints("phq9")).toBeGreaterThan(reliableChangePoints("gad7"));
  });
});

describe("the point threshold", () => {
  it("is 4 for GAD-7 and 6 for PHQ-9", () => {
    expect(reliableChangePoints("gad7")).toBe(4);
    expect(reliableChangePoints("phq9")).toBe(6);
  });

  it("rounds UP, so it never claims reliability the arithmetic does not support", () => {
    // GAD-7's raw threshold is 3.998. Rounding to nearest would print 4 and
    // admit a change of 3.998 — which no whole-point score can express, but
    // the rounding direction is the part that has to be deliberate.
    for (const id of ["gad7", "phq9"] as const) {
      const raw = standardErrorOfDifference(id) * RCI_Z;
      expect(reliableChangePoints(id)).toBeGreaterThanOrEqual(raw);
      expect(reliableChangePoints(id)).toBeLessThan(raw + 1);
    }
  });

  it("PHQ-9's conventional MCID is BELOW its reliable-change threshold", () => {
    // Not a bug — a real and under-appreciated fact about these two
    // conventions, and the reason this module exists alongside trend.ts: a
    // 5-point PHQ-9 change "meets the clinically important difference" while
    // being statistically indistinguishable from answering twice.
    expect(MCID.phq9.points).toBe(5);
    expect(reliableChangePoints("phq9")).toBe(6);
    expect(MCID.phq9.points).toBeLessThan(reliableChangePoints("phq9"));
  });
});

describe("classifying a change", () => {
  it("a small drop is not change, however encouraging it looks", () => {
    const c = reliableChange(at("gad7", 12), at("gad7", 10));
    expect(c.deltaPoints).toBe(-2);
    expect(c.reliable).toBe(false);
    expect(c.category).toBe("unchanged");
    expect(c.noteTh).toContain("4");
  });

  it("a drop past the threshold, still in the clinical range, is improvement", () => {
    const c = reliableChange(at("gad7", 18), at("gad7", 12));
    expect(c.deltaPoints).toBe(-6);
    expect(c.reliable).toBe(true);
    expect(c.toClinical).toBe(true);
    expect(c.category).toBe("improved");
  });

  it("a reliable drop across the cut-point is recovery, in the screening sense", () => {
    const c = reliableChange(at("gad7", 15), at("gad7", 4));
    expect(c.fromClinical).toBe(true);
    expect(c.toClinical).toBe(false);
    expect(c.category).toBe("recovered");
    // The word is load-bearing and must be qualified where it is used.
    expect(c.noteTh).toContain("คัดกรอง");
  });

  it("crossing the cut-point without a reliable change is NOT recovery", () => {
    // 10 → 9 crosses GAD-7's cut-point of 10 by one point. The line moved
    // under the measurement, not the other way round.
    const c = reliableChange(at("gad7", 10), at("gad7", 9));
    expect(c.fromClinical).toBe(true);
    expect(c.toClinical).toBe(false);
    expect(c.reliable).toBe(false);
    expect(c.category).toBe("unchanged");
  });

  it("a reliable rise is deterioration, and says to review the plan", () => {
    const c = reliableChange(at("phq9", 6), at("phq9", 16));
    expect(c.category).toBe("deteriorated");
    expect(c.noteTh).toContain("ทบทวนแผน");
  });

  it("identical scores are unchanged, with an rci of exactly zero", () => {
    const c = reliableChange(at("phq9", 11), at("phq9", 11));
    expect(c.rci).toBe(0);
    expect(c.category).toBe("unchanged");
  });

  it("keeps the sign, so the direction survives the arithmetic", () => {
    expect(reliableChange(at("gad7", 15), at("gad7", 5)).rci).toBeLessThan(0);
    expect(reliableChange(at("gad7", 5), at("gad7", 15)).rci).toBeGreaterThan(0);
  });

  it("reports MCID separately rather than folding it into the verdict", () => {
    // A PHQ-9 change of 5: meets the conventional MCID, does not clear
    // measurement error. Both facts have to be visible.
    const c = reliableChange(at("phq9", 15), at("phq9", 10));
    expect(c.meetsMcid).toBe(true);
    expect(c.reliable).toBe(false);
    expect(c.category).toBe("unchanged");
  });

  it("refuses to subtract one scale from another", () => {
    expect(() => reliableChange(at("gad7", 10), at("phq9", 10))).toThrow(TypeError);
  });

  it("always carries the caveat about what it cannot show", () => {
    for (const c of [
      reliableChange(at("gad7", 18), at("gad7", 6)),
      reliableChange(at("gad7", 18), at("gad7", 12)),
      reliableChange(at("phq9", 5), at("phq9", 20)),
    ]) {
      expect(c.noteTh).toContain("regression to the mean");
    }
  });

  it("every category has a label in both languages", () => {
    for (const key of ["recovered", "improved", "unchanged", "deteriorated"] as const) {
      expect(OUTCOME_LABEL[key].th.length).toBeGreaterThan(0);
      expect(OUTCOME_LABEL[key].en.length).toBeGreaterThan(0);
    }
  });
});

describe("summarising a course of administrations", () => {
  const day = 86_400_000;
  const admin = (id: InstrumentId, total: number, dayIndex: number): Administration => ({
    at: dayIndex * day,
    score: at(id, total),
  });

  it("one score is not an outcome", () => {
    const s = summariseOutcome("gad7", [admin("gad7", 14, 0)]);
    expect(s.overall).toBeNull();
    expect(s.latest).toBeNull();
    expect(s.noteTh).toContain("ครั้งเดียว");
  });

  it("no score at all says so rather than showing zeros", () => {
    const s = summariseOutcome("gad7", []);
    expect(s.administrations).toBe(0);
    expect(s.noteTh).toBe("ยังไม่มีผลประเมิน");
  });

  it("compares first to last for the course, and the last pair for the step", () => {
    const s = summariseOutcome("gad7", [
      admin("gad7", 18, 0),
      admin("gad7", 12, 14),
      admin("gad7", 11, 28),
    ]);
    expect(s.overall!.fromTotal).toBe(18);
    expect(s.overall!.toTotal).toBe(11);
    expect(s.overall!.category).toBe("improved");
    // The most recent step, 12 → 11, is noise even though the course is not.
    expect(s.latest!.fromTotal).toBe(12);
    expect(s.latest!.category).toBe("unchanged");
  });

  it("sorts by time rather than trusting the store's order", () => {
    const s = summariseOutcome("gad7", [
      admin("gad7", 11, 28),
      admin("gad7", 18, 0),
      admin("gad7", 12, 14),
    ]);
    expect(s.overall!.fromTotal).toBe(18);
    expect(s.overall!.toTotal).toBe(11);
  });

  it("drops the other instrument instead of mixing the scales", () => {
    const s = summariseOutcome("gad7", [
      admin("gad7", 18, 0),
      admin("phq9", 2, 7),
      admin("gad7", 10, 14),
    ]);
    expect(s.administrations).toBe(2);
    expect(s.overall!.instrument).toBe("gad7");
  });

  it("reports the span, because how long it took is part of the reading", () => {
    const s = summariseOutcome("gad7", [admin("gad7", 18, 0), admin("gad7", 10, 42)]);
    expect(s.spanDays).toBe(42);
  });

  it("is deterministic — no clock is read", () => {
    const input = [admin("phq9", 20, 0), admin("phq9", 9, 30)];
    expect(JSON.stringify(summariseOutcome("phq9", input))).toBe(
      JSON.stringify(summariseOutcome("phq9", input))
    );
  });
});

describe("the noise band, for drawing", () => {
  it("spans the scores that would NOT be a reliable change from the baseline", () => {
    // GAD-7 threshold is 4, so 10 ± 3 is the region indistinguishable from 10.
    const band = noiseBand("gad7", 10);
    expect(band).toEqual({ low: 7, high: 13 });
    expect(reliableChange(at("gad7", 10), at("gad7", band.high)).reliable).toBe(false);
    expect(reliableChange(at("gad7", 10), at("gad7", band.low)).reliable).toBe(false);
  });

  it("one point outside it IS a reliable change", () => {
    const band = noiseBand("gad7", 10);
    expect(reliableChange(at("gad7", 10), at("gad7", band.high + 1)).reliable).toBe(true);
    expect(reliableChange(at("gad7", 10), at("gad7", band.low - 1)).reliable).toBe(true);
  });

  it("never extends past scores the instrument can produce", () => {
    for (const id of ["gad7", "phq9"] as const) {
      const bands = BANDS[id];
      const min = bands[0].from;
      const max = bands[bands.length - 1].to;
      expect(noiseBand(id, min).low).toBe(min);
      expect(noiseBand(id, max).high).toBe(max);
    }
  });

  it("is wider for the less reliable instrument", () => {
    const g = noiseBand("gad7", 12);
    const p = noiseBand("phq9", 12);
    expect(p.high - p.low).toBeGreaterThan(g.high - g.low);
  });

  it("brackets the screening cut-point it will be drawn against", () => {
    // A sanity check that the two published conventions are on the same
    // scale — a band that could not contain the cut-point would mean one of
    // them had been mis-transcribed.
    for (const id of ["gad7", "phq9"] as const) {
      const cut = CUTPOINTS[id].score;
      const band = noiseBand(id, cut);
      expect(band.low).toBeLessThanOrEqual(cut);
      expect(band.high).toBeGreaterThanOrEqual(cut);
    }
  });
});
