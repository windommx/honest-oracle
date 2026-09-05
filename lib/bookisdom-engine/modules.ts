import { BOOK_TYPES, isFictionType } from "./book-types";
import { MODULE_META } from "./catalog-meta";
import type { BookConfig, BookTypeKey, GeneratedPrompt, PromptGroup } from "./types";

export const MODULE_GROUPS: { key: Exclude<PromptGroup, "core">; label: string; desc: string }[] = [
  { key: "craft", label: "Fiction Craft", desc: "Structure outline, character voice/arc, worldbuilding codex, scenes, dialogue" },
  { key: "nonfiction", label: "Nonfiction Credibility", desc: "Fact-check, argument map, evidence audit, pedagogy, case studies" },
  { key: "prose", label: "Prose Polish", desc: "Voice fingerprint, anti-AI-slop, readability, line edit" },
  { key: "thai", label: "Thai Language", desc: "Register/ราชาศัพท์, sentence flow, transliteration consistency" },
  { key: "dialect", label: "Thai Dialects", desc: "Isan, Northern (คำเมือง), Southern — convert dialogue to regional voice + glossary" },
  { key: "marketing", label: "Publishing & Marketing", desc: "Title, blurb, KDP metadata, agent submission pack" },
  { key: "advanced", label: "Advanced Pipeline", desc: "Rolling recap (chain-of-density), brainstorm (verbalized sampling)" },
  { key: "agents", label: "Agent Pack", desc: "Multi-agent system prompts: orchestrator + research/bible/architect/writer/critic" },
  { key: "nis", label: "Narrative Intelligence", desc: "Grounded audits: plot-hole/continuity, character consistency, pacing, foreshadow/payoff, dialogue fatigue" },
  { key: "saga", label: "Saga / Multi-Season", desc: "Plan long-form 3–9 season works: macro arc, per-season design, cross-season SAGA STATE continuity, season bridges" },
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

function moduleGenreCore(config: BookConfig): string {
  const genre = config.subGenre ? config.subGenre.replace(/_/g, " ") : "(set the genre)";
  return `Before outlining, lock the READER PROMISE for this book's genre — what readers of ${genre} actually come for — so every later choice delivers it.

Genre: ${genre}
Premise: ${config.thesis || "[state your one-line premise]"}

Produce:
1. CORE PROMISE — one sentence naming the emotional experience readers of this genre pay for (romance = the yearning and its earned payoff; mystery = the itch to know + a fair, surprising solution; fantasy = a world worth living in + a hero who grows; sci-fi = one idea followed honestly to its human cost).
2. NON-NEGOTIABLES — the conventions these readers expect; breaking them without purpose loses them.
3. FRESH-ANGLE ZONES — where this genre rewards a new take, vs where it punishes deviation.
4. FAILURE MODES — the top ways books in this genre disappoint, and the tell-tale early signs.
5. DELIVERY CHECK — for MY premise above, name 3 concrete beats/scenes that MUST land to keep the promise.

Rules: ground every point in this specific genre and this premise — no generic "write well" advice. If the subgenre blends genres, state which promise leads and which supports.

Output: the five sections, then a one-line verdict on whether the premise is set up to deliver its genre's promise.`;
}

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
  p += `5. BUT/THEREFORE AUDIT (Parker & Stone's rule): read the outline as a chain — every adjacent beat pair must connect with "THEREFORE" (causation) or "BUT" (reversal). Flag and fix every "AND THEN" joint: that is where a story stops being a story and becomes a list.\n`;
  p += `6. If the book braids multiple plotlines, mark each beat A/B/C (A = main line, carries most beats; B = parallel line that usually carries the THEME; C = light runner) and check no line goes silent for more than 3 consecutive chapters.\n\n`;
  p += `NOTE FROM STREAMING DATA (Netflix's own hook study): audiences almost never commit on the opener — episodes 2-4 do the hooking. Budget accordingly: the opening chapter earns attention, chapters 2-4 must CONVERT it.\n\n`;
  p += `WHAT TRANSFERS FROM THE SCREEN (adaptation scholarship, McFarlane): beats, structure, and act shapes cross media — borrow them freely, as this module does. Narration, point of view, and interior thought do NOT exist on screen: they are the novel's home advantage. So structure like television, but SPEND the prose-only powers the screen can't touch — do not flatten interiority to imitate a screenplay.\n\n`;
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
  Apply Sanderson's Laws here (his own essays, 2007-2013): FIRST — "an author's ability to solve conflict with magic is DIRECTLY PROPORTIONAL to how well the reader understands said magic" (unexplained power may create wonder, never solutions); SECOND — "Limitations > Powers" (what the magic CAN'T do is more interesting than what it can); THIRD — expand what you already have before adding something new (depth over breadth: connect the system to culture, economy, ecology). He calls them guidelines, not laws — violable on purpose, never by accident.
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

REPLICATION CHECK (the layer most self-help sourcing skips): a claim can be RCT-grade AND dead — the grade tells you how it was tested, not whether it survived retesting. Worked example to teach from: the "power pose" hormonal claims (testosterone up, cortisol down; Carney, Cuddy & Yap 2010) failed a larger replication (Ranehill et al. 2015) and were publicly disavowed by the study's own first author in 2016 — yet they still circulate in wellness content today, often with the failed replication rewritten as a confirmation. For any load-bearing claim: search "<claim> replication" before citing.

PRECISION RED FLAGS — the fingerprint of manufactured evidence: (a) suspiciously exact percentages tied to prestigious journals without a findable paper ("reduces anxiety 35%, JAMA 20XX"); (b) effect sizes far larger than the field's norm; (c) mechanisms stated as certainties ("raises testosterone 15-20%"); (d) a real technique carrying an invented number (the technique's realness launders the statistic). Rule: keep the technique if independently sourced, STRIP the number unless the primary paper is in hand.

