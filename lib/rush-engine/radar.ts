// ╔══════════════════════════════════════════════════════════════════╗
// ║  CONTINUITY RADAR — deterministic canon vs. manuscript check.      ║
// ║  Given the CANON cast (the writer's glossary / story bible) and    ║
// ║  the text, it flags drift: a canon name that never appears, and a  ║
// ║  frequently-used name that ISN'T in canon (a rename the AI slipped ║
// ║  in, or a typo). No LLM — the same job kathawut's "Continuity      ║
// ║  Radar" spends tokens on, done by counting.                        ║
// ║  It does NOT emit Momentum/Clarity/Tension 0–100 scores — those    ║
// ║  are subjective LLM guesses (a fake metric this platform forbids); ║
// ║  see sceneReadout() for the real, measurable substrate instead.    ║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";
import { storyBible } from "./consistency";

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const countEn = (s: string, t: string) => (s.match(new RegExp(`\\b${t.replace(RE_ESCAPE, "\\$&")}\\b`, "g")) ?? []).length;
const countTh = (s: string, t: string) => (t ? s.split(t).length - 1 : 0);

export interface RadarFinding {
  kind: "unused-canon" | "off-canon";
  term: string;
  detail: string;
  count: number;
}

/** Compare the manuscript against the canon name list. Deterministic; counts, not a
 *  verdict. `unused-canon` = a canon name that never shows up; `off-canon` = a name
 *  used repeatedly that isn't in canon (possible drift/rename/typo). */
export function continuityRadar(text: string, canon: string[], lang: "th" | "en" = "th"): RadarFinding[] {
  const canonList = Array.from(new Set(canon.map((c) => c.trim()).filter((c) => c.length >= 2)));
  const canonSet = new Set(canonList);
  const count = lang === "en" ? countEn : countTh;
  const body = splitChapters(text).map((c) => c.body).join("\n"); // skip headings
  const findings: RadarFinding[] = [];

  // 1) canon names that never appear in the manuscript
  for (const c of canonList) {
    if (count(text, c) === 0) findings.push({ kind: "unused-canon", term: c, detail: `canon "${c}" ไม่พบในเนื้อหา`, count: 0 });
  }

  // 2) recurring names/terms (≥3×) that are NOT in canon — a rename the AI slipped in,
  //    a typo, or an undeclared entity. Reuses the story-bible extractor: English pulls
  //    capitalised proper nouns; Thai pulls recurring content tokens (may include a
  //    common word — honestly flagged as "review", not "wrong").
  const off = storyBible(body, lang, 3).entries.filter((e) => !canonSet.has(e.term)).slice(0, 15);
  for (const e of off) {
    findings.push({
      kind: "off-canon",
      term: e.term,
      detail: lang === "th" ? `"${e.term}" ซ้ำ ${e.count}× แต่ไม่อยู่ใน canon` : `"${e.term}" appears ${e.count}× but isn't in canon`,
      count: e.count,
    });
  }
  return findings;
}

export interface SceneReadout {
  words: number;
  clauses: number;
  rhythmCv: number; // sentence-length variation (flat prose → low)
  dialogueRatio: number;
  tellingPer100: number; // named-emotion / filter-verb density
  sensoryPer1k: number;
  aiTells: number;
}

/** The HONEST substrate of a "scene intelligence" panel: real, measured signals for one
 *  scene — NOT invented 0–100 Momentum/Clarity/Tension scores. Thai only for now (the
 *  analyzers it reuses are deterministic). */
export function sceneReadout(scene: string, analyze: (t: string) => {
  wordCount: number;
  sentences: { count: number };
  rhythm: { cv: number };
  dialogue: { ratio: number };
  telling: { ratio: number };
  aiTells: { count: number }[];
}, sensoryTotalPer1k: number): SceneReadout {
  const a = analyze(scene);
  return {
    words: a.wordCount,
    clauses: a.sentences.count,
    rhythmCv: a.rhythm.cv,
    dialogueRatio: a.dialogue.ratio,
    tellingPer100: a.telling.ratio,
    sensoryPer1k: sensoryTotalPer1k,
    aiTells: a.aiTells.reduce((s, t) => s + t.count, 0),
  };
}
