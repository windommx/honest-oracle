// ╔══════════════════════════════════════════════════════════════════╗
// ║  RELIABILITY — is this change bigger than the ruler's own error?  ║
// ║                                                                    ║
// ║  trend.ts answers "is this change big enough to matter" by         ║
// ║  comparing it against the published MCID. That is a question       ║
// ║  about MEANING. It leaves a prior question unasked, and the prior  ║
// ║  one is where progress dashboards do most of their lying:          ║
// ║                                                                    ║
// ║      is this change bigger than the measurement error?             ║
// ║                                                                    ║
// ║  A questionnaire is not a ruler with infinite precision. Ask the   ║
// ║  same person the same seven questions twice on a stable morning    ║
// ║  and the totals differ, because the items are a sample of a        ║
// ║  construct and the person's reading of "nearly every day" moves.   ║
// ║  GAD-7 going 12 → 10 looks like progress on a chart and is,        ║
// ║  statistically, indistinguishable from the same person answering   ║
// ║  twice with nothing having changed at all.                         ║
// ║                                                                    ║
// ║  The Reliable Change Index (Jacobson & Truax 1991) is the standard ║
// ║  answer. It divides the observed change by the standard error of   ║
// ║  the DIFFERENCE between two measurements, so the result is in      ║
// ║  units of "how many measurement errors wide is this change". Past  ║
// ║  1.96 of them, the change is unlikely (p < .05, two-tailed) to be  ║
// ║  measurement noise.                                                ║
// ║                                                                    ║
// ║  Crossed with whether the score is still in the clinical range,    ║
// ║  that gives the four outcome categories routine outcome            ║
// ║  monitoring actually uses — recovered, improved, unchanged,        ║
// ║  deteriorated — instead of an arrow pointing down.                 ║
// ║                                                                    ║
// ║  WHAT THIS STILL CANNOT DO. A reliable change is not a caused      ║
// ║  change. One person, no control condition, and a first score that  ║
// ║  was high partly because a bad week is when people fill these in — ║
// ║  regression to the mean pulls the second score down on its own.    ║
// ║  Every result here carries that caveat, in the data, not in a      ║
// ║  footnote somewhere else.                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

import { BANDS, CUTPOINTS, MCID } from "./scoring";
import type { InstrumentId, ScoreResult } from "./types";

/**
 * The psychometrics the RCI is computed from.
 *
 * ⚠ THESE ARE PUBLISHED ESTIMATES, NOT CONSTANTS OF NATURE. Internal
 * consistency and the standard deviation both depend on the sample: a primary
 * care population, a general population and a psychiatric one give different
 * numbers, and an RCI derived from one does not transfer exactly to another.
 * They are named, sourced and exported here rather than buried in a formula so
 * that the threshold the UI prints can be traced to the paper it came from —
 * and so a clinic with its own normative data can substitute it.
 *
 * `alpha` is Cronbach's α, the internal-consistency estimate of reliability.
 * `sd` is the standard deviation of the total in that validation sample.
 */
export const PSYCHOMETRICS: Record<
  InstrumentId,
  { alpha: number; sd: number; sourceTh: string }
> = {
  gad7: {
    alpha: 0.92,
    sd: 5.1,
    sourceTh: "Spitzer et al. 2006 — กลุ่มตัวอย่างคลินิกปฐมภูมิ (n=2,740)",
  },
  phq9: {
    alpha: 0.89,
    sd: 6.1,
    sourceTh: "Kroenke et al. 2001 — กลุ่มตัวอย่างคลินิกปฐมภูมิ (n=6,000)",
  },
};

/** Two-tailed z for p < .05. Jacobson & Truax's own choice, and the one every
 *  routine-outcome-monitoring implementation uses, so the numbers this
 *  produces are comparable with published ones. */
export const RCI_Z = 1.96;

/** Standard error of measurement: SD × √(1 − α).
 *
 *  How far a single observed score is expected to sit from the person's true
 *  score. A perfectly reliable instrument (α = 1) has none. */
export function standardErrorOfMeasurement(instrument: InstrumentId): number {
  const { alpha, sd } = PSYCHOMETRICS[instrument];
  return sd * Math.sqrt(1 - alpha);
}

/** Standard error of the DIFFERENCE between two administrations: √2 × SEm.
 *
 *  The √2 is the part that is easy to leave out and doubles the error budget
 *  when it is: a difference is built from two noisy measurements, so it
 *  carries both of their errors. */
export function standardErrorOfDifference(instrument: InstrumentId): number {
  return Math.SQRT2 * standardErrorOfMeasurement(instrument);
}