Output:
1. EVIDENCE TABLE: each claim | the support it currently rests on | its grade on the hierarchy | replication status if known.
2. GAP REPORT: claims propped up only by anecdote/expert-opinion that need stronger support.
3. RED-FLAG LIST: every suspiciously precise number, with keep-technique/strip-number verdicts.
4. For each gap, suggest what kind of source would raise the grade.
(If the topic is history/memoir/philosophy where this hierarchy doesn't apply, say so and switch to source-credibility criteria: primary vs. secondary, bias, corroboration.)

═══ DRAFT ═══
[INSERT CHAPTER DRAFT HERE]`;
}

function modulePedagogy(config: BookConfig): string {
  return `PEDAGOGY LAYER for a chapter of "${config.title}" — instructional nonfiction (textbook / how-to / manual).

THE FAILURE THIS MODULE EXISTS TO FIX: the reader finishes the chapter, agrees with every sentence, and still cannot DO the thing. That is not a clarity problem and more explaining will not cure it. A chapter that ends in comprehension ends in nothing checkable; a chapter must end in a CAPABILITY the reader can demonstrate. Everything below is ordered by that.

Reader (write for this person, not for a general audience): ${config.reader}
Book thesis the chapter must serve: ${config.thesis}
Chapter budget: ~${config.wordsPerChapter} words, chapter ${"{n}"} of ${config.chapters}${config.subGenre ? ` · ${config.subGenre.replace(/_/g, " ")}` : ""}

━━ STEP 1 · THE CAPABILITY SENTENCE (write this before any prose) ━━
"After this chapter, ${config.reader} can [VERB] [OBJECT] [under these conditions] [to this standard]."
The verb must name something an observer could watch happen. If the only verb that fits is understand / know / appreciate / be aware of, the chapter has a TOPIC, not a capability — go back and find the action the topic is for. Standard means a signal the reader can check alone: the output has these three parts, the number balances, the dough passes the windowpane test, the script runs without error.
One capability per chapter. A chapter with four is four chapters.

━━ STEP 2 · THE DEMONSTRATION TASK (write it SECOND, before the explanation) ━━
The task that would prove the capability. State the inputs the reader will have, the artifact they will produce, and the SUCCESS SIGNAL that tells them it worked — plus the FAILURE SIGNAL, i.e. what a wrong result looks like. Then write the chapter backwards from this task and cut every paragraph that does not serve it.

━━ STEP 3 · THE WORKED EXAMPLE, THEN THE FADE ━━
Give the solution before you demand one. Novices learning from studied worked examples outperform novices told to solve the equivalent problems themselves — the worked example effect (Sweller & Cooper 1985; Sweller 1988, Cognitive Science 12(2), cognitive load theory). Produce THREE items in sequence, not one:
  (a) FULL WORKED EXAMPLE — exact shape:
        GIVEN: the concrete starting inputs, with real values. No "let x be a value".
        GOAL: the finished artifact, described so the reader can recognise it.
        STEP n: the action · the actual substitution or keystroke · WHY THIS STEP (one line — the rule it comes from)
        WRONG TURN: the mistake most people make at this step, shown wrong, then corrected.
        RESULT: the finished artifact in full, so the reader can compare theirs to it.
      The WHY line is not decoration. Learners who explain each step's rationale to themselves gain more from examples than those who read them through (Chi et al. 1989, self-explanation effect) — the line exists to prompt that explanation.
  (b) FADED TWIN — same procedure, new inputs, LAST step blank for the reader to complete. Then a version with the last two blank.
  (c) FULL PROBLEM — new inputs, nothing given, answer at the back.
Fade on purpose: the same guidance that helps a novice stops helping and can hurt once the reader has the schema (expertise reversal effect, Kalyuga, Ayres, Chandler & Sweller 2003). A book that worked-examples chapter 12 as heavily as chapter 1 is padding.

━━ STEP 4 · RETRIEVAL PRACTICE (the end of the chapter, not an appendix) ━━
Retrieval beats rereading for durable retention (Roediger & Karpicke 2006, Psychological Science 17(3):249-255; meta-analyses: Rowland 2014, Psychological Bulletin 140(6); Adesope, Trevisan & Sundararajan 2017, Review of Educational Research). Dunlosky et al. 2013 (Psychological Science in the Public Interest 14(1)) rate practice testing and distributed practice HIGH utility, and rereading and highlighting — the two things books actually train readers to do — LOW.
Write 4-6 items in this exact shape:
    CLOSED BOOK. (say it — the instruction is the intervention)
    PROMPT: a question that requires PRODUCING the answer, not recognising it. No multiple choice.
    ANSWER LENGTH: one sentence, or one worked line.
    ANSWER + WHY: placed at the end of the chapter or the back of the book, never on the same spread.
Cover all four item types: (1) state the term in your own words; (2) run the procedure on inputs never shown; (3) decide WHICH procedure applies to a described situation; (4) here is a broken example — find the error.
One caveat to honour: Roediger & Karpicke found that on an IMMEDIATE test restudying actually beat testing; the advantage of retrieval appeared at a delay. So do not promise the reader an instant feeling of mastery, and put the real check after a gap.

━━ STEP 5 · SPACING AND INTERLEAVING ━━
SPACED CALLBACK: 1-2 items reaching back to an earlier chapter. Distributed practice beats massed practice, and the best gap grows with how long you want the material to last (Cepeda, Pashler, Vul, Wixted & Rohrer 2006, Psychological Bulletin 132 — 317 experiments; interstudy interval and retention interval act jointly). Practical schedule for a ${config.chapters}-chapter book: revisit each capability once about three chapters later, once near the end, and once in the closing chapter — as a task, never as a summary paragraph.
INTERLEAVING, with its real limits: mixing problem types beats blocking them (Rohrer & Taylor 2007, Instructional Science 35). But the meta-analysis says it is conditional — a moderate overall effect (Brunmair & Richter 2019, Psychological Bulletin 145(11), Hedges' g ≈ 0.42) that is strong for visual/category material, small for mathematics, ambiguous for expository text, and REVERSED for word learning, where blocking won. Interleave discriminable procedures the reader will have to choose between; block a single procedure being installed for the first time.
And expect it to feel worse: conditions that slow visible performance can improve durable learning — desirable difficulties (Bjork 1994; Soderstrom & Bjork 2015, Perspectives on Psychological Science 10(2)). Warn the reader in the book, or they will read your hard chapter as a badly written one.

━━ DO NOT BUILD THE BOOK ON THESE ━━
· LEARNING STYLES (visual / auditory / kinesthetic; "some readers are visual learners, so this chapter is illustrated"). The meshing claim — that matching instruction to a stated preference improves learning — requires a crossover interaction, and Pashler, McDaniel, Rohrer & Bjork (2008, Psychological Science in the Public Interest 9(3):105-119) found "no adequate evidence base to justify incorporating learning-styles assessments into general educational practice." Direct tests since (Rogowsky, Calhoun & Tallal 2015; and again with children, 2020) found no crossover. Preferences are real; the payoff is not. Vary format because the CONTENT wants a diagram, never because a reader "is a visual learner."
· THE LEARNING PYRAMID / "we remember 10% of what we read, 20% of what we hear, 90% of what we teach." Traced: Edgar Dale's Cone of Experience (1946, 1954, 1969) contains NO percentages — Dale offered it as a classification from concrete to abstract, explicitly not a rank order of learning. The numbers were welded on later, circulated via Treichler (1967) and NTL Institute, which, asked for its evidence, replied that it no longer had and could not find the original research. Letrud & Hernes (2018, Cogent Education 5(1)) traced versions of the pyramid back more than 160 years and concluded it did not originate in empirical research at all. Never print these numbers. If your book's structure depends on them, the structure is decoration.
· THE 10,000-HOUR RULE as a promise. Practice matters; the meta-analysis of deliberate practice across music, games, sports, education and professions (Macnamara, Hambrick & Oswald 2014, Psychological Science 25) found it explains far less of the variance in performance than the popular rule implies, and least of all in professional domains. Give the reader a practice schedule, not an hour count that guarantees mastery.
· BLOOM'S TAXONOMY, used as a law. It is an organizing vocabulary (Bloom et al. 1956; revised Anderson & Krathwohl 2001), not an empirical finding, and the strict cumulative hierarchy is not supported — the revision itself relaxed it, and empirical probes of the revised taxonomy's internal assumptions find the knowledge-type and cognitive-process dimensions are not independent (Larsen, Endo, Yee, Do & Lo 2022, CBE—Life Sciences Education 21(4)). USE its verbs, because they force you to name an observable action. Do NOT claim your chapters climb a validated ladder.
· COGNITIVE LOAD THEORY — take the instructional effects, hold the theory loosely. The worked example, split-attention, redundancy and expertise-reversal effects are replicated instructional findings. The underlying load construct is contested: critics note there is no independent measure of load, so it is often inferred from the very test scores it is meant to explain. Cite the effect, not the mechanism.

━━ OUTPUT ━━
1. CAPABILITY SENTENCE (one line, observable verb, stated standard).
2. DEMONSTRATION TASK with success signal and failure signal.
3. WORKED EXAMPLE in the GIVEN / GOAL / STEP+WHY / WRONG TURN / RESULT shape, then the faded twin, then the unaided problem.
4. RETRIEVAL SET: 4-6 items in the CLOSED BOOK / PROMPT / ANSWER LENGTH / ANSWER+WHY shape, covering all four item types.
5. SPACED CALLBACK: 1-2 items from named earlier chapters, plus where in the book each capability is revisited.
6. CUT LIST: every part of the current draft that serves neither the demonstration task nor a retrieval item.
7. PREREQUISITE CHECK: what the reader must already be able to do, and which earlier chapter installed it. If nothing did, say so — a chapter resting on an uninstalled prerequisite is the most common reason readers "can't follow."

━━ HONESTY RULES ━━
- NEVER cite a retention percentage you cannot trace to a named study you have in hand. "People remember X% of what they Y" has no sourceable origin (see the pyramid above); writing it makes every other claim in your book cheaper.
- Cite instructional EFFECTS by paper and year, not by folk name. "Studies show" is not a citation; render real ones in ${config.citationStyle} and mark anything unverified [VERIFY].
- Distinguish established from contested IN THE TEXT: retrieval practice and spacing are heavily replicated; interleaving is conditional on material; cognitive load theory's mechanism is disputed. A reader who later learns you flattened this stops trusting the parts that were true.
- Do not promise outcomes ("master this in 30 days", "3x faster learning"). You cannot observe the reader; any number about their future performance is invented.
- Emit NO scores. No difficulty rating, no comprehension score, no readability grade sold as learning, no predicted completion or mastery percentage. Report present-or-absent facts instead: capability sentence present/absent, worked example present/absent, retrieval items count, spaced callbacks count, prerequisites unmet (list).
- What you can check from the chapter is whether the parts exist. Whether the reader learned is measured on readers, not on the manuscript — say so rather than estimating it.
- If the chapter genuinely has no demonstrable capability (a history chapter, an orientation chapter), say THAT and drop the layer. Do not manufacture an exercise to fill the slot.

═══ CHAPTER TOPIC / DRAFT ═══
[INSERT CHAPTER TOPIC OR DRAFT HERE]`;
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

function moduleCutPass(): string {
  return `ADVERSARIAL CUT PASS — shrink a chapter by cutting, and CLASSIFY every cut so the writer learns their own patterns. Field measurement from a real 75k-word AI-assisted novel pipeline (NousResearch autonovel, 2026): the two biggest cut categories were OVER-EXPLAIN (~32% of cuts) and REDUNDANT (~26%) — hunt those first.

The tradition behind this pass: King's Formula — "2nd Draft = 1st Draft − 10%" (an anonymous editor's rejection-slip note King says changed how he rewrites; On Writing, 2000) — and Elmore Leonard's rule 10: "Try to leave out the part that readers tend to skip" — the thick paragraphs the eye slides over ("hooptedoodle," his word via Steinbeck). Leonard's summary rule doubles as this pass's exit test: "If it sounds like writing, I rewrite it."

Target: cut [N — default 500] words from the chapter below WITHOUT losing any plot fact, character beat, or planted setup.

For every cut, output a line:
  [CATEGORY] "first words of the cut…" (−X words) — one-line reason
Categories:
- OVER-EXPLAIN — explaining what the scene already showed, or explaining a subtext to death
- REDUNDANT — restating information the reader already has (verbatim or paraphrased)
- SCAFFOLDING — throat-clearing openings, stage-management ("she turned and then walked to…"), weather reports
- HEDGE — qualifiers and softeners (rather, quite, somewhat, seemed to, began to)
- ORNAMENT — decoration that does no double duty (no emotion/character/theme work)

Rules: never cut a planted setup or its payoff; if a cut changes meaning, don't make it — flag it as [STUCK] with the reason instead; after cutting, output the revised chapter in full, then the cut list, then the totals per category.
Known failure modes to avoid (also field-measured): don't overshoot the target by rewriting instead of cutting, and don't compress the chapter below the point where scenes lose room to breathe.

═══ CHAPTER TO CUT ═══
[paste the chapter + optional target word count]`;
}

function moduleLineEdit(): string {
  return `Perform a LINE EDIT — sentence-level craft, not content changes. Return the edited text plus a brief rationale list.

VOICE-DRIFT GUARD (measured hazard: even "grammar-only" LLM revision passes level register toward formal, impersonal prose and strip first-person — arXiv:2604.22142): preserve the draft's register, contractions, sentence-length variance, and person. If a sentence is informal ON PURPOSE, grammar-correctness does not outrank voice — leave it.

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

// ── DIALECT modules (Thai regional voices) ─────────────────────

function dialectPrompt(name: string, region: string, notes: string, glossary: string): string {
  return `แปลง/เขียนบทสนทนาและการบรรยายให้เป็น "${name}" (${region}) อย่างเป็นธรรมชาติและถูกต้องตามวัฒนธรรม โดยคงความหมายและโครงเรื่องเดิม

หลักการ:
- โฟกัสที่ "บทพูด" ของตัวละครให้เป็นสำเนียง${name} ส่วนการบรรยายเลือกได้ว่าจะใช้ไทยกลางหรือถิ่น (ระบุให้สม่ำเสมอทั้งเรื่อง)
- ใช้คำลงท้าย/คำสรรพนาม/คำเรียกขานแบบถิ่นให้ถูกบริบทและสถานะตัวละคร
- รักษาน้ำเสียงและบุคลิกตัวละครเดิม ไม่ทำให้กลายเป็นตัวตลก (ไม่ล้อเลียนสำเนียง)
- ${notes}
- ถ้าคำถิ่นใดอาจเข้าใจยาก ให้คงคำถิ่นไว้แล้วใส่วงเล็บความหมายไทยกลางเฉพาะครั้งแรก

═══ คำถิ่นที่พบบ่อย (${name}) ═══
${glossary}

ผลลัพธ์: (1) ข้อความที่แปลงแล้ว (2) glossary คำถิ่นที่ใช้ในเรื่องนี้เพื่อความสม่ำเสมอ (3) โน้ตจุดที่ปรับให้ผู้เขียนตรวจ

═══ ต้นฉบับ (ไทยกลาง) ═══
[วางข้อความที่นี่]`;
}

export function moduleDialectIsan(): string {
  return dialectPrompt(
    "ภาษาอีสาน",
    "ลาว/อีสาน",
    "ระวังความต่างของถิ่นย่อย (อุบล/ขอนแก่น/โคราชต่างกัน) — เลือกถิ่นย่อยให้ชัดและคงเส้นคงวา",
    "- เด้อ/เนาะ (คำลงท้าย) · บ่ (ไม่) · กะ (ก็) · เฮา (เรา) · เจ้า/สู (คุณ/พวกเจ้า) · จั่งใด๋ (อย่างไร) · เบิ่ง (ดู) · แซบ (อร่อย) · ม่วน (สนุก) · คือ (เหมือน) · หลาย (มาก) · เว้า (พูด)"
  );
}

export function moduleDialectNorth(): string {
  return dialectPrompt(
    "คำเมือง (ภาษาเหนือ/ล้านนา)",
    "ล้านนา/ภาคเหนือ",
    "ใช้คำสุภาพแบบเมืองให้เหมาะสถานะ คำลงท้าย 'เจ้า' สำหรับความสุภาพ",
    "- เจ้า (ครับ/ค่ะ สุภาพ) · กา/ก่อ (ไหม) · บ่ (ไม่) · อู้ (พูด) · กิ๋น (กิน) · เปิ้น (เขา) · เฮา (เรา) · ตี้ (ที่) · จะใด (อย่างไร) · หละ/แหม (อีก) · งาม (สวย) · ละก่อ (ล่ะ)"
  );
}

export function moduleDialectSouth(): string {
  return dialectPrompt(
    "ภาษาใต้ (ปักษ์ใต้)",
    "ภาคใต้",
    "สำเนียงใต้พูดเร็ว ตัดคำ ใช้เสียงสั้น — สื่อด้วยการสะกดที่อ่านออกเสียงได้ แต่ยังอ่านเข้าใจ",
    "- หรอย (อร่อย/ดี) · แล (ดู/นะ) · ไซร้/ไหร (อะไร) · หม้าย/ม่าย (ไม่) · ตัว/เธอ→สู/มึง (ตามบริบท) · นุ้ย (เล็ก/น้อง) · เท่อ (โง่/เปิ่น) · พรือ (อย่างไร/ทำไม) · ว่าพรือ (ว่าอย่างไร)"
  );
}

// ── MARKETING modules ──────────────────────────────────────────

export function moduleCoverArt(config: BookConfig): string {
  return `สร้าง "บรีฟปกหนังสือ + image prompt" สำหรับ "${config.title}" จำนวน 2 แบบให้เลือก (เอา prompt ไปวางในเครื่องมือสร้างภาพ เช่น Midjourney / DALL·E / Stable Diffusion)

ข้อมูล: ${BOOK_TYPES[config.type].label} · ${config.subGenre.replace(/_/g, " ")} · ผู้อ่าน: ${config.reader}
แก่นเรื่อง/โทน: ${config.thesis}

สำหรับปก "แต่ละแบบ" (2 แบบ ให้ต่างกันชัด เช่น แบบ A เน้นตัวละคร / แบบ B เน้นสัญลักษณ์-บรรยากาศ) ให้ออก:
1. คอนเซ็ปต์ 1-2 บรรทัด (อารมณ์ที่ต้องการสื่อ + ทำไมเหมาะกับแนวนี้)
2. องค์ประกอบภาพ: subject หลัก, ฉากหลัง, มุมกล้อง/องค์ประกอบ, แสง, โทนสี, อารมณ์
3. ที่ว่างสำหรับ "ชื่อเรื่อง" และชื่อผู้เขียน (บอกตำแหน่งและสไตล์ตัวอักษร)
4. **MIDJOURNEY PROMPT**: บรรทัดเดียว ภาษาอังกฤษ พร้อม --ar 2:3 --style ที่เหมาะ
5. **DALL·E / SD PROMPT**: ย่อหน้าอธิบายละเอียด (ภาษาอังกฤษ) + NEGATIVE PROMPT (สิ่งที่ไม่เอา เช่น text artifacts, extra fingers, watermark)

ข้อกำหนด: ต้องเข้ากับแนว ${config.subGenre.replace(/_/g, " ")} และตลาดหนังสือ; เว้นพื้นที่ความปลอดภัยสำหรับตัวอักษร; เลี่ยงคลิเชปกที่ใช้ซ้ำเกินไป
หมายเหตุ: เครื่องมือนี้สร้าง "prompt ปก" ให้ ไม่ได้เจนรูปเอง — นำไปเจนในเครื่องมือสร้างภาพที่คุณมี`;
}

// ── MARKETING modules (cont.) ──────────────────────────────────

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
5. AI DISCLOSURE note for the user (state it plainly, don't decide for them): under KDP's policy (framework since Sept 2023 — verify current wording in KDP help), AI-GENERATED content (text/images/translation created by AI, even if edited) must be disclosed to Amazon during publishing setup; AI-ASSISTED (you wrote it, AI helped edit/refine/brainstorm) requires no disclosure. Tell the user which side their workflow falls on is THEIR call to make honestly — and that platform rules change, so re-check at publish time.
6. BESTSELLER-BADGE REALITY (teach it straight): Amazon's "#1 Best Seller" flag is computed PER CATEGORY from recent sales velocity, refreshed hourly — in a deep niche category, a handful of same-day sales can take #1. Two honest consequences: (a) it is an achievable launch tactic — pick the deepest categories that GENUINELY fit and concentrate launch-day sales; (b) other books' badges are weak evidence of quality or income, so never buy a tool or course on the strength of a badge screenshot. Never advise miscategorizing into an irrelevant niche to farm the flag — Amazon removes miscategorized titles and readers punish the mismatch.

Be concrete; avoid generic single words.`;
}

function moduleSubmission(config: BookConfig): string {
  const fiction = isFictionType(config.type);
  return `Produce a SUBMISSION PACK for "${config.title}" — the pitch aimed at ONE professional reader (an acquiring editor, or an agent in markets that use them). This is NOT retail copy: a shopper is browsing, this reader is deciding whether to spend a week of their life on your manuscript. Back-cover/store copy is a different artifact (see BLURB, KDP_META).

PROJECT FACTS (use only these; do not invent credentials, sales, or prior publications):
premise = ${config.thesis} · type = ${BOOK_TYPES[config.type].label} / ${config.subGenre.replace(/_/g, " ")} · reader = ${config.reader} · voice = ${config.voice} · manuscript language = ${config.language} · length ≈ ${config.chapters * config.wordsPerChapter} words in ${config.chapters} chapters

⚠ TWO MARKETS, TWO RULEBOOKS. State at the top of your output which one this pack targets.
A) ENGLISH-LANGUAGE TRADE (US/UK): the query-letter → agent → publisher route below is THAT market's convention. It is a convention, not a law of publishing.
B) THAI PUBLISHERS: in Thailand the author-representation agent model is reported as effectively absent — Thailand-based literary agencies work mainly on TRANSLATION RIGHTS (buying foreign titles for Thai publishers, selling Thai titles abroad), not on representing a Thai author to a Thai publisher. The normal route is DIRECT to the publisher (สำนักพิมพ์), usually by e-mail to the editorial desk, plus two other routes that matter: an open call / contest (การประกวดต้นฉบับ) and being picked up from an online serial platform (readAwrite, Dek-D, Fictionlog and similar). Thai publishers that publish submission pages typically specify their own file spec — Word file, A4, Cordia/Angsana-class font at 14 pt, a เรื่องย่อ of at most ~2 A4 pages, and a short ประวัตินักเขียน. TREAT EVERY SUCH DETAIL AS A PATTERN, NOT AS THE RULE: before sending anything, open the publisher's own "ส่งต้นฉบับ / เปิดรับต้นฉบับ" page and copy ITS spec exactly. Where their spec and this module disagree, THEIR SPEC WINS. If a publisher publishes no submission page, that silence is information — ask them, do not assume a Western template applies.

Produce these artifacts, in this order:

