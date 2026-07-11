// ╔══════════════════════════════════════════════════════════════════╗
// ║  THAI REGISTER / SPELLING — deterministic word-standardisation.    ║
// ║  Flags loanword spellings and informal forms that have a more      ║
// ║  standard Thai (Royal-Institute-style) equivalent, and suggests it.║
// ║  Crucially, PROPER NOUNS (the writer's glossary) are skipped — a   ║
// ║  coined name is never "wrong". Deterministic: counts + a suggestion║
// ║  per term, never a verdict. The seed map is small and EXTENSIBLE   ║
// ║  (opts.extra, or a plugin lexicon) — the writer owns the rules.    ║
// ╚══════════════════════════════════════════════════════════════════╝

import { countPhrases } from "./text-util";
import { tokenizeThai } from "./thai-analyzer";

export interface RegisterRule { term: string; suggest: string; note?: string }
export interface RegisterFinding { term: string; suggest: string; note?: string; count: number }

// Seed: high-confidence spelling standardisations + a few clear informal→formal
// swaps. Deliberately small and defensible — extend via opts.extra or a plugin.
export const THAI_REGISTER_SEED: RegisterRule[] = [
  // Royal-Institute spellings of common loanwords
  { term: "อัพเดท", suggest: "อัปเดต", note: "การสะกดตามราชบัณฑิตฯ" },
  { term: "อัพเดต", suggest: "อัปเดต", note: "อัพ → อัป" },
  { term: "อัพโหลด", suggest: "อัปโหลด" },
  { term: "อีเมล์", suggest: "อีเมล" },
  { term: "เว็ป", suggest: "เว็บ" },
  { term: "แคปเจอร์", suggest: "จับภาพ" },
  { term: "ก็อปปี้", suggest: "คัดลอก" },
  { term: "ดีเลย์", suggest: "หน่วงเวลา" },
  // informal → formal
  { term: "เช็ค", suggest: "ตรวจสอบ", note: "ทางการกว่า" },
  { term: "โฟกัส", suggest: "มุ่งเน้น" },
  { term: "ไอเดีย", suggest: "ความคิด / ไอเดีย" },
  { term: "คอมเมนต์", suggest: "ความคิดเห็น" },
];

/** Scan Thai text for words with a more standard form. `skip` (e.g. the writer's
 *  glossary of proper nouns) is excluded so coined names never get flagged; `extra`
 *  adds the writer's / a plugin's own rules. Suggestions, not errors. */
export function checkThaiRegister(text: string, opts?: { skip?: string[]; extra?: RegisterRule[] }): RegisterFinding[] {
  const skip = new Set((opts?.skip ?? []).map((s) => s.trim()).filter(Boolean));
  // Later rules (extra) win over the seed on the same term; skipped terms drop out.
  const byTerm = new Map<string, RegisterRule>();
  for (const r of [...THAI_REGISTER_SEED, ...(opts?.extra ?? [])]) {
    if (r.term && r.suggest && !skip.has(r.term)) byTerm.set(r.term, r);
  }
  const rules = Array.from(byTerm.values());
  if (!rules.length) return [];

  const tokens = tokenizeThai(text);
  const counts = countPhrases(text, rules.map((r) => r.term), { tokens });
  const countOf = new Map(counts.map((c) => [c.phrase, c.count]));
  return rules
    .map((r) => ({ ...r, count: countOf.get(r.term) ?? 0 }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count);
}
