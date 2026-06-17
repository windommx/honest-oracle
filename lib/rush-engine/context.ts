import { BOOK_TYPES } from "./book-types";
import type { BookConfig } from "./types";
import { getCitationGuide, getQualityStandards, getWritingRules } from "./standards";

function buildFictionContext(c: BookConfig): string {
  let ctx = `═══ FICTION ENGINE CONTEXT ═══\n\n`;
  ctx += `GENRE: ${c.subGenre}\n`;
  ctx += `STRUCTURE: Three-Act Structure (modified for ${c.subGenre})\n\n`;
  ctx += `CHARACTER REQUIREMENTS:\n`;
  ctx += `- Protagonist: Deep internal desire + external goal + fatal flaw\n`;
  ctx += `- Antagonist: Equal force, understandable motivation\n`;
  ctx += `- Supporting cast: Each serves plot + theme\n`;
  ctx += `- ALL characters must have: voice, body language, contradictions\n\n`;
  ctx += `WORLD REQUIREMENTS:\n`;
  ctx += `- Specific sensory details (not generic)\n`;
  ctx += `- Time, place, social context established early\n`;
  ctx += `- Setting reflects and amplifies theme\n\n`;
  ctx += `TENSION SYSTEM:\n`;
  ctx += `- Every scene must have conflict (external/internal/interpersonal)\n`;
  ctx += `- Tension escalates across chapters\n`;
  ctx += `- Each chapter ends with hook (question, revelation, reversal)\n\n`;
  ctx += `PROSE RULES:\n`;
  ctx += `- Show-don't-tell ratio: ≥ 70% show, ≤ 30% tell\n`;
  ctx += `- Sensory details: ≥ 2 senses per scene\n`;
  ctx += `- Dialogue: advances plot OR reveals character (never filler)\n`;
  ctx += `- No purple prose, no clichés, no adverb-heavy sentences\n`;
  return ctx;
}

function buildNonFictionContext(c: BookConfig): string {
  let ctx = `═══ NON-FICTION ENGINE CONTEXT ═══\n\n`;
  ctx += `FRAMEWORK PATTERN: Process Steps (DEPTH System model)\n\n`;
  ctx += `THESIS DECOMPOSITION:\n`;
  ctx += `- Main thesis: ${c.thesis}\n`;
  ctx += `- Sub-claims: Will be decomposed in architecture phase\n`;
  ctx += `- Counter-arguments: Will be identified and planned for rebuttal\n\n`;
  ctx += `CHAPTER TYPES AVAILABLE (12 types):\n`;
  ctx += `  hook | story | theory | evidence | case_study | practice |\n`;
  ctx += `  counter | synthesis | action | reflection | introduction | conclusion\n\n`;
  ctx += `ARGUMENT REQUIREMENTS:\n`;
  ctx += `- Every claim must have supporting evidence\n`;
  ctx += `- Evidence hierarchy: meta-analysis > RCT > cohort > case study > expert quote > anecdote\n`;
  ctx += `- Minimum 2 citations per claim\n`;
  ctx += `- Counter-arguments must be steelmanned then rebutted\n\n`;
  ctx += `PEDAGOGY REQUIREMENTS:\n`;
  ctx += `- Learning objectives at start of each chapter\n`;
  ctx += `- Key takeaways at end of each chapter\n`;
  ctx += `- ≥ 1 exercise per 3 chapters\n`;
  ctx += `- Progressive difficulty\n`;
  ctx += `- Examples, analogies, and visual descriptions\n\n`;
  ctx += `CLARITY REQUIREMENTS:\n`;
  ctx += `- Average sentence length: ≤ 25 words\n`;
  ctx += `- All jargon defined on first use\n`;
  ctx += `- Logic connections explicit between paragraphs\n`;
  return ctx;
}

function buildKidsContext(c: BookConfig): string {
  const ageMap: Record<string, string> = {
    picture_book: "2-5",
    early_reader: "5-7",
    chapter_book: "7-10",
    middle_grade: "8-12",
    educational: "5-10",
    bedtime: "2-6",
  };
  const age = ageMap[c.subGenre] ?? "5-8";
  let ctx = `═══ CHILDREN'S BOOK ENGINE CONTEXT ═══\n\n`;
  ctx += `AGE GROUP: ${age} years\n`;
  ctx += `SUB-GENRE: ${c.subGenre.replace(/_/g, " ")}\n\n`;
  ctx += `VOCABULARY RULES:\n`;
  if (age.startsWith("2") || age.startsWith("3")) {
    ctx += `- Max 500 unique words\n- Sentences: 3-8 words avg\n- Repetition encouraged\n`;
  } else if (age.startsWith("5") || age.startsWith("6")) {
    ctx += `- Max 1500 unique words\n- Sentences: 5-12 words avg\n- Simple compound sentences OK\n`;
  } else {
    ctx += `- Max 5000 unique words\n- Sentences: 8-15 words avg\n- Complex sentences introduced\n`;
  }
  ctx += `\nPAGE RULES:\n`;
  ctx += `- Picture book: 32 pages standard, 1-3 sentences per page\n`;
  ctx += `- Chapter book: 1000-2500 words per chapter\n\n`;
  ctx += `ILLUSTRATION NOTES:\n`;
  ctx += `- Every spread needs illustration direction\n`;
  ctx += `- Visual storytelling complements (not duplicates) text\n`;
  ctx += `- Diverse representation in characters\n\n`;
  ctx += `READ-ALOUD QUALITY:\n`;
  ctx += `- Rhythm and cadence tested by reading aloud\n`;
  ctx += `- Onomatopoeia and sound play encouraged\n`;
  ctx += `- Refrains and repeated phrases for engagement\n`;
  return ctx;
}

