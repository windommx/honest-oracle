// ╔══════════════════════════════════════════════════════════════════╗
// ║  RUSH ENGINE — Universal Book Generation (TypeScript port)         ║
// ║  Pure / isomorphic: usable from both the React UI and API routes.  ║
// ╚══════════════════════════════════════════════════════════════════╝

export type BookTypeKey =
  | "novel"
  | "nonfiction"
  | "howto"
  | "kids"
  | "cookbook"
  | "textbook"
  | "memoir"
  | "poetry";

export type Language = "thai" | "english" | "bilingual";

export interface PipelineStage {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export interface BookType {
  icon: string;
  label: string;
  sub_genres: string[];
  engine: string;
  default_chapters: number;
  default_words: number;
  structures: string[];
  analysis_focus: string[];
  pipeline_stages: PipelineStage[];
}

export interface BookConfig {
  type: BookTypeKey;
  title: string;
  thesis: string;
  reader: string;
  voice: string;
  chapters: number;
  wordsPerChapter: number;
  subGenre: string;
  citationStyle: string;
  language: Language;
}

export interface ChapterPlan {
  number: number;
  type?: string;
  sceneType?: string;
  act?: number;
  difficulty?: string;
  category?: string;
  recipesCount?: number;
  purpose: string;
  wordTarget: number;
  tensionLevel?: number;
  mustHave: string[];
  [key: string]: unknown;
}

export interface PartPlan {
  name: string;
  chapters: [number, number];
  purpose?: string;
  [key: string]: unknown;
}

export interface Architecture {
  type: BookTypeKey;
  title: string;
  chapters: ChapterPlan[];
  parts: PartPlan[];
  characterArcs?: Record<string, unknown> | null;
  tensionMap?: Array<{ chapter: number; tension: number }> | null;
  readerJourney?: Record<string, unknown> | null;
  thesisProofMap?: Record<string, unknown> | null;
  evidencePlan?: Record<string, unknown> | null;
  pedagogyPlan?: Record<string, unknown> | null;
}

// ═══════════════════════════════════════════════════════════════
//  BOOK TYPE REGISTRY
// ═══════════════════════════════════════════════════════════════

export const BOOK_TYPES: Record<BookTypeKey, BookType> = {
  novel: {
    icon: "📖",
    label: "Novel / Fiction",
    sub_genres: ["literary", "thriller", "romance", "sci-fi", "fantasy", "mystery", "horror", "historical", "adventure", "young_adult"],
    engine: "FictionEngine",
    default_chapters: 25,
    default_words: 4000,
    structures: ["three_act", "heros_journey", "kishotenketsu", "nonlinear"],
    analysis_focus: ["show_vs_tell", "voice_consistency", "sensory", "pacing", "emotion", "character_arc"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Assemble genre, world, characters, themes" },
      { id: "arch", name: "Book Architecture", icon: "🏗️", desc: "Three-act structure, character arcs, tension map" },
      { id: "chapter", name: "Chapter Prompt", icon: "📝", desc: "Generate scene-by-scene chapter prompts" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Prose Analysis", icon: "🔬", desc: "Show/tell, voice, sensory, pacing analysis" },
      { id: "revise", name: "Revision Loop", icon: "🔄", desc: "Auto-revise until quality gate passes" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile complete book" },
    ],
  },
  nonfiction: {
    icon: "📚",
    label: "Non-Fiction",
    sub_genres: ["self_help", "business", "science", "psychology", "history", "biography", "philosophy", "health", "technology", "social_science"],
    engine: "NonFictionEngine",
    default_chapters: 16,
    default_words: 3500,
    structures: ["problem_solution", "chronological", "spiral", "process_steps", "comparative", "theory_practice", "case_driven", "question_answer", "thematic", "principle_based"],
    analysis_focus: ["argument_strength", "evidence", "clarity", "logic", "pedagogy"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Assemble thesis, framework, sources, voice" },
      { id: "arch", name: "Book Architecture", icon: "🏗️", desc: "Thesis decomposition, argument flow, evidence plan" },
      { id: "chapter", name: "Chapter Prompt", icon: "📝", desc: "Type-aware chapter prompts" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Argument Analysis", icon: "🔬", desc: "Claims, evidence, clarity, logic analysis" },
      { id: "revise", name: "Revision Loop", icon: "🔄", desc: "Strengthen evidence, fix logic, add pedagogy" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile + verify thesis fully proven" },
    ],
  },
  howto: {
    icon: "🔧",
    label: "How-To / Guide",
    sub_genres: ["diy", "crafts", "technology", "finance", "career", "fitness", "cooking", "gardening", "home_repair", "personal_dev"],
    engine: "HowToEngine",
    default_chapters: 12,
    default_words: 2500,
    structures: ["sequential_steps", "skill_levels", "project_based", "problem_solution"],
    analysis_focus: ["clarity", "actionability", "step_completeness", "safety", "practicality"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Skill scope, prerequisites, outcomes" },
      { id: "arch", name: "Book Architecture", icon: "🏗️", desc: "Skill progression, project breakdown" },
      { id: "chapter", name: "Chapter Prompt", icon: "📝", desc: "Step-by-step chapter prompts" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Clarity Analysis", icon: "🔬", desc: "Step completeness, actionability check" },
      { id: "revise", name: "Revision Loop", icon: "🔄", desc: "Fix missing steps, add safety notes" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile with tool lists and appendices" },
    ],
  },
  kids: {
    icon: "🧸",
    label: "Children's Book",
    sub_genres: ["picture_book", "early_reader", "chapter_book", "middle_grade", "educational", "bedtime", "adventure", "moral_stories", "activity_book", "bilingual_kids"],
    engine: "KidsEngine",
    default_chapters: 10,
    default_words: 800,
    structures: ["simple_three_act", "repetition", "cumulative", "circular", "question_answer"],
    analysis_focus: ["age_appropriateness", "vocabulary", "engagement", "illustration_notes", "read_aloud_flow"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Age group, theme, vocabulary level" },
      { id: "arch", name: "Book Architecture", icon: "🏗️", desc: "Story arc, character design, page layout" },
      { id: "chapter", name: "Page/Chapter Prompt", icon: "📝", desc: "Scene-by-scene with illustration notes" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Age Check Analysis", icon: "🔬", desc: "Vocabulary, length, engagement analysis" },
      { id: "revise", name: "Revision Loop", icon: "🔄", desc: "Simplify language, enhance rhythm" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile with illustration guide" },
    ],
  },
  cookbook: {
    icon: "🍳",
    label: "Cookbook",
    sub_genres: ["thai_cuisine", "baking", "healthy", "quick_meals", "vegetarian", "desserts", "street_food", "regional", "fusion", "meal_prep"],
    engine: "CookbookEngine",
    default_chapters: 10,
    default_words: 2000,
    structures: ["course_order", "cuisine_journey", "skill_progression", "seasonal", "theme_based"],
    analysis_focus: ["recipe_clarity", "ingredient_accuracy", "timing", "technique_explanation", "safety"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Cuisine scope, skill level, dietary focus" },
      { id: "arch", name: "Book Architecture", icon: "🏗️", desc: "Chapter grouping, recipe selection" },
      { id: "chapter", name: "Chapter Prompt", icon: "📝", desc: "Recipe cluster prompts with stories" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Recipe Analysis", icon: "🔬", desc: "Clarity, completeness, accuracy" },
      { id: "revise", name: "Revision Loop", icon: "🔄", desc: "Fix measurements, add tips" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile with index and glossary" },
    ],
  },
  textbook: {
    icon: "🎓",
    label: "Textbook / Academic",
    sub_genres: ["mathematics", "science", "language", "history", "computer_science", "economics", "law", "medicine", "engineering", "arts"],
    engine: "TextbookEngine",
    default_chapters: 12,
    default_words: 5000,
    structures: ["prerequisite_chain", "concept_spiral", "modular", "theory_lab"],
    analysis_focus: ["accuracy", "pedagogy", "progression", "assessment", "exercises"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Curriculum scope, level, standards" },
      { id: "arch", name: "Book Architecture", icon: "🏗️", desc: "Concept dependency graph, assessment plan" },
      { id: "chapter", name: "Chapter Prompt", icon: "📝", desc: "Lesson prompts with exercises" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Academic Analysis", icon: "🔬", desc: "Accuracy, pedagogy, progression" },
      { id: "revise", name: "Revision Loop", icon: "🔄", desc: "Fix errors, add exercises" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile with answer keys, index" },
    ],
  },
  memoir: {
    icon: "🖊️",
    label: "Memoir / Biography",
    sub_genres: ["personal_memoir", "celebrity", "historical_figure", "family", "travel", "survival", "creative_life", "business_leader", "athlete", "spiritual"],
    engine: "MemoirEngine",
    default_chapters: 20,
    default_words: 3500,
    structures: ["chronological", "thematic", "flashback", "episodic", "coming_of_age"],
    analysis_focus: ["authenticity", "emotional_truth", "narrative_arc", "voice", "scene_craft"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Life scope, themes, voice" },
      { id: "arch", name: "Book Architecture", icon: "🏗️", desc: "Timeline, theme threading, arc" },
      { id: "chapter", name: "Chapter Prompt", icon: "📝", desc: "Episode/milestone prompts" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Voice Analysis", icon: "🔬", desc: "Authenticity, emotion, narrative" },
      { id: "revise", name: "Revision Loop", icon: "🔄", desc: "Deepen emotion, sharpen scenes" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile complete memoir" },
    ],
  },
  poetry: {
    icon: "🌸",
    label: "Poetry Collection",
    sub_genres: ["free_verse", "sonnets", "haiku", "narrative_poetry", "spoken_word", "prose_poetry", "ekphrastic", "confessional", "nature", "experimental"],
    engine: "PoetryEngine",
    default_chapters: 30,
    default_words: 200,
    structures: ["thematic_sections", "chronological", "mosaic", "call_response"],
    analysis_focus: ["imagery", "rhythm", "emotion", "economy", "sound"],
    pipeline_stages: [
      { id: "ctx", name: "Global Context", icon: "🌐", desc: "Theme, style, voice, forms" },
      { id: "arch", name: "Collection Architecture", icon: "🏗️", desc: "Section design, poem sequence" },
      { id: "chapter", name: "Poem Prompt", icon: "📝", desc: "Individual poem instructions" },
      { id: "write", name: "LLM Write", icon: "🤖", desc: "Draft generation via LLM" },
      { id: "analyze", name: "Poem Analysis", icon: "🔬", desc: "Imagery, rhythm, impact" },
      { id: "assemble", name: "Final Assembly", icon: "📚", desc: "Compile collection" },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
//  QUALITY STANDARDS / RULES / GUIDES
// ═══════════════════════════════════════════════════════════════

export function getQualityStandards(type: BookTypeKey): string {
  const standards: Record<string, string> = {
    novel: `- Show/tell: ≥ 70% show\n- Sensory: ≥ 2 senses per scene\n- Chapter hooks: required at every chapter end\n- Character consistency: tracked via codex\n- Voice consistency: tracked across chapters\n- Pacing: vary between fast/slow scenes\n- TENSION MUST ESCALATE across acts\n- Every scene: conflict + turning point + outcome`,
    nonfiction: `- Argument strength: ≥ 70% claims supported\n- Evidence: ≥ 2 citations per claim\n- Clarity score: ≥ 60%\n- Logic flow: no gaps between paragraphs\n- Pedagogy: objectives + takeaways + exercises\n- Counter-arguments: steelmanned then rebutted\n- THESIS MUST BE FULLY PROVEN by book end\n- All jargon defined on first use`,
    howto: `- Steps: complete, sequential, no gaps\n- Clarity: any reader can follow from step 1\n- Safety: all warnings clearly marked\n- Materials: complete list before steps begin\n- Troubleshooting: common mistakes addressed\n- Visual descriptions for key steps`,
    kids: `- Age-appropriate vocabulary\n- Read-aloud quality\n- Engaging rhythm and repetition\n- Positive, empowering message\n- Illustration notes for every spread\n- ≤ specified word count per page`,
    cookbook: `- Recipe format: standardized\n- Measurements: metric + imperial\n- Steps: one action per numbered step\n- Times: prep + cook + total\n- Allergens: clearly flagged\n- Substitutions offered`,
    textbook: `- Accuracy: all facts verified\n- Pedagogy: objectives + exercises + review\n- Progressive difficulty\n- Assessment questions per chapter\n- Real-world applications\n- Cross-references between chapters`,
    memoir: `- Emotional truth above all\n- Show don't tell for key moments\n- Authentic voice throughout\n- Specific sensory details\n- Theme threaded through every chapter\n- Reflection connects past to present`,
    poetry: `- Original imagery\n- Intentional line breaks\n- Read-aloud quality\n- Economy of language\n- Emotional resonance\n- Collection coherence`,
  };
  return standards[type] ?? standards.nonfiction;
}

function getWritingRules(c: BookConfig): string {
  switch (c.language) {
    case "thai":
      return `- เขียนภาษาไทยทั้งเล่ม\n- ใช้ภาษาทางการแต่เข้าถึงง่าย\n- หลีกเลี่ยงคำภาษาอังกฤษที่ไม่จำเป็น\n- ใช้ราชาศัพท์เฉพาะบริบทที่เหมาะสม\n`;
    case "english":
      return `- Write entirely in English\n- ${c.voice} voice throughout\n- Avoid passive voice where possible\n- Vary sentence length for rhythm\n`;
    case "bilingual":
      return `- Primary: Thai, with English where natural\n- Key terms: provide both Thai and English\n- Maintain voice consistency across languages\n`;
    default:
      return "";
  }
}

function getCitationGuide(style: string): string {
  const guides: Record<string, string> = {
    APA: "In-text: (Author, Year). Reference list at chapter/book end.",
    MLA: "In-text: (Author Page). Works Cited at end.",
    Chicago: "Footnotes with full source details.",
    inline: "Mention source naturally in prose. Full details in bibliography.",
    none: "No formal citations. Mention sources naturally where credibility matters.",
  };
  return guides[style] ?? guides.none;
}

// ═══════════════════════════════════════════════════════════════
//  CONTEXT BUILDERS (per type)
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
//  HELPERS for architecture
// ═══════════════════════════════════════════════════════════════

function calculateTension(ch: number, total: number): number {
  const x = ch / total;
  if (x <= 0.25) return 0.3 + x * 1.2;
  if (x <= 0.5) return 0.6 + (x - 0.25) * 0.8;
  if (x <= 0.75) return 0.7 + (x - 0.5) * 0.6;
  if (x <= 0.9) return 0.85 + (x - 0.75) * 0.67;
  return 0.95 - (x - 0.9) * 1.5;
}

function getMustHaves(sceneType: string): string[] {
  const map: Record<string, string[]> = {
    opening: ["compelling first line", "character desire", "world grounding", "hook"],
    setup: ["character flaw", "normal world", "relationships", "stakes hint"],
    turning_point: ["decision point", "commitment", "no return", "new world"],
    escalation: ["new challenge", "growth moment", "relationship shift", "stakes raised"],
    midpoint: ["revelation", "reversal", "stakes personal", "momentum shift"],
    complication: ["plan failure", "ally strain", "internal conflict", "dark approach"],
    dark_moment: ["lowest point", "inner demon", "seed of resolution", "choice"],
    pre_climax: ["resolve found", "final prep", "calm moment", "ready signal"],
    climax: ["final conflict", "internal test", "decisive action", "conflict resolution"],
    resolution: ["new normal", "transformation shown", "theme embodied", "final image"],
  };
  return map[sceneType] ?? ["conflict", "turning point", "sensory detail", "hook"];
}

function pickHookType(ch: number): string {
  const hooks = ["cliffhanger", "revelation", "question", "reversal", "image", "emotional", "ironic"];
  return hooks[ch % hooks.length];
}

function getNFChapterPurpose(type: string, num: number, total: number): string {
  if (num === 1) return "HOOK: Capture attention, establish the problem";
  if (num === total) return "CLOSE: Restate thesis, call to action, final story";
  const purposes: Record<string, string> = {
    story: "ILLUSTRATE: Make the problem real through narrative",
    theory: "EXPLAIN: Introduce a framework component with mechanism",
    evidence: "PROVE: Present research and data supporting a claim",
    case_study: "DEMONSTRATE: Show the framework working in reality",
    practice: "APPLY: Give reader hands-on exercise",
    counter: "REBUT: Address counter-arguments fairly",
    synthesis: "INTEGRATE: Show how all components work together",
    action: "IMPLEMENT: Structured plan for reader to take action",
    reflection: "INTERNALIZE: Connect content to reader's experience",
    introduction: "SETUP: Context, background, roadmap",
  };
  return purposes[type] ?? "DEVELOP: Advance the book's central argument";
}

function getNFMustHaves(type: string): string[] {
  const base = ["clear_purpose", "logical_flow", "engagement"];
  const extras: Record<string, string[]> = {
    introduction: ["hook", "problem_statement", "roadmap"],
    story: ["sensory_detail", "narrative_arc", "insight"],
    evidence: ["claim", "citations", "analysis"],
    theory: ["concept", "mechanism", "example", "analogy"],
    practice: ["objective", "steps", "exercise"],
    case_study: ["context", "narrative", "outcome", "lessons"],
    counter: ["steelmanning", "evidence", "rebuttal"],
    synthesis: ["review", "connections", "framework"],
    action: ["plan", "tools", "commitment"],
    reflection: ["personal_connection", "questions", "growth"],
  };
  return [...base, ...(extras[type] ?? [])];
}

// ═══════════════════════════════════════════════════════════════
//  U_2 — ARCHITECTURE (per type)
// ═══════════════════════════════════════════════════════════════

export function buildArchitecture(config: BookConfig): Architecture {
  const arch: Architecture = {
    type: config.type,
    title: config.title,
    chapters: [],
    parts: [],
  };

  switch (config.type) {
    case "novel":
      buildFictionArchitecture(arch, config);
      break;
    case "nonfiction":
      buildNonFictionArchitecture(arch, config);
      break;
    case "howto":
      buildHowToArchitecture(arch, config);
      break;
    case "kids":
      buildKidsArchitecture(arch, config);
      break;
    case "cookbook":
      buildCookbookArchitecture(arch, config);
      break;
    case "textbook":
      buildTextbookArchitecture(arch, config);
      break;
    case "memoir":
      buildMemoirArchitecture(arch, config);
      break;
    case "poetry":
      buildPoetryArchitecture(arch, config);
      break;
  }
  return arch;
}

function buildFictionArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  const act1End = Math.floor(ch * 0.25);
  const act2Mid = Math.floor(ch * 0.5);
  const act2End = Math.floor(ch * 0.75);

  arch.parts = [
    { name: "Act 1: Setup", chapters: [1, act1End], purpose: "Introduce world, characters, stakes" },
    { name: "Act 2A: Rising Action", chapters: [act1End + 1, act2Mid], purpose: "Escalate conflict, deepen relationships" },
    { name: "Act 2B: Complications", chapters: [act2Mid + 1, act2End], purpose: "Raise stakes, dark moment" },
    { name: "Act 3: Resolution", chapters: [act2End + 1, ch], purpose: "Climax, resolution, denouement" },
  ];

  for (let i = 1; i <= ch; i++) {
    let act: number, purpose: string, sceneType: string;
    if (i === 1) { act = 1; purpose = "HOOK: Drop reader into compelling scene"; sceneType = "opening"; }
    else if (i <= act1End) { act = 1; purpose = "ESTABLISH: World, character, stakes, inciting incident"; sceneType = "setup"; }
    else if (i === act1End + 1) { act = 2; purpose = "POINT OF NO RETURN: Protagonist commits"; sceneType = "turning_point"; }
    else if (i < act2Mid) { act = 2; purpose = "ESCALATE: Rising conflict, new allies/enemies"; sceneType = "escalation"; }
    else if (i === act2Mid) { act = 2; purpose = "MIDPOINT: Revelation or reversal"; sceneType = "midpoint"; }
    else if (i <= act2End) { act = 2; purpose = "COMPLICATE: Stakes highest, dark moment approaches"; sceneType = "complication"; }
    else if (i === act2End + 1) { act = 3; purpose = "DARK NIGHT: Protagonist at lowest"; sceneType = "dark_moment"; }
    else if (i === ch - 1) { act = 3; purpose = "CLIMAX: Final confrontation"; sceneType = "climax"; }
    else if (i === ch) { act = 3; purpose = "RESOLUTION: New normal, thematic statement"; sceneType = "resolution"; }
    else { act = 3; purpose = "GATHERING: Final preparation, allies assemble"; sceneType = "pre_climax"; }

    arch.chapters.push({
      number: i,
      act,
      purpose,
      sceneType,
      wordTarget: config.wordsPerChapter,
      tensionLevel: calculateTension(i, ch),
      mustHave: getMustHaves(sceneType),
      hookType: i < ch ? pickHookType(i) : null,
    });
  }

  arch.characterArcs = {
    protagonist: { start: "flawed", end: "transformed" },
    antagonist: { start: "threatening", end: "defeated/understood" },
  };
  arch.tensionMap = arch.chapters.map((c) => ({ chapter: c.number, tension: c.tensionLevel ?? 0 }));
  arch.readerJourney = {
    start: "curious, unfamiliar with world",
    milestones: [
      { after: act1End, state: "invested in protagonist" },
      { after: act2Mid, state: "deeply concerned about outcome" },
      { after: act2End, state: "anxious, needs resolution" },
      { after: ch, state: "satisfied, emotionally moved" },
    ],
    end: "transformed by the experience",
  };
}

function buildNonFictionArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.thesisProofMap = { mainThesis: config.thesis, proofCompleteness: 0 };

  const nfChapterTypes = [
    "introduction", "story", "evidence", "theory", "practice",
    "case_study", "evidence", "practice", "theory", "practice",
    "evidence", "counter", "synthesis", "action", "conclusion", "epilogue",
  ];

  const partSize = Math.ceil(ch / 3);
  arch.parts = [
    { name: "Foundation", chapters: [1, partSize], thesisPhase: "hook_and_context" },
    { name: "Deepening", chapters: [partSize + 1, partSize * 2], thesisPhase: "evidence_and_framework" },
    { name: "Transformation", chapters: [partSize * 2 + 1, ch], thesisPhase: "proof_and_action" },
  ];

  for (let i = 1; i <= ch; i++) {
    const chType = nfChapterTypes[(i - 1) % nfChapterTypes.length];
    arch.chapters.push({
      number: i,
      type: chType,
      purpose: getNFChapterPurpose(chType, i, ch),
      wordTarget: config.wordsPerChapter,
      mustHave: getNFMustHaves(chType),
    });
  }

  arch.evidencePlan = {
    totalSourcesNeeded: ch * 3,
    distribution: "even across chapters",
    hierarchy: ["meta_analysis", "randomized_trial", "cohort_study", "case_study", "expert_quote", "anecdote"],
  };
  arch.readerJourney = {
    start: "problem_unaware",
    milestones: [
      { after: Math.floor(ch * 0.2), state: "problem_felt" },
      { after: Math.floor(ch * 0.4), state: "framework_visible" },
      { after: Math.floor(ch * 0.6), state: "evidence_convinced" },
      { after: Math.floor(ch * 0.8), state: "ready_to_apply" },
      { after: ch, state: "transformed" },
    ],
    end: "practitioner",
  };
  arch.pedagogyPlan = {
    exercisesCount: Math.floor(ch * 0.6),
    progressiveDifficulty: true,
    includeWorkbook: ch >= 12,
    summaryEveryChapter: true,
  };
}

function buildHowToArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [
    { name: "Getting Started", chapters: [1, Math.ceil(ch * 0.25)] },
    { name: "Core Skills", chapters: [Math.ceil(ch * 0.25) + 1, Math.ceil(ch * 0.6)] },
    { name: "Advanced Techniques", chapters: [Math.ceil(ch * 0.6) + 1, Math.ceil(ch * 0.85)] },
    { name: "Putting It All Together", chapters: [Math.ceil(ch * 0.85) + 1, ch] },
  ];
  for (let i = 1; i <= ch; i++) {
    const progress = i / ch;
    const difficulty = progress < 0.25 ? "beginner" : progress < 0.6 ? "intermediate" : progress < 0.85 ? "advanced" : "mastery";
    arch.chapters.push({
      number: i,
      type: i === 1 ? "introduction" : i === ch ? "conclusion" : "skill_step",
      difficulty,
      purpose: `Teach skill level: ${difficulty}`,
      wordTarget: config.wordsPerChapter,
      mustHave: ["materials_list", "step_by_step", "troubleshooting", "tips"],
      safetyNotes: difficulty !== "beginner",
    });
  }
}

function buildKidsArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [{ name: "Full Story", chapters: [1, ch] }];
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "page_spread",
      purpose: i === 1 ? "Introduce character & world" : i === ch ? "Satisfying resolution" : "Story progression",
      wordTarget: config.wordsPerChapter,
      illustrationNotes: true,
      readAloudQuality: true,
      mustHave: ["rhythm", "engagement", "illustration_direction"],
    });
  }
}

function buildCookbookArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  const categories = ["appetizers", "soups", "mains", "salads", "desserts", "breads", "sauces", "drinks", "special_occasion", "basics"];
  arch.parts = [{ name: "Complete Collection", chapters: [1, ch] }];
  for (let i = 1; i <= ch; i++) {
    const cat = categories[(i - 1) % categories.length];
    arch.chapters.push({
      number: i,
      type: "recipe_chapter",
      category: cat,
      purpose: `Chapter: ${cat.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase())}`,
      wordTarget: config.wordsPerChapter,
      recipesCount: 10, // deterministic (original used Math.random)
      mustHave: ["headnotes", "standardized_format", "chefs_tips", "photo_directions"],
    });
  }
}

function buildTextbookArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [
    { name: "Foundations", chapters: [1, Math.ceil(ch * 0.3)] },
    { name: "Core Concepts", chapters: [Math.ceil(ch * 0.3) + 1, Math.ceil(ch * 0.7)] },
    { name: "Advanced Topics", chapters: [Math.ceil(ch * 0.7) + 1, ch] },
  ];
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "lesson",
      purpose: `Lesson ${i}: Concept + Application`,
      wordTarget: config.wordsPerChapter,
      mustHave: ["learning_objectives", "explanation", "examples", "exercises", "review_questions", "summary"],
    });
  }
}

function buildMemoirArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [
    { name: "Origins", chapters: [1, Math.ceil(ch * 0.3)] },
    { name: "Journey", chapters: [Math.ceil(ch * 0.3) + 1, Math.ceil(ch * 0.7)] },
    { name: "Transformation", chapters: [Math.ceil(ch * 0.7) + 1, ch] },
  ];
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "memoir_episode",
      purpose:
        i === 1
          ? "Opening scene — drop reader into pivotal moment"
          : i === ch
          ? "Resolution — where I am now"
          : "Life episode with thematic resonance",
      wordTarget: config.wordsPerChapter,
      mustHave: ["sensory_detail", "emotional_truth", "reflection", "theme_connection"],
    });
  }
}

function buildPoetryArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  const sectionCount = Math.ceil(ch / 8);
  arch.parts = [];
  for (let s = 0; s < sectionCount; s++) {
    arch.parts.push({ name: `Section ${s + 1}`, chapters: [s * 8 + 1, Math.min((s + 1) * 8, ch)] });
  }
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "poem",
      purpose: `Poem ${i}`,
      wordTarget: config.wordsPerChapter,
      mustHave: ["original_imagery", "intentional_line_breaks", "read_aloud_quality"],
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  MASTER SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

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

═══ QUALITY RULES (MANDATORY) ═══
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
═══ OUTPUT FORMAT ═══
- Write the chapter content directly (no meta-commentary, no preamble like "Here is the chapter")
- Begin with the chapter title as a Markdown heading (## Chapter N: Title)
- Maintain consistent voice throughout
- Meet the word count target (±20%)
- End with a hook or transition appropriate to the chapter type
`;
  return p;
}

// ═══════════════════════════════════════════════════════════════
//  CHAPTER PROMPTS (per type)
// ═══════════════════════════════════════════════════════════════

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

function getQualityChecklist(type: BookTypeKey): string {
  const checklists: Record<string, string> = {
    novel: `  □ Show/tell ratio ≥ 70% show\n  □ ≥ 2 senses in every scene\n  □ Dialogue advances plot or reveals character\n  □ Chapter ends with hook\n  □ Character voices distinct\n  □ No clichés\n  □ Word count within target (±20%)\n  □ Tension appropriate for act position`,
    nonfiction: `  □ All claims supported by evidence\n  □ ≥ 2 citations in chapter\n  □ Jargon defined on first use\n  □ Logic flow between paragraphs\n  □ Pedagogy elements present\n  □ Tone consistent with author voice\n  □ Word count within target (±20%)`,
    howto: `  □ All steps complete and sequential\n  □ Materials list complete\n  □ Safety notes where needed\n  □ Common mistakes addressed\n  □ Visual descriptions included\n  □ Word count within target`,
    kids: `  □ Age-appropriate vocabulary\n  □ Read-aloud quality verified\n  □ Rhythm and repetition present\n  □ Illustration notes included\n  □ Positive message\n  □ Word count within target`,
    cookbook: `  □ Recipe format standardized\n  □ Measurements in metric + imperial\n  □ Ingredients in order of use\n  □ One action per step\n  □ Times and servings specified\n  □ Chef's notes included`,
    textbook: `  □ Learning objectives stated\n  □ Concepts clearly explained\n  □ Examples provided\n  □ Exercises included\n  □ Review questions present\n  □ Difficulty progression appropriate`,
    memoir: `  □ Emotional truth present\n  □ Sensory details in scenes\n  □ Authentic voice\n  □ Theme connection\n  □ Reflection included\n  □ Word count within target`,
    poetry: `  □ Concrete imagery\n  □ Intentional line breaks\n  □ Every word earns its place\n  □ Read-aloud quality\n  □ Original metaphors\n  □ Resonant ending`,
  };
  return checklists[type] ?? checklists.nonfiction;
}

export interface ContinuityState {
  previousSummary?: string;
  storyBible?: string;
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
  p += `CHAPTER: ${chapter.number} of ${config.chapters}\n`;
  p += `TYPE: ${chapter.type ?? chapter.sceneType ?? "section"}\n`;
  p += `PURPOSE: ${chapter.purpose}\n`;
  p += `WORD TARGET: ${chapter.wordTarget} words (±20%)\n\n`;

