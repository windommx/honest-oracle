// ╔══════════════════════════════════════════════════════════════════╗
// ║  NARRATIVE INTELLIGENCE — deterministic, NOT a 0–100 score.        ║
// ║  The honest version of a competitor's "narrative_consistency 73"   ║
// ║  panel: character presence across chapters, pacing across the       ║
// ║  three structural acts, and motif/theme distribution — every        ║
// ║  output a real count or a disclosed threshold flag you can          ║
// ║  re-derive. No latent-construct scoring (see epistemics.ts:         ║
// ║  those are avisaya — beyond this instrument, refused).             ║
// ╚══════════════════════════════════════════════════════════════════╝

import { splitChapters } from "./chapters";
import { maxOf, minOf, countNames } from "./text-util";

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const countEn = (s: string, t: string) => (s.match(new RegExp(`\\b${t.replace(RE_ESCAPE, "\\$&")}\\b`, "gi")) ?? []).length;
const countTh = (s: string, t: string) => (t ? s.split(t).length - 1 : 0);

function bodies(text: string): string[] {
  return splitChapters(text).map((c) => c.body);
}

// ── Character arc: per-chapter presence trajectory ─────────────────────────────
export interface CharArc {
  name: string;
  perChapter: number[];      // mention count in each chapter (a real count series)
  total: number;
  firstChapter: number;      // 1-based; 0 = never appears
  lastChapter: number;
  gaps: { from: number; to: number }[]; // zero-runs BETWEEN first and last (vanishes then returns)
  exitsEarly: boolean;       // last mention before the final third — introduced then dropped?
}
export interface NarrativeArcs { chapters: number; characters: CharArc[] }

/** Per-character presence across chapters. Counts + gap detection — never a coherence score.
 *  A `gap` (character disappears mid-story then returns) and `exitsEarly` (present early, gone
 *  by the last third) are the deterministic signals a writer reviews; the tool does not judge
 *  whether the arc is "good". */
export function characterArc(text: string, names: string[], lang: "th" | "en" = "th"): NarrativeArcs {
  const cast = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2)));
  const chs = bodies(text);
  const n = chs.length;
  // Cast-aware counts per chapter: a short name inside a longer CAST name (แอน in แอนนา) is
  // subtracted, so a character is not marked "present" in every chapter their substring-name
  // happens to nest in. One pass over the whole cast per chapter.
  const perChapterCounts = chs.map((b) => countNames(b, cast, lang));
  const characters: CharArc[] = cast.map((name) => {
    const perChapter = perChapterCounts.map((m) => m.get(name) ?? 0);
    const present = perChapter.map((c, i) => (c > 0 ? i + 1 : 0)).filter((x) => x > 0);
    const first = present.length ? present[0] : 0;
    const last = present.length ? present[present.length - 1] : 0;
    const gaps: { from: number; to: number }[] = [];
    if (first && last) {
      let run = 0;
      for (let i = first; i < last - 1; i++) {
        if (perChapter[i] === 0) run++;
        else if (run > 0) { gaps.push({ from: i - run + 1, to: i }); run = 0; }
      }
      if (run > 0) gaps.push({ from: last - 1 - run + 1, to: last - 1 });
    }
    const exitsEarly = !!last && n >= 3 && last <= Math.floor((n * 2) / 3) && first <= Math.ceil(n / 3);
    return { name, perChapter, total: perChapter.reduce((a, b) => a + b, 0), firstChapter: first, lastChapter: last, gaps, exitsEarly };
  });
  return { chapters: n, characters };
}

// ── Pacing profile: measured signals aggregated across the three acts ───────────
export interface ChapterSignal { words: number; dialogueRatio: number; tellingPer100: number; sensoryPer1k: number }
export interface ActProfile {
  act: "beginning" | "middle" | "end";
  chapters: number[];
  avgWords: number;
  avgDialogue: number;
  avgTelling: number;
  avgSensory: number;
}
export interface PacingProfile { acts: ActProfile[]; flags: string[] }

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

/** Aggregate already-measured per-chapter signals into the three structural acts (thirds) and
 *  raise disclosed threshold flags (e.g. a middle act far shorter than the book average). The
 *  averages are real; the flags fire at a stated ratio — no "pacing score". */
