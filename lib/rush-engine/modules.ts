import { BOOK_TYPES, isFictionType } from "./book-types";
import type { BookConfig, BookTypeKey, GeneratedPrompt, PromptGroup } from "./types";

export const MODULE_GROUPS: { key: Exclude<PromptGroup, "core">; label: string; desc: string }[] = [
  { key: "craft", label: "Fiction Craft", desc: "Structure outline, character voice/arc, worldbuilding codex, scenes, dialogue" },
  { key: "nonfiction", label: "Nonfiction Credibility", desc: "Fact-check, argument map, evidence audit, pedagogy, case studies" },
  { key: "prose", label: "Prose Polish", desc: "Voice fingerprint, anti-AI-slop, readability, line edit" },
  { key: "thai", label: "Thai Language", desc: "Register/ราชาศัพท์, sentence flow, transliteration consistency" },
  { key: "marketing", label: "Publishing & Marketing", desc: "Title, blurb, KDP metadata, agent submission pack" },
  { key: "advanced", label: "Advanced Pipeline", desc: "Rolling recap (chain-of-density), brainstorm (verbalized sampling)" },
];

/** Default module groups suggested for a given book type. */
export function defaultGroupsFor(type: BookTypeKey): Exclude<PromptGroup, "core">[] {
  const fiction = type === "novel" || type === "memoir" || type === "kids" || type === "poetry";
  const groups: Exclude<PromptGroup, "core">[] = ["prose", "marketing"];
  if (fiction) groups.unshift("craft");
  else groups.unshift("nonfiction");
  return groups;
}


// ── CRAFT modules ──────────────────────────────────────────────

function moduleStructureOutline(config: BookConfig): string {
  let p = `You are a story architect. Produce a complete chapter-by-chapter OUTLINE for "${config.title}" before any prose is written.\n\n`;
  p += `Premise: ${config.thesis}\nGenre: ${config.subGenre.replace(/_/g, " ")}\nChapters: ${config.chapters} · ~${config.wordsPerChapter} words each · ${config.language}\n\n`;
  p += `═══ CHOOSE A STRUCTURE (pick the best fit, or let the user specify) ═══\n`;
  p += `• Save the Cat! — 15 beats (Opening Image → Catalyst → Midpoint → All Is Lost → Finale)\n`;
  p += `• Hero's Journey — 12 stages (Call → Mentor → Ordeal → Return with Elixir)\n`;
  p += `• Story Circle — 8 steps (You / Need / Go / Search / Find / Take / Return / Change)\n`;
  p += `• Kishōtenketsu — 4 acts, conflict-optional, built on a recontextualizing twist (great for literary, slice-of-life, kids)\n`;
  p += `• Seven-Point — built backward from the ending (Hook, Plot Turns, Pinch Points, Midpoint, Resolution)\n\n`;
  p += `═══ OUTPUT ═══\n`;
  p += `1. State the chosen structure and why it fits this premise.\n`;
  p += `2. Map every beat to a chapter number (1-${config.chapters}) with a 1-2 sentence purpose.\n`;
  p += `3. Mark the inciting incident, midpoint, and climax chapters.\n`;
  p += `4. For each chapter: a one-line "promise" (what the reader gets) and a hook for the chapter end.\n`;
  return p;
}

function moduleCharacterVoice(config: BookConfig): string {
  return `Create a CHARACTER VOICE SHEET so every character sounds distinct (LLMs tend to make everyone sound the same).

For EACH major character, produce:
- Name & one-line role
- Vocabulary register (formal/slang/technical) and 5-8 signature words or phrases
- Sentence shape (short & clipped vs. long & winding) and typical rhythm
- Verbal tics, filler words, and what they NEVER say
- Emotional filter: how their background/era/education colors word choice
- A 2-line sample of dialogue that only they could speak

Keep it as a reusable reference to paste into every chapter prompt for "${config.title}".

EXAMPLE (format to follow):
  Name: Mali — wary detective, ex-monk
  Register: terse, formal; signature: "เอาตามตรง", "พอ"
  Sentence shape: short, clipped; never rambles
  Tics: ends statements with a question; NEVER swears
  Filter: sees everything as evidence; trust is earned
  Sample: "เอาตามตรง คุณโกหก. คำถามคือ — ทำไม?"

═══ CHARACTER NOTES ═══
[INSERT CHARACTER LIST / NOTES HERE]`;
}

