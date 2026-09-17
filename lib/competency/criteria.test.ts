import { describe, it, expect } from "vitest";
import {
  COMPETENCY_LEVELS,
  CRITERIA,
  CRITERION_COUNT,
  MANAGEMENT_LEVELS,
  MAX_POINT,
  MIN_POINT,
  POINT_MULTIPLIER,
  TOTAL_MAX_SCORE,
} from "./criteria";

describe("the assessment instrument (FORM sheet)", () => {
  it("has ten criteria numbered 1..10 in order, each with five levels scored 1..5", () => {
    expect(CRITERION_COUNT).toBe(10);
    CRITERIA.forEach((c, i) => {
      expect(c.id).toBe(i + 1);
      expect(c.levels).toHaveLength(5);
      c.levels.forEach((l, j) => expect(l.point).toBe(j + 1));
    });
  });

  it("every level carries the workbook's text — no empty rubric cells", () => {
    for (const c of CRITERIA) {
      expect(c.name.trim()).not.toBe("");
      expect(c.shortName.trim()).not.toBe("");
      for (const l of c.levels) {
        expect(l.title.trim(), `criterion ${c.id} point ${l.point}`).not.toBe("");
        expect(l.description.trim(), `criterion ${c.id} point ${l.point}`).not.toBe("");
      }
    }
  });

  it("short names are unique (they are chart axis labels)", () => {
    const names = CRITERIA.map((c) => c.shortName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the maximum total is 10 criteria × 5 points × 2", () => {
    expect(CRITERION_COUNT * MAX_POINT * POINT_MULTIPLIER).toBe(TOTAL_MAX_SCORE);
    expect(MIN_POINT).toBe(1);
  });
});

describe("competency bands (OUTCOME sheet)", () => {
  it("levels 1-5 tile 0..100 with no gap and no overlap", () => {
    expect(COMPETENCY_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect(COMPETENCY_LEVELS[0].min).toBe(0);
    expect(COMPETENCY_LEVELS[COMPETENCY_LEVELS.length - 1].max).toBe(100);
    for (let i = 1; i < COMPETENCY_LEVELS.length; i++) {
      expect(COMPETENCY_LEVELS[i].min).toBe(COMPETENCY_LEVELS[i - 1].max + 1);
    }
  });

  it("uses the sheet's names and groups", () => {
    expect(COMPETENCY_LEVELS.map((l) => l.enName)).toEqual(["Novice", "Advance Beginner", "Competent", "Proficient", "Expert"]);
    expect(COMPETENCY_LEVELS.map((l) => l.thName)).toEqual(["ผู้เริ่มต้น", "ผู้เรียนรู้", "ผู้ปฏิบัติ", "ผู้ชำนาญ", "ผู้เชี่ยวชาญ"]);
    expect(COMPETENCY_LEVELS.map((l) => l.group)).toEqual([
      "Novice", "Operational Staff", "Operational Staff", "Senior Staff", "Senior Staff",
    ]);
  });

  it("management tiers are 6 (หัวหน้าแผนก) and 7 (ผู้จัดการศูนย์), outside the scored bands", () => {
    expect(MANAGEMENT_LEVELS.map((l) => [l.level, l.thName])).toEqual([
      [6, "หัวหน้าแผนก"],
      [7, "ผู้จัดการศูนย์"],
    ]);
  });
});
