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
  it("returns capabilities only Bookisdom provides fully", () => {
    const ids = soleProviders().map((c) => c.id);
    expect(ids).toContain("thai_dialect");
    expect(ids).toContain("sensory_density");
    // thai_native is NOT sole — AI Novel Workspace is also Thai-native
    expect(ids).not.toContain("thai_native");
    // Honest downgrades from widening the field to 20 rivals (2026-08). The matrix
    // exists to falsify Bookisdom's own pitch, so these are recorded, not absorbed:
    //  · saga — Plottr and Dabble ship real multi-book series bibles
    //  · privacy — Scrivener and Plottr are local-first with zero AI
    //  · consistency_auto — AutoCrit's Series Analyzer does cross-book contradiction
    //    tracking. It is LLM-based and paid where Bookisdom's is deterministic and free,
    //    but this model counts FEATURES, never weighted quality (see the header), so
    //    the mark stands and the sole-provider claim goes.
    for (const lost of ["saga", "privacy", "consistency_auto"]) expect(ids).not.toContain(lost);
    // What survived a 2x wider field: the Thai layer and measured sensory density.
    expect(ids).toEqual(expect.arrayContaining(["thai_dialect", "sensory_density"]));
    expect(ids).toHaveLength(2);
  });
});

describe("realGaps", () => {
  it("excludes deliberate non-goals and sorts by table-stakes", () => {
    const gaps = realGaps();
    const ids = gaps.map((g) => g.cap.id);
    expect(ids).not.toContain("ai_inline"); // intentional
    expect(ids).not.toContain("bsr"); // intentional
    // 2026-09: the two gaps that were closable in code were closed — and the closure is
    // pinned here so a regression in either screen would have to flip the matrix back.
    expect(ids).not.toContain("kdp"); // /bookisdom/kdp exposes kdp.ts
    expect(ids).not.toContain("privacy"); // Studio is browser → provider by default
    expect(mark("kdp", "bookisdom")).toBe("yes");
    expect(mark("privacy", "bookisdom")).toBe("yes");
    // What remains cannot be closed by code alone — and must stay listed until users say otherwise.
    expect(ids).toContain("mature_ux"); // soft gap, honestly surfaced
    expect(ids).toContain("community");
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
    expect(h.both).toContain("kdp"); // was a real gap BookyAI exposed; closed 2026-09
    expect(h.rivalOnlyIntentional).toContain("bsr"); // Bookisdom abstains on purpose
    expect(h.both).toContain("epub"); // both have it
    // Scrivener's remaining edge is the two soft dimensions only — privacy no longer.
    const sc = headToHead("scrivener");
    expect(sc.rivalOnly).not.toContain("privacy");
    expect(sc.both).toContain("privacy");
  });
  it("is internally consistent (every capability lands in exactly one bucket or none)", () => {
    const h = headToHead("sudowrite");
    const total = h.bookisdomOnly.length + h.rivalOnly.length + h.rivalOnlyIntentional.length + h.both.length;
    expect(total).toBeLessThanOrEqual(CAPABILITIES.length);
  });
});

describe("pressureRanking", () => {
  it("ranks incumbents (UX/community) above Bookisdom-shaped rivals", () => {
    const ranked = pressureRanking();
    expect(ranked[0].pressure).toBeGreaterThanOrEqual(ranked[ranked.length - 1].pressure);
    // an established web app should expose the soft gaps (mature_ux / community)
    const nc = ranked.find((r) => r.rival.id === "novelcrafter")!;
    expect(nc.pressure).toBeGreaterThan(0);
  });
});

describe("staleFacts", () => {
  it("flags rivals older than the window and never Bookisdom", () => {
    // 2026-08 sweep: all six previously-stale rivals were re-checked, so nothing
    // older than 6 months remains (freshness is data, not a fixed rival list).
    const now = staleFacts("2026-08", 6).map((r) => r.id);
    expect(now).not.toContain("novelcrafter"); // re-checked 2026-08
    expect(now).not.toContain("bookisdom");
    // far enough in the future, everything unrefreshed goes stale — except Bookisdom, by design
    const later = staleFacts("2027-06", 6).map((r) => r.id);
    expect(later).toContain("novelcrafter");
    expect(later).not.toContain("bookisdom");
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
