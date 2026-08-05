// ╔══════════════════════════════════════════════════════════════════╗
// ║  CITATIONS — the same standard, applied to sources.               ║
// ║                                                                    ║
// ║  Rush classifies every NUMBER it reports by what kind of knowing   ║
// ║  produced it (epistemics.ts) and prints the instrument beside it   ║
// ║  (provenance.ts). Its own CITATIONS had no such discipline: 70     ║
// ║  year-bearing references across 47 lines of modules.ts, none of    ║
// ║  them recorded, none carrying how strongly they were checked. A    ║
// ║  tool that refuses "momentum 73/100" while citing a study from     ║
// ║  memory is applying its rule to one column of the ledger.          ║
// ║                                                                    ║
// ║  So: the same four-tier move, for sources. What matters is not     ║
// ║  whether a citation is IMPRESSIVE but how it was CHECKED, and the  ║
// ║  weak ones stay visible instead of being quietly upgraded.         ║
// ║                                                                    ║
// ║  This registry is PARTIAL and says so — coverage() reports it as a ║
// ║  number rather than letting the gap pass for completeness. It      ║
// ║  starts with what has actually been audited.                       ║
// ╚══════════════════════════════════════════════════════════════════╝

/** How strongly a citation was checked. Nothing to do with how good the work is. */
export type CiteTier =
  /** The source itself was opened and the claim read in it. */
  | "primary"
  /** A search index returned the title, authors and venue, and the claim appeared in a
   *  result summary — but the page was never opened. Most of this registry, because the
   *  environment's network policy 403s nearly every scholarly host at the gateway. */
  | "index"
  /** Reported from training data, not checked this session. Weakest admissible tier. */
  | "memory"
  /** Cited BECAUSE it is contested, failed replication, or is routinely misattributed.
   *  These are load-bearing in the opposite direction: the module's point IS the doubt. */
  | "disputed";

export interface Citation {
  id: string;
  who: string;
  year: string;
  work: string;
  /** Module ids that cite it. A test asserts the module text really mentions it. */
  usedIn: string[];
  /** What Rush uses it FOR — one line. The claim, not the topic. */
  claim: string;
  tier: CiteTier;
  /** Required for `disputed`; the honest caveat everywhere else. */
  note?: string;
}

