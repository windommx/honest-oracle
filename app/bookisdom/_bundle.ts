// Bundle format + structural validation — PURE (no Dexie, no DOM), so the server-side sync
// route validates uploads with exactly the code the browser uses for imports.
import type { WritingBook, WritingChapter, WritingNote, ChapterSnapshot, PlotLine, PlotCard, WritingDay } from "./_writing-types";

export const BUNDLE_FORMAT = "bookisdom-writing/1";
export interface BookBundle {
  format: typeof BUNDLE_FORMAT;
  exportedAt: string; // ISO — the only timestamp not from the record itself
  books: WritingBook[];
  chapters: WritingChapter[];
  notes: WritingNote[];
  snapshots: ChapterSnapshot[];
  plotLines: PlotLine[];
  plotCards: PlotCard[];
  writingDays: WritingDay[];
}

export type BundleCheck = { ok: true; bundle: BookBundle } | { ok: false; reason: string };
/** Structural validation — a wrong file is refused with a reason, never half-imported. */
export function parseBundle(text: string): BundleCheck {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, reason: "ไฟล์ไม่ใช่ JSON" }; }
  const o = j as Partial<BookBundle> | null;
  if (!o || typeof o !== "object") return { ok: false, reason: "ไฟล์ว่างหรือไม่ใช่ออบเจ็กต์" };
  if (o.format !== BUNDLE_FORMAT) return { ok: false, reason: `รูปแบบไม่ตรง: ${String(o.format ?? "ไม่มี format")} (ต้องการ ${BUNDLE_FORMAT})` };
  const arr = (k: keyof BookBundle) => Array.isArray(o[k]);
  for (const k of ["books", "chapters", "notes", "snapshots", "plotLines", "plotCards", "writingDays"] as const) if (!arr(k)) return { ok: false, reason: `ขาดรายการ ${k}` };
  if (!o.books!.every((b) => b && typeof b.id === "string" && typeof b.title === "string" && (b.lang === "th" || b.lang === "en"))) return { ok: false, reason: "รายการเล่มมีข้อมูลไม่ครบ (id/title/lang)" };
  if (!o.chapters!.every((c) => c && typeof c.id === "string" && typeof c.bookId === "string" && typeof c.content === "string")) return { ok: false, reason: "รายการบทมีข้อมูลไม่ครบ" };
  return { ok: true, bundle: o as BookBundle };
}

