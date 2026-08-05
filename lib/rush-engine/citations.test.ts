import { describe, it, expect } from "vitest";
import {
  CITATIONS, citation, citationsFor, disputed, recheckQueue, coverage, countYearMentions, formatCitationLedger,
} from "./citations";
import { MODULE_CATALOG, MODULE_GROUPS } from "./modules";
import { generateAllPrompts, type BookConfig } from "./engine";

const cfg: BookConfig = {
  type: "novel", title: "T", thesis: "p", reader: "r", voice: "storytelling",
  chapters: 12, wordsPerChapter: 2000, subGenre: "thriller", citationStyle: "none", language: "english",
};
const ALL = generateAllPrompts(cfg, MODULE_GROUPS.map((m) => m.key));
const promptOf = (id: string) => ALL.find((p) => p.id === id)?.prompt ?? "";

describe("registry integrity", () => {
  it("ids are unique and every entry is complete", () => {
    const ids = CITATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CITATIONS) {
      expect(c.who.length, c.id).toBeGreaterThan(0);
      expect(c.year.length, c.id).toBeGreaterThan(0);
      expect(c.claim.length, c.id).toBeGreaterThan(20); // the claim, not the topic
      expect(c.usedIn.length, c.id).toBeGreaterThan(0);
    }
  });

  it("every usedIn names a module that exists", () => {
    const known = new Set(MODULE_CATALOG.map((m) => m.id));
    for (const c of CITATIONS) {
      for (const m of c.usedIn) expect(known.has(m), `${c.id} → ${m}`).toBe(true);
    }
  });

  it("a disputed citation MUST carry its caveat", () => {
    // Registering a contested finding without saying why it is contested would be worse
    // than not registering it — it would launder the doubt into a normal-looking source.
    for (const c of disputed()) expect((c.note ?? "").length, c.id).toBeGreaterThan(40);
  });
});

describe("the registry actually matches the modules", () => {
  it("each cited module really mentions the source — no phantom citations", () => {
    // Guards the failure this registry could otherwise create: a tidy ledger describing
    // citations the prompts do not contain.
    const missing: string[] = [];
    for (const c of CITATIONS) {
      for (const m of c.usedIn) {
        const text = promptOf(m);
        // match on a distinctive surname or the work — whichever the module uses
        // Strip parentheticals first: a "who" like "Chekhov (letter to Lazarev)" would
        // otherwise yield "Lazarev)" as the surname and the check would miss a real hit.
        const surnames = c.who
          .replace(/\([^)]*\)/g, "")
          .split(/[,&;]| and /)
          .map((s) => s.trim().split(/\s+/).pop() ?? "")
          .filter((s) => s.length > 3);
        const hit = surnames.some((s) => text.includes(s)) || (c.work.length > 6 && text.includes(c.work));
        if (!hit) missing.push(`${c.id} claims to be in ${m}, but ${m} mentions neither ${surnames.join("/")} nor "${c.work}"`);
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});

describe("queries", () => {
  it("citationsFor returns a module's sources", () => {
    const ids = citationsFor("RECAP").map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["booookscore", "chain-of-density", "maynez-faithfulness"]));
    expect(citationsFor("NOT_A_MODULE")).toEqual([]);
  });

  it("recheckQueue puts memory-tier first and excludes disputed", () => {
    const q = recheckQueue();
    expect(q.length).toBeGreaterThan(0);
    expect(q[0].tier).toBe("memory");
    // A disputed tier describes the CLAIM, not how carefully it was checked — putting it
    // in a verification queue would be a category error.
    expect(q.map((c) => c.tier)).not.toContain("disputed");
  });

  it("citation() returns null for an unknown id rather than guessing", () => {
    expect(citation("booookscore")).not.toBeNull();
    expect(citation("nope")).toBeNull();
  });
});

describe("honest self-report", () => {
  it("coverage counts the denominator live from real prompt text, over-counting on purpose", () => {
    // The denominator is computed from the actual generated prompts, never a constant, so
    // it cannot drift into looking flattering as modules grow.
    const text = ALL.map((p) => p.prompt).join("\n");
    const c = coverage(text);
    expect(c.registered).toBe(CITATIONS.length);
    expect(c.note).toMatch(/PARTIAL/);
    expect(c.note).toMatch(/over-count/i);
    // the gap is real and must not be dressed up as complete
    expect(c.registered).toBeLessThan(c.mentionsEstimate);
  });

  it("countYearMentions is deterministic and catches years + arXiv ids", () => {
    expect(countYearMentions("Eliot 1919 and Gardner 1983")).toBe(2);
    expect(countYearMentions("see arXiv:2510.01171")).toBe(1); // arXiv id whose lead digits are not a year
    expect(countYearMentions("Chang 2024, arXiv:2310.00785")).toBe(2); // a year AND an arxiv id
    const t = "Roediger 2006; Brunmair 2019";
    expect(countYearMentions(t)).toBe(countYearMentions(t)); // pure
  });

  it("most of the registry is index-tier, reflecting the blocked network", () => {
    // Stated as a test so it cannot quietly drift into an implied 'we read the papers'.
    const byTier = (t: string) => CITATIONS.filter((c) => c.tier === t).length;
    expect(byTier("primary")).toBe(0); // the gateway 403s scholarly hosts
    expect(byTier("index") + byTier("memory")).toBeGreaterThan(byTier("disputed"));
  });

  it("the ledger labels tiers as how-checked, never as how-good", () => {
    const md = formatCitationLedger();
    expect(md).toContain("ตรวจแค่ไหน ไม่ใช่ดีแค่ไหน");
    expect(md).toContain("ไม่ได้เปิดหน้าเอกสาร"); // index tier stated plainly
    expect(md).toContain("Chang, Lo, Goyal & Iyyer");
  });
});
