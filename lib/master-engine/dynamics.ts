// ╔══════════════════════════════════════════════════════════════════╗
// ║  DYNAMICS — Punch, De-Esser, De-Chirp.                            ║
// ║                                                                    ║
// ║  All three are the same idea pointed at different problems: watch  ║
// ║  a detector, decide a gain, apply it. What differs is WHERE the    ║
// ║  gain lands.                                                       ║
// ║                                                                    ║
// ║  The de-esser and de-chirp apply theirs through a SHELF rather     ║
// ║  than by subtracting a filtered band from the full signal. The     ║
// ║  subtraction approach is the obvious one and it does not work: a   ║
// ║  bandpass shifts phase, so `full - band` leaves a comb-filtered    ║
// ║  residue instead of a clean notch. Detecting on a bandpass (where  ║
// ║  phase does not matter) and correcting with a shelf keeps the      ║
// ║  audio path phase-coherent.                                        ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Biquad, bandpass, highShelf, highpass } from "./biquad";
import { ESS_HIGH_HZ, ESS_LOW_HZ, dbToGain, gainToDb } from "./types";

/** One-pole level follower with separate attack and release. */
export class EnvelopeFollower {
  private readonly sampleRate: number;
  private attackCoeff = 0;
  private releaseCoeff = 0;
  private value = 0;

  constructor(sampleRate: number, attackSeconds: number, releaseSeconds: number) {
    this.sampleRate = sampleRate;
    this.setTimes(attackSeconds, releaseSeconds);
  }

  setTimes(attackSeconds: number, releaseSeconds: number): void {
    // A zero time means "instant", which is a coefficient of 0, not a divide
    // by zero.
    this.attackCoeff = attackSeconds <= 0 ? 0 : Math.exp(-1 / (attackSeconds * this.sampleRate));
    this.releaseCoeff = releaseSeconds <= 0 ? 0 : Math.exp(-1 / (releaseSeconds * this.sampleRate));
  }

  get level(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }

  /** Feed the rectified signal. */
  tick(magnitude: number): number {
    const coeff = magnitude > this.value ? this.attackCoeff : this.releaseCoeff;
    this.value = magnitude + coeff * (this.value - magnitude);
    if (this.value < 1e-20) this.value = 0;
    return this.value;
  }
}

/** How much louder a full-strength Punch makes a transient, in dB. */
export const PUNCH_MAX_DB = 9;

/**
 * PUNCH — a transient shaper, not a compressor.
 *
 * Two followers watch the same signal: one quick enough to track an attack,
 * one slow enough to only track the body. Where they disagree, a transient is
 * happening, and the gap between them is how much of one. Lifting the gap
 * raises attacks and leaves sustain alone, which is the opposite of what a
 * compressor does to a mix and the reason a master gets "punch" from this
 * rather than from more compression.
 */
export class TransientShaper {
  private readonly fast: EnvelopeFollower;
  private readonly slow: EnvelopeFollower;
  private amount = 0;

  constructor(sampleRate: number) {
    this.fast = new EnvelopeFollower(sampleRate, 0.0005, 0.045);
    this.slow = new EnvelopeFollower(sampleRate, 0.025, 0.18);
  }

  setAmount(amount: number): void {
    this.amount = Math.min(1, Math.max(0, amount));
  }

  reset(): void {
    this.fast.reset();
    this.slow.reset();
  }

  /** Gain for this sample, from a mono sum of the two channels. */
  gainFor(detector: number): number {
    const m = Math.abs(detector);
    const fast = this.fast.tick(m);
    // The slow follower is fed the FAST one, not the raw signal. Running both
    // from the rectified waveform looks equivalent and is not: a follower with
    // a quick attack settles on the peaks while a slower one settles nearer
    // the mean, so they disagree by about 1dB even on a dead-steady sine — and
    // that difference is read as a transient and lifted, which modulates the
    // waveform at twice its own frequency. Cascading makes the slow one a
    // lowpass of the fast one, so a constant in gives a zero difference out
    // and only real movement survives. A test holds a 440Hz tone and requires
    // the lift to stay under half a dB.
    const slow = this.slow.tick(fast);
    if (this.amount === 0) return 1;
    // Ratio in dB rather than a linear difference: a transient on a quiet
    // passage should be shaped as much as one on a loud passage, and only the
    // ratio is level-independent.
    const diffDb = gainToDb(Math.max(fast, 1e-6)) - gainToDb(Math.max(slow, 1e-6));
    const lift = Math.min(PUNCH_MAX_DB, Math.max(0, diffDb)) * this.amount;
    return dbToGain(lift);
  }
}

/** Level above which the de-esser starts working, and the most it will pull
 *  down. A fixed threshold is honest here: the detector is a band level, and
 *  what counts as a harsh ess does not depend on how loud the track is. */
export const ESS_THRESHOLD_DB = -30;
export const ESS_MAX_REDUCTION_DB = 12;

/**
 * DE-ESSER — a dynamic high shelf driven by a band detector.
 */
