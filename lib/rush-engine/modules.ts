import { BOOK_TYPES, isFictionType } from "./book-types";
import type { BookConfig, BookTypeKey, GeneratedPrompt, PromptGroup } from "./types";

export const MODULE_GROUPS: { key: Exclude<PromptGroup, "core">; label: string; desc: string }[] = [
  { key: "craft", label: "Fiction Craft", desc: "Structure outline, character voice/arc, worldbuilding codex, scenes, dialogue" },
  { key: "nonfiction", label: "Nonfiction Credibility", desc: "Fact-check, argument map, evidence audit, pedagogy, case studies" },
  { key: "prose", label: "Prose Polish", desc: "Voice fingerprint, anti-AI-slop, readability, line edit" },
  { key: "thai", label: "Thai Language", desc: "Register/ราชาศัพท์, sentence flow, transliteration consistency" },
  { key: "marketing", label: "Publishing & Marketing", desc: "Title, blurb, KDP metadata, agent submission pack" },
  { key: "advanced", label: "Advanced Pipeline", desc: "Rolling recap (chain-of-density), brainstorm (verbalized sampling)" },
  { key: "agents", label: "Agent Pack", desc: "Multi-agent system prompts: orchestrator + research/bible/architect/writer/critic" },
  { key: "nis", label: "Narrative Intelligence", desc: "Grounded audits: plot-hole/continuity, character consistency, pacing, foreshadow/payoff, dialogue fatigue" },
];

