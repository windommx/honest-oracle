import { describe, it, expect } from "vitest";
import { parseCodex, hasCodex, codexLocal, codexDigestTh, codexLocalTh, codexDigestEn } from "./codex";
import { generateAllPrompts } from "./engine";

const BIBLE = `
[CHARACTERS]
อนันต์: นักสืบหนุ่ม กลัวความมืด
มาลี: น้องสาวอนันต์ ที่หายตัวไป
เสือ: หัวหน้าแก๊งลึกลับ

[PLACES]
กรุงเทพเก่า: ย่านที่เรื่องเกิด

[ITEMS]
กุญแจทองคำ: เปิดห้องใต้ดิน

[RELATIONS]
อนันต์ - มาลี: พี่น้อง
อนันต์ -> เสือ: ตามล่า
`;

describe("parseCodex — indexing", () => {
  it("parses entities by section into a typed graph", () => {
    const c = parseCodex(BIBLE);
    expect(c.entities.filter((e) => e.type === "character").map((e) => e.name)).toEqual(["อนันต์", "มาลี", "เสือ"]);
    expect(c.entities.find((e) => e.type === "place")!.name).toBe("กรุงเทพเก่า");
    expect(c.entities.find((e) => e.type === "item")!.desc).toBe("เปิดห้องใต้ดิน");
  });

  it("parses directed and undirected relations", () => {
    const c = parseCodex(BIBLE);
    expect(c.relations).toContainEqual({ from: "อนันต์", to: "มาลี", kind: "พี่น้อง", directed: false });
    expect(c.relations).toContainEqual({ from: "อนันต์", to: "เสือ", kind: "ตามล่า", directed: true });
  });

  it("tolerates list bullets and dedupes names", () => {
    const c = parseCodex("[CAST]\n- A: one\n- A: dup\n* B: two");
    expect(c.entities.map((e) => e.name)).toEqual(["A", "B"]);
  });

  it("returns an EMPTY graph for freeform prose with no sections (honest: no fake extraction)", () => {
    const c = parseCodex("Just some notes. Anan is a detective. He fears the dark.");
    expect(hasCodex(c)).toBe(false);
    expect(c.entities).toHaveLength(0);
  });

  it("handles undefined/empty input", () => {
    expect(hasCodex(parseCodex(undefined))).toBe(false);
    expect(hasCodex(parseCodex(""))).toBe(false);
  });
});

describe("codexLocal — GraphRAG local view", () => {
  const c = parseCodex(BIBLE);

  it("surfaces only entities mentioned in the text, plus 1-hop neighbours", () => {
    // Text mentions only อนันต์ → pulls in มาลี & เสือ via relations.
    const local = codexLocal(c, "บทนี้ อนันต์ ออกตามหาเบาะแส");
    const names = local.entities.map((e) => e.name).sort();
    expect(names).toContain("อนันต์");
    expect(names).toContain("มาลี"); // neighbour via พี่น้อง
    expect(names).toContain("เสือ"); // neighbour via ตามล่า
    expect(names).not.toContain("กรุงเทพเก่า"); // not mentioned, not a neighbour
  });

  it("returns empty when no declared entity appears", () => {
    expect(codexLocal(c, "ฉากเปิดที่ทะเล").entities).toHaveLength(0);
    expect(codexLocalTh(c, "ฉากเปิดที่ทะเล")).toBe("");
  });
});

describe("rendering", () => {
  it("digest lists cast + relations and asserts source-of-truth (TH & EN)", () => {
    const c = parseCodex(BIBLE);
    const th = codexDigestTh(c);
    expect(th).toContain("Codex ของหนังสือ");
    expect(th).toContain("ตัวละคร (3)");
    expect(th).toContain("แหล่งความจริง");
    expect(codexDigestEn(c)).toContain("Characters (3)");
  });

  it("empty codex renders to empty string (no injection)", () => {
    expect(codexDigestTh(parseCodex(""))).toBe("");
    expect(codexLocalTh(parseCodex(""), "anything")).toBe("");
  });
});

describe("end-to-end injection", () => {
  const base = {
    type: "novel", title: "เงามืด", thesis: "การตามหา", reader: "ผู้อ่าน", voice: "noir",
    chapters: 6, wordsPerChapter: 2000, subGenre: "thriller", citationStyle: "none",
    language: "thai", promptLanguage: "th",
    outline: "บทที่ 1: อนันต์ พบกุญแจทองคำ",
    storyBible: BIBLE,
  } as unknown as Parameters<typeof generateAllPrompts>[0];

  it("book digest reaches the MASTER prompt; chapter local view reaches CH_1", () => {
    const pack = generateAllPrompts(base, []);
    expect(pack.find((p) => p.id === "MASTER")!.prompt).toContain("Codex ของหนังสือ");
    const ch1 = pack.find((p) => p.id === "CH_1")!.prompt;
    expect(ch1).toContain("Codex ต่อเนื่อง (เฉพาะบทนี้)");
    expect(ch1).toContain("อนันต์");
    expect(ch1).toContain("กุญแจทองคำ"); // mentioned in ch1 beat
  });

  it("without a codex the same book injects nothing (snapshot-safe)", () => {
    const plain = generateAllPrompts({ ...base, storyBible: undefined } as typeof base, []);
    expect(plain.find((p) => p.id === "MASTER")!.prompt).not.toContain("Codex ของหนังสือ");
    expect(plain.find((p) => p.id === "CH_1")!.prompt).not.toContain("Codex ต่อเนื่อง");
  });
});
