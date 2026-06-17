import { BOOK_TYPES, isFictionType } from "./book-types";
import type { Architecture, BookConfig, ChapterPlan, ContinuityState } from "./types";
import { getAnalysisMetrics, getQualityChecklist, getQualityStandards, getRevisionRules } from "./standards";
import { parseOutline } from "./outline";

export function generateMasterSystemPrompt(config: BookConfig, architecture: Architecture): string {
  const type = BOOK_TYPES[config.type];
  const lang = config.language === "thai" ? "ภาษาไทย" : config.language === "bilingual" ? "Thai-English bilingual" : "English";

  let p = `You are a master ${type.label.toLowerCase()} author writing "${config.title}".

═══ IDENTITY & ROLE ═══
You are writing a complete ${type.label.toLowerCase()} book in ${lang}.
Your voice is: ${config.voice}.
Your target reader: ${config.reader}.

═══ BOOK SPECIFICATIONS ═══
- Title: ${config.title}
- Type: ${type.label}
- Sub-genre: ${config.subGenre.replace(/_/g, " ")}
- Total chapters: ${config.chapters}
- Target words per chapter: ${config.wordsPerChapter}
- Total estimated words: ${config.chapters * config.wordsPerChapter}
- Language: ${lang}
- Citation style: ${config.citationStyle}

═══ THESIS / PREMISE ═══
${config.thesis}

═══ QUALITY STANDARDS (aim for these; use judgment over rigid ratios) ═══
${getQualityStandards(config.type)}

`;

  switch (config.type) {
    case "novel":
      p += `═══ FICTION RULES ═══
1. SHOW, DON'T TELL — at least 70% of prose should be showing
2. Every scene needs: conflict + sensory details (≥2 senses) + turning point
3. Dialogue must: advance plot OR reveal character — never filler
4. Chapter endings: must create a hook (question, revelation, reversal, cliffhanger)
5. Character voices: each character must be distinguishable by speech pattern alone
6. Tension: must escalate across the book — each chapter raises stakes
7. No clichés, no purple prose, no adverb-heavy sentences
8. Body language and micro-expressions instead of stating emotions
9. Setting details serve mood/theme — never generic description
10. Internal monologue: sparse but powerful — show through action, not thought

═══ ACT STRUCTURE ═══
${architecture.parts.map((pp) => `${pp.name}: Chapters ${pp.chapters[0]}-${pp.chapters[1]} — ${pp.purpose}`).join("\n")}

═══ CHARACTER ARC ═══
Protagonist transforms from: flawed → transformed
`;
      break;
    case "nonfiction":
    case "howto":
    case "textbook":
      p += `═══ NON-FICTION RULES ═══
1. Every claim must be supported by evidence (citation, statistic, example, or case study)
2. Evidence hierarchy: meta-analysis > RCT > cohort > case study > expert quote > anecdote
3. Define all jargon on first use
4. Logic connections must be explicit between paragraphs (therefore, however, for example...)
5. Counter-arguments: steelman (present fairly), then rebut with evidence
6. Pedagogy: learning objectives → content → exercises → summary → key takeaways
7. Examples and analogies for every abstract concept
8. Average sentence length ≤ 25 words
9. Each chapter must advance thesis proof
10. Actionable takeaways reader can implement immediately

═══ THESIS ═══
Main thesis: ${config.thesis}

═══ READER JOURNEY ═══
Start: problem unaware → End: practitioner who can apply the framework
`;
      break;
    case "kids":
      p += `═══ CHILDREN'S BOOK RULES ═══
1. Vocabulary: age-appropriate, limited word list
2. Sentences: short, clear, rhythmic
3. Repetition: encouraged for engagement and learning
4. Read-aloud quality: test every sentence by reading aloud mentally
5. Illustration notes: describe visual for every page/spread
6. Positive message: empowering, not preachy
7. Diverse characters: represent various backgrounds
8. Show emotions through actions, not labels
9. Humor: age-appropriate, physical comedy for younger readers
10. Satisfying ending: resolves all tensions, feels complete
`;
      break;
    case "cookbook":
      p += `═══ COOKBOOK RULES ═══
1. Recipe format: standardized (title, headnote, times, ingredients, steps, notes)
2. Measurements: metric primary, imperial in parentheses
3. Ingredients: listed in order of use
4. Steps: one action per numbered step
5. Temperatures: °C and °F
6. Allergens: clearly flagged
7. Substitutions: offered where possible
8. Headnotes: personal story or technique context
9. Chef's tips: insider knowledge for each recipe
10. Photo directions: describe ideal plating/presentation
`;
      break;
    case "memoir":
      p += `═══ MEMOIR RULES ═══
1. Emotional truth above all — be honest, vulnerable, specific
2. Show key moments through scene, not summary
3. Sensory details from actual memory (or plausible reconstruction)
4. Dialogue: natural voice of the people in your life
5. Reflection: connect past events to present understanding
6. Theme: woven through every chapter, not stated explicitly
7. No self-pity — own your story with agency
8. Universal resonance: your specific story speaks to universal experience
9. Respect privacy: change names/details where needed but keep truth
10. Opening: drop reader into a pivotal, compelling moment
`;
      break;
    case "poetry":
      p += `═══ POETRY RULES ═══
1. Concrete imagery over abstract statements
2. Every word must earn its place — radical economy
3. Line breaks are intentional — each break creates meaning
4. Sound matters: read every poem aloud (mentally)
5. Surprise: original metaphors, unexpected turns
6. Emotional honesty: no sentimentality, no pretension
7. White space is part of the poem
8. Titles add meaning, not just labels
9. Collection coherence: poems talk to each other across sections
10. End with resonance — the poem should echo after reading
`;
      break;
  }

  p += `
═══ CONTINUITY PROTOCOL (automatic story bible — keep this whole session in one chat) ═══
You maintain a living STATE block so the book stays consistent without me re-pasting notes.
1. The FIRST time you write, create a STATE block capturing: characters (name + key traits/relationships), setting/world rules, established facts, timeline, unresolved threads, and (fiction) tension level.
2. At the START of every chapter, silently read the latest STATE and stay consistent with it — never contradict or re-introduce what's already established.
3. At the END of every chapter, append an updated STATE block, fenced exactly like this:

<<<STATE>>>
CHARACTERS: ...
WORLD/FACTS: ...
TIMELINE: ...
OPEN THREADS: ...
TENSION: ...  (fiction only)
<<<END STATE>>>

Keep STATE compact (≤ 250 words), newest facts first, plain facts only. Carry it forward chapter to chapter. If I paste a STATE block into a later prompt, treat it as the source of truth.

═══ OUTPUT FORMAT ═══
- Write the chapter content directly (no meta-commentary, no preamble like "Here is the chapter")
- Begin with the chapter title as a Markdown heading (## Chapter N: Title)
- Maintain consistent voice throughout; calibrate length to the target (±20%) without padding
- End with a hook or transition appropriate to the chapter type
- After the chapter, output the updated <<<STATE>>> block (per the Continuity Protocol)
`;
  return p;
}
function novelChapterBody(chapter: ChapterPlan): string {
  let p = `═══ SCENE INSTRUCTIONS ═══\n`;
  p += `Scene type: ${chapter.sceneType}\n`;
  p += `Act: ${chapter.act}\n`;
  p += `Tension level: ${Math.round((chapter.tensionLevel ?? 0) * 100)}%\n\n`;
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  p += `\n═══ STRUCTURE ═══\n`;
  const s: Record<string, string> = {
    opening: `1. COLD OPEN: Drop reader into a compelling moment (in medias res)\n2. ESTABLISH: Character desire + world details through action\n3. HOOK: End with question or situation that demands reading on\n`,
    setup: `1. SCENE SETTING: Time, place, mood through specific details\n2. CHARACTER ACTION: Show protagonist's normal world + flaw\n3. CONFLICT INTRODUCTION: Hint at or introduce disruption\n4. HOOK: Something shifts — reader needs to know what happens\n`,
    turning_point: `1. THRESHOLD: Protagonist faces decision point\n2. COMMITMENT: Chooses to act (can't go back)\n3. CONSEQUENCES: First taste of the new world/conflict\n4. HOOK: What have they gotten into?\n`,
    escalation: `1. NEW CHALLENGE: Raise the stakes\n2. CHARACTER GROWTH: Protagonist adapts (or fails)\n3. RELATIONSHIP SHIFT: Alliance, betrayal, or revelation\n4. HOOK: Stakes just got higher\n`,
    midpoint: `1. REVELATION: Major truth revealed (changes everything)\n2. REVERSAL: Protagonist's understanding flips\n3. RAISED STAKES: Now it's personal\n4. HOOK: No going back — only forward into danger\n`,
    complication: `1. ESCALATION: Every plan fails, every ally strained\n2. DARK MOMENT APPROACHES: Protagonist pushed to limit\n3. INTERNAL CONFLICT: Flaw vs growth\n4. HOOK: Things are about to get much worse\n`,
    dark_moment: `1. LOWEST POINT: Everything lost (or seems lost)\n2. INNER DEMON: Protagonist faces their deepest flaw\n3. SEED OF RESOLUTION: Small detail planted earlier pays off\n4. HOOK: A choice — give up or find another way\n`,
    pre_climax: `1. REGATHERING: Protagonist finds resolve\n2. FINAL PREPARATION: Allies, plan, sacrifice accepted\n3. CALM BEFORE STORM: Quiet moment of humanity\n4. HOOK: Ready — here we go\n`,
    climax: `1. CONFRONTATION: Final conflict\n2. INTERNAL TEST: Protagonist must overcome flaw to succeed\n3. DECISIVE ACTION: The choice that defines the character\n4. RESOLUTION OF CONFLICT: Victory, defeat, or bittersweet\n`,
    resolution: `1. NEW NORMAL: World after the conflict\n2. CHARACTER TRANSFORMATION: Show (don't tell) how protagonist changed\n3. THEMATIC STATEMENT: The book's message, embodied in action\n4. FINAL IMAGE: Last line that resonates\n`,
  };
  p += s[chapter.sceneType ?? ""] ?? `1. OPEN: Establish scene with sensory detail\n2. DEVELOP: Conflict + character interaction\n3. TURN: Something changes or is revealed\n4. HOOK: End with forward momentum\n`;
  if ((chapter.tensionLevel ?? 0) > 0.7) {
    p += `\n⚠ HIGH TENSION CHAPTER — maintain pace:\n- Shorter sentences and paragraphs\n- Faster scene cuts\n- Minimal description (only what's essential)\n- Internal monologue at key moments only\n`;
  }
  return p;
}

