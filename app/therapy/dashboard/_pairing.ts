// ╔══════════════════════════════════════════════════════════════════╗
// ║  PAIRING — which practice minutes belong to which score.          ║
// ║                                                                    ║
// ║  Before any correlation can be computed, something has to decide   ║
// ║  what counts as "the dose that goes with this score". That choice  ║
// ║  is an analytic decision, not plumbing, so it lives here where it  ║
// ║  can be tested and argued with rather than inside a render.        ║
// ║                                                                    ║
// ║  Two decisions, both principled rather than convenient:            ║
// ║                                                                    ║
// ║  THE WINDOW IS THE INSTRUMENT'S OWN RECALL WINDOW. GAD-7 and       ║
// ║  PHQ-9 both ask "over the last 2 weeks". A score is therefore a    ║
// ║  statement about those fourteen days, and the only practice that   ║
// ║  could plausibly be reflected in it is the practice inside them.   ║
// ║  Pairing a score with all practice ever, or with the practice      ║
// ║  since the previous assessment (which might be three months), puts ║
// ║  minutes on one side of the pair that the other side never asked   ║
// ║  about.                                                            ║
// ║                                                                    ║
// ║  EXPOSURE PRECEDES OUTCOME. The window ends at the assessment and  ║
// ║  looks backwards. Practice done after a score cannot be reflected  ║
// ║  in it, and a window centred on the assessment would let it be —   ║
// ║  which quietly builds the conclusion into the measurement.         ║
// ║                                                                    ║
// ║  What this still cannot fix: assessments taken closer together     ║
// ║  than the window share practice between their pairs, so those      ║
// ║  pairs are not independent and the p-value computed from them is   ║
// ║  optimistic. `overlappingPairs` counts them so the UI can say so   ║
// ║  rather than letting the number stand unqualified.                 ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { PairedObservation } from "@/lib/therapy-engine/association";
import type { InstrumentId } from "@/lib/therapy-engine/types";

/** The recall window both instruments print on themselves, in days. */
export const RECALL_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export interface ScoredAssessment {
  at: number;
  instrument: InstrumentId;
  total: number;
}

export interface DoseSession {
  at: number;
  completedMin: number;
}

export interface Pairing {
  pairs: PairedObservation[];
  /** Pairs whose lookback window overlaps the previous pair's. Non-independent,
   *  and the reason a p-value computed from them is optimistic. */
  overlappingPairs: number;
  windowDays: number;
}

/**
 * Pair each administration of one instrument with the practice in the
 * `windowDays` before it.
 *
 * `label` is the assessment's own date, so the UI never has to re-derive it.
 */
export function pairDoseWithScores(
  assessments: readonly ScoredAssessment[],
  sessions: readonly DoseSession[],
  instrument: InstrumentId,
  formatDate: (ms: number) => string,
  windowDays: number = RECALL_WINDOW_DAYS
): Pairing {
  const mine = assessments
    .filter((a) => a.instrument === instrument)
    .slice()
    .sort((a, b) => a.at - b.at);

  const windowMs = windowDays * DAY_MS;
  const pairs: PairedObservation[] = [];
  let overlapping = 0;

  for (let i = 0; i < mine.length; i++) {
    const a = mine[i];
    const from = a.at - windowMs;
    let dose = 0;
    for (const s of sessions) {
      // Half-open [from, at]: a session logged at the same moment as the
      // assessment counts, one logged after it does not.
      if (s.at >= from && s.at <= a.at) dose += Math.max(0, s.completedMin);
    }
    pairs.push({ label: formatDate(a.at), dose, outcome: a.total });
    if (i > 0 && mine[i - 1].at > from) overlapping++;
  }

  return { pairs, overlappingPairs: overlapping, windowDays };
}

/** One line on how much the pairing can be trusted, given the overlap. */
export function describePairing(p: Pairing): string {
  if (p.pairs.length === 0) return "ยังไม่มีผลประเมินให้จับคู่กับการฝึก";
  const base = `จับคู่คะแนนแต่ละครั้งกับนาทีที่ฝึกใน ${p.windowDays} วันก่อนหน้า ซึ่งเป็นช่วงเวลาที่แบบประเมินถามถึง`;
  if (p.overlappingPairs === 0) return `${base} — ไม่มีช่วงใดซ้อนทับกัน`;
  return (
    `${base} — แต่มี ${p.overlappingPairs} คู่ที่ช่วงเวลาซ้อนทับกับคู่ก่อนหน้า ` +
    `จึงไม่เป็นอิสระต่อกัน และค่า p ที่คำนวณได้จะดูดีกว่าความเป็นจริง`
  );
}
