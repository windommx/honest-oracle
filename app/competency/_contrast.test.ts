import { describe, it, expect } from "vitest";
import { SOLID_WITH_WHITE_TEXT, TEXT_COLORS, TINTS } from "./_tokens";
import { COMPETENCY_LEVELS } from "@/lib/competency/criteria";

// WCAG 2.1 relative luminance + contrast, computed rather than trusted (same maths as
// app/rush/_contrast.test.ts; duplicated on purpose so this module's guard stands alone).
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
  return (hi + 0.05) / (lo + 0.05);
};

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

describe("HD Competency light palette — WCAG 2.1 AA", () => {
  it("sanity: white on black is 21:1", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("every text colour clears 4.5:1 on every tinted surface it can land on", () => {
    const failures: string[] = [];
    for (const [tn, tv] of Object.entries(TEXT_COLORS)) {
      for (const [sn, sv] of Object.entries(TINTS)) {
        const c = contrast(tv, sv);
        if (c < AA_NORMAL) failures.push(`${tn} on ${sn}: ${c.toFixed(2)}`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("white button text clears 4.5:1 on each solid it is used on", () => {
    for (const [name, hex] of Object.entries(SOLID_WITH_WHITE_TEXT)) {
      expect(contrast("#ffffff", hex), name).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("slate-500 is NOT in the text tier — it measured below AA on the tinted cards", () => {
    expect(Object.values(TEXT_COLORS)).not.toContain("#64748b");
    expect(contrast("#64748b", TINTS["violet-50"])).toBeLessThan(AA_NORMAL);
  });

  it("chart fills (large marks) clear 3:1 against the white card so bars stay visible", () => {
    for (const l of COMPETENCY_LEVELS) {
      expect(contrast(l.color, "#ffffff"), `LEVEL ${l.level}`).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});
