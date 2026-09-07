// ╔══════════════════════════════════════════════════════════════════╗
// ║  MUSIC — the iso-principle, as arithmetic.                        ║
// ║                                                                    ║
// ║  The iso-principle (Altshuler, 1948) is the oldest working idea in ║
// ║  music therapy: you do NOT hand an agitated person calm music. You ║
// ║  MATCH their current state first, then move the music gradually    ║
// ║  toward where you want them to arrive. A person at high arousal    ║
// ║  dropped straight into 60 BPM tends to reject it; met at 100 and   ║
// ║  walked down, they follow.                                         ║
// ║                                                                    ║
// ║  This module turns that into a deterministic tempo ramp: same      ║
// ║  inputs → same schedule, every time, re-derivable by hand.         ║
// ║                                                                    ║
// ║  WHAT IS AND IS NOT ESTABLISHED HERE — the distinction matters:    ║
// ║   · The iso-principle is a long-standing clinical TECHNIQUE. It is ║
// ║     not a dose-response curve, and this ramp shape is not          ║
// ║     "the clinically optimal trajectory" — no such curve has been   ║
// ║     established. It is a disclosed, editable interpolation.        ║
// ║   · The arousal→BPM table below is an OPENLY STATED HEURISTIC      ║
// ║     (rush-engine would call it saññā: a label to review, not a     ║
// ║     measurement). We print the rule so you can disagree with it.   ║
// ║   · The evidence in evidence.ts is for listening to music the      ║
// ║     LISTENER CHOSE, and for therapist-led music therapy. A tone    ║
// ║     bed this app synthesises is neither. The ramp's real job is to ║
// ║     tell you WHICH TEMPO to pick your own music at.                ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { SeverityBand } from "./types";

// ── Tempo ─────────────────────────────────────────────────────────────────────

/** Resting-heart-rate territory — the tempo relaxation music is usually written
 *  near. The lower bound is deliberately not lower: dragging a tempo far below
 *  resting rate makes music feel funereal rather than calming. */
export const TARGET_BPM = 62;

/** Arousal → starting tempo. A DISCLOSED HEURISTIC, not a measurement: it maps
 *  the screening band the user landed in onto the tempo we open at, so an
 *  agitated listener is met near their state instead of below it. Printed in the
 *  UI beside the plan, so it can be argued with. */
export const AROUSAL_BPM: Record<SeverityBand["id"], number> = {
  minimal: 76,
  mild: 84,
  moderate: 96,
  moderatelySevere: 104,
  severe: 112,
};

export interface IsoSegment {
  /** 0-based position in the ramp. */
  index: number;
  /** Segment start, in minutes from session start. */
  startMin: number;
  endMin: number;
  /** Tempo to hold for this segment, in beats per minute (whole numbers — a
   *  fractional BPM is not something a listener or a metronome can act on). */
  bpm: number;
  labelTh: string;
}

export interface IsoPlan {
  startBpm: number;
  targetBpm: number;
  totalMinutes: number;
  segments: IsoSegment[];
  /** The rule that produced the ramp, in words, so the plan is auditable. */
  methodTh: string;
}

/** Clamp helper — keeps every public function total rather than throwing on odd input. */
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Build an iso-principle tempo ramp.
 *
 * The ramp is a straight line from `startBpm` to `targetBpm` sampled at the
 * midpoint of each equal-length segment, then rounded to whole BPM — with the
 * first and last segments pinned to the exact endpoints so the session always
 * MEETS the listener where they are and ARRIVES where it promised.
 */
export function isoRamp(
  startBpm: number,
  targetBpm: number,
  totalMinutes: number,
  segmentCount = 5
): IsoPlan {
  const start = Math.round(clamp(startBpm, 40, 200));
  const target = Math.round(clamp(targetBpm, 40, 200));
  const minutes = clamp(totalMinutes, 1, 120);
  const n = Math.max(2, Math.round(clamp(segmentCount, 2, 12)));
  const per = minutes / n;

  const segments: IsoSegment[] = Array.from({ length: n }, (_, index) => {
    // Endpoints are pinned; the interior is a linear interpolation.
    const t = index / (n - 1);
    const bpm = index === 0 ? start : index === n - 1 ? target : Math.round(start + (target - start) * t);
    return {
      index,
      startMin: Number((index * per).toFixed(2)),
      endMin: Number(((index + 1) * per).toFixed(2)),
      bpm,
      labelTh:
        index === 0
          ? "จับคู่กับสภาวะปัจจุบัน (match)"
          : index === n - 1
            ? "สภาวะเป้าหมาย (arrive)"
            : "ค่อย ๆ พา (entrain)",
    };
  });

  return {
    startBpm: start,
    targetBpm: target,
    totalMinutes: minutes,
    segments,
    methodTh:
      `เริ่มที่ ${start} BPM เพื่อจับคู่กับสภาวะปัจจุบัน แล้วลดเป็นเส้นตรงลงสู่ ${target} BPM ใน ${n} ช่วง ` +
      `ตลอด ${minutes} นาที — เป็นการไล่ระดับตามหลัก iso-principle ที่เปิดสูตรให้ตรวจสอบ ไม่ใช่เส้นโค้งที่พิสูจน์แล้วว่าดีที่สุด`,
  };
}