1. QUERY LETTER / จดหมายเสนอต้นฉบับ (~250–350 words, one page, five slots in this order)
   a. ADDRESS + WHY THIS READER — one sentence naming why this publisher/imprint/agent fits THIS book. Leave it as a fill-in slot: [ทำไมถึงส่งให้ที่นี่ — อ้างอิงหนังสือในเครือที่คุณอ่านจริง]. Do NOT fabricate the reason.
   b. HOOK — 150–200 words: protagonist (or, for nonfiction, the question), the concrete situation, the conflict, what is at stake, and the choice the book turns on. Concrete nouns; no theme talk, no backstory, no rhetorical questions.
   c. METADATA LINE — title, ${BOOK_TYPES[config.type].label}, subgenre, word count (${config.chapters * config.wordsPerChapter} words, rounded), language, comps, and whether the manuscript is COMPLETE. ${fiction ? "For fiction from an unpublished author the manuscript must be finished before you query — say so plainly." : "For nonfiction, what is usually sold is a PROPOSAL plus sample chapters, not a finished book — say which you have."}
   d. BIO — 2 sentences, relevant credentials only (see 4).
   e. CLOSE — what is attached, exactly as the recipient's guidelines asked for it.

2. ONE-PAGE SYNOPSIS / เรื่องย่อ (~500 words; Thai publishers often cap at 2 A4 pages — obey theirs)
   Third person, PRESENT tense, regardless of the book's own tense and person. The whole arc, in order, with the turning points named, WHO CHANGES and how — AND THE ENDING SPELLED OUT. A submission synopsis is not a teaser; withholding the ending is the most common reason it fails its job. Name only characters that matter to the spine (a synopsis crowded with names reads as an unfocused book). ${fiction ? "" : "For nonfiction, give the argument's spine instead of a plot: claim → evidence chain → what the reader can do differently by the end."}

3. COMPS / หนังสือเทียบเคียง — 3 to 5 candidates, ranked, each with ONE line naming the shared element
   What a comp is FOR: it is a market argument, not a compliment. It tells the reader "here is the shelf, here is the audience, here is roughly how it sells." An acquiring editor builds a profit-and-loss estimate from comparable titles, so an unusable comp costs you the argument.
   A USEFUL comp is: (i) recently published — roughly the last 2–3 years; (ii) recognisable to that specific reader — for a Thai publisher that means a Thai-market title, ideally one on their own or a rival's list, NOT a New York bestseller; (iii) matched on tone/voice/readership rather than on plot furniture; (iv) a book you have actually read.
   A HARMFUL comp is: a mega-seller or classic ("the next Harry Potter", "เหมือน…ที่ขายล้านเล่ม") — it reads as a claim about your sales, not about your book; a title over ~5–10 years old (it argues the market has already moved on); a film or series used as the only comp (a screen comp shows tone but proves nothing about book buyers — use at most one, as a secondary); two comps that are the same book twice (they should triangulate, e.g. one for voice, one for structure, one for audience); anything you have not read.
   For every candidate output: TITLE · author · year · publisher/imprint if known · the one shared element · confidence. Mark anything you are not certain is real and recent as "VERIFY — check in a bookshop, on the publisher's catalogue, or on the retailer page before sending."

4. AUTHOR BIO / ประวัตินักเขียน — three versions: 50, 100, 150 words, third person
   Include only: publication credits, relevant professional or lived expertise that gives you standing to write THIS book, prizes actually won, and — for nonfiction — platform stated as verifiable facts (audience size, column, teaching, community) rather than adjectives. Exclude: age, unrelated jobs, "I have loved writing since I was a child", and any credential the author has not supplied. If the author gives you nothing, output the bio as a labelled EMPTY SLOT with a list of what to fill in. ${fiction ? "For fiction, having no credits is normal — say nothing rather than padding." : "For nonfiction, platform is part of what is being bought; a thin platform is a fact to state, not to disguise."}

5. ${fiction ? "PACKAGE CHECK — the pages themselves: send exactly what was asked for (some ask 10 pages, some 3 chapters, some 10,000 words, some the whole file), from the actual opening — never a later chapter you like better." : "NONFICTION PROPOSAL SKELETON — overview (1–2 pages, the sales case), annotated chapter outline (~300 words per chapter, so shape is visible), audience and market, comps, platform/marketing, author bio, and 1–2 sample chapters written to finished quality."}

6. AFTER YOU SEND — vocabulary and expectations, stated honestly
   PARTIAL request = they want more pages, usually a set number of opening pages. FULL request = they want the entire manuscript. Neither is an offer; both are normal steps. Response practice varies enormously and some recipients publish a "no response means no" policy. THE ONLY AUTHORITY ON TIMING IS THE RECIPIENT'S OWN STATED WINDOW — read it, write it in your tracker, and follow up only after it has passed. This module will not tell you an average wait, a reply rate, or an acceptance rate, because no honest single number exists for them.

7. MONEY AND SAFETY — read this before you send anything
   Yog's Law (coined by author James D. Macdonald): MONEY FLOWS TOWARD THE AUTHOR. A publisher or agent who acquires your book pays you; you do not pay them to be considered. The Association of American Literary Agents' Canon of Ethics forbids member agents from charging reading fees to evaluate work for possible representation — so a "reading fee", "evaluation fee", "marketing contribution" or "submission fee" for consideration is the loudest possible warning sign.
   WATCHDOG, NAMED: Writer Beware — founded 1998, sponsored by SFWA (Science Fiction and Fantasy Writers Association), at writerbeware.blog — documents fee-charging agents, predatory vanity operations, ghostwriting-and-marketing scams, and impersonation of real publishers and real editors. Check any company that solicits YOU there first. Solicitation is itself a flag: legitimate publishers rarely cold-call an unpublished author to praise their manuscript.
   FOR THAI AUTHORS: paying a printer or a จ้างพิมพ์ / self-publishing service is a legitimate purchase of a service — but it is a purchase, not an acquisition, and anyone presenting it as "the publisher accepted your book" is misrepresenting it. I could not identify a Thai-language equivalent of Writer Beware, so do this instead: check that the company's books are physically in bookshops and listed by real distributors, ask other authors on their list, and get the terms (print run, royalty, rights, duration) in writing before signing.
   You do NOT need to register copyright before submitting: under Thailand's Copyright Act B.E. 2537 copyright exists automatically from creation, without registration (the Department of Intellectual Property's จดแจ้ง filing is an evidentiary record, not the source of the right). Anyone who says you must pay to protect your manuscript before sending it is selling something.

HONESTY RULES (these override everything above):
- NEVER invent an agent's name, an agency, an imprint, an editor, or a publisher's submission policy. If a real recipient is needed, output a labelled slot and the instruction to verify on that party's own website.
- NEVER invent a response-time statistic, an acceptance rate, a reply rate, or "your chances" — these are not knowable from a manuscript and Bookisdom does not print them.
- NEVER invent a comp title, its year, or its publisher. A plausible-sounding book that does not exist destroys the letter's credibility instantly; mark every unverified comp "VERIFY".
- Do not present English-language agent conventions as universal. Where this pack's advice and the recipient's own stated guidelines differ, the recipient wins — say so in the output.
- State the manuscript's real word count from the facts above; do not round toward a genre "sweet spot" you did not measure.
- If the author supplied no credentials, the bio stays an empty slot. Do not manufacture a biography.
- No score, no rating, no readiness percentage for the pack. Report what each artifact contains and what is still missing.

═══ AUTHOR CREDENTIALS · TARGET PUBLISHER/AGENT (paste their stated guidelines verbatim) · COMP IDEAS ═══
[INSERT HERE — ถ้ามีหน้า "เปิดรับต้นฉบับ" ของสำนักพิมพ์ ให้วางข้อความจริงมาทั้งหมด]`;
}
function moduleRollingRecap(config: BookConfig): string {
  const lo = Math.max(120, Math.round(config.wordsPerChapter / 12));
  const hi = Math.max(200, Math.round(config.wordsPerChapter / 6));
  return `ROLLING RECAP — maintain a carry-forward STATE BLOCK for "${config.title}" (${BOOK_TYPES[config.type].label}, ${config.chapters} chapters) so chapter N+1 can be written without re-reading chapters 1..N. This is a continuity instrument, not a blurb. It is written for the next drafting session, not for ${config.reader}.

THE ONE IDEA THIS MODULE IS BUILT ON: a recap has TWO halves with opposite rules. One half must survive compression untouched; the other half exists to be compressed. Most rolling summaries fail because they treat a death and a rainstorm as the same kind of sentence.

━━ PART 1 · WHAT MUST NEVER BE LOST (verbatim ledger — extractive, never paraphrased) ━━
Copy these out of the source text in the words the source used. Do not smooth them, do not merge them, do not shorten them to make room. If the block is too long, cut PART 2, never PART 1.
  L1 NAMES & SPELLING — every proper name exactly as spelled on the page (people, places, items, titles, ranks). A name that drifts one letter is a new character to a reader.
  L2 DATES, AGES & THE CLOCK — calendar dates, elapsed time, "three days later", ages, deadlines, seasons.
  L3 BODIES — injuries, illnesses, scars, pregnancies, DEATHS. Who is dead, in which chapter, witnessed by whom.
  L4 PROMISES, OATHS & DEBTS — who owes whom what, who swore what, what the price was, when it comes due.
  L5 OBJECTS — who currently HOLDS each significant object, and where it physically is.
  L6 KNOWLEDGE STATE — who knows which secret, and the chapter in which they learned it. The most common continuity break in a long draft is a character acting on information nobody gave them.
  L7 POSITIONS — where each on-page character physically is at the end of this chapter.
Every ledger line ends with a CHAPTER STAMP: [ch.N]. The stamp is the whole anti-drift mechanism — see PART 3.

━━ PART 2 · WHAT MAY BE COMPRESSED (digest — abstractive, rewritten every time) ━━
Mood, weather, description, interiority, subplot texture, the shape of an argument, how a scene felt. Compress this hard; it can be regenerated from the ledger plus the source if needed, and losing it costs nothing a later chapter depends on.
Budget: ${lo}-${hi} words of plain prose, newest material first. No style, no foreshadowing, no teasing.

━━ PART 3 · THE ANTI-DRIFT RULE (the rule this module exists for) ━━
Iterative summarization is lossy in one direction: each pass drops specifics and returns generalities, and once a specific is gone the next pass cannot know it is missing. Book-length summarization has been studied as two distinct prompting workflows — hierarchically merging chunk summaries, and incrementally updating a running summary (Chang, Lo, Goyal & Iyyer, "BooookScore", ICLR 2024, arXiv:2310.00785). Their reported trade-off is the reason this module is shaped the way it is: incremental updating scores LOWER on BooookScore (their coherence metric — the proportion of sentences carrying none of the error types they catalogue) but yields a HIGHER level of detail than hierarchical merging. Detail is exactly what continuity needs and coherence is exactly what a ledger does not need. So:
  RULE 1 — PART 1 is NEVER regenerated from the previous recap. Ledger lines are only ADDED, or EDITED by a chapter that shows the change on the page. A summary of a summary may not touch them.
  RULE 2 — PART 2 IS regenerated each chapter, but from PART 1 + the new chapter, never from the previous PART 2.
  RULE 3 — the CHAPTER STAMP is what makes RULE 1 auditable: any line can be re-checked against its source chapter without re-reading the book. A line with no stamp is not canon, it is a memory.
  RULE 4 — a contradiction is never silently resolved. If ch.31 says the knife is in the river and [ch.12] says she kept it, write BOTH stamped lines and mark them ⚠CONFLICT. The writer decides; the recap only reports.
Density technique for PART 2 ONLY: the Chain of Density prompt (Adams, Fabbri, Ladhak, Lehman & Elhadad, 2023, arXiv:2309.04269) rewrites a summary repeatedly at FIXED LENGTH, each pass fusing in missing salient entities. Use that move on PART 2 — hold the word budget, raise the entity count. Never use it on PART 1: PART 1 is not summarized at all.

━━ PART 4 · THE FIXED SHAPE (so ch.31's recap is comparable to ch.30's) ━━
Emit exactly this skeleton every time, same order, same headers, empty sections kept and marked "—". A recap whose shape changes cannot be diffed, and a recap that cannot be diffed hides what a chapter changed. This is the same reason a TV series bible is a standing document rather than a fresh memo per episode (the Star Trek: The Next Generation Writers'/Directors' Guide, Gerrold & Roddenberry, 1987, is the canonical published example), and the same reason the Story Grid Foolscap and its per-scene spreadsheet (Coyne) ask identical questions of every scene.

  STATE BLOCK — "${config.title}" — after ch.[N]
  §1 LEDGER (stamped, verbatim)   L1..L7 above, one line each entry
  §2 OPEN THREADS                 promise made [ch.N] → still unpaid → where it must land
  §3 DIGEST                       the compressible prose, within budget
  §4 DELTA vs ch.[N-1]            +added / ~changed / ⚠CONFLICT — this section is the whole point of the fixed shape
  §5 CANNOT VERIFY HERE           see PART 5

━━ PART 5 · HAND OFF — what a summary is structurally unable to check ━━
This module produces a summary. A summary cannot count, cannot compare spellings, and cannot prove absence. Bookisdom already does those deterministically, and this module MUST route to them instead of guessing:
  → Put §1 L1/L3/L6 into the DECLARED story bible, in the labelled sections parseCodex() reads — [CHARACTERS]/ตัวละคร, [PLACES]/สถานที่, [ITEMS]/สิ่งของ, [THREADS]/ปมค้าง, with the สถานะ / รู้แล้ว / ห้ามพูด trait lines. Bookisdom does NOT auto-extract entities from prose on purpose: undeclared means uncounted.
  → Then run codexAudit(codex, draft, lang), which returns re-derivable counts: present, variants (near-miss spellings — the L1 drift case), missing, statusConflicts (a character whose declared status is dead/หายตัว yet named in this chapter — the L3 case), forbiddenHits, threadsNoTrace (declared threads with no keyword trace in this chapter — the §2 case), canonSize.
  → For a multi-book series, analyzeSaga() reports per book: introduced / carried / dropped-vs-previous, plus the recurring backbone. "Dropped" is a signal to look at, not an error.
  Write into §5 only what those tools flagged, quoted as counts. Never write a continuity conclusion the recap itself reached.

