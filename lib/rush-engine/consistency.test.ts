import { describe, it, expect } from "vitest";
import { consistencyLedger, withinOneEdit, thaiMarkVariant, storyBible, formatStoryBible } from "./consistency";

describe("withinOneEdit", () => {
  it("is true for a single substitution/insertion/deletion, false otherwise", () => {
    expect(withinOneEdit("Mali", "Maly")).toBe(true); // substitution
    expect(withinOneEdit("Mali", "Malik")).toBe(true); // insertion
    expect(withinOneEdit("Mali", "Mai")).toBe(true); // deletion
    expect(withinOneEdit("Mali", "Mali")).toBe(false); // identical = not a variant
    expect(withinOneEdit("Mali", "Sara")).toBe(false); // too far
  });
});

describe("thaiMarkVariant", () => {
  it("clusters mark-only differences but rejects consonant swaps", () => {
    expect(thaiMarkVariant("มะลิ", "มะลี")).toBe(true); // ิ ↔ ี (vowel mark)
    expect(thaiMarkVariant("เย็น", "เป็น")).toBe(false); // ย ↔ ป (consonant) — different word
    expect(thaiMarkVariant("เช้า", "เข้า")).toBe(false); // ช ↔ ข (consonant)
    expect(thaiMarkVariant("มะลิ", "มะลิ")).toBe(false); // identical
  });
});

describe("consistencyLedger — Thai precision (dogfood regressions)", () => {
  it("clusters a Thai mark-variant name and does NOT cluster common consonant-swap words", () => {
    const text = "บท1\nมะลิ เดิน มะลิ วิ่ง เย็น มาก เย็น จริง\nบท2\nมะลี มา มะลี ไป เป็น ที่ เป็น มา";
    const led = consistencyLedger(text, "th");
    const nameCluster = led.variantClusters.find((c) => c.some((t) => t.term === "มะลิ") && c.some((t) => t.term === "มะลี"));
    expect(nameCluster).toBeTruthy(); // มะลิ ↔ มะลี caught
    // เย็น/เป็น (consonant swap) must never appear in the same cluster
    const bad = led.variantClusters.find((c) => c.some((t) => t.term === "เย็น") && c.some((t) => t.term === "เป็น"));
    expect(bad).toBeFalsy();
  });

  it("protect list raises the segmentation ceiling — catches a name the segmenter would split", () => {
    const text = "บท1\nมะลิเดินไกล มะลิยิ้มรับ\nบท2\nมะลีนั่งเงียบ มะลีลุกขึ้นยืน";
    const bare = consistencyLedger(text, "th");
    const guarded = consistencyLedger(text, "th", ["มะลิ", "มะลี"]);
    const cluster = guarded.variantClusters.find((c) => c.some((t) => t.term === "มะลิ") && c.some((t) => t.term === "มะลี"));
    expect(cluster).toBeTruthy(); // with the writer's name list, the variant is caught
    void bare; // (bare may miss it — that's the documented ceiling this feature lifts)
  });

  it("excludes Thai stopwords from dropped terms", () => {
    const text = "บท1\nนั้น นั้น นั้น หมาป่า หมาป่า หมาป่า\nบท2\nเธอ พัก\nบท3\nเดินทาง\nบท4\nจบ";
    const led = consistencyLedger(text, "th");
    expect(led.dropped.some((t) => t.term === "นั้น")).toBe(false); // stopword, not a real dropped term
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
