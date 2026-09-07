// Record shapes of the Writer Room, shared by the store (Dexie), the bundle validator and
// the server sync route — kept free of runtime imports so the server never pulls Dexie.
export type BookStatus = "DRAFT" | "WRITING" | "COMPLETED" | "PUBLISHED";
export type NoteType = "IDEA" | "CHARACTER" | "PLACE" | "ITEM" | "THREAD" | "PLOT" | "RESEARCH";

export interface WritingBook {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  genre: string;
  lang: "th" | "en";
  status: BookStatus;
  targetWords: number; // 0 = no target set
  createdAt: number;
  updatedAt: number;
}
export interface WritingChapter {
  id: string;
  bookId: string;
  title: string;
  content: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}
export interface WritingNote {
  id: string;
  bookId: string | null; // null = free-standing
  type: NoteType;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterSnapshot { id: string; chapterId: string; label: string; content: string; words: number; createdAt: number }
export interface PlotLine { id: string; bookId: string; title: string; order: number }
export interface PlotCard { id: string; plotLineId: string; colIndex: number; title: string; description: string; createdAt: number }
/** Words WRITTEN on a local calendar day (positive deltas between saves), per book. */
export interface WritingDay { key: string; date: string; bookId: string; words: number }
