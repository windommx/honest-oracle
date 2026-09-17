// ╔══════════════════════════════════════════════════════════════════╗
// ║  ANALOG LIFE and TAPE HISS — the two stages that add instability. ║
// ║                                                                    ║
// ║  Every other stage in this chain makes the master more controlled. ║
// ║  These make it less, on purpose: a digital master is perfectly     ║
// ║  steady, and perfectly steady is the thing ears read as "not a     ║
// ║  record". Tape and console gear drift — speed wavers, bias shifts, ║
// ║  a noise floor sits under everything — and a little of that is     ║
// ║  what "analog" actually means when someone says a master has it.   ║
// ║                                                                    ║
// ║  Both are DETERMINISTIC. A seeded generator, never Math.random():  ║
// ║  the same file mastered twice has to produce the same bytes, or    ║
// ║  the export is not reproducible and nothing downstream can be      ║
// ║  regression-tested. A test renders twice and compares.             ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Biquad, bandpass } from "./biquad";
import { DelayLine } from "@/lib/synth-engine/delay-line";
import { Rng } from "@/lib/synth-engine/rng";

/** Wow is the slow one (a warped record), flutter the fast one (a worn
 *  capstan). Real machines have both, at roughly these rates. */
const WOW_HZ = 1.1;
const FLUTTER_HZ = 7.3;

/** Peak delay deviation at full amount, in seconds. 0.15ms swung at ~1Hz is
 *  about 0.1% pitch — at the edge of audible, which is where it belongs. */
const MAX_DEVIATION_S = 0.00015;
/** Base delay, so the modulation never asks for a negative one. */
const BASE_DELAY_S = 0.003;

/** Peak gain wobble at full amount, in dB. */
const MAX_GAIN_DRIFT_DB = 0.35;

/** A slowly wandering value in [-1, 1] — smoothed noise rather than a sine, so
 *  the drift never sounds like a deliberate LFO. */
class RandomWalk {
  private readonly rng: Rng;
  private readonly stepSamples: number;
  private countdown = 0;
  private from = 0;
  private to = 0;

  constructor(sampleRate: number, hz: number, seed: number) {
    this.rng = new Rng(seed);
    this.stepSamples = Math.max(1, Math.round(sampleRate / Math.max(0.05, hz)));
  }

  reset(): void {
    this.countdown = 0;
    this.from = 0;
    this.to = 0;
  }

  tick(): number {
    if (this.countdown <= 0) {
      this.from = this.to;
      this.to = this.rng.bipolar();
      this.countdown = this.stepSamples;
    }
    this.countdown--;
    const t = 1 - this.countdown / this.stepSamples;
    // Raised cosine between targets: continuous in value AND slope, so the
    // pitch never steps. A linear ramp would put a corner at every target,
    // which is a click on a signal this sensitive.
    return this.from + (this.to - this.from) * (0.5 - 0.5 * Math.cos(Math.PI * t));
  }
}

export class AnalogLife {
  private readonly sampleRate: number;
  private readonly delayLeft: DelayLine;
  private readonly delayRight: DelayLine;
  private readonly wow: RandomWalk;
  private readonly flutter: RandomWalk;
  private readonly gainWalk: RandomWalk;
  private amount = 0;
  private modulation = 0;
  private gain = 1;

  constructor(sampleRate: number, seed = 0x10fe) {
    this.sampleRate = sampleRate;
    const size = Math.ceil((BASE_DELAY_S + MAX_DEVIATION_S * 4) * sampleRate) + 4;
    this.delayLeft = new DelayLine(size);
    this.delayRight = new DelayLine(size);
    this.wow = new RandomWalk(sampleRate, WOW_HZ, seed);
    this.flutter = new RandomWalk(sampleRate, FLUTTER_HZ, seed ^ 0x5bf0);
    this.gainWalk = new RandomWalk(sampleRate, 0.4, seed ^ 0x2ae1);
  }

  setAmount(amount: number): void {
    this.amount = Math.min(1, Math.max(0, amount));
  }

  get active(): boolean {
    return this.amount > 0;
  }

  reset(): void {
    this.delayLeft.clear();
    this.delayRight.clear();
    this.wow.reset();
    this.flutter.reset();
    this.gainWalk.reset();
    this.modulation = 0;
    this.gain = 1;
  }

  /** Advance the drift by one sample. Call before the two tick calls so both
   *  channels move together — independent drift per channel would swing the
   *  stereo image, which is a different (and much worse) effect. */
  advance(): void {
    if (!this.active) return;
    // Flutter is the smaller term; wow carries most of the movement.
    const walk = this.wow.tick() * 0.8 + this.flutter.tick() * 0.2;
    this.modulation = walk * MAX_DEVIATION_S * this.sampleRate * this.amount;
    this.gain = Math.pow(10, (this.gainWalk.tick() * MAX_GAIN_DRIFT_DB * this.amount) / 20);
  }

  private read(x: number, line: DelayLine): number {
    line.write(x);
    return line.readInterpolated(BASE_DELAY_S * this.sampleRate + this.modulation) * this.gain;
  }

  tickLeft(x: number): number {
    return this.active ? this.read(x, this.delayLeft) : x;
  }

  tickRight(x: number): number {
    return this.active ? this.read(x, this.delayRight) : x;
  }

  /** Samples of delay this stage adds when it is on. Reported so the chain can
   *  state its total latency honestly rather than leaving it unexplained. */
  get latencySamples(): number {
    return this.active ? Math.round(BASE_DELAY_S * this.sampleRate) : 0;
  }
}

/** Hiss level at full knob, in dBFS. Real tape sits around -60; this tops out
 *  a little above so the control has something to hear at the end of its
 *  travel, and the default is 0. */
export const HISS_MAX_DBFS = -55;

export class TapeHiss {
  private readonly rng: Rng;
  private readonly shapeLeft = new Biquad();
  private readonly shapeRight = new Biquad();
  private amount = 0;
  private gain = 0;

  constructor(sampleRate: number, seed = 0x7a5e) {
    this.rng = new Rng(seed);
    // Tape hiss is not white — it is weighted toward the top, which is why it
    // is heard as hiss rather than as rumble.
    const c = bandpass(6000, 0.6, sampleRate);
    this.shapeLeft.setCoefficients(c);
    this.shapeRight.setCoefficients(c);
  }

  setAmount(amount: number): void {
    this.amount = Math.min(1, Math.max(0, amount));
    this.gain = this.amount === 0 ? 0 : Math.pow(10, HISS_MAX_DBFS / 20) * this.amount;
  }

  reset(seed = 0x7a5e): void {
    this.rng.reset(seed);
    this.shapeLeft.reset();
    this.shapeRight.reset();
  }

  tickLeft(x: number): number {
    return this.gain === 0 ? x : x + this.shapeLeft.tick(this.rng.bipolar()) * this.gain;
  }

  tickRight(x: number): number {
    // A separate draw per channel: identical hiss in both channels collapses
    // to a mono line in the middle of the image, which sounds like a fault.
    return this.gain === 0 ? x : x + this.shapeRight.tick(this.rng.bipolar()) * this.gain;
  }
}

/** Exported for the test that proves the hiss is shaped rather than white. */
export const HISS_CENTRE_HZ = 6000;
