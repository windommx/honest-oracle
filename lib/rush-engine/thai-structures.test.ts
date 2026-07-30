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

  it("ships Save the Cat with all 15 canonical beats, flagged as a commercial import", () => {
    const s = structureById("save-the-cat")!;
    expect(s.beats).toHaveLength(15);
    expect(s.beats[0].en).toBe("Opening image");
    expect(s.beats[14].en).toBe("Final image");
    expect(s.beats.map((b) => b.en)).toContain("Dark night of the soul");
    expect(s.note).toContain("ไม่ใช่โครงพื้นถิ่น"); // honest: not indigenous
  });

  it("ships the Thai web-novel episode flow ending in a next-episode hook", () => {
    const w = structureById("thai-web-novel")!;
    expect(w.beats).toHaveLength(9);
    expect(w.beats[0].thai).toContain("hook");
    expect(w.beats[8].en).toBe("Next-episode hook"); // the defining beat of serial fiction
    expect(w.note).toContain("ไม่ใช่โครงวิชาการ"); // honest provenance flag
    // chapter 20/20 maps to the closing hook beat
    expect(structurePhase("thai-web-novel", 20, 20)!.beat.en).toBe("Next-episode hook");
  });

  it("ships the duanju vertical-drama arc with honest snippet-tier provenance", () => {
    const d = structureById("duanju")!;
    expect(d.beats).toHaveLength(7);
    expect(d.beats[0].en).toBe("Golden opening");
    expect(d.beats[6].en).toBe("Compressed close");
    // the course's countable density rule survives into the beats
    expect(d.beats.map((b) => b.desc).join(" ")).toContain("1 จุดอารมณ์เล็กต่อตอน");
    // provenance: official Hongguo course, but snippet-confidence — must say so,
    // and the officially-denied / single-source numbers must NOT be taught
    expect(d.note).toContain("snippet");
    expect(d.note).toContain("ไม่นำมาใช้");
    expect(d.origin).toContain("Hongguo");
    // ch1/100 → golden opening; ch100/100 → compressed close
    expect(structurePhase("duanju", 1, 100)!.beat.en).toBe("Golden opening");
    expect(structurePhase("duanju", 100, 100)!.beat.en).toBe("Compressed close");
  });

  it("ships the golden-three serial with its opening pinned to chapters 1-3 literally", () => {
    const g = structureById("golden-three")!;
    expect(g.beats).toHaveLength(7);
    expect(g.pinnedOpening).toBe(3);
    // 黄金三章 IS chapters 1/2/3 — even in a 24-chapter book, never a proportional share
    expect(structurePhase("golden-three", 1, 24)!.beat.en).toBe("Golden ch.1 — hook & mystery");
    expect(structurePhase("golden-three", 2, 24)!.beat.en).toBe("Golden ch.2 — prove the lead");
    expect(structurePhase("golden-three", 3, 24)!.beat.en).toBe("Golden ch.3 — advance & plant");
    expect(structurePhase("golden-three", 4, 24)!.beatIndex).toBe(3); // serial engine starts at ch4
    expect(structurePhase("golden-three", 24, 24)!.beatIndex).toBe(6); // last chapter → last beat
    // the editors'-desk rule survives into the note, provenance flagged honestly
    expect(g.note).toContain("สามบรรทัดสุดท้าย");
    expect(g.note).toContain("snippet");
  });

  it("ships the limited-series widening-scope arc with honest provenance", () => {
    const l = structureById("limited-series")!;
    expect(l.beats).toHaveLength(6);
    expect(l.beats[0].en).toBe("Single event, tight frame");
    expect(l.beats[5].en).toBe("What remains");
    // the saggy-middle fix is scope escalation, stated where the writer will read it
    expect(l.beats[2].desc).toContain("ขอบเขตใหม่");
    expect(l.note).toContain("snippet");
    expect(structurePhase("limited-series", 8, 8)!.beat.en).toBe("What remains");
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
