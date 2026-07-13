// ╔══════════════════════════════════════════════════════════════════╗
// ║  RELATIONSHIP GRAPH — deterministic character co-occurrence.       ║
// ║  Given the cast (the writer's names / glossary), it counts who     ║
// ║  shares scenes with whom, per chapter: nodes carry mention counts  ║
// ║  and the chapters they appear in; edges are the chapters two        ║
// ║  characters share (edge weight = shared-chapter count). No LLM —    ║
// ║  the STRUCTURE of the character board (who connects, how strongly) ║
// ║  is real and rerun-stable. The relationship LABELS (mentor, rival) ║
// ║  are semantic — that's the writer's / an LLM's call, not a count.  ║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const countEn = (s: string, term: string) => (s.match(new RegExp(`\\b${term.replace(RE_ESCAPE, "\\$&")}\\b`, "g")) ?? []).length;
const countTh = (s: string, term: string) => (term ? s.split(term).length - 1 : 0);

export interface CharNode { name: string; mentions: number; chapters: number[] }
export interface CharEdge { a: string; b: string; weight: number; chapters: number[] }
export interface CharacterGraph {
  chapters: number;
  nodes: CharNode[]; // by mention count, desc
  edges: CharEdge[]; // by shared-chapter weight, desc
}

/** Build the co-occurrence graph for a named cast. `names` are exact strings (a
 *  writer glossary of characters/places). Deterministic; counts, not inference. */
export function characterGraph(text: string, names: string[], lang: "th" | "en" = "th"): CharacterGraph {
  const cast = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2)));
  const count = lang === "en" ? countEn : countTh;
  const chunks = splitChapters(text).map((c, i) => ({ n: i + 1, body: c.body })).filter((c) => c.body.trim());

  // per-name: total mentions + set of chapters present in
  const present = new Map<string, Set<number>>(cast.map((n) => [n, new Set<number>()]));
  const mentions = new Map<string, number>(cast.map((n) => [n, 0]));
  for (const ch of chunks) {
    for (const name of cast) {
      const c = count(ch.body, name);
      if (c > 0) {
        mentions.set(name, (mentions.get(name) ?? 0) + c);
        present.get(name)!.add(ch.n);
      }
    }
  }

  const nodes: CharNode[] = cast
    .map((name) => ({ name, mentions: mentions.get(name) ?? 0, chapters: Array.from(present.get(name)!).sort((a, b) => a - b) }))
    .filter((n) => n.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions);

  const edges: CharEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const shared = nodes[i].chapters.filter((c) => present.get(nodes[j].name)!.has(c));
      if (shared.length) edges.push({ a: nodes[i].name, b: nodes[j].name, weight: shared.length, chapters: shared });
    }
  }
  edges.sort((a, b) => b.weight - a.weight || a.a.localeCompare(b.a));

  return { chapters: chunks.length, nodes, edges };
}
