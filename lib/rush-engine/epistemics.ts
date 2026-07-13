// ╔══════════════════════════════════════════════════════════════════╗
// ║  EPISTEMICS — the theory of knowledge Rush is built on.           ║
// ║  ญาณวิทยาของ Rush: every signal the engine emits is classified by  ║
// ║  WHAT KIND OF KNOWING it is, so nothing subjective ever wears the  ║
// ║  costume of a measurement.                                        ║
// ║                                                                    ║
// ║  Two lineages, one contract:                                      ║
// ║   • Buddhist pramāṇa — valid knowledge is direct perception       ║
// ║     (paccakkha/ประจักษ์) or inference (anumāna/อนุมาน); testimony   ║
// ║     that can't be checked is the weakest ground (Kālāma Sutta).    ║
// ║   • Western measurement theory — a concept IS its operation        ║
// ║     (Bridgman); a reproducible process is a reliable one           ║
// ║     (Goldman); a count is metrologically traceable (BIPM VIM).     ║
// ║                                                                    ║
// ║  A competitor's "momentum 73/100" is inference with no valid       ║
// ║  operation, non-reproducible run-to-run (LLM-as-judge研究) — it     ║
// ║  measures the judge, not the writing. Rush refuses to print it.    ║
// ║  Refusing is not a missing feature; it is the epistemology.        ║
// ║                                                                    ║
// ║  Honest about our own limits: Stevens' ban on averaging ordinal    ║
// ║  data and Popper's falsifiability-as-demarcation are influential   ║
// ║  STANCES, not settled math — see docs/epistemology.md.             ║
// ╚══════════════════════════════════════════════════════════════════╝

/** The four tiers of knowing, strongest → weakest → refused. Each Rush signal
 *  belongs to exactly one; the tier fixes what you may legitimately do with it. */
export type EpistemicTier = "paccakkha" | "anumana" | "sanna" | "avisaya";

/** Stevens' levels of measurement — which arithmetic a value legitimately admits.
 *  (Stevens' own doctrine; the ban on averaging ordinal data is contested.) */
export type MeasureLevel = "ratio" | "interval" | "ordinal" | "nominal" | "none";

export interface TierInfo {
  id: EpistemicTier;
  pali: string;      // canonical Pali (primary for a Thai product)
  thai: string;      // Thai script label
  en: string;        // plain-English name
  gloss: string;     // one line: what this kind of knowing is
  admissible: boolean; // may Rush present it as knowledge at all?
  warrant: string;   // WHY it may (or may not) be trusted — the justification
}

/** Ordered strongest → refused. */
export const TIERS: TierInfo[] = [
  {
    id: "paccakkha",
    pali: "paccakkha (pratyakṣa)",
    thai: "ประจักษ์ — นับตรง",
    en: "direct count",
    gloss: "รับรู้โดยตรง: นับจากตัวบทตรง ๆ ตรวจซ้ำได้เป๊ะทุกครั้ง",
    admissible: true,
    warrant:
      "Perception-grade. A deterministic tally: same text → same number, every run. " +
      "Reliable process (Goldman), self-defining operation (Bridgman), traceable to the " +
      "disclosed algorithm (BIPM). This is the gold standard — the count you re-derive yourself.",
  },
  {
    id: "anumana",
    pali: "anumāna",
    thai: "อนุมาน — คำนวณจากการนับ",
    en: "derived (disclosed formula)",
    gloss: "อนุมานที่ทำซ้ำได้: คำนวณจากการนับด้วยสูตรที่เปิดเผย — ไม่ใช่การเดา",
    admissible: true,
    warrant:
      "Inference, but reproducible and transparent: a ratio/interval computed from Tier-1 " +
      "counts via a formula printed in the open (e.g. CV = stdev÷mean of clause lengths). " +
      "Admissible ONLY because it is deterministic and the operation is disclosed. An LLM's " +
      "inference fails this bar — non-reproducible, operation hidden — so it does NOT qualify here.",
  },
  {
    id: "sanna",
    pali: "saññā",
    thai: "สัญญา — ป้ายชี้ให้ทบทวน",
    en: "heuristic flag (may be distorted)",
    gloss: "การติดป้ายเบื้องต้นที่อาจคลาดเคลื่อน (viparīta-saññā) — ขึ้นกับพจนานุกรม/การตัดคำ",
    admissible: true,
    warrant:
      "A tentative label, theory-laden (Hanson): it depends on the chosen lexicon and Thai " +
      "segmentation, so it can mis-fire. Presented as 'review this', never as a verdict. The " +
      "instrument is always disclosed so you can judge the label — saññā, not paññā.",
  },
  {
    id: "avisaya",
    pali: "avisaya",
    thai: "อวิสัย — เกินวิสัยของเครื่องนี้",
    en: "beyond this instrument — refused",
    gloss: "รู้ไม่ได้ด้วยการนับ: momentum/clarity/tension/'ดีไหม' — เป็นการตีความของนักเขียน/LLM",
    admissible: false,
    warrant:
      "A latent construct with no valid operation. Scoring it would reify an abstraction " +
      "(Whitehead), commit the McNamara fallacy (an arbitrary number on the unmeasurable), " +
      "and — per LLM-as-judge studies — yield a figure that changes run-to-run from ordering " +
      "and temperature: a measurement of the judge, not the text. Rush refuses to print it.",
  },
];

