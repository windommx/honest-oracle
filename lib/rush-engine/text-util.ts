import { countNonOverlapping } from "./aho-corasick";

// Count phrase occurrences with substring-overlap correction. When a longer
// phrase matches (e.g. "หัวใจสลาย" or "a testament to"), its shorter substring
// phrases ("ใจสลาย", "testament") would otherwise double-count the same span, so
// we subtract the longer phrase's occurrences from the shorter one's raw count.
// `text.split(phrase)` is a literal string split (no regex), so phrase contents
// are matched verbatim.
//
// opts.tokens: when given (the already-tokenized word array), SINGLE-word phrases
// are counted by exact token match instead of substring — so "realm" no longer
// matches inside "realms" and "delve" no longer matches inside "delved". Multi-word
// phrases (and Thai, which has no spaces → no tokens passed) keep substring matching.
export function countPhrases(
  text: string,
  phrases: string[],
  opts?: { tokens?: string[] }
): { phrase: string; count: number }[] {
  let tokenFreq: Map<string, number> | null = null;
  if (opts?.tokens) {
    tokenFreq = new Map();
    for (const t of opts.tokens) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
  }
  // Substring-counted phrases (multi-word, or Thai with no token boundaries) are matched
  // in ONE pass via Aho-Corasick; countNonOverlapping reproduces `split().length - 1` exactly.
  const substringPhrases = phrases.filter((p) => !(tokenFreq && !p.includes(" ")));
  const acCounts = substringPhrases.length ? countNonOverlapping(text, substringPhrases) : null;
  const raw = phrases.map((phrase) => {
    const single = !!(tokenFreq && !phrase.includes(" "));
    const count = single ? (tokenFreq!.get(phrase) ?? 0) : (acCounts?.get(phrase) ?? 0);
    return { phrase, count, single };
  });
  return raw
    .map(({ phrase, count, single }) => {
      const overlap = raw.reduce(
        (sum, o) =>
          o.phrase !== phrase &&
          o.phrase.length > phrase.length &&
          o.phrase.includes(phrase) &&
          // Overlap subtraction only applies when the shorter phrase's raw count really does
          // include hits sitting INSIDE the longer phrase's span. Two distinct exact-token
          // matches never share a span: รส and รสชาติ are separate tokens at separate
          // positions, so subtracting one from the other silently deletes a genuine hit.
          // Skip only when BOTH are single-word token-counted; a longer MULTI-word substring
          // phrase (e.g. "a testament to" containing the token "testament") still absorbs it.
          !(single && o.single)
            ? sum + o.count
            : sum,
        0
      );
      return { phrase, count: Math.max(0, count - overlap) };
    })
    .filter((p) => p.count > 0);
}

export type DiffOp = { type: "same" | "add" | "del"; text: string };

/** Token-level LCS diff. `join` is the separator used to merge adjacent tokens
 *  for display (" " for English, "" for Thai). Returns null when either side
 *  exceeds `cap` tokens (an inline diff of a whole book is too heavy / not useful). */
export function diffTokens(a: string[], b: string[], join = " ", cap = 1500): DiffOp[] | null {
  if (a.length > cap || b.length > cap) return null;
  const n = a.length;
  const m = b.length;
  // LCS length table (suffix DP).
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "del", text: a[i++] });
    } else {
      raw.push({ type: "add", text: b[j++] });
    }
  }
  while (i < n) raw.push({ type: "del", text: a[i++] });
  while (j < m) raw.push({ type: "add", text: b[j++] });
  // Merge consecutive ops of the same type for compact rendering.
  const merged: DiffOp[] = [];
  for (const op of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.text += join + op.text;
    else merged.push({ ...op });
  }
  return merged;
}

/** Whitespace word-diff for English/space-separated prose. */
export function wordDiff(before: string, after: string, cap = 1500): DiffOp[] | null {
  return diffTokens(before.split(/\s+/).filter(Boolean), after.split(/\s+/).filter(Boolean), " ", cap);
}

