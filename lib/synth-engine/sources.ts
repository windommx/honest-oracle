// ╔══════════════════════════════════════════════════════════════════╗
// ║  SOURCES — three ways to make a note that are not an oscillator.  ║
// ║                                                                    ║
// ║  Ported from SynthPro v7, with two defects fixed rather than       ║
// ║  carried over. Each is recorded at the class that had it, because  ║
// ║  "why is this different from the version you ported" is a question ║
// ║  the next reader will actually have.                               ║
// ║                                                                    ║
// ║  All three take a seeded Rng rather than reaching for              ║
// ║  Math.random(): the sources are noise-driven, and a noise-driven   ║
// ║  source that cannot be reproduced cannot be tested at all.         ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { Rng } from "./rng";

const TAU = Math.PI * 2;

// ── Granular ──────────────────────────────────────────────────────────────────

interface Grain {
  /** Oscillator phase, 0..1. */
  phase: number;
  phaseInc: number;
  /** Position through this grain's own window, 0..1. */
  window: number;
  windowInc: number;
  amplitude: number;
}

/** Simultaneous grains. Beyond this a denser cloud stops sounding denser and
 *  only costs more. */
const MAX_GRAINS = 24;

/**
 * Granular synthesis: a cloud of short windowed bursts.
 *
 * ⚠ DIFFERENT FROM THE VERSION THIS WAS PORTED FROM, deliberately. That one
 * summed four copies of a single sine at fixed quarter-cycle phase offsets,
 * each multiplied by a Hann window indexed from the same phase — which is
 * amplitude modulation of one oscillator by a periodic envelope, not granular
 * synthesis. It makes a buzzy tone, and the "density" control only mixed in
 * white noise.
 *
 * Grains here are what the word means: each has its own start time, its own
 * length, and its own detune, so `density` genuinely moves between a sparse
 * stutter and a continuous cloud.
 */
export class GranularOscillator {
  private readonly grains: Grain[] = [];
  private spawnCountdown = 0;
  private frequency = 220;
  private readonly sampleRate: number;
  private readonly rng: Rng;

  constructor(sampleRate: number, rng: Rng) {
    this.sampleRate = sampleRate;
    this.rng = rng;
  }

  setFrequency(hz: number): void {
    this.frequency = Math.max(1, Math.min(hz, this.sampleRate * 0.45));
  }

  reset(): void {
    this.grains.length = 0;
    this.spawnCountdown = 0;
  }

  private spawn(sizeSeconds: number, jitterCents: number): void {
    if (this.grains.length >= MAX_GRAINS) return;
    const detune = jitterCents === 0 ? 0 : this.rng.bipolar() * jitterCents;
    const hz = this.frequency * Math.pow(2, detune / 1200);
    const lengthSamples = Math.max(8, sizeSeconds * this.sampleRate);
    this.grains.push({
      // A random start phase per grain: identical phases would sum into one
      // loud in-phase transient instead of a cloud.
      phase: this.rng.next(),
      phaseInc: hz / this.sampleRate,
      window: 0,
      windowInc: 1 / lengthSamples,
      amplitude: 0.6 + this.rng.next() * 0.4,
    });
  }

  /**
   * @param density grains per second
   * @param sizeSeconds length of each grain
   * @param jitterCents pitch spread between grains
   */
  tick(density: number, sizeSeconds = 0.04, jitterCents = 0): number {
    const rate = Math.max(0.1, density);
    const size = Math.max(0.002, sizeSeconds);

    if (--this.spawnCountdown <= 0) {
      this.spawnCountdown = Math.max(1, Math.round(this.sampleRate / rate));
      this.spawn(size, jitterCents);
    }

    let out = 0;
    for (let i = this.grains.length - 1; i >= 0; i--) {
      const g = this.grains[i];
      // Hann window: starts and ends at exactly zero, so a grain can begin and
      // end mid-waveform without a click.
      const envelope = 0.5 - 0.5 * Math.cos(TAU * g.window);
      out += Math.sin(TAU * g.phase) * envelope * g.amplitude;

      g.phase += g.phaseInc;
      if (g.phase >= 1) g.phase -= 1;
      g.window += g.windowInc;
      if (g.window >= 1) this.grains.splice(i, 1);
    }

    // Overlap factor — how many grains are sounding at once on average.
    // Normalising by its square root keeps the level roughly constant as
    // density changes, because grains at random phase sum incoherently.
    const overlap = Math.max(1, rate * size);
    return out / Math.sqrt(overlap);
  }

  get activeGrains(): number {
    return this.grains.length;
  }
}

// ── Karplus-Strong ────────────────────────────────────────────────────────────

/** Buffer big enough for the lowest note a keyboard will ask for. */
const KS_MAX = 4096;

/**
 * Karplus-Strong plucked string: a burst of noise circulating through a delay
 * line one period long, losing a little on each lap.
 *
 * ⚠ THE VERSION THIS WAS PORTED FROM NEVER DECAYED. Its loop was
 * `(cur + next) * 0.5 * damp + cur * (1 - damp)`, whose coefficients sum to
 * `(1 - 0.5·damp) + 0.5·damp` = exactly 1.0 for every damp value. A comb filter
 * with unity loop gain rings forever: measured over five seconds the level
 * plateaued around 22% of its initial value and stopped falling, and the damp
 * knob changed the five-second level by less than a decibel. The amp envelope
 * hid it, which is why it sounded fine — but the "string" contributed no decay
 * of its own, and the control labelled Damp did almost nothing.
 *
 * Here the loop gain is strictly below 1 and set from a decay TIME, so the
 * string rings for the number of seconds asked for regardless of pitch.
 */