export const CITATIONS: Citation[] = [
  // ── disputed: cited because the doubt is the lesson ────────────────────────────
  {
    id: "learning-styles",
    who: "Pashler, McDaniel, Rohrer, Bjork",
    year: "2008",
    work: "Psychological Science in the Public Interest 9(3)",
    usedIn: ["PEDAGOGY"],
    claim: "No adequate evidence base justifies matching instruction to a learner's stated style.",
    tier: "disputed",
    note: "The review specifies the crossover-interaction design a real effect would require; studies running it have not found the crossover. Cited so an author does not build a book on the belief.",
  },
  {
    id: "learning-pyramid",
    who: "Letrud, Hernes",
    year: "2018",
    work: "Cogent Education 5(1)",
    usedIn: ["PEDAGOGY"],
    claim: "The 'we remember 10% of what we read' retention percentages are not traceable to research.",
    tier: "disputed",
    note: "Dale's Cone of Experience contains no numbers. Asked for the source, NTL Institute replied it no longer has and cannot find the original research. The strongest kind of citation Rush can carry: a number with a documented absence of origin.",
  },
  {
    id: "power-pose",
    who: "Cuddy; Ranehill",
    year: "2010 / 2015",
    work: "Psychological Science",
    usedIn: ["EVIDENCE"],
    claim: "A widely-repeated finding that failed to replicate yet still circulates.",
    tier: "disputed",
    note: "Used as EVIDENCE's worked example of the replication check, not as a finding.",
  },
  {
    id: "zeigarnik",
    who: "Zeigarnik",
    year: "1927 / 2025",
    work: "—",
    usedIn: ["HOOK_CRAFT"],
    claim: "The interrupted-task memory effect did not survive meta-analytic replication.",
    tier: "disputed",
    note: "HOOK_CRAFT cites it as a correction: the cliffhanger advice that leans on Zeigarnik is leaning on something that failed. The craft move can still work; the mechanism story does not.",
  },
  {
    id: "chekhov-gun",
    who: "Chekhov; Gurlyand",
    year: "1889 / 1904",
    work: "letter to Lazarev / Teatr i iskusstvo memoir",
    usedIn: ["NIS_FORESHADOW", "IMMERSION", "NIS_THEME"],
    claim: "Do not put a loaded rifle on stage if no one means to fire it.",
    tier: "disputed",
    note: "The famous 'pistol in act one' phrasing is Gurlyand's memoir, not Chekhov. Rush cites the letter, which Chekhov actually wrote. Registered as disputed so the misattribution cannot creep back in.",
  },

  // ── index: title/authors/venue confirmed via search; page never opened ─────────
  {
    id: "booookscore",
    who: "Chang, Lo, Goyal & Iyyer",
    year: "2024",
    work: "ICLR 2024, arXiv:2310.00785",
    usedIn: ["RECAP"],
    claim: "Incremental updating scores lower on BooookScore (their coherence metric) but yields more detail than hierarchical merging.",
    tier: "index",
    note: "The load-bearing claim behind RECAP's two-part shape. Confirmed verbatim by an independent search; the paper itself could not be opened (gateway 403). One integer a subagent proposed — a count of error types — was dropped because it could not be confirmed the same way.",
  },
  {
    id: "chain-of-density",
    who: "Adams, Fabbri, Ladhak, Lehman & Elhadad",
    year: "2023",
    work: "arXiv:2309.04269",
    usedIn: ["RECAP"],
    claim: "Rewriting a summary repeatedly at FIXED length, fusing in missing salient entities each pass.",
    tier: "index",
  },
  {
    id: "maynez-faithfulness",
    who: "Maynez, Narayan, Bohnet & McDonald",
    year: "2020",
    work: "ACL 2020",
    usedIn: ["RECAP"],
    claim: "Abstractive summarization can generate content unsupported by the source.",
    tier: "index",
    note: "Why RECAP's ledger half is extractive and quarantined from the digest half.",
  },
  {
    id: "verbalized-sampling",
    who: "Zhang et al.",
    year: "2025",
    work: "arXiv:2510.01171",
    usedIn: ["BRAINSTORM"],
    claim: "Typicality bias collapses LLM output to the distribution mode; asking for options WITH verbalized probabilities and sampling the tails is a prompt-only mitigation.",
    tier: "index",
    note: "Rush prints BOTH reported figures because they disagree: the abstract reports 1.6-2.1x on creative-writing tasks while the project repo advertises 2-3x. Author-reported and unreplicated either way.",
  },
  {
    id: "testing-effect",
    who: "Roediger & Karpicke",
    year: "2006",
    work: "Psychological Science 17(3)",
    usedIn: ["PEDAGOGY"],
    claim: "Retrieval practice produces better long-term retention than restudying.",
    tier: "index",
    note: "One of the techniques that does hold up — foregrounded precisely because the same module debunks two that do not.",
  },
  {
    id: "interleaving",
    who: "Brunmair & Richter",
    year: "2019",
    work: "Psychological Bulletin 145(11)",
    usedIn: ["PEDAGOGY"],
    claim: "Interleaving helps overall, but the benefit is conditional by domain — and for word learning, blocking won.",
    tier: "index",
    note: "Carried WITH its conditionality. Flattening this into 'interleaving works' is the exact move this registry exists to prevent.",
  },
  {
    id: "worked-example",
    who: "Sweller & Cooper; Sweller",
    year: "1985 / 1988",
    work: "Cognitive Science 12(2)",
    usedIn: ["PEDAGOGY"],
    claim: "Studying worked examples can beat unaided problem solving for novices.",
    tier: "index",
  },
  {
    id: "theme-detection",
    who: "Kurtz & Schober",
    year: "2001",
    work: "Poetics",
    usedIn: ["NIS_THEME"],
    claim: "Readers' stated themes for the same short text diverge substantially.",
    tier: "index",
    note: "Small, and on microfictions. NIS_THEME says no novel-length study was found rather than extrapolating — which is why the module reports where a motif goes quiet and refuses to score resonance.",
  },
  {
    id: "fixation",
    who: "Jansson & Smith",
    year: "1991",
    work: "Design Studies",
    usedIn: ["BRAINSTORM"],
    claim: "Designers shown a flawed example reproduced its features even after the flaw was pointed out.",
    tier: "index",
    note: "BRAINSTORM's reason for quarantining the first list — the writer's and the model's.",
  },
  {
    id: "nominal-groups",
    who: "Diehl & Stroebe",
    year: "1987",
    work: "JPSP",
    usedIn: ["BRAINSTORM"],
    claim: "Individuals generating separately and pooling afterwards out-produce a group generating together.",
    tier: "index",
    note: "Transferred to one-writer-plus-one-model BY ANALOGY, not as a measured result. The module says so in its own output.",
  },
  {
    id: "flower-hayes",
    who: "Flower & Hayes",
    year: "1981",
    work: "College Composition and Communication",
    usedIn: ["BRAINSTORM"],
    claim: "Planning, translating and reviewing are recursive processes under a monitor.",
    tier: "index",
    note: "The frame for 'know-it / can't-write-it': translating jammed by reviewing running on top of it.",
  },
  {
    id: "incubation",
    who: "Sio & Ormerod",
    year: "2009",
    work: "Psychological Bulletin",
    usedIn: ["BRAINSTORM"],
    claim: "A real but modest average incubation benefit, larger after a low-demand break and after longer preparation.",
    tier: "index",
    note: "The effect size is deliberately NOT printed. It reached this project only through secondary sources, and the module states that refusal in its own text rather than quietly omitting it.",
  },

  // ── memory: reported from training, not checked this session ───────────────────
  {
    id: "eliot-correlative",
    who: "T. S. Eliot",
    year: "1919",
    work: "\"Hamlet and His Problems\"",
    usedIn: ["IMMERSION", "NIS_THEME"],
    claim: "The objective correlative: a set of objects or events that is the formula of a particular emotion.",
    tier: "memory",
    note: "Quoted at length in IMMERSION. A frequently-anthologised passage, but not opened this session — the quotation is the thing most worth re-checking against the essay.",
  },
  {
    id: "gardner-distance",
    who: "John Gardner",
    year: "1983",
    work: "The Art of Fiction",
    usedIn: ["IMMERSION"],
    claim: "The psychic-distance ladder: five rungs from long shot to inside the skull, and you slide rather than jump.",
    tier: "memory",
  },
  {
    id: "osborn",
    who: "Alex Osborn",
    year: "1953",
    work: "Applied Imagination",
    usedIn: ["BRAINSTORM"],
    claim: "Defer judgment; go for quantity.",
    tier: "memory",
  },
  {
    id: "oblique-strategies",
    who: "Brian Eno & Peter Schmidt",
    year: "1975",
    work: "Oblique Strategies",
    usedIn: ["BRAINSTORM"],
    claim: "An imposed arbitrary constraint as a generative mechanic.",
    tier: "memory",
    note: "BRAINSTORM instructs inventing constraints in that spirit and explicitly forbids quoting cards that cannot be sourced.",
  },
  {
    id: "tng-bible",
    who: "David Gerrold & Gene Roddenberry",
    year: "1987",
    work: "Star Trek: TNG Writers'/Directors' Guide",
    usedIn: ["RECAP"],
    claim: "A series bible is a standing document rather than a fresh memo per episode.",
    tier: "memory",
  },
];

