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

  it("computes sentence-length stats", () => {
    const a = analyzeThai("เขาเดินเข้ามา\nเธอหันมามอง แล้วยิ้มน้อย ๆ");
    expect(a.sentences.count).toBeGreaterThanOrEqual(2);
    expect(a.sentences.avgWords).toBeGreaterThan(0);
    expect(a.sentences.longest).toBeGreaterThanOrEqual(a.sentences.avgWords);
  });

  it("computes dialogue signals (ratio + talking-head run)", () => {
    const text = '"เธอมาทำไม"\n"ฉันมาหาคำตอบ"\n"คำตอบอะไร"\nเขาเงียบไปครู่หนึ่ง';
    const a = analyzeThai(text);
    expect(a.dialogue.lines).toBeGreaterThanOrEqual(3);
    expect(a.dialogue.talkingHeadRun).toBeGreaterThanOrEqual(3);
    expect(a.dialogue.ratio).toBeGreaterThan(0);
  });

  it("measures rhythm: uniform sentences are monotonous, varied ones are not", () => {
    const flat = analyzeThai("เขาเดินไปตลาด\nเธอเดินไปตลาด\nฉันเดินไปตลาด\nเราเดินไปตลาด");
    expect(flat.rhythm.monotonyRun).toBeGreaterThanOrEqual(3);
    const varied = analyzeThai("เขาวิ่ง\nเธอยืนมองท้องฟ้าสีครามที่ทอดยาวเหนือทุ่งหญ้ากว้างไกลสุดลูกหูลูกตา\nเงียบ");
    expect(varied.rhythm.cv).toBeGreaterThan(flat.rhythm.cv);
  });

  it("counts telling markers (filter verbs + named emotions)", () => {
    const a = analyzeThai("เธอรู้สึกโกรธมาก เขาเสียใจและกลัว");
    const matched = a.telling.words.map((w) => w.word);
    expect(matched).toContain("รู้สึก");
    expect(matched).toContain("โกรธ");
    expect(a.telling.count).toBeGreaterThanOrEqual(4);
    expect(a.telling.ratio).toBeGreaterThan(0);
  });

  it("returns no telling markers for shown prose", () => {
    const a = analyzeThai("เขากำมือแน่นจนข้อนิ้วขาว แล้วผลักประตูจนกระแทกผนัง");
    expect(a.telling.count).toBe(0);
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
