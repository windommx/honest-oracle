// ╔══════════════════════════════════════════════════════════════════╗
// ║  COMPETITIVE INTELLIGENCE — a deterministic model of the field.   ║
// ║  Not scraping, not fake metrics: a maintained matrix of DECLARED   ║
// ║  facts (each rival carries a source + as-of date) plus pure        ║
// ║  functions that DERIVE insight — sole advantages, real gaps,       ║
// ║  per-rival pressure, staleness. Edit a fact → insight recomputes.  ║
// ║                                                                    ║
// ║  Honesty is built in, not bolted on:                              ║
// ║   • no composite 0–100 score (that would be a fake metric);        ║
// ║   • Bookisdom's deliberate non-goals are TAGGED and excluded from gaps; ║
// ║   • the capability set is Bookisdom-biased by construction — SELECTION_ ║
// ║     BIAS_NOTE says so, and soft dimensions (UX maturity, community)║
// ║     are included precisely to counter that bias;                   ║
// ║   • tallies are feature COUNTS, never weighted "quality".          ║
// ╚══════════════════════════════════════════════════════════════════╝

export type Mark = "yes" | "partial" | "no" | "unknown";

export interface Rival {
  id: string;
  name: string;
  kind: string;
  pricing: string;
  asOf: string; // YYYY-MM the facts were last checked
  source: string; // where the facts came from (honest provenance)
}

export interface Capability {
  id: string;
  label: string;
  moat?: boolean; // part of Bookisdom's thesis (Thai-native / deterministic / honesty / ownership)
  soft?: boolean; // qualitative dimension added to COUNTER Bookisdom-favoring selection bias
}

