// Studio ← Writer Room: compose the system prompt and the task prompt for an LLM run from
// what the room already knows — the Story Codex (same text the prompt tool obeys), the plot
// board as an outline, and the tail of the previous chapter. Pure; the page hands the result
// to Studio through its existing sessionStorage prefill, so Studio itself needs no change.
import { parseCodex, codexDigestTh, codexDigestEn } from "@/lib/bookisdom-engine/codex";
import { notesToCodex, plotToOutline, chapterHeading } from "./_writing-store";
import type { WritingBook, WritingChapter, WritingNote, PlotLine, PlotCard } from "./_writing-types";

export const STUDIO_PREFILL_KEY = "bookisdom.studio.prefill";
export const DEFAULT_TAIL_CHARS = 1500;

export interface StudioContext { system: string; prompt: string; parts: { codex: boolean; outline: boolean; previous: boolean } }

export function composeStudioContext(input: {
  book: Pick<WritingBook, "title" | "lang" | "author" | "genre">;
  chapters: WritingChapter[];
  notes: WritingNote[];
  plotLines: PlotLine[];
  plotCards: PlotCard[];
  /** The chapter being written. If it has an earlier sibling, that sibling's tail is quoted. */
  targetChapterId: string | null;
  tailChars?: number;
}): StudioContext {
  const th = input.book.lang === "th";
  const tailChars = input.tailChars ?? DEFAULT_TAIL_CHARS;
  const ordered = [...input.chapters].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((c) => c.id === input.targetChapterId);
  const target = idx >= 0 ? ordered[idx] : null;
  const previous = idx > 0 ? ordered[idx - 1] : null;

  const sys: string[] = [];
  sys.push(th
    ? `คุณคือผู้ร่วมเขียนหนังสือเรื่อง "${input.book.title}"${input.book.genre ? ` (${input.book.genre})` : ""}${input.book.author ? ` ของ ${input.book.author}` : ""} เขียนภาษาไทย คงชื่อ ลักษณะ และความสัมพันธ์ตาม Codex ห้ามขัดแย้ง`
    : `You are co-writing "${input.book.title}"${input.book.genre ? ` (${input.book.genre})` : ""}${input.book.author ? ` by ${input.book.author}` : ""}. Write in English. Keep every name, trait and relation consistent with the Codex.`);
  const { text: codexText, included } = notesToCodex(input.notes);
  const codex = included ? parseCodex(codexText) : null;
  const codexBlock = codex ? (th ? codexDigestTh(codex) : codexDigestEn(codex)) : "";
  if (codexBlock) sys.push(codexBlock);
  const outline = plotToOutline(input.plotLines, input.plotCards);
  if (outline) sys.push((th ? "═══ โครงเรื่องจากผัง (ฉาก → การ์ด) ═══\n" : "═══ Outline from the plot board (scene → cards) ═══\n") + outline);

  const pr: string[] = [];
  const heading = target ? chapterHeading(idx + 1, target.title, input.book.lang) : (th ? "บทถัดไป" : "the next chapter");
  if (previous && previous.content.trim()) {
    const tail = previous.content.trim().slice(-tailChars);
    pr.push(th
      ? `ท้ายของ${chapterHeading(idx, previous.title, input.book.lang)} (${Math.min(tailChars, previous.content.trim().length)} ตัวอักษรสุดท้าย):\n"""\n${tail}\n"""`
      : `End of ${chapterHeading(idx, previous.title, input.book.lang)} (last ${Math.min(tailChars, previous.content.trim().length)} characters):\n"""\n${tail}\n"""`);
  } else {
    pr.push(th ? "นี่คือบทแรกของเล่ม (ไม่มีบทก่อนหน้า)" : "This is the first chapter (nothing precedes it).");
  }
  if (target && target.content.trim()) {
    pr.push(th ? `ข้อความที่มีอยู่แล้วใน${heading} (เขียนต่อจากนี้ ไม่ต้องเขียนซ้ำ):\n"""\n${target.content.trim().slice(-tailChars)}\n"""` : `What ${heading} already contains (continue from here, do not repeat):\n"""\n${target.content.trim().slice(-tailChars)}\n"""`);
  }
  pr.push(th ? `เขียน${heading}ต่อ ให้ต่อเนื่องจากข้างบน ตาม Codex และโครงเรื่อง` : `Write ${heading}, continuing from the above, faithful to the Codex and the outline.`);

  return { system: sys.join("\n\n"), prompt: pr.join("\n\n"), parts: { codex: !!codexBlock, outline: !!outline, previous: !!(previous && previous.content.trim()) } };
}

/** Hand the context to Studio via its existing prefill slot. Returns false if storage failed. */
export function prefillStudio(ctx: StudioContext): boolean {
  try { window.sessionStorage.setItem(STUDIO_PREFILL_KEY, JSON.stringify({ system: ctx.system, prompt: ctx.prompt })); return true; } catch { return false; }
}