function moduleCharacterArc(config: BookConfig): string {
  return `Design CHARACTER ARCS for "${config.title}" using the Lie-vs-Truth model (K.M. Weiland).

For EACH arc character, output:
- Arc type: Positive (Lie → Truth), Negative (Disillusionment / Fall / Corruption), or Flat (holds a Truth, changes the world)
- The LIE the character believes at the start + the WOUND behind it
- The TRUTH they need (or, for negative arcs, reject)
- The WANT (external goal) vs. the NEED (internal)
- Arc beats keyed to the plot: where the lie is challenged, the moment of choice, the proof of change
- How the arc shows in behavior at 0%, 25%, 50%, 75%, 100% of the book

═══ CHARACTER + PLOT NOTES ═══
[INSERT CHARACTER & PLOT NOTES HERE]`;
}

function moduleWorldCodex(config: BookConfig): string {
  return `Build a WORLDBUILDING CODEX (story bible) for "${config.title}" — the single source of truth that keeps the book internally consistent.

Organize into clear sections (include only what's relevant):
- SETTING: places, geography, time period, atmosphere
- RULES: how the world works (magic/tech/social rules) and their LIMITS (what is impossible)
- FACTIONS / GROUPS: names, goals, relationships
- KEY OBJECTS / LORE: items, history, mythology
- TIMELINE: the sequence of major events
- NAMING CONVENTIONS: so names stay consistent

Then add a CONTINUITY-CHECK instruction:
"After each chapter, list any new facts it introduced and flag anything that contradicts the codex above. Update the codex with confirmed new facts."

═══ PREMISE / WORLD NOTES ═══
Premise: ${config.thesis}
[INSERT ANY EXISTING WORLD NOTES HERE]`;
}

function moduleSceneBuilder(): string {
  return `Construct a single SCENE using the Scene/Sequel model (Swain/Bickham). Use this whenever a chapter needs a tightly-built dramatic unit.

SCENE (action):
1. GOAL — what the POV character wants in this scene
2. CONFLICT — what stands in the way (escalate it)
3. DISASTER — the scene ends worse than it began (a "yes, but" / "no, and")

SEQUEL (reaction) — optional, follows a scene:
1. REACTION — emotional response
2. DILEMMA — the bad options now facing the character
3. DECISION — the choice that becomes the next scene's goal

Rules: cause before effect (motivation → reaction), ≥2 senses, no filtering verbs (saw/felt/heard), end on a turn.

═══ SCENE BRIEF ═══
POV: [ ] · Goal: [ ] · Opposition: [ ] · Where this sits in the chapter: [ ]`;
}

function moduleDialoguePolish(): string {
  return `Revise a passage of DIALOGUE for craft. Keep meaning; sharpen delivery.

Apply:
- ACTION BEATS instead of most dialogue tags ("She set down the cup." not "she said angrily")
- SUBTEXT: characters rarely say exactly what they mean — create a gap between words and action/desire
- Trim greetings, filler, and on-the-nose exposition
- Use "said/asked" for the few tags you keep; cut adverbs
- Each line should advance plot OR reveal character — delete the rest
- Preserve each speaker's distinct voice

Output: the revised dialogue, then a 2-3 bullet note on what you changed and why.

═══ DIALOGUE DRAFT ═══
[INSERT DIALOGUE HERE]`;
}

// ── NONFICTION modules ─────────────────────────────────────────

