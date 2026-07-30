// ╔══════════════════════════════════════════════════════════════════╗
// ║  THAI ANALYZER — deterministic, client-side Thai prose checks      ║
// ║  No LLM. Uses Intl.Segmenter for real Thai word segmentation.     ║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";
import { countPhrases } from "./text-util";

export const THAI_STOPWORDS = new Set([
  "ที่", "และ", "เป็น", "ของ", "ใน", "มี", "ไม่", "ได้", "จะ", "ก็", "ให้", "แต่", "กับ", "นี้",
  "นั้น", "เขา", "เธอ", "มัน", "ว่า", "การ", "ความ", "จาก", "ด้วย", "มา", "ไป", "อยู่", "แล้ว",
  "ๆ", "หรือ", "ทุก", "ถ้า", "เมื่อ", "อย่าง", "ซึ่ง", "โดย", "เพื่อ", "คือ", "ทั้ง", "ยัง", "เลย",
  "นะ", "ค่ะ", "ครับ", "เรา", "ฉัน", "ผม", "คุณ", "หนึ่ง", "บน", "ตัว", "คน", "นี่", "นั่น", "เอง",
  // extended
  "แค่", "พอ", "กว่า", "มาก", "น้อย", "บ้าง", "เพียง", "จึง", "ดัง", "ราว", "เช่น", "ต่อ", "ไว้",
  "ขึ้น", "ลง", "ออก", "เข้า", "ถึง", "กัน", "อีก", "ทำ", "เอา", "ไหน", "ใคร", "อะไร", "ทำไม",
  "เพราะ", "หาก", "แม้", "ทว่า", "อัน", "ต้อง", "ควร", "อาจ", "คง", "กำลัง", "เคย", "ย่อม",
  "ตาม", "ระหว่าง", "ภายใน", "เหนือ", "ใต้", "หลัง", "ก่อน", "ขณะ", "ส่วน", "พวก", "บรรดา",
  "เช่นกัน", "เท่า", "ทีเดียว", "นั่นเอง", "นี้เอง", "เสมอ", "ทันที", "ค่อย", "เริ่ม",
]);

// Emotion clichés / "AI-tell" phrases to flag (from the Anti-Safe constraint set).
export const THAI_AI_TELLS = [
  // tears / heart
  "น้ำตาไหลริน", "น้ำตาไหลพราก", "น้ำตาคลอเบ้า", "น้ำตาเอ่อ", "น้ำตารื้น",
  "หัวใจบีบรัด", "หัวใจสลาย", "หัวใจเต้นแรง", "หัวใจพองโต", "หัวใจแหลกสลาย", "ใจสลาย",
  // warmth / smile
  "รอยยิ้มอบอุ่น", "อบอุ่นหัวใจ", "อบอุ่นในใจ", "รอยยิ้มเปื้อนหน้า",
  // overwhelm
  "ความรู้สึกท่วมท้น", "ท่วมท้นไปด้วย", "ใจหายวาบ", "ใจหวิว", "อกสั่นขวัญแขวน", "ขนลุกซู่",
  // light / horizon
  "แสงสว่างที่ปลายอุโมงค์", "สุดขอบฟ้า", "ปลายขอบฟ้า", "แสงแห่งความหวัง",
  // forever / memory
  "ตราตรึงในใจ", "มิอาจลืมเลือน", "ไม่มีวันลืม", "ฝังลึกในความทรงจำ", "ชั่วนิรันดร์",
  // similes
  "ดั่งสายฟ้าฟาด", "ราวกับต้องมนตร์", "ราวกับฝัน", "ดั่งภาพวาด", "ราวกับเวลาหยุดนิ่ง",
  // life lessons (anti-safe)
  "บทเรียนล้ำค่า", "ทุกอย่างจะดีขึ้น", "แสงสว่างในความมืด", "ก้าวข้ามผ่าน",
  // "not just X, but Y" contrast crutch (ไม้ตายวาทศิลป์อันดับ 1 ของ LLM)
  "ไม่ใช่แค่", "ไม่ใช่เพียง", "ไม่เพียงแต่", "ไม่ได้เป็นเพียง", "หากแต่ยัง",
];

