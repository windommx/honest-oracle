import { describe, it, expect } from "vitest";
import { SAMPLE_NURSES, sampleScores } from "./sample-data";
import { evaluate } from "./scoring";

describe("sample data (Analysis sheet, 20 ธ.ค. 2562)", () => {
  it("reproduces the seven totals the workbook computes", () => {
    const totals = SAMPLE_NURSES.map((n) => evaluate(sampleScores(n)).totalScore);
    expect(totals).toEqual([68, 48, 46, 42, 40, 80, 98]);
  });

  it("and the bands those totals fall in", () => {
    const levels = SAMPLE_NURSES.map((n) => evaluate(sampleScores(n)).level);
    expect(levels).toEqual([3, 1, 1, 1, 1, 4, 5]);
  });

  it("maps points to criterion keys 1..10", () => {
    expect(Object.keys(sampleScores(SAMPLE_NURSES[0]))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  });
});