function moduleFactCheck(config: BookConfig): string {
  return `Run a CITATION & FACT-CHECK pass on a nonfiction chapter draft. AI drafts routinely invent sources — your job is to make every claim verifiable, never to fabricate.

For the draft below:
1. Extract every factual claim, statistic, quote, and named study.
2. For each, output a row: CLAIM | TYPE (stat/quote/study/fact) | STATUS (verifiable / needs source / likely-wrong) | what source would confirm it (DOI / URL / book+page).
3. If you cannot identify a real, specific source, mark it "UNVERIFIED — do not publish without a real citation." Do NOT invent a citation.
4. List claims to soften, qualify, or cut.
5. Output citations in ${config.citationStyle} format with placeholders [VERIFY] where the real reference must be inserted.

═══ DRAFT ═══
[INSERT CHAPTER DRAFT HERE]`;
}

function moduleArgumentMap(config: BookConfig): string {
  return `Build a TOULMIN ARGUMENT MAP for the core argument of this chapter, then steelman the opposition.

For each major CLAIM, lay out:
- CLAIM (the assertion)
- GROUNDS (the evidence/data)
- WARRANT (the reasoning linking grounds to claim — state the hidden assumption)
- BACKING (support for the warrant)
- QUALIFIER (how strong: "usually", "in most cases" — flag unqualified absolutes)
- REBUTTAL (conditions under which the claim fails)

Then add a STEELMAN-THEN-REBUT section:
- State the strongest honest version of the opposing view (no strawmen)
- Concede what is true in it
- Rebut with evidence and reasoning

Flag any claim missing grounds or warrant.

═══ THESIS / DRAFT ═══
Thesis: ${config.thesis}
[INSERT CHAPTER OR ARGUMENT HERE]`;
}

function moduleEvidenceAudit(): string {
  return `Audit the EVIDENCE quality of a nonfiction draft against the evidence hierarchy.

Hierarchy (strongest → weakest): systematic review / meta-analysis > randomized controlled trial > cohort/longitudinal > case study > expert opinion > anecdote.

Output:
1. EVIDENCE TABLE: each claim | the support it currently rests on | its grade on the hierarchy.
2. GAP REPORT: claims propped up only by anecdote/expert-opinion that need stronger support.
3. For each gap, suggest what kind of source would raise the grade.
(If the topic is history/memoir/philosophy where this hierarchy doesn't apply, say so and switch to source-credibility criteria: primary vs. secondary, bias, corroboration.)

═══ DRAFT ═══
[INSERT CHAPTER DRAFT HERE]`;
}

function modulePedagogy(config: BookConfig): string {
  return `Generate the PEDAGOGY layer for a chapter of "${config.title}" (textbook / how-to / instructional nonfiction).

Produce:
1. LEARNING OBJECTIVES: 3-5 measurable objectives using Bloom's verbs (remember → understand → apply → analyze → evaluate → create), escalating across the book.
2. WORKED EXAMPLE: one fully worked example demonstrating the chapter's key skill, step by step.
3. RETRIEVAL PRACTICE: 4-6 end-of-chapter questions that force recall (not re-reading).
4. SPACED CALLBACK: 1-2 questions that connect to a concept from an earlier chapter.
5. KEY TAKEAWAYS: 3 one-line summaries.

═══ CHAPTER TOPIC ═══
[INSERT CHAPTER TOPIC / CONTENT HERE]`;
}

function moduleCaseStudy(): string {
  return `Build a CASE STUDY that makes an abstract concept concrete and credible. Use the SPAR structure.

- SITUATION: the context and who's involved
- PROBLEM: the specific challenge or tension
- ACTION: what was done (concrete, sequential)
- RESULT: the outcome, with numbers/specifics where possible
- LESSON: the explicit tie-back to the chapter's principle

Use a real, attributed example if one is provided; otherwise build a clearly-labeled composite/illustrative case (never present a fabricated case as real).

═══ CONCEPT + EXAMPLE ═══
Concept: [ ]
Example/source (or "composite"): [ ]`;
}

