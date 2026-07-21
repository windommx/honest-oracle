import { describe, it, expect } from "vitest";
import { diffConfigs, summarizeConfigDiff } from "./config-diff";
import type { BookConfig } from "./types";

const base: BookConfig = {
  type: "novel", title: "เงาใต้ท่าเรือ", thesis: "การตามหา", reader: "ผู้อ่าน",
  voice: "noir", chapters: 8, wordsPerChapter: 2500, subGenre: "mystery",
  citationStyle: "none", language: "thai", promptLanguage: "th",
};

describe("diffConfigs", () => {
  it("returns [] for identical configs", () => {
    expect(diffConfigs(base, { ...base })).toEqual([]);
  });

  it("reports changed fields with Thai labels and from → to values", () => {
    const changed = diffConfigs(base, { ...base, chapters: 12, title: "ชื่อใหม่" });
    expect(changed).toContainEqual({ field: "จำนวนบท", from: "8", to: "12" });
    expect(changed).toContainEqual({ field: "ชื่อเรื่อง", from: "เงาใต้ท่าเรือ", to: "ชื่อใหม่" });
  });

  it("treats undefined and empty string as the same (no phantom changes)", () => {
    expect(diffConfigs({ ...base, outline: undefined }, { ...base, outline: "" })).toEqual([]);
  });

  it("clips long text fields so the report stays scannable", () => {
    const long = "ก".repeat(200);
    const [c] = diffConfigs(base, { ...base, storyBible: long });
    expect(c.field).toBe("Story Codex");
    expect(c.to.length).toBeLessThanOrEqual(41); // 40 + ellipsis
    expect(c.to.endsWith("…")).toBe(true);
  });
});

describe("summarizeConfigDiff", () => {
  it("joins changes and counts the overflow", () => {
    const changes = [1, 2, 3, 4, 5, 6].map((n) => ({ field: `f${n}`, from: "a", to: "b" }));
    const s = summarizeConfigDiff(changes, 4);
    expect(s).toContain("f1: a → b");
    expect(s).toContain("และอีก 2 รายการ");
  });

  it("empty diff → empty string", () => {
    expect(summarizeConfigDiff([])).toBe("");
  });
});
