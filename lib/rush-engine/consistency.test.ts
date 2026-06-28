import { describe, it, expect } from "vitest";
import { consistencyLedger, withinOneEdit } from "./consistency";

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
