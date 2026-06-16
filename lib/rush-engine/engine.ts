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
  /** Optional outline / beat notes threaded into chapter prompts. */
  outline?: string;
  /** Editable continuity STATE / codex, injected as source-of-truth into every chapter prompt. */
  storyBible?: string;
  /** Language of the prompt scaffolding itself (not the book output). */
  promptLanguage?: "en" | "th";
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

  if (config.outline && config.outline.trim()) {
    p += `═══ PLANNED BEATS (follow the part relevant to Chapter ${chapter.number}) ═══\n`;
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

// ═══════════════════════════════════════════════════════════════
//  COPYABLE PROMPT PACK
//  The platform's product: a complete set of prompts the author
//  pastes into any LLM to write the whole book, end to end.
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
8. CHARACTER CONSISTENCY: Characters behaving consistently?
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
8. CONTRADICTIONS: Any contradiction with earlier chapters?
9. ENGAGEMENT: Examples, variety, actionable content?
10. CITATIONS: Sources attributed in the chosen style?`;
}

export function getRevisionRules(): string {
  return `═══ REVISION RULES ═══
1. Preserve the author's voice and intent.
2. Only change what the analysis flagged — do not rewrite passing material.
3. Keep the chapter within ±20% of the target word count.
4. Apply the specified revision mode:
   - polish: fix surface issues (grammar, word choice, flow)
   - strengthen_evidence: add sources, data, examples
   - clarify: simplify sentences, define terms, add logic connections
   - restructure: reorder sections for better flow
   - deepen: add sensory detail, emotion, character depth
   - rewrite: major revision while keeping core content
5. Output the COMPLETE revised chapter — not a diff, not commentary.`;
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


// ═══════════════════════════════════════════════════════════════
//  MODULE SYSTEM — optional prompt groups added to the pack
// ═══════════════════════════════════════════════════════════════

export type PromptGroup = "core" | "craft" | "nonfiction" | "prose" | "thai" | "marketing" | "advanced";

export interface GeneratedPrompt {
  id: string;
  group: PromptGroup;
  name: string;
  description: string;
  usage: string;
  prompt: string;
}

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

const isFictionType = (t: BookTypeKey) => t === "novel" || t === "memoir" || t === "kids" || t === "poetry";

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

const MODULE_CATALOG: ModuleDef[] = [
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

// ── Thai prompt-language layer ─────────────────────────────────
// When promptLanguage === "th", every prompt gets a Thai operating header and
// its English section markers are localized, so the scaffolding reads in Thai.

const TH_HEADER_MAP: [RegExp, string][] = [
  [/IDENTITY & ROLE/g, "บทบาท & ตัวตน"],
  [/BOOK SPECIFICATIONS/g, "ข้อมูลจำเพาะหนังสือ"],
  [/THESIS \/ PREMISE/g, "แก่น / เรื่องย่อ"],
  [/QUALITY STANDARDS[^═]*/g, "มาตรฐานคุณภาพ (ยึดเป็นแนวทาง ใช้วิจารณญาณ)"],
  [/CONTINUITY PROTOCOL[^═]*/g, "ระบบรักษาความต่อเนื่องอัตโนมัติ (story bible ในแชทเดียว) "],
  [/OUTPUT FORMAT/g, "รูปแบบผลลัพธ์"],
  [/FICTION RULES/g, "กฎการเขียนนิยาย"],
  [/NON-FICTION RULES/g, "กฎการเขียนสารคดี"],
  [/CHILDREN'S BOOK RULES/g, "กฎหนังสือเด็ก"],
  [/COOKBOOK RULES/g, "กฎตำราอาหาร"],
  [/MEMOIR RULES/g, "กฎบันทึกความทรงจำ"],
  [/POETRY RULES/g, "กฎบทกวี"],
  [/ACT STRUCTURE/g, "โครงสร้างองก์"],
  [/CHARACTER ARC/g, "เส้นทางตัวละคร"],
  [/READER JOURNEY/g, "การเดินทางของผู้อ่าน"],
  [/THESIS/g, "แก่นเรื่อง"],
  [/CHAPTER (\d+) WRITING PROMPT/g, "พรอมป์ตเขียนบทที่ $1"],
  [/PREVIOUS CHAPTER/g, "บริบทบทก่อนหน้า"],
  [/SCENE INSTRUCTIONS/g, "คำสั่งฉาก"],
  [/STORY BIBLE \/ CONTINUITY STATE[^═]*/g, "บันทึกความต่อเนื่อง (แหล่งความจริง) "],
  [/CONTINUITY/g, "ความต่อเนื่อง"],
  [/PLANNED BEATS[^═]*/g, "โครงที่วางไว้ (ทำตามส่วนของบทนี้) "],
  [/QUALITY CHECKLIST[^═]*/g, "เช็คลิสต์คุณภาพ (ตรวจก่อนจบ) "],
  [/TRANSITION TO CHAPTER (\d+)/g, "เชื่อมไปบทที่ $1"],
  [/MUST INCLUDE/g, "ต้องมี"],
  [/STRUCTURE/g, "โครงสร้าง"],
];

function localizeTh(text: string): string {
  let out = text;
  for (const [re, th] of TH_HEADER_MAP) out = out.replace(re, th);
  return out;
}

function thaiDirective(): string {
  return `[คำสั่งหลัก — อ่านก่อน]
โครงสร้างและหัวข้อด้านล่างคือ "กรอบควบคุม" สำหรับโมเดล โปรดทำตามอย่างเคร่งครัด
ผลิตเนื้อหาหนังสือ การวิเคราะห์ และคำตอบทั้งหมดเป็น "ภาษาไทย" ทั้งหมด
หากมีช่อง [INSERT ...] / [ใส่ ...] ให้ผู้ใช้กรอกข้อมูลจริงก่อนใช้งาน
──────────────────────────────────────────\n\n`;
}

/** Build the complete prompt pack. Core writing prompts are always included;
 *  optional module `groups` append their modules. Pure / client-safe. */
export function generateAllPrompts(config: BookConfig, groups: Exclude<PromptGroup, "core">[] = []): GeneratedPrompt[] {
  const architecture = buildArchitecture(config);
  const prompts: GeneratedPrompt[] = [];
  const core = (id: string, name: string, description: string, usage: string, prompt: string): GeneratedPrompt => ({
    id, group: "core", name, description, usage, prompt,
  });

  prompts.push(core("MASTER", "Master System Prompt", "Use this as the system prompt for ALL writing sessions.", "Set as the system prompt before any chapter writing.", generateMasterSystemPrompt(config, architecture)));
  prompts.push(core("OVERVIEW", "Book Overview / Plan", "Establishes the complete book plan.", "Send once before writing Chapter 1.", generateOverviewPrompt(config, architecture)));
  architecture.chapters.forEach((ch, idx) => {
    prompts.push(core(`CH_${ch.number}`, `Chapter ${ch.number}`, ch.purpose, `Send to write Chapter ${ch.number} (${ch.type ?? ch.sceneType ?? "section"}).`, generateChapterPrompt(config, architecture, idx, { storyBible: config.storyBible })));
  });
  prompts.push(core("ANALYSIS", "Quality Analysis Prompt", "Analyze each chapter draft for quality.", "Send after each chapter draft with the draft text.", generateAnalysisPrompt(config)));
  prompts.push(core("REVISION", "Revision Prompt", "Revise a chapter based on analysis feedback.", "Send with the draft + analysis report to revise.", generateRevisionPrompt(config)));
  prompts.push(core("FRONT_MATTER", "Front Matter", "Title page, dedication, table of contents, preface.", "Generate after all chapters are written.", generateFrontMatterPrompt(config)));
  prompts.push(core("BACK_MATTER", "Back Matter", "Appendices, bibliography, index, about the author.", "Generate after the front matter.", generateBackMatterPrompt(config)));
  prompts.push(core("FEEDBACK", "Inter-Chapter Feedback", "Analyze a finished chapter and brief the next one.", "Send after each chapter to generate feedback for the next.", generateFeedbackChainPrompt(config)));

  const wanted = new Set(groups);
  for (const m of MODULE_CATALOG) {
    if (m.group !== "core" && wanted.has(m.group)) {
      prompts.push({ id: m.id, group: m.group, name: m.name, description: m.description, usage: m.usage, prompt: m.build(config) });
    }
  }

  if (config.promptLanguage === "th") {
    const dir = thaiDirective();
    return prompts.map((p) => ({ ...p, prompt: dir + localizeTh(p.prompt) }));
  }

  return prompts;
}
