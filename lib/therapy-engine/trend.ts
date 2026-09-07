// ╔══════════════════════════════════════════════════════════════════╗
// ║  TREND — what changed, and what a change is not evidence of.      ║
// ║                                                                    ║
// ║  A progress chart is where a self-tracking app most easily starts  ║
// ║  lying, in three specific ways:                                    ║
// ║                                                                    ║
// ║   1. Percentages. "ดีขึ้น 40%!" needs a denominator the scale does  ║
// ║      not have — GAD-7 has no true zero of anxiety, so a ratio of   ║
// ║      two scores is arithmetic performed on an interval-ish scale   ║
// ║      that does not admit it. We report POINTS, the unit the        ║
// ║      instrument is actually calibrated in.                         ║
// ║   2. Attribution. A score that fell after four weeks of listening  ║
// ║      to music did not fall BECAUSE of the music: no control, no    ║
// ║      randomisation, and regression to the mean pushes a high first ║
// ║      score down on its own. `Change.causalNoteTh` says this every  ║
// ║      time, not once in an onboarding screen nobody re-reads.       ║
// ║   3. Extrapolation. There is no forecast here, no "at this rate    ║
// ║      you will reach minimal in 3 weeks". Two points do not make a  ║
// ║      trajectory, and the module has no function that pretends      ║
// ║      otherwise.                                                    ║
// ║                                                                    ║
// ║  What IS honest: the raw point difference, and whether it clears   ║
// ║  the published MCID — a threshold from the literature, quoted with ║
// ║  its own uncertainty attached (see scoring.ts).                    ║
// ╚══════════════════════════════════════════════════════════════════╝

import { MCID, bandFor } from "./scoring";
import type { InstrumentId, ScoreResult, SeverityBand } from "./types";

export type ChangeDirection = "improved" | "worsened" | "unchanged";

export interface Change {
  instrument: InstrumentId;
  fromTotal: number;
  toTotal: number;
  /** Later minus earlier, in the instrument's own points. Negative = improved,
   *  because on both scales a higher score means more symptoms. */
  deltaPoints: number;
  direction: ChangeDirection;
  /** Whether |delta| reaches the published minimal clinically important
   *  difference for this instrument. */
  meetsMcid: boolean;
  mcidPoints: number;
  fromBand: SeverityBand;
  toBand: SeverityBand;
  /** True when the change crossed into a different severity band. */
  bandChanged: boolean;
  /** The standing caveat about what a before/after difference can support. */
  causalNoteTh: string;
}

const CAUSAL_NOTE =
  "นี่คือผลต่างของคะแนนสองครั้ง ไม่ใช่หลักฐานว่าอะไรทำให้เปลี่ยน — ไม่มีกลุ่มควบคุม " +
  "และคะแนนที่สูงมากในครั้งแรกมีแนวโน้มลดลงเองตามหลัก regression to the mean";

/**
 * Compare two administrations of the SAME instrument.
 *
 * Throws when the instruments differ: a GAD-7 of 12 and a PHQ-9 of 9 are numbers
 * on different rulers, and subtracting them would produce a difference with no
 * referent at all.
 */
export function compare(earlier: ScoreResult, later: ScoreResult): Change {
  if (earlier.instrument !== later.instrument) {
    throw new TypeError(
      `cannot compare ${earlier.instrument} with ${later.instrument} — different scales, no common unit`
    );
  }
  const id = earlier.instrument;
  const deltaPoints = later.total - earlier.total;
  const mcidPoints = MCID[id].points;

  return {
    instrument: id,
    fromTotal: earlier.total,
    toTotal: later.total,
    deltaPoints,
    direction: deltaPoints < 0 ? "improved" : deltaPoints > 0 ? "worsened" : "unchanged",
    meetsMcid: Math.abs(deltaPoints) >= mcidPoints,
    mcidPoints,
    fromBand: bandFor(id, earlier.total),
    toBand: bandFor(id, later.total),
    bandChanged: earlier.band.id !== later.band.id,
    causalNoteTh: CAUSAL_NOTE,
  };
}

export interface SeriesPoint {
  /** Epoch milliseconds. Supplied by the caller — this module never reads a clock,
   *  so its output is reproducible. */
  at: number;
  score: ScoreResult;
}

export interface Series {
  instrument: InstrumentId;
  points: SeriesPoint[];
  /** First → last. Null when there are fewer than two points: one score is not a
   *  trend, and rendering it as one is the lie this guard exists to prevent. */
  overall: Change | null;
  /** Change between the two most recent administrations. Null below two points. */
  latest: Change | null;
  noteTh: string;
}

/** Build a series for one instrument. Points are sorted by time; entries for other
 *  instruments are dropped rather than silently mixed in. */
export function buildSeries(instrument: InstrumentId, points: readonly SeriesPoint[]): Series {
  const mine = points
    .filter((p) => p.score.instrument === instrument)
    .slice()
    .sort((a, b) => a.at - b.at);

  if (mine.length < 2) {
    return {
      instrument,
      points: mine,
      overall: null,
      latest: null,
      noteTh:
        mine.length === 0
          ? "ยังไม่มีผลประเมิน"
          : "มีผลประเมินครั้งเดียว — ยังบอกแนวโน้มไม่ได้ ทำซ้ำอีกครั้งใน 2 สัปดาห์",
    };
  }

  return {
    instrument,
    points: mine,
    overall: compare(mine[0].score, mine[mine.length - 1].score),
    latest: compare(mine[mine.length - 2].score, mine[mine.length - 1].score),
    noteTh: CAUSAL_NOTE,
  };
}

/** A plain-language reading of a change, in points — never in percent. */
export function describe(change: Change): string {
  const magnitude = Math.abs(change.deltaPoints);
  if (change.direction === "unchanged") return "คะแนนเท่าเดิม";
  const word = change.direction === "improved" ? "ลดลง" : "เพิ่มขึ้น";
  const meaning = change.meetsMcid
    ? `ถึงเกณฑ์การเปลี่ยนแปลงที่มีความหมายทางคลินิก (≥${change.mcidPoints} คะแนน)`
    : `ยังไม่ถึงเกณฑ์ ≥${change.mcidPoints} คะแนน จึงอาจเป็นความผันผวนปกติของการวัด`;
  return `${word} ${magnitude} คะแนน — ${meaning}`;
}
