import { describe, it, expect } from "vitest";
import { parseOutline } from "./outline";
import { generateAllPrompts, type BookConfig } from "./engine";

describe("parseOutline", () => {
  it("parses '1. ...' numbered lines", () => {
    const m = parseOutline("1. opening in the mist\n2. the investigation begins");
    expect(m.get(1)).toBe("opening in the mist");
    expect(m.get(2)).toBe("the investigation begins");
  });

  it("parses Thai chapter headers (บท / บทที่ + . : - —)", () => {
    const m = parseOutline("บท 1: เปิดเรื่องด้วยศพ\nบทที่ 2 — สืบสวนเริ่ม");
    expect(m.get(1)).toBe("เปิดเรื่องด้วยศพ");
    expect(m.get(2)).toBe("สืบสวนเริ่ม");
  });

  it("parses 'Ch3 -' / 'Chapter 4.' headers", () => {
    const m = parseOutline("Ch3 - the midpoint twist\nChapter 4. the fall");
    expect(m.get(3)).toBe("the midpoint twist");
    expect(m.get(4)).toBe("the fall");
  });

  it("appends non-header lines to the current chapter (multi-line beats)", () => {
    const m = parseOutline("1. setup\n   extra detail\n2. next");
    expect(m.get(1)).toBe("setup\nextra detail");
    expect(m.get(2)).toBe("next");
  });

  it("returns empty map for unstructured text", () => {
    expect(parseOutline("just a paragraph with no chapter numbers").size).toBe(0);
  });
});

describe("per-chapter beat injection", () => {
  const base: BookConfig = {
    type: "novel", title: "X", thesis: "T", reader: "R", voice: "storytelling",
    chapters: 8, wordsPerChapter: 3000, subGenre: "thriller", citationStyle: "none", language: "thai",
  };

  it("injects only the matching chapter's beat (EN)", () => {
    const pack = generateAllPrompts({ ...base, outline: "6. มะลิพบศพในตู้เย็นรถไฟฟ้า" }, []);
    const ch6 = pack.find((p) => p.id === "CH_6")!;
    const ch5 = pack.find((p) => p.id === "CH_5")!;
    expect(ch6.prompt).toContain("PLANNED BEAT — Chapter 6");
    expect(ch6.prompt).toContain("มะลิพบศพในตู้เย็นรถไฟฟ้า");
    expect(ch6.prompt).not.toContain("PLANNED OUTLINE"); // matched → specific beat, not the wholesale block
    // Unmatched chapters no longer DROP the outline — they get the wholesale block.
    expect(ch5.prompt).toContain("PLANNED OUTLINE");
  });

  it("injects the matching chapter's beat in Thai mode", () => {
    const pack = generateAllPrompts({ ...base, promptLanguage: "th", outline: "3. การเปิดเผยครั้งใหญ่" }, []);
    const ch3 = pack.find((p) => p.id === "CH_3")!;
    expect(ch3.prompt).toContain("beat ของบทที่ 3");
    expect(ch3.prompt).toContain("การเปิดเผยครั้งใหญ่");
  });
});
