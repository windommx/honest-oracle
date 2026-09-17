// ╔══════════════════════════════════════════════════════════════════╗
// ║  LIMITER — the last stage, and the only one that makes a promise. ║
// ║                                                                    ║
// ║  Everything upstream shapes the sound. This one guarantees a       ║
// ║  number: no sample leaves above the ceiling. Not "usually", not    ║
// ║  "unless the transient is very fast" — never, and a test feeds it  ║
// ║  material four times over full scale to check.                     ║
// ║                                                                    ║
// ║  The guarantee comes from the structure rather than from tuning.   ║
// ║  The signal is delayed by the lookahead while a sliding MINIMUM of ║
// ║  the gain each upcoming sample will need runs ahead of it, so the  ║
// ║  gain is already down before the peak arrives. The smoother may    ║
// ║  only move the gain UP slowly; downward it snaps to the sliding    ║
// ║  minimum. So the applied gain is never above what the sample being ║
// ║  emitted requires, whatever the material does.                     ║
// ║                                                                    ║
// ║  What it does NOT promise: inter-sample peaks. A converter         ║
// ║  reconstructing this signal can still overshoot between samples.   ║
// ║  The meter measures that separately and the audit warns about it,  ║
// ║  rather than this stage quietly claiming to have handled it.       ║
// ╚══════════════════════════════════════════════════════════════════╝

import { DelayLine } from "@/lib/synth-engine/delay-line";
import { dbToGain, gainToDb } from "./types";

export const DEFAULT_LOOKAHEAD_S = 0.002;
export const DEFAULT_RELEASE_S = 0.12;

/**
 * Minimum over the last `window` pushes, in amortised O(1).
 *
 * A monotonic deque: values that can never again be the minimum — because a
 * smaller one arrived after them — are dropped on the way in, so the front is
 * always the answer. The naive rescan is O(window) per sample, which at a 2ms
 * lookahead is ~96 comparisons on every sample of every channel.
 */
class SlidingMinimum {
  private readonly values: Float64Array;
  /** Positions are stored as float64 so the counter cannot overflow — int32
   *  would wrap after about twelve hours of continuous audio. */
  private readonly positions: Float64Array;
  private readonly capacity: number;
  private readonly window: number;
  private head = 0;
  private tail = 0;
  private pos = 0;

  constructor(window: number) {
    this.window = Math.max(1, Math.round(window));
    this.capacity = this.window + 2;
    this.values = new Float64Array(this.capacity);
    this.positions = new Float64Array(this.capacity);
  }

  reset(): void {
    this.head = 0;
    this.tail = 0;
    this.pos = 0;
  }

  push(v: number): number {
    while (this.tail !== this.head) {
      const back = (this.tail - 1 + this.capacity) % this.capacity;
      if (this.values[back] >= v) this.tail = back;
      else break;
    }
    this.values[this.tail] = v;
    this.positions[this.tail] = this.pos;
    this.tail = (this.tail + 1) % this.capacity;

    while (this.positions[this.head] <= this.pos - this.window) {
      this.head = (this.head + 1) % this.capacity;
    }
    this.pos++;
    return this.values[this.head];
  }
}

export class Limiter {
  private readonly sampleRate: number;
  private readonly lookahead: number;
  private readonly delayLeft: DelayLine;
  private readonly delayRight: DelayLine;
  private readonly slidingMin: SlidingMinimum;
  private ceiling = 1;
  private riseRate = 0;
  private gain = 1;
  private lowestGain = 1;

  /** Filled by process(). Fields rather than a returned tuple: this runs once
   *  per sample and an allocation there is the whole budget. */
  outLeft = 0;
  outRight = 0;

  constructor(sampleRate: number, lookaheadSeconds = DEFAULT_LOOKAHEAD_S) {
    this.sampleRate = sampleRate;
    this.lookahead = Math.max(1, Math.round(lookaheadSeconds * sampleRate));
    this.delayLeft = new DelayLine(this.lookahead + 4);
    this.delayRight = new DelayLine(this.lookahead + 4);
    this.slidingMin = new SlidingMinimum(this.lookahead + 1);
    this.setRelease(DEFAULT_RELEASE_S);
    this.setCeilingDb(0);
  }

  setCeilingDb(db: number): void {
    this.ceiling = dbToGain(Math.min(0, db));
  }

  setRelease(seconds: number): void {
    // How much the gain may climb per sample, as a multiplier. Expressed this
    // way the release is level-independent: recovering 6dB always takes the
    // same time whether the gain fell from 1.0 or from 0.1.
    const s = Math.max(0.001, seconds);
    this.riseRate = Math.pow(10, 1 / (s * this.sampleRate * 2));
  }

  get latencySamples(): number {
    return this.lookahead;
  }

  /** Largest reduction applied since the last reset, in dB (negative). */
  get maxReductionDb(): number {
    return gainToDb(this.lowestGain);
  }

  /** Reduction being applied right now — what a moving meter shows. */
  get currentReductionDb(): number {
    return gainToDb(this.gain);
  }

  reset(): void {
    this.delayLeft.clear();
    this.delayRight.clear();
    this.slidingMin.reset();
    this.gain = 1;
    this.lowestGain = 1;
  }

  process(left: number, right: number): void {
    this.delayLeft.write(left);
    this.delayRight.write(right);

    // Stereo-linked: one gain for both channels. Limiting them separately
    // moves the image toward whichever side is quieter at that instant.
    const magnitude = Math.max(Math.abs(left), Math.abs(right));
    const required = magnitude > this.ceiling ? this.ceiling / magnitude : 1;
    const floor = this.slidingMin.push(required);

    // Up slowly, down immediately. The downward snap is what keeps the
    // promise; because the sliding minimum already sees the peak coming, the
    // snap happens a lookahead early rather than on the peak itself.
    this.gain = Math.min(floor, this.gain * this.riseRate);
    if (this.gain > 1) this.gain = 1;
    if (this.gain < this.lowestGain) this.lowestGain = this.gain;

    // read(d) returns the sample written d-1 steps ago — write() advances the
    // cursor before the read — so a delay of exactly `lookahead` asks for
    // lookahead + 1. Off by one here does not break the ceiling (the sample
    // emitted is still inside the sliding window) but it does make
    // latencySamples a lie, and the chain reports that number to the user.
    this.outLeft = this.delayLeft.read(this.lookahead + 1) * this.gain;
    this.outRight = this.delayRight.read(this.lookahead + 1) * this.gain;
  }
}

/**
 * True peak, estimated by 4x oversampling.
 *
 * A sample-peak reading of -1dBFS can still reconstruct to above 0 in a
 * converter, and that is what clips on playback. This is the standard
 * approximation (BS.1770-4 annex 2 uses 4x): interpolate, then take the peak
 * of the interpolated signal.
 */
export function truePeak(channels: Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const y0 = ch[i];
      if (Math.abs(y0) > peak) peak = Math.abs(y0);
      // Four-point interpolation between this sample and the next three.
      const ym1 = i > 0 ? ch[i - 1] : 0;
      const y1 = i + 1 < ch.length ? ch[i + 1] : 0;
      const y2 = i + 2 < ch.length ? ch[i + 2] : 0;
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        // Catmull-Rom: passes through the samples and approximates the
        // band-limited reconstruction closely enough for a safety margin.
        const v =
          0.5 *
          ((2 * y0) +
            (-ym1 + y1) * t +
            (2 * ym1 - 5 * y0 + 4 * y1 - y2) * t * t +
            (-ym1 + 3 * y0 - 3 * y1 + y2) * t * t * t);
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
  }
  return peak;
}