/** HEURISTIC token estimate for LLM prompts — chars-per-token ratios (Thai ≈1.65,
 *  other ≈4), so Thai text costs roughly 2–2.5× English per word. This is an
 *  approximation for sizing prompts in the UI, not a measurement: real counts
 *  vary by model tokenizer. Always present it as "≈". */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const thai = (text.match(/[฀-๿]/g) ?? []).length;
  const other = text.length - thai;
  return Math.ceil(thai / 1.65 + other / 4);
}

/** max / min over an array without the spread operator.
 *
 *  `Math.max(...arr)` passes every element as a call ARGUMENT, and a large enough array
 *  (~123k in current V8) overflows the call stack — throwing RangeError and losing the
 *  whole result. A tokenizer's clause-length array reaches that on a long Thai manuscript,
 *  where clauses track token count. Reduce has no such ceiling. Empty → the supplied
 *  fallback (default 0), matching the `arr.length ? … : 0` guards these replace. */
export function maxOf(arr: number[], empty = 0): number {
  let m = empty;
  for (let i = 0; i < arr.length; i++) if (i === 0 || arr[i] > m) m = arr[i];
  return m;
}
export function minOf(arr: number[], empty = 0): number {
  let m = empty;
  for (let i = 0; i < arr.length; i++) if (i === 0 || arr[i] < m) m = arr[i];
  return m;
}

/** Count occurrences of `term` in `hay` that stand as a whole word — i.e. neither neighbour
 *  is a word-continuation character (a Thai letter, a Latin letter, or a digit).
 *
 *  Thai has no spaces inside a phrase, so a raw `includes`/`split` count of a short name
 *  fires INSIDE longer words: "สม" inside "สมชาย", "หมอ" (doctor) inside "หมอน" (pillow),
 *  "แต่" (but) inside "แต่งงาน" (wedding). Intl.Segmenter is too inconsistent to build a
 *  boundary on (it fragments "แอนนา" into แอ|น|นา). Asking directly whether the match is
 *  flanked by word-continuation characters answers exactly the "is this a whole word"
 *  question, and is the safe direction for a trust-critical flag: it can miss a name run
 *  together with an adjacent Thai word (a false negative), never falsely accuse one.
 *
 *  `hay` and `term` should already be same-cased. Non-overlapping. Pure. */
const WORD_CONT = /[฀-๿a-z0-9]/i;
export function boundedCount(hay: string, term: string): number {
  if (!term) return 0;
  let count = 0;
  let i = hay.indexOf(term);
  while (i !== -1) {
    const before = i > 0 ? hay[i - 1] : "";
    const after = i + term.length < hay.length ? hay[i + term.length] : "";
    if (!WORD_CONT.test(before) && !WORD_CONT.test(after)) count++;
    i = hay.indexOf(term, i + term.length);
  }
  return count;
}

const NAME_RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
/** Count each declared NAME in a body of text, per language.
 *
 *  Thai: substring + CAST-AWARE overlap subtraction (countPhrases) — a short name that only
 *  ever falls inside a LONGER declared name (แอน inside แอนนา) nets to 0, while a short name
 *  run together with an ordinary word (เอิ่ม in เอิ่มพูด) is still counted. This is the
 *  phantom-match fix that a plain word-boundary check could not give without collapsing
 *  recall on Thai's space-free prose.
 *
 *  English: \b word boundaries already prevent a name matching inside a longer word ("Ann"
 *  in "Anna", "Sam" in "same"), so no overlap subtraction is needed. Returns a name→count
 *  map keyed by the ORIGINAL-cased names. Pure/deterministic. */
export function countNames(body: string, names: string[], lang: "th" | "en"): Map<string, number> {
  if (lang === "en") {
    const hay = body.toLowerCase();
    return new Map(names.map((n) => {
      const re = new RegExp(`\\b${n.toLowerCase().replace(NAME_RE_ESCAPE, "\\$&")}\\b`, "g");
      return [n, (hay.match(re) ?? []).length] as const;
    }));
  }
  const out = new Map<string, number>(names.map((n) => [n, 0]));
  for (const { phrase, count } of countPhrases(body, names)) out.set(phrase, count);
  return out;
}
