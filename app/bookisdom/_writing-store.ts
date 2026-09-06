// ╔══════════════════════════════════════════════════════════════════╗
// ║  WRITING STORE — the Writer Room's data: books → ordered chapters, ║
// ║  plus notes. Local-first (IndexedDB via Dexie), same principle as  ║
// ║  _manuscript-store and _production-log: the text never leaves the  ║
// ║  browser unless the writer explicitly compiles, exports or sends   ║
// ║  it to the analyzer / Studio.                                       ║
// ║                                                                    ║
// ║  Absorbed from InkStudio (a separate Prisma/SQLite app) and RE-    ║
// ║  WIRED into what Bookisdom already has, instead of standing beside ║
// ║  it:                                                               ║
// ║   · compileBook() renders chapters with headings splitChapters()   ║
// ║     recognises, so a book becomes a StoredManuscript that the      ║
// ║     analyzers, EPUB builder and KDP word count all accept as-is;   ║
// ║   · notesToCodex() emits the exact section/entity grammar that     ║
// ║     codex.ts parseCodex() reads, so character/place/item/thread    ║
// ║     notes become the prompt tool's Story Codex — no second bible;   ║
// ║   · progress is words ÷ target, disclosed, null when there is no   ║
// ║     target — never a "pace score".                                  ║
// ║  Word counts use the analyzers' own tokenizers (InkStudio split on  ║
// ║  whitespace, which counts a Thai paragraph as one word).            ║
// ╚══════════════════════════════════════════════════════════════════╝

import Dexie, { type Table } from "dexie";
import { countManuscriptWords } from "./_word-count";

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

export const STATUS_LABEL: Record<BookStatus, string> = {
  DRAFT: "ฉบับร่าง", WRITING: "กำลังเขียน", COMPLETED: "เขียนจบ", PUBLISHED: "เผยแพร่แล้ว",
};
/** Note types. The first four map onto Story Codex sections (codex.ts); the rest are
 *  the writer's own working notes and stay out of the codex. */
export const NOTE_META: Record<NoteType, { label: string; codexSection: string | null }> = {
  CHARACTER: { label: "ตัวละคร", codexSection: "[ตัวละคร]" },
  PLACE: { label: "สถานที่", codexSection: "[สถานที่]" },
  ITEM: { label: "สิ่งของ", codexSection: "[สิ่งของ]" },
  THREAD: { label: "ปมค้าง", codexSection: "[ปมค้าง]" },
  PLOT: { label: "เนื้อเรื่อง", codexSection: null },
  IDEA: { label: "ไอเดีย", codexSection: null },
  RESEARCH: { label: "ค้นคว้า", codexSection: null },
};
export const NOTE_TYPES = Object.keys(NOTE_META) as NoteType[];