/**
 * The smallest change, in the instrument's own points, that clears measurement
 * error at p < .05.
 *
 * Reported to the UI rounded UP to a whole point, because the instrument only
 * produces whole points: a threshold of 4.0 means 4 clears it, while a
 * threshold of 3.997 printed as "4" would quietly admit changes of 3.997 that
 * no real score can express. Rounding up never claims reliability the
 * arithmetic does not support.
 */
export function reliableChangePoints(instrument: InstrumentId): number {
  return Math.ceil(standardErrorOfDifference(instrument) * RCI_Z);
}

export type OutcomeCategory = "recovered" | "improved" | "unchanged" | "deteriorated";

export const OUTCOME_LABEL: Record<OutcomeCategory, { th: string; en: string }> = {
  recovered: { th: "ดีขึ้นจนต่ำกว่าเกณฑ์คัดกรอง", en: "Recovered" },
  improved: { th: "ดีขึ้นเกินความคลาดเคลื่อนของเครื่องมือ", en: "Reliably improved" },
  unchanged: { th: "เปลี่ยนไม่เกินความคลาดเคลื่อนของเครื่องมือ", en: "No reliable change" },
  deteriorated: { th: "แย่ลงเกินความคลาดเคลื่อนของเครื่องมือ", en: "Reliably deteriorated" },
};

export interface ReliableChange {
  instrument: InstrumentId;
  fromTotal: number;
  toTotal: number;
  /** Later minus earlier. Negative = fewer symptoms. */
  deltaPoints: number;
  /** delta ÷ standard error of the difference. Signed, so the direction
   *  survives; it is |rci| that is compared against RCI_Z. */
  rci: number;
  /** |rci| ≥ 1.96 — the change is unlikely to be measurement noise. */
  reliable: boolean;
  /** The point threshold this instrument needs to clear. */
  thresholdPoints: number;
  /** The published MCID, for the separate question of whether a reliable
   *  change is also a meaningful one. The two are different sizes and
   *  conflating them is the error this module exists to stop. */
  mcidPoints: number;
  meetsMcid: boolean;
  /** Whether each score sits at or above the screening cut-point. */
  fromClinical: boolean;
  toClinical: boolean;
  category: OutcomeCategory;
  /** What the category does and does not license, in one sentence. */
  noteTh: string;
}

const CAUSAL_NOTE =
  "ผลนี้บอกว่าคะแนนเปลี่ยนเกินความคลาดเคลื่อนของเครื่องมือหรือไม่ " +
  "ไม่ได้บอกว่าอะไรทำให้เปลี่ยน — ไม่มีกลุ่มควบคุม และคะแนนที่สูงในครั้งแรก" +
  "มีแนวโน้มลดลงเองตามหลัก regression to the mean";

function noteFor(category: OutcomeCategory, change: Omit<ReliableChange, "category" | "noteTh">): string {
  const { thresholdPoints, deltaPoints, mcidPoints, meetsMcid } = change;
  const size = Math.abs(deltaPoints);
  switch (category) {
    case "unchanged":
      return (
        `เปลี่ยน ${size} คะแนน ซึ่งน้อยกว่า ${thresholdPoints} คะแนนที่ต้องใช้` +
        `เพื่อแยกออกจากความคลาดเคลื่อนของการวัด — ยังบอกไม่ได้ว่าเปลี่ยนจริงหรือไม่`
      );
    case "deteriorated":
      return `คะแนนเพิ่มขึ้น ${size} คะแนน เกิน ${thresholdPoints} คะแนน — ควรทบทวนแผนกับผู้ให้การรักษา · ${CAUSAL_NOTE}`;
    case "improved":
      return (
        `ลดลง ${size} คะแนน เกิน ${thresholdPoints} คะแนนที่ต้องใช้` +
        `${meetsMcid ? ` และถึงเกณฑ์ MCID ${mcidPoints} คะแนนด้วย` : ` แต่ยังไม่ถึงเกณฑ์ MCID ${mcidPoints} คะแนน`}` +
        ` แต่คะแนนยังอยู่ในช่วงที่การคัดกรองถือว่าเข้าเกณฑ์ · ${CAUSAL_NOTE}`
      );
    case "recovered":
      return (
        `ลดลง ${size} คะแนน เกิน ${thresholdPoints} คะแนน และลงต่ำกว่าจุดตัดคัดกรอง — ` +
        `เป็นเกณฑ์ "recovered" ตาม Jacobson & Truax ซึ่งหมายถึงคะแนนคัดกรอง ไม่ใช่การหายจากโรค · ${CAUSAL_NOTE}`
      );
  }
}

