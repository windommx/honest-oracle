// ╔══════════════════════════════════════════════════════════════════╗
// ║  SAGA — series-level continuity across MANY books.                 ║
// ║                                                                    ║
// ║  A single book's Story Codex (codex.ts) is the cast of one book.   ║
// ║  Thai fiction — จักร ๆ วงศ์ ๆ, web-novel series — runs for many.    ║
// ║  A Saga takes the ordered codices of a series and computes, per    ║
// ║  book, who is INTRODUCED (first seen), who is CARRIED (seen in an   ║
// ║  earlier book), and who is DROPPED (in the previous book, absent    ║
// ║  here) — plus the series backbone (entities spanning ≥2 books).     ║
// ║                                                                    ║
// ║  Every output is a COUNT over declared casts. Deterministic, no     ║
// ║  LLM: "dropped" is a signal (a character off-page this book), not   ║
// ║  an error. Honesty is the same rule the whole engine lives by.      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { type Codex, type CodexEntity } from "./codex";

export interface SagaBook {
  title: string;
  codex: Codex;
}

export interface BookContinuity {
  index: number; // 1-based position in the series
  title: string;
  introduced: CodexEntity[]; // first appearance in the series (∉ any earlier book)
  carried: string[];         // names also present in some earlier book
  dropped: string[];         // names in the IMMEDIATELY-previous book, absent here
}

export interface SagaReport {
  books: BookContinuity[];
  recurring: string[];  // entity names appearing in ≥2 books — the series backbone
  standalone: string[]; // entity names appearing in exactly one book
  totalEntities: number;
}

const namesOf = (c: Codex): string[] => c.entities.map((e) => e.name);
const lc = (s: string) => s.toLowerCase();

/** Analyse an ordered series of book codices into per-book continuity + backbone.
 *  Pure/deterministic. Name matching is case-insensitive; the first-seen casing
 *  is preserved in output. */
export function analyzeSaga(books: SagaBook[]): SagaReport {
  const seen = new Set<string>();          // cumulative lowercased names across prior books
  const bookCount = new Map<string, number>(); // lowercased name → # of books it appears in
  const display = new Map<string, string>();   // lowercased name → first-seen display form

  // First pass: how many books each entity spans (for recurring/standalone).
  for (const b of books) {
    const inThis = new Set(namesOf(b.codex).map(lc));
    inThis.forEach((key) => bookCount.set(key, (bookCount.get(key) ?? 0) + 1));
  }

  const out: BookContinuity[] = [];
  let prevNames = new Set<string>();

  books.forEach((b, i) => {
    const thisNames = new Set(namesOf(b.codex).map(lc));
    const introduced: CodexEntity[] = [];
    const carried: string[] = [];

    for (const e of b.codex.entities) {
      const key = lc(e.name);
      if (!display.has(key)) display.set(key, e.name);
      if (seen.has(key)) carried.push(display.get(key)!);
      else introduced.push(e);
    }
    // Dropped: in the immediately-previous book, gone here (a character off-page).
    const dropped: string[] = [];
    prevNames.forEach((k) => { if (!thisNames.has(k)) dropped.push(display.get(k) ?? k); });

    out.push({ index: i + 1, title: b.title, introduced, carried, dropped });
    thisNames.forEach((k) => seen.add(k));
    prevNames = thisNames;
  });

  const recurring: string[] = [];
  const standalone: string[] = [];
  bookCount.forEach((n, key) => {
    (n >= 2 ? recurring : standalone).push(display.get(key) ?? key);
  });

  return { books: out, recurring, standalone, totalEntities: bookCount.size };
}

/** Human-readable series continuity report (bilingual). Counts, not a verdict. */
export function formatSaga(report: SagaReport, lang: "th" | "en"): string {
  const th = lang === "th";
  const L: string[] = [
    th
      ? `# saga — ความต่อเนื่องของซีรีส์ (${report.books.length} เล่ม · ${report.totalEntities} entity · นับได้ ไม่ใช่คำตัดสิน)`
      : `# saga — series continuity (${report.books.length} books · ${report.totalEntities} entities · counts, not a verdict)`,
  ];
  for (const b of report.books) {
    L.push("", `[${b.index}] ${b.title}`);
    L.push(
      th
        ? `  แนะนำใหม่ (${b.introduced.length}): ${b.introduced.map((e) => e.name).join(", ") || "—"}`
        : `  introduced (${b.introduced.length}): ${b.introduced.map((e) => e.name).join(", ") || "—"}`
    );
    L.push(
      th
        ? `  สืบเนื่อง (${b.carried.length}): ${b.carried.join(", ") || "—"}`
        : `  carried (${b.carried.length}): ${b.carried.join(", ") || "—"}`
    );
    if (b.dropped.length) {
      L.push(
        th
          ? `  หายจากเล่มก่อน (${b.dropped.length}): ${b.dropped.join(", ")}  ← ตั้งใจ หรือลืม?`
          : `  dropped vs prev (${b.dropped.length}): ${b.dropped.join(", ")}  ← intentional, or forgotten?`
      );
    }
  }
  L.push("");
  L.push(
    th
      ? `แกนซีรีส์ (อยู่ ≥2 เล่ม): ${report.recurring.join(", ") || "—"}`
      : `series backbone (in ≥2 books): ${report.recurring.join(", ") || "—"}`
  );
  L.push(
    th
      ? `ปรากฏเล่มเดียว: ${report.standalone.join(", ") || "—"}`
      : `single-book only: ${report.standalone.join(", ") || "—"}`
  );
  return L.join("\n") + "\n";
}