const TIER_BY_ID: Record<EpistemicTier, TierInfo> = TIERS.reduce(
  (m, t) => { m[t.id] = t; return m; },
  {} as Record<EpistemicTier, TierInfo>
);

export interface SignalClass {
  id: string;          // canonical signal id
  tier: EpistemicTier;
  level: MeasureLevel; // Stevens level → which arithmetic is legitimate
  instrument: string;  // provenance: what produced it (disclose the frame — Hanson)
  reproducible: boolean;
  thai: string;        // human label
}

/** The registry: every signal Rush surfaces, tagged with its epistemic status. Edit a
 *  row here and the badges/warrants update everywhere. Ordered by tier. */
export const SIGNAL_REGISTRY: SignalClass[] = [
  // ── Tier 1 · ประจักษ์ — direct counts (ratio scale, true zero) ──────────────
  { id: "wordCount", tier: "paccakkha", level: "ratio", instrument: "Thai segmenter (newmm-class) / whitespace tokenizer", reproducible: true, thai: "จำนวนคำ" },
  { id: "uniqueWords", tier: "paccakkha", level: "ratio", instrument: "token set", reproducible: true, thai: "คำไม่ซ้ำ" },
  { id: "charCount", tier: "paccakkha", level: "ratio", instrument: "code-point count", reproducible: true, thai: "จำนวนอักษร" },
  { id: "sentenceCount", tier: "paccakkha", level: "ratio", instrument: "clause splitter (punctuation + space)", reproducible: true, thai: "จำนวนอนุประโยค" },
  { id: "dialogueLines", tier: "paccakkha", level: "ratio", instrument: "quote-mark scan", reproducible: true, thai: "บรรทัดบทพูด" },
  { id: "echoes", tier: "paccakkha", level: "ratio", instrument: "content-word frequency ≥3", reproducible: true, thai: "คำซ้ำบ่อย" },
  { id: "aiTells", tier: "paccakkha", level: "ratio", instrument: "fixed cliché lexicon (Aho-Corasick)", reproducible: true, thai: "คลิเช AI (จับคู่รายการ)" },
  { id: "tellingCount", tier: "paccakkha", level: "ratio", instrument: "fixed filter-verb / named-emotion lexicon", reproducible: true, thai: "คำบอกอารมณ์ (นับ)" },
  { id: "sensoryCount", tier: "paccakkha", level: "ratio", instrument: "per-sense word lists", reproducible: true, thai: "คำผัสสะ (นับ)" },
  { id: "renameHits", tier: "paccakkha", level: "ratio", instrument: "literal/word-boundary match count", reproducible: true, thai: "จุดที่เปลี่ยนชื่อ" },
  { id: "charMentions", tier: "paccakkha", level: "ratio", instrument: "name occurrence count per chapter", reproducible: true, thai: "การเอ่ยถึงตัวละคร" },
  { id: "coEdgeWeight", tier: "paccakkha", level: "ratio", instrument: "shared-chapter count", reproducible: true, thai: "น้ำหนักการแชร์ฉาก" },

  // ── Tier 2 · อนุมาน — derived from counts via a disclosed formula ───────────
  { id: "rhythmCv", tier: "anumana", level: "ratio", instrument: "stdev ÷ mean of clause lengths", reproducible: true, thai: "จังหวะ (CV)" },
  { id: "rhythmStdev", tier: "anumana", level: "ratio", instrument: "stdev of clause lengths", reproducible: true, thai: "ส่วนเบี่ยงเบนความยาว" },
  { id: "avgWords", tier: "anumana", level: "ratio", instrument: "words ÷ clauses", reproducible: true, thai: "คำ/ประโยค (เฉลี่ย)" },
  { id: "dialogueRatio", tier: "anumana", level: "ratio", instrument: "dialogue words ÷ total words", reproducible: true, thai: "สัดส่วนบทพูด" },
  { id: "tellingPer100", tier: "anumana", level: "ratio", instrument: "telling count ÷ words × 100", reproducible: true, thai: "บอกอารมณ์ /100 คำ" },
  { id: "sensoryPer1k", tier: "anumana", level: "ratio", instrument: "sensory count ÷ words × 1000", reproducible: true, thai: "ผัสสะ /1k คำ" },
  { id: "expansionRatio", tier: "anumana", level: "ratio", instrument: "target chars ÷ source chars, vs. median", reproducible: true, thai: "อัตราส่วนความยาวคำแปล" },

  // ── Tier 3 · สัญญา — heuristic labels; theory-laden, disclosed, "review" ────
  { id: "variantClusters", tier: "sanna", level: "nominal", instrument: "SymSpell edit-distance / Thai skeleton grouping", reproducible: true, thai: "กลุ่มสะกดใกล้กัน" },
  { id: "droppedTerms", tier: "sanna", level: "ordinal", instrument: "introduced-then-absent heuristic", reproducible: true, thai: "โผล่แล้วหาย" },
  { id: "storyBibleEntries", tier: "sanna", level: "ordinal", instrument: "recurring-token extractor", reproducible: true, thai: "รายการคลังเนื้อเรื่อง" },
  { id: "offCanon", tier: "sanna", level: "nominal", instrument: "recurring token ∉ declared canon", reproducible: true, thai: "ชื่อนอก canon" },
  { id: "registerSuggestions", tier: "sanna", level: "nominal", instrument: "loanword→standard seed map", reproducible: true, thai: "คำ/การสะกดมาตรฐาน" },
  { id: "nameSuggestions", tier: "sanna", level: "nominal", instrument: "capitalisation / recurrence heuristic", reproducible: true, thai: "น่าจะเป็นชื่อ" },
  { id: "translationTerms", tier: "sanna", level: "nominal", instrument: "term-map presence/case check", reproducible: true, thai: "ศัพท์เฉพาะในคำแปล" },
];