// "Telling" markers — filter/cognition verbs + directly-named emotions. A high
// density of these is a deterministic signal that a passage TELLS emotion instead
// of SHOWING it (pairs with the NIS Show-vs-Tell audit). This is a measured
// word-match, NOT a quality verdict — the user sees which words matched and decides.
export const THAI_TELL_WORDS = [
  // filter / cognition verbs (distance the reader from the moment)
  "รู้สึก", "ตระหนัก", "นึกว่า", "คิดว่า", "สังเกตเห็น", "รับรู้ว่า", "เข้าใจว่า",
  // directly named emotions
  "โกรธ", "เศร้า", "ดีใจ", "เสียใจ", "กลัว", "ตื่นเต้น", "เหงา", "อิจฉา",
  "ผิดหวัง", "ประหม่า", "กังวล", "โมโห", "หงุดหงิด", "ตกใจ", "อาย", "เขิน",
  "เกลียด", "สงสาร", "ภูมิใจ", "สับสน", "เบื่อ", "สิ้นหวัง", "ซาบซึ้ง",
  "ปลื้ม", "ละอาย", "ท้อแท้", "หวาดกลัว", "ดีอกดีใจ", "ขมขื่น",
];

const NEAR_WINDOW = 40; // tokens — a content word repeated within this span is a near-repeat

export interface ThaiAnalysis {
  wordCount: number;
  charCount: number;
  uniqueWords: number;
  /** Sentence-length stats (Thai has no full stop; split on punctuation + newlines). */
  sentences: { count: number; avgWords: number; longest: number };
  /** Rhythm: variation in sentence length (low cv / long monotonyRun = flat prose). */
  rhythm: { stdev: number; cv: number; monotonyRun: number };
  /** Dialogue signals — for the NIS Dialogue-Fatigue check (deterministic). */
  dialogue: { ratio: number; lines: number; talkingHeadRun: number };
  /** Telling signals — filter verbs + named emotions (for the NIS Show-vs-Tell check). */
  telling: { count: number; ratio: number; words: { word: string; count: number }[] };
  topWords: { word: string; count: number }[];
  echoes: { word: string; count: number }[];
  /** Content words repeated within a short span (≤40 tokens) — local repetition. */
  nearRepeats: { word: string; count: number }[];
  aiTells: { phrase: string; count: number }[];
  /** Mechanical issues (deterministic, exact). */
  mechanics: { issue: string; count: number }[];
}

