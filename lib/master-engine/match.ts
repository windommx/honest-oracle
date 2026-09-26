// ╔══════════════════════════════════════════════════════════════════╗
// ║  REFERENCE MATCHING — turn "it sounds duller than theirs" into a  ║
// ║  curve.                                                            ║
// ║                                                                    ║
// ║  The measurement is in spectrum.ts; this is the part that decides  ║
// ║  what to DO with it, and the decisions are where a matcher is      ║
// ║  honest or not.                                                    ║
// ║                                                                    ║
// ║  It fits the FIVE bands the EQ actually has, rather than inventing ║
// ║  a 31-band curve the operator cannot see or edit. A matcher that   ║
// ║  writes a curve nobody can inspect is an oracle, and the whole     ║
// ║  point of this page is that the curve on screen is the audio.      ║
// ║                                                                    ║
// ║  It is also bounded and damped. A reference in a different genre,  ║
// ║  or one that is simply brighter, will ask for 12dB of shelf; a     ║
// ║  matcher that obeys produces a caricature. The default applies     ║
// ║  half the measured difference and never more than 6dB, and says    ║
// ║  so rather than pretending the result is "matched".                ║
// ╚══════════════════════════════════════════════════════════════════╝

import { magnitudeDbAt, peaking, lowShelf, highShelf } from "./biquad";
import { THIRD_OCTAVE_HZ, balanceDelta, type SpectralBalance } from "./spectrum";
import type { EqBand } from "./types";

/** Never ask for more than this from one band. */
export const MAX_MATCH_DB = 6;
/** How much of the measured difference to apply by default. */
export const DEFAULT_STRENGTH = 0.5;

export interface MatchOptions {
  /** 0..1. 1 applies the whole measured difference. */
  strength?: number;
  maxDb?: number;
  /** The bands to fit. Their frequencies and kinds are kept; only the gains
   *  move, so the operator's own choice of where to work is respected. */
  bands: EqBand[];
  sampleRate: number;
}

export interface MatchResult {
  bands: EqBand[];
  /** What was actually applied versus what was measured, so the UI can say
   *  "half of a 9dB difference" rather than implying a match. */
  strength: number;
  clampedBands: number[];
  /** RMS of the difference the fitted curve does NOT cover. A matcher that
   *  reports only its successes is not a measurement. */
  residualDb: number;
}

/**
 * Fit the EQ's own bands to a measured difference.
 *
 * Least-squares over the third-octave grid: for each candidate set of gains,
 * the curve the EQ would produce is evaluated at every band centre and
 * compared to the target difference. Solved by coordinate descent rather than
 * a matrix inverse — five parameters, a few passes, and it cannot produce the
 * wild gains an ill-conditioned inverse can.
 */
export function matchToReference(
  subject: SpectralBalance,
  target: SpectralBalance,
  options: MatchOptions
): MatchResult {
  const strength = Math.min(1, Math.max(0, options.strength ?? DEFAULT_STRENGTH));
  const maxDb = options.maxDb ?? MAX_MATCH_DB;
  const deltas = balanceDelta(subject, target).filter((d) => d.usable);

  const bands = options.bands.map((b) => ({ ...b, gainDb: 0 }));
  if (deltas.length === 0) {
    return { bands, strength, clampedBands: [], residualDb: 0 };
  }

  const wanted = deltas.map((d) => ({ hz: d.hz, db: d.db * strength }));

  /** The EQ's response at one frequency for the current gains. */
  const curveAt = (hz: number) =>
    bands.reduce((sum, b) => {
      if (b.gainDb === 0) return sum;
      const c =
        b.kind === "lowShelf"
          ? lowShelf(b.freq, b.gainDb, b.q, options.sampleRate)
          : b.kind === "highShelf"
            ? highShelf(b.freq, b.gainDb, b.q, options.sampleRate)
            : peaking(b.freq, b.gainDb, b.q, options.sampleRate);
      return sum + magnitudeDbAt(c, hz, options.sampleRate);
    }, 0);

  const error = () => wanted.reduce((sum, w) => sum + (w.db - curveAt(w.hz)) ** 2, 0);

  // Coordinate descent with a shrinking step. Deterministic, and every
  // intermediate state is a curve the operator could have dialled by hand.
  let step = maxDb;
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < bands.length; i++) {
      const before = bands[i].gainDb;
      let best = before;
      let bestError = error();
      for (const candidate of [before - step, before + step]) {
        const clamped = Math.min(maxDb, Math.max(-maxDb, candidate));
        if (clamped === before) continue;
        bands[i].gainDb = clamped;
        const e = error();
        if (e < bestError) {
          bestError = e;
          best = clamped;
        }
      }
      bands[i].gainDb = best;
    }
    step /= 2;
  }

  for (const b of bands) b.gainDb = Number(b.gainDb.toFixed(2));

  const clampedBands: number[] = [];
  bands.forEach((b, i) => {
    if (Math.abs(Math.abs(b.gainDb) - maxDb) < 0.01) clampedBands.push(i);
  });

  const residual = Math.sqrt(error() / wanted.length);
  return { bands, strength, clampedBands, residualDb: Number(residual.toFixed(2)) };
}

/** A plain-language summary of what the match did and did not do. Written
 *  here rather than in the component so it is covered by tests. */
export function describeMatch(result: MatchResult, distanceDb: number): string {
  const applied = Math.round(result.strength * 100);
  const parts = [
    `ต่างจากอ้างอิง ${distanceDb.toFixed(1)} dB (RMS ทุกย่าน) — ใส่ให้ ${applied}% ของส่วนต่างที่วัดได้`,
  ];
  if (result.clampedBands.length > 0) {
    parts.push(`${result.clampedBands.length} แบนด์ชนเพดาน ±${MAX_MATCH_DB} dB จึงไม่ได้ตามที่วัดทั้งหมด`);
  }
  parts.push(`ยังเหลือส่วนต่างที่ EQ ห้าแบนด์นี้ตามไม่ได้ ${result.residualDb.toFixed(1)} dB`);
  return parts.join(" · ");
}

/** Exported for the display: the grid the match was fitted on. */
export { THIRD_OCTAVE_HZ };