const NF_TEMPLATES: Record<string, string> = {
  introduction: `1. HOOK: Provocative question, surprising statistic, or compelling story\n2. PROBLEM: Define the problem this book solves\n3. PROMISE: What the reader will gain\n4. ROADMAP: Overview of the book's structure\n5. HOOK: End with first compelling evidence or story`,
  story: `1. SCENE: Drop into specific moment with sensory details\n2. NARRATIVE: Tell the story with tension and emotion\n3. INSIGHT: Extract the lesson from the story\n4. REFLECTION: Connect to reader's experience\n5. BRIDGE: Transition to the framework/evidence`,
  evidence: `1. CLAIM: State the claim clearly\n2. EVIDENCE: Present research, data, case studies\n3. ANALYSIS: Explain what the evidence means\n4. LIMITATION: Acknowledge what the evidence doesn't prove\n5. CONNECTION: Link to thesis and next section`,
  theory: `1. CONCEPT: Introduce the framework component clearly\n2. MECHANISM: Explain how/why it works\n3. ANALOGY: Provide relatable analogy\n4. EXAMPLE: Concrete real-world example\n5. APPLICATION: How reader can use this concept`,
  practice: `1. OBJECTIVE: What the reader will achieve\n2. MATERIALS: What's needed\n3. STEPS: Step-by-step instructions\n4. COMMON MISTAKES: What to avoid\n5. EXPECTED RESULT: What success looks like`,
  case_study: `1. SETUP: Context and background\n2. SITUATION: The challenge/problem\n3. NARRATIVE: What happened (with specific details)\n4. OUTCOME: Results (with data if possible)\n5. ANALYSIS: Framework principles demonstrated\n6. LESSONS: What the reader can extract`,
  counter: `1. COUNTER-CLAIM: State it fairly (steelmanning)\n2. EVIDENCE FOR: The strongest evidence supporting it\n3. YOUR REBUTTAL: Evidence and logic against it\n4. SYNTHESIS: What the truth actually is\n5. RESOLUTION: How this strengthens (not weakens) the thesis`,
  synthesis: `1. REVIEW: Key principles from all previous chapters\n2. CONNECTIONS: How components work together as a system\n3. FRAMEWORK: Present the complete system\n4. CASE: Apply the complete framework to a real scenario\n5. THESIS PROOF: Demonstrate the main thesis is proven`,
  action: `1. COMMITMENT: What the reader should do starting today\n2. PLAN: 30-day (or similar) structured plan\n3. TOOLS: Templates, worksheets, resources\n4. SUPPORT: How to maintain momentum\n5. VISION: What life looks like after implementation`,
  reflection: `1. LOOK BACK: What we've covered\n2. PERSONAL: Connect to reader's own experience\n3. QUESTIONS: Thought-provoking reflection questions\n4. GROWTH: How the reader has changed\n5. FORWARD: What's next`,
  conclusion: `1. RESTATE THESIS: In light of everything presented\n2. KEY TAKEAWAYS: The 3-5 most important points\n3. CALL TO ACTION: What the reader must do now\n4. FINAL STORY: A closing story that encapsulates the message\n5. LAST LINE: Memorable, resonant, shareable`,
};

