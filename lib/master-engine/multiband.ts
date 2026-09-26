// ╔══════════════════════════════════════════════════════════════════╗
// ║  MULTIBAND — the one thing a mastering chain cannot do without.   ║
// ║                                                                    ║
// ║  A full-band compressor is controlled by whatever is loudest, and  ║
// ║  on a finished mix that is almost always the kick. So every kick   ║
// ║  pulls the vocal, the guitars and the cymbals down with it: the    ║
// ║  mix "breathes", and the engineer cannot fix the low end without   ║
// ║  moving everything else. Splitting the spectrum first is what      ║
// ║  makes the bottom controllable on its own.                         ║
// ║                                                                    ║
// ║  The split is LINKWITZ-RILEY, not a pair of ordinary filters.      ║
// ║  Cascading two Butterworth sections gives each band a -6dB corner  ║
// ║  and a 90-degree phase difference at the crossover, so the bands   ║
// ║  sum to a 3dB DIP right where most of a mix's energy is. Two       ║
// ║  cascaded Butterworths per band — LR4 — are -6dB and IN PHASE at   ║
// ║  the corner, so they sum flat. A test sweeps the summed output and ║
// ║  requires it within 0.1dB of the input across the whole band.      ║
// ║                                                                    ║
// ║  The high band is then all-passed through the low crossover, and   ║
// ║  the low through the high one, so every band has seen the same     ║
// ║  phase response. Without that the bands sum flat in MAGNITUDE and  ║
// ║  still smear transients against each other.                        ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Biquad, highpass, lowpass } from "./biquad";
import { EnvelopeFollower } from "./dynamics";
import { dbToGain, gainToDb } from "./db";

import {
  BAND_COUNT,
  DEFAULT_BAND,
  DEFAULT_MULTIBAND,
  type BandIndex,
  type BandSettings,
  type MultibandSettings,
} from "./types";

// Re-exported so callers can reach the settings through the module that uses
// them. They are DECLARED in types.ts, which every DSP module depends on and
// which depends on none of them: declaring them here instead made the graph
// circular through dynamics.ts, and the engine failed to load at all.
export { BAND_COUNT, DEFAULT_BAND, DEFAULT_MULTIBAND, BAND_LABEL } from "./types";
export type { BandIndex, BandSettings, MultibandSettings } from "./types";


/** Butterworth Q for the sections an LR4 is built from. Two identical
 *  Butterworth sections in series ARE a Linkwitz-Riley of twice the order. */
const BUTTERWORTH_Q = Math.SQRT1_2;

/** One LR4 two-way split, per channel. */
class Crossover {
  private readonly lowA = new Biquad();
  private readonly lowB = new Biquad();
  private readonly highA = new Biquad();
  private readonly highB = new Biquad();

  low = 0;
  high = 0;

  setFrequency(hz: number, sampleRate: number): void {
    const lp = lowpass(hz, BUTTERWORTH_Q, sampleRate);
    const hp = highpass(hz, BUTTERWORTH_Q, sampleRate);
    this.lowA.setCoefficients(lp);
    this.lowB.setCoefficients(lp);
    this.highA.setCoefficients(hp);
    this.highB.setCoefficients(hp);
  }

  reset(): void {
    this.lowA.reset();
    this.lowB.reset();
    this.highA.reset();
    this.highB.reset();
  }

  split(x: number): void {
    // NO inversion. At the crossover a Butterworth 2nd-order lowpass is
    // 1/sqrt(2) at -90 degrees and its highpass partner 1/sqrt(2) at +90;
    // squaring each — which is what cascading two of them does — puts BOTH at
    // -180, so they are in phase and sum to unity. Inverting one, the fix that
    // odd-order Linkwitz-Riley crossovers genuinely need, makes them cancel
    // instead: measured -6.02dB at the crossover and -7.4dB at 2kHz.
    this.low = this.lowB.tick(this.lowA.tick(x));
    this.high = this.highB.tick(this.highA.tick(x));
  }
}

/** A band's compressor. Feed-forward, peak-detecting, with a soft knee. */
class BandCompressor {
  private readonly follower: EnvelopeFollower;
  private settings: BandSettings = { ...DEFAULT_BAND };
  private currentGain = 1;

  constructor(sampleRate: number) {
    this.follower = new EnvelopeFollower(sampleRate, DEFAULT_BAND.attackSeconds, DEFAULT_BAND.releaseSeconds);
  }

  setSettings(s: BandSettings): void {
    this.settings = s;
    this.follower.setTimes(Math.max(0.0001, s.attackSeconds), Math.max(0.001, s.releaseSeconds));
  }

  reset(): void {
    this.follower.reset();
    this.currentGain = 1;
  }

  get reductionDb(): number {
    return gainToDb(this.currentGain);
  }

