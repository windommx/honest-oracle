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
import { buildSymIndex, neighbors } from "./symspell";

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

  // Candidates: terms used ≥2×. Min length guards against garbage clusters: Thai is
  // full of unrelated 3-char monosyllables one edit apart (แสง/แรง, เย็น/เป็น), so
  // require ≥4 chars there; English proper nouns are already ≥3. The cap now bounds a
  // near-linear pass (SymSpell / skeleton grouping), not an O(n²) loop, so it can be
  // generous — long manuscripts keep their variant recall.
  const minLen = lang === "th" ? 4 : 3;
  const candidates = Array.from(stats.entries())
    .filter(([t, s]) => s.count >= 2 && t.length >= minLen)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5000)
    .map(([t]) => t);

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
  if (lang === "th") {
    // Thai: mark-only variants ⇒ identical consonant skeleton. Group by skeleton in
    // O(n) instead of comparing every pair (same result as pairwise thaiMarkVariant).
    const skelRep = new Map<string, string>();
    for (const t of candidates) {
      const skel = t.replace(TH_MARKS, "");
      if (skel.length < 2) continue;
      const rep = skelRep.get(skel);
      if (rep) parent.set(find(t), find(rep));
      else skelRep.set(skel, t);
    }
  } else {
    // English: edit-distance ≤ 1 via SymSpell (verified). Keep the same-first-char guard
    // so behaviour matches the old pairwise pass exactly, just near-linear.
    const idx = buildSymIndex(candidates);
    for (const t of candidates) {
      for (const n of neighbors(t, idx, withinOneEdit)) {
        if (t[0] === n[0]) parent.set(find(t), find(n));
      }
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

const THAI = /[฀-๿]/;
const isNamePart = (t: string) => t.length <= 2 && !THAI_STOPWORDS.has(t) && THAI.test(t);

/** Suggest Thai character/place names the writer may want to protect. Uses the
 *  segmenter's OWN tokens (so candidates respect syllable boundaries) and looks for
 *  repeated adjacent token groups that form an unknown name — the segmenter splits
 *  an unknown proper noun into short syllables (มะ + ลี), so a frequent bigram/
 *  trigram containing a short non-stopword syllable is a likely name, while clean
 *  compounds (ความ+รัก) and function words are excluded. Deterministic SUGGESTIONS,
 *  not a verdict; the writer confirms which to add to the glossary. */
export function suggestThaiNames(text: string, exclude: string[] = [], limit = 8): string[] {
  const excl = new Set(exclude);
  // Chapter bodies only — headings ("บทที่ 1") otherwise surface as fake names.
  const body = splitChapters(text).map((c) => c.body).join("\n");
  const toks = tokenizeThai(body).filter((t) => THAI.test(t));
  const info = new Map<string, { count: number; parts: string[] }>();
  const bump = (parts: string[]) => {
    const s = parts.join("");
    const e = info.get(s) ?? { count: 0, parts };
    e.count++;
    info.set(s, e);
  };
  for (let i = 0; i < toks.length - 1; i++) {
    bump([toks[i], toks[i + 1]]);
    if (i < toks.length - 2) bump([toks[i], toks[i + 1], toks[i + 2]]);
  }
  // Keep groups seen ≥3× whose combined string is 3–8 chars, contains at least one
  // short non-stopword syllable, and isn't entirely stopwords.
  const cands = Array.from(info.entries()).filter(([s, { count, parts }]) => {
    if (count < 3 || excl.has(s) || s.length < 3 || s.length > 8) return false;
    if (!parts.some(isNamePart)) return false;
    return parts.some((p) => !THAI_STOPWORDS.has(p));
  });
  // Prefer longer groups; drop any candidate subsumed by a longer kept one.
  cands.sort((a, b) => b[0].length - a[0].length || b[1].count - a[1].count);
  const kept: { s: string; count: number }[] = [];
  for (const [s, { count }] of cands) {
    if (!kept.some((k) => k.s.includes(s))) kept.push({ s, count });
  }
  return kept
    .sort((a, b) => b.count * b.s.length - a.count * a.s.length)
    .slice(0, limit)
    .map((k) => k.s);
}
