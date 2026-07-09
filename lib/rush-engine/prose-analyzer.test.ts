import { describe, it, expect } from "vitest";
import {
  analyzeProse,
  tokenizeProse,
  countSyllables,
  formatProseReport,
  proseDeltas,
  splitChapters,
  scanManuscript,
  SLOP_TERMS,
} from "./prose-analyzer";

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

  it("does not flag be-verb + adjective/number as passive (red, ten, open, often)", () => {
    const a = analyzeProse("The sky is red. He is ten. The door is open. She was often late.");
    expect(a.passive.count).toBe(0);
  });

  it("does not count predicate adjectives as passive, but keeps agentless passives", () => {
    expect(analyzeProse("She was tired. He is excited. They were bored and worried.").passive.count).toBe(0);
    // genuine agentless passives still count
    expect(analyzeProse("Mistakes were made. The window was shattered.").passive.count).toBeGreaterThanOrEqual(2);
  });

  it("flags mechanical issues (double space, repeated word, space before comma)", () => {
    const a = analyzeProse("He went  home and and sat , quietly.");
    const issues = a.mechanics.map((m) => m.issue);
    expect(issues).toContain("double spaces");
    expect(issues.some((i) => i.startsWith("repeated word"))).toBe(true);
    expect(issues).toContain("space before punctuation");
  });

  it("reports no mechanics for clean prose", () => {
    expect(analyzeProse("She set the keys on the table.").mechanics).toHaveLength(0);
  });

  it("does not flag slop substrings inside unrelated words (delved≠delve, realms≠realm)", () => {
    const a = analyzeProse("She delved? No — she walked through quiet realms of nothing.");
    // 'delved'/'realms' are NOT the standalone slop tokens 'delve'/'realm'
    expect(a.slop.find((s) => s.phrase === "delve")).toBeUndefined();
    expect(a.slop.find((s) => s.phrase === "realm")).toBeUndefined();
    // but the bare word still counts
    expect(analyzeProse("a vast realm").slop.find((s) => s.phrase === "realm")?.count).toBe(1);
  });

  it("splits chapters numbered with Thai digits (บทที่ ๑)", () => {
    const scan = scanManuscript("บทที่ ๑\nShe ran.\nบทที่ ๒\nHe stayed.");
    expect(scan).toHaveLength(2);
    expect(scan[0].title).toContain("๑");
  });

  it("does not double-count overlapping slop phrases (a testament to ⊃ testament)", () => {
    const a = analyzeProse("This book is a testament to her skill.");
    const testament = a.slop.find((s) => s.phrase === "testament");
    expect(testament).toBeUndefined(); // absorbed by "a testament to"
    expect(a.slop.find((s) => s.phrase === "a testament to")?.count).toBe(1);
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

  it("splits a manuscript on headings and falls back to one chunk", () => {
    const single = splitChapters("Just one block of prose with no headings.");
    expect(single).toHaveLength(1);
    const multi = splitChapters("## Chapter 1\nShe ran.\n## Chapter 2\nHe stayed.");
    expect(multi.length).toBe(2);
    expect(multi[0].title).toMatch(/Chapter 1/);
    expect(multi[1].body).toContain("He stayed");
  });

  it("scores each chapter so the weakest one is visible", () => {
    const scan = scanManuscript("Chapter 1\nShe slammed the door shut.\nChapter 2\nHe delved into the tapestry.");
    expect(scan).toHaveLength(2);
    expect(scan[1].slop).toBeGreaterThan(scan[0].slop); // ch2 has slop, ch1 doesn't
    expect(scan.every((c) => c.words > 0)).toBe(true);
    expect(scan[1].body).toContain("delved"); // body carried for click-to-load
  });
});
