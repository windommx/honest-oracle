import { describe, it, expect } from "vitest";
import { analyzeProse, tokenizeProse, countSyllables, formatProseReport, proseDeltas, SLOP_TERMS } from "./prose-analyzer";

describe("tokenizeProse", () => {
  it("splits English into lowercased word tokens", () => {
    const t = tokenizeProse("The Quick, brown FOX!");
    expect(t).toEqual(["the", "quick", "brown", "fox"]);
  });
});

describe("analyzeProse", () => {
  it("flags AI-slop words and hollow formulas", () => {
    const a = analyzeProse("Let's delve into this rich tapestry. It's not just writing, it's art.");
    const phrases = a.slop.map((s) => s.phrase);
    expect(phrases).toContain("delve");
    expect(phrases).toContain("tapestry");
    expect(phrases).toContain("it's not just");
  });

  it("returns no slop for clean prose", () => {
    const a = analyzeProse("She set the keys on the table, one at a time.");
    expect(a.slop).toHaveLength(0);
  });

  it("counts filter / crutch words", () => {
    const a = analyzeProse("He just really felt that it was very simply done.");
    const words = a.filterWords.map((w) => w.word);
    expect(words).toContain("just");
    expect(words).toContain("really");
    expect(words).toContain("felt");
  });

  it("counts -ly adverbs but skips false friends like 'only' and 'family'", () => {
    const a = analyzeProse("He walked slowly and spoke softly, but only the family stayed.");
    const adv = a.adverbs.words.map((w) => w.word);
    expect(adv).toContain("slowly");
    expect(adv).toContain("softly");
    expect(adv).not.toContain("only");
    expect(adv).not.toContain("family");
    expect(a.adverbs.count).toBe(2);
  });

  it("counts told emotions", () => {
    const a = analyzeProse("She was angry and sad, then suddenly happy.");
    const tell = a.telling.words.map((w) => w.word);
    expect(tell).toContain("angry");
    expect(tell).toContain("sad");
    expect(a.telling.count).toBeGreaterThanOrEqual(3);
  });

  it("measures rhythm: uniform sentences are monotonous", () => {
    const flat = analyzeProse("He ran fast.\nShe ran fast.\nThey ran fast.\nWe ran fast.");
    expect(flat.rhythm.monotonyRun).toBeGreaterThanOrEqual(3);
  });

  it("flags repeated content words as echoes", () => {
    const a = analyzeProse("shadow shadow shadow shadow crept across the shadow wall");
    expect(a.echoes.some((e) => e.word === "shadow")).toBe(true);
  });

  it("estimates syllables with the vowel-group heuristic", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("running")).toBe(2);
    expect(countSyllables("readability")).toBeGreaterThanOrEqual(4);
  });

  it("computes Flesch readability: simple prose scores easier than dense prose", () => {
    const easy = analyzeProse("The cat sat. The dog ran. We had fun.");
    const hard = analyzeProse(
      "The unprecedented institutional ramifications necessitated comprehensive reconsideration of methodological assumptions."
    );
    expect(easy.readability.fleschEase).toBeGreaterThan(hard.readability.fleschEase);
    expect(hard.readability.fkGrade).toBeGreaterThan(easy.readability.fkGrade);
  });

  it("detects likely passive voice and leaves active prose alone", () => {
    const passiveText = analyzeProse("The vase was broken by the cat. Mistakes were made.");
    expect(passiveText.passive.count).toBeGreaterThanOrEqual(2);
    expect(passiveText.passive.samples.join(" ")).toMatch(/was broken|were made/);
    const activeText = analyzeProse("The cat broke the vase. She ran home.");
    expect(activeText.passive.count).toBe(0);
  });

  it("exposes a non-empty slop term list", () => {
    expect(SLOP_TERMS.length).toBeGreaterThan(10);
  });

  it("renders a Markdown report with the key sections and the matched terms", () => {
    const md = formatProseReport(analyzeProse("Let's delve into the tapestry. She was angry."));
    expect(md).toContain("# Prose Analysis Report");
    expect(md).toContain("AI-slop");
    expect(md).toContain("delve");
    expect(md).toContain("Told emotions");
    expect(md).toContain("not quality scores");
  });

  it("diffs two drafts so a revision's improvement is measurable", () => {
    const before = analyzeProse("She was very angry. He just delved into the rich tapestry.");
    const after = analyzeProse("She slammed the door. He opened the report.");
    const deltas = proseDeltas(before, after);
    const slop = deltas.find((d) => d.label === "AI-slop terms")!;
    expect(slop.before).toBeGreaterThan(0);
    expect(slop.after).toBe(0);
    expect(slop.delta).toBeLessThan(0); // fewer slop terms after — improvement (good=lower)
    expect(slop.good).toBe("lower");
    const told = deltas.find((d) => d.label === "Told emotions")!;
    expect(told.after).toBeLessThan(told.before);
  });
});