function nfChapterBody(chapter: ChapterPlan): string {
  const t = chapter.type ?? "theory";
  const template = NF_TEMPLATES[t] ?? NF_TEMPLATES.theory;
  let p = `═══ CHAPTER TYPE: ${t.toUpperCase()} ═══\n\n`;
  p += `STRUCTURE:\n${template}\n\n`;
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  return p;
}

function howtoChapterBody(chapter: ChapterPlan): string {
  let p = `═══ SKILL LEVEL: ${(chapter.difficulty ?? "beginner").toUpperCase()} ═══\n\n`;
  p += `STRUCTURE:\n`;
  p += `1. INTRODUCTION: What you'll learn and why it matters\n`;
  p += `2. MATERIALS/PREREQUISITES: Everything needed before starting\n`;
  p += `3. STEP-BY-STEP INSTRUCTIONS:\n   - Each step: clear action + expected result\n   - Number every step\n   - One action per step\n   - Include photos/diagrams description\n`;
  p += `4. COMMON MISTAKES: What goes wrong and how to fix it\n`;
  p += `5. PRO TIPS: Insider knowledge from experts\n`;
  p += `6. PRACTICE EXERCISE: Hands-on activity to reinforce skill\n`;
  p += `7. TROUBLESHOOTING: FAQ and solutions\n`;
  p += `8. WHAT'S NEXT: Preview of next skill/chapter\n\n`;
  if (chapter.safetyNotes) {
    p += `⚠ SAFETY: This chapter involves techniques that require safety awareness. Include safety warnings at appropriate points.\n\n`;
  }
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  return p;
}

