import { describe, it, expect } from "vitest";
import {
  bandOf,
  developmentPlan,
  evaluate,
  isComplete,
  levelInfo,
  managementInfo,
  nextBand,
  parseScores,
  scoreOfPoint,
  totalFromLevels,
  validateScores,
  type Scores,
} from "./scoring";

const full = (p: number): Scores => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), p]));

describe("bandOf — the band edges, including the sheet's unassigned 50", () => {
  it.each([
    [20, 1], [48, 1], [50, 1], // 50 is reachable (even totals) and not yet LEVEL 2
    [51, 2], [52, 2], [60, 2],
    [61, 3], [70, 3],
    [71, 4], [80, 4],
    [81, 5], [98, 5], [100, 5],
  ])("total %i → LEVEL %i", (total, level) => {
    expect(bandOf(total)).toBe(level);
  });

  it("clamps impossible totals instead of throwing", () => {
    expect(bandOf(-4)).toBe(1);
    expect(bandOf(140)).toBe(5);
  });
});

describe("totals", () => {
  it("scores a point ×2 and sums the ten criteria to at most 100", () => {
    expect(scoreOfPoint(3)).toBe(6);
    expect(totalFromLevels(full(5))).toBe(100);
    expect(totalFromLevels(full(1))).toBe(20);
  });

  it("previews a partial map (only the chosen criteria count)", () => {
    expect(totalFromLevels({ "1": 3, "4": 5 })).toBe(16);
    expect(totalFromLevels({})).toBe(0);
  });

  it("ignores keys that are not criteria", () => {
    expect(totalFromLevels({ "1": 2, "99": 5, foo: 5 } as Scores)).toBe(4);
  });
});

describe("parseScores — tolerant read of the stored JSON", () => {
  it("accepts an object or a JSON string", () => {
    expect(parseScores({ "1": 3, "2": 4 })).toEqual({ "1": 3, "2": 4 });
    expect(parseScores('{"1":3,"2":"4"}')).toEqual({ "1": 3, "2": 4 });
  });

  it("drops out-of-range values and unknown keys, and survives junk", () => {
    expect(parseScores({ "1": 0, "2": 6, "3": 2.5, "4": 5, "11": 3, x: 1 })).toEqual({ "4": 5 });
    expect(parseScores("not json")).toEqual({});
    expect(parseScores(null)).toEqual({});
    expect(parseScores([1, 2, 3])).toEqual({});
    expect(parseScores(42)).toEqual({});
  });
});

describe("validateScores", () => {
  it("passes a complete 1-5 map", () => {
    expect(validateScores(full(2))).toEqual({ ok: true, missing: [], message: null });
    expect(isComplete(full(2))).toBe(true);
  });

  it("names the first missing criterion in Thai", () => {
    const partial = { ...full(3) } as Partial<Scores>;
    delete partial["4"];
    delete partial["7"];
    const v = validateScores(partial);
    expect(v.ok).toBe(false);
    expect(v.missing.map((c) => c.id)).toEqual([4, 7]);
    expect(v.message).toBe("กรุณาเลือกระดับคะแนนของเกณฑ์ที่ 4 (Skill การใช้เครื่องไตเทียม)");
  });

  it("treats out-of-range or non-integer points as missing", () => {
    expect(validateScores({ ...full(3), "2": 0 }).missing.map((c) => c.id)).toEqual([2]);
    expect(validateScores({ ...full(3), "2": 6 }).missing.map((c) => c.id)).toEqual([2]);
    expect(validateScores({ ...full(3), "2": 2.5 }).missing.map((c) => c.id)).toEqual([2]);
    expect(validateScores(null).missing).toHaveLength(10);
  });
});

describe("evaluate", () => {
  it("returns the stored pair (totalScore, level)", () => {
    expect(evaluate({ "1": 3, "2": 4, "3": 3, "4": 3, "5": 2, "6": 3, "7": 4, "8": 4, "9": 4, "10": 4 })).toEqual({
      totalScore: 68,
      level: 3,
    });
  });

  it("refuses an incomplete map", () => {
    expect(() => evaluate({ "1": 3 })).toThrow(/เกณฑ์ที่ 2/);
  });
});

describe("levelInfo / managementInfo", () => {
  it("falls back to LEVEL 1 for an unknown band", () => {
    expect(levelInfo(3).thName).toBe("ผู้ปฏิบัติ");
    expect(levelInfo(9).level).toBe(1);
  });

  it("resolves 6/7 and nothing else", () => {
    expect(managementInfo(6)?.thName).toBe("หัวหน้าแผนก");
    expect(managementInfo(7)?.enName).toBe("Director");
    expect(managementInfo(5)).toBeNull();
    expect(managementInfo(null)).toBeNull();
  });
});

describe("nextBand", () => {
  it("says how many points separate a total from the next band", () => {
    expect(nextBand(48)).toEqual({ level: levelInfo(2), pointsNeeded: 3 });
    expect(nextBand(60)).toEqual({ level: levelInfo(3), pointsNeeded: 1 });
    expect(nextBand(80)?.pointsNeeded).toBe(1);
  });

  it("is null at LEVEL 5", () => {
    expect(nextBand(81)).toBeNull();
    expect(nextBand(100)).toBeNull();
  });
});

describe("developmentPlan — a re-reading of the rubric, weakest first", () => {
  const scores: Scores = { "1": 1, "2": 1, "3": 4, "4": 3, "5": 1, "6": 2, "7": 2, "8": 2, "9": 3, "10": 5 };

  it("orders items by point ascending, then by criterion id", () => {
    const plan = developmentPlan(scores);
    expect(plan.items.map((i) => i.criterion.id)).toEqual([1, 2, 5, 6, 7, 8, 4, 9, 3]);
  });

  it("pairs each item with the next rung's own text and a fixed +2 gain", () => {
    const plan = developmentPlan(scores);
    const item = plan.items.find((i) => i.criterion.id === 5)!;
    expect(item.current.point).toBe(1);
    expect(item.next?.point).toBe(2);
    expect(item.next?.title).toBe("เข้าใจหลักการทำงานเครื่อง RO");
    expect(item.gain).toBe(2);
  });

  it("separates mastered (5) and urgent (1) criteria and reports the band context", () => {
    const plan = developmentPlan(scores);
    expect(plan.mastered.map((c) => c.id)).toEqual([10]);
    expect(plan.urgent.map((c) => c.id)).toEqual([1, 2, 5]);
    expect(plan.total).toBe(48);
    expect(plan.level.level).toBe(1);
    expect(plan.next?.pointsNeeded).toBe(3);
  });

  it("is empty for a perfect assessment", () => {
    const plan = developmentPlan(full(5));
    expect(plan.items).toEqual([]);
    expect(plan.mastered).toHaveLength(10);
    expect(plan.next).toBeNull();
  });
});