// ── PROSE modules ──────────────────────────────────────────────

function moduleVoiceFingerprint(): string {
  return `Extract an AUTHOR VOICE FINGERPRINT from sample writing, then produce a reusable style sheet to apply to every chapter.

From the samples, capture:
- Average sentence and paragraph length; variation pattern
- Diction & register (plain/literary/technical; warm/detached)
- Syntax habits (fragments? semicolons? parallelism?)
- Punctuation tics and formatting habits
- Metaphor/imagery density and favorite devices
- POV and tense
- 3 "do" and 3 "don't" rules that capture the voice

Output a compact STYLE SHEET (the fingerprint). Note: re-apply this sheet in every generation — models drift to a generic voice without it.

═══ VOICE SAMPLES (3-5 passages) ═══
[INSERT SAMPLE PASSAGES HERE]`;
}

function moduleAntiSlop(): string {
  return `Rewrite a draft to remove "AI slop" — generic, low-information LLM prose — while preserving meaning and the author's intent.

Remove / break these tells:
- Overused words: delve, tapestry, testament, realm, navigate, foster, underscore, crucial, vibrant, meticulous
- Hollow formulas: "It's not just X, it's Y", "In a world where…", "more than ever", "It's worth noting", rule-of-three everywhere
- Em-dash overuse and uniform sentence length
- Corporate hedging and empty transitions ("Furthermore," "Moreover,")
- Listicle voice and summary sentences that restate the obvious

Then: vary sentence length, prefer concrete specifics over abstractions, cut filler.

Output: (1) the de-slopped rewrite, (2) a short list of the specific tells you found and fixed.

EXAMPLE
  Before: "In today's fast-paced world, it's not just about working hard — it's about working smart. Let's delve into this crucial tapestry of productivity."
  After:  "Most advice tells you to work harder. The people who actually get more done do the opposite: they cut the list."

═══ DRAFT ═══
[INSERT DRAFT HERE]`;
}

function moduleReadability(config: BookConfig): string {
  return `Produce a READABILITY report and a level-controlled rewrite for the target reader: ${config.reader}.

1. Estimate Flesch Reading Ease and Flesch-Kincaid Grade Level for the draft (state your reasoning; approximate is fine).
2. Identify the hardest sentences (too long, too many clauses, rare words).
3. Set a target grade level appropriate to the audience and rewrite to hit it: cap sentence length, swap difficult words for plainer ones (utilize→use), split run-ons — without dumbing down the ideas.
4. Re-state the estimated scores after the rewrite.

═══ DRAFT + TARGET LEVEL ═══
Target reading level: [e.g. grade 8 / general adult / academic]
[INSERT DRAFT HERE]`;
}

function moduleLineEdit(): string {
  return `Perform a LINE EDIT — sentence-level craft, not content changes. Return the edited text plus a brief rationale list.

Fix:
- Filter/whimper words: just, really, very, that, kind of, sort of, actually, simply
- Weak "-ly" adverbs (replace with stronger verbs)
- Distancing verbs in deep POV: saw, heard, felt, noticed, realized
- Passive voice where active is clearer
- Clichés (replace with fresh phrasing)
- Repetition: flag words/phrases repeated too close together (and, across the whole book if provided, overused crutch words)

Preserve voice and meaning. Output: edited text, then a short bullet list of representative changes.

═══ DRAFT ═══
[INSERT DRAFT HERE]`;
}

// ── THAI module ────────────────────────────────────────────────