/** Default module groups suggested for a given book type. */
export function defaultGroupsFor(type: BookTypeKey): Exclude<PromptGroup, "core">[] {
  const fiction = type === "novel" || type === "memoir" || type === "kids" || type === "poetry";
  const groups: Exclude<PromptGroup, "core">[] = ["prose", "marketing"];
  if (fiction) {
    groups.unshift("craft");
    groups.push("nis"); // grounded narrative-intelligence audits — the differentiator, on by default for fiction
  } else {
    groups.unshift("nonfiction");
  }
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
  p += `4. For each chapter: a one-line "promise" (what the reader gets) and a hook for the chapter end.\n\n`;
  p += `FORMAT: output one line per chapter as "N. <beat>" (e.g. "1. ...", "2. ...") so it can be pasted into the Outline field and auto-mapped to each chapter prompt.`;
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

EXAMPLE
  Before: "I'm really angry at you," she said angrily. "How could you do this to me?"
  After:  She set the keys on the table, one at a time. "Three years. You knew for three years."

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

// Inspired by Novel Studio's Constraint DNA (anti-safe, sensory minimum, tension, quality gate).

function moduleAntiSafe(): string {
  return `Apply the ANTI-SAFE pass. LLMs default to emotionally safe, tidy, reassuring prose — break that while keeping the story coherent.

Rules:
- NO comforting/tidy ending, no "lesson learned" summary, no "everything got better".
- Raise the conflict: the character must lose or risk something real; every choice costs.
- Cut "theater": self-congratulation, melodrama, on-the-nose emotion, narrator moralizing.
- Ban AI-tell emotion clichés — show through specific action/body instead. Thai examples to remove:
  "น้ำตาไหลริน", "หัวใจบีบรัด/สลาย", "รอยยิ้มอบอุ่น", "ความรู้สึกท่วมท้น", "ใจหายวาบ".
- Prefer earned ambiguity over neat resolution where it serves the story; let consequences stand.

Output: the revised passage, then 2-3 bullets on what you made riskier and the cost you added.

═══ DRAFT ═══
[INSERT DRAFT HERE]`;
}

function moduleSensoryAudit(): string {
  return `Audit a draft for SENSORY grounding (target ≥ 3 senses per scene).

For each scene/beat:
1. List which of the five senses appear: sight / sound / smell / taste / touch.
2. Flag any scene using fewer than 3.
3. Suggest 2-3 concrete, specific, non-cliché sensory details to add where it's thin (smell and touch are usually the gaps).

Avoid generic sensory filler; details must do double duty (mood/character/theme).

Output: a per-scene sense table + the targeted additions.

═══ DRAFT ═══
[INSERT DRAFT HERE]`;
}

function moduleConflictMap(): string {
  return `Map the TENSION across a draft so it never goes flat.

For each scene/beat:
- Conflict type: external / internal / interpersonal (or "none" — flag it).
- Tension rating 0-1, and direction (rising / falling / flat).
- The concrete stake (what can be lost here).

Then:
- Plot the tension curve and flag flat or repetitive stretches and any scene with no real conflict.
- Recommend where to raise stakes, add reversal, or vary rhythm (a deliberate quiet beat is fine; an accidental flat one isn't).

Output: the per-scene tension table + a short list of fixes.

═══ DRAFT ═══
[INSERT DRAFT HERE]`;
}

function moduleQualityGate(config: BookConfig): string {
  const thai = config.language === "thai" || config.language === "bilingual";
  return `Run a pre-publish QUALITY GATE on a finished chapter/draft. Judge each gate PASS or FAIL with a specific reason grounded in the text — never pass a gate without evidence.

Gates:
1. CONTINUITY — does it contradict any established fact / the story bible / the latest STATE?
2. SENSORY — at least 3 senses present in each scene?
3. ANTI-SAFE — no tidy/comforting resolution; the conflict carries real cost; no AI-tell emotion clichés?
4. VOICE — consistent with the book's voice and (fiction) each character's distinct voice?
5. ${config.type === "novel" || config.type === "memoir" ? "HOOK — does the chapter end with forward momentum?" : "EVIDENCE — claims supported; no unsupported assertions?"}
${thai ? "6. THAI — register consistent, no unnecessary English, transliteration consistent?\n" : ""}
Output JSON:
{ "gates": [ { "name": "...", "pass": true/false, "reason": "..." } ], "overall_pass": true/false, "must_fix": [ "..." ] }

═══ DRAFT ═══
[INSERT CHAPTER DRAFT HERE]`;
}

// ── AGENT PACK (multi-agent system prompts, à la Novel Studio swarm) ──
// Paste each into a separate agent/context (e.g. Claude Projects, sub-agents).

function agentHeader(config: BookConfig): string {
  const lang = config.language === "thai" ? "ภาษาไทย" : config.language === "bilingual" ? "Thai+English" : "English";
  return `PROJECT: "${config.title}" — ${BOOK_TYPES[config.type].label} (${config.subGenre.replace(/_/g, " ")})\nPREMISE: ${config.thesis}\nREADER: ${config.reader} · VOICE: ${config.voice} · OUTPUT LANGUAGE: ${lang}`;
}

function moduleAgentOrchestrator(config: BookConfig): string {
  return `# ROLE: Novel Studio Orchestrator
You DELEGATE and VERIFY. You do NOT write prose or code yourself.

${agentHeader(config)}

## Principles (non-negotiable)
- USER = EDITOR (final say). AI = DRAFTER (works within constraints, not free invention).
- Constraint over instruction: enforce the "do NOT" rules.
- Human-in-the-loop: every deliverable is a DRAFT for Approve / Reject / Edit.
- No fake metrics — every score must be measurable/deterministic.

## Subagents (delegate by contract: needs → produces)
1. research-agent → {niche, usp, comps, keywords}
2. bible-agent → {characters[], world, styleCard, glossary}
3. architect-agent → {arcMap, chapters[{scenes}]}
4. writer-agent → {draft, wordCount, prevDraft}  (one scene at a time)
5. critic-swarm → continuity / emotion / proof / marketing reports

## Wave schedule (gate each wave on its inputs)
W1 research (no deps) → W2 bible (needs logline) → W3 architect (needs characters)
→ W4 writer per scene (needs chapters) → W5 critic-swarm (needs ≥2 drafted scenes)
Critique loop: if a critic exceeds threshold → return to writer with feedback → repeat
until it passes the Quality Gate OR the user accepts the risk.

## Your turn output
For each request: name the agent(s) to run, the inputs you'll pass, and what you'll
verify on return. Summarize results for the user and wait. Never skip the human gate.`;
}

function moduleAgentResearch(config: BookConfig): string {
  return `# ROLE: Research Agent (Phase 1)
${agentHeader(config)}

Find the market position for this book. Output JSON only:
{ "niche": "...", "usp": "what makes it different (1-2 lines)",
  "comps": [ { "title": "...", "why": "shared element" } ],
  "keywords": ["reader-intent search phrases"],
  "audience_insight": "what this reader wants and fears" }
Be concrete and honest; if you cannot verify a comp is recent/real, mark it "VERIFY".`;
}

function moduleAgentBible(config: BookConfig): string {
  return `# ROLE: Bible Agent (Phase 2)
${agentHeader(config)}

Build the story bible from the logline/premise. Output JSON only:
{ "characters": [ { "name": "...", "want": "...", "need": "...", "lie": "...", "wound": "...", "voice": "register + 3 signature phrases" } ],
  "world": { "setting": "...", "rules": ["...", "LIMITS: what's impossible"], "factions": [] },
  "styleCard": { "pov": "...", "tense": "...", "sentence_rhythm": "...", "do": ["..."], "dont": ["..."] },
  "glossary": [ { "term": "...", "definition": "..." } ] }
Each character must be distinguishable by voice alone.`;
}

function moduleAgentArchitect(config: BookConfig): string {
  return `# ROLE: Architect Agent (Phase 3)
${agentHeader(config)}

Given characters + premise, design the structure. Output JSON only:
{ "structure": "chosen framework + why",
  "arcMap": "the protagonist's change in one line",
  "chapters": [ { "title": "...", "summary": "...",
    "scenes": [ { "goal": "...", "hidden": "subtext", "twist": "the turn", "emotion": "...", "beats": ["..."] } ] } ] }
Mark the inciting incident, midpoint, and climax. Every scene must have conflict + a turn.`;
}

function moduleAgentWriter(config: BookConfig): string {
  return `# ROLE: Writer Agent (Phase 4)
${agentHeader(config)}

Write ONE scene from its spec + the style card + bible. Constraints:
- Show, don't tell; ≥2 senses; conflict + turn in every scene.
- Keep the character's distinct voice; dialogue advances plot or reveals character.
- ANTI-SAFE: no tidy/comforting resolution; choices cost something; ban AI-tell clichés.
- Do not invent new canon facts (stay consistent with the bible/STATE).
Output JSON only:
{ "draft": "the scene prose (${config.language === "thai" ? "ภาษาไทย" : config.language})", "wordCount": 0, "techniquesApplied": ["..."] }
Keep prevDraft on the caller's side so revert is always possible.`;
}

function moduleAgentCritic(config: BookConfig): string {
  return `# ROLE: Critic Swarm (Phase 5) — run these four independently
${agentHeader(config)}

Given a draft (≥2 scenes), produce four reports. Output JSON only:
{ "continuity": { "issues": [ { "severity": "high|med|low", "what": "..." } ], "summary": "..." },
  "emotion": { "arcScore": 0.0, "dips": ["scene refs where tension sags"], "recommendations": ["..."] },
  "proof": { "errors": [ { "kind": "spelling|grammar|repetition", "text": "..." } ], "corrections": ["..."] },
  "marketing": { "blurb": "back-cover copy", "keywords": ["..."], "tagline": "..." } }
Only report findings you can point to in the text — no fabricated issues, no fake scores.`;
}

// ── NIS — Narrative Intelligence System (audit prompts, grounded) ──
// Every finding MUST cite evidence quotes; scores decompose from findings.

const NIS_RULES = `GROUNDING RULES (mandatory):
- Report a finding ONLY if you can quote the exact text that proves it (cite chapter + a short quote).
- Never invent issues; if the manuscript is clean on a check, say so.
- The 0-100 score is a SUMMARY of the findings, not a vibe: state how you derived it (e.g. -10 per high-severity, -3 per low). Show the findings; the number is secondary.`;

function moduleNisPlot(): string {
  return `You are a developmental editor running a PLOT-HOLE & CONTINUITY audit on a manuscript.

Build a mental ledger as you read: timeline/order of events, who knows what and when, object/location permanence. Then flag contradictions.

For each finding output: { type: timeline | causality | knowledge | object-permanence, chapter, contradiction (one line), evidence: ["quote A", "quote B that conflicts"], severity: high|med|low, fix }

${NIS_RULES}

End with: a 0-100 continuity score (with how you derived it) and the top 3 must-fix items.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT / CHAPTERS HERE]`;
}

function moduleNisCharacter(): string {
  return `Run a CHARACTER-CONSISTENCY audit. For each major character, hold their established traits, goals, relationships, and speech register.

Flag any action or line that contradicts what was established earlier. Output per finding:
{ character, chapter, what's inconsistent, evidence: ["established trait/quote", "contradicting quote"], severity, fix }
Also note any character whose VOICE drifts (starts sounding like the others).

${NIS_RULES}

End with: a 0-100 consistency score per main character + overall, and the riskiest drift to fix first.

═══ MANUSCRIPT (+ character bible if you have one) ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisPacing(): string {
  return `Run a PACING audit to find slow spots (the "saggy middle").

For each chapter/scene, judge pace (fast / medium / slow) and justify from concrete signals: scene length, dialogue-vs-narration balance, density of action/turns, sentence-length monotony, and whether the scene has a goal + turn.
Plot the tension/pace across the book and flag stretches that sag (low stakes + low movement + uniform rhythm) and any rushed climax.

Output: a per-chapter pace table (with the signal that drove each call) + flagged stretches + concrete cuts/compressions to fix them.

${NIS_RULES}

End with: a 0-100 pacing score and the single chapter most in need of tightening.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisForeshadow(): string {
  return `Run a FORESHADOWING & PAYOFF audit (Chekhov's gun).

Identify SETUPS (planted hints, objects, abilities, secrets) and PAYOFFS. Pair them up.
Flag: (a) setups that never pay off (unfired guns), (b) payoffs with no setup (deus ex machina / unearned reveals).

Output a table: setup (chapter + quote) → payoff (chapter + quote) | UNPAID | UNSEEDED, with a fix for each gap (plant earlier / pay off later / cut).

${NIS_RULES}

End with: a 0-100 setup-payoff score and the most jarring unseeded reveal to fix.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisDialogue(): string {
  return `Run a DIALOGUE-FATIGUE audit (pairs with the deterministic Thai Analyzer dialogue stats).

Flag: long "talking-heads" stretches (many lines with no action beat / blocking), on-the-nose exposition dumps, every character sounding the same, and filler exchanges that don't advance plot or reveal character.

Output per finding: { chapter, problem, evidence (quote the stretch), severity, fix (add action beat / cut / give it subtext / differentiate voice) }

${NIS_RULES}

End with: a 0-100 dialogue score and the worst talking-heads scene to break up.

═══ DIALOGUE / CHAPTER ═══
[INSERT TEXT HERE]`;
}

function moduleNisPov(): string {
  return `Run a POV & TENSE CONSISTENCY audit. Lock onto each scene's point-of-view character and the book's chosen tense, then catch every slip.

Flag per finding: { type: head-hop (POV jumps to another character mid-scene) | tense-slip (past↔present) | pov-distance (filter verbs — saw/felt/heard/realized — that break deep POV) | impossible-knowledge (the POV character narrates something they cannot see/know), chapter, evidence: ["the offending quote"], severity, fix }

${NIS_RULES}

End with: a 0-100 POV-discipline score and the single worst head-hop to fix first.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisShow(): string {
  return `Run a SHOW-vs-TELL audit. Find places that summarize or name an emotion/conclusion where a dramatized moment would land harder.

For each finding output: { chapter, told: "the telling sentence (quote)", why: "named emotion | summary instead of scene | filtering verb | stated conclusion the reader should infer", showing: "a concrete rewrite that dramatizes it via action/body/sensory detail", severity }

Balance rule: telling is correct for transitions, time-skips, and compressing the unimportant — do NOT flag those. Only flag telling that steals a moment that deserved a scene.

${NIS_RULES}

End with: a 0-100 show/tell balance score and the one told moment most worth dramatizing.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisTheme(): string {
  return `Run a THEME & MOTIF audit. First state the book's controlling theme in one sentence (as evidenced by the text, not as you'd wish it).

Then build a MOTIF TABLE: each recurring image/symbol/motif → every instance (chapter + quote) → whether it pays into the theme or is decorative.
Flag: (a) motifs introduced once and dropped, (b) on-the-nose thematic statements (a character or narrator stating the theme outright), (c) an ending that doesn't earn the theme.

${NIS_RULES}

End with: a 0-100 thematic-coherence score and the single change that would sharpen the theme most.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
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
  { id: "ANTI_SAFE", group: "craft", name: "Anti-Safe Pass", description: "Break safe/tidy AI defaults; raise real stakes; ban Thai AI-tell clichés.", usage: "Send a draft to make it riskier.", build: moduleAntiSafe },
  { id: "SENSORY", group: "craft", name: "Sensory Audit", description: "Per-scene 5-sense check (≥3) + targeted concrete additions.", usage: "Send a draft to ground it in the senses.", build: moduleSensoryAudit },
  { id: "CONFLICT_MAP", group: "craft", name: "Conflict / Tension Map", description: "Per-scene tension curve + flat-spot fixes.", usage: "Send a draft to map and raise tension.", build: moduleConflictMap },
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
  { id: "QUALITY_GATE", group: "advanced", name: "Quality Gate", description: "Pass/fail pre-publish gate: continuity, sensory, anti-safe, voice, (Thai).", usage: "Run on a finished chapter before moving on.", build: moduleQualityGate },
  // agents (multi-agent swarm system prompts)
  { id: "AGENT_ORCHESTRATOR", group: "agents", name: "Orchestrator", description: "Delegates to and verifies the agent swarm; wave schedule + gates.", usage: "Use as the coordinator agent's system prompt.", build: moduleAgentOrchestrator },
  { id: "AGENT_RESEARCH", group: "agents", name: "Research Agent", description: "Niche, USP, comps, keywords (JSON).", usage: "Phase 1 agent system prompt.", build: moduleAgentResearch },
  { id: "AGENT_BIBLE", group: "agents", name: "Bible Agent", description: "Characters, world, style card, glossary (JSON).", usage: "Phase 2 agent system prompt.", build: moduleAgentBible },
  { id: "AGENT_ARCHITECT", group: "agents", name: "Architect Agent", description: "Arc map + chapters/scenes outline (JSON).", usage: "Phase 3 agent system prompt.", build: moduleAgentArchitect },
  { id: "AGENT_WRITER", group: "agents", name: "Writer Agent", description: "Writes one scene from spec + bible (JSON).", usage: "Phase 4 agent system prompt.", build: moduleAgentWriter },
  { id: "AGENT_CRITIC", group: "agents", name: "Critic Swarm", description: "Continuity / emotion / proof / marketing reports (JSON).", usage: "Phase 5 agent system prompt.", build: moduleAgentCritic },
  // nis (grounded narrative-intelligence audits — every finding cites evidence)
  { id: "NIS_PLOT", group: "nis", name: "Plot-Hole & Continuity Audit", description: "Timeline/causality/knowledge/object-permanence contradictions, each with conflicting quotes.", usage: "Run on a full draft or batch of chapters.", build: moduleNisPlot },
  { id: "NIS_CHARACTER", group: "nis", name: "Character Consistency Audit", description: "Trait/goal/voice drift per character, with established-vs-contradicting quotes.", usage: "Run on a full draft (+ character bible).", build: moduleNisCharacter },
  { id: "NIS_PACING", group: "nis", name: "Pacing Audit", description: "Per-chapter pace from concrete signals; finds the saggy middle + rushed climax.", usage: "Run on the assembled manuscript.", build: moduleNisPacing },
  { id: "NIS_FORESHADOW", group: "nis", name: "Foreshadow & Payoff Audit", description: "Pairs setups to payoffs; flags unfired guns and unseeded reveals.", usage: "Run on a full draft to check planting.", build: moduleNisForeshadow },
  { id: "NIS_DIALOGUE", group: "nis", name: "Dialogue-Fatigue Audit", description: "Talking-heads runs, on-the-nose exposition, samey voices (pairs with Thai Analyzer).", usage: "Run on dialogue-heavy chapters.", build: moduleNisDialogue },
  { id: "NIS_POV", group: "nis", name: "POV & Tense Audit", description: "Head-hopping, tense slips, deep-POV distance, impossible knowledge — each quoted.", usage: "Run on a full draft to lock POV/tense.", build: moduleNisPov },
  { id: "NIS_SHOW", group: "nis", name: "Show-vs-Tell Audit", description: "Flags told emotions/summaries with a concrete showing rewrite; spares legit transitions.", usage: "Run on draft scenes that feel flat.", build: moduleNisShow },
  { id: "NIS_THEME", group: "nis", name: "Theme & Motif Audit", description: "Tracks every motif instance with quotes; flags dropped motifs and on-the-nose theme.", usage: "Run on the assembled manuscript.", build: moduleNisTheme },
];