  /** Detector on the mono sum, gain applied to both channels: compressing the
   *  two separately moves the image on every transient. */
  gainFor(detector: number): number {
    const level = this.follower.tick(Math.abs(detector));
    const s = this.settings;
    if (s.bypass || s.ratio <= 1) {
      this.currentGain = 1;
      return dbToGain(s.makeupDb);
    }
    const levelDb = gainToDb(Math.max(level, 1e-9));
    const over = levelDb - s.thresholdDb;
    if (over <= 0) {
      this.currentGain = 1;
      return dbToGain(s.makeupDb);
    }
    // A soft knee over the first few dB: a hard corner is audible as the
    // compressor "grabbing" at the threshold.
    const knee = 6;
    const compressed =
      over < knee
        ? (over * over * (1 / s.ratio - 1)) / (2 * knee)
        : over * (1 / s.ratio - 1) + (knee * (1 - 1 / s.ratio)) / 2;
    this.currentGain = dbToGain(compressed);
    return this.currentGain * dbToGain(s.makeupDb);
  }
}

export class MultibandCompressor {
  private readonly sampleRate: number;
  private readonly lowSplitL = new Crossover();
  private readonly lowSplitR = new Crossover();
  private readonly highSplitL = new Crossover();
  private readonly highSplitR = new Crossover();
  /**
   * All-pass partners for the low band.
   *
   * The mid and high bands both pass through the UPPER crossover; the low band
   * does not, so it has to be sent through that crossover's own allpass —
   * LP + HP of the same filter, magnitude-flat with exactly the phase the
   * other two picked up. Setting these to the LOWER crossover instead, which
   * reads as the natural pairing, applies the wrong phase and leaves the sum
   * dipping across the whole overlap region.
   */
  private readonly compensateL = new Crossover();
  private readonly compensateR = new Crossover();
  private readonly compressors: BandCompressor[];
  private settings: MultibandSettings = DEFAULT_MULTIBAND;

  outLeft = 0;
  outRight = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.compressors = Array.from({ length: BAND_COUNT }, () => new BandCompressor(sampleRate));
    this.setSettings(DEFAULT_MULTIBAND);
  }

  setSettings(settings: MultibandSettings): void {
    this.settings = settings;
    const low = Math.min(Math.max(30, settings.crossoverLowHz), settings.crossoverHighHz - 50);
    const high = Math.min(Math.max(low + 50, settings.crossoverHighHz), this.sampleRate * 0.45);
    for (const c of [this.lowSplitL, this.lowSplitR]) c.setFrequency(low, this.sampleRate);
    for (const c of [this.highSplitL, this.highSplitR]) c.setFrequency(high, this.sampleRate);
    for (const c of [this.compensateL, this.compensateR]) c.setFrequency(high, this.sampleRate);
    settings.bands.forEach((b, i) => this.compressors[i]?.setSettings(b));
  }

  get active(): boolean {
    return this.settings.enabled;
  }

  reductionDb(band: BandIndex): number {
    return this.compressors[band].reductionDb;
  }

  reset(): void {
    for (const c of [
      this.lowSplitL,
      this.lowSplitR,
      this.highSplitL,
      this.highSplitR,
      this.compensateL,
      this.compensateR,
    ]) {
      c.reset();
    }
    for (const c of this.compressors) c.reset();
  }

  process(left: number, right: number): void {
    if (!this.settings.enabled) {
      this.outLeft = left;
      this.outRight = right;
      return;
    }

    // Split low from the rest, then split the rest into mid and high.
    this.lowSplitL.split(left);
    this.lowSplitR.split(right);
    this.highSplitL.split(this.lowSplitL.high);
    this.highSplitR.split(this.lowSplitR.high);

    // The low band skipped the UPPER crossover, so it goes through that
    // crossover's allpass sum — low + high of the same filter, magnitude-flat
    // and carrying exactly the phase the other two bands picked up.
    this.compensateL.split(this.lowSplitL.low);
    this.compensateR.split(this.lowSplitR.low);
    const lowL = this.compensateL.low + this.compensateL.high;
    const lowR = this.compensateR.low + this.compensateR.high;

    const midL = this.highSplitL.low;
    const midR = this.highSplitR.low;
    const highL = this.highSplitL.high;
    const highR = this.highSplitR.high;

    const soloing = this.settings.bands.some((b) => b.solo);
    const bandL = [lowL, midL, highL];
    const bandR = [lowR, midR, highR];

    let outL = 0;
    let outR = 0;
    for (let i = 0; i < BAND_COUNT; i++) {
      const band = this.settings.bands[i];
      const gain = this.compressors[i].gainFor((bandL[i] + bandR[i]) * 0.5);
      if (soloing && !band.solo) continue;
      outL += bandL[i] * gain;
      outR += bandR[i] * gain;
    }

    this.outLeft = outL;
    this.outRight = outR;
  }
}
