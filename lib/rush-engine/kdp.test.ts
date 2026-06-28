import { describe, it, expect } from "vitest";
import { spineWidth, estimatePages, coverCanvas, kdpReadiness } from "./kdp";

describe("KDP math", () => {
  it("computes spine width from pages ÷ PPI", () => {
    // 300 pages on 60# cream (PPI 400) = 0.75"
    expect(spineWidth(300, "60_cream").inches).toBeCloseTo(0.75, 3);
    expect(spineWidth(300, "60_cream").mm).toBeCloseTo(19.05, 1);
    // thicker on 50# white (PPI 444) → fewer inches per page
    expect(spineWidth(444, "50_white").inches).toBeCloseTo(1.0, 3);
  });

  it("estimates pages from words per trim", () => {
    expect(estimatePages(30000, "6x9")).toBe(100); // 30000/300
    expect(estimatePages(30000, "8.5x11")).toBeLessThan(estimatePages(30000, "6x9"));
  });

  it("builds a wraparound cover canvas with spine + bleed", () => {
    const c = coverCanvas(300, "6x9", "60_cream");
    // width = 6*2 + 0.75 spine + 0.25 bleed = 13.0"
    expect(c.widthIn).toBeCloseTo(13.0, 2);
    expect(c.heightIn).toBeCloseTo(9.25, 2);
    expect(c.widthPx).toBe(Math.round(13.0 * 300));
  });

  it("flags a too-thin book as not KDP-ready (deterministic checklist)", () => {
    const thin = kdpReadiness({ words: 3000, trim: "6x9" }); // ~10 pages < 24
    expect(thin.ready).toBe(false);
    expect(thin.checks.find((c) => c.rule.includes("pages"))?.ok).toBe(false);

    const ok = kdpReadiness({ words: 30000, trim: "6x9" });
    expect(ok.ready).toBe(true);
    expect(ok.spine.inches).toBeGreaterThan(0);
    expect(ok.cover.widthPx).toBeGreaterThan(0);
  });
});