export class KarplusStrong {
  private readonly buffer = new Float64Array(KS_MAX);
  private length = 0;
  private position = 0;
  private brightness = 0.5;
  private loopGain = 0.999;
  private readonly sampleRate: number;
  private readonly rng: Rng;

  constructor(sampleRate: number, rng: Rng) {
    this.sampleRate = sampleRate;
    this.rng = rng;
  }

  /**
   * @param frequency pitch in Hz
   * @param damping 0..1 — 0 is a long bright string, 1 a short dull one
   */
  pluck(frequency: number, damping = 0.3): void {
    const d = Math.min(Math.max(damping, 0), 1);
    const hz = Math.max(this.sampleRate / KS_MAX, Math.min(frequency, this.sampleRate * 0.45));
    this.length = Math.max(2, Math.min(KS_MAX, Math.round(this.sampleRate / hz)));

    // More damping means both a duller string and a shorter one, which is what
    // a single "damp" control on a real instrument does.
    this.brightness = 1 - d * 0.85;
    const decaySeconds = 6 * Math.pow(0.06, d);
    // Gain applied once per LAP of the delay line, not once per sample: a given
    // buffer slot is only rewritten when the read head comes back round to it,
    // every `length` samples. Using a per-sample figure here makes the string
    // decay `length` times too slowly — at 220Hz that is 218x, which reads as
    // "it never stops", the same symptom as the version this replaced.
    this.loopGain = Math.pow(0.001, this.length / Math.max(1, decaySeconds * this.sampleRate));

    for (let i = 0; i < this.length; i++) this.buffer[i] = this.rng.bipolar();
    this.position = 0;
  }

  tick(): number {
    if (this.length < 2) return 0;
    const current = this.buffer[this.position];
    const next = this.buffer[(this.position + 1) % this.length];

    // Two-point average is the string's high-frequency loss; brightness decides
    // how much of it applies. The loop gain then decays everything equally.
    const averaged = (current + next) * 0.5;
    const filtered = (averaged + (current - averaged) * this.brightness) * this.loopGain;

    this.buffer[this.position] = filtered;
    this.position = (this.position + 1) % this.length;
    return filtered;
  }

  /** Silence the string — voice stealing. */
  mute(): void {
    this.length = 0;
  }
}

// ── User wavetable ────────────────────────────────────────────────────────────

/** Points in a drawable table. 128 is enough to draw with and small enough to
 *  send over postMessage on every edit. */
export const USER_TABLE_SIZE = 128;

/**
 * An oscillator that reads a table the user drew.
 *
 * Read with linear interpolation and no band-limiting, so a table with sharp
 * edges will alias at high pitch — which is inherent to the feature, not an
 * oversight: the point is to hear the shape that was drawn. `aliasWarning`
 * exists so the UI can say so rather than leaving the user to wonder.
 */
export class UserWavetable {
  private table = new Float64Array(USER_TABLE_SIZE);
  private phase = 0;
  private inc = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    // A sine until something is drawn, so an empty table is not silence.
    for (let i = 0; i < USER_TABLE_SIZE; i++) {
      this.table[i] = Math.sin((TAU * i) / USER_TABLE_SIZE);
    }
  }

  /** Replace the table. Input of any length is resampled to USER_TABLE_SIZE and
   *  normalised to peak 1, so a faintly-drawn shape is as loud as a bold one. */
  setTable(samples: ArrayLike<number>): void {
    if (samples.length === 0) return;
    const next = new Float64Array(USER_TABLE_SIZE);
    for (let i = 0; i < USER_TABLE_SIZE; i++) {
      const source = (i / USER_TABLE_SIZE) * samples.length;
      const i0 = Math.floor(source) % samples.length;
      const i1 = (i0 + 1) % samples.length;
      const frac = source - Math.floor(source);
      const value = samples[i0] * (1 - frac) + samples[i1] * frac;
      next[i] = Number.isFinite(value) ? value : 0;
    }
    let peak = 0;
    for (let i = 0; i < USER_TABLE_SIZE; i++) peak = Math.max(peak, Math.abs(next[i]));
    if (peak > 1e-6) for (let i = 0; i < USER_TABLE_SIZE; i++) next[i] /= peak;
    this.table = next;
  }

  getTable(): Float64Array {
    return this.table.slice();
  }

  setFrequency(hz: number): void {
    this.inc = Math.max(0, Math.min(hz, this.sampleRate * 0.49)) / this.sampleRate;
  }

  reset(phase = 0): void {
    this.phase = phase - Math.floor(phase);
  }

  /** True once the pitch is high enough that an edge in the table will fold.
   *  The UI uses it to warn rather than to silently change the sound. */
  get aliasWarning(): boolean {
    return this.inc * USER_TABLE_SIZE > 0.5;
  }

  tick(): number {
    const pos = this.phase * USER_TABLE_SIZE;
    const i0 = Math.floor(pos) % USER_TABLE_SIZE;
    const i1 = (i0 + 1) % USER_TABLE_SIZE;
    const frac = pos - Math.floor(pos);
    const out = this.table[i0] * (1 - frac) + this.table[i1] * frac;

    this.phase += this.inc;
    if (this.phase >= 1) this.phase -= 1;
    return out;
  }
}