function kidsChapterBody(chapter: ChapterPlan, config: BookConfig): string {
  let p = `═══ PAGE/CHAPTER ${chapter.number} ═══\n\n`;
  p += `STRUCTURE:\n`;
  p += `1. TEXT: Age-appropriate narrative (target: ${config.wordsPerChapter} words max)\n`;
  p += `2. ILLUSTRATION DIRECTION: Describe what the illustrator should draw\n`;
  p += `3. EMOTIONAL BEAT: What should the child feel at this point?\n`;
  p += `4. INTERACTIVE ELEMENT: Question, repetition, or sound play\n\n`;
  p += `RULES:\n- Read every sentence aloud mentally — does it flow?\n- Use rhythm, rhyme, and repetition\n- Show emotions through actions, not labels\n- Keep it fun, warm, and engaging\n- End with anticipation for next page/chapter\n\n`;
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  return p;
}

function cookbookChapterBody(chapter: ChapterPlan): string {
  let p = `═══ CHAPTER: ${(chapter.category ?? "").toUpperCase()} ═══\n\n`;
  p += `RECIPES IN THIS CHAPTER: ${chapter.recipesCount}\n\n`;
  p += `CHAPTER STRUCTURE:\n`;
  p += `1. CHAPTER INTRODUCTION: Cultural context, technique overview, personal connection\n`;
  p += `2. RECIPES (×${chapter.recipesCount}), each with:\n`;
  p += `   a. TITLE + HEADNOTE (personal story or technique context, 100-200 words)\n`;
  p += `   b. TIMES: Prep / Cook / Total\n`;
  p += `   c. SERVINGS + DIFFICULTY LEVEL\n`;
  p += `   d. INGREDIENTS: Listed in order of use, metric + imperial\n`;
  p += `   e. METHOD: Numbered steps, one action each\n`;
  p += `   f. CHEF'S NOTES: Tips, substitutions, storage, make-ahead\n`;
  p += `   g. PHOTO DIRECTION: Describe ideal plating\n`;
  p += `3. CHAPTER CLOSING: Common techniques, variations, encouragement\n\n`;
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  return p;
}