━━ HONESTY RULES ━━
- The recap is evidence of WHAT WAS WRITTEN. It is not evidence that the book is consistent. Those are different claims and only the second one requires codexAudit.
- Never put a fact in §1 that the source text does not state. An inference belongs in §3 marked [INFERRED], never in the stamped ledger.
- Never resolve a contradiction to make the block tidy. ⚠CONFLICT stays until the writer rules on it.
- Abstractive rewriting can introduce content unsupported by the source (Maynez, Narayan, Bohnet & McDonald, "On Faithfulness and Factuality in Abstractive Summarization", ACL 2020). That is precisely why PART 1 is extractive and PART 2 is quarantined from it.
- Do not score anything. No continuity score, no 0-100, no x/10, no "how well the reader will remember". Those are judgments wearing a number. Counts and stamps only.
- If a chapter is missing and you are asked to recap over the gap, say the gap is there. Do not bridge it with plausible narrative.

═══ PRIOR STATE BLOCK ═══
[paste the previous STATE BLOCK, or "(none — this is ch.1)"]

═══ CHAPTER JUST FINISHED ═══
[paste the full chapter text — the SOURCE, not a summary of it]

═══ DECLARED STORY BIBLE (for the hand-off in PART 5) ═══
${config.storyBible ? config.storyBible : "[not declared yet — §5 will be empty until it is]"}`;
}

function moduleBrainstorm(config: BookConfig): string {
  const genre = config.subGenre ? config.subGenre.replace(/_/g, " ") : "(genre not set)";
  return `UNSTICK + GENERATE — name the KIND of stuck first, then run the one procedure that fits it. "Blocked" is not one condition. The blank-page fix does nothing for a mid-draft stall, and generating harder is the wrong move for a writer who already knows what happens. Diagnose, then generate.

Book: ${config.title || "(untitled)"} · ${config.type} · ${genre}
Premise / thesis: ${config.thesis || "[one line — what this book is]"}
Reader: ${config.reader || "[who this is for]"}
${config.outline ? "An outline is loaded — check any stall against it BEFORE inventing new material." : "No outline is loaded — if the diagnosis lands on B and the cause is structural, stop and run STRUCTURE instead."}

STEP 0 — DIAGNOSE (say which one you picked, in one line, before generating anything):
  A. BLANK PAGE — nothing exists yet; there is no draft to be stuck inside.
  B. MID-DRAFT STALL — it was moving, now the cursor sits still in a specific scene.
  C. SAMEY — ideas arrive fine, and they are all the same idea wearing different coats.
  D. KNOW-IT / CAN'T-WRITE-IT — the events are clear in your head; the prose will not come.
If the brief matches two, run them in order A→B→C→D and say why. If it matches none, say so and ask one question — do not run a procedure that does not fit.

