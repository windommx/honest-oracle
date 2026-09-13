// Effects chain. Each is a small class with a `tick`, no shared state, and no
// randomness — so the whole chain is deterministic and snapshot-testable.

import { Allpass, DelayLine } from "./delay-line";

// ── Saturation ────────────────────────────────────────────────────────────────

/**
 * Tube-ish saturation with 2x oversampling and a DC blocker.
 *
 * Waveshaping generates harmonics, and any harmonic pushed above Nyquist folds
 * back as an inharmonic tone — so a distortion applied at the output rate adds
 * exactly the ugliness it is meant to add warmth instead of. Running the shaper
 * at twice the rate moves that fold-back an octave up, where the decimation
 * filter can remove most of it.
 *
 * An asymmetric shaper also introduces DC offset, which eats headroom silently,
 * so a one-pole high-pass removes it on the way out.
 */
export class Saturator {
  private previousInput = 0;
  private dcX = 0;
  private dcY = 0;
  private readonly dcCoeff: number;

  constructor(sampleRate: number) {
    // ~20Hz high-pass: below hearing, above DC.
    this.dcCoeff = 1 - (2 * Math.PI * 20) / sampleRate;
  }

  /** @param amount 0..1 */
  tick(x: number, amount: number): number {
    if (amount <= 0.0001) return x;
    const drive = 1 + amount * 8;

    // Upsample by linear interpolation, shape both, average back down.
    const mid = (x + this.previousInput) * 0.5;
    this.previousInput = x;
    const shaped = (Math.tanh(mid * drive) + Math.tanh(x * drive)) * 0.5;

    // Normalise so turning drive up does not also turn the patch up.
    const normalised = shaped / Math.tanh(drive);

    this.dcY = normalised - this.dcX + this.dcCoeff * this.dcY;
    this.dcX = normalised;
    return this.dcY;
  }

  reset(): void {
    this.previousInput = this.dcX = this.dcY = 0;
  }
}

// ── Chorus ────────────────────────────────────────────────────────────────────

/** A short modulated delay. Two of them out of phase give a stereo image from a
 *  mono source, which is what "width" means on the front panel. */
export class Chorus {
  private readonly line: DelayLine;
  private phase = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.line = new DelayLine(Math.ceil(sampleRate * 0.05));
  }

  /** @returns [left, right] */
  tick(x: number, rateHz: number, depth: number): [number, number] {
    this.line.write(x);
    if (depth <= 0.0001) return [x, x];

    this.phase += Math.max(0.01, rateHz) / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;

    const lfo = Math.sin(2 * Math.PI * this.phase);
    const base = 0.008 * this.sampleRate;
    const swing = depth * 0.004 * this.sampleRate;

    const left = this.line.readInterpolated(base + lfo * swing);
    // The second tap reads the opposite side of the LFO, so the two channels
    // detune in opposite directions — that difference IS the stereo image.
    const right = this.line.readInterpolated(base - lfo * swing);

    const wet = depth * 0.5;
    return [x * (1 - wet * 0.5) + left * wet, x * (1 - wet * 0.5) + right * wet];
  }

  reset(): void {
    this.line.clear();
    this.phase = 0;
  }
}

// ── Delay ─────────────────────────────────────────────────────────────────────

/** Ping-pong delay with a low-pass in the feedback path, so each repeat is
 *  duller than the last — which is what a real echo does, and what stops a long
 *  feedback setting from turning into a pile of hiss. */
export class StereoDelay {
  private readonly left: DelayLine;
  private readonly right: DelayLine;
  private lpL = 0;
  private lpR = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number, maxSeconds = 2) {
    this.sampleRate = sampleRate;
    this.left = new DelayLine(sampleRate * maxSeconds);
    this.right = new DelayLine(sampleRate * maxSeconds);
  }

  tick(inL: number, inR: number, timeSeconds: number, feedback: number, mix: number): [number, number] {
    const d = Math.min(Math.max(timeSeconds, 0.001), this.left.size / this.sampleRate - 0.01) * this.sampleRate;
    const fb = Math.min(Math.max(feedback, 0), 0.95);

    const tapL = this.left.read(d);
    const tapR = this.right.read(d);

    // Damping tracks feedback: the more repeats there will be, the darker each
    // one, so a long tail decays into the background instead of accumulating.
    const cutoff = 3000 + (1 - fb) * 9000;
    const k = Math.min(1, (2 * Math.PI * cutoff) / this.sampleRate);
    this.lpL += (tapL - this.lpL) * k;
    this.lpR += (tapR - this.lpR) * k;

    // Crossed feedback is what makes it ping-pong.
    this.left.write(inL + this.lpR * fb);
    this.right.write(inR + this.lpL * fb);

    const m = Math.min(Math.max(mix, 0), 1);
    return [inL + tapL * m, inR + tapR * m];
  }

  reset(): void {
    this.left.clear();
    this.right.clear();
    this.lpL = this.lpR = 0;
  }
}