const SIGNAL_BY_ID: Record<string, SignalClass> = SIGNAL_REGISTRY.reduce(
  (m, s) => { m[s.id] = s; return m; },
  {} as Record<string, SignalClass>
);

/** Constructs Rush deliberately REFUSES to score — with the named fallacy each would
 *  commit. This is the boundary the competition crosses and Rush does not. */
export interface RefusedConstruct { id: string; thai: string; why: string }
export const REFUSED_CONSTRUCTS: RefusedConstruct[] = [
  { id: "momentum", thai: "โมเมนตัม (0–100)", why: "latent construct, no valid operation — reification (Whitehead); LLM score shifts run-to-run" },
  { id: "clarity", thai: "ความกระจ่าง (0–100)", why: "no construct-validity chain; a number borrowing measurement's authority (Porter)" },
  { id: "tension", thai: "ความตึงเครียด (0–100)", why: "McNamara fallacy — an arbitrary value on the unmeasurable" },
  { id: "flowScore", thai: "คะแนนลื่นไหล (0–100)", why: "proxy/surrogate for merit with no validation — optimizing it corrupts the writing (Goodhart)" },
  { id: "overallQuality", thai: "คะแนนคุณภาพรวม", why: "averaging non-count judgments — a category error (Stevens' stance); map ≠ territory (Korzybski)" },
  { id: "isAiWritten", thai: "แต่งโดย AI หรือไม่ (คะแนน)", why: "an inference sold as detection; not reproducible, not a measurement" },
];

/** The ten Kālāma grounds (AN 3.65) — reasons NOT to accept a claim by themselves. Marked:
 *  which grounds an LLM 'quality score' asks you to rely on. NOT blanket skepticism — the
 *  sutta forbids accepting these IN PLACE OF first-hand verification, not reasoning itself. */