function buildCookbookContext(c: BookConfig): string {
  let ctx = `═══ COOKBOOK ENGINE CONTEXT ═══\n\n`;
  ctx += `CUISINE FOCUS: ${c.subGenre.replace(/_/g, " ")}\n\n`;
  ctx += `RECIPE FORMAT:\n`;
  ctx += `- Title + headnote (story/context)\n`;
  ctx += `- Prep time + cook time + servings\n`;
  ctx += `- Ingredients: metric + imperial, listed in order of use\n`;
  ctx += `- Steps: numbered, one action per step\n`;
  ctx += `- Chef's notes: tips, substitutions, make-ahead\n\n`;
  ctx += `CHAPTER STRUCTURE:\n`;
  ctx += `- Each chapter: 8-15 recipes grouped by theme\n`;
  ctx += `- Chapter intro: cultural context + technique overview\n`;
  ctx += `- Recipe headnotes: personal story or technique tip\n\n`;
  ctx += `SAFETY RULES:\n`;
  ctx += `- All temperatures specified (°C and °F)\n`;
  ctx += `- Allergen warnings where applicable\n`;
  ctx += `- Food safety notes for raw proteins\n`;
  return ctx;
}

function buildMemoirContext(c: BookConfig): string {
  let ctx = `═══ MEMOIR ENGINE CONTEXT ═══\n\n`;
  ctx += `LIFE SCOPE: ${c.thesis}\n\n`;
  ctx += `VOICE RULES:\n`;
  ctx += `- Authentic first-person voice\n`;
  ctx += `- Present tense for immediacy, past for reflection\n`;
  ctx += `- Honest vulnerability without self-pity\n\n`;
  ctx += `SCENE RULES:\n`;
  ctx += `- Show don't tell (especially emotions)\n`;
  ctx += `- Specific sensory details from memory\n`;
  ctx += `- Dialogue reconstructed in natural voice\n\n`;
  ctx += `THEME THREADING:\n`;
  ctx += `- Central theme woven through every chapter\n`;
  ctx += `- Reflection sections connect past to present meaning\n`;
  return ctx;
}

function buildPoetryContext(c: BookConfig): string {
  let ctx = `═══ POETRY ENGINE CONTEXT ═══\n\n`;
  ctx += `STYLE: ${c.subGenre.replace(/_/g, " ")}\n\n`;
  ctx += `VOICE: Distinctive, consistent speaker persona\n\n`;
  ctx += `IMAGERY RULES:\n`;
  ctx += `- Concrete over abstract\n`;
  ctx += `- Surprising, original metaphors\n`;
  ctx += `- Sensory specificity\n\n`;
  ctx += `SOUND RULES:\n`;
  ctx += `- Read aloud test for every poem\n`;
  ctx += `- Intentional line breaks\n`;
  ctx += `- Internal rhyme / consonance / assonance where effective\n`;
  return ctx;
}

// ═══════════════════════════════════════════════════════════════
//  U_1 — GLOBAL CONTEXT
// ═══════════════════════════════════════════════════════════════

export function buildGlobalContext(config: BookConfig): string {
  const type = BOOK_TYPES[config.type];
  let context = `═══ RUSH ENGINE GLOBAL CONTEXT ═══\n\n`;
  context += `BOOK TYPE: ${type.label}\n`;
  context += `TITLE: ${config.title}\n`;
  context += `THESIS/PREMISE: ${config.thesis}\n`;
  context += `TARGET READER: ${config.reader}\n`;
  context += `AUTHOR VOICE: ${config.voice}\n`;
  context += `LANGUAGE: ${config.language}\n`;
  context += `CHAPTERS: ${config.chapters}\n`;
  context += `WORDS PER CHAPTER: ${config.wordsPerChapter}\n`;
  context += `SUB-GENRE: ${config.subGenre}\n\n`;

  switch (config.type) {
    case "novel":
      context += buildFictionContext(config);
      break;
    case "nonfiction":
    case "howto":
    case "textbook":
      context += buildNonFictionContext(config);
      break;
    case "kids":
      context += buildKidsContext(config);
      break;
    case "cookbook":
      context += buildCookbookContext(config);
      break;
    case "memoir":
      context += buildMemoirContext(config);
      break;
    case "poetry":
      context += buildPoetryContext(config);
      break;
    default:
      context += buildNonFictionContext(config);
  }

  context += `\n═══ WRITING RULES ═══\n` + getWritingRules(config);
  context += `\n═══ CITATION STYLE: ${config.citationStyle} ═══\n` + getCitationGuide(config.citationStyle);
  context += `\n═══ QUALITY STANDARDS ═══\n` + getQualityStandards(config.type);
  return context;
}