const BY_ID = CITATIONS.reduce((m, c) => { m[c.id] = c; return m; }, {} as Record<string, Citation>);

/** Ordered weakest-checked first — the re-check queue, not a quality ranking. */
const TIER_ORDER: CiteTier[] = ["memory", "index", "primary", "disputed"];

export function citation(id: string): Citation | null {
  return BY_ID[id] ?? null;
}

/** Every citation a module carries. */
export function citationsFor(moduleId: string): Citation[] {
  return CITATIONS.filter((c) => c.usedIn.includes(moduleId));
}

/** Cited BECAUSE they are contested. Distinct from weak: these are doing deliberate work. */
export function disputed(): Citation[] {
  return CITATIONS.filter((c) => c.tier === "disputed");
}

/**
 * What to re-check first if the network policy ever allows opening primary sources.
 * `disputed` entries are excluded: their tier is a statement about the CLAIM, not about
 * how carefully it was checked, so putting them in a verification queue would be a
 * category error.
 */
export function recheckQueue(): Citation[] {
  return CITATIONS.filter((c) => c.tier === "memory" || c.tier === "index")
    .slice()
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

/** How much of the citation surface this registry actually covers.
 *
 *  `registered` is a fact. `totalYearMentions` is the count of year-bearing references in
 *  the module source, passed in by the caller that can see the file — it is deliberately
 *  NOT hardcoded here, because a stale hardcoded denominator would make coverage look
 *  better than it is as the modules grow. */
export function coverage(totalYearMentions: number): { registered: number; totalYearMentions: number; note: string } {
  return {
    registered: CITATIONS.length,
    totalYearMentions,
    note:
      "PARTIAL by construction. This registry holds the citations that have been audited, " +
      "not every reference the modules make. An unregistered citation is not thereby wrong — " +
      "it is unaudited, which is a different and honestly weaker claim.",
  };
}

export function formatCitationLedger(): string {
  const L: string[] = ["# ทะเบียนแหล่งอ้างอิง — ตรวจแค่ไหน ไม่ใช่ดีแค่ไหน", ""];
  L.push("ชั้นนี้บอกว่า **ตรวจสอบมาแรงแค่ไหน** ไม่ได้บอกว่างานนั้นดีหรือไม่ดี");
  L.push("");
  const labels: Record<CiteTier, string> = {
    disputed: "โต้แย้ง / ซ้ำไม่ได้ — อ้างเพราะความสงสัยคือบทเรียนเอง",
    primary: "เปิดต้นฉบับจริง",
    index: "ยืนยันผ่านดัชนีค้นหา — ไม่ได้เปิดหน้าเอกสาร",
    memory: "รายงานจากความจำ — ยังไม่ได้ตรวจรอบนี้",
  };
  for (const tier of ["disputed", "primary", "index", "memory"] as CiteTier[]) {
    const rows = CITATIONS.filter((c) => c.tier === tier);
    if (!rows.length) continue;
    L.push(`## ${labels[tier]} (${rows.length})`);
    L.push("");
    for (const c of rows) {
      L.push(`**${c.who} (${c.year})** — ${c.work}`);
      L.push(`  ใช้ใน: ${c.usedIn.join(", ")}`);
      L.push(`  อ้างเพื่อ: ${c.claim}`);
      if (c.note) L.push(`  หมายเหตุ: ${c.note}`);
      L.push("");
    }
  }
  return L.join("\n");
}
