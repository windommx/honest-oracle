import { describe, it, expect } from "vitest";
import { Oscillator, WAVE_NAMES, waveIndex } from "./oscillator";

const SR = 48000;

/** Render `n` samples at one morph position. */
function render(freq: number, morph: number, n: number, sr = SR): Float64Array {
  const osc = new Oscillator(sr);
  osc.setFrequency(freq);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = osc.tick(morph);
  return out;
}

/** Naive (non-band-limited) saw, for the aliasing comparison. */
function naiveSaw(freq: number, n: number, sr = SR): Float64Array {
  const out = new Float64Array(n);
  let phase = 0;
  const inc = freq / sr;
  for (let i = 0; i < n; i++) {
    out[i] = 2 * phase - 1;
    phase += inc;
    if (phase >= 1) phase -= 1;
  }
  return out;
}

/** Energy at frequencies that are NOT harmonics of `freq` — i.e. aliasing.
 *  Computed with a plain DFT over a window; slow but exact and dependency-free. */
function inharmonicEnergy(sig: Float64Array, freq: number, sr = SR): number {
  const n = sig.length;
  let alias = 0;
  // Walk bins up to Nyquist, skipping those within half a bin of a harmonic.
  for (let k = 1; k < n / 2; k++) {
    const binHz = (k * sr) / n;
    const ratio = binHz / freq;
    const nearHarmonic = Math.abs(ratio - Math.round(ratio)) < 0.03;
    if (nearHarmonic) continue;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); // Hann
      re += sig[i] * w * Math.cos((-2 * Math.PI * k * i) / n);
      im += sig[i] * w * Math.sin((-2 * Math.PI * k * i) / n);
    }
    alias += (re * re + im * im) / (n * n);
  }
  return alias;
}

describe("oscillator — band-limiting is the whole point", () => {
  it("aliases far less than a naive saw at a high pitch", () => {
    // The measurement that justifies PolyBLEP existing. At 2.6kHz a naive saw
    // folds a great deal of energy back into the audible band; the corrected
    // one should be markedly cleaner.
    const freq = 2637; // E7
    const n = 2048;
    const clean = inharmonicEnergy(render(freq, 2, n), freq);
    const naive = inharmonicEnergy(naiveSaw(freq, n), freq);
    expect(clean).toBeLessThan(naive * 0.5);
  });

  it("stays bounded for every shape and morph position", () => {
    for (let morph = 0; morph <= 3; morph += 0.25) {
      const sig = render(440, morph, 1024);
      for (let i = 0; i < sig.length; i++) expect(Math.abs(sig[i])).toBeLessThan(2);
    }
  });
});

describe("oscillator — the classic shapes", () => {
  it("morph 0 is a sine", () => {
    const sig = render(SR / 64, 0, 64); // exactly 64 samples per cycle
    for (let i = 0; i < 64; i++) expect(sig[i]).toBeCloseTo(Math.sin((2 * Math.PI * i) / 64), 6);
  });

  it("morph 1 is a triangle — peaks at the extremes, zero-crossings at the quarters", () => {
    const sig = render(SR / 64, 1, 64);
    expect(sig[0]).toBeCloseTo(1, 6); // |0 - 0.5| * 4 - 1
    expect(sig[16]).toBeCloseTo(0, 6);
    expect(sig[32]).toBeCloseTo(-1, 6);
  });

  it("morph 2 is a rising ramp between its discontinuities", () => {
    const sig = render(SR / 512, 2, 512);
    // Sample well away from the wrap, where the BLEP correction is zero.
    for (let i = 100; i < 400; i++) expect(sig[i]).toBeGreaterThan(sig[i - 1]);
  });

  it("morph 3 is a square — two levels away from its edges", () => {
    const sig = render(SR / 512, 3, 512);
    expect(sig[128]).toBeCloseTo(1, 3);
    expect(sig[384]).toBeCloseTo(-1, 3);
  });
});

describe("morph — a crossfade, not a Fourier sum", () => {
  it("an intermediate morph is exactly the blend of its two neighbours", () => {
    // This is the property that makes the morph O(1): it is a linear
    // interpolation of two band-limited signals, which is itself band-limited.
    const f = SR / 128;
    const tri = render(f, 1, 128);
    const saw = render(f, 2, 128);
    const mid = render(f, 1.5, 128);
    for (let i = 0; i < 128; i++) expect(mid[i]).toBeCloseTo((tri[i] + saw[i]) / 2, 10);
  });

  it("is continuous across the whole morph range", () => {
    // No audible jump as the knob passes a shape boundary.
    const f = SR / 128;
    let prev = render(f, 0, 128);
    for (let m = 0.05; m <= 3; m += 0.05) {
      const cur = render(f, m, 128);
      let maxDelta = 0;
      for (let i = 0; i < 128; i++) maxDelta = Math.max(maxDelta, Math.abs(cur[i] - prev[i]));
      expect(maxDelta, `discontinuity at morph ${m.toFixed(2)}`).toBeLessThan(0.25);
      prev = cur;
    }
  });

  it("clamps out-of-range morph instead of reading past the shape list", () => {
    expect(() => render(440, -5, 64)).not.toThrow();
    expect(() => render(440, 99, 64)).not.toThrow();
    const clamped = render(SR / 64, 99, 64);
    const square = render(SR / 64, 3, 64);
    expect(Array.from(clamped)).toEqual(Array.from(square));
  });
});

describe("oscillator — frequency handling", () => {
  it("is deterministic", () => {
    expect(Array.from(render(440, 2, 256))).toEqual(Array.from(render(440, 2, 256)));
  });

  it("clamps above Nyquist rather than aliasing outright", () => {
    const osc = new Oscillator(SR);
    osc.setFrequency(40000);
    expect(osc.frequency).toBeLessThanOrEqual(SR * 0.49);
  });

  it("refuses a negative frequency", () => {
    const osc = new Oscillator(SR);
    osc.setFrequency(-100);
    expect(osc.frequency).toBe(0);
  });

  it("holds pitch across sample rates", () => {
    // The period between successive rising zero-crossings must be SR/100
    // samples at either rate — measured directly rather than by counting
    // crossings over a window, where the first and last land on the boundary.
    for (const sr of [44100, 48000]) {
      const osc = new Oscillator(sr);
      osc.setFrequency(100);
      const crossings: number[] = [];
      let prev = osc.tick(0);
      for (let i = 1; i < sr && crossings.length < 3; i++) {
        const cur = osc.tick(0);
        if (prev < 0 && cur >= 0) crossings.push(i);
        prev = cur;
      }
      expect(crossings.length, `at ${sr}Hz`).toBe(3);
      expect(crossings[1] - crossings[0], `period at ${sr}Hz`).toBe(sr / 100);
      expect(crossings[2] - crossings[1], `period at ${sr}Hz`).toBe(sr / 100);
    }
  });

  it("waveIndex maps names to morph positions", () => {
    expect(WAVE_NAMES).toEqual(["sine", "triangle", "sawtooth", "square"]);
    expect(waveIndex("sawtooth")).toBe(2);
  });
});
