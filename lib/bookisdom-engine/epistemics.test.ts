import { describe, it, expect } from "vitest";
import {
  TIERS,
  SIGNAL_REGISTRY,
  REFUSED_CONSTRUCTS,
  KALAMA_GROUNDS,
  classifySignal,
  isAdmissible,
  isRefused,
  warrant,
  groupByTier,
  llmKalamaViolations,
  tierInfo,
} from "./epistemics";

describe("epistemic tiers", () => {
  it("has four tiers ordered strongest → refused, only the last inadmissible", () => {
    expect(TIERS.map((t) => t.id)).toEqual(["paccakkha", "anumana", "sanna", "avisaya"]);
    expect(TIERS.filter((t) => t.admissible).map((t) => t.id)).toEqual(["paccakkha", "anumana", "sanna"]);
    expect(tierInfo("avisaya").admissible).toBe(false);
  });

  it("every registered signal is reproducible and never in the refused tier", () => {
    for (const s of SIGNAL_REGISTRY) {
      expect(s.reproducible).toBe(true);
      expect(s.tier).not.toBe("avisaya");
      expect(s.instrument.length).toBeGreaterThan(0); // instrument disclosed (Hanson)
    }
  });

  it("word count is a direct perception-grade count (ratio scale)", () => {
    const c = classifySignal("wordCount");
    expect(c?.tier).toBe("paccakkha");
    expect(c?.level).toBe("ratio");
    expect(isAdmissible("wordCount")).toBe(true);
  });

  it("a derived ratio is admissible inference (anumana), not a direct count", () => {
    expect(classifySignal("rhythmCv")?.tier).toBe("anumana");
    expect(classifySignal("sensoryPer1k")?.tier).toBe("anumana");
    expect(isAdmissible("rhythmCv")).toBe(true);
  });

  it("heuristic flags are saññā — labelled, theory-laden, still disclosed", () => {
    expect(classifySignal("variantClusters")?.tier).toBe("sanna");
    expect(classifySignal("offCanon")?.tier).toBe("sanna");
    expect(classifySignal("registerSuggestions")?.tier).toBe("sanna");
  });

  it("returns null for an unknown signal instead of guessing a tier", () => {
    expect(classifySignal("bogus")).toBeNull();
    expect(isAdmissible("bogus")).toBe(false);
    expect(warrant("bogus")).toBeNull();
  });
});

describe("the refused boundary", () => {
  it("refuses the subjective 0–100 constructs competitors invent", () => {
    for (const id of ["momentum", "clarity", "tension", "flowScore", "overallQuality"]) {
      expect(isRefused(id)).toBe(true);
    }
    expect(isRefused("wordCount")).toBe(false);
  });

  it("refuses the predicted-reader-behaviour metrics external specs ship as measurements", () => {
    // These arrived in a hard-SF generator spec printed beside adoptable physics.
    // Each predicts what a reader who has not read the book will do — unfalsifiable
    // at print time, and impossible to derive from the manuscript alone.
    for (const id of ["predictedReadThrough", "cliffhangerEffectiveness", "nextChapterClickProbability", "aiSlopScore"]) {
      expect(isRefused(id)).toBe(true);
    }
  });

  it("every refused construct names why it is refused", () => {
    for (const c of REFUSED_CONSTRUCTS) expect(c.why.length).toBeGreaterThan(10);
  });

  it("no refused construct id ever appears in the admissible registry", () => {
    const refusedIds = new Set(REFUSED_CONSTRUCTS.map((c) => c.id));
    for (const s of SIGNAL_REGISTRY) expect(refusedIds.has(s.id)).toBe(false);
  });
});

describe("Kālāma grounds", () => {
  it("lists the ten grounds", () => {
    expect(KALAMA_GROUNDS).toHaveLength(10);
    expect(KALAMA_GROUNDS.map((g) => g.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("flags inference (#6) and seeming-credibility (#9) as grounds an LLM score leans on", () => {
    const leans = new Set(llmKalamaViolations().map((g) => g.n));
    expect(leans.has(6)).toBe(true); // mā nayahetu — เพราะการอนุมาน
    expect(leans.has(9)).toBe(true); // mā bhabbarūpatāya — ดูน่าเชื่อถือ
    expect(leans.size).toBeGreaterThanOrEqual(4);
  });
});

describe("warrant + grouping", () => {
  it("a warrant cites the tier, the instrument, and reproducibility", () => {
    const w = warrant("sensoryPer1k")!;
    expect(w).toContain("อนุมาน");
    expect(w).toContain("×"); // the disclosed formula fragment "÷ words × 1000"
    expect(w).toContain("re-derivable");
  });

  it("groups a mixed readout by tier, strongest first, dropping unknowns", () => {
    const groups = groupByTier(["wordCount", "rhythmCv", "offCanon", "bogus"]);
    expect(groups.map((g) => g.tier.id)).toEqual(["paccakkha", "anumana", "sanna"]);
    expect(groups[0].signals[0].id).toBe("wordCount");
  });
});
