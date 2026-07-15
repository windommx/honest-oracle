import { describe, it, expect } from "vitest";
import { NARRATIVE_STRUCTURES, structureById, structurePhase, structureGuidanceTh } from "./thai-structures";
import { generateAllPrompts } from "./engine";

describe("narrative structures", () => {
  it("ships kishōtenketsu with its four authentic beats, contrast-driven", () => {
    const k = structureById("kishotenketsu")!;
    expect(k.beats).toHaveLength(4);
    expect(k.beats.map((b) => b.en)).toEqual(["Ki (introduction)", "Shō (development)", "Ten (the turn)", "Ketsu (conclusion)"]);
    expect(k.conflictDriven).toBe(false); // builds on contrast, not an antagonist
  });

  it("flags synthesized beat lists honestly with a note", () => {
    // จักร ๆ วงศ์ ๆ and นิทานพื้นบ้าน are Propp-based syntheses — must say so.
    expect(structureById("chak-wong")!.note).toBeTruthy();
    expect(structureById("nithan")!.note).toBeTruthy();
  });

  it("Jātaka is the 4-part nested frame ending in the identification", () => {
    const j = structureById("jataka")!;
    expect(j.beats).toHaveLength(4);
    expect(j.beats[3].en).toContain("identification");
  });

  it("returns null for an unknown structure id", () => {
    expect(structureById("bogus")).toBeNull();
    expect(structureById(undefined)).toBeNull();
    expect(structurePhase("bogus", 1, 10)).toBeNull();
  });
});

describe("structurePhase mapping", () => {
  it("maps a chapter proportionally to a beat, deterministically", () => {
    // 4 beats over 12 chapters → ch1 = beat0, ch12 = beat3.
    expect(structurePhase("kishotenketsu", 1, 12)!.beatIndex).toBe(0);
    expect(structurePhase("kishotenketsu", 12, 12)!.beatIndex).toBe(3);
    expect(structurePhase("kishotenketsu", 6, 12)!.beatIndex).toBe(1);
    // stable across calls
    expect(structurePhase("kishotenketsu", 6, 12)!.beat.en).toBe("Shō (development)");
  });

  it("never overflows the beat array for the last chapter", () => {
    for (const s of NARRATIVE_STRUCTURES) {
      const ph = structurePhase(s.id, 20, 20)!;
      expect(ph.beatIndex).toBe(s.beats.length - 1);
    }
  });
});

describe("structureGuidanceTh injection", () => {
  it("produces a Thai beat block naming the chosen structure", () => {
    const g = structureGuidanceTh("kishotenketsu", 1, 8);
    expect(g).toContain("โครงเรื่อง");
    expect(g).toContain("คิโชเท็งเค็ตสึ");
    expect(g).toContain("ปูเรื่อง"); // ch1 → Ki
  });

  it("returns empty string when no structure is chosen (prompt stays unchanged)", () => {
    expect(structureGuidanceTh(undefined, 1, 8)).toBe("");
    expect(structureGuidanceTh("", 1, 8)).toBe("");
  });

  it("reaches the generated Thai novel chapter prompt end-to-end", () => {
    const cfg = {
      type: "novel", title: "ทดสอบ", thesis: "แก่น", reader: "ผู้อ่าน", voice: "storytelling",
      chapters: 8, wordsPerChapter: 2000, subGenre: "fantasy", citationStyle: "none",
      language: "thai", promptLanguage: "th", structure: "kishotenketsu",
    } as unknown as Parameters<typeof generateAllPrompts>[0];
    const ch1 = generateAllPrompts(cfg, []).find((p) => p.id === "CH_1")!;
    expect(ch1.prompt).toContain("คิโชเท็งเค็ตสึ");
    expect(ch1.prompt).toContain("ปูเรื่อง"); // ch1 → Ki beat
    // without a structure, the same book has no structure block
    const plain = generateAllPrompts({ ...cfg, structure: undefined } as typeof cfg, []).find((p) => p.id === "CH_1")!;
    expect(plain.prompt).not.toContain("คิโชเท็งเค็ตสึ");
  });
});
