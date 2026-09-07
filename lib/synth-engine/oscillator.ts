// ╔══════════════════════════════════════════════════════════════════╗
// ║  OSCILLATOR — PolyBLEP, and a morph that costs nothing.           ║
// ║                                                                    ║
// ║  A naive saw is just `2*phase - 1`. It is also a step function     ║
// ║  sampled at discrete points, so every harmonic above Nyquist folds ║
// ║  back down into the audible band as inharmonic tones that track    ║
// ║  pitch the WRONG WAY — the "digital" edge that makes a cheap synth ║
// ║  sound cheap. PolyBLEP subtracts a polynomial approximation of the ║
// ║  band-limited step around each discontinuity, which removes most   ║
// ║  of that for one multiply-add per sample.                          ║
// ║                                                                    ║
// ║  THE MORPH IS THE INTERESTING PART. The C# original computed the   ║
// ║  morphed shape as a Fourier sum over up to 48 harmonics, PER       ║
// ║  SAMPLE. At 48kHz with 8 unison voices and 2 oscillators across    ║
// ║  16 notes that is ~590 MILLION sin() calls per second — not slow,  ║
// ║  impossible; it would drop out on the first chord.                 ║
// ║                                                                    ║
// ║  Crossfading two already-band-limited signals is itself            ║
// ║  band-limited, so morphing is just a linear blend between the two  ║
// ║  adjacent classic shapes: O(1), no table, and no aliasing          ║
// ║  reintroduced. Same musical result, three orders of magnitude      ║
// ║  cheaper.                                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

/** The four classic shapes, in morph order. `morph` 0→3 walks across them. */
export const WAVE_NAMES = ["sine", "triangle", "sawtooth", "square"] as const;
export type WaveName = (typeof WAVE_NAMES)[number];

const TAU = Math.PI * 2;

/**
 * PolyBLEP residual: the correction to subtract near a step discontinuity.
 * `t` is the phase in [0,1), `dt` the phase increment per sample.
 */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

export class Oscillator {
  private phase = 0;
  private inc = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  setFrequency(hz: number): void {
    // Clamp below Nyquist: a phase increment at or above 0.5 is not an
    // oscillation any more, it is an alias.
    const f = Math.min(Math.max(hz, 0), this.sampleRate * 0.49);
    this.inc = f / this.sampleRate;
  }

  get frequency(): number {
    return this.inc * this.sampleRate;
  }

  /** Reset phase — used on note-on so a percussive attack starts identically
   *  every time (and so tests are reproducible). */
  reset(phase = 0): void {
    this.phase = phase - Math.floor(phase);
  }

  private advance(): void {
    this.phase += this.inc;
    if (this.phase >= 1) this.phase -= 1;
  }

  // ── The four shapes, each band-limited where it needs to be ───────────────

  /** A sine has no discontinuity, so it needs no correction. */
  private sineAt(t: number): number {
    return Math.sin(TAU * t);
  }

  /** A triangle is continuous (its DERIVATIVE steps), so plain evaluation is
   *  already close to band-limited — its harmonics fall off as 1/n². */
  private triangleAt(t: number): number {
    return 4 * Math.abs(t - 0.5) - 1;
  }

  private sawAt(t: number, dt: number): number {
    return 2 * t - 1 - blep(t, dt);
  }

  private squareAt(t: number, dt: number): number {
    const raw = t < 0.5 ? 1 : -1;
    // Two discontinuities per cycle: one at 0, one at the half-way point.
    return raw + blep(t, dt) - blep((t + 0.5) % 1, dt);
  }

  /** Sample one of the four shapes without advancing. */
  private shapeAt(index: number, t: number, dt: number): number {
    switch (index) {
      case 0:
        return this.sineAt(t);
      case 1:
        return this.triangleAt(t);
      case 2:
        return this.sawAt(t, dt);
      default:
        return this.squareAt(t, dt);
    }
  }

  /**
   * One sample at position `morph` along sine → triangle → saw → square.
   * Integer values give the exact classic shape; anything between crossfades
   * the two neighbours.
   */
  tick(morph: number): number {
    const m = Math.min(Math.max(morph, 0), WAVE_NAMES.length - 1);
    const lo = Math.floor(m);
    const frac = m - lo;
    const t = this.phase;
    const dt = this.inc;

    let out: number;
    if (frac === 0) {
      out = this.shapeAt(lo, t, dt);
    } else {
      const a = this.shapeAt(lo, t, dt);
      const b = this.shapeAt(lo + 1, t, dt);
      out = a + (b - a) * frac;
    }

    this.advance();
    return out;
  }
}

/** Index of a named wave, for presets and UI. */
export function waveIndex(name: WaveName): number {
  return WAVE_NAMES.indexOf(name);
}