export function pacingProfile(chapters: ChapterSignal[]): PacingProfile {
  const n = chapters.length;
  if (n < 3) return { acts: [], flags: [] };
  const cut1 = Math.floor(n / 3);
  const cut2 = Math.floor((n * 2) / 3);
  const slices: [ActProfile["act"], ChapterSignal[], number[]][] = [
    ["beginning", chapters.slice(0, cut1), range(1, cut1)],
    ["middle", chapters.slice(cut1, cut2), range(cut1 + 1, cut2)],
    ["end", chapters.slice(cut2), range(cut2 + 1, n)],
  ];
  const acts: ActProfile[] = slices.map(([act, cs, idx]) => ({
    act,
    chapters: idx,
    avgWords: mean(cs.map((c) => c.words)),
    avgDialogue: mean(cs.map((c) => c.dialogueRatio)),
    avgTelling: mean(cs.map((c) => c.tellingPer100)),
    avgSensory: mean(cs.map((c) => c.sensoryPer1k)),
  }));
  const overallWords = mean(chapters.map((c) => c.words));
  const flags: string[] = [];
  const mid = acts[1];
  if (overallWords && mid.avgWords < overallWords * 0.7) flags.push(`บทกลางสั้นกว่าค่าเฉลี่ยเล่ม ${Math.round((1 - mid.avgWords / overallWords) * 100)}% (อาจ pacing หย่อนกลางเรื่อง)`);
  if (overallWords && acts[0].avgWords > overallWords * 1.3) flags.push("องก์เปิดยาวกว่าค่าเฉลี่ยมาก (อาจ front-load เยอะ)");
  const maxDlg = maxOf(acts.map((a) => a.avgDialogue));
  const minDlg = minOf(acts.map((a) => a.avgDialogue));
  if (maxDlg - minDlg >= 25) flags.push(`สัดส่วนบทพูดสวิงระหว่างองก์ ${minDlg}%→${maxDlg}% (ตรวจสมดุลฉาก action/บทสนทนา)`);
  return { acts, flags };
}

// ── Motif / theme tracker: distribution of a theme term across chapters ─────────
export interface MotifTrack {
  term: string;
  total: number;
  perChapter: number[];
  chaptersPresent: number;
  longestAbsentRun: number; // longest stretch of consecutive chapters with zero occurrences
}
export interface MotifReport { chapters: number; motifs: MotifTrack[] }

/** Track how often each theme/motif term recurs, per chapter. A motif absent for a long run is
 *  a deterministic signal (the theme "goes quiet"); the tool never scores "thematic resonance". */
export function motifTracker(text: string, motifs: string[], lang: "th" | "en" = "th"): MotifReport {
  const terms = Array.from(new Set(motifs.map((m) => m.trim()).filter(Boolean)));
  const count = lang === "en" ? countEn : countTh;
  const chs = bodies(text);
  const tracks: MotifTrack[] = terms.map((term) => {
    const perChapter = chs.map((b) => count(b, term));
    let run = 0, longest = 0;
    for (const c of perChapter) { if (c === 0) { run++; longest = Math.max(longest, run); } else run = 0; }
    return {
      term,
      total: perChapter.reduce((a, b) => a + b, 0),
      perChapter,
      chaptersPresent: perChapter.filter((c) => c > 0).length,
      longestAbsentRun: longest,
    };
  });
  return { chapters: chs.length, motifs: tracks };
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

// ── Ending-hook signal ────────────────────────────────────────────────
//  Serial fiction lives on the next-episode hook. We can't measure "hook
//  strength" (that would be a fake score) — but we CAN report which hook
//  DEVICES are present in the ending: a question, an ellipsis/trailing cut,
//  or tension lexicon. Presence facts, judgement left to the writer.

const TENSION_TH = ["แต่", "ความลับ", "อันตราย", "กลัว", "หรือไม่", "ไม่มีวัน", "ยังไม่", "เงา", "สุดท้าย", "ก่อนที่"];
const TENSION_EN = ["but", "secret", "danger", "fear", "never", "before", "until", "unless", "shadow", "last"];

export interface HookSignal {
  tailWords: number;                // size of the window actually inspected
  hasQuestion: boolean;             // ? in the ending
  hasEllipsis: boolean;             // … / ... trailing device
  tensionWords: string[];           // tension-lexicon hits (deduped)
  anyDevice: boolean;
}

/** Inspect the ENDING of a chapter (last ~400 chars) for hook devices.
 *  Reports presence, not strength — a quiet ending can be deliberate. */
export function hookSignal(text: string, lang: "th" | "en" = "th"): HookSignal {
  const tail = text.slice(-400);
  const hasQuestion = /[?？]/.test(tail);
  const hasEllipsis = /(…|\.\.\.)/.test(tail);
  const lexicon = lang === "th" ? TENSION_TH : TENSION_EN;
  const hayTail = lang === "th" ? tail : tail.toLowerCase();
  // KNOWN CEILING (Thai): a substring includes fires แต่ ("but") inside แต่งงาน
  // ("wedding"), so a calm ending can read as anyDevice=true. A whole-word count was
  // rejected — Thai tension words appear run-together (แต่เธอ…) and boundaryed matching
  // dropped the real ones. Presence-not-strength is already disclosed; a writer reads
  // the flagged words and judges. Over-flag beats missing a real hook.
  const tensionWords = lexicon.filter((w) => hayTail.includes(w));
  return {
    tailWords: tail.length,
    hasQuestion,
    hasEllipsis,
    tensionWords,
    anyDevice: hasQuestion || hasEllipsis || tensionWords.length > 0,
  };
}
