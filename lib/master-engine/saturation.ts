// ╔══════════════════════════════════════════════════════════════════╗
// ║  SATURATION — Warmth, and the console models behind it.           ║
// ║                                                                    ║
// ║  Two things here are easy to get wrong and were got wrong in the   ║
// ║  first draft; both are now pinned by tests.                        ║
// ║                                                                    ║
// ║  1. LEVEL. A waveshaper run as shape(drive * x) is louder than its ║
// ║     input by the drive, and "compensating" by dividing by the      ║
// ║     shaper's value at full drive gets it wrong in the other        ║
// ║     direction. The first version was +7dB at full Warmth, so the   ║
// ║     knob was mostly a volume control and would have been A/B'd as  ║
// ║     "sounds better" for that reason alone. The gain is now         ║
// ║     CALIBRATED numerically whenever the knob moves: a -6dBFS sine  ║
// ║     is pushed through the actual curve and the result normalised   ║
// ║     to pass at unity, so what is left is the harmonics.            ║
// ║                                                                    ║
// ║  2. HARMONICS. The four model names each make a claim about which  ║
// ║     harmonics appear. Asymmetric SLOPE (the obvious way to write   ║
// ║     a tube) turned out to be odd-dominant at useful drive, so the  ║
// ║     name was wrong. Even harmonics now come from an explicit       ║
// ║     quadratic bias term, and a test measures the 2nd-to-3rd ratio  ║
// ║     of every model.                                                ║
// ║                                                                    ║
// ║  Harmonics above Nyquist fold back as inharmonic tones, so every   ║
// ║  model runs 4x oversampled behind a 4th-order filter on each side. ║
// ║  A test compares the fold-back against the same curve run without  ║
// ║  oversampling and requires a large difference.                     ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Biquad, lowpass } from "./biquad";
import type { ConsoleModel } from "./types";

/** 4x keeps the 2nd and 3rd harmonics of anything audible below the
 *  oversampled Nyquist. Higher costs more than it removes. */
const OVERSAMPLE = 4;

/**
 * Butterworth Q values for the band-limiting filters — 6th order.
 *
 * Measured, not assumed. The 4th harmonic of a 9kHz tone lands at 36kHz and
 * folds to 12kHz, in the middle of the mix. A single biquad leaves it almost
 * untouched; 4th order removed 10dB of it; 6th order is what got past 12dB in
 * the test, which is the bar this file claims to clear. The filters run at
 * four times the sample rate, so this is 3 sections x 4 phases x 2 (up and
 * down) per channel — affordable for one instance on a master bus, and not
 * something to copy into a per-voice path.
 */
const BUTTERWORTH_6TH = [0.5176, 0.7071, 1.9319];

/** Corner, as a fraction of the base sample rate. Above the audible band and
 *  low enough to be well down by the first fold-back frequency. */
const BAND_LIMIT = 0.42;

/** Drive at Warmth = 1. */
const MAX_DRIVE = 2.2;

/** The level the gain is calibrated at: -6dBFS, a normal mix level. */
const REFERENCE_AMPLITUDE = 0.5;

/** Where the transformer's saturation is weighted. Real transformers saturate
 *  on low frequencies, where the flux swing is largest. */
const TRANSFORMER_BIAS_HZ = 1200;

/** Tape's top-end loss. */
const TAPE_ROLLOFF_HZ = 12000;

/** How much second harmonic the even models generate. */
const TUBE_BIAS = 0.5;
const TRANSFORMER_BIAS = 0.5;

/**
 * Per-model drive trim.
 *
 * Even-dominance is a property of the MODERATE-drive region, not of the curve
 * alone: push any shaper hard enough and the symmetric clipping takes over,
 * and the odd harmonics win whatever bias term is in front of them. Measured
 * on this curve, the 2nd-to-3rd ratio at -6dBFS runs 0.93 at full drive, 1.57
 * at 0.75, 2.59 at 0.55. The even models therefore run at a lower drive than
 * the odd ones, so the name still describes the sound at the top of the knob.
 */
const MODEL_DRIVE_SCALE: Record<ConsoleModel, number> = {
  clean: 1,
  tube: 0.75,
  transformer: 0.75,
  console: 1,
  tape: 1,
};

/**
 * The transfer curve. `biased` is the signal the quadratic term is taken from
 * — the same sample for a tube, a low-passed one for a transformer.
 */
function shape(model: ConsoleModel, x: number, biased: number): number {
  switch (model) {
    case "clean":
      return x;
    case "tube":
      // The quadratic term is what makes the 2nd harmonic; tanh keeps it bounded.
      return Math.tanh(x + TUBE_BIAS * x * x);
    case "transformer":
      return Math.tanh(x + TRANSFORMER_BIAS * biased * biased);
    case "console":
      // Symmetric, so odd harmonics only — the cleanest of the four.
      return Math.tanh(x);
    case "tape":
      // A longer linear region than tanh, then a gradual shoulder: tape stays
      // clean further in and gives way more slowly once it does.
      return x / Math.pow(1 + Math.pow(Math.abs(x), 2.5), 1 / 2.5);
  }
}

