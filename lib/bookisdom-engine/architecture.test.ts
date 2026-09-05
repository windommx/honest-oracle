import { describe, it, expect } from "vitest";
import { buildArchitecture } from "./architecture";
import type { BookConfig, BookTypeKey } from "./types";

// The `parts` map is a claim about the book's shape that a writer reads and trusts. Before
// this guard, several layouts computed the final part's start as ceil(ratio * ch) + 1, which
// at small chapter counts rounded up to ch + 1 and emitted a phantom trailing part like
// [7, 6] on a 6-chapter how-to — a reversed range advertising a chapter that does not exist.
// The real `chapters` array was always correct; the summary lied. These tests hold the
// summary to the same standard: no reversed ranges, nothing pointing past the last chapter,
// and no real chapter left uncovered — across every book type and every chapter count the UI
// permits (the generator caps chapters at 100; we test past it to 120 for margin).

const TYPES: BookTypeKey[] = [
  "novel", "nonfiction", "howto", "kids", "cookbook", "textbook", "memoir", "poetry",
];

function cfg(type: BookTypeKey, chapters: number): BookConfig {
  return {
    type, title: "T", thesis: "x", reader: "r", voice: "storytelling",
    chapters, wordsPerChapter: 2000, subGenre: "", citationStyle: "none", language: "english",
  };
}

describe("architecture parts map is honest for every type and chapter count", () => {
  it("no part range is reversed or points past the real chapter count", () => {
    const failures: string[] = [];
    for (const type of TYPES) {
      for (let ch = 1; ch <= 120; ch++) {
        const arch = buildArchitecture(cfg(type, ch));
        const n = arch.chapters.length;
        expect(n, `${type} ch=${ch}: chapters array length`).toBe(ch); // real content is unaffected
        for (const p of arch.parts) {
          const [start, end] = p.chapters;
          if (!(start >= 1 && start <= end && end <= n)) {
            failures.push(`${type} ch=${ch}: "${p.name}" [${start}, ${end}] (chapters=${n})`);
          }
        }
      }
    }
    expect(failures, `invalid part ranges:\n${failures.slice(0, 40).join("\n")}`).toEqual([]);
  });

  it("every real chapter is covered by at least one part — dropping phantoms never orphans content", () => {
    // The fix removes degenerate trailing parts. This proves that removal never leaves a real
    // chapter uncovered: the phantom only appears when the PRIOR part already reached ch, so
    // full coverage is preserved. Overlap between parts is allowed (phases can share a chapter);
    // a GAP is not.
    const failures: string[] = [];
    for (const type of TYPES) {
      for (let ch = 1; ch <= 120; ch++) {
        const arch = buildArchitecture(cfg(type, ch));
        const covered = new Set<number>();
        for (const p of arch.parts) {
          for (let c = p.chapters[0]; c <= p.chapters[1]; c++) covered.add(c);
        }
        for (let c = 1; c <= ch; c++) {
          if (!covered.has(c)) { failures.push(`${type} ch=${ch}: chapter ${c} in no part`); break; }
        }
      }
    }
    expect(failures, `chapters left uncovered:\n${failures.slice(0, 40).join("\n")}`).toEqual([]);
  });

  it("the specific small-count regressions that motivated this stay fixed", () => {
    // Exact cases captured from the audit repro, so a future refactor that reintroduces the
    // ceil() phantom fails loudly with a recognizable input rather than a property abstraction.
    const badRange = (type: BookTypeKey, ch: number) => {
      const arch = buildArchitecture(cfg(type, ch));
      const n = arch.chapters.length;
      return arch.parts.filter((p) => !(p.chapters[0] >= 1 && p.chapters[0] <= p.chapters[1] && p.chapters[1] <= n));
    };
    expect(badRange("howto", 6)).toEqual([]);       // was [7, 6]
    expect(badRange("nonfiction", 4)).toEqual([]);  // was [5, 4]
    expect(badRange("textbook", 3)).toEqual([]);    // was [4, 3]
    expect(badRange("memoir", 3)).toEqual([]);      // was [4, 3]
    expect(badRange("nonfiction", 1)).toEqual([]);  // was [2,2] and [3,1] — two phantoms
  });
});