/**
 * Classify the change between two administrations of the same instrument.
 *
 * Throws on mismatched instruments for the reason trend.ts does: the two
 * scales have no common unit, and a difference between them has no referent.
 */
export function reliableChange(earlier: ScoreResult, later: ScoreResult): ReliableChange {
  if (earlier.instrument !== later.instrument) {
    throw new TypeError(
      `cannot compare ${earlier.instrument} with ${later.instrument} — different scales, no common unit`
    );
  }
  const instrument = earlier.instrument;
  const deltaPoints = later.total - earlier.total;
  const sDiff = standardErrorOfDifference(instrument);
  const rci = deltaPoints / sDiff;
  const reliable = Math.abs(rci) >= RCI_Z;
  const cut = CUTPOINTS[instrument].score;
  const fromClinical = earlier.total >= cut;
  const toClinical = later.total >= cut;

  const base = {
    instrument,
    fromTotal: earlier.total,
    toTotal: later.total,
    deltaPoints,
    rci,
    reliable,
    thresholdPoints: reliableChangePoints(instrument),
    mcidPoints: MCID[instrument].points,
    meetsMcid: Math.abs(deltaPoints) >= MCID[instrument].points,
    fromClinical,
    toClinical,
  };

  // Jacobson & Truax's crossing of the two questions. "Recovered" requires
  // BOTH a reliable improvement AND the move out of the clinical range:
  // dropping under the cut-point by one point is not recovery, it is the
  // measurement wobbling across a line.
  let category: OutcomeCategory;
  if (!reliable) category = "unchanged";
  else if (deltaPoints > 0) category = "deteriorated";
  else if (fromClinical && !toClinical) category = "recovered";
  else category = "improved";

  return { ...base, category, noteTh: noteFor(category, base) };
}

export interface OutcomeSummary {
  instrument: InstrumentId;
  /** First → last. Null with fewer than two administrations: one score is not
   *  an outcome, and the dashboard must show that rather than a flat line. */
  overall: ReliableChange | null;
  /** The two most recent. Null below two. */
  latest: ReliableChange | null;
  administrations: number;
  /** Days between the first and last administration, or 0. Context for how
   *  much the numbers can be expected to have moved. */
  spanDays: number;
  noteTh: string;
}

export interface Administration {
  /** Epoch milliseconds, supplied by the caller — this module never reads a
   *  clock, so its output is reproducible. */
  at: number;
  score: ScoreResult;
}

const DAY_MS = 86_400_000;

/** Summarise one instrument's administrations. Sorted by time; other
 *  instruments are dropped rather than silently mixed in. */
export function summariseOutcome(
  instrument: InstrumentId,
  administrations: readonly Administration[]
): OutcomeSummary {
  const mine = administrations
    .filter((a) => a.score.instrument === instrument)
    .slice()
    .sort((a, b) => a.at - b.at);

  if (mine.length < 2) {
    return {
      instrument,
      overall: null,
      latest: null,
      administrations: mine.length,
      spanDays: 0,
      noteTh:
        mine.length === 0
          ? "ยังไม่มีผลประเมิน"
          : "มีผลประเมินครั้งเดียว — ยังเทียบไม่ได้ ทำซ้ำอีกครั้งใน 2 สัปดาห์",
    };
  }

  const first = mine[0];
  const last = mine[mine.length - 1];
  return {
    instrument,
    overall: reliableChange(first.score, last.score),
    latest: reliableChange(mine[mine.length - 2].score, last.score),
    administrations: mine.length,
    spanDays: Math.round((last.at - first.at) / DAY_MS),
    noteTh: CAUSAL_NOTE,
  };
}

/**
 * The band of scores around a baseline that a second score could land in
 * without the change being reliable.
 *
 * For drawing: a chart that plots points against severity bands alone invites
 * the reader to see every wiggle as movement. Shading the region that is
 * indistinguishable from the baseline puts the instrument's precision on the
 * same picture as its readings, which is the one thing a progress chart can do
 * that a table cannot.
 */
export function noiseBand(instrument: InstrumentId, baseline: number): { low: number; high: number } {
  const points = reliableChangePoints(instrument);
  const bands = BANDS[instrument];
  const min = bands[0].from;
  const max = bands[bands.length - 1].to;
  // Clamped to the scale: the band cannot extend past scores the instrument
  // can produce, and drawing it there would imply room the scale does not have.
  return {
    low: Math.max(min, baseline - (points - 1)),
    high: Math.min(max, baseline + (points - 1)),
  };
}
