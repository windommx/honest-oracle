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
    const single = tokenFreq && !phrase.includes(" ");
    const count = single ? (tokenFreq!.get(phrase) ?? 0) : (acCounts?.get(phrase) ?? 0);
    return { phrase, count };
  });
  return raw
    .map(({ phrase, count }) => {
      const overlap = raw.reduce(
        (sum, o) => (o.phrase !== phrase && o.phrase.length > phrase.length && o.phrase.includes(phrase) ? sum + o.count : sum),
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
