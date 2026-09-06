import { describe, it, expect } from "vitest";
import { STORY_TEMPLATES, templateById, beatColIndexes, templateToOutline } from "./story-templates";

describe("story structure templates — conventions, stated as such, internally consistent", () => {
  it("four templates with unique ids; every beat has Thai name, brief and a 0–100 position in order", () => {
    expect(STORY_TEMPLATES.map((t) => t.id)).toEqual(["save-the-cat", "heros-journey", "three-act", "kishotenketsu"]);
    for (const t of STORY_TEMPLATES) {
      let prev = -1;
      for (const b of t.beats) {
        expect(b.th.length).toBeGreaterThan(0); expect(b.desc.length).toBeGreaterThan(10);
        expect(b.pct).toBeGreaterThanOrEqual(prev); expect(b.pct).toBeLessThanOrEqual(100);
        prev = b.pct;
      }
      expect(t.beats[0].pct).toBe(0);
    }
  });

  it("beat columns are clamped to the scene count and never collapse the first/last beats", () => {
    const t = templateById("three-act")!;
    expect(beatColIndexes(t, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const twenty = beatColIndexes(t, 20);
    expect(twenty[0]).toBe(0); expect(twenty[twenty.length - 1]).toBe(19);
    expect(Math.max(...beatColIndexes(t, 3))).toBe(8); // fewer scenes than beats → beats count wins
  });

  it("the outline for the prompt tool has one numbered line per beat", () => {
    const t = templateById("kishotenketsu")!;
    const lines = templateToOutline(t).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^1\. การเปิด \(Ki\) \(0%\) — /);
    expect(templateById("nope")).toBeUndefined();
  });
});