function textbookChapterBody(chapter: ChapterPlan): string {
  let p = `═══ LESSON ${chapter.number} ═══\n\n`;
  p += `STRUCTURE:\n`;
  p += `1. LEARNING OBJECTIVES: 3-5 clear, measurable objectives\n`;
  p += `2. KEY TERMS: Vocabulary with definitions\n`;
  p += `3. CONCEPT EXPLANATION: Theory with examples\n`;
  p += `4. WORKED EXAMPLES: Step-by-step demonstrations\n`;
  p += `5. REAL-WORLD APPLICATION: How this applies in practice\n`;
  p += `6. PRACTICE EXERCISES: 5-10 problems with increasing difficulty\n`;
  p += `7. REVIEW QUESTIONS: 5 questions testing understanding\n`;
  p += `8. CHAPTER SUMMARY: Key points recap\n`;
  p += `9. LOOKING AHEAD: Bridge to next lesson\n\n`;
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  return p;
}

function memoirChapterBody(chapter: ChapterPlan): string {
  let p = `═══ EPISODE ${chapter.number} ═══\n\n`;
  p += `STRUCTURE:\n`;
  p += `1. SCENE: Drop into a specific moment with full sensory detail\n`;
  p += `2. NARRATIVE: Tell what happened with emotional honesty\n`;
  p += `3. VOICE: Use your authentic voice — raw, specific, real\n`;
  p += `4. DIALOGUE: Reconstruct conversations naturally\n`;
  p += `5. REFLECTION: Connect this moment to larger meaning\n`;
  p += `6. THEME: Weave in the book's central theme\n\n`;
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  return p;
}

