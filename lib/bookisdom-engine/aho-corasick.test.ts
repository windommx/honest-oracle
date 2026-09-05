import { describe, it, expect } from "vitest";
import { buildAutomaton, findAll, countNonOverlapping } from "./aho-corasick";

describe("aho-corasick findAll", () => {
  it("finds all patterns (including overlapping) in one pass", () => {
    const a = buildAutomaton(["he", "she", "his", "hers"]);
    const found = findAll("ushers", a).map((m) => m.pattern).sort();
    expect(found).toContain("she"); // ushers → she (1-3), he (2-3), hers (2-5)
    expect(found).toContain("he");
    expect(found).toContain("hers");
  });

  it("reports correct start/end offsets", () => {
    const a = buildAutomaton(["บท"]);
    const m = findAll("อ่านบทที่", a);
    expect(m).toHaveLength(1);
    expect("อ่านบทที่".slice(m[0].start, m[0].end)).toBe("บท");
  });
});

describe("countNonOverlapping matches split() semantics", () => {
  const bySplit = (text: string, p: string) => text.split(p).length - 1;

  it("agrees with split() on ASCII, Thai, and self-overlapping cases", () => {
    const cases: [string, string[]][] = [
      ["aaaa", ["aa"]], // self-overlap: split → 2
      ["aaa", ["aa"]], // → 1
      ["the cat sat", ["at", "the", "xyz"]],
      ["กลิ่นหอมกลิ่นฉุนกลิ่นสาบ", ["กลิ่น", "หอม", "สาบ"]],
      ["มะลิมะลิมะลี", ["มะลิ", "มะลี"]],
    ];
    for (const [text, pats] of cases) {
      const counts = countNonOverlapping(text, pats);
      for (const p of pats) {
        expect(counts.get(p), `${p} in "${text}"`).toBe(bySplit(text, p));
      }
    }
  });

  it("returns 0 for absent patterns and handles empty input", () => {
    expect(countNonOverlapping("", ["a"]).get("a")).toBe(0);
    expect(countNonOverlapping("abc", ["z"]).get("z")).toBe(0);
  });
});
