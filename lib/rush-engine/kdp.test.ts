import { describe, it, expect } from "vitest";
import { spineWidth, estimatePages, coverCanvas, kdpReadiness, kdpMetadataChecks, formatKdpPackage, KDP_LIMITS } from "./kdp";

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

describe("KDP metadata compliance", () => {
  it("checks real KDP field limits and reports missing fields as not-ok", () => {
    const empty = kdpMetadataChecks({});
    expect(empty.every((c) => !c.ok)).toBe(true); // nothing supplied → nothing passes

    const good = kdpMetadataChecks({
      title: "เงาในสายหมอก",
      description: "x".repeat(300),
      keywords: ["ระทึกขวัญ", "สืบสวน", "ไทย"],
      categories: ["Fiction", "Mystery"],
    });
    expect(good.every((c) => c.ok)).toBe(true);
  });

  it("flags over-limit fields", () => {
    const bad = kdpMetadataChecks({
      title: "x".repeat(KDP_LIMITS.title + 1),
      description: "short",
      keywords: new Array(KDP_LIMITS.keywords + 1).fill("k"),
      categories: [],
    });
    expect(bad.find((c) => c.rule.includes("Title"))?.ok).toBe(false);
    expect(bad.find((c) => c.rule.includes("Description"))?.ok).toBe(false);
    expect(bad.find((c) => c.rule.includes("keywords"))?.ok).toBe(false);
    expect(bad.find((c) => c.rule.includes("categories"))?.ok).toBe(false);
  });

  it("kdpReadiness folds metadata checks in when meta is supplied", () => {
    const withMeta = kdpReadiness({ words: 30000, meta: { title: "A", description: "y".repeat(200), keywords: ["a"], categories: ["Fiction"] } });
    expect(withMeta.checks.some((c) => c.rule.includes("Title"))).toBe(true);
  });

  it("formats a KDP package that admits the print-PDF limitation", () => {
    const md = formatKdpPackage({ words: 30000, meta: { title: "A", description: "y".repeat(200), keywords: ["a"], categories: ["Fiction"] } });
    expect(md).toContain("# KDP Submission Package");
    expect(md).toContain("Readiness checklist");
    expect(md).toContain("CMYK"); // honest about what a browser can't do
  });
});

describe("kdpReadiness guards invalid inputs (audit fix)", () => {
  it("an unknown paper stock is not reported publish-ready with a NaN spine", () => {
    const r = kdpReadiness({ words: 30000, paper: "40_white" as never });
    expect(r.ready).toBe(false);
    expect(Number.isFinite(r.spine.inches)).toBe(true); // no NaN
    expect(r.checks.find((c) => c.rule === "Known paper stock")!.ok).toBe(false);
  });
  it("an unknown trim size fails a check instead of crashing", () => {
    const r = kdpReadiness({ words: 30000, trim: "9x9" as never });
    expect(r.ready).toBe(false);
    expect(Number.isFinite(r.pages)).toBe(true);
    expect(r.checks.find((c) => c.rule === "Known trim size")!.ok).toBe(false);
  });
  it("a non-finite word count fails, with finite pages", () => {
    const r = kdpReadiness({ words: NaN });
    expect(r.ready).toBe(false);
    expect(Number.isFinite(r.pages)).toBe(true);
    expect(r.checks.find((c) => c.rule === "Word count present")!.ok).toBe(false);
  });
  it("valid inputs still pass", () => {
    expect(kdpReadiness({ words: 30000 }).ready).toBe(true);
  });
});