// Rivals in a fixed column order. "bookisdom" is included so the model is symmetric.
export const RIVALS: Rival[] = [
  { id: "bookisdom", name: "Bookisdom", kind: "prompt platform", pricing: "free / self-host", asOf: "2026-07", source: "codebase" },
  { id: "novelcrafter", name: "NovelCrafter", kind: "web app (BYO-AI)", pricing: "$4-20/mo + BYO-AI", asOf: "2026-08", source: "official-doc + review snippets (proxy blocked full fetch)" },
  { id: "sudowrite", name: "Sudowrite", kind: "hosted AI writer", pricing: "$19-59/mo + credits", asOf: "2026-08", source: "official-doc + review snippets (proxy blocked full fetch)" },
  { id: "novelai", name: "NovelAI", kind: "hosted AI writer", pricing: "$10-25/mo", asOf: "2026-08", source: "official-doc + review snippets (proxy blocked full fetch)" },
  { id: "bookyai", name: "BookyAI", kind: "KDP desktop pipeline", pricing: "one-time", asOf: "2026-06", source: "user-supplied spec" },
  { id: "ai_novel_ws", name: "AI Novel Workspace", kind: "workshop + app (TH)", pricing: "฿7,900 course", asOf: "2026-07", source: "user-supplied images" },
  { id: "squibler", name: "Squibler", kind: "writing app + AI", pricing: "free / $16-49/mo + credits", asOf: "2026-08", source: "review snippets, official page unreachable" },
  { id: "fictionary", name: "Fictionary", kind: "structural story editor", pricing: "$14-49/mo", asOf: "2026-08", source: "official-page snippets" },
  { id: "prowritingaid", name: "ProWritingAid", kind: "prose QA", pricing: "$120-144/yr / lifetime $399+", asOf: "2026-08", source: "official-help + review snippets" },
  { id: "raw_llm", name: "Raw ChatGPT / Claude", kind: "general chatbot", pricing: "sub / API", asOf: "2026-07", source: "general knowledge" },
  // SuperCool: marks come from vendor marketing cross-checked against user reviews
  // (2026-07). Reviews confirm: full-book generation from ~2 prompts works; hidden
  // credit costs on top of the subscription; drift/inconsistency on long books
  // (hence consistency_auto = no); "#1 Bestseller" badges are niche-category flags.
  { id: "supercool", name: "SuperCool (Famous Labs)", kind: "AI publishing funnel", pricing: "sub + credits", asOf: "2026-07", source: "vendor marketing + user reviews" },
  // Batch A (2026-08): the incumbent writing apps + planners. Every first-party page
  // was proxy-blocked, so marks rest on multi-source snippets incl. official docs/blogs.
  // Notable: Scrivener ships real deterministic text stats (word frequency, linguistic
  // focus) with zero AI; Plottr and Dabble publicly REFUSE generative AI.
  { id: "scrivener", name: "Scrivener", kind: "desktop writing studio", pricing: "$59.99 one-time", asOf: "2026-08", source: "official blog/forum + review snippets" },
  { id: "atticus", name: "Atticus", kind: "formatting + KDP pipeline", pricing: "$147 one-time", asOf: "2026-08", source: "official updates + review snippets" },
  { id: "plottr", name: "Plottr", kind: "visual plotting/series bible", pricing: "$60-129/yr or $150-649 lifetime", asOf: "2026-08", source: "official posts + review snippets" },
  { id: "dabble", name: "Dabble", kind: "writing app (no AI)", pricing: "$9-29/mo or $699 lifetime", asOf: "2026-08", source: "official pages + review snippets" },
  { id: "livingwriter", name: "LivingWriter", kind: "writing app + bundled AI", pricing: "$14.99/mo, $144/yr, $699 lifetime", asOf: "2026-08", source: "official guides/changelog + reviews" },
  // Batch B (2026-08): the prose-analysis and worldbuilding specialists — the tools
  // that contest Bookisdom's measured-signal claim most directly. Hemingway's core is pure
  // formula (ARI + adverb/passive rules); AutoCrit ships a large deterministic report
  // set AND an LLM layer incl. a real cross-book Series Analyzer; Marlowe is trained-
  // model but explicitly non-generative; World Anvil ships no AI at all.
  { id: "autocrit", name: "AutoCrit", kind: "fiction analysis + AI suite", pricing: "free / $180-360/yr / $399 lifetime", asOf: "2026-08", source: "official help-center + review snippets" },
  { id: "marlowe", name: "Marlowe (Authors A.I.)", kind: "manuscript report service", pricing: "$29.95/report · $19.95/mo · $159/yr", asOf: "2026-08", source: "official pages + review snippets" },
  { id: "grammarly", name: "Grammarly (Superhuman)", kind: "general writing assistant", pricing: "free / $12-30/mo", asOf: "2026-08", source: "official language list + trade press" },
  { id: "hemingway", name: "Hemingway Editor", kind: "readability editor", pricing: "free / $19.99 desktop / $100-150/yr Plus", asOf: "2026-08", source: "official docs + review snippets" },
  { id: "worldanvil", name: "World Anvil", kind: "worldbuilding wiki + manuscripts", pricing: "free / $4.50-12/mo / Sage $300/yr", asOf: "2026-08", source: "official KB/blog + review snippets" },
];

const RID = RIVALS.map((r) => r.id);

// Capabilities that Bookisdom deliberately does NOT do fully — excluded from "gaps to close".
export const INTENTIONAL_NONGOALS: Record<string, string> = {
  ai_inline: "generation is BYO-key via Bookisdom Studio — server-side ghost-writing breaks no-server-LLM + privacy",
  bsr: "market/BSR demand scores are unmeasurable → a fake metric the platform forbids",
};

