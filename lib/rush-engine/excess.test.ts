import { describe, it, expect } from "vitest";
import { excessVocabulary, formatExcess } from "./excess";

const repeat = (s: string, n: number) => Array(n).fill(s).join(" ");

describe("excessVocabulary", () => {
  it("finds a word over-represented in the suspect corpus with the right ratio", () => {
    // baseline: "delve" once in 1000-ish tokens; suspect: 10 times in similar size
    const base = repeat("the story moved forward with quiet purpose", 100) + " delve";
    const sus = repeat("the story moved forward with quiet purpose", 100) + " " + repeat("delve", 10);
    const r = excessVocabulary(base, sus, "en", 5);
    const delve = r.excess.find((w) => w.word === "delve");
    expect(delve).toBeTruthy();
    expect(delve!.countB).toBe(10);
    expect(delve!.ratio).toBeGreaterThanOrEqual(5);
  });

  it("reports words absent from the baseline separately (no fake infinity ratio)", () => {
    const base = repeat("ประโยคปกติที่ใช้ทั่วไปในนิยาย", 50);
    const sus = repeat("ประโยคปกติที่ใช้ทั่วไปในนิยาย", 50) + " " + repeat("ท่ามกลาง", 6);
    const r = excessVocabulary(base, sus, "th", 5);
    expect(r.onlyInB.some((w) => w.word === "ท่ามกลาง")).toBe(true);
    expect(r.excess.some((w) => w.word === "ท่ามกลาง")).toBe(false);
  });

  it("minCount guards against single-occurrence noise", () => {
    const base = "one two three four five six seven";
    const sus = "unusualword appears here just once in this text";
    const r = excessVocabulary(base, sus, "en", 5);
    expect(r.onlyInB).toEqual([]);
    expect(r.excess).toEqual([]);
  });

  it("is deterministic and reports corpus sizes", () => {
    const a = excessVocabulary("some baseline text here", "some suspect text here", "en");
    const b = excessVocabulary("some baseline text here", "some suspect text here", "en");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.tokensA).toBeGreaterThan(0);
    expect(a.tokensB).toBeGreaterThan(0);
  });
});

describe("formatExcess", () => {
  it("warns on small corpora and leaves the tell-verdict to the user", () => {
    const out = formatExcess(excessVocabulary("เล็ก", "เล็ก", "th"), "th");
    expect(out).toContain("⚠"); // under-5k warning
    expect(out).toContain("นับได้ ไม่ใช่คำตัดสิน");
    expect(out).toContain("วิจารณญาณของคุณ");
  });
});
