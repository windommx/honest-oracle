import { describe, it, expect } from "vitest";
import { BOOTSTRAPS, bootstrapById, bootstrapQuery } from "./bootstraps";
import { BOOK_TYPES } from "./book-types";
import { structureById } from "./thai-structures";
import { generateAllPrompts } from "./engine";
import type { BookConfig } from "./types";

describe("bootstraps (20 one-click starting points)", () => {
  it("ships exactly 20 presets with unique ids", () => {
    expect(BOOTSTRAPS).toHaveLength(20);
    expect(new Set(BOOTSTRAPS.map((b) => b.id)).size).toBe(20);
  });

  it("every preset is valid against the registries it points into", () => {
    for (const b of BOOTSTRAPS) {
      expect(BOOK_TYPES[b.type], b.id).toBeTruthy();
      expect(BOOK_TYPES[b.type].sub_genres, `${b.id}: genre ${b.genre}`).toContain(b.genre);
      if (b.structure) expect(structureById(b.structure), `${b.id}: structure ${b.structure}`).not.toBeNull();
      // the /rush deep-link caps — a preset outside them would be silently ignored
      expect(b.chapters).toBeGreaterThanOrEqual(1);
      expect(b.chapters).toBeLessThanOrEqual(100);
      expect(b.words).toBeGreaterThanOrEqual(100);
      expect(b.words).toBeLessThanOrEqual(20000);
      expect(b.nameTh.length).toBeGreaterThan(0);
      expect(b.taglineTh.length).toBeGreaterThan(0);
    }
  });

  it("every preset generates a working Thai prompt pack end-to-end", () => {
    for (const b of BOOTSTRAPS) {
      const cfg = {
        type: b.type, title: "ทดสอบ", thesis: "แก่น", reader: "ผู้อ่าน", voice: "storytelling",
        chapters: b.chapters, wordsPerChapter: b.words, subGenre: b.genre, citationStyle: "none",
        language: "thai", promptLanguage: "th", structure: b.structure || undefined,
      } as unknown as BookConfig;
      const pack = generateAllPrompts(cfg, []);
      expect(pack.length, b.id).toBeGreaterThan(0);
      expect(pack.find((p) => p.id === "CH_1"), b.id).toBeTruthy();
    }
  });

  it("covers the market honestly: serial fiction, indigenous structures, and nonfiction", () => {
    const structures = new Set(BOOTSTRAPS.map((b) => b.structure).filter(Boolean));
    for (const s of ["thai-web-novel", "duanju", "golden-three", "chak-wong", "nithan", "jataka", "kishotenketsu", "limited-series"]) {
      expect(structures, `structure ${s} unused`).toContain(s);
    }
    const types = new Set(BOOTSTRAPS.map((b) => b.type));
    expect(types.size).toBeGreaterThanOrEqual(6); // not a novel-only gallery
  });

  it("builds the deep-link query the /rush page actually reads", () => {
    const b = bootstrapById("duanju-revenge")!;
    const q = new URLSearchParams(bootstrapQuery(b));
    expect(q.get("type")).toBe("novel");
    expect(q.get("structure")).toBe("duanju");
    expect(q.get("chapters")).toBe("80");
    expect(q.get("lang")).toBe("th");
    // no structure param at all when the preset uses the standard 3-act
    expect(new URLSearchParams(bootstrapQuery(bootstrapById("kids-bedtime")!)).has("structure")).toBe(false);
    expect(bootstrapById("bogus")).toBeNull();
  });
});