// The matrix. Each row lists marks aligned to RIVALS order (y=yes p=partial n=no u=unknown).
// moat = Bookisdom's thesis; soft = qualitative dimension added to counter selection bias.
interface Row extends Capability { marks: string }
const ROWS: Row[] = [
  //                                                            bookisdom nc  su  nai boo aiw squ fic pwa raw sc  scr att plo dab lw  aut mar gra hem wan
  { id: "thai_native", label: "Thai-native prompts", moat: true, marks: "y  p  n  n  n  y  n  n  n  p  n  n  u  u  u  u  n  n  n  n  n" },
  { id: "thai_dialect", label: "Thai dialect voices (Isan/N/S)", moat: true, marks: "y  n  n  n  n  n  n  n  n  n  n  n  n  n  n  n  n  n  n  n  n" },
  { id: "deterministic", label: "Deterministic analysis (no LLM)", moat: true, marks: "y  p  n  n  p  n  n  p  y  n  n  y  n  n  p  p  y  p  p  y  n" },
  // AutoCrit keeps its "yes" — it ships a Series Analyzer aimed squarely at this — but
  // the 2026-08 deep dive found the two tools are architecturally opposite, and the
  // matrix counts features, not architecture, so the difference belongs here in prose:
  //   AutoCrit EXTRACTS. No story bible exists for its analyzer to obey (its one
  //   user-declared list, Manage Character Names, feeds a sentence-variety report, not
  //   the consistency check). Output is LLM prose commentary per chapter, chunked at
  //   200-10,000 words, generative in the consistency path — so non-deterministic by
  //   construction; it ships version History for critiques, which is only needed when
  //   reruns differ. A working book editor's real-manuscript test (Ground Crew, 2026)
  //   reports it inventing scenes and missing a character who cannot speak. Timeline
  //   output is a summary, not an adjudication of contradictions.
  //   Bookisdom DECLARES. codexAudit takes an author-written canon and reports countable
  //   facts against it: present / spelling variants (Thai mark-aware) / missing /
  //   status conflicts / forbidden-word hits / threads with no trace, with matched-out-
  //   of-total counts. Pure function: same input, byte-identical output.
  //   Neither is "better" by feature count. They answer different questions.
  { id: "consistency_auto", label: "Auto cross-chapter consistency", moat: true, marks: "y  n  n  n  n  n  n  p  n  n  n  n  n  n  n  p  y  n  n  n  n" },
  { id: "sensory_density", label: "Measured sensory density", moat: true, marks: "y  n  n  n  n  n  n  n  p  n  n  n  n  n  n  n  n  n  n  n  n" },
  { id: "story_bible", label: "Story bible / codex", marks: "y  y  y  y  u  p  y  p  n  n  u  p  n  y  y  y  p  n  n  n  y" },
  { id: "genre_promise", label: "Genre reader-promise guidance", marks: "y  n  p  n  n  y  p  p  n  p  u  n  n  y  p  p  p  p  n  n  p" },
  { id: "starter_flow", label: "Guided starter flow", marks: "y  p  p  n  p  y  p  n  n  n  y  p  p  y  y  y  y  n  n  n  y" },
  // Plottr and Dabble genuinely earn this: one shared entity record per project file,
  // so editing a character in book 3 updates book 1 (Plottr's known limitation is the
  // flip side — you CANNOT vary an attribute per book). What the 2026-08 deep dive
  // established as a clean negative for both: neither validates draft prose against
  // the bible. Plottr structurally cannot — it holds no manuscript. Dabble holds the
  // prose and the notes in one project and still ships no checker; auto-linking names
  // in prose to notes is an open feature request from 2018. Both bibles are references
  // a human reads. World Anvil is the same shape at larger scale.
  { id: "saga", label: "Multi-season / saga planning", moat: true, marks: "y  p  p  n  n  n  n  n  n  n  n  p  p  y  y  u  y  n  n  n  y" },
  { id: "ai_inline", label: "Inline AI generation (one-click)", marks: "p  y  y  y  y  y  y  n  p  y  y  n  n  n  n  y  y  n  y  y  n" },
  { id: "byo_key", label: "BYO API key / no lock-in", moat: true, marks: "y  y  n  n  u  n  n  n  n  y  n  n  n  n  n  n  n  n  n  n  n" },
  // 2026-08 self-correction, found by auditing our own Studio route: the analyzer and
  // prompt generation are 100% local (browser worker over IndexedDB), but Bookisdom Studio
  // RELAYS the manuscript through our server to the provider using the user's own key.
  // Scrivener's claim is strictly stronger — "Scrivener does not do anything with your
  // text in the background that would cause it to be sent anywhere from your machine to
  // any other server" — so Bookisdom drops to partial. Plottr also drops: Pro is
  // cloud-authoritative (you cannot even open a file offline) and its AI features send
  // story data to Plottr's servers and OpenAI, so only the classic offline tier is local.
  { id: "privacy", label: "No server LLM cost / privacy", moat: true, marks: "p  p  n  n  p  n  n  n  p  n  n  y  p  p  p  n  n  p  n  p  p" },
  { id: "epub", label: "EPUB export", marks: "y  n  n  n  y  n  y  n  n  n  u  y  y  n  n  y  y  n  n  n  n" },
  { id: "kdp", label: "KDP publishing (spine/metadata)", marks: "p  n  n  n  y  n  n  n  n  n  p  p  y  n  n  p  p  n  n  n  n" },
  { id: "bsr", label: "Market / BSR research", marks: "n  n  n  n  y  n  n  n  n  n  u  n  n  n  n  n  p  n  n  n  n" },
  { id: "prose_qa", label: "Prose QA (readability/AI-slop)", marks: "y  n  p  n  n  n  n  p  y  n  p  p  n  n  p  p  y  y  y  y  n" },
  // ── soft dimensions, added to counter the Bookisdom-favouring selection above ──
  { id: "mature_ux", label: "Mature, polished web app", soft: true, marks: "p  y  y  y  p  p  y  y  y  y  y  y  y  y  p  p  p  p  y  y  p" },
  { id: "community", label: "Active user community", soft: true, marks: "n  y  y  y  u  p  p  p  y  y  y  y  y  y  y  u  y  p  p  n  y" },
];

