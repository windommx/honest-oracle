// ╔══════════════════════════════════════════════════════════════════╗
// ║  CONSISTENCY LEDGER — deterministic cross-chapter entity checks.   ║
// ║  No LLM. Flags (a) the same name spelled inconsistently across     ║
// ║  chapters, and (b) terms introduced then dropped. Every flag cites ║
// ║  the real term + chapter numbers — counts, not a quality score.    ║
// ║  Note: Thai recall is bounded by word segmentation (the dictionary  ║
// ║  may split an unknown name into known sub-words).                  ║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";
import { tokenizeThai, THAI_STOPWORDS } from "./thai-analyzer";

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

function termsTh(body: string, protect?: string[]): string[] {
  // Drop stopwords — else common function words (นั้น, ความ…) surface as false
  // "dropped terms" and pollute the codex. (Found by dogfood: นั้น×4 was flagged.)
  // `protect` keeps writer-supplied names atomic despite the segmenter.
  return tokenizeThai(body, protect).filter((w) => w.length >= 3 && /[฀-๿]/.test(w) && !THAI_STOPWORDS.has(w));
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

// Thai combining vowel/tone marks (mai han-akat, sara i..u, tone marks, thanthakhat…).
const TH_MARKS = /[ัิ-ฺ็-๎]/g;

/** Thai variant check: two DIFFERENT tokens that share the same consonant skeleton
 *  but differ only in vowel/tone marks (มะลิ ↔ มะลี). This is high-precision for Thai —
 *  a consonant swap (เย็น ↔ เป็น) is almost always a different word, not a misspelling,
 *  so requiring the stripped forms to match rejects those. Recall is still bounded by
 *  segmentation (an unknown name split into sub-words won't surface at all). */
export function thaiMarkVariant(a: string, b: string): boolean {
  if (a === b) return false;
  const sa = a.replace(TH_MARKS, "");
  const sb = b.replace(TH_MARKS, "");
  return sa.length >= 2 && sa === sb;
}

export interface TermStat { term: string; count: number; chapters: number[] }
export interface ConsistencyLedger {
  chapters: number;
  terms: number;
  variantClusters: TermStat[][]; // same name, different spellings
  dropped: TermStat[]; // appeared early (≥3×) then vanished by mid-book
}

type StatMap = Map<string, { count: number; chapters: Set<number> }>;

/** Tokenize per chapter and tally term → {count, chapters}. Shared by the ledger and the bible. */
function collectStats(text: string, lang: "en" | "th", protect?: string[]): { total: number; stats: StatMap } {
  const chunks = splitChapters(text)
    .map((c, i) => ({ n: i + 1, body: c.body }))
    .filter((c) => c.body.trim());

  const stats: StatMap = new Map();
  for (const ch of chunks) {
    const terms = lang === "th" ? termsTh(ch.body, protect) : termsEn(ch.body);
    for (const t of terms) {
      const s = stats.get(t) ?? { count: 0, chapters: new Set<number>() };
      s.count++;
      s.chapters.add(ch.n);
      stats.set(t, s);
    }
  }
  return { total: chunks.length, stats };
}

const statToTerm = (stats: StatMap, term: string): TermStat => {
  const s = stats.get(term)!;
  return { term, count: s.count, chapters: Array.from(s.chapters).sort((a, b) => a - b) };
};

export function consistencyLedger(text: string, lang: "en" | "th", protect?: string[]): ConsistencyLedger {
  const { total, stats } = collectStats(text, lang, protect);
  const toStat = (term: string): TermStat => statToTerm(stats, term);

  // Candidates: terms used ≥2×, capped to the 400 most frequent (bounds the O(n²) clustering).
  // Min length guards against garbage clusters: Thai is full of unrelated 3-char
  // monosyllables one edit apart (แสง/แรง, เย็น/เป็น), so require ≥4 chars there;
  // English proper nouns are already ≥3. (Dogfood: this removes the false positives
  // while a real 4-char name like มะลิ still qualifies.)
  const minLen = lang === "th" ? 4 : 3;
  const candidates = Array.from(stats.entries())
    .filter(([t, s]) => s.count >= 2 && t.length >= minLen)
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
  // English: edit-distance ≤ 1. Thai: mark-only variants (see thaiMarkVariant) —
  // the generic edit-distance produces garbage on Thai monosyllables.
  const near = lang === "th" ? thaiMarkVariant : withinOneEdit;
  for (let a = 0; a < candidates.length; a++) {
    for (let b = a + 1; b < candidates.length; b++) {
      const x = candidates[a];
      const y = candidates[b];
      if (x[0] !== y[0]) continue;
      if (near(x, y)) parent.set(find(x), find(y));
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

export interface BibleEntry extends TermStat {
  firstChapter: number;
  lastChapter: number;
  span: number; // chapters from first to last appearance, inclusive
}
export interface StoryBible {
  chapters: number;
  entries: BibleEntry[];
}

/** Deterministic codex: every recurring entity (proper noun / Thai content token)
 *  used ≥ `minCount` times, with its frequency and chapter span. Paste-ready
 *  continuity reference — counts, no inference about what each term *is*. */
export function storyBible(text: string, lang: "en" | "th", minCount = 3, protect?: string[]): StoryBible {
  const { total, stats } = collectStats(text, lang, protect);
  const entries: BibleEntry[] = Array.from(stats.entries())
    .filter(([, s]) => s.count >= minCount)
    .map(([t]) => {
      const st = statToTerm(stats, t);
      const first = st.chapters[0];
      const last = st.chapters[st.chapters.length - 1];
      return { ...st, firstChapter: first, lastChapter: last, span: last - first + 1 };
    })
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, 200);
  return { chapters: total, entries };
}

/** Render a Story Bible as paste-ready Markdown for use as an LLM continuity prompt. */
export function formatStoryBible(bible: StoryBible, lang: "en" | "th"): string {
  const th = lang === "th";
  const lines: string[] = [];
  lines.push(th ? "# คลังเนื้อเรื่อง (Story Bible)" : "# Story Bible");
  lines.push(
    th
      ? `ดึงอัตโนมัติจาก ${bible.chapters} บท · นับจริง ไม่ใช่การตีความ · ใช้แปะกลับให้ AI เพื่อรักษาความต่อเนื่อง`
      : `Auto-extracted from ${bible.chapters} chapters · real counts, not interpretation · paste back to your AI to anchor continuity`
  );
  lines.push("");
  lines.push(th ? "| คำ | ครั้ง | บท | ช่วง |" : "| Term | Uses | Chapters | Span |");
  lines.push("| :--- | ---: | :--- | ---: |");
  for (const e of bible.entries) {
    const chs = e.chapters.length > 8 ? `${e.firstChapter}–${e.lastChapter}` : e.chapters.join(", ");
    lines.push(`| ${e.term} | ${e.count} | ${chs} | ${e.span} |`);
  }
  if (th) lines.push("", "> หมายเหตุ: ภาษาไทยขึ้นกับการตัดคำ — ชื่อเฉพาะบางตัวอาจถูกแยกเป็นคำย่อย จึงอาจไม่ครบทุกชื่อ");
  return lines.join("\n");
}
