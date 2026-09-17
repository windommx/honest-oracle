// ╔══════════════════════════════════════════════════════════════════╗
// ║  STEREO — Width, Mono Low, Mono High.                             ║
// ║                                                                    ║
// ║  All three work on the SIDE signal only and never touch the mid.   ║
// ║  That is not a stylistic choice, it is the whole safety property:  ║
// ║  a mono fold-down is exactly the mid, so anything done here is     ║
// ║  guaranteed to leave the mono version of the track bit-identical.  ║
// ║  A widener that modifies both channels can sound enormous in       ║
// ║  stereo and lose the bass entirely on a phone speaker, and the     ║
// ║  engineer does not find out until someone plays it on one.         ║
// ║                                                                    ║
// ║  Mono Low exists because vinyl cutting and club systems need the   ║
// ║  bottom in phase, and because wide sub content wastes headroom.    ║
// ║  Mono High tames cymbals and reverb that were widened past the     ║
// ║  point of sounding like a place.                                   ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Biquad, highpass, lowpass } from "./biquad";
import { MONO_HIGH_MAX_HZ, MONO_HIGH_MIN_HZ, MONO_LOW_MAX_HZ } from "./types";

/** Width at the top of the knob. 2 is a strong widen; past that the side
 *  overwhelms the mid and the centre disappears. */
export const MAX_WIDTH = 2;

/** Knob 0..1 to the frequency below which the image is folded to mono.
 *  0 is off. */
export function monoLowHz(amount: number): number {
  const a = Math.min(1, Math.max(0, amount));
  return a === 0 ? 0 : MONO_LOW_MAX_HZ * a;
}

/** Knob 0..1 to the frequency above which the image is folded to mono.
 *  0 is off, and higher amounts reach further DOWN. */
export function monoHighHz(amount: number): number {
  const a = Math.min(1, Math.max(0, amount));
  return a === 0 ? 0 : MONO_HIGH_MAX_HZ - (MONO_HIGH_MAX_HZ - MONO_HIGH_MIN_HZ) * a;
}

/** Knob 0..1 to a side multiplier, where 0.5 is untouched. */
export function widthFactor(knob: number): number {
  const k = Math.min(1, Math.max(0, knob));
  return k <= 0.5 ? k * 2 : 1 + (k - 0.5) * 2 * (MAX_WIDTH - 1);
}

/** Butterworth Q pair for a 4th-order crossover. Two sections, because a
 *  single one leaves the fold-down obviously incomplete an octave in. */
const BUTTERWORTH_4TH = [0.5412, 1.3066];

export class StereoStage {
  private readonly sampleRate: number;
  /**
   * These KEEP what stays in the side channel — a highpass for Mono Low, a
   * lowpass for Mono High.
   *
   * The first version instead extracted the unwanted band and subtracted it
   * (`side -= lowpass(side)`), which reads as obviously correct and removes
   * only about 70% of it: the filter passes that band at full level but with
   * a phase shift, so the subtraction is between two vectors at an angle
   * rather than between two identical signals. Filtering the side directly
   * has no such problem.
   */
  private readonly sideHighpass: Biquad[];
  private readonly sideLowpass: Biquad[];
  private lowActive = false;
  private highActive = false;
  private side = 1;

  /** Written by process(). Fields, not a returned pair — this runs per sample. */
  outLeft = 0;
  outRight = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.sideHighpass = BUTTERWORTH_4TH.map(() => new Biquad());
    this.sideLowpass = BUTTERWORTH_4TH.map(() => new Biquad());
    this.setMonoLow(0);
    this.setMonoHigh(0);
  }

  setMonoLow(amount: number): void {
    const hz = monoLowHz(amount);
    this.lowActive = hz > 0;
    if (!this.lowActive) return;
    BUTTERWORTH_4TH.forEach((q, i) => this.sideHighpass[i].setCoefficients(highpass(hz, q, this.sampleRate)));
  }

  setMonoHigh(amount: number): void {
    const hz = monoHighHz(amount);
    this.highActive = hz > 0 && hz < this.sampleRate * 0.45;
    if (!this.highActive) return;
    BUTTERWORTH_4TH.forEach((q, i) => this.sideLowpass[i].setCoefficients(lowpass(hz, q, this.sampleRate)));
  }

  setWidth(knob: number): void {
    this.side = widthFactor(knob);
  }

  reset(): void {
    for (const f of this.sideHighpass) f.reset();
    for (const f of this.sideLowpass) f.reset();
  }

  process(left: number, right: number): void {
    const mid = (left + right) * 0.5;
    let side = (left - right) * 0.5;

    // Filtering the side is what folds a band to mono: what the filter
    // removes is no longer in `side`, so L and R agree there. The mid is
    // never touched, so the mono sum cannot change.
    if (this.lowActive) for (const f of this.sideHighpass) side = f.tick(side);
    if (this.highActive) for (const f of this.sideLowpass) side = f.tick(side);

    side *= this.side;

    this.outLeft = mid + side;
    this.outRight = mid - side;
  }
}

/**
 * Phase correlation between two channels, -1..1.
 *
 * +1 is mono, 0 is uncorrelated, and negative means the channels are fighting
 * — which sounds wide on headphones and disappears on anything that sums to
 * mono. The audit warns when a master lands there.
 */
export function correlation(left: Float32Array, right: Float32Array): number {
  const n = Math.min(left.length, right.length);
  if (n === 0) return 1;
  let sumLR = 0;
  let sumLL = 0;
  let sumRR = 0;
  for (let i = 0; i < n; i++) {
    sumLR += left[i] * right[i];
    sumLL += left[i] * left[i];
    sumRR += right[i] * right[i];
  }
  const denominator = Math.sqrt(sumLL * sumRR);
  // Two silent channels are perfectly correlated, not undefined.
  return denominator < 1e-20 ? 1 : sumLR / denominator;
}