const MARK: Record<string, Record<string, Mark>> = {};
const CODE: Record<string, Mark> = { y: "yes", p: "partial", n: "no", u: "unknown" };
for (const row of ROWS) {
  const cells = row.marks.trim().split(/\s+/);
  MARK[row.id] = {};
  RID.forEach((rid, i) => (MARK[row.id][rid] = CODE[cells[i]] ?? "unknown"));
}

export const CAPABILITIES: Capability[] = ROWS.map(({ id, label, moat, soft }) => ({ id, label, moat, soft }));

export function mark(capId: string, rivalId: string): Mark {
  return MARK[capId]?.[rivalId] ?? "unknown";
}
const has = (m: Mark) => m === "yes"; // "has the feature" = full yes (partial is weak-has)
const isIntentional = (capId: string) => capId in INTENTIONAL_NONGOALS;

/** Capabilities where Bookisdom is the ONLY full provider — the hardest-to-copy moat. */
export function soleProviders(): Capability[] {
  return CAPABILITIES.filter(
    (c) => has(mark(c.id, "bookisdom")) && RID.every((r) => r === "bookisdom" || !has(mark(c.id, r)))
  );
}

export interface Gap { cap: Capability; rivalsWithIt: string[]; tableStakes: number }
/** Real gaps: capabilities Bookisdom lacks (not full) that ≥1 rival HAS, excluding deliberate
 *  non-goals. Sorted by how many rivals have it — the more common, the more table-stakes. */
export function realGaps(): Gap[] {
  return CAPABILITIES.filter((c) => !isIntentional(c.id) && !has(mark(c.id, "bookisdom")))
    .map((c) => {
      const rivalsWithIt = RID.filter((r) => r !== "bookisdom" && has(mark(c.id, r)));
      return { cap: c, rivalsWithIt, tableStakes: rivalsWithIt.length };
    })
    .filter((g) => g.tableStakes > 0)
    .sort((a, b) => b.tableStakes - a.tableStakes || a.cap.id.localeCompare(b.cap.id, "en"));
}

/** Deliberate non-goals, surfaced transparently (they are NOT counted as gaps). */
export function intentionalNonGoals(): { cap: Capability; why: string }[] {
  return CAPABILITIES.filter((c) => isIntentional(c.id)).map((c) => ({ cap: c, why: INTENTIONAL_NONGOALS[c.id] }));
}

export interface HeadToHead {
  rivalId: string;
  bookisdomOnly: string[]; // Bookisdom yes, rival not
  rivalOnly: string[]; // rival yes, Bookisdom not (and not intentional) — real pressure
  rivalOnlyIntentional: string[]; // rival yes, Bookisdom deliberately abstains
  both: string[];
}
export function headToHead(rivalId: string): HeadToHead {
  const h: HeadToHead = { rivalId, bookisdomOnly: [], rivalOnly: [], rivalOnlyIntentional: [], both: [] };
  for (const c of CAPABILITIES) {
    const r = has(mark(c.id, "bookisdom"));
    const v = has(mark(c.id, rivalId));
    if (r && v) h.both.push(c.id);
    else if (r && !v) h.bookisdomOnly.push(c.id);
    else if (!r && v) (isIntentional(c.id) ? h.rivalOnlyIntentional : h.rivalOnly).push(c.id);
  }
  return h;
}