function poetryChapterBody(chapter: ChapterPlan, config: BookConfig): string {
  let p = `═══ POEM ${chapter.number} ═══\n\n`;
  p += `INSTRUCTIONS:\n`;
  p += `- Write one poem of ${config.wordsPerChapter} words or fewer\n`;
  p += `- Use concrete, specific imagery (not abstract)\n`;
  p += `- Every word must earn its place\n`;
  p += `- Intentional line breaks that create meaning\n`;
  p += `- Read aloud mentally — does it sound right?\n`;
  p += `- End with resonance — the poem should echo after reading\n\n`;
  p += `MUST INCLUDE:\n`;
  chapter.mustHave.forEach((h) => (p += `  ✓ ${h}\n`));
  return p;
}
export function generateChapterPrompt(
  config: BookConfig,
  architecture: Architecture,
  chapterIndex: number,
  continuity?: ContinuityState
): string {
  const previousSummary = continuity?.previousSummary;
  const storyBible = continuity?.storyBible;
  const chapter = architecture.chapters[chapterIndex];
  const prevChapter = chapterIndex > 0 ? architecture.chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex < architecture.chapters.length - 1 ? architecture.chapters[chapterIndex + 1] : null;

  let p = `═══ CHAPTER ${chapter.number} WRITING PROMPT ═══\n\n`;
  p += `BOOK: "${config.title}" — ${config.subGenre.replace(/_/g, " ")}\n`;
  p += `PREMISE: ${config.thesis}\n`;
  p += `CHAPTER: ${chapter.number} of ${config.chapters}\n`;
  p += `TYPE: ${chapter.type ?? chapter.sceneType ?? "section"}\n`;
  p += `PURPOSE: ${chapter.purpose}\n`;
  p += `WORD TARGET: ~${chapter.wordTarget} words (±20%; let the content set the exact length)\n\n`;

  // Continuity: prefer an explicit pasted STATE, else rely on the session's running STATE block.
  if (storyBible && storyBible.trim()) {
    p += `═══ STORY BIBLE / CONTINUITY STATE (source of truth) ═══\n`;
    p += `${storyBible.trim()}\n`;
    p += `→ Stay consistent with every name, fact, place, rule, and open thread above; don't contradict or re-introduce them.\n\n`;
  } else if (chapter.number > 1) {
    p += `═══ CONTINUITY ═══\n`;
    p += `→ Read the latest <<<STATE>>> block from earlier in this chat and stay consistent with it.\n`;
    p += `→ If no STATE exists yet, reconstruct it from the chapters written so far.\n\n`;
  }

  const parsedOutline = config.outline ? parseOutline(config.outline) : null;
  const chapterBeat = parsedOutline?.get(chapter.number);
  if (chapterBeat) {
    p += `═══ PLANNED BEAT — Chapter ${chapter.number} (from your outline) ═══\n`;
    p += `${chapterBeat}\n`;
    p += `→ Write THIS specific beat. The TYPE/PURPOSE above is only the structural role.\n\n`;
  } else if (config.outline && config.outline.trim() && (parsedOutline?.size ?? 0) === 0) {
    // Unstructured outline → include it wholesale.
    p += `═══ PLANNED OUTLINE (follow the part relevant to Chapter ${chapter.number}) ═══\n`;
    p += `${config.outline.trim()}\n\n`;
  }

  if (prevChapter) {
    p += `═══ PREVIOUS CHAPTER (Ch.${prevChapter.number}) CONTEXT ═══\n`;
    p += `Type: ${prevChapter.type ?? prevChapter.sceneType}\n`;
    p += `Purpose: ${prevChapter.purpose}\n`;
    if (previousSummary) {
      p += `What happened (carry-forward summary):\n${previousSummary}\n`;
    }
    p += `→ Build on what was established. Don't repeat information.\n`;
    p += `→ Maintain continuity of tone, character state, and timeline.\n\n`;
  }

  switch (config.type) {
    case "novel":
      p += novelChapterBody(chapter);
      break;
    case "nonfiction":
      p += nfChapterBody(chapter);
      break;
    case "howto":
      p += howtoChapterBody(chapter);
      break;
    case "kids":
      p += kidsChapterBody(chapter, config);
      break;
    case "cookbook":
      p += cookbookChapterBody(chapter);
      break;
    case "textbook":
      p += textbookChapterBody(chapter);
      break;
    case "memoir":
      p += memoirChapterBody(chapter);
      break;
    case "poetry":
      p += poetryChapterBody(chapter, config);
      break;
  }

  if (nextChapter) {
    p += `\n═══ TRANSITION TO CHAPTER ${nextChapter.number} ═══\n`;
    p += `Next chapter: ${nextChapter.type ?? nextChapter.sceneType} — ${nextChapter.purpose}\n`;
    p += `→ End this chapter in a way that naturally leads to the next.\n`;
  }

  p += `\n═══ QUALITY CHECKLIST (verify before finalizing) ═══\n` + getQualityChecklist(config.type);
  p += `\n\nNow write Chapter ${chapter.number} in full. Output the chapter prose (Markdown), then the updated <<<STATE>>> block. No other commentary.`;
  return p;
}
export function generateOverviewPrompt(config: BookConfig, architecture: Architecture): string {
  const type = BOOK_TYPES[config.type];
  let p = `═══ BOOK PLAN — "${config.title}" ═══\n\n`;
  p += `Send this once at the start of the writing session, after the Master System Prompt, to establish the full plan before Chapter 1.\n\n`;
  p += `TYPE: ${type.label} · SUB-GENRE: ${config.subGenre.replace(/_/g, " ")}\n`;
  p += `THESIS/PREMISE: ${config.thesis}\n`;
  p += `TARGET READER: ${config.reader}\n`;
  p += `STRUCTURE: ${config.chapters} chapters × ~${config.wordsPerChapter} words\n\n`;
  p += `═══ PARTS ═══\n`;
  p += architecture.parts
    .map((pp) => `• ${pp.name} — Chapters ${pp.chapters[0]}-${pp.chapters[1]}${pp.purpose ? ` — ${pp.purpose}` : ""}`)
    .join("\n");
  p += `\n\n═══ CHAPTER MAP ═══\n`;
  p += architecture.chapters
    .map((c) => `Ch.${c.number} [${c.type ?? c.sceneType ?? "section"}] — ${c.purpose}`)
    .join("\n");
  if (config.outline && config.outline.trim()) {
    p += `\n\n═══ AUTHOR'S OUTLINE / BEATS ═══\n${config.outline.trim()}`;
  }
  p += `\n\n═══ INITIALIZE CONTINUITY ═══\nCreate the initial <<<STATE>>> block (characters, world/facts, timeline, open threads${isFictionType(config.type) ? ", tension" : ""}) from this plan, and maintain it across every chapter per the Continuity Protocol in the system prompt.`;
  p += `\n\nConfirm you understand the plan and output the initial STATE block, then wait for the first chapter prompt. Do not write any chapter yet.`;
  return p;
}

