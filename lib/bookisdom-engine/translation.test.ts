import { describe, it, expect } from "vitest";
import { checkTranslation, expansionReport, type TermRule } from "./translation";

const rules: TermRule[] = [
  { target: "Taba", source: "ตบะ", forbidden: ["magic", "mana", "qi"], caseSensitive: true },
  { target: "Hermit", source: "ฤๅษี" },
];

describe("checkTranslation", () => {
  it("flags a banned rendering (Taba → magic)", () => {
    const f = checkTranslation("เขาสั่งสมตบะ", "He gathered magic in his veins", rules);
    const hit = f.find((x) => x.kind === "forbidden-rendering");
    expect(hit?.rule).toBe("Taba");
    expect(hit?.detail).toContain("magic");
  });

  it("flags a dropped canon term (present in source, absent in target)", () => {
    const f = checkTranslation("พลังตบะของเขาแข็งแกร่ง", "His inner power was strong.", rules);
    expect(f.some((x) => x.kind === "dropped-term" && x.rule === "Taba")).toBe(true);
  });

  it("flags wrong capitalisation of a case-sensitive term", () => {
    const f = checkTranslation("ตบะ", "His taba surged, then his Taba settled.", rules);
    const wc = f.find((x) => x.kind === "wrong-case");
    expect(wc?.count).toBe(1); // "taba" lowercase once; "Taba" correct once
  });

  it("does not match a forbidden word inside another word (magical ≠ magic)", () => {
    const f = checkTranslation("ตบะ", "a magical Taba", rules);
    expect(f.some((x) => x.kind === "forbidden-rendering")).toBe(false);
  });

  it("is clean for a faithful translation", () => {
    const f = checkTranslation("เขาสั่งสมตบะ ฤๅษีเฝ้ามอง", "He gathered Taba as the Hermit watched.", rules);
    expect(f).toHaveLength(0);
  });
});

describe("expansionReport", () => {
  it("flags a chapter that ballooned vs the book's median ratio", () => {
    // ch1/ch2 translate ~1:1-ish; ch3 target is hugely longer than its source.
    const source = "## 1\n" + "ก".repeat(100) + "\n## 2\n" + "ก".repeat(100) + "\n## 3\n" + "ก".repeat(100);
    const target = "## 1\n" + "a".repeat(150) + "\n## 2\n" + "a".repeat(150) + "\n## 3\n" + "a".repeat(600);
    const r = expansionReport(source, target);
    expect(r.chunks).toHaveLength(3);
    expect(r.chunks[2].flag).toBe("expanded");
    expect(r.chunks[0].flag).toBeNull();
  });
});