/** Rank rivals by how many REAL (non-intentional) gaps they expose — competitive pressure
 *  as a feature count, NOT a market-threat score. */
export function pressureRanking(): { rival: Rival; pressure: number; exposes: string[] }[] {
  return RIVALS.filter((r) => r.id !== "bookisdom")
    .map((r) => {
      const h = headToHead(r.id);
      return { rival: r, pressure: h.rivalOnly.length, exposes: h.rivalOnly };
    })
    .sort((a, b) => b.pressure - a.pressure || a.rival.name.localeCompare(b.rival.name, "en"));
}

/** Rivals whose facts are older than `months` before `nowYYYYMM` — recheck before trusting. */
export function staleFacts(nowYYYYMM: string, months = 6): Rival[] {
  const toMonths = (s: string) => { const [y, m] = s.split("-").map(Number); return y * 12 + (m - 1); };
  const now = toMonths(nowYYYYMM);
  return RIVALS.filter((r) => r.id !== "bookisdom" && now - toMonths(r.asOf) > months);
}

export const SELECTION_BIAS_NOTE =
  "อคติที่ต้องรู้: ชุด capability นี้เอียงเข้าข้าง Bookisdom โดยธรรมชาติ (ส่วนใหญ่คือจุดแข็งของ Bookisdom เอง) " +
  "จึงเพิ่มมิติเชิงคุณภาพ (mature_ux, community) เพื่อถ่วง และ tally ทั้งหมดเป็น 'จำนวนฟีเจอร์' ไม่ใช่คะแนนคุณภาพถ่วงน้ำหนัก " +
  "ข้อมูลคู่แข่งมาจากความรู้ทั่วไป/สเปกผู้ใช้ (ดู asOf + source ต่อเจ้า) อาจล้าสมัย โปรดตรวจซ้ำก่อนตัดสินใจ";

const labelOf = (id: string) => CAPABILITIES.find((c) => c.id === id)?.label ?? id;

/** Paste-ready Markdown intel brief, computed from the matrix. */
export function formatIntelBrief(nowYYYYMM: string): string {
  const L: string[] = [];
  L.push("# Competitive Intelligence Brief — Bookisdom");
  L.push(`_computed ${nowYYYYMM} · ${RIVALS.length - 1} rivals · deterministic · no composite score_`, "");
  L.push("## Sole advantages (Bookisdom is the only full provider)");
  for (const c of soleProviders()) L.push(`- **${c.label}** — ไม่มีคู่แข่งเจ้าไหนทำเต็ม`);
  L.push("", "## Real gaps to close (rivals have it, Bookisdom doesn't — table-stakes first)");
  const gaps = realGaps();
  if (!gaps.length) L.push("- (none among declared, non-intentional capabilities)");
  for (const g of gaps) L.push(`- **${g.cap.label}** — ${g.tableStakes}/${RIVALS.length - 1} rivals: ${g.rivalsWithIt.join(", ")}`);
  L.push("", "## Deliberate non-goals (NOT gaps — by principle)");
  for (const n of intentionalNonGoals()) L.push(`- **${n.cap.label}** — ${n.why}`);
  L.push("", "## Pressure ranking (real gaps each rival exposes)");
  for (const p of pressureRanking()) {
    L.push(`- **${p.rival.name}** — pressure ${p.pressure}${p.exposes.length ? " (" + p.exposes.map(labelOf).join(", ") + ")" : ""}`);
  }
  const stale = staleFacts(nowYYYYMM);
  if (stale.length) {
    L.push("", "## ⚠ Stale facts (recheck)");
    for (const r of stale) L.push(`- ${r.name} — as-of ${r.asOf} · ${r.source}`);
  }
  L.push("", "---", "> " + SELECTION_BIAS_NOTE);
  return L.join("\n");
}
