import { describe, it, expect } from "vitest";
import { deletes1, buildSymIndex, neighbors } from "./symspell";
import { withinOneEdit } from "./consistency";

describe("deletes1", () => {
  it("produces every single-char deletion", () => {
    expect(deletes1("cat").sort()).toEqual(["at", "ca", "ct"]);
    expect(deletes1("a")).toEqual([]);
  });
});

describe("symspell neighbors (verified edit distance ≤ 1)", () => {
  const terms = ["cat", "bat", "cot", "cats", "car", "dog", "kitten"];
  const idx = buildSymIndex(terms);

  it("finds substitutions, insertions, and deletions — not far words", () => {
    const n = neighbors("cat", idx, withinOneEdit).sort();
    expect(n).toContain("bat"); // substitution c→b
    expect(n).toContain("cot"); // substitution a→o
    expect(n).toContain("car"); // substitution t→r
    expect(n).toContain("cats"); // insertion
    expect(n).not.toContain("dog");
    expect(n).not.toContain("kitten");
    expect(n).not.toContain("cat"); // excludes itself
  });

  it("agrees with brute-force pairwise withinOneEdit", () => {
    for (const t of terms) {
      const viaIndex = new Set(neighbors(t, idx, withinOneEdit));
      const brute = new Set(terms.filter((o) => o !== t && withinOneEdit(t, o)));
      expect(viaIndex).toEqual(brute);
    }
  });
});
