// ╔══════════════════════════════════════════════════════════════════╗
// ║  AHO-CORASICK — one-pass multi-pattern matching. Pure, no deps.    ║
// ║  Builds a trie + failure links, then finds every occurrence of a   ║
// ║  whole pattern set in a single scan: O(n + Σ|pattern| + matches).  ║
// ║  Used to count lexicon hits (sensory / AI-tell / tell-words) in    ║
// ║  one pass instead of one text scan per phrase.                     ║
// ║  Matching is over UTF-16 units (fine for Thai + Latin — BMP).      ║
// ╚══════════════════════════════════════════════════════════════════╝

interface Node {
  next: Map<string, number>;
  fail: number;
  out: number[]; // indices (into patterns) that END at this node
}
export interface Automaton {
  nodes: Node[];
  patterns: string[];
  len: number[]; // pattern lengths, by index
}

/** Build the Aho-Corasick automaton for a set of patterns (empty patterns ignored). */
export function buildAutomaton(patterns: string[]): Automaton {
  const pats = patterns.filter((p) => p.length > 0);
  const nodes: Node[] = [{ next: new Map(), fail: 0, out: [] }];
  const len: number[] = [];

  pats.forEach((p, pi) => {
    len[pi] = p.length;
    let cur = 0;
    for (const ch of p) {
      let nxt = nodes[cur].next.get(ch);
      if (nxt === undefined) {
        nxt = nodes.length;
        nodes.push({ next: new Map(), fail: 0, out: [] });
        nodes[cur].next.set(ch, nxt);
      }
      cur = nxt;
    }
    nodes[cur].out.push(pi);
  });

  // BFS to set failure links + merge outputs along fail chain.
  const queue: number[] = [];
  for (const child of Array.from(nodes[0].next.values())) {
    nodes[child].fail = 0;
    queue.push(child);
  }
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h];
    for (const [ch, v] of Array.from(nodes[u].next)) {
      let f = nodes[u].fail;
      while (f !== 0 && !nodes[f].next.has(ch)) f = nodes[f].fail;
      const fallback = nodes[f].next.get(ch);
      nodes[v].fail = fallback !== undefined && fallback !== v ? fallback : 0;
      nodes[v].out.push(...nodes[nodes[v].fail].out);
      queue.push(v);
    }
  }
  return { nodes, patterns: pats, len };
}

export interface Match { pattern: string; index: number; start: number; end: number }

/** Every occurrence of every pattern, in text order (by end position). Overlapping
 *  matches are all reported. */
export function findAll(text: string, a: Automaton): Match[] {
  const out: Match[] = [];
  let cur = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    while (cur !== 0 && !a.nodes[cur].next.has(ch)) cur = a.nodes[cur].fail;
    cur = a.nodes[cur].next.get(ch) ?? 0;
    for (const pi of a.nodes[cur].out) {
      const end = i + 1;
      out.push({ pattern: a.patterns[pi], index: pi, start: end - a.len[pi], end });
    }
  }
  return out;
}

/** Per-pattern count of NON-overlapping, leftmost occurrences — matches the semantics
 *  of `text.split(pattern).length - 1` (used by countPhrases), but for the whole set in
 *  one pass. Greedy: accept a match only if it starts at/after the previous accepted end. */
export function countNonOverlapping(text: string, patterns: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of patterns) counts.set(p, 0);
  if (!patterns.some((p) => p.length > 0)) return counts;

  const a = buildAutomaton(patterns);
  const lastEnd = new Map<number, number>(); // patternIndex → end of last accepted match
  for (const m of findAll(text, a)) {
    if (m.start >= (lastEnd.get(m.index) ?? -1)) {
      counts.set(m.pattern, (counts.get(m.pattern) ?? 0) + 1);
      lastEnd.set(m.index, m.end);
    }
  }
  return counts;
}
