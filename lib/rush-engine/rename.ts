// ╔══════════════════════════════════════════════════════════════════╗
// ║  RENAME — deterministic global character/term rename.             ║
// ║  Like "rename วิกกี้ → อาโน่ across all chapters (24 hits)": counts ║
// ║  every occurrence, does a LITERAL replace (no regex surprises),    ║
// ║  reports per-chapter hits, and warns if the new name already       ║
// ║  exists (a collision the writer should see). English uses word     ║
// ║  boundaries so "Ana"→"Mira" never touches "Banana"; Thai has no    ║
// ║  word breaks, so it's a literal substring swap (names are          ║
// ║  distinctive) with the pre-existing-target warning to catch clashes║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;

export interface RenameResult {
  text: string; // the rewritten manuscript
  total: number; // occurrences replaced
  perChapter: { chapter: number; count: number }[];
  targetPreexisting: number; // times the NEW name already appeared (possible collision)
}

const countEn = (s: string, term: string) =>
  (s.match(new RegExp(`\\b${term.replace(RE_ESCAPE, "\\$&")}\\b`, "g")) ?? []).length;
const countTh = (s: string, term: string) => (term ? s.split(term).length - 1 : 0);

/** Rename `from` → `to` everywhere. Pure: returns the new text plus an audit
 *  (total, per-chapter, and whether `to` pre-existed). Does not mutate input. */
export function renameTerm(text: string, from: string, to: string, lang: "th" | "en" = "th"): RenameResult {
  if (!from) return { text, total: 0, perChapter: [], targetPreexisting: 0 };
  const count = lang === "en" ? countEn : countTh;

  const chunks = splitChapters(text);
  const perChapter = chunks
    .map((c, i) => ({ chapter: i + 1, count: count(c.body, from) }))
    .filter((p) => p.count > 0);

  const targetPreexisting = count(text, to);

  const rewritten = lang === "en"
    ? text.replace(new RegExp(`\\b${from.replace(RE_ESCAPE, "\\$&")}\\b`, "g"), to)
    : text.split(from).join(to);

  return { text: rewritten, total: count(text, from), perChapter, targetPreexisting };
}
