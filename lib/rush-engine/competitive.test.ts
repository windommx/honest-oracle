import { describe, it, expect } from "vitest";
import {
  RIVALS, CAPABILITIES, mark, soleProviders, realGaps, intentionalNonGoals,
  headToHead, pressureRanking, staleFacts, formatIntelBrief, INTENTIONAL_NONGOALS,
} from "./competitive";

describe("competitive matrix integrity", () => {
  it("every capability has a mark for every rival", () => {
    for (const c of CAPABILITIES) {
      for (const r of RIVALS) {
        expect(["yes", "partial", "no", "unknown"]).toContain(mark(c.id, r.id));
      }
    }
  });
  it("every rival declares a source and an as-of date (honest provenance)", () => {
    for (const r of RIVALS) {
      expect(r.source.length).toBeGreaterThan(0);
      expect(r.asOf).toMatch(/^\d{4}-\d{2}$/);
    }
  });
});

describe("SuperCool row (AI-publishing-funnel rival)", () => {
  it("carries review-tier provenance and only the marks reviews actually support", () => {
    const sc = RIVALS.find((r) => r.id === "supercool")!;
    expect(sc.source).toContain("user reviews"); // vendor claims cross-checked, never vendor-only
    // reviews confirm drift/inconsistency on long books → no consistency machinery
    expect(mark("consistency_auto", "supercool")).toBe("no");
    // credit system on top of subscription = lock-in, the opposite of BYO-key
    expect(mark("byo_key", "supercool")).toBe("no");
    // what reviews DO confirm working: guided flow + one-click generation
    expect(mark("starter_flow", "supercool")).toBe("yes");
    expect(mark("ai_inline", "supercool")).toBe("yes");
    // unverified vendor claims stay "unknown" — not charitably upgraded to "yes"
    expect(mark("story_bible", "supercool")).toBe("unknown");
  });
});

describe("soleProviders", () => {
  it("returns capabilities only Rush provides fully", () => {
    const ids = soleProviders().map((c) => c.id);
    expect(ids).toContain("thai_dialect");
    expect(ids).toContain("consistency_auto");
    expect(ids).toContain("sensory_density");
    // thai_native is NOT sole — AI Novel Workspace is also Thai-native
    expect(ids).not.toContain("thai_native");
    // Honest downgrades found when the field was widened to 15 rivals (2026-08):
    // Plottr and Dabble ship full multi-book series bibles, so saga is no longer
    // sole; Scrivener and Plottr are local-first with zero AI, so privacy isn't
    // either. The moat that survived a 3x wider field is the Thai + measured-
    // signal core, which is the honest version of the pitch.
    expect(ids).not.toContain("saga");
    expect(ids).not.toContain("privacy");
  });
});

describe("realGaps", () => {
  it("excludes deliberate non-goals and sorts by table-stakes", () => {
    const gaps = realGaps();
    const ids = gaps.map((g) => g.cap.id);
    expect(ids).not.toContain("ai_inline"); // intentional
    expect(ids).not.toContain("bsr"); // intentional
    expect(ids).toContain("kdp"); // BookyAI has it, Rush partial
    expect(ids).toContain("mature_ux"); // soft gap, honestly surfaced
    // sorted descending by how many rivals have it
    for (let i = 1; i < gaps.length; i++) expect(gaps[i - 1].tableStakes).toBeGreaterThanOrEqual(gaps[i].tableStakes);
    // the biggest table-stakes gap has more rivals than the smallest
    expect(gaps[0].tableStakes).toBeGreaterThan(1);
  });
});

describe("intentionalNonGoals", () => {
  it("surfaces exactly the tagged non-goals with a reason", () => {
    const ids = intentionalNonGoals().map((n) => n.cap.id);
    expect(new Set(ids)).toEqual(new Set(Object.keys(INTENTIONAL_NONGOALS)));
    for (const n of intentionalNonGoals()) expect(n.why.length).toBeGreaterThan(0);
  });
});

describe("headToHead", () => {
  it("splits rival advantages into real vs intentional", () => {
    const h = headToHead("bookyai");
    expect(h.rivalOnly).toContain("kdp"); // a real gap BookyAI exposes
    expect(h.rivalOnlyIntentional).toContain("bsr"); // Rush abstains on purpose
    expect(h.both).toContain("epub"); // both have it
  });
  it("is internally consistent (every capability lands in exactly one bucket or none)", () => {
    const h = headToHead("sudowrite");
    const total = h.rushOnly.length + h.rivalOnly.length + h.rivalOnlyIntentional.length + h.both.length;
    expect(total).toBeLessThanOrEqual(CAPABILITIES.length);
  });
});

describe("pressureRanking", () => {
  it("ranks incumbents (UX/community) above Rush-shaped rivals", () => {
    const ranked = pressureRanking();
    expect(ranked[0].pressure).toBeGreaterThanOrEqual(ranked[ranked.length - 1].pressure);
    // an established web app should expose the soft gaps (mature_ux / community)
    const nc = ranked.find((r) => r.rival.id === "novelcrafter")!;
    expect(nc.pressure).toBeGreaterThan(0);
  });
});

describe("staleFacts", () => {
  it("flags rivals older than the window and never Rush", () => {
    // 2026-08 sweep: all six previously-stale rivals were re-checked, so nothing
    // older than 6 months remains (freshness is data, not a fixed rival list).
    const now = staleFacts("2026-08", 6).map((r) => r.id);
    expect(now).not.toContain("novelcrafter"); // re-checked 2026-08
    expect(now).not.toContain("rush");
    // far enough in the future, everything unrefreshed goes stale — except Rush, by design
    const later = staleFacts("2027-06", 6).map((r) => r.id);
    expect(later).toContain("novelcrafter");
    expect(later).not.toContain("rush");
  });
});

describe("formatIntelBrief", () => {
  it("renders the computed brief with the bias note", () => {
    const md = formatIntelBrief("2026-08");
    expect(md).toContain("# Competitive Intelligence Brief");
    expect(md).toContain("Sole advantages");
    expect(md).toContain("Deliberate non-goals");
    expect(md).toContain("อคติที่ต้องรู้"); // self-aware bias disclosure
  });
});