export function generateAnalysisPrompt(config: BookConfig): string {
  const type = BOOK_TYPES[config.type];
  let p = `You are a rigorous ${type.label.toLowerCase()} editor analyzing a single chapter draft.\n\n`;
  p += `Target: ${config.wordsPerChapter} words (±20%), ${config.language} language, "${config.voice}" voice.\n\n`;
  p += `═══ METRICS TO EVALUATE ═══\n${getAnalysisMetrics(config.type)}\n\n`;
  p += `═══ OUTPUT FORMAT (JSON) ═══\n{\n  "scores": { /* each metric: 0-1 */ },\n  "overall_pass": true/false,\n  "strengths": [ /* list */ ],\n  "issues": [ /* list with severity */ ],\n  "revision_mode": "polish" | "strengthen_evidence" | "clarify" | "restructure" | "deepen" | "rewrite",\n  "specific_fixes": [ /* actionable instructions */ ]\n}\n\n`;
  p += `═══ DRAFT TO ANALYZE ═══\n[INSERT CHAPTER DRAFT HERE]`;
  return p;
}

export function generateRevisionPrompt(config: BookConfig): string {
  let p = `You are a master ${BOOK_TYPES[config.type].label.toLowerCase()} editor revising a chapter draft based on analysis feedback.\n\n`;
  p += getRevisionRules() + "\n\n";
  p += `═══ REVISION MODE: [SPECIFIED BY ANALYSIS] ═══\n\n`;
  p += `═══ SPECIFIC FIXES: [LISTED BY ANALYSIS] ═══\n\n`;
  p += `═══ ORIGINAL DRAFT ═══\n[INSERT DRAFT HERE]\n\n`;
  p += `═══ ANALYSIS FEEDBACK ═══\n[INSERT ANALYSIS REPORT HERE]\n\n`;
  p += `Output the complete revised chapter (no commentary).`;
  return p;
}