/** Deterministic Thai mechanical checks. */
export function thaiMechanics(text: string, words: string[]): { issue: string; count: number }[] {
  const m = (re: RegExp) => (text.match(re) ?? []).length;
  let adjacentRepeat = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length >= 2) adjacentRepeat++;
  }
  const checks: { issue: string; count: number }[] = [
    { issue: "เว้นวรรคซ้อน (double space)", count: m(/ {2,}/g) },
    { issue: "เว้นวรรคหน้าเครื่องหมาย", count: m(/[ \t]+[,.;:!?]/g) },
    { issue: "เครื่องหมายซ้ำ (!! ?!)", count: m(/[!?]{2,}/g) },
    { issue: "คำซ้ำติดกัน", count: adjacentRepeat },
    { issue: "ปนอัญประกาศตรง/โค้ง", count: /[”“]/.test(text) && /["]/.test(text) ? 1 : 0 },
  ];
  return checks.filter((c) => c.count > 0);
}

// Thai block + Latin letters/digits (avoids the /u flag for broad TS target support).
const WORD_CHAR = /[฀-๿a-zA-Z0-9]/;
const LETTER = /[฀-๿a-zA-Z]/;

interface SegmenterLike {
  segment(input: string): Iterable<{ segment: string }>;
}

function getSegmenter(): SegmenterLike | null {
  const I = Intl as unknown as { Segmenter?: new (loc: string, opts: { granularity: string }) => SegmenterLike };
  if (typeof I.Segmenter !== "function") return null;
  try {
    return new I.Segmenter("th", { granularity: "word" });
  } catch {
    return null;
  }
}

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;

/** Segment Thai text into words. Falls back to a character-run split if Intl.Segmenter
 *  is absent. `protect` (e.g. character/place names the writer supplies) forces those
 *  exact strings to stay atomic tokens instead of being split by the dictionary
 *  segmenter — this is the honest lever for the segmentation ceiling (มะลีนั่ง →
 *  มะลี + นั่ง when มะลี is protected). */
export function tokenizeThai(text: string, protect?: string[]): string[] {
  const terms = (protect ?? []).map((t) => t.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (terms.length) {
    const re = new RegExp("(" + terms.map((t) => t.replace(RE_ESCAPE, "\\$&")).join("|") + ")");
    const kept = new Set(terms);
    const out: string[] = [];
    for (const piece of text.split(re)) {
      if (!piece) continue;
      if (kept.has(piece)) out.push(piece);
      else out.push(...tokenizeThai(piece)); // recurse without protection
    }
    return out;
  }
  const seg = getSegmenter();
  if (seg) {
    const out: string[] = [];
    Array.from(seg.segment(text)).forEach(({ segment }) => {
      const w = segment.trim();
      if (w && WORD_CHAR.test(w)) out.push(w);
    });
    return out;
  }
  return text.split(/[^฀-๿a-zA-Z0-9]+/).filter((w) => w && WORD_CHAR.test(w));
}

export function analyzeThai(text: string): ThaiAnalysis {
  const words = tokenizeThai(text);
  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1));

  const content = Array.from(freq.entries()).filter(
    ([w]) => w.length >= 2 && !THAI_STOPWORDS.has(w) && LETTER.test(w)
  );

  const topWords = content
    .slice()
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));

  // Echoes: content words repeated unusually often (≥3 times).
  const echoes = content
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  // Near-repeats: same content word recurring within NEAR_WINDOW tokens.
  const lastPos = new Map<string, number>();
  const near = new Map<string, number>();
  words.forEach((w, i) => {
    if (w.length >= 2 && !THAI_STOPWORDS.has(w) && LETTER.test(w)) {
      const prev = lastPos.get(w);
      if (prev !== undefined && i - prev <= NEAR_WINDOW) near.set(w, (near.get(w) ?? 0) + 1);
      lastPos.set(w, i);
    }
  });
  const nearRepeats = Array.from(near.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  // Overlap-corrected so e.g. "หัวใจสลาย" isn't also counted as "ใจสลาย".
  const aiTells = countPhrases(text, THAI_AI_TELLS);

  // Clause stats: Thai has no sentence-ending mark — the space is the real clause /
  // breath boundary (where English would use a comma or period), so we split on space
  // too, not just terminal punctuation + newlines. Without this, a chapter written as
  // one flowing paragraph collapses to a single "sentence" and rhythm cv reads 0 for
  // all real Thai prose (found by dogfood). Counts clauses, honestly labelled as such.
  const sentenceLens = text
    .split(/[.!?…ฯ\n ]+/)
    .map((s) => tokenizeThai(s).length)
    .filter((n) => n > 0);
  const sentences = {
    count: sentenceLens.length,
    avgWords: sentenceLens.length ? Math.round(words.length / sentenceLens.length) : 0,
    longest: sentenceLens.length ? Math.max(...sentenceLens) : 0,
  };

  // Rhythm: how much sentence length VARIES. Uniform length reads flat/AI-slop and
  // flattens pacing. Coefficient of variation (stdev/mean) is a real statistic, not a
  // score; monotonyRun = longest run of consecutive sentences within ±2 words.
  const mean = sentenceLens.length ? sentenceLens.reduce((s, n) => s + n, 0) / sentenceLens.length : 0;
  const variance = sentenceLens.length
    ? sentenceLens.reduce((s, n) => s + (n - mean) ** 2, 0) / sentenceLens.length
    : 0;
  const stdev = Math.sqrt(variance);
  let flatRun = 1;
  let maxFlatRun = sentenceLens.length ? 1 : 0;
  for (let i = 1; i < sentenceLens.length; i++) {
    if (Math.abs(sentenceLens[i] - sentenceLens[i - 1]) <= 2) {
      flatRun++;
      if (flatRun > maxFlatRun) maxFlatRun = flatRun;
    } else {
      flatRun = 1;
    }
  }
  const rhythm = {
    stdev: Math.round(stdev * 10) / 10,
    cv: mean ? Math.round((stdev / mean) * 100) : 0, // % — lower = more monotonous
    monotonyRun: maxFlatRun,
  };

  // Dialogue signals: ratio of quoted words, dialogue-line count, and the longest
  // "talking-heads" run (consecutive dialogue lines with no narration beat between).
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const isDialogue = (l: string) => /["“”«»「」‘’]/.test(l) || /^[—–-]\s/.test(l);
  let run = 0;
  let maxRun = 0;
  let dlgLines = 0;
  for (const l of lines) {
    if (isDialogue(l)) {
      dlgLines++;
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  // Count dialogue words from BOTH quoted spans AND dash-opened lines, so ratio and
  // line-count use one dialogue model (a dash-style manuscript no longer reports
  // ratio=0% while talkingHeadRun is large).
  const quoted = text.match(/"[^"]*"|“[^”]*”|«[^»]*»|「[^」]*」|‘[^’]*’/g) ?? [];
  let dialogueWords = quoted.reduce((s, q) => s + tokenizeThai(q).length, 0);
  for (const l of lines) {
    const dash = l.match(/^[—–-]\s+(.*)$/);
    if (dash && !/["“”«»「」‘’]/.test(l)) dialogueWords += tokenizeThai(dash[1]).length;
  }
  const dialogue = {
    ratio: words.length ? Math.round((dialogueWords / words.length) * 100) : 0,
    lines: dlgLines,
    talkingHeadRun: maxRun,
  };

  // Telling signal: filter verbs + named-emotion words, overlap-corrected so e.g.
  // "หวาดกลัว" isn't also counted as "กลัว".
  const tellWords = countPhrases(text, THAI_TELL_WORDS)
    .map(({ phrase, count }) => ({ word: phrase, count }))
    .sort((a, b) => b.count - a.count);
  const tellCount = tellWords.reduce((s, t) => s + t.count, 0);
  const telling = {
    count: tellCount,
    ratio: words.length ? Math.round((tellCount / words.length) * 1000) / 10 : 0, // per-100-words, 1 decimal
    words: tellWords,
  };

  return {
    wordCount: words.length,
    charCount: text.replace(/\s/g, "").length,
    uniqueWords: freq.size,
    sentences,
    rhythm,
    dialogue,
    telling,
    topWords,
    echoes,
    nearRepeats,
    aiTells,
    mechanics: thaiMechanics(text, words),
  };
}

const joinThai = (items: { word?: string; phrase?: string; count: number }[]) =>
  items.length ? items.map((i) => `${i.word ?? i.phrase} ×${i.count}`).join(", ") : "—";

/** Render a deterministic Thai Analysis as a portable Markdown report. */
export function formatThaiReport(a: ThaiAnalysis): string {
  return [
    "# รายงานวิเคราะห์ภาษาไทย",
    "",
    `- คำ: ${a.wordCount} · คำไม่ซ้ำ: ${a.uniqueWords} · ประโยค: ${a.sentences.count}`,
    `- คำ/ประโยค (เฉลี่ย): ${a.sentences.avgWords} · ประโยคยาวสุด: ${a.sentences.longest}`,
    `- จังหวะ: CV ${a.rhythm.cv}% · ส่วนเบี่ยงเบน ${a.rhythm.stdev} · ประโยคยาวพอกันติดกัน ${a.rhythm.monotonyRun}`,
    `- บทพูด: สัดส่วน ${a.dialogue.ratio}% · บรรทัด ${a.dialogue.lines} · พูดต่อเนื่องสุด ${a.dialogue.talkingHeadRun}`,
    `- คำบอกอารมณ์ (telling): ${a.telling.count} · ${a.telling.ratio}/100 คำ`,
    "",
    `## คำคลิเชแบบ AI (${a.aiTells.length})`,
    joinThai(a.aiTells),
    "",
    `## คำบอกอารมณ์ตรง ๆ (${a.telling.count})`,
    joinThai(a.telling.words),
    "",
    `## คำซ้ำใกล้กัน ≤40 คำ (${a.nearRepeats.length})`,
    joinThai(a.nearRepeats),
    "",
    `## คำซ้ำบ่อย echoes ≥3 (${a.echoes.length})`,
    joinThai(a.echoes),
    "",
    `## ข้อผิดพลาดเชิงกล (${a.mechanics.length})`,
    a.mechanics.length ? a.mechanics.map((mm) => `${mm.issue} ×${mm.count}`).join(", ") : "—",
    "",
    "_เครื่องมือฝั่งเบราว์เซอร์ (ไม่เรียก AI) — เป็นการนับและสถิติ ไม่ใช่คะแนนคุณภาพ_",
  ].join("\n");
}

export interface ThaiMetricDelta {
  label: string;
  before: number;
  after: number;
  delta: number;
  good: "lower" | "higher" | "neutral";
}

/** Compare two Thai analyses metric-by-metric (did the revision measurably improve?). */
export function thaiDeltas(before: ThaiAnalysis, after: ThaiAnalysis): ThaiMetricDelta[] {
  const row = (label: string, b: number, af: number, good: ThaiMetricDelta["good"]): ThaiMetricDelta => ({
    label,
    before: b,
    after: af,
    delta: Math.round((af - b) * 10) / 10,
    good,
  });
  return [
    row("คำ (words)", before.wordCount, after.wordCount, "neutral"),
    row("จังหวะ CV%", before.rhythm.cv, after.rhythm.cv, "higher"),
    row("คำคลิเช AI", before.aiTells.length, after.aiTells.length, "lower"),
    row("คำบอกอารมณ์", before.telling.count, after.telling.count, "lower"),
    row("คำซ้ำใกล้กัน", before.nearRepeats.length, after.nearRepeats.length, "lower"),
    row("คำซ้ำบ่อย (echoes)", before.echoes.length, after.echoes.length, "lower"),
    row("พูดต่อเนื่องสุด", before.dialogue.talkingHeadRun, after.dialogue.talkingHeadRun, "lower"),
  ];
}

export interface ThaiChapterScan {
  title: string;
  body: string;
  words: number;
  cv: number;
  dialogueRatio: number;
  telling: number;
  aiTells: number;
  echoes: number;
}

/** Per-chapter deterministic scorecard for a Thai manuscript. */
export function scanThaiManuscript(text: string): ThaiChapterScan[] {
  return splitChapters(text)
    .map(({ title, body }) => {
      const a = analyzeThai(body);
      return {
        title,
        body,
        words: a.wordCount,
        cv: a.rhythm.cv,
        dialogueRatio: a.dialogue.ratio,
        telling: a.telling.count,
        aiTells: a.aiTells.length,
        echoes: a.echoes.length,
      };
    })
    .filter((c) => c.words > 0); // drop empty header-only chunks
}