──────────────────────────────────────────────────────────────
A. BLANK PAGE — build raw material before you ask for a story.
1. NOUN LIST, 10 minutes, no adjectives, no sentences: 20 concrete nouns from the writer's own life, fears and obsessions — places, objects, sounds, jobs, smells. (Bradbury's practice in "Zen in the Art of Writing": THE LAKE. THE NIGHT. THE CRICKETS. THE RAVINE. THE ATTIC. THE TRAPDOOR. He treated the lists as a warehouse, not as ideas.) A noun that embarrasses the writer stays on the list.
2. FORCED PAIRS: pair nouns that are FAR apart on the list (item 3 × item 17), never neighbours. Ten pairs, one line each on what story that pair implies. This is Boden's COMBINATIONAL creativity — unfamiliar combinations of familiar ideas — and it is the cheapest of the three kinds to run on demand.
3. CONSTRAINT CARD: impose one arbitrary external constraint and rewrite the three best pairs under it (Eno & Schmidt's Oblique Strategies, 1975 — 113 cards; the mechanic is an imposed constraint, not inspiration: "Honor thy error as a hidden intention", "Work at a different speed", "Use an old idea"). Invent constraints in that spirit; do not quote cards you cannot source.
4. Output: the 20 nouns, the 10 pairs, 3 constrained versions. Nothing is chosen yet — choosing this early is what empties the page.

B. MID-DRAFT STALL — the stall is usually a wrong turn, not a failure at the cursor.
1. WALK BACK THREE DECISIONS: list the last three choices the story actually made (who acted, who conceded, what got revealed). For each, write the ROAD NOT TAKEN in one line. Most stalls sit one to three scenes upstream of where the writing stopped — the page you cannot write is often the page after a scene that dodged its conflict.
2. SCENE WANT TEST: in one sentence — what does the POV character want in THIS scene, and who or what says no? If that sentence cannot be written, the problem is design, not prose: say so plainly and route to CONFLICT_MAP or STRUCTURE instead of generating.
3. RE-ENTER, DON'T RESTART: re-enter from the branch you named in step 1 — rewrite forward from that decision. Do not rewrite the opening.
4. SCHEDULE THE RETURN. Boice (1983, Behaviour Research and Therapy) followed three groups of nine blocked academic writers over ten weeks: the group held to scheduled, contingent writing produced the most pages AND recorded the most creative ideas; those who waited to feel inspired ("voluntary abstinence") recorded the fewest. Small study, academics not novelists — but it points one way: the schedule feeds the ideas, not the reverse.

C. SAMEY — this is fixation, and it is running in both of you.
1. QUARANTINE THE FIRST LIST: write down the ideas already generated, then BAN them. Jansson & Smith (Design Studies, 1991) gave designers an example solution containing an obvious flaw; the designers reproduced the flaw's features even after it was pointed out. Your own first list, and the model's first list, are that example.
2. GENERATE THREE INDEPENDENT PASSES BEFORE POOLING — each from a different framing (e.g. genre-native / opposite-genre / the antagonist's version), each written without looking at the others, and only then compare. This is borrowed by analogy from the nominal-group finding (Diehl & Stroebe, JPSP 1987): individuals generating separately and pooling afterwards out-produce a group generating together, mostly because taking turns blocks production. The transfer to one writer plus one model is an ANALOGY, not a measured result — say so if you cite it.
3. RUN THE SPREAD PROTOCOL BELOW, then keep going: the serial-order effect (Beaty & Silvia, 2012) is one of the more robust findings in idea generation — later responses in a session tend to be more original than earlier ones. The tenth idea is not the tired one; it is usually the reason you did the exercise.
4. LABEL EACH SURVIVING IDEA by Boden type — COMBINATIONAL (two familiar things joined), EXPLORATORY (a new corner of the same conceptual space), TRANSFORMATIONAL (a defining rule of the space is dropped or altered). If every survivor is exploratory, the sameness has not been broken yet.

D. KNOW-IT / CAN'T-WRITE-IT — this is a translating failure, not an idea failure.
Flower & Hayes (CCC, 1981) separate PLANNING, TRANSLATING and REVIEWING as recursive processes under a monitor. Here planning is done; translating is jammed, usually because reviewing is running on top of it.
1. STOP REVIEWING WHILE DRAFTING. Rose (CCC, 1980; think-aloud with ten UCLA undergraduates — small and qualitative, and it reads true) found blocked writers ran rigid rules and re-edited the opening mid-draft, while non-blockers held flexible plans. Ban editing the first paragraph until the scene is finished, out loud, as a rule for this sitting.
2. SHRINK THE UNIT: write only the first physical action, or one line of dialogue and its reply. One unit, then stop and look.
3. SUMMARY-THEN-CONVERT: write the scene as a flat five-sentence summary — this is allowed to be ugly — then convert one sentence at a time into scene. Ugly-on-purpose is the point; it removes the thing being blocked on.
4. CHANGE THE CHAIR: write 200 words of the same scene from another character's POV, or in a tense/person you will not keep. Throw it away and write the real one.

──────────────────────────────────────────────────────────────
THE SPREAD PROTOCOL (use whenever the ask is "give me options" — titles, twists, names, chapter angles, hooks, metaphors):
LLMs collapse to the middle of their own distribution. Zhang et al., 2025 (arXiv:2510.01171, "Verbalized Sampling") trace this to typicality bias in preference data — annotators favour familiar text — and give a prompt-only fix: ask for several responses WITH verbalized probabilities, and sample the tails. Their abstract reports 1.6–2.1x diversity gains on creative-writing tasks (the project's own repo advertises "2-3x" across all tasks; the two figures are not the same claim — treat both as author-reported and unreplicated).
1. Produce 5 options, each in its own block, each with the probability YOU would assign to producing it by default.
2. Then produce 3 more sampled from the TAILS — each with probability below 0.10 — that still satisfy every stated constraint.
3. No two of the 8 may share a central image, setting, or structural move. If you cannot reach 8 genuinely different, produce fewer and say the constraint set is too tight to spread.
4. At least one option must be TRANSFORMATIONAL (breaks a rule the premise assumed) and at least one must recombine two elements already inside this book.
5. Present the spread. Do not rank it. Name the trade-off each option buys and what it costs; the writer chooses.

IF TWO STRUCTURED PASSES BOTH FAIL — stop and incubate. Sio & Ormerod's meta-analysis (Psychological Bulletin, 2009; 117 studies) found a real but modest average incubation benefit (the effect size is not reproduced here: it reached me only through secondary sources, so it is not a number this module will print) — larger for divergent-thinking tasks, and larger when the break is filled with a LOW-demand activity (a walk, dishes) rather than another demanding task or nothing at all; a longer preparation phase before the break gave a bigger effect. So: incubation after real work is a documented aid, incubation instead of work is procrastination with a citation. Osborn's two original principles (Applied Imagination, 1953) still set the floor for every pass above — defer judgment, go for quantity.

HONESTY RULES — what NOT to fake:
- The verbalized probabilities are the model's self-report of how DEFAULT an option feels. They are not measurements, not quality, not reader preference. Never average them, never rank by them, never present them as evidence of anything else.
- No option gets a score, a x/10, a "commercial potential", a predicted read-through, or a guess at what readers will click. Bookisdom refuses those constructs by design (see REFUSED_CONSTRUCTS) — a number here would be a taste judgment wearing a lab coat.
- Never claim an idea is original or unprecedented; that is unverifiable. If an option resembles a work you can NAME, name it and let the writer decide.
- The four kinds of stuck are a routing heuristic, not a diagnosis. Do not tell a writer why they are blocked, and do not offer psychological or clinical explanations.
- Cite only what you can source. Do not invent Oblique Strategies cards, Bradbury list items, study numbers, or effect sizes. Where a finding is transferred by analogy (group brainstorming → one writer + one model), say "by analogy" in the output.
- If the brief is too thin to generate against, say what is missing and ask for it. Eight confident ideas for a book you invented are worse than one question.

═══ WHAT YOU ARE STUCK ON ═══
[Say which kind of stuck (A/B/C/D) if you know, then paste the scene, the brief, or the constraints]`;
}
function moduleAntiSafe(): string {
  return `Apply the ANTI-SAFE pass. LLMs default to emotionally safe, tidy, reassuring prose — break that while keeping the story coherent.

Rules:
- NO comforting/tidy ending, no "lesson learned" summary, no "everything got better".
- Raise the conflict: the character must lose or risk something real; every choice costs.
- Cut "theater": self-congratulation, melodrama, on-the-nose emotion, narrator moralizing.
- Ban AI-tell emotion clichés — show through specific action/body instead. Thai examples to remove:
  "น้ำตาไหลริน", "หัวใจบีบรัด/สลาย", "รอยยิ้มอบอุ่น", "ความรู้สึกท่วมท้น", "ใจหายวาบ".
- Ban STOCK AI NAMES AND FURNITURE — measured, not folklore: across 20,000 LLM-generated stories, 11 stock tokens (Elias, Elara, a lighthouse, a clockmaker...) appeared in 88.3% (arXiv:2605.26492); model outputs also cluster to near-identical responses at scale (NeurIPS 2025 "Artificial Hivemind"). If a name or setting feels like the model's first instinct, it is — demand the third or fourth alternative, or a Thai-specific one.
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

function moduleQuietScene(): string {
  return `Write (or rewrite) a QUIET SCENE — a scene that communicates almost entirely without dialogue: through voice quality, distance, timing, and presence. This is scene-level execution; pair with "Attachment & Repair Arc" for the relationship design behind it.

PROSODY AS SIGNAL (voice quality speaks before words do):
1. BASELINE COMPARISON — the strongest device: describe how the voice differs from THIS character's normal ("slower than his ward-round voice"), not generic prettiness.
2. SLOWNESS + PAUSES — a held beat before answering reads as control, care, or fragility depending on context.
3. PITCH/VOLUME DROP — lower and softer (not whispering) = armor coming down.
4. UNNATURAL FLATNESS — a voice with no rise and fall reads as either a wall or a shutdown; let context decide which.
5. MISMATCH — words say "I understand", the voice is too fast and tight: instant subtext.
6. DELAYED SHIFT — the voice holds steady through the scene and only cracks after the other person leaves. The armor outlasting the moment IS the story.
AVOID: "trembling voice" on repeat; emotion adjectives glued to voice ("angry voice", "sad voice"); voices described as beautiful.

CO-REGULATION, STAGED (one calm nervous system steadies another — 5 beats):
1. show A dysregulated (wired or shut down) → 2. B arrives CALM, no announcement → 3. small sensory contact: voice rhythm, steady presence, a placed object (a glass of water set down says "I'm here") — NOT touch-first → 4. no rushing, no fixing, no interrogating → 5. ONE small body shift shows it landed: a longer exhale, shoulders dropping a centimetre, reaching for the glass.
WHAT KILLS IT: comfort speeches; demanding they talk; heavy touch too early (especially with an avoidant); healed-within-one-scene; "everything will be fine" without the weight of staying.

NONVERBAL CHANNELS BEYOND THE BODY:
- DISTANCE — half a step closer or further is a sentence; keeping respectful distance can say more than approaching.
- TIMING — answering slowly, staying longer than duty requires, the pause before a door closes.
- TOUCH AVOIDED — handing something over so fingers don't meet is communication, not absence of it.
- OBJECTS — a coat draped on a chair, coffee left on a desk: presence that asks for nothing back.

QUIET REPAIR (after a rupture, minimal words):
- the one who WITHDREW returns first — making the other chase re-runs the pursue-withdraw loop;
- name the impact, not the excuse ("my pulling away made this hard for you", not "I didn't mean it");
- separate behavior from identity ("you went distant" not "you're cold");
- then STAY, without demanding a response. One repair scene never finishes the job — repairs repeat.

RULES FOR THE SCENE: dialogue budget ≤ 5 short lines; silence is a communication channel, not missing dialogue; end on a SMALL shift, not a resolution.

Output: the quiet scene (or rewrite) + a 2-line margin note naming which prosody device and which co-regulation beat carried it.

═══ SCENE / SITUATION TO WORK ON ═══
[paste the scene, or describe who is dysregulated and who shows up]`;
}

function modulePsychArc(): string {
  return `Design (or audit) a relationship arc using ATTACHMENT PSYCHOLOGY — real frameworks (Bowlby/Ainsworth attachment styles; Hazan & Shaver's adult-romance extension; "earned security" from adult-attachment research), used as behavior PREDICTORS, never as diagnosis labels pasted on characters.

ATTACHMENT AS A BEHAVIOR ENGINE (pick per lead; predicts what they do when closeness increases):
- SECURE — can be close without losing self. Rare in drama leads; common in the "safe base" side character.
- ANXIOUS — reads tiny signals as rejection; needs reassurance but fears being a burden. Tells: over-interprets a short reply, waits by the phone, asks twice about small things.
- AVOIDANT — distance = safety; work/professionalism as armor. Tells: goes formal when it gets personal, finds a duty reason to leave, works harder after a close moment.
- FEARFUL-AVOIDANT — wants closeness AND fears it: approach → panic → push away → regret. The hot-cold cycle that fuels (and can cheapen) slow burn.
PAIRING NOTE: avoidant × anxious creates the pursue-withdraw loop automatically — you don't need external obstacles every episode; the loop IS the obstacle.

THE EARNED-SECURITY ARC (the believable healing path — for an avoidant lead):
1. retreats when close (baseline) → 2. retreats, then feels the emptiness → 3. stays slightly longer than last time → 4. is seen at their weakest and is NOT punished for it → 5. tolerates closeness without fleeing — with RELAPSES between every stage.
HARD RULES: no heal-by-kiss; no single big event that fixes everything; an avoidant who narrates their childhood wound fluently in episode 3 has broken character. Change is slow, quiet, and relapsing. Guilt ABOUT feeling (“I shouldn't feel this on duty”) usually outweighs the feeling itself — write the guilt.

REPAIR SCENE TYPES (each is a scene you can actually stage):
- CORRECTIVE EXPERIENCE — the old expectation is violated: they push, the other person neither leaves nor retaliates. Must happen under real emotion, not as a calm conversation.
- CO-REGULATION — someone stays present through the storm without fixing, rushing, or interrogating. A quiet scene where presence does the work words can't.
- MENTALIZATION BEAT — the character catches their own pattern mid-motion ("I'm about to walk away again — because I'm scared"), and for once chooses differently. Use sparingly; earning this beat takes chapters.

NERVOUS-SYSTEM STATES AS BODY-LANGUAGE GROUND (a writing lens from polyvagal-informed therapy — note honestly: its neuroscience claims are contested; use it as craft vocabulary, not medical fact):
- SAFE/CONNECTED: shoulders drop, voice has rhythm, eye contact easy, breath low and slow.
- FIGHT/FLIGHT: jaw tight, shallow breath, clipped speech, fingers restless, weight shifts back.
- SHUTDOWN: flat voice, delayed answers, empty gaze, minimal movement — the after-shift collapse of someone who was iron all day.
High-pressure professionals oscillate: fight/flight on duty → shutdown alone afterward. That oscillation IS the character.

Output: per lead — attachment pattern + 3 in-scene tells; the arc's current stage (1–5) and the next relapse; ONE repair scene staged concretely (type, trigger, what the other person does NOT do); and which nervous-system state each key scene starts and ends in.

═══ LEADS + RELATIONSHIP PREMISE ═══
[paste your leads and where the relationship currently stands]`;
}

function moduleHookCraft(): string {
  return `Fix a chapter ENDING (or write one) using the emotional-hook craft of serial fiction — the ending is what makes a reader open the next episode.

HOOK TYPES (pick what fits — hybrid is strongest):
1. UNRESOLVED EMOTION — a feeling that never gets released: wants to speak, can't.
2. QUIET REVELATION — a realization that presses down slowly instead of exploding.
3. EMOTIONAL IRONY — the character does the opposite of what they feel ("rest well," says the man who just ordered her a double shift).
4. QUESTION OF THE HEART — end on an unanswerable inner question.
5. PHYSICAL ECHO — the body carries what was never said (a warm shoulder, a cold hand).
HYBRID — small external event + emotional reaction + unresolved residue.

MID-CHAPTER ACT-OUTS (from TV act-break craft): long chapters deserve 1-2 internal cliffs — end a scene/section on a question the next section must answer. TV writers plan act-outs before anything else because the break determines the trajectory of everything preceding it.

WHAT THE SCIENCE ACTUALLY SUPPORTS (each verified with replication status):
- CURIOSITY IS AN INFORMATION GAP (Loewenstein 1994; Kang et al. 2009): curiosity peaks at PARTIAL knowledge — an inverted-U. Zero knowledge produces zero curiosity. So a hook GIVES information to open a gap; pure withholding is the amateur version.
- CARING BEFORE DANGER (disposition theory, Zillmann): suspense = fear for a LIKED character. Danger to someone the reader hasn't invested in is noise, not tension.
- SUSPENSE SURVIVES SPOILERS (Gerrig's anomalous suspense): readers feel suspense on rereads and even about known history — so foreshadowing and partial reveals are far safer than intuition says.
- HONESTY CORRECTION: the popular claim that cliffhangers work because "unfinished tasks are remembered better" (Zeigarnik) FAILED a 2025 meta-analysis — do not teach it. What survives is the urge to RESUME an interrupted activity (Ovsiankina) — which is the better model of a cliffhanger anyway: the goal is not that they remember, it's that they come back.

RESTRAINT CRAFT (the engine of all of the above):
- WHAT THEY DON'T DO beats what they do: skipping a nightly habit says more than a stare.
- THE ALMOST MOMENT — nearly speaks, nearly touches, then stops. The closer to the act, the harder the stop lands.
- BODY BETRAYS LAST — steady hands during the crisis; a tremor opening a water bottle after. Extremities leak first (fingers, shoulders), the face last.
- FORMALITY AS A TELL — the more controlled a character feels, the more official their speech gets.
- MICRO-CONFLICT — wants to ask / doesn't dare; wants closeness / keeps distance. Small frictions, repeated, out-tension big events in slow-burn.
- FRACTURED ACTION — a completed gesture states; an interrupted one implies. "Closed the door but didn't lock it" outlives "locked the door and left." Put one tiny bodily beat at the break point (a hand resting on the knob half a beat too long) — that half-beat outguns any line of dialogue.
- RESIDUAL-SPACE CLOSE — end on what's LEFT, character already out of frame: the ring still under the cup, the light through the door gap, the ash the wind takes. An unfinished THING beats an unanswered QUESTION — objects keep resonating in the reader; questions just wait. (The load-bearing rule is Hemingway's theory of omission, Death in the Afternoon, 1932: you may omit only what you KNOW — knowledge-backed subtraction is felt "as strongly as though the writer had stated" it; omitting from ignorance leaves "hollow places.")

CONTRASTIVE EXAMPLE:
  ✗ "She felt very sad. She didn't know what to do."
  ✓ "She sat down on the cold steel chair, the lab report still crushed in her fist. She knew she should stand up and find him — but right now even standing felt like too much."

REALISM RULES: tired professionals talk less, not prettier — cut poetic similes; use small occupational habits (re-sorting an already-sorted file, over-washing hands past protocol); silence and hesitation over heavy lines; a quiet ending is allowed when CHOSEN — say so in a margin note.

Output: the rewritten ending (last 3–8 lines) + one margin note naming which hook type and restraint device you used and why.

═══ CHAPTER ENDING (or scene) TO WORK ON ═══
[paste the ending here]`;
}

function moduleImmersion(): string {
  return `Rewrite a scene to pull the reader INSIDE the POV character's experience (deep POV / "transportation"). Keep plot, facts, and dialogue meaning — change how close we are, not what happens.

PSYCHIC DISTANCE (Gardner, The Art of Fiction, 1983 — the ladder this whole module climbs):
  L1 "It was winter of the year 1853. A large man stepped out of a doorway."
  L2 "Henry J. Warburton had never much cared for snowstorms."
  L3 "Henry hated snowstorms."
  L4 "God how he hated these damn snowstorms."
  L5 "Snow. Under your collar, down inside your shoes, freezing and plugging up your miserable soul..."
  Rule: SLIDE between levels, never jump (L1→L4 in one line reads amateur); open scenes wide (L1-2), go deepest (L4-5) at peak emotion, pull back to transition. What research can add (van Laer et al. 2014, meta of 76 studies): the three measured pull-the-reader-in levers are identifiable characters, an imaginable plot, and verisimilitude — exactly what the steps below build.

Do all five:
1. GROUND FAST — within the first 2-3 sentences, anchor the reader in place/body/moment with one concrete, specific detail (not a weather-report or throat-clear opening).
2. CUT THE FILTER — remove distancing verbs (saw / heard / felt / noticed / realized / could see) and render the perception directly. "She heard the door creak" → "The door creaked."
3. INTERIORITY — add the POV character's in-the-moment reaction (thought / bodily sensation / judgement) so we experience the scene as they do — but SHOW it, don't name the emotion.
4. ONE OPEN LOOP — plant or sharpen a single unanswered question the reader now wants closed (an information gap), without withholding cheaply.
5. FORWARD PULL — end on momentum (a turn, a new question, an unfinished action), not a tidy button.

Rules: no purple prose or cliché sensory filler; every added detail must do double duty (mood / character / theme). Do not add events that aren't implied by the draft.

CONVERSION DRILL — for every line that NAMES an emotion ("she felt betrayed"), rewrite it as a behavior chain: 3-5 concrete actions + one prop + the setting doing work ("She took the couple photo from her wallet, tore it in two, and laid the halves on his side of the table"). The chain must read AS the emotion without the label. This move has a century of scholarship behind it: T.S. Eliot's OBJECTIVE CORRELATIVE (1919) — "a set of objects, a situation, a chain of events which shall be the formula of that particular emotion... such that when the external facts are given, the emotion is immediately evoked." Modern duanju conversion courses teach the same move as prose writers' #1 deficit.
PROP DISCIPLINE — one object, three appearances, changed each time, detonating once. A tracked prop carries what narration would over-explain (Chekhov's gun — his own 1889 letters: "one must never place a loaded rifle on the stage if it isn't going to go off" — × rule of three). The final change should be IRREVERSIBLE — burned, torn, mailed away, poured down the drain — because the moment of no return IS the emotional beat; a reversible change is just handling the prop.
KEEP THE HOME ADVANTAGE — interiority is what prose has that the screen doesn't (adaptation scholarship). This drill targets lines where naming REPLACED showing; it is not a ban on inner life. Convert the weakest told lines, keep the interiority that earns its place.

Output: the rewritten scene, then a 3-5 line changelog naming each filter word cut and each loop opened.

═══ DRAFT ═══
[INSERT SCENE HERE]`;
}

function moduleTranslate(): string {
  return `Translate the SOURCE passage faithfully into the target language. You are a translator, not a co-author — render what is on the page, and nothing that isn't.

═══ CANON (master lorebook — obey before translating) ═══
[PASTE your world's fixed rules: setting, power system, factions, tone. Examples:]
- The power system is called "Taba" — NEVER render it as magic / mana / qi / chi.
- Keep the technology grounded sci-fi, not fantasy magic.
- Coined terms and proper nouns keep their exact spelling AND capitalisation.

═══ TERMINOLOGY MAP (lock these — do not substitute a synonym) ═══
[source term] → [required rendering]   e.g.  ตบะ → Taba (always capitalised) · ฤๅษี → Hermit (operative, not monk)

═══ HARD CONSTRAINTS (negative prompting — obey literally) ═══
- DO NOT add actions, feelings, or inner monologue that are not in the source.
- DO NOT hallucinate or fill blanks — if the source is terse, the translation stays terse.
- DO NOT summarise or expand — keep the exact pacing and every paragraph break 1:1.
- DO NOT reach for generic Western-fantasy phrasing.

═══ METHOD ═══
Work 2-3 short paragraphs at a time (micro-chunking) so nothing drifts to the "average". Output ONLY the translation — no notes, no summary.

═══ SOURCE PASSAGE ═══
[INSERT SOURCE TEXT HERE]`;
}

function moduleHardSF(): string {
  return `HARD-SF CONSTRAINT PASS — audit a science-fiction premise against physics that does not negotiate, then mine each constraint for the drama it generates. The thesis: a constraint is not a cage, it is the story's engine. (Same logic as Sanderson's Second Law in WORLD_CODEX — limitations are more interesting than powers.)

THE SEVEN THAT DON'T BEND (state which ones your story obeys, and name every one you break ON PURPOSE):
1. NO FTL. Travel time = distance / speed. Accelerating mass to c needs infinite energy (E = mc²/√(1-v²/c²)). Drama: a 40-light-year trip means everyone you knew is dead when you arrive — the journey itself is the loss.
2. NO FTL SIGNAL. Messages travel at c, EACH WAY. Drama: an order from home is already old when it arrives; "hello" costs twice the distance in years. Obey a command that was issued before you were born?
3. THE ROCKET EQUATION IS EXPONENTIAL. Δv = vₑ·ln(m₀/m_f). Doubling target speed does not double fuel — it can multiply it hundreds of times, which is why realistic interstellar ships are mostly tank. Drama: the mission is one-way not by choice but by arithmetic.
4. RADIATION IS A CHARACTER. Deep space runs roughly a thousand times Earth's background rate; shielding is counted in mass-per-area (g/cm²), and hydrogen-rich material (water, polyethylene) beats lead — heavy elements shower secondary particles. Water shielding is also drinking water: a hull breach forces "shield or drink." Drama: every gram of protection is a gram of fuel you cannot spend.
5. DOSE HAS BANDS, NOT A DIAL. Acute exposure is a staircase: mild sickness → a survivable-but-brutal middle (weeks of marrow failure, infection, hair loss) → near-certain death. The gift to a writer is the LATENT PHASE: hours to days where the patient feels FINE while the damage is already done. Nobody has to be told they are dying; the reader knows first.
6. TIME DILATION IS REAL BUT LAZY. γ = 1/√(1-v²/c²) barely moves below ~0.3c — at a tenth of light speed a 400-year voyage differs from home time by about two years. Drama: it is NOT the escape hatch films pretend. Two years is still enough for a government to fall, a war to start, or the mission to be forgotten.
7. PROBABILITY COMPOUNDS. A 3% failure per cold-sleep cycle over 200 cycles is not 6% total — survival is 0.97²⁰⁰ ≈ 0.2%. Any repeated-risk system must be modelled multiplicatively or the body count is fiction twice over. Drama: the math forces the captain to choose who sleeps.

METHOD:
A. Classify the story: ULTRA-HARD (no miracles) / HARD (one named miracle, everything else obeys) / SOFT (rule-of-cool). All three are legitimate — an unstated choice is what breaks trust.
B. List every miracle you keep. One is a genre convention; three is fantasy wearing a spacesuit.
C. For each constraint the story DOES obey, write the scene it forces. Constraint → cost → choice → scene.
D. Flag numbers that must stay consistent (travel time, dose, fuel, delay) and put them in the story codex so later chapters cannot contradict them.

HONESTY RULES FOR REAL SCIENCE IN FICTION:
- Real systems get real names and real limits; where you extrapolate, SAY SO in the codex, not to the reader mid-scene.
- Real places carry real uncertainty: TRAPPIST-1 (39.6 ly, ultracool red dwarf, seven planets) is real and flare-prone — but whether those planets kept atmospheres is contested, not settled. Write the planet you need; record in the codex that its air is your invention.
- Never invent a citation, a dose figure, or a survival percentage to sound rigorous. A number a reader can check is worth ten that merely sound precise.

Output: the constraint audit (which of the seven bind, which you break and why), the miracle list, one forced-scene per binding constraint, and the consistency table for the codex.

═══ PREMISE / WORLD NOTES ═══
[paste the sci-fi premise here]`;
}

function moduleThaiSound(): string {
  return `THAI SOUND PASS — tune the SOUND layer of Thai prose: the rhythm and euphony devices Thai has that English craft books never cover. Return the revised passage + a short device log.

PROVENANCE, stated honestly: Thai scholarship codifies this layer DESCRIPTIVELY (Kamchai Thonglor's classic grammar separates คำซ้อนเพื่อเสียง "euphonic doubling" from meaning-doubling; บรรทัดฐานภาษาไทย vol.4 codifies the register system; Chula stylistics theses analyze the poetic prose of Angkhan Kalayanapong) — but no prescriptive how-to manual exists. This module is a FIRST prescriptive codification built on those named sources; the craft rules are ours and are marked as such.

Devices to apply (sparingly — sound serves sense):
1. คำซ้อนเพื่อเสียง as a RHYTHM tool — euphonic pairs (ท้อแท้ อ้างว้าง แร้นแค้น เปล่าเปลี่ยว) slow and soften a line; use at emotional rests, cut them where pace must run. One per sentence maximum.
2. สัมผัสใน (internal rhyme/alliteration) in prose — reserve for PEAK moments (a death, a vow, an ending line); more than ~one audible chime per paragraph turns prose into verse and breaks transportation.
3. คำซ้ำ (reduplication) for texture and aspect (เดินช้า ๆ, ใจเต้นตึก ๆ) — sound-mimetic doubles ground the body in the scene; stacked doubles read childish.
4. REGISTER AS INSTRUMENT (base: the official 5-level system, พิธีการ→กันเอง): narration usually holds one register; dialogue moves per character and per pressure — a character shifting UP in formality under emotion is a tell (same device as HOOK_CRAFT's formality tell, now at the language-level Thai actually marks).
5. THE READ-ALOUD TEST (Le Guin's doctrine crosses languages: "The test of a sentence is, Does it sound right?"): read the passage aloud; wherever breath breaks mid-clause or two stressed syllables collide, rewrite that seam.

Output: revised passage · device log (which device, where, why) · one line naming any place you REMOVED sound-play because it out-sang the scene.

═══ THAI PASSAGE ═══
[วางร้อยแก้วภาษาไทยที่นี่]`;
}

function moduleSceneArt(config: BookConfig): string {
  return `Turn a scene into a ready-to-paste IMAGE PROMPT (for Midjourney / SD / DALL·E — you run the image tool). Draw only from what the scene states; do not invent characters or objects that aren't there.

Genre/tone: ${config.subGenre ? config.subGenre.replace(/_/g, " ") : "(set the genre)"}

Produce, for the scene below:
1. STYLE — one line (e.g. "anime key visual", "cinematic concept art"), fixed for the book so every illustration matches.
2. SUBJECT — the character(s) present, their exact look from the story bible (hair, clothes, signature item), and their action in this moment.
3. SETTING — place, time of day, weather, key props — grounded in the scene.
4. MOOD & LIGHT — the emotional colour + light source (matches the scene's tone).
5. COMPOSITION — shot type + framing (close-up / wide / over-shoulder).
6. NEGATIVE PROMPT — what to exclude (extra characters, text, watermark, wrong era).

PROMPT ORDER (Subject → Action → Environment → Cinematography → Quality & Style): lead with the concrete subject and what it is doing, then place it, then the camera, then finishing terms — a prompt ordered this way steers image models far better than a mood-word pile.

SPECULATIVE-AESTHETIC PALETTE — a genre word alone ("futuristic city") is too broad to steer a model; name the SUB-aesthetic and use its visual language:
- Cyberpunk (high tech, low life): neon, rain, holograms, megacity
- Solarpunk (green optimism): vertical gardens, solar architecture, clean tech
- Steampunk (Victorian machine-age): brass, gears, steam, airships
- Dieselpunk (20th-c industrial retro-future): steel, diesel, factories, art deco
- Biopunk (organic tech): genetics, labs, bioengineering
- Space opera (epic scale): starships, galaxies, alien civilizations
- Futuristic-sleek (no conflict implied): minimal smart-tech cityscapes
- Post-apocalyptic (after the fall): ruins, reclaimed nature, survival
- Classic sci-fi: AI, robots, space, advanced technology
Pick ONE and lock it into STYLE for the whole book — mixing palettes across illustrations is how a book's art stops looking like one book.

Output one paragraph prompt + a separate negative line. Keep character looks consistent with earlier scenes — reuse the same descriptors.

═══ SCENE ═══
[INSERT SCENE TEXT HERE]`;
}

function moduleCharChat(): string {
  return `Build a SYSTEM PROMPT that lets a reader chat with one character IN-WORLD — staying on canon, in voice, without breaking the story. Use ONLY established facts; never invent backstory that contradicts the book.

Fill from the character bible:
- IDENTITY — name, role, age/status at the current point in the story.
- VOICE — how they speak (register, verbal tics, what they never say). Match their dialogue in the book.
- KNOWLEDGE BOUNDARY — what they know NOW vs. later reveals they must NOT spoil.
- GOALS & WOUND — what drives them; what they hide.
- GUARDRAILS — stay in character and in-world; deflect out-of-world questions in character; never dump plot spoilers; if asked something the character couldn't know, react as the character would.

Output the system prompt as a single block the writer can paste into their own LLM (BYO-key) to run the chat.

═══ CHARACTER BIBLE ═══
[PASTE the character's sheet — or run VOICE_SHEET / CHAR_ARC first]`;
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
  const fiction = config.type === "novel" || config.type === "memoir" || config.type === "kids";
  const sourced = config.type === "nonfiction" || config.type === "textbook" || config.type === "howto";
  const targetWords = config.chapters * config.wordsPerChapter;
  return `PRE-PUBLICATION GATE for "${config.title}" — declared shape: ${config.chapters} chapters × ${config.wordsPerChapter} words ≈ ${targetWords} total.

WHAT THIS IS. A pre-flight check, run last, over things that are COUNTABLE or VERIFIABLE. Every check states three things: WHAT WAS COUNTED · the THRESHOLD THE AUTHOR DECLARED · PASS or FAIL.
A FAIL must name its location — chapter number, file, heading or quoted line. No location, no FAIL.
A check whose threshold the author never declared is reported "no threshold declared — not judged": never quietly passed, and never given a number by you.

WHAT THIS IS NOT — the editing-stage ladder this gate does not replace. Editors Canada's Professional Editorial Standards define four stages, in order from the content's first iteration to its last:
  STRUCTURAL — shaping the overall organization and content for the intended audience, medium and purpose. Catches: wrong order, a hole in the argument, a subplot that goes nowhere.
  STYLISTIC — clarifying meaning, and coherence and flow at paragraph and sentence level.
  COPY EDITING — spelling, usage, grammar, punctuation, and consistency within the text.
  PROOFREADING — all elements of content and formatting checked for correctness, completeness and adherence to the style guide. The CIEP puts it the same way: the final surface-level check.
This gate is NONE of the four. It runs AFTER them and catches what a human eye reliably misses: a broken file, a missing metadata field, a chapter that never got pasted in, a character the codex says died in ch.5 who speaks in ch.30.
If those stages have not happened, say so at the top of the report — a clean gate must never be allowed to imply an edited book.

STEP 0 — COLLECT THE DECLARATIONS, before checking anything: chapter count (${config.chapters}) · words per chapter (${config.wordsPerChapter}) · acceptable deviation · ${sourced ? `citation style (${config.citationStyle}) and whether every claim needs a source` : "the canon (story bible / codex) that is the source of truth"} · the front/back-matter list · output format (EPUB / print PDF / both) · the retail metadata fields.
${config.storyBible ? "A story bible/codex IS supplied — treat it as the canon of record." : "NO story bible/codex is supplied — the canon checks below cannot run. Report them NOT RUN, never passed."}
A missing declaration makes its check NOT RUN. Never supply the missing threshold yourself.

═══ PART 1 · HARD BLOCKERS — the only things this gate may DECIDE ═══
These break distribution or are objectively wrong. Each is PASS or FAIL: no discussion, no weighting, no partial credit.

B1 · FILE VALIDITY (if an EPUB ships). Run EPUBCheck — the official conformance checker for EPUB publications, maintained by the DAISY Consortium on behalf of W3C; EPUB 3 files are validated against EPUB 3.3.
  Severities it emits: FATAL · ERROR · WARNING · INFO · USAGE. Any FATAL or ERROR = FAIL, quoting the message id and the file it names. WARNING/USAGE = report only, never blocking.
  State the EPUBCheck version used. If it was not actually run, this check is NOT RUN — never assert a clean validation you did not see.

B2 · REQUIRED METADATA. EPUB 3.3 package-document minimum: dc:title, dc:identifier and dc:language, plus exactly one dcterms:modified of the form YYYY-MM-DDThh:mm:ssZ (UTC, "Z"-terminated), with the package's unique-identifier attribute pointing at that dc:identifier.
  Each present = PASS; absent = FAIL naming the element. Run this even on a file Bookisdom itself built — a builder can omit a required field, and the gate's job is to catch that.
  Retail metadata: the published field limits Bookisdom already encodes in kdpMetadataChecks() — title ≤ 200 chars · description 100–4,000 · ≤ 7 keywords of ≤ 50 chars · 1–3 categories. Report counted length vs limit per field.
  Each format sold (paperback / hardcover / ebook) is a separate product and needs its OWN ISBN; one ISBN reused across two formats = FAIL.

B3 · COMPLETENESS. Chapters present vs the declared ${config.chapters} — mismatch = FAIL, naming the missing numbers. Nav/TOC entries vs chapter files must be 1:1: an entry pointing at nothing, or a chapter absent from the TOC, = FAIL, name it.
  Leftover placeholders — [TBD] · [INSERT · [VERIFY] · TODO · XXX · lorem — are a literal string count; each hit = FAIL with chapter and quoted line.
  Front/back matter: everything on the author's declared list must be present (declared-but-absent = FAIL). Conventional order (Chicago) runs half title → title page → copyright page → dedication → epigraph → contents → foreword → preface → acknowledgments → introduction; back: appendix → notes → glossary → bibliography → index.
  Present-but-out-of-order = REPORT, not FAIL: order is convention, and this gate does not fail a book on convention.

B4 · CANON CONTRADICTIONS — orchestrate Bookisdom's deterministic analyzers instead of re-reading by eye.
  codexAudit() → statusConflicts (an entity whose declared status is dead/หายตัว yet appears in the draft: FAIL unless the author marks that scene a flashback) · variants (a declared name spelled a second way: FAIL, print both spellings) · forbiddenHits (a word a character must never say, with its count — the tool cannot attribute a speaker, so the author confirms who said it) · present/missing canon · threadsNoTrace (a high/critical open thread with no keyword trace).
  continuityRadar() → canon names that never appear, plus off-canon names used ≥3×. consistencyLedger() → spelling-variant clusters and introduced-then-dropped terms, with chapter numbers.
  A mutually exclusive PAIR of facts (two ages, two dates, two deaths for one person) = FAIL, and you must quote both halves. A one-sided heuristic flag is NOT a blocker — send it to Part 2.

B5 · PRINT SPEC (if print ships). kdpReadiness() computes pages from word count and trim, spine width (pages ÷ PPI), the cover canvas including 0.125" bleed, and the binding minimum: 24 pages paperback, 75 hardcover. Under the minimum = FAIL.
  Everything else here is an ESTIMATE — label it as one and confirm it in the vendor previewer; a print-ready CMYK interior cannot be produced or verified in a browser.

B6 · RIGHTS. Count unresolved permission markers on quoted lyrics/poetry/long excerpts and third-party images. Unresolved = FAIL. You may count the markers; you may NOT rule on fair use — say so in the report.
${sourced ? `
B7 · SOURCES. Every citation must resolve to a complete entry in ${config.citationStyle} form; a citation with no matching entry, or an entry naming no locatable source, = FAIL with the claim quoted. An unsupported claim is a [VERIFY] under B3, not a blocker — and never invent a source to close one.
` : ""}
═══ PART 2 · AUTHOR JUDGMENT — this gate may only MEASURE ═══
Pacing, voice, impact and "is it good" have no valid operation on the text, so the gate cannot decide them. Report the measurement, name the instrument, hand the decision back. Never turn one into a verdict, never average them into anything.
- pacingProfile() — per-act averages of words / dialogue ratio / telling / sensory, plus its disclosed threshold flags.
- characterArc() — per-chapter mention series per character, gaps (vanishes then returns), exitsEarly.
- motifTracker() — per-chapter distribution of each declared theme term, and the longest absent run.
${fiction ? "- hookSignal() — which ending devices are PRESENT in each chapter's tail (question / ellipsis / tension lexicon). Presence, never strength: a quiet ending can be deliberate.\n" : ""}- analyzeOpeners() — repeated sentence/clause openers: the count and the share of units.
- sensoryDensity() — per-sense counts, density per 1,000 words, and which senses were never used.
- ${thai ? "analyzeThai()" : "analyzeProse()"} — rhythm cv, telling ratio, dialogue ratio, echoes/near-repeats, AI-cliché lexicon hits, and exact mechanical counts (double spaces, repeated words).${thai ? "\n- checkThaiRegister() — loanword/informal spellings with a standard-form suggestion; proper nouns are skipped, so a coined name is never \"wrong\"." : ""}
- excessVocabulary() — runs only if the author supplies a baseline corpus; without two corpora it is NOT RUN.
- Word count: measured total vs the declared ≈ ${targetWords}; report the deviation as a number. It is a FAIL only where the author declared a hard cap (a platform or publisher limit); otherwise it is a measurement.

═══ OUTPUT ═══
1. STATUS: BLOCKED (n hard blockers) or CLEARED-OF-BLOCKERS — nothing else. "Cleared of blockers" means every Part-1 check passed; it is not an opinion that the book is ready.
2. BLOCKER TABLE: check id · what was counted · the author's threshold · PASS/FAIL · location.
3. MEASUREMENTS: each Part-2 signal with its number and its instrument, unjudged.
4. NOT RUN: every check that lacked an input or a declared threshold, and what is missing.
5. OUT OF SCOPE, stated plainly: whether the prose is good, whether the four editing stages were done well, whether the facts are true, whether the rights are legally clear, and how readers will respond.

HONESTY RULES:
- No readiness score. No "publication-ready %". No x/10, no 0–100, no letter grade, no predicted read-through, no projected rating — not even "roughly". If asked for one, refuse and return the blocker count plus the failing locations.
- Why a number here would be WORSE than useless: the whole value of this gate is that every finding is LOCATED and fixable ("ch.12 has no dc:language"; "อรุณ dies in ch.5 and speaks in ch.30"). A score deletes the location, cannot be re-derived from the manuscript, and drifts run to run — it measures the judge, not the book.
  Worse, it converts a hard blocker into a rounding error: "94% ready" reads as permission to skip the 6% that is the EPUB that will not open. And once a number exists someone optimizes it, which optimizes the guess instead of the book.
- Never claim a check ran that did not run. EPUBCheck, the print previewer and legal review are outside this prompt; NOT RUN is a valid and required answer.
- Never invent a chapter number, line, message id, page count or ISBN to make a finding look precise. Quote what is in the text, or report that you could not locate it.
- Heuristics stay labelled heuristic: passive-voice detection, off-canon tokens, threadsNoTrace and Thai segmentation can all mis-fire. Say "review this", never "this is wrong".

═══ MATERIAL TO CHECK ═══
[PASTE the manuscript or assembled book, plus: the codex/story bible · the front/back-matter list · the metadata fields · the EPUBCheck output if you have it]`;
}
function moduleSeriesBible(config: BookConfig): string {
  return `Build and maintain a SERIES BIBLE for "${config.title}" — the canon ledger that keeps a multi-book series consistent ACROSS volumes, not just across chapters.

Maintain these sections (cite the book where each fact was established):
- SERIES ARC — the overarching question/throughline, and where each book sits on it.
- CHARACTER LEDGER — per character: current age/status, what changed in each book, abilities/resources (watch for unexplained POWER CREEP), key relationships, secrets, and their end-state at the close of each book.
- WORLD CANON — rules and their LIMITS, locations, factions, tech/magic — each tagged with the book it was established in.
- TIMELINE — absolute chronology across books; flag any date/age contradiction between volumes.
- REVEAL TRACKER — what the READER knows vs what each CHARACTER knows, per book (so you can manage dramatic irony and avoid re-revealing).
- OPEN THREADS — unresolved questions and planted foreshadowing, each tagged with the book it was planted in and the book it's promised to pay off in.
- CONTINUITY RULES — canonical name spellings and established facts that must not change.

Then run a SERIES CONTINUITY CHECK for the book in progress: list any new fact that contradicts the canon (cite the conflicting entries), any open thread that should pay off in this book, and any setup this book must plant for later volumes.

Output the UPDATED bible, then the continuity check. Never invent canon — if a fact isn't in the source material, mark it [TBD] rather than guessing.

═══ SERIES MATERIAL (prior synopses / existing bible / book in progress) ═══
[INSERT SERIES MATERIAL HERE]`;
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
- Close with a FINDINGS TALLY, never a score: count the findings by severity (high/med/low) and by type. The tally is re-derivable — anyone can recount it from the list above. A 0-100 number is not.
- Do NOT emit any 0-100 score, x/10 rating, or "overall" figure, even one you show the arithmetic for. Deriving "-10 per high-severity" from findings does not make the result a measurement: the severities were judgments, and averaging judgments produces a number that measures the judge. Bookisdom refuses these constructs by name (epistemics.ts REFUSED_CONSTRUCTS) and this audit is not an exception to that.
- Rank instead of scoring: name the single most important fix and why it outranks the others. A ranked list carries the same decision value and claims nothing it cannot support.`;

function moduleNisPlot(): string {
  return `You are a developmental editor running a PLOT-HOLE & CONTINUITY audit on a manuscript.

Build a mental ledger as you read: timeline/order of events, who knows what and when, object/location permanence. Then flag contradictions.

For each finding output: { type: timeline | causality | knowledge | object-permanence, chapter, contradiction (one line), evidence: ["quote A", "quote B that conflicts"], severity: high|med|low, fix }

${NIS_RULES}

End with: the findings tally, then the top 3 must-fix items in order. Cross-check the timeline and knowledge-state findings against Bookisdom's codexAudit, which counts statusConflicts and threadsNoTrace deterministically — where the audit disagrees with you, the audit is the countable one.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT / CHAPTERS HERE]`;
}

function moduleNisCharacter(): string {
  return `Run a CHARACTER-CONSISTENCY audit. For each major character, hold their established traits, goals, relationships, and speech register.

Flag any action or line that contradicts what was established earlier. Output per finding:
{ character, chapter, what's inconsistent, evidence: ["established trait/quote", "contradicting quote"], severity, fix }
Also note any character whose VOICE drifts (starts sounding like the others).

${NIS_RULES}

End with: the findings tally per main character, then the riskiest drift to fix first. Bookisdom's characterArc gives the per-chapter presence series and exit/gap flags for the same characters — read your findings against that series rather than summarizing them into a number.

═══ MANUSCRIPT (+ character bible if you have one) ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisPacing(): string {
  return `Run a PACING audit to find slow spots (the "saggy middle").

For each chapter/scene, judge pace (fast / medium / slow) and justify from concrete signals: scene length, dialogue-vs-narration balance, density of action/turns, sentence-length monotony, and whether the scene has a goal + turn.
Plot the tension/pace across the book and flag stretches that sag (low stakes + low movement + uniform rhythm) and any rushed climax.

Output: a per-chapter pace table (with the signal that drove each call) + flagged stretches + concrete cuts/compressions to fix them.

${NIS_RULES}

End with: the findings tally per act, then the single chapter most in need of tightening. Bookisdom's pacingProfile reports per-act measured averages against the book's own mean with a disclosed threshold — quote those numbers instead of inventing one.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisForeshadow(): string {
  return `Run a FORESHADOWING & PAYOFF audit (Chekhov's gun).

Identify SETUPS (planted hints, objects, abilities, secrets) and PAYOFFS. Pair them up.
Flag: (a) setups that never pay off (unfired guns), (b) payoffs with no setup (deus ex machina / unearned reveals).

Output a table: setup (chapter + quote) → payoff (chapter + quote) | UNPAID | UNSEEDED, with a fix for each gap (plant earlier / pay off later / cut).

${NIS_RULES}

End with: the findings tally split into planted-never-paid and paid-never-planted, then the most jarring unseeded reveal. Bookisdom's codexAudit reports threadsNoTrace — declared threads with no trace in a chapter — which is the countable half of this check.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisDialogue(): string {
  return `Run a DIALOGUE-FATIGUE audit (pairs with the deterministic Thai Analyzer dialogue stats).

Flag: long "talking-heads" stretches (many lines with no action beat / blocking), on-the-nose exposition dumps, every character sounding the same, and filler exchanges that don't advance plot or reveal character.

Output per finding: { chapter, problem, evidence (quote the stretch), severity, fix (add action beat / cut / give it subtext / differentiate voice) }

${NIS_RULES}

End with: the findings tally by type, then the worst talking-heads scene to break up. Bookisdom measures dialogue ratio per scene deterministically; cite that figure for the scenes you flag.

═══ DIALOGUE / CHAPTER ═══
[INSERT TEXT HERE]`;
}

function moduleNisPov(): string {
  return `Run a POV & TENSE CONSISTENCY audit. Lock onto each scene's point-of-view character and the book's chosen tense, then catch every slip.

Flag per finding: { type: head-hop (POV jumps to another character mid-scene) | tense-slip (past↔present) | pov-distance (filter verbs — saw/felt/heard/realized — that break deep POV) | impossible-knowledge (the POV character narrates something they cannot see/know), chapter, evidence: ["the offending quote"], severity, fix }

${NIS_RULES}

End with: the findings tally by type, then the single worst head-hop to fix first. Every finding must carry the quote that proves it — a POV break is locatable in the text, so there is no need to summarize it into a figure.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisShow(): string {
  return `Run a SHOW-vs-TELL audit. Find places that summarize or name an emotion/conclusion where a dramatized moment would land harder.

For each finding output: { chapter, told: "the telling sentence (quote)", why: "named emotion | summary instead of scene | filtering verb | stated conclusion the reader should infer", showing: "a concrete rewrite that dramatizes it via action/body/sensory detail", severity }

Balance rule: telling is correct for transitions, time-skips, and compressing the unimportant — do NOT flag those. Only flag telling that steals a moment that deserved a scene.

${NIS_RULES}

End with: the findings tally, then the one told moment most worth dramatizing. Bookisdom counts filter verbs and named emotions per 100 words; quote that measured density rather than scoring the balance.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]`;
}

function moduleNisTheme(config: BookConfig): string {
  return `Run a THEME & MOTIF AUDIT on "${config.title}" (${config.chapters} chapters · ${config.subGenre.replace(/_/g, " ")}).
Theme is not a word to sprinkle. It is the ARGUMENT the book makes through what happens to people who choose things. You audit the argument. You do not count how spiritual the vocabulary sounds.

SEPARATE THE THREE THINGS WRITERS CONFLATE — do this before anything else, and keep the columns apart for the whole audit:
- MOTIF = a concrete recurring thing you could photograph or hear. A ring, a locked drawer, rain, a name nobody says. Term borrowed into literature from Wagner criticism: "Leitmotiv" was first printed by F. W. Jähns (1871) and made current by Hans von Wolzogen's 1876 guide to the Ring; Wagner himself never authorised it, preferring Grundthema / Hauptmotiv. Thomas Mann carried the device into the novel (Buddenbrooks, 1901 — hands, teeth, the sea, Grünlich's golden-blond whiskers). A motif is an INSTRUMENT. It has no opinion.
- THEME = the proposition the events argue. Not "loyalty" — "loyalty" is a topic, and a topic cannot be true or false.
- MORAL = the lesson someone is supposed to take home. A moral is what the book would say if it stopped trusting the reader.
Most "my theme is gone" complaints are a book that has topics and motifs and no proposition.

STEP 1 — STATE THE CONTROLLING IDEA AS A FALSIFIABLE PROPOSITION.
One sentence, from the text as written, not the text as hoped for. Use the shape the craft literature agrees on even where its authors disagree about everything else:
  VALUE + CAUSE — "X ends up <positive/negative> BECAUSE <the thing that caused it>" (Robert McKee, Story, 1997: the controlling idea is one sentence naming the value charge at the end of the story and the primary cause of that charge).
  Lajos Egri (The Art of Dramatic Writing, 1946) demands the same sentence earlier and calls it the PREMISE — something the play sets out to PROVE ("Great love defies even death"), with characters who by their nature must be driven to the choices that prove it.
  John Truby (The Anatomy of Story, 2007) calls the whole apparatus the MORAL ARGUMENT and insists it is made by STRUCTURE — by hero and opponent taking particular means toward a goal — not by dialogue. His "theme line" is the argument compressed to one sentence and then split into oppositions the two sides carry.
These are craft DOCTRINES, not findings. Nobody has demonstrated they are true. Use the sentence shape because it is testable, not because it is proven.
FALSIFIABILITY TEST: write the OPPOSITE proposition. If no competent adult could hold the opposite, you have a platitude ("love is important"), not an argument. Rewrite until the opposite is a position a reasonable person could defend — that is the position your antagonist must argue in scenes, not in a speech.
Compare the stated proposition with the book's declared thesis: "${config.thesis}". If they differ, report BOTH and say which the manuscript actually argues. The draft wins.

STEP 2 — CLASSIFY EVERY SCENE AS ARGUES / CONTRADICTS / SILENT.
For each scene, one row: { chapter, scene, verdict: argues | contradicts | silent, evidence: "the decision or consequence that carries it (quote)" }.
- ARGUES = a character's costly choice, or its consequence, makes the proposition more credible. Talking about the theme is not arguing it. A speech is evidence about the speaker.
- CONTRADICTS = the events make the proposition less credible — usually because the world lets someone have the good outcome without paying the stated cause.
- SILENT = neither. Most scenes are silent and that is normal; a book where every scene argues is a tract.
Then read the pattern, not the totals:
  ZERO contradicting scenes → the opposition is a strawman and the argument is unearned (Truby's split-into-oppositions failure). Fix by strengthening the opponent's case, never by adding a line that states the theme.
  Contradicting scenes clustered in the last third → the ending disproves the book. Decide which one you meant.
  A run of ${Math.max(3, Math.round(config.chapters / 5))}+ consecutive silent chapters → the argument is dormant. Dormant is a fact; whether it is a problem is your call, and depends on whether the plot is doing work you intend to cash later.

STEP 3 — MOTIF INVENTORY, ONE ROW PER INSTANCE.
{ motif, chapter, quote (short), what it stands next to, what it means HERE }.
The load-bearing craft rule for why an image can carry an emotion at all is T. S. Eliot's OBJECTIVE CORRELATIVE ("Hamlet and His Problems", 1919): "a set of objects, a situation, a chain of events which shall be the formula of that particular emotion; such that when the external facts, which must terminate in sensory experience, are given, the emotion is immediately evoked." The motif is the formula; if you also state the emotion, you have paid twice for one thing.
For planted objects that must discharge, obey the promise rule and cite it accurately: Chekhov, letter to A. S. Lazarev (Gruzinsky), 1 November 1889 — "One must not put a loaded rifle on the stage if no one is thinking of firing it… it is wrong to make promises you don't mean to keep." (The famous "hung on the wall in act one… fired in act two" version is Gurlyand's 1904 memoir of Chekhov's conversation, not Chekhov's own writing. Use the letter.)

STEP 4 — READ BOOKISDOM'S PER-CHAPTER MOTIF DISTRIBUTION BEFORE YOU JUDGE ANYTHING.
Bookisdom's motifTracker gives you, per term: total occurrences, the per-chapter count series, chaptersPresent, and longestAbsentRun. Paste it in.
WHAT THE DISTRIBUTION PROVES: exactly where that STRING occurs and where it does not. "This term appears 14 times, stops after chapter 9, silent for 6 chapters" is a count anyone can re-derive from the same text. It is not a feeling and not up for argument.
WHAT IT CANNOT PROVE — state these limits in your report, do not quietly rely on the number:
  (a) It counts a string, not an idea. "the ring" is counted; "it", "the thing he still carried", and every paraphrase are not. A motif can be fully present in a chapter that scores zero.
  (b) It cannot tell a thematic hit from an incidental one — a mirror in a rear-view mirror still counts.
  (c) Thai matching is substring-based, so a term that lives inside a longer word inflates its own count. Check a sample of hits by eye before trusting a total.
  (d) It cannot tell you whether the silence MATTERS. A motif that stops in chapter 9 because the object was destroyed in chapter 9 is correct. Only the manuscript answers that.
  (e) It says nothing about readers. See the honesty rules.

STEP 5 — THE TWO OPPOSITE FAILURES, EACH WITH ITS OWN TEST.
GONE SILENT (dropped motif). Take every term with a long zero-run. For each ask, from the text: does the object still exist in the story world during the silence? If it was destroyed, sold, buried, or left behind, the silence is correct — report it and move on. If it is still in the character's pocket and simply stopped being noticed, that is a drop: name the chapter where a reappearance would cost nothing.
HEAVY-HANDED (motif turned into a stamp). Four tests, all runnable on the page:
  1. DELETION — cut the instance. If the scene loses nothing except that the meaning got less obvious, the instance was decoration.
  2. CO-NAMING — count the instances that sit in the same paragraph as an abstract noun naming the theme (freedom, forgiveness, อิสรภาพ, การให้อภัย). That co-occurrence IS countable. Every one of them is the image and the caption in the same frame.
  3. VARIATION — does the motif mean something DIFFERENT on its last appearance than on its first? Recurrence with variation is the Mann/Wagner practice; recurrence without variation is a stamp.
  4. LIFT-OUT — find any line that could be printed on the cover as the book's message. Flannery O'Connor ("Writing Short Stories", in Mystery and Manners, 1969): "When you can state the theme of a story, when you can separate it from the story itself, then you can be sure the story is not a very good one." Her position is a strong claim, not a law — but a liftable line is at minimum a place where the book stopped trusting ${config.reader || "the reader"}.
HONEST ABOUT THE ASYMMETRY: WHERE a term appears is a count. WHETHER it is too much is a judgment — yours, made in front of the evidence. I searched for empirical work on motif density and found none: there is no established number of repetitions at which an image becomes heavy-handed. Anyone who gives you that number invented it.

STEP 6 — THE ENDING PAYS THE PROPOSITION OR IT DOES NOT.
Find the last decisive choice in the book. Does its consequence make the STEP 1 proposition more credible, less credible, or neither? Quote it. An ending that argues a different proposition than the body is not automatically broken — it may be the better book — but it must be a decision, so name which proposition you are keeping.

OUTPUT, in this order: (1) the controlling idea as one falsifiable sentence + its stated opposite; (2) the scene table (argues/contradicts/silent) with the pattern read; (3) the motif inventory; (4) the distribution read-out with its limits restated; (5) dropped motifs and heavy-handed instances, each with the test that caught it; (6) the ending verdict; (7) the ONE change that would sharpen the argument most, and what it would cost.

${NIS_RULES}

HONESTY RULES (obey literally):
- Report a finding only if you can quote the text that proves it — chapter + short quote. No quote, no finding.
- Never invent a motif the writer did not put there, and never invent a citation, a percentage, or a study. If the manuscript is clean on a check, say it is clean.
- Distinguish COUNTS from JUDGMENTS in every line you write. "Appears in ch. 1-9, absent 10-15" is a count. "The motif dies too early" is your judgment; label it as one.
- NEVER OUTPUT A "THEMATIC RESONANCE SCORE", a thematic-coherence score, a 0-100 or x/10 theme rating, or any number predicting whether readers will get the point. Bookisdom refuses thematicResonance by name (epistemics.ts, REFUSED_CONSTRUCTS): "resonance" has no operation, so a number for it measures the judge, not the book. The motif distribution replaces it, and the distribution is the whole of what can be counted here.
- Do not predict reader response. What little empirical work exists points the other way: Kurtz & Schober (Poetics, 2001) had 16 avid readers state the theme of two microfictions and found the stated themes diverged substantially, with theme looking like a late act of interpretation rather than something computed automatically while reading; Narvaez et al. (Reading Psychology, 1998) found children's stated moral themes often departed from the author's intent. Both studies are small and use short texts — I found no study of theme detection in novel-length fiction. Treat "will readers get it" as unmeasured, not as measured-and-fine.

═══ MANUSCRIPT ═══
[INSERT MANUSCRIPT HERE]

═══ BOOKISDOM MOTIF DISTRIBUTION (paste from the Narrative panel / CLI) ═══
[term · total · per-chapter counts · chapters present · longest silent run]`;
}
export function moduleWritersRoom(config: BookConfig): string {
  return `Run a SOLO WRITERS' ROOM to break your season/book the way TV rooms do (the documented practice: blue-sky -> arcing -> the board -> breaking -> outline; in the Breaking Bad room ~75% of the writing happened at this stage). You play every chair; I referee the process.

PHASE 1 — BLUE SKY (no filtering): 15 minutes of unfiltered "what if" for "${config.title}". Wild ideas welcome; nothing is rejected yet. Output 15-25 raw sparks.

PHASE 2 — ARCING: pick the sparks that serve the premise. Define: the season/book question (what the finale must answer), each lead's start->end movement, and the midpoint reversal.

PHASE 3 — THE BOARD: ${config.chapters} columns (one per chapter). Under each: 2-4 beat cards, each a single logline (the Breaking Bad discipline: if a beat can't be one line, it isn't broken yet). Mark each card A/B/C by plotline. Keep asking the room question: "where is the protagonist's head at?"

PHASE 4 — BREAK ONE CHAPTER: take the weakest column and break it properly — act-outs first (the internal cliffs), then the beats that earn them, but/therefore joints only.

PHASE 5 — AUDIT: no plotline silent >3 chapters; every plant has a payoff column; chapters 2-4 carry the hook burden (streaming data: openers don't hook, 2-4 do); the finale answers the season question ON THE PAGE.

Output each phase clearly separated. Stop after Phase 3 and wait for my picks before Phases 4-5 if the board is contested.

Premise: ${config.thesis}
Genre: ${config.subGenre.replace(/_/g, " ")}`;
}

export function moduleSagaArchitect(config: BookConfig): string {
  return `Design a SAGA ARCHITECTURE — a long-form work spanning 3–9 seasons (each season is itself a multi-part book) — for "${config.title}".

First state how many seasons (3–9) fit this premise and why.
Premise: ${config.thesis}

Output:
1. SAGA QUESTION — the single dramatic question the WHOLE saga answers.
2. GLOBAL ARC across seasons — map the macro beats to specific seasons: Setup season → escalation seasons → midpoint-reversal season → all-is-lost season → climax season → resolution. Name which season each beat lands in.
3. PER-SEASON TABLE — for each season N: logline · role (setup/escalation/turn/descent/climax/resolution) · protagonist state entering vs leaving · what it must PLANT and what it PAYS OFF · the season-ending cliffhanger that hooks the next.
4. POWER/SCALE LADDER — one line per season showing rising scope (personal → local → … → world/cosmic) so power-creep stays intentional, not accidental.
5. ESCALATION CHECK — confirm stakes rise every season and the FINALE season pays off the saga question.

FORMAT: also output one line per season as "Season N: <logline> | <role> | ends-on: <hook>" so it pastes into a planner.

═══ SEASON COUNT & NOTES ═══
[ระบุจำนวน season 3–9 + โน้ต/ตัวละคร/โลก]`;
}

export function moduleSagaSeason(config: BookConfig): string {
  return `Design ONE SEASON in depth for "${config.title}" — a season is itself a 3–9 part mini-arc with its own setup→climax, while serving the whole saga.

Given the saga architecture + which season this is, output:
- SEASON ARC: its own opening → midpoint → climax → turn, and how it advances the SAGA QUESTION.
- PART BREAKDOWN: for each part 1..N, a one-line beat + its end hook.
- PLANTS & PAYOFFS: what this season pays off (set up earlier) and what it plants for FUTURE seasons (tag the target season).
- SEASON CLIFFHANGER into the next season.
Keep consistent with the saga's power/scale ladder (no unearned jumps).

═══ SAGA PLAN + WHICH SEASON ═══
[วาง SAGA ARCHITECTURE + ระบุ "นี่คือ Season N จาก M"]`;
}

export function moduleSagaContinuity(): string {
  return `Maintain a <<<SAGA STATE>>> ledger that keeps a multi-season saga consistent ACROSS seasons (this extends the per-chapter STATE to season scale).

Sections:
- CANON: world rules & their LIMITS, tagged with the season each was established.
- CHARACTER LEDGER: per character — power/level, relationships, secrets, and state at each season's end. Watch for unexplained POWER CREEP.
- TIMELINE: absolute chronology across seasons; flag any date/age contradiction.
- REVEAL TRACKER: what the READER knows vs each CHARACTER, per season.
- OPEN THREADS: each tagged "planted S# → pays off S#".
- NAMING / CANON RULES: spellings & facts that must not change.

At the END of each season, output an updated <<<SAGA STATE>>> block. BEFORE writing a season, read it and flag anything that contradicts canon (cite the conflicting entries). Never invent canon — mark unknowns [TBD].

═══ SAGA MATERIAL (prior season bibles / latest SAGA STATE) ═══
[วางวัตถุดิบที่นี่]`;
}

export function moduleSagaBridge(): string {
  return `Write a SEASON BRIDGE from one season to the next — the opener that carries momentum across the season gap.

Produce:
1. PREVIOUSLY (recap): entity-dense, ≤ 200 words, newest/most load-bearing facts first.
2. CARRIED HOOK: the unresolved cliffhanger the new season must answer.
3. ESCALATION: why the stakes/scale are bigger now than last season (tie to the power/scale ladder).
4. OPENING HOOK: how the new season opens so a returning reader is gripped and a lapsed one is re-oriented.
Stay consistent with the latest <<<SAGA STATE>>>.

═══ PRIOR SEASON SUMMARY + SAGA STATE ═══
[วางสรุป season ก่อน + STATE]`;
}

// ── Catalog assembly ───────────────────────────────────────────

type ModuleDef = { id: string; group: PromptGroup; name: string; description: string; usage: string; build: (c: BookConfig) => string };

/** id → builder. Kept beside the builders so a new module fails loudly if either half
 *  is missing (catalog-meta.test.ts asserts the two sides match exactly). */
const MODULE_BUILDERS: Record<string, (c: BookConfig) => string> = {
  GENRE_CORE: moduleGenreCore,
  STRUCTURE: moduleStructureOutline,
  VOICE_SHEET: moduleCharacterVoice,
  CHAR_ARC: moduleCharacterArc,
  WORLD_CODEX: moduleWorldCodex,
  SCENE: moduleSceneBuilder,
  DIALOGUE: moduleDialoguePolish,
  ANTI_SAFE: moduleAntiSafe,
  SENSORY: moduleSensoryAudit,
  IMMERSION: moduleImmersion,
  HARD_SF: moduleHardSF,
  THAI_SOUND: moduleThaiSound,
  HOOK_CRAFT: moduleHookCraft,
  PSYCH_ARC: modulePsychArc,
  QUIET_SCENE: moduleQuietScene,
  TRANSLATE: moduleTranslate,
  SCENE_ART: moduleSceneArt,
  CHAR_CHAT: moduleCharChat,
  CONFLICT_MAP: moduleConflictMap,
  FACT_CHECK: moduleFactCheck,
  ARG_MAP: moduleArgumentMap,
  EVIDENCE: moduleEvidenceAudit,
  PEDAGOGY: modulePedagogy,
  CASE_STUDY: moduleCaseStudy,
  VOICE_FP: moduleVoiceFingerprint,
  ANTI_SLOP: moduleAntiSlop,
  READABILITY: moduleReadability,
  LINE_EDIT: moduleLineEdit,
  CUT_PASS: moduleCutPass,
  THAI_QA: moduleThaiPack,
  DIALECT_ISAN: moduleDialectIsan,
  DIALECT_NORTH: moduleDialectNorth,
  DIALECT_SOUTH: moduleDialectSouth,
  COVER_ART: moduleCoverArt,
  TITLE: moduleTitle,
  BLURB: moduleBlurb,
  KDP_META: moduleKdpMeta,
  SUBMISSION: moduleSubmission,
  RECAP: moduleRollingRecap,
  BRAINSTORM: moduleBrainstorm,
  QUALITY_GATE: moduleQualityGate,
  SERIES_BIBLE: moduleSeriesBible,
  AGENT_ORCHESTRATOR: moduleAgentOrchestrator,
  AGENT_RESEARCH: moduleAgentResearch,
  AGENT_BIBLE: moduleAgentBible,
  AGENT_ARCHITECT: moduleAgentArchitect,
  AGENT_WRITER: moduleAgentWriter,
  AGENT_CRITIC: moduleAgentCritic,
  NIS_PLOT: moduleNisPlot,
  NIS_CHARACTER: moduleNisCharacter,
  NIS_PACING: moduleNisPacing,
  NIS_FORESHADOW: moduleNisForeshadow,
  NIS_DIALOGUE: moduleNisDialogue,
  NIS_POV: moduleNisPov,
  NIS_SHOW: moduleNisShow,
  NIS_THEME: moduleNisTheme,
  WRITERS_ROOM: moduleWritersRoom,
  SAGA_ARCHITECT: moduleSagaArchitect,
  SAGA_SEASON: moduleSagaSeason,
  SAGA_CONTINUITY: moduleSagaContinuity,
  SAGA_BRIDGE: moduleSagaBridge,
};

/** The full catalog: metadata (catalog-meta.ts) zipped with the builders above. Importing
 *  this pulls every builder — a UI that only needs names should import MODULE_META. */
export const MODULE_CATALOG: ModuleDef[] = MODULE_META.map((m) => ({ ...m, build: MODULE_BUILDERS[m.id] }));