export function generateFrontMatterPrompt(config: BookConfig): string {
  let p = `Generate the front matter for "${config.title}":\n\n═══ INCLUDE ═══\n`;
  p += `1. TITLE PAGE: Title, subtitle (if any), author name\n`;
  p += `2. COPYRIGHT PAGE: © year, publisher, ISBN placeholder, rights statement\n`;
  p += `3. DEDICATION: A brief, heartfelt dedication\n`;
  p += `4. EPIGRAPH: A relevant quote that sets the tone (optional)\n`;
  p += `5. TABLE OF CONTENTS: All chapters with titles\n`;
  if (config.type === "nonfiction" || config.type === "howto" || config.type === "textbook") {
    p += `6. PREFACE: Why you wrote this book, your credentials, who it's for\n7. ACKNOWLEDGMENTS: Thank contributors, reviewers, supporters\n`;
  } else if (config.type === "novel") {
    p += `6. MAP (description): If applicable, describe world map\n`;
  }
  p += `\n═══ STYLE: ${config.voice} voice, matching the book's tone ═══\n═══ LANGUAGE: ${config.language} ═══`;
  return p;
}

export function generateBackMatterPrompt(config: BookConfig): string {
  let p = `Generate the back matter for "${config.title}":\n\n═══ INCLUDE ═══\n`;
  switch (config.type) {
    case "nonfiction":
    case "howto":
    case "textbook":
      p += `1. APPENDICES: Additional resources, templates, worksheets\n2. GLOSSARY: All technical terms with definitions\n3. BIBLIOGRAPHY/REFERENCES: All sources cited (${config.citationStyle} format)\n4. INDEX: Alphabetical topic index\n5. ABOUT THE AUTHOR: Brief professional bio\n6. ALSO BY: List of other works (placeholder)\n`;
      break;
    case "cookbook":
      p += `1. MEASUREMENT CONVERSION CHART\n2. GLOSSARY OF COOKING TERMS\n3. SEASONAL INGREDIENT GUIDE\n4. EQUIPMENT GUIDE\n5. INDEX: By ingredient, by cuisine, by difficulty\n6. ABOUT THE AUTHOR\n`;
      break;
    case "novel":
      p += `1. AUTHOR'S NOTE: Historical context, research, inspiration\n2. ACKNOWLEDGMENTS\n3. ABOUT THE AUTHOR\n4. BOOK CLUB QUESTIONS: 10 discussion questions\n5. PREVIEW: First chapter of next book (optional)\n`;
      break;
    case "kids":
      p += `1. ACTIVITY PAGES: Related activities\n2. PARENT/TEACHER GUIDE: Discussion questions\n3. ABOUT THE AUTHOR/ILLUSTRATOR\n`;
      break;
    case "memoir":
      p += `1. WHERE ARE THEY NOW: Updates on key people\n2. AUTHOR'S NOTE: What was changed for privacy\n3. PHOTOGRAPHS (described): Key images referenced in text\n4. ACKNOWLEDGMENTS\n5. ABOUT THE AUTHOR\n`;
      break;
    case "poetry":
      p += `1. NOTES: Context for specific poems\n2. ACKNOWLEDGMENTS: Previously published poems\n3. ABOUT THE AUTHOR\n`;
      break;
  }
  return p;
}

export function generateFeedbackChainPrompt(config: BookConfig): string {
  let p = `You are analyzing a completed chapter to generate feedback for the NEXT chapter.\n\n`;
  p += `═══ ANALYZE AND PROVIDE ═══\n\n`;
  p += `1. STATE CARRY-FORWARD: What facts, characters, concepts, terms, and ending state were established?\n`;
  p += `2. ISSUES TO ADDRESS: Unresolved questions, unsupported claims, tone inconsistencies, missing elements?\n`;
  p += `3. INSTRUCTIONS FOR NEXT CHAPTER: What to build on, what to avoid repeating, what tone to maintain, specific improvements.\n`;
  p += `4. QUALITY SCORES: Overall quality (0-1); ready for next chapter (yes/no); if no, what must be fixed first?\n`;
  if (config.type === "novel" || config.type === "memoir" || config.type === "kids") {
    p += `\n5. FICTION-SPECIFIC: Character states at chapter end; tension level and direction; unresolved plot threads; foreshadowing planted.`;
  } else {
    p += `\n5. NON-FICTION-SPECIFIC: Thesis proof progress; evidence used; reader-journey milestone check; counter-arguments addressed.`;
  }
  p += `\n\n═══ CHAPTER DRAFT TO ANALYZE ═══\n[INSERT COMPLETED CHAPTER HERE]`;
  return p;
}
