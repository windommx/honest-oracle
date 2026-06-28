// ╔══════════════════════════════════════════════════════════════════╗
// ║  CONSISTENCY LEDGER — deterministic cross-chapter entity checks.   ║
// ║  No LLM. Flags (a) the same name spelled inconsistently across     ║
// ║  chapters, and (b) terms introduced then dropped. Every flag cites ║
// ║  the real term + chapter numbers — counts, not a quality score.    ║
// ║  Note: Thai recall is bounded by word segmentation (the dictionary  ║
// ║  may split an unknown name into known sub-words).                  ║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";
import { tokenizeThai } from "./thai-analyzer";

// Capitalized words that are usually sentence-initial, not proper nouns.
const EN_SKIP = new Set([
  "The", "A", "An", "And", "But", "Or", "So", "If", "When", "Then", "There", "Here",
  "This", "That", "These", "Those", "He", "She", "It", "They", "We", "You", "I",
  "His", "Her", "Their", "Our", "My", "Your", "Its", "In", "On", "At", "For", "To",
  "Of", "As", "By", "With", "From", "Not", "No", "Yes", "Chapter", "Part", "After",
  "Before", "Once", "What", "Why", "How", "Who", "Where", "Now", "Still", "Yet",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
]);

function termsEn(body: string): string[] {
  const out: string[] = [];
  const re = /\b[A-Z][A-Za-z'’]+\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const w = m[0].replace(/['’]s$/i, "").replace(/['’]$/, ""); // drop possessive
    if (w.length >= 3 && !EN_SKIP.has(w)) out.push(w);
  }
  return out;
}

function termsTh(body: string): string[] {
  return tokenizeThai(body).filter((w) => w.length >= 3 && /[฀-๿]/.test(w));
}

/** Edit distance ≤ 1 between two DIFFERENT strings (likely the same name misspelled). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

export interface TermStat { term: string; count: number; chapters: number[] }
export interface ConsistencyLedger {
  chapters: number;
  terms: number;
  variantClusters: TermStat[][]; // same name, different spellings
  dropped: TermStat[]; // appeared early (≥3×) then vanished by mid-book
}

export function consistencyLedger(text: string, lang: "en" | "th"): ConsistencyLedger {
  const chunks = splitChapters(text)
    .map((c, i) => ({ n: i + 1, body: c.body }))
    .filter((c) => c.body.trim());
  const total = chunks.length;

  const stats = new Map<string, { count: number; chapters: Set<number> }>();
  for (const ch of chunks) {
    const terms = lang === "th" ? termsTh(ch.body) : termsEn(ch.body);
    for (const t of terms) {
      const s = stats.get(t) ?? { count: 0, chapters: new Set<number>() };
      s.count++;
      s.chapters.add(ch.n);
      stats.set(t, s);
    }
  }

  const toStat = (term: string): TermStat => {
    const s = stats.get(term)!;
    return { term, count: s.count, chapters: Array.from(s.chapters).sort((a, b) => a - b) };
  };

  // Candidates: terms used ≥2×, capped to the 400 most frequent (bounds the O(n²) clustering).
  const candidates = Array.from(stats.entries())
    .filter(([, s]) => s.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 400)
    .map(([t]) => t);

  // Union-find over near-spelling pairs (same first char, len diff ≤ 1).
  const parent = new Map<string, string>(candidates.map((t) => [t, t]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const nx = parent.get(x)!;
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  for (let a = 0; a < candidates.length; a++) {
    for (let b = a + 1; b < candidates.length; b++) {
      const x = candidates[a];
      const y = candidates[b];
      if (x[0] !== y[0]) continue;
      if (withinOneEdit(x, y)) parent.set(find(x), find(y));
    }
  }
  const groups = new Map<string, string[]>();
  for (const t of candidates) {
    const r = find(t);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(t);
  }
  const variantClusters = Array.from(groups.values())
    .filter((g) => g.length >= 2)
    .map((g) => g.map(toStat).sort((a, b) => b.count - a.count))
    .sort((a, b) => b[0].count - a[0].count);

  // Dropped: used ≥3×, last seen in the first half, with ≥4 chapters total.
  const dropped =
    total >= 4
      ? Array.from(stats.entries())
          .filter(([, s]) => s.count >= 3 && Math.max(...Array.from(s.chapters)) <= Math.floor(total / 2))
          .map(([t]) => toStat(t))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20)
      : [];

  return { chapters: total, terms: stats.size, variantClusters, dropped };
}