function moduleThaiPack(): string {
  return `ตรวจและปรับภาษาไทยของต้นฉบับให้ถูกต้องและลื่นไหล (Thai Language QA). ทำ 3 ส่วน:

1) ระดับภาษา / ราชาศัพท์ (Register)
- ระบุระดับภาษาเป้าหมาย (ทางการ / กึ่งทางการ / กันเอง) แล้วปรับให้สม่ำเสมอทั้งบท
- ตรวจการใช้ราชาศัพท์ในบริบทที่จำเป็น และจุดที่ปนระดับภาษาผิด

2) การตัดประโยค / ความลื่นไหล (Flow & Segmentation)
- ภาษาไทยไม่มีเว้นวรรคระหว่างคำ → หาประโยคยาว/ซับซ้อนเกินไป แล้วตัดให้อ่านง่าย
- จัดขอบเขตประโยคและวรรคตอนให้ชัด ลดประโยคซ้อนหลายชั้น

3) การทับศัพท์ / คำยืม (Transliteration Consistency)
- ทำให้การสะกดคำทับศัพท์/ชื่อเฉพาะสม่ำเสมอทั้งเล่ม (เลือกมาตรฐาน เช่น RTGS แล้วยึดตาม)
- ทำ glossary คำทับศัพท์ที่ใช้ซ้ำ เพื่อให้สะกดตรงกันทุกบท
- ตรวจการปนไทย-อังกฤษที่ไม่จำเป็น

ผลลัพธ์: ข้อความที่ปรับแล้ว + รายการแก้ไขสำคัญ + glossary คำทับศัพท์

═══ ต้นฉบับภาษาไทย ═══
[ใส่ข้อความที่นี่]`;
}

// ── MARKETING modules ──────────────────────────────────────────

function moduleTitle(config: BookConfig): string {
  const fiction = isFictionType(config.type);
  let p = `Generate book TITLE + SUBTITLE options for "${config.title || "[working title]"}".\n\n`;
  p += `Type: ${BOOK_TYPES[config.type].label} · Audience: ${config.reader}\nPremise: ${config.thesis}\n\n`;
  if (fiction) {
    p += `Produce 10 evocative title options (1-5 words) that fit the genre and tone. For each, one line on the mood it sets. Optionally a short series-style subtitle.`;
  } else {
    p += `Produce 10 title + subtitle pairs. Title: short, curiosity/benefit hook (≤5 words). Subtitle: names the reader + their problem + the transformation, and includes searchable keywords (≤15 words). For each, note the main keyword it targets.`;
  }
  return p;
}

function moduleBlurb(config: BookConfig): string {
  const fiction = isFictionType(config.type);
  let p = `Write back-cover / Amazon DESCRIPTION copy for "${config.title}".\n\nAudience: ${config.reader}\nPremise: ${config.thesis}\n\n`;
  if (fiction) {
    p += `Structure: HOOK (character + conflict + stakes in one line) → brief setup → escalation → CLIFFHANGER question. 120-180 words, present tense, no spoilers.\nAlso give 3 one-line "hooks" usable as ad copy.\n`;
  } else {
    p += `Structure: PROBLEM (reader's pain) → PROMISE (the transformation) → PROOF (benefits + author credibility) → "who this is for". 120-180 words.\nAlso give 3 bullet benefit lines.\n`;
  }
  p += `\nThen output an Amazon-safe HTML version using only <b>, <i>, <h4>, <br>, <ul><li> (no other tags).`;
  return p;
}

function moduleKdpMeta(config: BookConfig): string {
  return `Generate Amazon KDP METADATA candidates for "${config.title}" (${BOOK_TYPES[config.type].label}, ${config.subGenre.replace(/_/g, " ")}, audience: ${config.reader}).

⚠ IMPORTANT: You cannot see live Amazon data. Produce well-reasoned CANDIDATES + a verification method — do not claim search volumes. KDP limits change; tell the user to confirm in KDP and validate demand in a keyword tool (e.g. Publisher Rocket) or Amazon's own search-autocomplete.

1. SEVEN KEYWORD / SEARCH-TERM PHRASES: multi-word, reader-intent phrases (themes, tropes, audience, use-case, comparable-author style). Do NOT repeat words already in the title or chosen category. One per line + a one-line rationale.
2. CATEGORIES: 3 specific, valid category paths (deepest relevant nodes), ranked, with why each fits.
3. VERIFICATION CHECKLIST: for each keyword — how to validate it (type it into Amazon search; check autocomplete suggestions; confirm books rank for it; gauge competition). Mark any guess as "VERIFY".
4. A 2-line A+ / comparison hook for the product page.

Be concrete; avoid generic single words.`;
}

