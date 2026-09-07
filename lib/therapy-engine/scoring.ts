// ╔══════════════════════════════════════════════════════════════════╗
// ║  SCORING — sum the items, name the band, and stop there.          ║
// ║                                                                    ║
// ║  A total here is a DIRECT COUNT (rush-engine's paccakkha tier):    ║
// ║  same answers → same number, every run, re-derivable by hand. The  ║
// ║  band is a lookup against a published cut-point, not a judgement.  ║
// ║                                                                    ║
// ║  What this module refuses to do, deliberately:                     ║
// ║   · combine GAD-7 and PHQ-9 into one "mental health index". The    ║
// ║     two scales measure different constructs and were validated     ║
// ║     separately; an average of them has no published meaning.       ║
// ║   · rescale to a percentage. "36%" invents a denominator the       ║
// ║     instrument does not have.                                      ║
// ║   · call any band a diagnosis. Screening ≠ diagnosis, and the      ║
// ║     operating characteristics below are exactly why: at the        ║
// ║     standard GAD-7 cut-point roughly 1 in 5 people who screen      ║
// ║     positive do not have the condition.                            ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { InstrumentId, Interpretation, ScoreResult, SeverityBand } from "./types";
import { getInstrument } from "./instruments";

/** Published severity bands. The `from` value of each is the cut-point as printed
 *  in the source paper — these are not our thresholds to move. */
export const BANDS: Record<InstrumentId, SeverityBand[]> = {
  gad7: [
    { id: "minimal", from: 0, to: 4, en: "Minimal anxiety", th: "น้อยมาก" },
    { id: "mild", from: 5, to: 9, en: "Mild anxiety", th: "เล็กน้อย" },
    { id: "moderate", from: 10, to: 14, en: "Moderate anxiety", th: "ปานกลาง" },
    { id: "severe", from: 15, to: 21, en: "Severe anxiety", th: "รุนแรง" },
  ],
  phq9: [
    { id: "minimal", from: 0, to: 4, en: "Minimal depression", th: "น้อยมาก" },
    { id: "mild", from: 5, to: 9, en: "Mild depression", th: "เล็กน้อย" },
    { id: "moderate", from: 10, to: 14, en: "Moderate depression", th: "ปานกลาง" },
    { id: "moderatelySevere", from: 15, to: 19, en: "Moderately severe depression", th: "ค่อนข้างรุนแรง" },
    { id: "severe", from: 20, to: 27, en: "Severe depression", th: "รุนแรง" },
  ],
};

/** The operating characteristics of the standard screening cut-point, as reported
 *  by the instrument's own validation paper. Quoted so a user can see that a
 *  positive screen is a probability, not a verdict. */
export const CUTPOINTS: Record<InstrumentId, { score: number; sensitivity: number; specificity: number; forCondition: string }> = {
  gad7: { score: 10, sensitivity: 0.89, specificity: 0.82, forCondition: "generalised anxiety disorder (Spitzer 2006)" },
  phq9: { score: 10, sensitivity: 0.88, specificity: 0.88, forCondition: "major depression (Kroenke 2001)" },
};

/** Smallest change usually treated as clinically meaningful.
 *
 *  ⚠ These are CONVENTIONS, not constants of nature. Published MCID estimates
 *  vary with population, baseline severity and the anchor used to derive them;
 *  the values below are the ones most commonly applied to these two scales in
 *  routine outcome monitoring. trend.ts reports the raw point change alongside
 *  this threshold rather than hiding the arithmetic behind a verdict. */
export const MCID: Record<InstrumentId, { points: number; note: string }> = {
  gad7: { points: 4, note: "เกณฑ์ที่ใช้กันทั่วไป ~4 คะแนน — ค่าประมาณต่างกันไปตามงานวิจัยและกลุ่มประชากร" },
  phq9: { points: 5, note: "เกณฑ์ที่ใช้กันทั่วไป ~5 คะแนน — ค่าประมาณต่างกันไปตามงานวิจัยและกลุ่มประชากร" },
};

/** True when `responses` is a complete, in-range answer set for the instrument.
 *  Partial sets are rejected rather than silently summed: a total over 5 of 7
 *  answered items is not a GAD-7 score, and printing it as one would be a lie
 *  of omission. */
export function isComplete(id: InstrumentId, responses: readonly number[]): boolean {
  const inst = getInstrument(id);
  if (responses.length !== inst.items.length) return false;
  const allowed = new Set(inst.options.map((o) => o.value));
  return responses.every((r) => Number.isInteger(r) && allowed.has(r));
}

export function bandFor(id: InstrumentId, total: number): SeverityBand {
  const bands = BANDS[id];
  const hit = bands.find((b) => total >= b.from && total <= b.to);
  if (!hit) throw new RangeError(`${id}: score ${total} is outside the instrument's range`);
  return hit;
}

/** Score a completed instrument. Throws on an incomplete/invalid response set —
 *  callers must check isComplete() first, so a bad set can never become a number. */
export function score(id: InstrumentId, responses: readonly number[]): ScoreResult {
  if (!isComplete(id, responses)) {
    throw new RangeError(`${id}: responses must be ${getInstrument(id).items.length} values within the instrument's scale`);
  }
  const inst = getInstrument(id);
  const total = responses.reduce((a, b) => a + b, 0);
  const endorsedItems = inst.items.filter((it) => responses[it.n - 1] > 0).map((it) => it.n);
  const safetyFlag = inst.items.some((it) => it.safetyCritical === true && responses[it.n - 1] > 0);
  return { instrument: id, total, band: bandFor(id, total), endorsedItems, safetyFlag };
}

const BAND_TEXT: Record<SeverityBand["id"], string> = {
  minimal: "คะแนนอยู่ในช่วงต่ำ — ไม่พบสัญญาณที่แบบคัดกรองนี้จับได้ในช่วง 2 สัปดาห์ที่ผ่านมา",
  mild: "คะแนนอยู่ในช่วงเล็กน้อย — เหมาะกับการดูแลตัวเองและติดตามอาการซ้ำใน 2 สัปดาห์",
  moderate: "คะแนนอยู่ในช่วงปานกลาง — แนะนำให้ปรึกษาผู้ให้บริการสุขภาพ ควบคู่กับการดูแลตัวเอง",
  moderatelySevere: "คะแนนอยู่ในช่วงค่อนข้างรุนแรง — ควรปรึกษาผู้ให้บริการสุขภาพ",
  severe: "คะแนนอยู่ในช่วงรุนแรง — ควรปรึกษาผู้ให้บริการสุขภาพโดยเร็ว",
};

/** Turn a score into words, with the cut-point's limits attached. */
export function interpret(result: ScoreResult): Interpretation {
  const cut = CUTPOINTS[result.instrument];
  const positive = result.total >= cut.score;
  return {
    score: result,
    isDiagnosis: false,
    th: BAND_TEXT[result.band.id],
    cutpointNote: positive
      ? `คะแนน ≥ ${cut.score} คือจุดตัดสำหรับคัดกรอง ${cut.forCondition} ` +
        `— ความไว ${Math.round(cut.sensitivity * 100)}% ความจำเพาะ ${Math.round(cut.specificity * 100)}% ` +
        `แปลว่าในกลุ่มที่คัดกรองได้ผลบวก จะมีส่วนหนึ่งที่ไม่ได้เป็นโรคจริง การคัดกรองไม่ใช่การวินิจฉัย`
      : null,
  };
}