export interface KalamaGround { n: number; pali: string; thai: string; llmLeansOn: boolean }
export const KALAMA_GROUNDS: KalamaGround[] = [
  { n: 1, pali: "mā anussavena", thai: "เพราะฟังตาม ๆ กันมา", llmLeansOn: true },
  { n: 2, pali: "mā paramparāya", thai: "เพราะทำสืบ ๆ กันมา", llmLeansOn: false },
  { n: 3, pali: "mā itikirāya", thai: "เพราะเล่าลือ", llmLeansOn: true },
  { n: 4, pali: "mā piṭakasampadānena", thai: "เพราะอ้างตำรา", llmLeansOn: false },
  { n: 5, pali: "mā takkahetu", thai: "เพราะตรรกล้วน ๆ", llmLeansOn: true },
  { n: 6, pali: "mā nayahetu", thai: "เพราะการอนุมาน", llmLeansOn: true },
  { n: 7, pali: "mā ākāraparivitakkena", thai: "เพราะตรึกตามอาการที่ปรากฏ", llmLeansOn: true },
  { n: 8, pali: "mā diṭṭhinijjhānakkhantiyā", thai: "เพราะเข้ากับทฤษฎีที่ชอบอยู่แล้ว", llmLeansOn: false },
  { n: 9, pali: "mā bhabbarūpatāya", thai: "เพราะผู้พูดดูน่าเชื่อถือ", llmLeansOn: true },
  { n: 10, pali: "mā samaṇo no garū ti", thai: "เพราะนับถือว่าเป็นครูของเรา", llmLeansOn: false },
];

/** The banner the whole layer serves: ยถาภูต — see it as it actually is. */
export const YATHABHUTA = "ยถาภูต — เห็นตามที่มันเป็นจริง (report the state as it is; counts, not a verdict)";

/** Classify a signal. Returns null for an unknown id (fail loud, don't guess a tier). */
export function classifySignal(id: string): SignalClass | null {
  return SIGNAL_BY_ID[id] ?? null;
}

export function tierInfo(tier: EpistemicTier): TierInfo {
  return TIER_BY_ID[tier];
}

/** Is this signal something Rush may present AS knowledge? True for Tier 1–3 (all
 *  reproducible), false for anything refused or unknown. */
export function isAdmissible(id: string): boolean {
  const s = SIGNAL_BY_ID[id];
  return !!s && TIER_BY_ID[s.tier].admissible && s.reproducible;
}

/** Would scoring this construct cross the boundary? True if it's on the refused list. */
export function isRefused(constructId: string): boolean {
  return REFUSED_CONSTRUCTS.some((c) => c.id === constructId);
}

/** The full warrant for a signal: its tier's justification + its own instrument and the
 *  honest reminder that the instrument (lexicon/segmentation) is a disclosed choice. */
export function warrant(id: string): string | null {
  const s = SIGNAL_BY_ID[id];
  if (!s) return null;
  const t = TIER_BY_ID[s.tier];
  const frame = s.reproducible ? "re-derivable" : "not reproducible";
  return `${t.thai} · ${t.warrant} เครื่องมือ: ${s.instrument} (${frame}; ${t.pali}).`;
}

/** Group a set of signal ids by tier — for a UI that badges a readout. Unknown ids are
 *  dropped (with the count returned so a caller can surface "n unclassified"). */
export function groupByTier(ids: string[]): { tier: TierInfo; signals: SignalClass[] }[] {
  const order: EpistemicTier[] = ["paccakkha", "anumana", "sanna", "avisaya"];
  const out = order.map((t) => ({ tier: TIER_BY_ID[t], signals: [] as SignalClass[] }));
  for (const id of ids) {
    const s = SIGNAL_BY_ID[id];
    if (!s) continue;
    const bucket = out.find((o) => o.tier.id === s.tier);
    if (bucket) bucket.signals.push(s);
  }
  return out.filter((o) => o.signals.length > 0);
}

/** How many Kālāma grounds an LLM 'quality score' actually leans on — the count is the
 *  headline (the Buddha named the LLM's failure modes; #6 อนุมาน and #9 ดูน่าเชื่อถือ). */
export function llmKalamaViolations(): KalamaGround[] {
  return KALAMA_GROUNDS.filter((g) => g.llmLeansOn);
}