/** The ramp for a listener who just scored in `band`, at the session length they chose. */
export function planForBand(band: SeverityBand["id"], totalMinutes: number, segmentCount?: number): IsoPlan {
  return isoRamp(AROUSAL_BPM[band], TARGET_BPM, totalMinutes, segmentCount);
}

/** Seconds per beat — what a metronome or a scheduler actually needs. */
export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}

// ── Breath ────────────────────────────────────────────────────────────────────

export type BreathPatternId = "cyclic-sighing" | "resonance" | "box";

export interface BreathPhase {
  kind: "inhale" | "inhale-top" | "exhale" | "hold";
  seconds: number;
  th: string;
}

export interface BreathPattern {
  id: BreathPatternId;
  th: string;
  phases: BreathPhase[];
  /** Where the pattern comes from — a technique with no provenance is folklore. */
  sourceTh: string;
}

/** The three patterns the session player can pace.
 *
 *  Cyclic sighing is the one with a randomised trial behind it (Balban 2023);
 *  the timings below follow that protocol's shape — a full inhale, a short
 *  top-up inhale, then a long exhale. Resonance breathing at ~6 breaths/min is
 *  long-standing practice in HRV biofeedback. Box breathing is included because
 *  people ask for it, and is labelled as the practice convention it is. */
export const BREATH_PATTERNS: Record<BreathPatternId, BreathPattern> = {
  "cyclic-sighing": {
    id: "cyclic-sighing",
    th: "Cyclic Sighing — หายใจเข้าสองจังหวะ ออกยาว",
    phases: [
      { kind: "inhale", seconds: 2, th: "หายใจเข้าทางจมูก" },
      { kind: "inhale-top", seconds: 1, th: "สูดเข้าเพิ่มอีกนิด" },
      { kind: "exhale", seconds: 6, th: "ผ่อนลมออกทางปากช้า ๆ" },
    ],
    sourceTh: "รูปแบบตามโปรโตคอลใน Balban et al. 2023 (Cell Reports Medicine) — เน้นให้หายใจออกยาวกว่าหายใจเข้า",
  },
  resonance: {
    id: "resonance",
    th: "Resonance — 6 ครั้ง/นาที",
    phases: [
      { kind: "inhale", seconds: 5, th: "หายใจเข้า" },
      { kind: "exhale", seconds: 5, th: "หายใจออก" },
    ],
    sourceTh: "อัตรา ~6 ครั้ง/นาที ที่ใช้กันทั่วไปในการฝึก HRV biofeedback",
  },
  box: {
    id: "box",
    th: "Box — 4 จังหวะเท่ากัน",
    phases: [
      { kind: "inhale", seconds: 4, th: "หายใจเข้า" },
      { kind: "hold", seconds: 4, th: "กลั้นไว้" },
      { kind: "exhale", seconds: 4, th: "หายใจออก" },
      { kind: "hold", seconds: 4, th: "ค้างไว้" },
    ],
    sourceTh: "ธรรมเนียมการฝึกที่ใช้กันแพร่หลาย — ไม่มี RCT เฉพาะรองรับรูปแบบนี้",
  },
};

/** Length of one full breath cycle, in seconds. */
export function cycleSeconds(pattern: BreathPattern): number {
  return pattern.phases.reduce((s, p) => s + p.seconds, 0);
}

/** Breaths per minute the pattern paces. Rounded to 1dp — the arithmetic is
 *  exact, the display precision is not a claim about the body. */
export function breathsPerMinute(pattern: BreathPattern): number {
  return Number((60 / cycleSeconds(pattern)).toFixed(1));
}

/** Whole cycles that fit in `minutes`. Partial cycles are dropped: half a breath
 *  is not a breath. */
export function cyclesIn(pattern: BreathPattern, minutes: number): number {
  return Math.floor((minutes * 60) / cycleSeconds(pattern));
}

/** The phase a session is in at `elapsedSeconds`, and how far through it.
 *  Pure — the caller supplies the clock, so this stays unit-testable. */
export function phaseAt(pattern: BreathPattern, elapsedSeconds: number): { phase: BreathPhase; progress: number } {
  const cycle = cycleSeconds(pattern);
  // Modulo keeps it correct for any elapsed time, including a session left running.
  let t = ((elapsedSeconds % cycle) + cycle) % cycle;
  for (const phase of pattern.phases) {
    if (t < phase.seconds) return { phase, progress: t / phase.seconds };
    t -= phase.seconds;
  }
  // Unreachable while phases sum to `cycle`; returning the last phase beats throwing.
  const last = pattern.phases[pattern.phases.length - 1];
  return { phase: last, progress: 1 };
}
