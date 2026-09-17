// ╔══════════════════════════════════════════════════════════════════╗
// ║  BIQUAD — the filter under every band of the EQ.                  ║
// ║                                                                    ║
// ║  Robert Bristow-Johnson's cookbook designs, transposed direct      ║
// ║  form II. Nothing exotic; what matters here is the second export.  ║
// ║                                                                    ║
// ║  magnitudeAt() evaluates the transfer function analytically, so    ║
// ║  the curve the UI draws IS the filter's response rather than a     ║
// ║  pretty approximation of it. That distinction is the whole reason  ║
// ║  it exists: an EQ display drawn from a hand-rolled bell shape      ║
// ║  drifts away from the audio as soon as bands overlap or a band     ║
// ║  approaches Nyquist, and the user is then reading a picture that   ║
// ║  is quietly lying. A test sweeps sine tones through the real       ║
// ║  filter and checks the measured gain against this function.        ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Narrowest and widest Q offered. Below ~0.1 a peaking filter spans the whole
 *  spectrum; above ~18 it rings long enough to be heard as a tone. */
export const MIN_Q = 0.1;
export const MAX_Q = 18;

const clampQ = (q: number) => Math.min(MAX_Q, Math.max(MIN_Q, q));

/** Keep the design frequency below Nyquist. At exactly Nyquist the cookbook
 *  formulas divide by zero; just under it they are still well-behaved. */
function clampFrequency(freq: number, sampleRate: number): number {
  return Math.min(sampleRate * 0.4995, Math.max(1, freq));
}

function normalise(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): BiquadCoefficients {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function lowpass(freq: number, q: number, sampleRate: number): BiquadCoefficients {
  const w = (2 * Math.PI * clampFrequency(freq, sampleRate)) / sampleRate;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * clampQ(q));
  return normalise((1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha);
}

export function highpass(freq: number, q: number, sampleRate: number): BiquadCoefficients {
  const w = (2 * Math.PI * clampFrequency(freq, sampleRate)) / sampleRate;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * clampQ(q));
  return normalise((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha);
}

export function bandpass(freq: number, q: number, sampleRate: number): BiquadCoefficients {
  const w = (2 * Math.PI * clampFrequency(freq, sampleRate)) / sampleRate;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * clampQ(q));
  // Constant 0 dB peak gain, so a band split and summed keeps its level.
  return normalise(alpha, 0, -alpha, 1 + alpha, -2 * cw, 1 - alpha);
}

export function peaking(freq: number, gainDb: number, q: number, sampleRate: number): BiquadCoefficients {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * clampFrequency(freq, sampleRate)) / sampleRate;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * clampQ(q));
  return normalise(1 + alpha * A, -2 * cw, 1 - alpha * A, 1 + alpha / A, -2 * cw, 1 - alpha / A);
}

export function lowShelf(freq: number, gainDb: number, slope: number, sampleRate: number): BiquadCoefficients {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * clampFrequency(freq, sampleRate)) / sampleRate;
  const cw = Math.cos(w);
  const s = Math.min(2, Math.max(0.1, slope));
  const beta = Math.sqrt(A) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
  const sw = Math.sin(w);
  return normalise(
    A * (A + 1 - (A - 1) * cw + beta * sw),
    2 * A * (A - 1 - (A + 1) * cw),
    A * (A + 1 - (A - 1) * cw - beta * sw),
    A + 1 + (A - 1) * cw + beta * sw,
    -2 * (A - 1 + (A + 1) * cw),
    A + 1 + (A - 1) * cw - beta * sw
  );
}

export function highShelf(freq: number, gainDb: number, slope: number, sampleRate: number): BiquadCoefficients {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * clampFrequency(freq, sampleRate)) / sampleRate;
  const cw = Math.cos(w);
  const s = Math.min(2, Math.max(0.1, slope));
  const beta = Math.sqrt(A) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
  const sw = Math.sin(w);
  return normalise(
    A * (A + 1 + (A - 1) * cw + beta * sw),
    -2 * A * (A - 1 + (A + 1) * cw),
    A * (A + 1 + (A - 1) * cw - beta * sw),
    A + 1 - (A - 1) * cw + beta * sw,
    2 * (A - 1 - (A + 1) * cw),
    A + 1 - (A - 1) * cw - beta * sw
  );
}

/**
 * The filter's gain at one frequency, computed from its coefficients.
 *
 * This is |H(e^jw)| evaluated directly — the same number a sine sweep through
 * the filter would measure, which is what the test asserts.
 */
export function magnitudeAt(c: BiquadCoefficients, freq: number, sampleRate: number): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const c2w = Math.cos(2 * w);
  const s2w = Math.sin(2 * w);

  const numRe = c.b0 + c.b1 * cw + c.b2 * c2w;
  const numIm = -(c.b1 * sw + c.b2 * s2w);
  const denRe = 1 + c.a1 * cw + c.a2 * c2w;
  const denIm = -(c.a1 * sw + c.a2 * s2w);

  const num = Math.hypot(numRe, numIm);
  const den = Math.hypot(denRe, denIm);
  return den === 0 ? 0 : num / den;
}

export function magnitudeDbAt(c: BiquadCoefficients, freq: number, sampleRate: number): number {
  const m = magnitudeAt(c, freq, sampleRate);
  return m <= 1e-9 ? -180 : 20 * Math.log10(m);
}

/** One biquad section, per channel. */
export class Biquad {
  private c: BiquadCoefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
  private z1 = 0;
  private z2 = 0;

  setCoefficients(c: BiquadCoefficients): void {
    this.c = c;
  }

  get coefficients(): BiquadCoefficients {
    return this.c;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }

  tick(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.c;
    const y = b0 * x + this.z1;
    this.z1 = b1 * x - a1 * y + this.z2;
    this.z2 = b2 * x - a2 * y;
    // Denormals here cost more than the filter itself on some CPUs, and a
    // master chain has dozens of these running on silence between tracks.
    if (Math.abs(this.z1) < 1e-20) this.z1 = 0;
    if (Math.abs(this.z2) < 1e-20) this.z2 = 0;
    return y;
  }
}

/** A stereo pair sharing one set of coefficients — what every EQ band needs. */
export class StereoBiquad {
  private readonly left = new Biquad();
  private readonly right = new Biquad();

  setCoefficients(c: BiquadCoefficients): void {
    this.left.setCoefficients(c);
    this.right.setCoefficients(c);
  }

  get coefficients(): BiquadCoefficients {
    return this.left.coefficients;
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }

  tickLeft(x: number): number {
    return this.left.tick(x);
  }

  tickRight(x: number): number {
    return this.right.tick(x);
  }
}