class SaturatorChannel {
  private readonly up: Biquad[];
  private readonly down: Biquad[];
  private readonly roll = new Biquad();
  private readonly bias = new Biquad();

  constructor(sampleRate: number) {
    const overRate = sampleRate * OVERSAMPLE;
    const band = BUTTERWORTH_6TH.map((q) => lowpass(sampleRate * BAND_LIMIT, q, overRate));
    this.up = band.map((c) => {
      const f = new Biquad();
      f.setCoefficients(c);
      return f;
    });
    this.down = band.map((c) => {
      const f = new Biquad();
      f.setCoefficients(c);
      return f;
    });
    this.roll.setCoefficients(lowpass(Math.min(TAPE_ROLLOFF_HZ, sampleRate * 0.45), 0.707, sampleRate));
    this.bias.setCoefficients(lowpass(TRANSFORMER_BIAS_HZ, 0.707, overRate));
  }

  reset(): void {
    for (const f of this.up) f.reset();
    for (const f of this.down) f.reset();
    this.roll.reset();
    this.bias.reset();
  }

  tick(x: number, model: ConsoleModel, drive: number, makeup: number): number {
    let y = 0;
    for (let phase = 0; phase < OVERSAMPLE; phase++) {
      // Zero-stuff and filter to interpolate; the x OVERSAMPLE restores the
      // level the inserted zeros removed.
      let up = phase === 0 ? x * OVERSAMPLE : 0;
      for (const f of this.up) up = f.tick(up);
      const driven = up * drive;
      const shaped = shape(model, driven, this.bias.tick(driven));
      let down = shaped;
      for (const f of this.down) down = f.tick(down);
      // Keep phase 0, the sample that lines up with the input.
      if (phase === 0) y = down;
    }
    const out = (y / drive) * makeup;
    return model === "tape" ? this.roll.tick(out) : out;
  }
}

export class ConsoleSaturator {
  private readonly left: SaturatorChannel;
  private readonly right: SaturatorChannel;
  private model: ConsoleModel = "clean";
  private warmth = 0;
  private drive = 1;
  private makeup = 1;

  constructor(sampleRate: number) {
    this.left = new SaturatorChannel(sampleRate);
    this.right = new SaturatorChannel(sampleRate);
  }

  setModel(model: ConsoleModel): void {
    this.model = model;
    this.updateDrive();
  }

  /** `warmth` is 0..1. */
  setWarmth(warmth: number): void {
    this.warmth = Math.min(1, Math.max(0, warmth));
    this.updateDrive();
  }

  private updateDrive(): void {
    this.drive = 1 + this.warmth * (MAX_DRIVE - 1) * MODEL_DRIVE_SCALE[this.model];
    this.recalibrate();
  }

  /**
   * Find the gain that makes a reference-level sine come out at the level it
   * went in. Runs one cycle through the curve — a few hundred operations on a
   * knob move, which buys the guarantee that Warmth is not a volume control.
   */
  private recalibrate(): void {
    this.makeup = 1;
    if (!this.active) return;
    const N = 512;
    let sumIn = 0;
    let sumOut = 0;
    for (let i = 0; i < N; i++) {
      const x = Math.sin((2 * Math.PI * i) / N) * REFERENCE_AMPLITUDE;
      const driven = x * this.drive;
      const y = shape(this.model, driven, driven) / this.drive;
      sumIn += x * x;
      sumOut += y * y;
    }
    this.makeup = sumOut > 0 ? Math.sqrt(sumIn / sumOut) : 1;
  }

  get active(): boolean {
    return this.model !== "clean" && this.drive > 1;
  }

  /** The calibrated gain, exposed so a test can assert it is doing something
   *  and a reader can see what it settled on. */
  get makeupGain(): number {
    return this.makeup;
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }

  tickLeft(x: number): number {
    return this.active ? this.left.tick(x, this.model, this.drive, this.makeup) : x;
  }

  tickRight(x: number): number {
    return this.active ? this.right.tick(x, this.model, this.drive, this.makeup) : x;
  }
}

/** The same curve with no oversampling — exported only so the test can show
 *  what the oversampled path is buying. Never used in the audio path. */
export function shapeWithoutOversampling(model: ConsoleModel, x: number, warmth = 1): number {
  const drive = 1 + warmth * (MAX_DRIVE - 1) * MODEL_DRIVE_SCALE[model];
  const driven = x * drive;
  return shape(model, driven, driven) / drive;
}

/** Models whose curve is symmetric produce odd harmonics only, so the even
 *  aliases simply are not there to remove. The test needs to know which. */
export const EVEN_MODELS: readonly ConsoleModel[] = ["tube", "transformer"];
