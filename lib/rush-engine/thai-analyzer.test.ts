import { describe, it, expect } from "vitest";
import { analyzeThai, tokenizeThai, THAI_AI_TELLS } from "./thai-analyzer";

describe("tokenizeThai", () => {
  it("segments Thai text into multiple words", () => {
    const words = tokenizeThai("เธอเดินเข้ามาในห้องมืด");
    expect(words.length).toBeGreaterThan(1);
    expect(words.join("")).toContain("ห้อง");
  });

  it("drops whitespace and punctuation", () => {
    const words = tokenizeThai("สวัสดี ครับ! ๆ");
    expect(words).not.toContain(" ");
    expect(words).not.toContain("!");
  });
});

describe("analyzeThai", () => {
  it("counts words and flags repeated content words as echoes", () => {
    const text = "ฝนตกหนัก ฝนตกหนัก ฝนตกหนักทั้งคืน";
    const a = analyzeThai(text);
    expect(a.wordCount).toBeGreaterThan(3);
    expect(a.echoes.some((e) => e.word === "ฝน" || e.word === "ตก")).toBe(true);
  });

  it("detects near-repeats (same content word within a short span)", () => {
    const a = analyzeThai("แมวดำกระโดดข้ามรั้ว แล้วแมวขาวก็เดินตามมา");
    expect(a.nearRepeats.some((r) => r.word === "แมว")).toBe(true);
  });

  it("detects AI-tell emotion clichés", () => {
    const a = analyzeThai("เธอยืนนิ่ง น้ำตาไหลริน หัวใจสลายเป็นเสี่ยง");
    const phrases = a.aiTells.map((t) => t.phrase);
    expect(phrases).toContain("น้ำตาไหลริน");
    expect(phrases).toContain("หัวใจสลาย");
  });

  it("returns empty AI-tells for clean prose", () => {
    const a = analyzeThai("เขาวางถ้วยกาแฟลงบนโต๊ะไม้เก่า");
    expect(a.aiTells).toHaveLength(0);
  });

  it("exposes a non-empty cliché list", () => {
    expect(THAI_AI_TELLS.length).toBeGreaterThan(5);
  });
});