class WritingDB extends Dexie {
  books!: Table<WritingBook, string>;
  chapters!: Table<WritingChapter, string>;
  notes!: Table<WritingNote, string>;
  constructor() {
    super("bookisdom-writing");
    this.version(1).stores({
      books: "id, updatedAt, status",
      chapters: "id, bookId, order, updatedAt",
      notes: "id, bookId, type, updatedAt",
    });
  }
}
let dbInstance: WritingDB | null = null;
function db(): WritingDB | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbInstance) dbInstance = new WritingDB();
  return dbInstance;
}
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// ── books ───────────────────────────────────────────────────────────────
export async function createBook(input: { title: string; subtitle?: string; author?: string; genre?: string; lang: "th" | "en"; targetWords?: number }): Promise<WritingBook> {
  const now = Date.now();
  const book: WritingBook = {
    id: newId(), title: input.title.trim() || "หนังสือใหม่", subtitle: input.subtitle?.trim() ?? "", author: input.author?.trim() ?? "",
    genre: input.genre?.trim() ?? "", lang: input.lang, status: "DRAFT", targetWords: Math.max(0, Math.floor(input.targetWords ?? 0)), createdAt: now, updatedAt: now,
  };
  await db()?.books.put(book);
  // A book always starts with one chapter, so the writer lands in an editor, not a void.
  await addChapter(book.id, "บทที่ 1");
  return book;
}
export async function listBooks(): Promise<WritingBook[]> {
  const rows = (await db()?.books.toArray()) ?? [];
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getBook(id: string): Promise<WritingBook | undefined> {
  return db()?.books.get(id);
}
export async function updateBook(id: string, patch: Partial<Omit<WritingBook, "id" | "createdAt">>): Promise<void> {
  await db()?.books.update(id, { ...patch, updatedAt: Date.now() });
}
/** Deletes the book AND its chapters and notes — an orphaned chapter is unreachable data. */
export async function deleteBook(id: string): Promise<void> {
  const d = db(); if (!d) return;
  await d.transaction("rw", d.books, d.chapters, d.notes, async () => {
    await d.chapters.where("bookId").equals(id).delete();
    await d.notes.where("bookId").equals(id).delete();
    await d.books.delete(id);
  });
}

// ── chapters ────────────────────────────────────────────────────────────
export async function listChapters(bookId: string): Promise<WritingChapter[]> {
  const rows = (await db()?.chapters.where("bookId").equals(bookId).toArray()) ?? [];
  return rows.sort((a, b) => a.order - b.order);
}
export async function addChapter(bookId: string, title?: string): Promise<WritingChapter> {
  const existing = await listChapters(bookId);
  const order = existing.length ? existing[existing.length - 1].order + 1 : 1;
  const now = Date.now();
  const ch: WritingChapter = { id: newId(), bookId, title: title?.trim() || `บทที่ ${existing.length + 1}`, content: "", order, createdAt: now, updatedAt: now };
  await db()?.chapters.put(ch);
  await db()?.books.update(bookId, { updatedAt: now });
  return ch;
}
export async function updateChapter(id: string, patch: { title?: string; content?: string }): Promise<void> {
  const d = db(); if (!d) return;
  const now = Date.now();
  const ch = await d.chapters.get(id);
  if (!ch) return;
  await d.chapters.update(id, { ...patch, updatedAt: now });
  await d.books.update(ch.bookId, { updatedAt: now });
}
export async function deleteChapter(id: string): Promise<void> {
  await db()?.chapters.delete(id);
}
/** Swap order with the neighbour. Returns false (and changes nothing) at either end. */
export async function moveChapter(id: string, direction: "up" | "down"): Promise<boolean> {
  const d = db(); if (!d) return false;
  const ch = await d.chapters.get(id);
  if (!ch) return false;
  const siblings = await listChapters(ch.bookId);
  const idx = siblings.findIndex((c) => c.id === id);
  const target = siblings[direction === "up" ? idx - 1 : idx + 1];
  if (!target) return false;
  await d.transaction("rw", d.chapters, async () => {
    await d.chapters.update(ch.id, { order: target.order });
    await d.chapters.update(target.id, { order: ch.order });
  });
  return true;
}

// ── notes ───────────────────────────────────────────────────────────────
export async function addNote(input: { bookId: string | null; type: NoteType; title: string; content: string }): Promise<WritingNote> {
  const now = Date.now();
  const n: WritingNote = { id: newId(), bookId: input.bookId, type: input.type, title: input.title.trim(), content: input.content.trim(), pinned: false, createdAt: now, updatedAt: now };
  await db()?.notes.put(n);
  return n;
}
export async function listNotes(bookId: string | null): Promise<WritingNote[]> {
  const all = (await db()?.notes.toArray()) ?? [];
  const rows = bookId === null ? all : all.filter((n) => n.bookId === bookId);
  // pinned first, then newest
  return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}
export async function updateNote(id: string, patch: Partial<Pick<WritingNote, "title" | "content" | "type" | "pinned">>): Promise<void> {
  await db()?.notes.update(id, { ...patch, updatedAt: Date.now() });
}
export async function deleteNote(id: string): Promise<void> {
  await db()?.notes.delete(id);
}

// ── pure: bridges to the rest of Bookisdom ──────────────────────────────

/** A chapter heading splitChapters() recognises (chapters.ts HEADING) — "บทที่ N" / "Chapter N"
 *  at line start — followed by the writer's own title. Numbering is by ORDER, so a reordered
 *  book compiles in its new order. */
export function chapterHeading(index1: number, title: string, lang: "th" | "en"): string {
  const t = title.trim();
  const base = lang === "th" ? `บทที่ ${index1}` : `Chapter ${index1}`;
  return t && !/^(บทที่|chapter)\s*\d+/i.test(t) ? `${base}: ${t}` : (t || base);
}

/** The whole book as ONE manuscript text — what the analyzers, EPUB builder and KDP count
 *  take. Same heading grammar the EPUB splitter parses, so a compiled book round-trips into
 *  the same chapters (see the test). */
export function compileBook(book: Pick<WritingBook, "lang">, chapters: WritingChapter[]): string {
  const ordered = [...chapters].sort((a, b) => a.order - b.order);
  return ordered.map((c, i) => `${chapterHeading(i + 1, c.title, book.lang)}\n\n${c.content.trim()}`).join("\n\n\n");
}

/** Chapters in the shape buildEpub() wants. */
export function chaptersForEpub(book: Pick<WritingBook, "lang">, chapters: WritingChapter[]): { title: string; text: string }[] {
  return [...chapters].sort((a, b) => a.order - b.order).map((c, i) => ({ title: chapterHeading(i + 1, c.title, book.lang), text: c.content }));
}

export function exportMarkdown(book: WritingBook, chapters: WritingChapter[]): string {
  const ordered = [...chapters].sort((a, b) => a.order - b.order);
  const head = [`# ${book.title}`, book.subtitle ? `*${book.subtitle}*` : "", book.author ? `โดย ${book.author}` : "", book.genre ? `ประเภท: ${book.genre}` : ""].filter(Boolean).join("\n\n");
  return head + "\n\n---\n\n" + ordered.map((c, i) => `## ${chapterHeading(i + 1, c.title, book.lang)}\n\n${c.content.trim() || "_(ยังไม่มีเนื้อหา)_"}`).join("\n\n---\n\n") + "\n";
}
export function exportText(book: WritingBook, chapters: WritingChapter[]): string {
  return [book.title, book.subtitle, book.author ? `โดย ${book.author}` : ""].filter(Boolean).join("\n") + "\n" + "─".repeat(40) + "\n\n" + compileBook(book, chapters) + "\n";
}

/** Words ÷ target × 100, rounded — or null when there is no target. A percentage of
 *  nothing is not 0 %, it is undefined; the UI says "ยังไม่ตั้งเป้า". */
export function bookProgress(words: number, targetWords: number): number | null {
  if (!(targetWords > 0)) return null;
  return Math.round((words / targetWords) * 100);
}

/** Count the book's words with the analyzers' tokenizers (Thai segmenter / EN regex). */
export async function countBookWords(book: Pick<WritingBook, "lang">, chapters: WritingChapter[]): Promise<number> {
  let total = 0;
  for (const c of chapters) total += await countManuscriptWords({ lang: book.lang, text: c.content });
  return total;
}

// Both markers are deliberately LONGER than 60 characters and contain no colon: parseCodex
// treats a colon-less line over 60 chars as prose and skips it, so the markers can sit
// inside any section without becoming an "entity" (a short marker did exactly that —
// caught by the merge test).
export const CODEX_MARK_BEGIN = "# ── ส่วนที่ส่งมาจากห้องเขียน Bookisdom — บล็อกนี้จะถูกเขียนทับทั้งก้อนเมื่อกดส่งใหม่ ห้ามแก้ในนี้ ──";
export const CODEX_MARK_END = "# ── จบส่วนที่ส่งมาจากห้องเขียน Bookisdom — ข้อความใต้บรรทัดนี้เป็นของผู้เขียนเองและจะไม่ถูกแตะ ──";

/** Notes → Story Codex text in the grammar parseCodex() reads: a section header per type
 *  ("[ตัวละคร]" …), then one "Name: description" line per note. Multi-line note bodies
 *  are kept on the entity line's continuation ONLY where the parser attaches them —
 *  lines that look like "อยาก: …" / "เสียง: …" after a character become that character's
 *  traits — so a writer can type depth traits in a note and they land in the codex.
 *  Types with no codex section (PLOT/IDEA/RESEARCH) are skipped and counted. */
export function notesToCodex(notes: WritingNote[]): { text: string; included: number; skipped: number } {
  const bySection = new Map<string, string[]>();
  let included = 0, skipped = 0;
  for (const n of notes) {
    const section = NOTE_META[n.type].codexSection;
    if (!section || !n.title.trim()) { skipped++; continue; }
    const lines = n.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const [first, ...rest] = lines;
    const entity = n.type === "THREAD"
      ? `${n.title.trim()}${first ? `: ${first}` : ""}`
      : `${n.title.trim()}: ${first ?? ""}`.replace(/:\s*$/, ": —");
    const block = [entity, ...(n.type === "CHARACTER" ? rest.filter((l) => l.includes(":")) : [])];
    bySection.set(section, [...(bySection.get(section) ?? []), ...block]);
    included++;
  }
  const order = ["[ตัวละคร]", "[สถานที่]", "[สิ่งของ]", "[ปมค้าง]"];
  const text = order.filter((s) => bySection.has(s)).map((s) => `${s}\n${bySection.get(s)!.join("\n")}`).join("\n\n");
  return { text, included, skipped };
}

/** Insert (or replace) the Writer-Room block inside an existing story bible without touching
 *  anything the author typed by hand. Idempotent: sending twice does not duplicate. */
export function mergeCodexIntoDraft(existing: string, generated: string): string {
  const block = `${CODEX_MARK_BEGIN}\n${generated.trim()}\n${CODEX_MARK_END}`;
  const b = existing.indexOf(CODEX_MARK_BEGIN);
  const e = existing.indexOf(CODEX_MARK_END);
  if (b >= 0 && e > b) return (existing.slice(0, b) + block + existing.slice(e + CODEX_MARK_END.length)).trim();
  return (existing.trim() ? existing.trim() + "\n\n" : "") + block;
}

export const DRAFT_KEY = "bookisdom.generator.draft";
/** Write the merged codex into the prompt tool's saved draft (the same localStorage record it
 *  restores on load), so /bookisdom opens with the Story Codex already injected. */
export function sendCodexToPromptTool(generated: string): { ok: boolean; reason?: string } {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as { config?: Record<string, unknown>; groups?: unknown }) : {};
    const config = { ...(draft.config ?? {}) };
    const existing = typeof config.storyBible === "string" ? config.storyBible : "";
    config.storyBible = mergeCodexIntoDraft(existing, generated);
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, config }));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "localStorage unavailable" };
  }
}
