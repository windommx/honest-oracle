import { describe, it, expect } from "vitest";
import { analyzeOpeners, formatOpeners } from "./openers";

describe("analyzeOpeners — English", () => {
  it("counts sentence openers and flags monotony", () => {
    const text = "He ran. He fell. He stood. He wept. The rain came. She left.";
    const r = analyzeOpeners(text, "en");
    expect(r.units).toBe(6);
    const he = r.top.find((s) => s.opener === "he")!;
    expect(he.count).toBe(4);
    expect(he.ratio).toBeCloseTo(4 / 6, 5);
    expect(r.monotone.some((s) => s.opener === "he")).toBe(true); // 4× and 67%
  });

  it("does not flag openers below the threshold", () => {
    const text = "He ran. She fell. The dog barked. A car passed. Rain came. Night fell.";
    const r = analyzeOpeners(text, "en");
    expect(r.monotone).toHaveLength(0); // every opener distinct
  });

  it("is case-insensitive on the opening word", () => {
    const r = analyzeOpeners("The sky. the sea. THE end.", "en");
    expect(r.top[0]).toMatchObject({ opener: "the", count: 3 });
  });
});

describe("analyzeOpeners — Thai (clause-level)", () => {
  it("treats spaces as clause breaks and flags a repeated opener", () => {
    // Four clauses opening with เขา, one with ฝน.
    const text = "เขาเดินไป เขาหันมา เขายิ้ม เขาร้องไห้ ฝนตกลงมา";
    const r = analyzeOpeners(text, "th");
    const khao = r.top.find((s) => s.opener === "เขา");
    expect(khao?.count).toBe(4);
    expect(r.monotone.some((s) => s.opener === "เขา")).toBe(true);
  });
});

describe("formatOpeners", () => {
  it("reports counts + percentages, never a 0–100 score", () => {
    const out = formatOpeners(analyzeOpeners("He a. He b. He c. He d. She e.", "en"), "en");
    expect(out).toContain("counts, not a verdict");
    expect(out).toContain('"he" ×4');
    expect(out).not.toMatch(/\b\d{1,3}\/100\b/);
  });

  it("says so plainly when nothing is over-used", () => {
    const out = formatOpeners(analyzeOpeners("A. B. C. D.", "en"), "en");
    expect(out).toContain("varied openings");
  });

  it("handles empty input without crashing", () => {
    const r = analyzeOpeners("", "en");
    expect(r.units).toBe(0);
    expect(r.monotone).toEqual([]);
    expect(formatOpeners(r, "th")).toContain("openers");
  });
});