function moduleSubmission(config: BookConfig): string {
  return `Produce a traditional-publishing SUBMISSION PACK for "${config.title}".

Inputs to use: premise = ${config.thesis}; type = ${BOOK_TYPES[config.type].label}; audience = ${config.reader}; approx ${config.chapters * config.wordsPerChapter} words.

Output four parts:
1. QUERY LETTER (~250 words): hook paragraph (protagonist/concept + conflict + stakes), then metadata line (title, word count, genre, 2 comp titles), then a 2-line author bio slot.
2. ONE-PAGE SYNOPSIS: present tense, the FULL arc including the ending (no teasing), key turning points named.
3. FIVE COMP TITLES: published within ~3 years, same readership (avoid mega-bestsellers), each with one line on the shared element. Mark any you're unsure are recent — the user should verify.
4. AUTHOR BIO: three versions — 50, 100, and 150 words.

[INSERT any author credentials / comp ideas here]`;
}

// ── ADVANCED modules ───────────────────────────────────────────

function moduleRollingRecap(): string {
  return `Maintain a ROLLING RECAP (chain-of-density) — a compact running summary carried into the next chapter so the model keeps continuity without re-reading everything.

Given the prior recap + the chapter just finished, output an updated recap that is:
- Fixed length (~150-200 words), entity-dense (names, places, facts, open threads)
- Newest developments first; drop anything no longer load-bearing
- Plain facts only, no prose flourish

Use this as the "previously" block at the top of the next chapter prompt.

═══ PRIOR RECAP ═══
[INSERT PRIOR RECAP OR "(none)"]

═══ CHAPTER JUST FINISHED ═══
[INSERT CHAPTER HERE]`;
}

function moduleBrainstorm(): string {
  return `Brainstorm options using VERBALIZED SAMPLING to defeat repetitive, "samey" output: ask for a spread of candidates WITH their likelihoods, which recovers diversity that alignment flattens.

For the creative problem below, generate 8 distinct options. For each: the idea (1-2 lines) + an estimated probability/typicality (0-1) of a model defaulting to it. Then deliberately include 2-3 lower-probability, off-distribution options that are still on-brief.

Use for: titles, plot twists, character names, chapter angles, metaphors, hooks.

═══ BRAINSTORM BRIEF ═══
[INSERT what to brainstorm + constraints]`;
}

// ── Catalog assembly ───────────────────────────────────────────

type ModuleDef = { id: string; group: PromptGroup; name: string; description: string; usage: string; build: (c: BookConfig) => string };

