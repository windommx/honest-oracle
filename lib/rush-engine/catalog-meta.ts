// ╔══════════════════════════════════════════════════════════════════╗
// ║  MODULE METADATA — data only, no builders.                        ║
// ║                                                                    ║
// ║  Why this file exists (measured, not guessed): MODULE_CATALOG      ║
// ║  holds a `build:` reference to all 61 prompt builders, so any page ║
// ║  importing it just to show a module NAME pulled in modules.ts —    ║
// ║  1,593 lines of template literals — and everything modules.ts      ║
// ║  imports. /rush/fix needs names only, and paid 285 kB First Load   ║
// ║  JS for it; stripping this import measured 173 kB (-112 kB, -39%). ║
// ║                                                                    ║
// ║  MODULE_CATALOG is now BUILT from this table, so the metadata has  ║
// ║  exactly one source of truth and cannot drift from the builders    ║
// ║  (a test asserts every id here has a builder and vice versa).      ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { PromptGroup } from "./types";

export interface ModuleMeta {
  id: string;
  group: PromptGroup;
  name: string;
  description: string;
  usage: string;
}

/** All optional modules, metadata only. Light UI surfaces import THIS, never the catalog. */
export const MODULE_META: ModuleMeta[] = [
  { id: "GENRE_CORE", group: "craft", name: "Genre Reader-Promise", description: "Locks the core promise, conventions & failure modes of the book's genre before outlining.", usage: "Run first — before the outline — to nail what readers of this genre expect." },
  { id: "STRUCTURE", group: "craft", name: "Structure Outline", description: "Beat-by-beat outline (Save the Cat / Hero's Journey / Story Circle / Kishōtenketsu / Seven-Point).", usage: "Run before writing, to plan the whole book." },
  { id: "VOICE_SHEET", group: "craft", name: "Character Voice Sheet", description: "Distinct voice per character; inject into every chapter prompt.", usage: "Fill in characters; paste output into chapter prompts." },
  { id: "CHAR_ARC", group: "craft", name: "Character Arc Sheet", description: "Lie-vs-Truth arcs (positive/negative/flat) keyed to plot beats.", usage: "Run after the outline, before drafting." },
  { id: "WORLD_CODEX", group: "craft", name: "Worldbuilding Codex", description: "Story bible + per-chapter continuity check.", usage: "Build once; check each new chapter against it." },
  { id: "SCENE", group: "craft", name: "Scene Builder", description: "Scene/Sequel + MRU structure for a single dramatic unit.", usage: "Use when a chapter needs a tightly built scene." },
  { id: "DIALOGUE", group: "craft", name: "Dialogue Polish", description: "Action beats, subtext, trimmed tags.", usage: "Send a dialogue passage to revise." },
  { id: "ANTI_SAFE", group: "craft", name: "Anti-Safe Pass", description: "Break safe/tidy AI defaults; raise real stakes; ban Thai AI-tell clichés.", usage: "Send a draft to make it riskier." },
  { id: "SENSORY", group: "craft", name: "Sensory Audit", description: "Per-scene 5-sense check (≥3) + targeted concrete additions.", usage: "Send a draft to ground it in the senses." },
  { id: "IMMERSION", group: "craft", name: "Immersion / Deep-POV Pass", description: "Deep-POV rewrite: ground fast, cut filter verbs, add interiority, open one loop, end on momentum.", usage: "Send a scene to pull the reader inside it." },
  { id: "HARD_SF", group: "craft", name: "Hard-SF Constraint Pass", description: "Audit a sci-fi premise against seven non-negotiable physics constraints, then mine each for the scene it forces.", usage: "Send a sci-fi premise to make its limits generate drama." },
  { id: "THAI_SOUND", group: "craft", name: "Thai Sound Pass", description: "The sound layer of Thai prose: euphonic คำซ้อน as rhythm, สัมผัสใน at peaks, reduplication, register as instrument, read-aloud test.", usage: "Send a Thai passage to tune its rhythm and euphony." },
  { id: "HOOK_CRAFT", group: "craft", name: "Ending Hook & Restraint", description: "Emotional-hook typology (5 types + hybrid) and restraint craft — the almost-moment, what-they-don't-do, body-betrays-last — for chapter endings.", usage: "Send a chapter ending to sharpen its hook (or write one)." },
  { id: "PSYCH_ARC", group: "craft", name: "Attachment & Repair Arc", description: "Attachment styles as behavior predictors, the earned-security arc (slow, relapsing), and repair scene types (corrective experience / co-regulation / mentalization).", usage: "Run when designing or auditing a slow-burn relationship arc." },
  { id: "QUIET_SCENE", group: "craft", name: "Quiet Scene & Prosody", description: "Scenes that speak without dialogue: prosody devices (baseline shift, delayed crack), staged co-regulation, distance/timing/objects as channels, quiet repair.", usage: "Send a low-dialogue emotional scene to write or sharpen." },
  { id: "TRANSLATE", group: "craft", name: "Faithful Translation", description: "Canon lorebook + terminology lock + negative prompts + micro-chunking — translate without AI drift/hallucination.", usage: "Use to translate a passage (e.g. Thai→English for Royal Road) faithfully." },
  { id: "SCENE_ART", group: "craft", name: "Scene Illustration Prompt", description: "Turns a scene into a consistent image prompt (style/subject/setting/mood/composition + negative).", usage: "Send a scene to get a ready image prompt (you run Midjourney/SD)." },
  { id: "CHAR_CHAT", group: "craft", name: "Character Chat System Prompt", description: "Build a canon-safe, in-voice system prompt to chat with a character (spoiler + knowledge guardrails).", usage: "Fill from the character bible; run in your own LLM to chat in-world." },
  { id: "CONFLICT_MAP", group: "craft", name: "Conflict / Tension Map", description: "Per-scene tension curve + flat-spot fixes.", usage: "Send a draft to map and raise tension." },
  { id: "FACT_CHECK", group: "nonfiction", name: "Citation / Fact-Check", description: "Verify every claim; forbid invented citations.", usage: "Send each nonfiction chapter draft." },
  { id: "ARG_MAP", group: "nonfiction", name: "Argument Map + Steelman", description: "Toulmin map + honest counterargument & rebuttal.", usage: "Run on the core argument of a chapter." },
  { id: "EVIDENCE", group: "nonfiction", name: "Evidence Audit", description: "Grade support on the evidence hierarchy + gap report.", usage: "Send a draft to audit its evidence." },
  { id: "PEDAGOGY", group: "nonfiction", name: "Pedagogy Pack", description: "Bloom objectives + worked example + retrieval + spaced callbacks.", usage: "Run per chapter for textbook/how-to." },
  { id: "CASE_STUDY", group: "nonfiction", name: "Case-Study Builder", description: "SPAR case (Situation-Problem-Action-Result-Lesson).", usage: "Use to make a concept concrete." },
  { id: "VOICE_FP", group: "prose", name: "Author Voice Fingerprint", description: "Extract a reusable style sheet from sample writing.", usage: "Run once with samples; reuse every chapter." },
  { id: "ANTI_SLOP", group: "prose", name: "Anti-AI-Slop Rewrite", description: "Strip generic LLM tells; vary rhythm; concretize.", usage: "Send any draft to de-slop." },
  { id: "READABILITY", group: "prose", name: "Readability Control", description: "Flesch-Kincaid report + level-controlled rewrite.", usage: "Send a draft + target level." },
  { id: "LINE_EDIT", group: "prose", name: "Line Edit", description: "Filter words, adverbs, passive, clichés, repetition.", usage: "Send a draft for a sentence-level edit." },
  { id: "CUT_PASS", group: "prose", name: "Adversarial Cut Pass", description: "Cut N words with every cut classified (over-explain ~32% and redundant ~26% lead in field data) — plot facts and setups untouchable.", usage: "Send a finished chapter to tighten." },
  { id: "THAI_QA", group: "thai", name: "Thai Language QA", description: "Register/ราชาศัพท์, sentence segmentation, transliteration consistency.", usage: "Send Thai-language drafts." },
  { id: "DIALECT_ISAN", group: "dialect", name: "Isan Voice (อีสาน)", description: "Convert dialogue to Isan/Lao voice + glossary; keeps character & plot.", usage: "Paste a Thai draft to convert." },
  { id: "DIALECT_NORTH", group: "dialect", name: "Northern / คำเมือง", description: "Convert dialogue to Lanna/Northern voice + glossary.", usage: "Paste a Thai draft to convert." },
  { id: "DIALECT_SOUTH", group: "dialect", name: "Southern (ปักษ์ใต้)", description: "Convert dialogue to Southern voice + glossary.", usage: "Paste a Thai draft to convert." },
  { id: "COVER_ART", group: "marketing", name: "Cover Art Prompt (×2)", description: "Two cover concepts + ready Midjourney / DALL·E·SD prompts (you generate the image).", usage: "Run for book-cover image prompts." },
  { id: "TITLE", group: "marketing", name: "Title + Subtitle", description: "10 title (and subtitle) options, keyword-aware for nonfiction.", usage: "Run anytime; iterate on positioning." },
  { id: "BLURB", group: "marketing", name: "Blurb / Description", description: "Back-cover copy + Amazon-safe HTML.", usage: "Run for the sales description." },
  { id: "KDP_META", group: "marketing", name: "KDP Metadata", description: "7 keywords + 3 categories + A+ hook.", usage: "Run before publishing on KDP." },
  { id: "SUBMISSION", group: "marketing", name: "Agent Submission Pack", description: "Query letter + 1-page synopsis + comps + author bio.", usage: "Run for traditional submission." },
  { id: "RECAP", group: "advanced", name: "Rolling Recap", description: "Chain-of-density carry-forward summary for continuity.", usage: "Update after each chapter; prepend to the next." },
  { id: "BRAINSTORM", group: "advanced", name: "Brainstorm (Verbalized Sampling)", description: "Diverse option spread to beat repetitive output.", usage: "Use for titles, twists, names, hooks." },
  { id: "QUALITY_GATE", group: "advanced", name: "Quality Gate", description: "Pass/fail pre-publish gate: continuity, sensory, anti-safe, voice, (Thai).", usage: "Run on a finished chapter before moving on." },
  { id: "SERIES_BIBLE", group: "advanced", name: "Series Bible", description: "Cross-book canon ledger: character/world/timeline/reveal/threads + per-book continuity check.", usage: "Maintain across a multi-book series; rerun per new book." },
  { id: "AGENT_ORCHESTRATOR", group: "agents", name: "Orchestrator", description: "Delegates to and verifies the agent swarm; wave schedule + gates.", usage: "Use as the coordinator agent's system prompt." },
  { id: "AGENT_RESEARCH", group: "agents", name: "Research Agent", description: "Niche, USP, comps, keywords (JSON).", usage: "Phase 1 agent system prompt." },
  { id: "AGENT_BIBLE", group: "agents", name: "Bible Agent", description: "Characters, world, style card, glossary (JSON).", usage: "Phase 2 agent system prompt." },
  { id: "AGENT_ARCHITECT", group: "agents", name: "Architect Agent", description: "Arc map + chapters/scenes outline (JSON).", usage: "Phase 3 agent system prompt." },
  { id: "AGENT_WRITER", group: "agents", name: "Writer Agent", description: "Writes one scene from spec + bible (JSON).", usage: "Phase 4 agent system prompt." },
  { id: "AGENT_CRITIC", group: "agents", name: "Critic Swarm", description: "Continuity / emotion / proof / marketing reports (JSON).", usage: "Phase 5 agent system prompt." },
  { id: "NIS_PLOT", group: "nis", name: "Plot-Hole & Continuity Audit", description: "Timeline/causality/knowledge/object-permanence contradictions, each with conflicting quotes.", usage: "Run on a full draft or batch of chapters." },
  { id: "NIS_CHARACTER", group: "nis", name: "Character Consistency Audit", description: "Trait/goal/voice drift per character, with established-vs-contradicting quotes.", usage: "Run on a full draft (+ character bible)." },
  { id: "NIS_PACING", group: "nis", name: "Pacing Audit", description: "Per-chapter pace from concrete signals; finds the saggy middle + rushed climax.", usage: "Run on the assembled manuscript." },
  { id: "NIS_FORESHADOW", group: "nis", name: "Foreshadow & Payoff Audit", description: "Pairs setups to payoffs; flags unfired guns and unseeded reveals.", usage: "Run on a full draft to check planting." },
  { id: "NIS_DIALOGUE", group: "nis", name: "Dialogue-Fatigue Audit", description: "Talking-heads runs, on-the-nose exposition, samey voices (pairs with Thai Analyzer).", usage: "Run on dialogue-heavy chapters." },
  { id: "NIS_POV", group: "nis", name: "POV & Tense Audit", description: "Head-hopping, tense slips, deep-POV distance, impossible knowledge — each quoted.", usage: "Run on a full draft to lock POV/tense." },
  { id: "NIS_SHOW", group: "nis", name: "Show-vs-Tell Audit", description: "Flags told emotions/summaries with a concrete showing rewrite; spares legit transitions.", usage: "Run on draft scenes that feel flat." },
  { id: "NIS_THEME", group: "nis", name: "Theme & Motif Audit", description: "Tracks every motif instance with quotes; flags dropped motifs and on-the-nose theme.", usage: "Run on the assembled manuscript." },
  { id: "WRITERS_ROOM", group: "saga", name: "Solo Writers' Room", description: "Blue-sky -> arcing -> the board -> break -> audit: the documented TV-room season-breaking process, run solo.", usage: "Run before outlining a season or book." },
  { id: "SAGA_ARCHITECT", group: "saga", name: "Saga Architect (3–9 seasons)", description: "Macro arc across 3–9 seasons: saga question, per-season role/cliffhanger, power-scale ladder.", usage: "Run first to plan a multi-season work." },
  { id: "SAGA_SEASON", group: "saga", name: "Season Designer", description: "Designs one season in depth (its parts, plants/payoffs, cliffhanger) within the saga.", usage: "Run per season after the architect." },
  { id: "SAGA_CONTINUITY", group: "saga", name: "Saga Continuity (SAGA STATE)", description: "Cross-season canon/character/timeline/reveal ledger; watches power-creep.", usage: "Maintain across all seasons." },
  { id: "SAGA_BRIDGE", group: "saga", name: "Season Bridge", description: "Season-to-season opener: recap + carried hook + escalation + opening hook.", usage: "Run between seasons." },
];