  if (storyBible && storyBible.trim()) {
    p += `═══ STORY BIBLE / CONTINUITY STATE (carry-forward) ═══\n`;
    p += `${storyBible.trim()}\n`;
    p += `→ Stay strictly consistent with every name, fact, place, rule, and unresolved thread above.\n`;
    p += `→ Do not contradict or re-introduce things already established.\n\n`;
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
  p += `\n\nNow write Chapter ${chapter.number} in full. Output only the chapter prose (Markdown), no commentary.`;
  return p;
}

// ═══════════════════════════════════════════════════════════════
//  ANALYSIS + REVISION + BIBLE (quality loop & continuity)
// ═══════════════════════════════════════════════════════════════

export function getAnalysisMetrics(type: BookTypeKey): string {
  if (type === "novel") {
    return `1. SHOW vs TELL: Is ≥70% showing (action/sensory/dialogue) vs telling?
2. SENSORY DETAIL: ≥2 distinct senses present?
3. VOICE CONSISTENCY: Narration voice consistent?
4. DIALOGUE QUALITY: Does each line advance plot or reveal character?
5. TENSION: Conflict present and escalating appropriately?
6. HOOK: Does the chapter end with a compelling hook?
7. PACING: Variation between fast and slow moments?
8. CHARACTER CONSISTENCY: Behaviour consistent with the story bible?
9. CLICHÉ: Any clichés or overused phrasing?
10. WORD COUNT: Within ±20% of target?`;
  }
  if (type === "kids") {
    return `1. AGE-APPROPRIATE VOCABULARY: Within the target reading level?
2. READ-ALOUD FLOW: Rhythm and cadence when read aloud?
3. ENGAGEMENT: Repetition, sound play, interactivity?
4. ILLUSTRATION NOTES: Present for each spread?
5. POSITIVE MESSAGE: Empowering, not preachy?
6. LENGTH: Within target word count?`;
  }
  if (type === "poetry") {
    return `1. IMAGERY: Concrete and original?
2. LINE BREAKS: Intentional and meaningful?
3. ECONOMY: Every word earns its place?
4. SOUND: Reads well aloud?
5. RESONANCE: Does it echo after reading?`;
  }
  return `1. ARGUMENT STRENGTH: Are claims supported by evidence? (0-1)
2. EVIDENCE QUALITY: Strength per the evidence hierarchy?
3. CLARITY: Sentence length, jargon defined, readability? (0-1)
4. LOGIC FLOW: Explicit connections between paragraphs?
5. PEDAGOGY: Objectives, examples, exercises, takeaways present?
6. TONE: Consistent with the author voice?
7. WORD COUNT: Within ±20% of target?
8. CONTRADICTIONS: Any conflict with the story bible / earlier chapters?
9. ENGAGEMENT: Examples, variety, actionable content?
10. CITATIONS: Sources attributed in the chosen style?`;
}

/** Instructions for the analysis pass. Pair with a json_schema output_config. */
export function generateAnalysisInstructions(config: BookConfig): string {
  const type = BOOK_TYPES[config.type];
  return `You are a rigorous ${type.label.toLowerCase()} editor performing a quality gate on a single chapter draft.

Target: ${config.wordsPerChapter} words (±20%), ${config.language} language, "${config.voice}" voice.

Evaluate the draft against these metrics:
${getAnalysisMetrics(config.type)}

Decide PASS or FAIL. Fail only if there are concrete, fixable problems worth a revision pass (not nitpicks). Report each issue plainly, choose the most useful revision_mode, and give specific, actionable fixes the writer can apply directly.`;
}

export function getRevisionRules(): string {
  return `═══ REVISION RULES ═══
1. Preserve the author's voice, intent, and continuity with the story bible.
2. Only change what the analysis flagged — do not rewrite passing material.
3. Keep the chapter within ±20% of the target word count.
4. Apply the specified revision mode:
   - polish: fix surface issues (grammar, word choice, flow)
   - strengthen_evidence: add sources, data, examples
   - clarify: simplify sentences, define terms, add logic connections
   - restructure: reorder sections for better flow
   - deepen: add sensory detail, emotion, character depth
   - rewrite: major revision while keeping core content
5. Output the COMPLETE revised chapter as Markdown — not a diff, not commentary.`;
}

export function generateRevisionPrompt(
  config: BookConfig,
  draft: string,
  feedback: string,
  revisionMode: string,
  storyBible?: string
): string {
  let p = `You are a master ${BOOK_TYPES[config.type].label.toLowerCase()} editor revising a chapter draft based on editorial feedback.\n\n`;
  p += getRevisionRules() + "\n\n";
  p += `═══ REVISION MODE: ${revisionMode} ═══\n\n`;
  if (storyBible && storyBible.trim()) {
    p += `═══ STORY BIBLE / CONTINUITY ═══\n${storyBible.trim()}\n\n`;
  }
  p += `═══ EDITORIAL FEEDBACK ═══\n${feedback}\n\n`;
  p += `═══ ORIGINAL DRAFT ═══\n${draft}\n\n`;
  p += `Now output the complete revised chapter (Markdown only, no commentary).`;
  return p;
}

/** Prompt for updating the running story bible after a chapter. Use a cheap model. */
export function generateBibleUpdatePrompt(
  config: BookConfig,
  priorBible: string,
  chapterNumber: number,
  chapterContent: string
): string {
  const isFiction = config.type === "novel" || config.type === "memoir" || config.type === "kids";
  const trackList = isFiction
    ? "CHARACTERS (name + key traits/relationships), SETTINGS/PLACES, WORLD RULES & KEY FACTS, TIMELINE, UNRESOLVED THREADS / OPEN QUESTIONS, FORESHADOWING PLANTED"
    : "KEY CLAIMS PROVEN SO FAR, FRAMEWORK/CONCEPTS INTRODUCED, EVIDENCE & SOURCES USED, TERMS DEFINED, RUNNING EXAMPLES, OPEN QUESTIONS / PROMISES TO THE READER";
  let p = `You maintain a compact "story bible" — the running continuity state for a book in progress.\n\n`;
  p += `Merge the PRIOR BIBLE with what CHAPTER ${chapterNumber} just established. Track: ${trackList}.\n`;
  p += `Output a tight, scannable bible (≤ 400 words) using short bulleted sections. Keep only what future chapters must stay consistent with. Drop nothing important; do not include prose — facts only. Output the bible text only.\n\n`;
  p += `═══ PRIOR BIBLE ═══\n${priorBible.trim() || "(empty — this is the first chapter)"}\n\n`;
  p += `═══ CHAPTER ${chapterNumber} CONTENT ═══\n${chapterContent}\n`;
  return p;
}