export const MODULE_CATALOG: ModuleDef[] = [
  // craft
  { id: "STRUCTURE", group: "craft", name: "Structure Outline", description: "Beat-by-beat outline (Save the Cat / Hero's Journey / Story Circle / Kishōtenketsu / Seven-Point).", usage: "Run before writing, to plan the whole book.", build: moduleStructureOutline },
  { id: "VOICE_SHEET", group: "craft", name: "Character Voice Sheet", description: "Distinct voice per character; inject into every chapter prompt.", usage: "Fill in characters; paste output into chapter prompts.", build: moduleCharacterVoice },
  { id: "CHAR_ARC", group: "craft", name: "Character Arc Sheet", description: "Lie-vs-Truth arcs (positive/negative/flat) keyed to plot beats.", usage: "Run after the outline, before drafting.", build: moduleCharacterArc },
  { id: "WORLD_CODEX", group: "craft", name: "Worldbuilding Codex", description: "Story bible + per-chapter continuity check.", usage: "Build once; check each new chapter against it.", build: moduleWorldCodex },
  { id: "SCENE", group: "craft", name: "Scene Builder", description: "Scene/Sequel + MRU structure for a single dramatic unit.", usage: "Use when a chapter needs a tightly built scene.", build: moduleSceneBuilder },
  { id: "DIALOGUE", group: "craft", name: "Dialogue Polish", description: "Action beats, subtext, trimmed tags.", usage: "Send a dialogue passage to revise.", build: moduleDialoguePolish },
  // nonfiction
  { id: "FACT_CHECK", group: "nonfiction", name: "Citation / Fact-Check", description: "Verify every claim; forbid invented citations.", usage: "Send each nonfiction chapter draft.", build: moduleFactCheck },
  { id: "ARG_MAP", group: "nonfiction", name: "Argument Map + Steelman", description: "Toulmin map + honest counterargument & rebuttal.", usage: "Run on the core argument of a chapter.", build: moduleArgumentMap },
  { id: "EVIDENCE", group: "nonfiction", name: "Evidence Audit", description: "Grade support on the evidence hierarchy + gap report.", usage: "Send a draft to audit its evidence.", build: moduleEvidenceAudit },
  { id: "PEDAGOGY", group: "nonfiction", name: "Pedagogy Pack", description: "Bloom objectives + worked example + retrieval + spaced callbacks.", usage: "Run per chapter for textbook/how-to.", build: modulePedagogy },
  { id: "CASE_STUDY", group: "nonfiction", name: "Case-Study Builder", description: "SPAR case (Situation-Problem-Action-Result-Lesson).", usage: "Use to make a concept concrete.", build: moduleCaseStudy },
  // prose
  { id: "VOICE_FP", group: "prose", name: "Author Voice Fingerprint", description: "Extract a reusable style sheet from sample writing.", usage: "Run once with samples; reuse every chapter.", build: moduleVoiceFingerprint },
  { id: "ANTI_SLOP", group: "prose", name: "Anti-AI-Slop Rewrite", description: "Strip generic LLM tells; vary rhythm; concretize.", usage: "Send any draft to de-slop.", build: moduleAntiSlop },
  { id: "READABILITY", group: "prose", name: "Readability Control", description: "Flesch-Kincaid report + level-controlled rewrite.", usage: "Send a draft + target level.", build: moduleReadability },
  { id: "LINE_EDIT", group: "prose", name: "Line Edit", description: "Filter words, adverbs, passive, clichés, repetition.", usage: "Send a draft for a sentence-level edit.", build: moduleLineEdit },
  // thai
  { id: "THAI_QA", group: "thai", name: "Thai Language QA", description: "Register/ราชาศัพท์, sentence segmentation, transliteration consistency.", usage: "Send Thai-language drafts.", build: moduleThaiPack },
  // marketing
  { id: "TITLE", group: "marketing", name: "Title + Subtitle", description: "10 title (and subtitle) options, keyword-aware for nonfiction.", usage: "Run anytime; iterate on positioning.", build: moduleTitle },
  { id: "BLURB", group: "marketing", name: "Blurb / Description", description: "Back-cover copy + Amazon-safe HTML.", usage: "Run for the sales description.", build: moduleBlurb },
  { id: "KDP_META", group: "marketing", name: "KDP Metadata", description: "7 keywords + 3 categories + A+ hook.", usage: "Run before publishing on KDP.", build: moduleKdpMeta },
  { id: "SUBMISSION", group: "marketing", name: "Agent Submission Pack", description: "Query letter + 1-page synopsis + comps + author bio.", usage: "Run for traditional submission.", build: moduleSubmission },
  // advanced
  { id: "RECAP", group: "advanced", name: "Rolling Recap", description: "Chain-of-density carry-forward summary for continuity.", usage: "Update after each chapter; prepend to the next.", build: moduleRollingRecap },
  { id: "BRAINSTORM", group: "advanced", name: "Brainstorm (Verbalized Sampling)", description: "Diverse option spread to beat repetitive output.", usage: "Use for titles, twists, names, hooks.", build: moduleBrainstorm },
];