// ── Compressor ────────────────────────────────────────────────────────────────

/** Feed-forward compressor with a peak follower. Fast attack, slower release —
 *  the usual asymmetry, because a follower that releases as fast as it attacks
 *  modulates the signal audibly at low frequencies. */
export class Compressor {
  private envelope = 0;
  private readonly attackCoeff: number;
  private readonly releaseCoeff: number;

  constructor(sampleRate: number, attackSeconds = 0.003, releaseSeconds = 0.1) {
    this.attackCoeff = 1 - Math.exp(-1 / (attackSeconds * sampleRate));
    this.releaseCoeff = 1 - Math.exp(-1 / (releaseSeconds * sampleRate));
  }

  /** @param thresholdDb typically -60..0  @param ratio 1..20  @param makeupDb -12..12 */
  tick(x: number, thresholdDb: number, ratio: number, makeupDb: number): number {
    const level = Math.abs(x);
    const coeff = level > this.envelope ? this.attackCoeff : this.releaseCoeff;
    this.envelope += (level - this.envelope) * coeff;

    const envDb = this.envelope > 1e-6 ? 20 * Math.log10(this.envelope) : -120;
    const r = Math.max(1, ratio);
    const over = envDb - thresholdDb;
    const reductionDb = over > 0 ? over * (1 - 1 / r) : 0;

    return x * Math.pow(10, (makeupDb - reductionDb) / 20);
  }

  /** Current gain reduction in dB, for a meter. */
  get reductionDb(): number {
    return this.envelope > 1e-6 ? 20 * Math.log10(this.envelope) : -120;
  }

  reset(): void {
    this.envelope = 0;
  }
}

// ── Plate reverb ──────────────────────────────────────────────────────────────

/**
 * A Dattorro-style plate: diffuse the input through a chain of allpasses, then
 * circulate it around a figure-of-eight tank with damping in the loop.
 *
 * The delay lengths are mutually prime primes on purpose — shared factors make
 * echoes line up into a metallic ring rather than smearing into a wash.
 */
export class PlateReverb {
  private readonly inputDiffusers: Allpass[];
  private readonly tankL: Allpass[];
  private readonly tankR: Allpass[];
  private readonly lineL: DelayLine;
  private readonly lineR: DelayLine;
  private readonly delayL: number;
  private readonly delayR: number;
  private dampL = 0;
  private dampR = 0;
  private feedL = 0;
  private feedR = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    const ms = (m: number) => Math.round((m / 1000) * sampleRate);

    this.inputDiffusers = [
      new Allpass(ms(4.77), 0.75),
      new Allpass(ms(3.59), 0.75),
      new Allpass(ms(12.73), 0.625),
      new Allpass(ms(9.3), 0.625),
    ];
    this.tankL = [new Allpass(ms(22.58), 0.7), new Allpass(ms(60.48), 0.5)];
    this.tankR = [new Allpass(ms(30.51), 0.7), new Allpass(ms(89.24), 0.5)];

    this.delayL = ms(74.5);
    this.delayR = ms(104.6);
    this.lineL = new DelayLine(this.delayL + 2);
    this.lineR = new DelayLine(this.delayR + 2);
  }

  /**
   * @param decay 0..1 — how long the tail rings
   * @param mix   0..1 — wet level; the caller adds this to its dry signal
   * @returns the WET signal only, [left, right]
   */
  tick(x: number, decay: number, mix: number): [number, number] {
    if (mix <= 0.0001) return [0, 0];

    const d = Math.min(Math.max(decay, 0), 1);
    // Kept below 1 so the tank always loses energy: at exactly 1 the loop gain
    // reaches unity and the tail never ends.
    const feedbackGain = 0.3 + d * 0.68;

    let diffused = x;
    for (const ap of this.inputDiffusers) diffused = ap.tick(diffused);

    // Damping: a longer decay means a darker tail, as air absorption does.
    const cutoff = 2000 + (1 - d) * 8000;
    const k = Math.min(1, (2 * Math.PI * cutoff) / this.sampleRate);

    // Left half of the figure-of-eight takes the right half's output, and back.
    let l = this.tankL[0].tick(diffused + this.feedR * feedbackGain);
    this.lineL.write(l);
    l = this.lineL.read(this.delayL);
    this.dampL += (l - this.dampL) * k;
    l = this.tankL[1].tick(this.dampL);
    this.feedL = l * feedbackGain;

    let r = this.tankR[0].tick(diffused + this.feedL * feedbackGain);
    this.lineR.write(r);
    r = this.lineR.read(this.delayR);
    this.dampR += (r - this.dampR) * k;
    r = this.tankR[1].tick(this.dampR);
    this.feedR = r * feedbackGain;

    return [l * mix, r * mix];
  }

  reset(): void {
    for (const ap of [...this.inputDiffusers, ...this.tankL, ...this.tankR]) ap.clear();
    this.lineL.clear();
    this.lineR.clear();
    this.dampL = this.dampR = this.feedL = this.feedR = 0;
  }
}

