// ╔══════════════════════════════════════════════════════════════════╗
// ║  SYMSPELL (Symmetric Delete) — near-linear edit-distance-≤1 lookup.║
// ║  Index each term plus all of its single-character deletions; two   ║
// ║  strings are within edit distance 1 iff their delete-sets share a  ║
// ║  key. That turns "find all near-spelling neighbours" from O(n²)    ║
// ║  pairwise into ~O(n·L). A verify callback confirms the true        ║
// ║  distance, so results are exact — the index only proposes.         ║
// ║  Pure, no deps. (Wolf Garbe's SymSpell, distance 1.)               ║
// ╚══════════════════════════════════════════════════════════════════╝

/** All strings formed by deleting exactly one character (distance-1 deletes). */
export function deletes1(s: string): string[] {
  if (s.length <= 1) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.slice(0, i) + s.slice(i + 1));
  return out;
}

export interface SymIndex {
  map: Map<string, Set<string>>; // key (term or a 1-delete) → the original terms that produced it
}

/** Build the symmetric-delete index over a term set. */
export function buildSymIndex(terms: string[]): SymIndex {
  const map = new Map<string, Set<string>>();
  const add = (key: string, term: string) => {
    let s = map.get(key);
    if (!s) { s = new Set(); map.set(key, s); }
    s.add(term);
  };
  for (const t of terms) {
    if (!t) continue;
    add(t, t); // distance-0
    for (const d of deletes1(t)) add(d, t); // distance-1
  }
  return { map };
}

/** Terms within edit distance ≤ 1 of `term` (excluding itself). `verify` confirms the
 *  real distance so candidates from the delete-index are exact. */
export function neighbors(term: string, idx: SymIndex, verify: (a: string, b: string) => boolean): string[] {
  const cand = new Set<string>();
  const consider = (key: string) => {
    const s = idx.map.get(key);
    if (s) for (const t of Array.from(s)) if (t !== term) cand.add(t);
  };
  consider(term);
  for (const d of deletes1(term)) consider(d);
  return Array.from(cand).filter((c) => verify(term, c));
}
