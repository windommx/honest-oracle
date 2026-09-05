// ╔══════════════════════════════════════════════════════════════════╗
// ║  TRANSLATION FAITHFULNESS — deterministic checks for Thai→English  ║
// ║  (or any) translation, aimed at the "AI drifts to the mean /       ║
// ║  hallucinates / adds inner monologue" problem web-novel authors    ║
// ║  hit when translating for Royal Road etc.                          ║
// ║                                                                    ║
// ║  No LLM: given a terminology map + the source and target text, it  ║
// ║  COUNTS real violations (a banned rendering used, a canon term     ║
// ║  dropped, wrong capitalisation) and flags length-ratio anomalies   ║
// ║  (a chunk that ballooned = likely added content; that shrank =     ║
// ║  likely summarised). Counts + evidence, never a quality score.     ║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";
import { countPhrases } from "./text-util";
import { tokenizeProse } from "./prose-analyzer";
import { tokenizeThai } from "./thai-analyzer";

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;

/** One canon-term rule. `target` is the required English rendering; `source` its Thai
 *  original (to detect drops); `forbidden` are renderings the AI must NOT use (e.g. a
 *  bespoke power system "Taba" must never become magic/mana/qi); `caseSensitive` flags
 *  a term that must keep its capitalisation. */
export interface TermRule {
  target: string;
  source?: string;
  forbidden?: string[];
  caseSensitive?: boolean;
}

export interface TermFinding {
  rule: string;
  kind: "forbidden-rendering" | "dropped-term" | "wrong-case";
  detail: string;
  count: number;
}

/** Check a translation against a terminology map. Deterministic; every finding cites
 *  the real term + a count. */
export function checkTranslation(sourceThai: string, targetEn: string, rules: TermRule[]): TermFinding[] {
  const findings: TermFinding[] = [];
  const enTokens = tokenizeProse(targetEn);
  const thTokens = tokenizeThai(sourceThai);
  const targetLower = targetEn.toLowerCase();

  for (const r of rules) {
    // 1) Banned renderings present in the target (word-exact for single words).
    if (r.forbidden?.length) {
      for (const h of countPhrases(targetLower, r.forbidden.map((f) => f.toLowerCase()), { tokens: enTokens })) {
        findings.push({ rule: r.target, kind: "forbidden-rendering", detail: `ใช้ "${h.phrase}" แทน "${r.target}"`, count: h.count });
      }
    }
    // 2) Canon term present in the SOURCE but absent from the TARGET (dropped/erased).
    if (r.source) {
      const src = countPhrases(sourceThai, [r.source], { tokens: thTokens }).reduce((s, h) => s + h.count, 0);
      // Presence is case-insensitive (tokens are lowercased); capitalisation is handled
      // separately by the wrong-case check, so a lowercase "taba" still counts as present.
      const tgt = countPhrases(targetLower, [r.target.toLowerCase()], { tokens: enTokens }).reduce((s, h) => s + h.count, 0);
      if (src > 0 && tgt === 0) {
        findings.push({ rule: r.target, kind: "dropped-term", detail: `"${r.source}" อยู่ในต้นฉบับ ${src}× แต่ไม่พบ "${r.target}" ในคำแปล`, count: src });
      }
    }
    // 3) Wrong capitalisation of a case-sensitive term (e.g. "taba" instead of "Taba").
    if (r.caseSensitive) {
      const word = new RegExp(`\\b${r.target.replace(RE_ESCAPE, "\\$&")}\\b`, "g");
      const wordCI = new RegExp(`\\b${r.target.replace(RE_ESCAPE, "\\$&")}\\b`, "gi");
      const exact = (targetEn.match(word) ?? []).length;
      const anyCase = (targetLower.match(new RegExp(`\\b${r.target.toLowerCase().replace(RE_ESCAPE, "\\$&")}\\b`, "g")) ?? []).length;
      void wordCI;
      if (anyCase > exact) {
        findings.push({ rule: r.target, kind: "wrong-case", detail: `"${r.target}" ถูกเขียนผิดตัวพิมพ์ ${anyCase - exact}×`, count: anyCase - exact });
      }
    }
  }
  return findings;
}

export interface ChunkRatio {
  chapter: number;
  sourceChars: number;
  targetChars: number;
  ratio: number; // target ÷ source
  flag: "expanded" | "shrunk" | null; // deviates from the median ratio → possible added / summarised content
}
export interface ExpansionReport {
  chunks: ChunkRatio[];
  medianRatio: number;
}

/** Per-chapter length-ratio check. Absolute Thai→English ratio isn't meaningful, but a
 *  chapter whose ratio deviates far from the book's median is a real signal that content
 *  was added (expanded) or cut (summarised). Deterministic; a signal, not a verdict. */
export function expansionReport(sourceThai: string, targetEn: string, tolerance = 1.6): ExpansionReport {
  const src = splitChapters(sourceThai).filter((c) => c.body.trim());
  const tgt = splitChapters(targetEn).filter((c) => c.body.trim());
  const n = Math.min(src.length, tgt.length);
  const raw: ChunkRatio[] = [];
  for (let i = 0; i < n; i++) {
    const s = src[i].body.replace(/\s/g, "").length;
    const t = tgt[i].body.replace(/\s/g, "").length;
    raw.push({ chapter: i + 1, sourceChars: s, targetChars: t, ratio: s ? Math.round((t / s) * 100) / 100 : 0, flag: null });
  }
  const ratios = raw.map((r) => r.ratio).filter((r) => r > 0).sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 0;
  const chunks = raw.map((r) => ({
    ...r,
    flag: median && r.ratio > 0
      ? r.ratio > median * tolerance ? "expanded" as const
        : r.ratio < median / tolerance ? "shrunk" as const : null
      : null,
  }));
  return { chunks, medianRatio: median };
}
