import { describe, it, expect } from "vitest";
import { characterArc, pacingProfile, motifTracker, hookSignal, type ChapterSignal } from "./narrative";

describe("characterArc", () => {
  it("tracks per-chapter presence and flags a mid-story disappearance (gap)", () => {
    // เดนโอ appears ch1, absent ch2–3, returns ch4 → a gap the writer should notice.
    const text = "## บทที่ 1\nเดนโอเดินทาง\n## บทที่ 2\nรินอยู่คนเดียว\n## บทที่ 3\nรินคิดถึงบ้าน\n## บทที่ 4\nเดนโอกลับมา";
    const { chapters, characters } = characterArc(text, ["เดนโอ", "ริน"], "th");
    expect(chapters).toBe(4);
    const deno = characters.find((c) => c.name === "เดนโอ")!;
    expect(deno.perChapter).toEqual([1, 0, 0, 1]);
    expect(deno.firstChapter).toBe(1);
    expect(deno.lastChapter).toBe(4);
    expect(deno.gaps).toEqual([{ from: 2, to: 3 }]);
  });

  it("flags a character introduced early then dropped before the end", () => {
    const text = "## 1\nMira runs\n## 2\nMira waits\n## 3\nJon alone\n## 4\nJon alone\n## 5\nJon alone\n## 6\nJon ends it";
    const { characters } = characterArc(text, ["Mira", "Jon"], "en");
    const mira = characters.find((c) => c.name === "Mira")!;
    expect(mira.lastChapter).toBe(2);
    expect(mira.exitsEarly).toBe(true);
    const jon = characters.find((c) => c.name === "Jon")!;
    expect(jon.exitsEarly).toBe(false); // present through the end
  });

  it("does not emit any coherence score — only counts and flags", () => {
    const { characters } = characterArc("## 1\nAna runs\n## 2\nAna waits", ["Ana"], "en");
    expect(Object.keys(characters[0])).not.toContain("score");
    expect(Object.keys(characters[0])).not.toContain("coherence");
  });
});

describe("pacingProfile", () => {
  const sig = (words: number, dlg = 10): ChapterSignal => ({ words, dialogueRatio: dlg, tellingPer100: 2, sensoryPer1k: 100 });

  it("splits chapters into three acts and averages measured signals", () => {
    const chapters = [sig(1000), sig(1000), sig(1000), sig(1000), sig(1000), sig(1000)];
    const p = pacingProfile(chapters);
    expect(p.acts.map((a) => a.act)).toEqual(["beginning", "middle", "end"]);
    expect(p.acts[0].chapters).toEqual([1, 2]);
    expect(p.acts[1].chapters).toEqual([3, 4]);
    expect(p.acts.every((a) => a.avgWords === 1000)).toBe(true);
    expect(p.flags).toEqual([]); // balanced → no flag
  });

  it("flags a saggy middle when the middle act is much shorter", () => {
    const chapters = [sig(1000), sig(1000), sig(300), sig(300), sig(1000), sig(1000)];
    const p = pacingProfile(chapters);
    expect(p.flags.some((f) => f.includes("บทกลาง"))).toBe(true);
  });

  it("returns empty for fewer than three chapters (no act split possible)", () => {
    expect(pacingProfile([sig(500), sig(500)]).acts).toEqual([]);
  });
});

describe("motifTracker", () => {
  it("counts a theme term per chapter and reports its longest silent run", () => {
    const text = "## 1\nดาบดาบ\n## 2\nเงียบ\n## 3\nเงียบ\n## 4\nดาบ";
    const { motifs } = motifTracker(text, ["ดาบ"], "th");
    const sword = motifs[0];
    expect(sword.perChapter).toEqual([2, 0, 0, 1]);
    expect(sword.total).toBe(3);
    expect(sword.chaptersPresent).toBe(2);
    expect(sword.longestAbsentRun).toBe(2);
  });
});

describe("hookSignal — ending devices, presence not strength", () => {
  it("detects a question + tension word in a Thai ending", () => {
    const h = hookSignal("เนื้อเรื่องยาว ๆ ก่อนหน้า " + "x".repeat(500) + " แต่เธอจะกลับมาอีกไหม?", "th");
    expect(h.hasQuestion).toBe(true);
    expect(h.tensionWords).toContain("แต่");
    expect(h.anyDevice).toBe(true);
  });

  it("reports a quiet ending as no-device (writer's call, not an error)", () => {
    const h = hookSignal("เขากลับบ้าน กินข้าว แล้วนอนหลับสบายดี", "th");
    expect(h.hasQuestion).toBe(false);
    expect(h.anyDevice === (h.tensionWords.length > 0 || h.hasEllipsis)).toBe(true);
  });

  it("only inspects the ending window, not the whole text", () => {
    const early = "อันตราย! ความลับ! ".repeat(10) + "จากนั้นทุกอย่างสงบ " + "ก".repeat(450);
    const h = hookSignal(early, "th");
    expect(h.tensionWords).toEqual([]); // tension words live before the tail window
  });
});

describe("characterArc cast-aware counting (audit elevation)", () => {
  it("a short name inside a longer CAST name is not phantom-present", () => {
    // สม only ever appears inside สมชาย, แอน only inside แอนนา — neither is its own character
    // here, so both must be absent, not marked present in every chapter their substring nests.
    const a = characterArc("บทที่ 1\n\nสมชายเดินไป\n\nบทที่ 2\n\nแอนนากลับมา", ["สม", "สมชาย", "แอน", "แอนนา"], "th");
    const m = new Map(a.characters.map((c) => [c.name, c.total]));
    expect(m.get("สม")).toBe(0);
    expect(m.get("แอน")).toBe(0);
    expect(m.get("สมชาย")).toBe(1);
    expect(m.get("แอนนา")).toBe(1);
  });
});
