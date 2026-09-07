import { describe, it, expect } from "vitest";
import { buildSeries, compare, describe as describeChange } from "./trend";
import { score } from "./scoring";

const gad = (total: number) => {
  // Build a GAD-7 response set summing to `total`, deterministically.
  const r = [0, 0, 0, 0, 0, 0, 0];
  let left = total;
  for (let i = 0; i < 7 && left > 0; i++) {
    r[i] = Math.min(3, left);
    left -= r[i];
  }
  return score("gad7", r);
};
const phq = (total: number) => {
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let left = total;
  for (let i = 0; i < 8 && left > 0; i++) {
    r[i] = Math.min(3, left);
    left -= r[i];
  }
  return score("phq9", r);
};

describe("compare — points, not percentages", () => {
  it("reports the raw point difference", () => {
    const c = compare(gad(15), gad(8));
    expect(c.deltaPoints).toBe(-7);
    expect(c.direction).toBe("improved");
  });

  it("a rising score is 'worsened' — higher means more symptoms on both scales", () => {
    expect(compare(gad(4), gad(11)).direction).toBe("worsened");
  });

  it("an equal score is unchanged", () => {
    const c = compare(gad(9), gad(9));
    expect(c.direction).toBe("unchanged");
    expect(c.deltaPoints).toBe(0);
  });

  it("flags whether the change clears the published MCID", () => {
    expect(compare(gad(15), gad(11)).meetsMcid).toBe(true); // −4, GAD-7 MCID
    expect(compare(gad(15), gad(12)).meetsMcid).toBe(false); // −3
    expect(compare(phq(20), phq(15)).meetsMcid).toBe(true); // −5, PHQ-9 MCID
    expect(compare(phq(20), phq(16)).meetsMcid).toBe(false); // −4
  });

  it("reports the band on each side, and whether it crossed", () => {
    const c = compare(gad(15), gad(8));
    expect(c.fromBand.id).toBe("severe");
    expect(c.toBand.id).toBe("mild");
    expect(c.bandChanged).toBe(true);
    expect(compare(gad(6), gad(8)).bandChanged).toBe(false);
  });

  it("refuses to subtract scores from different instruments", () => {
    // Different rulers. The difference would have no referent at all.
    expect(() => compare(gad(12), phq(9))).toThrow(TypeError);
  });
});

describe("what a change is never presented as", () => {
  it("attaches the no-causation caveat to every comparison", () => {
    const c = compare(gad(18), gad(4));
    expect(c.causalNoteTh).toContain("ไม่ใช่หลักฐานว่าอะไรทำให้เปลี่ยน");
    expect(c.causalNoteTh).toContain("regression to the mean");
  });

  it("describes change in points, never as a percentage", () => {
    const text = describeChange(compare(gad(15), gad(8)));
    expect(text).toContain("7 คะแนน");
    expect(text).not.toContain("%");
  });

  it("calls a sub-MCID change possible measurement noise", () => {
    expect(describeChange(compare(gad(15), gad(13)))).toContain("ความผันผวนปกติของการวัด");
  });

  it("exports no forecasting function — two points are not a trajectory", async () => {
    const mod = await import("./trend");
    const names = Object.keys(mod);
    expect(names.some((n) => /predict|forecast|project|estimate/i.test(n))).toBe(false);
  });
});

describe("buildSeries", () => {
  const at = (day: number) => day * 86_400_000;

  it("one score is not a trend, and says so", () => {
    const s = buildSeries("gad7", [{ at: at(1), score: gad(12) }]);
    expect(s.overall).toBeNull();
    expect(s.latest).toBeNull();
    expect(s.noteTh).toContain("ยังบอกแนวโน้มไม่ได้");
  });

  it("an empty history is not an error", () => {
    expect(buildSeries("gad7", []).noteTh).toBe("ยังไม่มีผลประเมิน");
  });

  it("sorts by time regardless of input order", () => {
    const s = buildSeries("gad7", [
      { at: at(30), score: gad(6) },
      { at: at(1), score: gad(15) },
      { at: at(15), score: gad(10) },
    ]);
    expect(s.points.map((p) => p.score.total)).toEqual([15, 10, 6]);
  });

  it("separates first→last from the most recent step", () => {
    const s = buildSeries("gad7", [
      { at: at(1), score: gad(15) },
      { at: at(15), score: gad(10) },
      { at: at(30), score: gad(12) },
    ]);
    expect(s.overall!.deltaPoints).toBe(-3); // 15 → 12
    expect(s.latest!.deltaPoints).toBe(2); // 10 → 12
    expect(s.latest!.direction).toBe("worsened");
  });

  it("drops entries from other instruments rather than mixing scales", () => {
    const s = buildSeries("gad7", [
      { at: at(1), score: gad(15) },
      { at: at(2), score: phq(20) },
      { at: at(3), score: gad(9) },
    ]);
    expect(s.points).toHaveLength(2);
    expect(s.overall!.instrument).toBe("gad7");
  });

  it("never reads a clock — the caller supplies every timestamp", () => {
    const points = [
      { at: at(1), score: gad(15) },
      { at: at(30), score: gad(7) },
    ];
    expect(buildSeries("gad7", points)).toEqual(buildSeries("gad7", points));
  });
});