export class DeEsser {
  private readonly sampleRate: number;
  private readonly detectLeft = new Biquad();
  private readonly detectRight = new Biquad();
  private readonly follower: EnvelopeFollower;
  private readonly shelfLeft = new Biquad();
  private readonly shelfRight = new Biquad();
  private amount = 0;
  private currentCutDb = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    const centre = Math.sqrt(ESS_LOW_HZ * ESS_HIGH_HZ);
    const q = centre / (ESS_HIGH_HZ - ESS_LOW_HZ);
    const c = bandpass(centre, q, sampleRate);
    this.detectLeft.setCoefficients(c);
    this.detectRight.setCoefficients(c);
    this.follower = new EnvelopeFollower(sampleRate, 0.001, 0.05);
    this.setCut(0);
  }

  setAmount(amount: number): void {
    this.amount = Math.min(1, Math.max(0, amount));
  }

  private setCut(db: number): void {
    this.currentCutDb = db;
    const c = highShelf(ESS_LOW_HZ, db, 0.7, this.sampleRate);
    this.shelfLeft.setCoefficients(c);
    this.shelfRight.setCoefficients(c);
  }

  get reductionDb(): number {
    return this.currentCutDb;
  }

  reset(): void {
    this.detectLeft.reset();
    this.detectRight.reset();
    this.shelfLeft.reset();
    this.shelfRight.reset();
    this.follower.reset();
  }

  /** Call once per sample, before the two tick calls. */
  detect(left: number, right: number): void {
    if (this.amount === 0) {
      if (this.currentCutDb !== 0) this.setCut(0);
      return;
    }
    const band = (this.detectLeft.tick(left) + this.detectRight.tick(right)) * 0.5;
    const levelDb = gainToDb(Math.max(this.follower.tick(Math.abs(band)), 1e-9));
    const over = Math.max(0, levelDb - ESS_THRESHOLD_DB);
    const cut = -Math.min(ESS_MAX_REDUCTION_DB, over * this.amount);
    // Rebuilding the shelf every sample would be wasteful and would also
    // modulate the filter state; a tenth of a dB is below audibility.
    if (Math.abs(cut - this.currentCutDb) > 0.1) this.setCut(cut);
  }

  tickLeft(x: number): number {
    return this.amount === 0 ? x : this.shelfLeft.tick(x);
  }

  tickRight(x: number): number {
    return this.amount === 0 ? x : this.shelfRight.tick(x);
  }
}

/** Where de-chirp works. Below this the ear hears tone, not chirp. */
export const CHIRP_BAND_HZ = 6000;
export const CHIRP_MAX_REDUCTION_DB = 9;

/**
 * DE-CHIRP — a high-band transient SUPPRESSOR. Punch, inverted, above 6kHz.
 *
 * Naming honesty: this is our definition, not a reverse-engineering of any
 * other product that uses the word. What it does is precise and measurable:
 * it finds moments where the top end spikes far above its own running average
 * — the short isolated bursts that heavy limiting and lossy codecs leave
 * behind, which sound like tiny whistles or birds over cymbals — and pulls
 * only those down, through a high shelf. Sustained top end (air, a ride
 * cymbal held open) does not spike against its own average and is left alone.
 * A test asserts exactly that split.
 */
export class DeChirp {
  private readonly sampleRate: number;
  private readonly detectLeft = new Biquad();
  private readonly detectRight = new Biquad();
  private readonly fast: EnvelopeFollower;
  private readonly slow: EnvelopeFollower;
  private readonly shelfLeft = new Biquad();
  private readonly shelfRight = new Biquad();
  private amount = 0;
  private currentCutDb = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    const c = highpass(CHIRP_BAND_HZ, 0.707, sampleRate);
    this.detectLeft.setCoefficients(c);
    this.detectRight.setCoefficients(c);
    this.fast = new EnvelopeFollower(sampleRate, 0.0003, 0.02);
    this.slow = new EnvelopeFollower(sampleRate, 0.05, 0.4);
    this.setCut(0);
  }

  setAmount(amount: number): void {
    this.amount = Math.min(1, Math.max(0, amount));
  }

  private setCut(db: number): void {
    this.currentCutDb = db;
    const c = highShelf(CHIRP_BAND_HZ, db, 0.7, this.sampleRate);
    this.shelfLeft.setCoefficients(c);
    this.shelfRight.setCoefficients(c);
  }

  get reductionDb(): number {
    return this.currentCutDb;
  }

  reset(): void {
    this.detectLeft.reset();
    this.detectRight.reset();
    this.shelfLeft.reset();
    this.shelfRight.reset();
    this.fast.reset();
    this.slow.reset();
  }

  detect(left: number, right: number): void {
    if (this.amount === 0) {
      if (this.currentCutDb !== 0) this.setCut(0);
      return;
    }
    const band = Math.abs((this.detectLeft.tick(left) + this.detectRight.tick(right)) * 0.5);
    const fast = this.fast.tick(band);
    const slow = this.slow.tick(band);
    // How far this instant stands above the band's own recent average. A
    // sustained cymbal sits at ~0dB of excess; a chirp spikes well above it.
    const excessDb = gainToDb(Math.max(fast, 1e-7)) - gainToDb(Math.max(slow, 1e-7));
    const cut = -Math.min(CHIRP_MAX_REDUCTION_DB, Math.max(0, excessDb - 3) * this.amount);
    if (Math.abs(cut - this.currentCutDb) > 0.1) this.setCut(cut);
  }

  tickLeft(x: number): number {
    return this.amount === 0 ? x : this.shelfLeft.tick(x);
  }

  tickRight(x: number): number {
    return this.amount === 0 ? x : this.shelfRight.tick(x);
  }
}
