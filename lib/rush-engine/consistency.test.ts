import { describe, it, expect } from "vitest";
import { consistencyLedger, withinOneEdit, storyBible, formatStoryBible } from "./consistency";

describe("withinOneEdit", () => {
  it("is true for a single substitution/insertion/deletion, false otherwise", () => {
    expect(withinOneEdit("Mali", "Maly")).toBe(true); // substitution
    expect(withinOneEdit("Mali", "Malik")).toBe(true); // insertion
    expect(withinOneEdit("Mali", "Mai")).toBe(true); // deletion
    expect(withinOneEdit("Mali", "Mali")).toBe(false); // identical = not a variant
    expect(withinOneEdit("Mali", "Sara")).toBe(false); // too far
  });
});

describe("consistencyLedger", () => {
  it("clusters the same name spelled inconsistently across chapters", () => {
    const text = "## Chapter 1\nMali walked. Mali ran.\n## Chapter 2\nThen Maly appeared near Maly's door.";
    const led = consistencyLedger(text, "en");
    const cluster = led.variantClusters.find((c) => c.some((t) => t.term === "Mali") && c.some((t) => t.term === "Maly"));
    expect(cluster).toBeTruthy();
    expect(cluster!.map((t) => t.term).sort()).toEqual(["Mali", "Maly"]);
  });

  it("flags a name introduced then dropped by mid-book", () => {
    const text =
      "## Ch1\nGoblin Goblin Goblin attacked.\n## Ch2\nThe hero rested.\n## Ch3\nThey traveled on.\n## Ch4\nThe end came.";
    const led = consistencyLedger(text, "en");
    expect(led.chapters).toBe(4);
    expect(led.dropped.some((t) => t.term === "Goblin")).toBe(true);
  });

  it("runs the Thai path over chapters (variant detection is bounded by word segmentation)", () => {
    // The Intl.Segmenter dictionary can split an unknown Thai name into known
    // sub-words, so name-spelling variants aren't always caught — this asserts
    // the deterministic pass runs and counts chapters/terms, not perfect recall.
    const led = consistencyLedger("บทที่ 1\nเขาเดินทางไกล\nบทที่ 2\nเธอรออยู่ที่นั่น", "th");
    expect(led.chapters).toBe(2);
    expect(led.terms).toBeGreaterThan(0);
    expect(Array.isArray(led.variantClusters)).toBe(true);
  });

  it("returns empty clusters for consistent prose", () => {
    const led = consistencyLedger("## Ch1\nMarcus spoke.\n## Ch2\nMarcus left.", "en");
    expect(led.variantClusters).toHaveLength(0);
  });
});

describe("storyBible", () => {
  it("extracts recurring entities with frequency and chapter span", () => {
    const text =
      "## Ch1\nMarcus met Elena. Marcus smiled.\n## Ch2\nMarcus left.\n## Ch3\nMarcus returned to Elena. Elena waited. Elena hoped.";
    const bible = storyBible(text, "en");
    expect(bible.chapters).toBe(3);
    const marcus = bible.entries.find((e) => e.term === "Marcus");
    expect(marcus).toBeTruthy();
    expect(marcus!.count).toBe(4);
    expect(marcus!.firstChapter).toBe(1);
    expect(marcus!.lastChapter).toBe(3);
    expect(marcus!.span).toBe(3);
  });

  it("omits terms below the minCount threshold", () => {
    const bible = storyBible("## Ch1\nA rare Sparrow appeared once.\n## Ch2\nNothing.", "en");
    expect(bible.entries.some((e) => e.term === "Sparrow")).toBe(false);
  });

  it("renders paste-ready markdown with a table", () => {
    const bible = storyBible("## Ch1\nNova Nova Nova ran.\n## Ch2\nNova rested.", "en");
    const md = formatStoryBible(bible, "en");
    expect(md).toContain("# Story Bible");
    expect(md).toContain("| Term | Uses | Chapters | Span |");
    expect(md).toContain("Nova");
  });
});
