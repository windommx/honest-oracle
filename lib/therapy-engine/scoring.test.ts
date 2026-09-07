import { describe, it, expect } from "vitest";
import { BANDS, CUTPOINTS, MCID, bandFor, interpret, isComplete, score } from "./scoring";
import { INSTRUMENT_LIST } from "./instruments";
import type { InstrumentId } from "./types";

const zeros = (n: number) => Array(n).fill(0);

describe("scoring — a total is a direct count", () => {
  it("sums the responses", () => {
    expect(score("gad7", [1, 2, 3, 0, 0, 1, 1]).total).toBe(8);
    expect(score("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3]).total).toBe(27);
  });

  it("is deterministic — the same answers always give the same result", () => {
    const answers = [2, 1, 3, 0, 1, 2, 1];
    expect(score("gad7", answers)).toEqual(score("gad7", answers));
  });

  it("rejects an incomplete response set instead of scoring it", () => {
    // A total over 5 of 7 answered items is not a GAD-7 score. Refusing is the
    // point: a partial sum presented as a scale score is a lie of omission.
    expect(isComplete("gad7", [1, 1, 1, 1, 1])).toBe(false);
    expect(() => score("gad7", [1, 1, 1, 1, 1])).toThrow(RangeError);
  });

  it("rejects out-of-scale and non-integer responses", () => {
    expect(isComplete("gad7", [4, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(isComplete("gad7", [-1, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(isComplete("gad7", [1.5, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(isComplete("gad7", zeros(7))).toBe(true);
  });

  it("lists which items were endorsed above zero", () => {
    expect(score("gad7", [0, 2, 0, 1, 0, 0, 3]).endorsedItems).toEqual([2, 4, 7]);
  });
});

describe("severity bands — published cut-points, contiguous and total", () => {
  it.each(["gad7", "phq9"] as InstrumentId[])("%s bands cover the full range with no gap or overlap", (id) => {
    const inst = INSTRUMENT_LIST.find((i) => i.id === id)!;
    const bands = BANDS[id];
    expect(bands[0].from).toBe(inst.min);
    expect(bands[bands.length - 1].to).toBe(inst.max);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].from, `${id}: gap/overlap at band ${i}`).toBe(bands[i - 1].to + 1);
    }
  });

  it("every possible score lands in exactly one band", () => {
    for (const inst of INSTRUMENT_LIST) {
      for (let s = inst.min; s <= inst.max; s++) {
        const matches = BANDS[inst.id].filter((b) => s >= b.from && s <= b.to);
        expect(matches, `${inst.id} score ${s}`).toHaveLength(1);
      }
    }
  });

  it("uses the published GAD-7 boundaries (5 / 10 / 15)", () => {
    expect(bandFor("gad7", 4).id).toBe("minimal");
    expect(bandFor("gad7", 5).id).toBe("mild");
    expect(bandFor("gad7", 9).id).toBe("mild");
    expect(bandFor("gad7", 10).id).toBe("moderate");
    expect(bandFor("gad7", 15).id).toBe("severe");
  });

  it("uses the published PHQ-9 boundaries (5 / 10 / 15 / 20)", () => {
    expect(bandFor("phq9", 9).id).toBe("mild");
    expect(bandFor("phq9", 10).id).toBe("moderate");
    expect(bandFor("phq9", 15).id).toBe("moderatelySevere");
    expect(bandFor("phq9", 20).id).toBe("severe");
  });

  it("throws rather than guessing on an out-of-range score", () => {
    expect(() => bandFor("gad7", 22)).toThrow(RangeError);
    expect(() => bandFor("phq9", -1)).toThrow(RangeError);
  });
});

describe("interpretation — screening is not diagnosis", () => {
  it("never claims to diagnose", () => {
    const high = interpret(score("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 0]));
    expect(high.isDiagnosis).toBe(false);
  });

  it("attaches the cut-point's false-positive caveat once the screen is positive", () => {
    const positive = interpret(score("gad7", [2, 2, 2, 2, 2, 0, 0])); // 10 — at the cut-point
    expect(positive.score.total).toBe(10);
    expect(positive.cutpointNote).toContain("การคัดกรองไม่ใช่การวินิจฉัย");
    expect(positive.cutpointNote).toContain("82%"); // the published specificity

    const negative = interpret(score("gad7", zeros(7)));
    expect(negative.cutpointNote).toBeNull();
  });

  it("quotes sensitivity and specificity as proportions, not as certainty", () => {
    for (const c of Object.values(CUTPOINTS)) {
      expect(c.sensitivity).toBeGreaterThan(0);
      expect(c.sensitivity).toBeLessThan(1);
      expect(c.specificity).toBeGreaterThan(0);
      expect(c.specificity).toBeLessThan(1);
    }
  });

  it("records the MCID as a convention, with its uncertainty stated", () => {
    // The threshold is a convention that varies by study — the note says so
    // rather than presenting 4 points as a constant of nature.
    for (const m of Object.values(MCID)) {
      expect(m.points).toBeGreaterThan(0);
      expect(m.note).toMatch(/ต่างกันไป/);
    }
  });
});

describe("PHQ-9 item 9 — the safety flag", () => {
  it("raises on any endorsement of item 9, even at a minimal total", () => {
    // Total 1 of 27 is "minimal" by band. The flag still fires: risk is not a
    // function of the sum.
    const r = score("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(r.band.id).toBe("minimal");
    expect(r.safetyFlag).toBe(true);
  });

  it("stays down when item 9 is zero, however high the total", () => {
    const r = score("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 0]);
    expect(r.total).toBe(24);
    expect(r.safetyFlag).toBe(false);
  });

  it("GAD-7 has no safety-critical item, so never raises the flag", () => {
    expect(score("gad7", [3, 3, 3, 3, 3, 3, 3]).safetyFlag).toBe(false);
  });
});
