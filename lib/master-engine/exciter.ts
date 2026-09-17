// ╔══════════════════════════════════════════════════════════════════╗
// ║  EXCITER — brightness made rather than boosted.                   ║
// ║                                                                    ║
// ║  An EQ can only lift what is already in the recording. If the top  ║
// ║  end is simply not there — an old transfer, a dark synth patch —   ║
// ║  boosting it raises the noise floor and nothing else. An exciter   ║
// ║  generates NEW harmonics from the upper-mid content and mixes      ║
// ║  them in above it, so the brightness has a source.                 ║
// ║                                                                    ║
// ║  Even and odd are separate controls because they do different      ║
// ║  things to the ear: x² doubles the frequency (an octave up, which  ║
// ║  reads as sheen), x³ tripples it (an octave and a fifth, which     ║
// ║  reads as edge). A test feeds a 4kHz tone and checks that Even     ║
// ║  puts energy at 8kHz and Odd at 12kHz — which is the whole claim.  ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Biquad, highpass } from "./biquad";

/** Only content above this is excited. Below it, generated harmonics land in
 *  the midrange and read as distortion rather than as air. */
export const EXCITER_CROSSOVER_HZ = 3000;

/** Mix level of generated harmonics at full knob. Deliberately low: this is
 *  the control most likely to be overdone, and it is harsh when it is. */
const EVEN_MAX = 0.35;
const ODD_MAX = 0.3;

class ExciterChannel {
  private readonly band = new Biquad();
  private readonly cleanUp = new Biquad();
  /** Removes the DC that squaring a signal always produces. */
  private dcPrev = 0;
  private dcOut = 0;

  constructor(sampleRate: number) {
    const c = highpass(EXCITER_CROSSOVER_HZ, 0.707, sampleRate);
    this.band.setCoefficients(c);
    this.cleanUp.setCoefficients(highpass(EXCITER_CROSSOVER_HZ * 1.5, 0.707, sampleRate));
  }

  reset(): void {
    this.band.reset();
    this.cleanUp.reset();
    this.dcPrev = 0;
    this.dcOut = 0;
  }

  tick(x: number, even: number, odd: number): number {
    if (even === 0 && odd === 0) return x;
    const b = this.band.tick(x);

    // Exactly x² and x³ — nothing else. The first draft used a half-wave
    // rectified square, which looks like "even harmonics" and is not: it
    // generates the whole series plus a large DC term, so the Even knob put
    // more energy at the third harmonic than the Odd knob did. These two
    // expressions are the entire claim the two controls make, and the test
    // measures them at 2f and 3f.
    const squared = b * b;
    // x² is always positive and so carries DC proportional to the signal's
    // power. Left in, the mix's offset moves with the music, heard as the low
    // end pumping.
    const blocked = squared - this.dcPrev + 0.9995 * this.dcOut;
    this.dcPrev = squared;
    this.dcOut = blocked;

    const cubed = b * b * b;
    const generated = blocked * even * EVEN_MAX + cubed * odd * ODD_MAX;
    // Filter the harmonics again so only the new top end is added, never a
    // duplicate of the band that made them.
    return x + this.cleanUp.tick(generated);
  }
}

export class Exciter {
  private readonly left: ExciterChannel;
  private readonly right: ExciterChannel;
  private even = 0;
  private odd = 0;

  constructor(sampleRate: number) {
    this.left = new ExciterChannel(sampleRate);
    this.right = new ExciterChannel(sampleRate);
  }

  setAmounts(even: number, odd: number): void {
    this.even = Math.min(1, Math.max(0, even));
    this.odd = Math.min(1, Math.max(0, odd));
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }

  tickLeft(x: number): number {
    return this.left.tick(x, this.even, this.odd);
  }

  tickRight(x: number): number {
    return this.right.tick(x, this.even, this.odd);
  }
}
