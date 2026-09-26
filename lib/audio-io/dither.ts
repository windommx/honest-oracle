// ╔══════════════════════════════════════════════════════════════════╗
// ║  DITHER — the noise you add so the silence is honest.             ║
// ║                                                                    ║
// ║  Rounding a 24-bit or float master to 16 bits is not a rounding    ║
// ║  error. The error is CORRELATED with the signal: on a fade, a      ║
// ║  reverb tail, or a quiet passage, the same waveform produces the   ║
// ║  same rounding pattern every cycle, so the "error" is a distortion ║
// ║  that tracks the music. It is heard as a grainy, gritty edge on    ║
// ║  exactly the quiet parts a master is judged by, and it is why a    ║
// ║  16-bit bounce can sound worse than the 24-bit file it came from   ║
// ║  even though nothing else changed.                                 ║
// ║                                                                    ║
// ║  Adding a small amount of noise BEFORE rounding decorrelates it.   ║
// ║  The error becomes a steady, signal-independent hiss — louder in   ║
// ║  raw numbers, and far less audible, because the ear forgives a     ║
// ║  constant floor and does not forgive something that moves with     ║
// ║  the music.                                                        ║
// ║                                                                    ║
// ║  Two claims here are measured by tests rather than asserted:       ║
// ║  a fade-to-silence sine truncated flat has harmonic distortion     ║
// ║  that dither removes, and noise shaping moves that noise out of    ║
// ║  the 2-5kHz band the ear is most sensitive in.                     ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Rng } from "@/lib/synth-engine/rng";

export const DITHER_MODES = ["none", "tpdf", "shaped"] as const;
export type DitherMode = (typeof DITHER_MODES)[number];

export const DITHER_LABEL: Record<DitherMode, string> = {
  none: "ไม่ใส่ (ตัดตรง ๆ)",
  tpdf: "TPDF — มาตรฐาน",
  shaped: "Noise shaping — ดันเสียงซ่าออกจากย่านที่หูไว",
};

/**
 * Why TPDF rather than a single random number.
 *
 * One uniform random value (RPDF) decorrelates the error's MEAN but not its
 * variance: the noise floor then breathes with the signal, which is the same
 * fault in a quieter form. The sum of two independent uniform values has a
 * triangular distribution, and that is the smallest one whose first AND second
 * moments are both independent of the signal — the standard result, and the
 * reason every converter's dither is TPDF.
 */
const TPDF_PEAK_LSB = 1;

/**
 * Noise-shaping filter.
 *
 * The quantisation error from the previous samples is fed back so the error
 * spectrum is tilted: less energy where the ear is sensitive (roughly 2-5kHz),
 * more where it is not (above 15kHz). The total noise power goes UP; the
 * audible noise goes down, which is the whole trade.
 *
 * These are the classic second-order coefficients — deliberately gentle. The
 * aggressive psychoacoustic curves buy a few more dB of perceived quiet at the
 * cost of a large ultrasonic rise, which is a bad trade for a file that may be
 * re-encoded by a lossy codec that has to spend bits on it.
 */
const SHAPING = [1.6, -0.8];

/**
 * The noise transfer function these coefficients produce: 1 - H(z).
 *
 * The sign matters and is easy to get backwards — the first draft ADDED the
 * feedback, which gives 1 + H(z): +5dB at DC and a DIP at 18kHz, the exact
 * opposite of the point. Subtracting gives |NTF| = 0.10 at 3kHz (-20dB, where
 * the ear is most sensitive) and 2.9 at 18kHz (+9dB, where it is not), which
 * is what the test measures.
 */
const NTF = [1, -SHAPING[0], -SHAPING[1]];

/** Total noise power multiplier of the shaping, as an amplitude ratio. The
 *  shaped floor is LOUDER in total and quieter where it counts; both halves
 *  are reported so the trade is visible. */
const SHAPED_POWER_GAIN = Math.sqrt(NTF.reduce((sum, h) => sum + h * h, 0));

export interface QuantiseOptions {
  bitDepth: 16 | 24;
  mode: DitherMode;
  /** Seeded, so an export is reproducible. Math.random() here would mean the
   *  same master produced different bytes on every save. */
  seed?: number;
}

