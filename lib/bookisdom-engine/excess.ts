// ╔══════════════════════════════════════════════════════════════════╗
// ║  EXCESS VOCABULARY — the Kobak et al. method, as a tool.           ║
// ║                                                                    ║
// ║  Kobak et al. (Science Advances 2025) found AI-tell words          ║
// ║  ("delve" ×28…) by comparing word frequencies BEFORE vs AFTER      ║
// ║  ChatGPT across 15M abstracts. No such study exists for Thai —     ║
// ║  the research gap is real. We refuse to invent a Thai tell-list    ║
// ║  from vibes; instead this implements the METHOD: give it two       ║
// ║  corpora (baseline/human vs suspect/AI) and it counts which words  ║
// ║  are overrepresented, with the sample sizes shown so small-corpus  ║
// ║  noise is visible instead of hidden. The ratios are facts; calling ║
// ║  a word an "AI tell" from them is the user's judgement.            ║
// ╚══════════════════════════════════════════════════════════════════╝

import { tokenizeThai } from "./thai-analyzer";
import { tokenizeProse } from "./prose-analyzer";

export interface ExcessWord {
  word: string;
  countB: number;      // occurrences in the suspect corpus
  perMilB: number;     // per-million rate in suspect
  countA: number;      // occurrences in the baseline corpus
  perMilA: number;
  ratio: number;       // perMilB / perMilA (smoothed); Infinity → reported via onlyInB
}
export interface ExcessReport {
  tokensA: number;
  tokensB: number;
  minCount: number;
  excess: ExcessWord[];   // words over-represented in B, ratio desc
  onlyInB: Array<{ word: string; countB: number }>; // absent from baseline entirely
}

const MIN_WORD_LEN = 3;

/** Compare word frequencies of corpus B (suspect) against corpus A (baseline).
 *  Pure counting: rates per million tokens + smoothed ratio. minCount guards
 *  against single-occurrence noise; small corpora stay visibly small via
 *  tokensA/tokensB in the report. */
export function excessVocabulary(
  baseline: string,
  suspect: string,
  lang: "th" | "en",
  minCount = 5
): ExcessReport {
  const tok = (s: string) => (lang === "th" ? tokenizeThai(s) : tokenizeProse(s.toLowerCase()));
  const count = (tokens: string[]) => {
    const m = new Map<string, number>();
    for (const t of tokens) {
      if (t.length < MIN_WORD_LEN) continue;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  };

  const ta = tok(baseline);
  const tb = tok(suspect);
  const fa = count(ta);
  const fb = count(tb);
  const totalA = Math.max(1, ta.length);
  const totalB = Math.max(1, tb.length);

  const excess: ExcessWord[] = [];
  const onlyInB: Array<{ word: string; countB: number }> = [];

  fb.forEach((cb, word) => {
    if (cb < minCount) return;
    const ca = fa.get(word) ?? 0;
    const perMilB = (cb / totalB) * 1_000_000;
    const perMilA = (ca / totalA) * 1_000_000;
    if (ca === 0) {
      onlyInB.push({ word, countB: cb });
      return;
    }
    const ratio = perMilB / perMilA;
    if (ratio >= 2) excess.push({ word, countB: cb, perMilB: Math.round(perMilB), countA: ca, perMilA: Math.round(perMilA), ratio: Math.round(ratio * 10) / 10 });
  });

  excess.sort((a, b) => b.ratio - a.ratio || b.countB - a.countB);
  onlyInB.sort((a, b) => b.countB - a.countB);

  return { tokensA: ta.length, tokensB: tb.length, minCount, excess: excess.slice(0, 30), onlyInB: onlyInB.slice(0, 15) };
}

/** Human-readable report (bilingual). Ratios are facts; the "tell" verdict is not ours. */
export function formatExcess(report: ExcessReport, lang: "th" | "en"): string {
  const th = lang === "th";
  const L: string[] = [
    th
      ? `# excess vocabulary — เทียบความถี่คำ (วิธีของ Kobak et al. 2025 · นับได้ ไม่ใช่คำตัดสิน)`
      : `# excess vocabulary — word-frequency comparison (Kobak et al. 2025 method · counts, not a verdict)`,
    th
      ? `corpus ฐาน ${report.tokensA.toLocaleString("en-US")} token · corpus ตรวจ ${report.tokensB.toLocaleString("en-US")} token · นับเฉพาะคำที่พบ ≥${report.minCount} ครั้ง`
      : `baseline ${report.tokensA.toLocaleString("en-US")} tokens · suspect ${report.tokensB.toLocaleString("en-US")} tokens · words with ≥${report.minCount} occurrences only`,
  ];
  if (report.tokensA < 5000 || report.tokensB < 5000) {
    L.push(th ? "⚠ corpus เล็กกว่า 5k token — อัตราส่วนจะผันผวนสูง อ่านเป็นแนวโน้มเท่านั้น" : "⚠ corpus under 5k tokens — ratios will be noisy; read as tendencies only.");
  }
  if (report.excess.length) {
    L.push("", th ? "คำที่โผล่เกินสัดส่วนใน corpus ตรวจ (≥2×):" : "over-represented in suspect corpus (≥2×):");
    for (const w of report.excess) L.push(`  ${w.word}  ×${w.ratio}  (${w.countB}× = ${w.perMilB}/M vs ${w.countA}× = ${w.perMilA}/M)`);
  }
  if (report.onlyInB.length) {
    L.push("", th ? "พบเฉพาะใน corpus ตรวจ (ไม่มีในฐานเลย):" : "present only in suspect corpus:");
    for (const w of report.onlyInB) L.push(`  ${w.word} ×${w.countB}`);
  }
  if (!report.excess.length && !report.onlyInB.length) {
    L.push("", th ? "ไม่พบคำที่เกินสัดส่วนตามเกณฑ์" : "no words over the thresholds.");
  }
  L.push(
    "",
    th
      ? "อัตราส่วนคือข้อเท็จจริง — การตีความว่าคำไหนเป็น 'AI-tell' เป็นวิจารณญาณของคุณ และขึ้นกับคุณภาพ corpus ที่คุณเลือกเทียบ"
      : "the ratios are facts — deciding a word is an 'AI tell' is your judgement, and only as good as the corpora you chose."
  );
  return L.join("\n") + "\n";
}