// ── Phaser ────────────────────────────────────────────────────────────────────

/** Allpass stages. Six gives three notches, the classic sound. */
const PHASER_STAGES = 6;

/**
 * A sweeping comb of notches, made by summing the signal with a phase-shifted
 * copy of itself. The notches are where the two cancel.
 *
 * ⚠ THE FEEDBACK CONTROL IN THE VERSION THIS WAS PORTED FROM WAS A VOLUME KNOB.
 * Its return was `x + out * depth * 0.5 + x * fb * 0.3` — the `fb` term scales
 * the DRY signal, so turning "feedback" up made the patch louder and left the
 * notches exactly where they were. Real phaser feedback routes the allpass
 * chain's OUTPUT back into its input, which is what sharpens the notches into
 * the resonant whistle the control is reached for.
 */
export class Phaser {
  private readonly state = new Float64Array(PHASER_STAGES);
  private phase = 0;
  private feedbackSample = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * @param rate  LFO speed in Hz
   * @param depth 0..1 wet amount
   * @param feedback 0..1 — resonance, clamped below unity
   */
  tick(x: number, rate: number, depth: number, feedback = 0): number {
    if (depth <= 0.001) return x;

    this.phase += Math.max(0.01, rate) / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;

    // The sweep is exponential in frequency because pitch is: a linear sweep
    // spends most of its time in the top octave and lurches through the rest.
    const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * this.phase);
    const centre = 200 * Math.pow(40, lfo);

    const fb = Math.min(Math.max(feedback, 0), 0.95);
    let out = x + this.feedbackSample * fb;

    for (let i = 0; i < PHASER_STAGES; i++) {
      // Stages spread around the centre so the notches are not all stacked.
      const hz = Math.min(centre * (1 + i * 0.35), this.sampleRate * 0.45);
      const t = Math.tan((Math.PI * hz) / this.sampleRate);
      const c = (t - 1) / (t + 1);
      const v = c * out + this.state[i];
      this.state[i] = out - c * v;
      out = v;
    }

    this.feedbackSample = out;
    return x + out * depth;
  }

  reset(): void {
    this.state.fill(0);
    this.phase = 0;
    this.feedbackSample = 0;
  }
}

// ── Flanger ───────────────────────────────────────────────────────────────────

/**
 * A very short modulated delay fed back on itself. The difference from a
 * chorus is only the delay length — a few milliseconds instead of tens — which
 * puts the comb's teeth inside the audible band and makes the jet-plane sweep.
 */
export class Flanger {
  private readonly line: DelayLine;
  private phase = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.line = new DelayLine(Math.ceil(sampleRate * 0.03));
  }

  tick(x: number, rate: number, depth: number, feedback = 0): number {
    if (depth <= 0.001) {
      this.line.write(x);
      return x;
    }

    this.phase += Math.max(0.01, rate) / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;

    const lfo = Math.sin(2 * Math.PI * this.phase);
    const base = (0.001 + depth * 0.004) * this.sampleRate;
    const swing = lfo * depth * 0.002 * this.sampleRate;
    const delayed = this.line.readInterpolated(Math.max(1, base + swing));

    // Clamped below unity: a flanger's feedback path has no loss of its own, so
    // a knob at 1 builds energy until the output goes non-finite.
    const fb = Math.min(Math.max(feedback, 0), 0.92);
    this.line.write(x + delayed * fb);

    return x + delayed * depth;
  }

  reset(): void {
    this.line.clear();
    this.phase = 0;
  }
}

// ── Bit crusher ───────────────────────────────────────────────────────────────

/**
 * Quantise the amplitude, and hold each sample for several output samples.
 *
 * Two separate degradations that are usually conflated: fewer bits adds
 * quantisation noise, a lower sample rate folds everything above the new
 * Nyquist back down. Both are what an early digital sampler sounded like.
 */
export class BitCrusher {
  private held = 0;
  private countdown = 0;
  private primed = false;

  /**
   * @param bits 1..16
   * @param rateDivisor 1 = untouched; 8 = one sample in eight
   */
  tick(x: number, bits: number, rateDivisor: number): number {
    const b = Math.min(Math.max(bits, 1), 16);
    const div = Math.max(1, Math.round(rateDivisor));
    if (b >= 16 && div === 1) {
      this.held = x;
      this.primed = true;
      return x;
    }

    // Prime on the first sample: otherwise the effect opens with a burst of
    // silence up to `div` samples long, which is audible as a gap.
    if (--this.countdown <= 0 || !this.primed) {
      this.countdown = div;
      this.primed = true;
      const levels = Math.pow(2, b - 1);
      this.held = Math.round(x * levels) / levels;
    }
    return this.held;
  }

  reset(): void {
    this.held = 0;
    this.countdown = 0;
    this.primed = false;
  }
}
