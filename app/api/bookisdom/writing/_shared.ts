import { NextResponse } from "next/server";
import { parseBundle, type BookBundle } from "@/app/bookisdom/_bundle";

/** Upload caps. A bundle is text; 5 MB is ~2.5 million Thai characters — far past any
 *  novel — while keeping a single row from dominating the database. */
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
export const FREE_CLOUD_BOOKS = 3;
export const PAID_CLOUD_BOOKS = 50;

export type Checked = { ok: true; bundle: BookBundle; bytes: number; title: string } | { ok: false; res: NextResponse };

/** One validator for every write: JSON shape (the browser's own parseBundle), exactly one
 *  book, whose id matches the route, under the size cap. */
export function checkUpload(rawText: string, bookId: string): Checked {
  const bytes = Buffer.byteLength(rawText, "utf8");
  if (bytes > MAX_BUNDLE_BYTES) return { ok: false, res: NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_BUNDLE_BYTES / 1048576} MB` }, { status: 413 }) };
  let body: { bundle?: unknown };
  try { body = JSON.parse(rawText); } catch { return { ok: false, res: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }; }
  const check = parseBundle(JSON.stringify(body?.bundle ?? null));
  if (!check.ok) return { ok: false, res: NextResponse.json({ error: check.reason }, { status: 400 }) };
  const b = check.bundle;
  if (b.books.length !== 1) return { ok: false, res: NextResponse.json({ error: "ต้องมีเล่มเดียวต่อหนึ่งรายการซิงก์" }, { status: 400 }) };
  if (b.books[0].id !== bookId) return { ok: false, res: NextResponse.json({ error: "id ของเล่มไม่ตรงกับเส้นทาง" }, { status: 400 }) };
  return { ok: true, bundle: b, bytes, title: b.books[0].title };
}
