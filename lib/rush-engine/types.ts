// Rush Engine — shared types

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
export interface ContinuityState {
  previousSummary?: string;
  storyBible?: string;
}
export type PromptGroup = "core" | "craft" | "nonfiction" | "prose" | "thai" | "marketing" | "advanced" | "agents" | "nis";

export interface GeneratedPrompt {
  id: string;
  group: PromptGroup;
  name: string;
  description: string;
  usage: string;
  prompt: string;
}
