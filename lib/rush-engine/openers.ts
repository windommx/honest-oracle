// ╔══════════════════════════════════════════════════════════════════╗
// ║  OPENER MONOTONY — a real, countable prose weakness.               ║
// ║                                                                    ║
// ║  When too many sentences start the same way ("He… He… He…" /       ║
// ║  "เขา… เขา… เขา…"), the rhythm goes flat — editors and agents flag  ║
// ║  it constantly. It is also purely COUNTABLE, so the engine can      ║
// ║  report it honestly: the count and the share of units, never a      ║
// ║  0–100 "flow score". Fixing it is the writer's call; the number     ║
// ║  is just a mirror.                                                  ║
// ║                                                                    ║
// ║  EN: units = sentences (split on .!?… / newlines), opener = first   ║
// ║  word. TH: units = clauses (Thai uses spaces as clause breaks),     ║
// ║  opener = first tokenised word.                                     ║
// ╚══════════════════════════════════════════════════════════════════╝

import { tokenizeThai } from "./thai-analyzer";

export interface OpenerStat {
  opener: string;
  count: number;
  ratio: number; // share of all units that open with this word (0..1)
}
export interface OpenerReport {
  units: number;    // sentences (EN) / clauses (TH) counted
  distinct: number; // distinct opening words
  top: OpenerStat[]; // most frequent openers (up to 6), desc
  monotone: OpenerStat[]; // openers past the monotony threshold — the ones worth varying
}

// A unit is "monotone" when one opener carries a real share of the text AND
// repeats enough times that it isn't just noise from a tiny sample.
const MIN_COUNT = 3;
const MIN_RATIO = 0.12;

function unitsEn(text: string): string[] {
  return text
    .split(/[.!?…]+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function openerEn(unit: string): string {
  const m = unit.match(/[A-Za-z][A-Za-z']*/);
  return m ? m[0].toLowerCase() : "";
}

function unitsTh(text: string): string[] {
  // Thai has no sentence period; spaces (and newlines/punctuation) mark clause
  // boundaries. Each clause is a unit — that's where "เขา…เขา…" monotony lives.
  return text
    .split(/[\s.!?…]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function openerTh(unit: string): string {
  const toks = tokenizeThai(unit);
  return toks.length ? toks[0] : "";
}

/** Count how sentences/clauses begin. Pure/deterministic. */
export function analyzeOpeners(text: string, lang: "th" | "en"): OpenerReport {
  const units = lang === "th" ? unitsTh(text) : unitsEn(text);
  const opener = lang === "th" ? openerTh : openerEn;

  const counts = new Map<string, number>();
  let counted = 0;
  for (const u of units) {
    const o = opener(u);
    if (!o) continue;
    counts.set(o, (counts.get(o) ?? 0) + 1);
    counted++;
  }

  const stats: OpenerStat[] = [];
  counts.forEach((count, o) => stats.push({ opener: o, count, ratio: counted ? count / counted : 0 }));
  stats.sort((a, b) => b.count - a.count || a.opener.localeCompare(b.opener));

  return {
    units: counted,
    distinct: counts.size,
    top: stats.slice(0, 6),
    monotone: stats.filter((s) => s.count >= MIN_COUNT && s.ratio >= MIN_RATIO),
  };
}

/** Human-readable opener report (bilingual). Counts, not a verdict. */
export function formatOpeners(report: OpenerReport, lang: "th" | "en"): string {
  const th = lang === "th";
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  const L: string[] = [
    th
      ? `# openers — คำขึ้นต้น (${report.units} หน่วย · ${report.distinct} แบบ · นับได้ ไม่ใช่คำตัดสิน)`
      : `# openers — sentence starts (${report.units} units · ${report.distinct} distinct · counts, not a verdict)`,
  ];
  if (report.monotone.length) {
    L.push("", th ? "ขึ้นต้นซ้ำมาก (ลองสลับจังหวะ):" : "over-used openers (consider varying):");
    for (const s of report.monotone) L.push(`  "${s.opener}" ×${s.count} (${pct(s.ratio)})`);
  } else {
    L.push("", th ? "ไม่มีคำขึ้นต้นที่ซ้ำเกินเกณฑ์ — จังหวะเปิดหลากหลายดี" : "no opener repeats past the threshold — varied openings.");
  }
  if (report.top.length) {
    L.push("", th ? "ที่พบบ่อยสุด:" : "most frequent:");
    for (const s of report.top) L.push(`  "${s.opener}" ×${s.count} (${pct(s.ratio)})`);
  }
  return L.join("\n") + "\n";
}