/**
 * Quantise one channel to an integer depth, returning the integer samples.
 *
 * Kept separate from the WAV writer so it is testable on its own and so the
 * writer stays a pure serialiser.
 */
export function quantiseChannel(
  samples: Float32Array,
  options: QuantiseOptions,
  rng: Rng
): Int32Array {
  const full = options.bitDepth === 16 ? 32767 : 8388607;
  const lsb = 1 / full;
  const out = new Int32Array(samples.length);

  // Error feedback history for the shaped mode.
  let e1 = 0;
  let e2 = 0;

  for (let i = 0; i < samples.length; i++) {
    let x = samples[i];

    if (options.mode === "shaped") {
      // MINUS. Subtracting the fed-back error gives a noise transfer function
      // of 1 - H(z), which is the highpass that moves the noise out of the
      // ear's sensitive band. Adding it gives 1 + H(z) and moves the noise
      // INTO that band — the first draft did exactly that, and the test that
      // measures 3kHz against 18kHz is what caught it.
      x -= (SHAPING[0] * e1 + SHAPING[1] * e2) * lsb;
    }

    let dithered = x;
    if (options.mode !== "none") {
      // Two independent draws: triangular, peak +/- 1 LSB.
      dithered += ((rng.next() - rng.next()) * TPDF_PEAK_LSB) * lsb;
    }

    const clamped = Math.max(-1, Math.min(1, dithered));
    const quantised = Math.round(clamped * full);
    out[i] = Math.max(-full - 1, Math.min(full, quantised));

    if (options.mode === "shaped") {
      // Measured against x — the value BEFORE the dither was added — not
      // against the dithered one. That is what puts the dither inside the
      // feedback loop, and it is the difference between a shaper that works
      // and one that barely does.
      //
      // Against the dithered value, only the rounding error is shaped, and
      // the rounding error is a third of the total noise power: measured,
      // every filter from first to ninth order plateaued at 1.8dB of in-band
      // improvement, however much ultrasonic noise it spent. Inside the loop,
      // this same second-order filter measures 18.4dB quieter across 2-5kHz —
      // matching the -20.1dB its transfer function predicts — for 6.2dB more
      // total noise and +9dB above 15kHz.
      //
      // In LSBs, which is the unit the feedback above multiplies back by
      // `lsb`. Storing it as a fraction of full scale instead makes the term
      // smaller by a factor of `full` and the shaping does nothing at all.
      e2 = e1;
      e1 = out[i] - x * full;
    }
  }

  return out;
}

/** Each channel gets its own generator stream: identical dither in both
 *  channels sums to a mono noise line in the centre of the image, which is
 *  the one way dither can be heard as a fault rather than as a floor. */
export function ditherRngFor(channel: number, seed = 0x5eed): Rng {
  return new Rng((seed + channel * 0x9e37) >>> 0);
}

/**
 * The noise floor a given mode leaves behind, in dBFS RMS.
 *
 * The TOTAL error, not just the dither: what the listener hears is the dither
 * plus the rounding of the dither. For TPDF at +/-1 LSB the standard result is
 * a total variance of 1/4 LSB^2 — the dither's own 2/12 plus the quantiser's
 * 1/12 — so 0.5 LSB RMS, which is -96.3 dBFS at 16 bits. Reporting only the
 * dither's own 0.41 LSB would understate the floor the UI prints by 1.8dB.
 */
export function ditherFloorDbfs(mode: DitherMode, bitDepth: 16 | 24): number {
  if (mode === "none") return -Infinity;
  const full = bitDepth === 16 ? 32767 : 8388607;
  const lsbRms = 0.5 * (1 / full);
  const rms = mode === "shaped" ? lsbRms * SHAPED_POWER_GAIN : lsbRms;
  return 20 * Math.log10(rms);
}

/** How far the shaped mode pulls the noise down where the ear is most
 *  sensitive, in dB. Computed from the same NTF the quantiser runs, so the
 *  number the UI shows cannot drift from the filter. */
export function shapedGainAtDb(hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * hz) / sampleRate;
  let re = 0;
  let im = 0;
  for (let k = 0; k < NTF.length; k++) {
    re += NTF[k] * Math.cos(-k * w);
    im += NTF[k] * Math.sin(-k * w);
  }
  return 20 * Math.log10(Math.hypot(re, im));
}
