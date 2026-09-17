import { describe, it, expect } from "vitest";
import {
  Biquad,
  MAX_Q,
  MIN_Q,
  StereoBiquad,
  bandpass,
  highShelf,
  highpass,
  lowShelf,
  lowpass,
  magnitudeAt,
  magnitudeDbAt,
  peaking,
} from "./biquad";

const SR = 48000;

/**
 * Push a sine through the filter and measure the gain it actually applied.
 *
 * RMS rather than peak. A sampled sine almost never lands a sample on its
 * crest, so peak measurement under-reads by up to 20*log10(cos(pi*f/fs)) —
 * at 4kHz on a 48k rate that is 0.3dB, and since the filter shifts phase the
 * error does not cancel between input and output. It looks exactly like a
 * filter design bug and is not one. RMS over many cycles has no such error.
 */
function measuredGainDb(coeffs: ReturnType<typeof peaking>, freq: number, sampleRate = SR): number {
  const f = new Biquad();
  f.setCoefficients(coeffs);
  const settle = Math.round(sampleRate * 0.5);
  const measure = Math.round(sampleRate * 0.5);
  let sumIn = 0;
  let sumOut = 0;
  for (let i = 0; i < settle + measure; i++) {
    const x = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    const y = f.tick(x);
    if (i >= settle) {
      sumIn += x * x;
      sumOut += y * y;
    }
  }
  return 10 * Math.log10(sumOut / sumIn);
}

describe("the drawn curve is the filter", () => {
  // The claim the UI makes by drawing a curve over the spectrum is that the
  // curve is what the audio gets. These check it against real samples.
  const cases = [
    { name: "peaking +6dB at 1kHz", c: peaking(1000, 6, 1, SR), probes: [200, 700, 1000, 1400, 5000] },
    { name: "peaking -9dB at 300Hz", c: peaking(300, -9, 2, SR), probes: [120, 300, 600, 2000] },
    { name: "low shelf +4dB at 120Hz", c: lowShelf(120, 4, 0.7, SR), probes: [40, 120, 400, 4000] },
    { name: "high shelf -5dB at 6kHz", c: highShelf(6000, -5, 0.7, SR), probes: [500, 3000, 6000, 12000] },
    { name: "highpass 80Hz", c: highpass(80, 0.707, SR), probes: [40, 80, 200, 1000] },
    { name: "lowpass 8kHz", c: lowpass(8000, 0.707, SR), probes: [500, 4000, 8000, 14000] },
  ];

  for (const { name, c, probes } of cases) {
    it(`${name} measures what magnitudeAt predicts`, () => {
      for (const f of probes) {
        const predicted = magnitudeDbAt(c, f, SR);
        const measured = measuredGainDb(c, f);
        expect(measured, `${name} at ${f}Hz: drawn ${predicted.toFixed(2)}dB, measured ${measured.toFixed(2)}dB`)
          .toBeCloseTo(predicted, 2);
      }
    });
  }
});

describe("filter designs", () => {
  it("a peaking band hits its gain exactly at its centre", () => {
    for (const gain of [-12, -6, -3, 3, 6, 12]) {
      expect(magnitudeDbAt(peaking(1000, gain, 1, SR), 1000, SR)).toBeCloseTo(gain, 5);
    }
  });

  it("a peaking band at 0dB is a straight wire", () => {
    const c = peaking(1000, 0, 1, SR);
    for (const f of [50, 500, 1000, 5000, 15000]) {
      expect(magnitudeDbAt(c, f, SR)).toBeCloseTo(0, 6);
    }
  });

  it("a shelf reaches its full gain well past the corner", () => {
    expect(magnitudeDbAt(lowShelf(200, 6, 0.7, SR), 20, SR)).toBeCloseTo(6, 0);
    expect(magnitudeDbAt(highShelf(2000, 6, 0.7, SR), 18000, SR)).toBeCloseTo(6, 0);
  });

  it("a shelf leaves the far side alone", () => {
    expect(magnitudeDbAt(lowShelf(100, 8, 0.7, SR), 10000, SR)).toBeCloseTo(0, 1);
    expect(magnitudeDbAt(highShelf(9000, 8, 0.7, SR), 60, SR)).toBeCloseTo(0, 1);
  });

  it("a cut is -3dB at its corner", () => {
    expect(magnitudeDbAt(highpass(100, Math.SQRT1_2, SR), 100, SR)).toBeCloseTo(-3, 0);
    expect(magnitudeDbAt(lowpass(5000, Math.SQRT1_2, SR), 5000, SR)).toBeCloseTo(-3, 0);
  });

  it("a bandpass peaks at unity so a split band can be summed back", () => {
    expect(magnitudeDbAt(bandpass(1000, 1, SR), 1000, SR)).toBeCloseTo(0, 5);
  });

  it("higher Q is narrower", () => {
    const wide = peaking(1000, 12, 0.5, SR);
    const narrow = peaking(1000, 12, 8, SR);
    expect(magnitudeDbAt(wide, 500, SR)).toBeGreaterThan(magnitudeDbAt(narrow, 500, SR));
    expect(magnitudeDbAt(wide, 1000, SR)).toBeCloseTo(magnitudeDbAt(narrow, 1000, SR), 4);
  });
});

describe("edge cases that crash naive implementations", () => {
  it("survives a band asked for above Nyquist", () => {
    const c = peaking(40000, 6, 1, SR);
    expect(Number.isFinite(c.b0)).toBe(true);
    expect(Number.isFinite(magnitudeAt(c, 1000, SR))).toBe(true);
  });

  it("survives a band at DC", () => {
    const c = highpass(0, 1, SR);
    expect(Number.isFinite(c.b0)).toBe(true);
  });

  it("clamps Q rather than dividing by zero", () => {
    expect(Number.isFinite(peaking(1000, 6, 0, SR).b0)).toBe(true);
    expect(Number.isFinite(peaking(1000, 6, 1e9, SR).b0)).toBe(true);
    expect(MIN_Q).toBeGreaterThan(0);
    expect(MAX_Q).toBeGreaterThan(MIN_Q);
  });

  it("stays finite over a long run of loud input", () => {
    const f = new Biquad();
    f.setCoefficients(peaking(100, 12, 12, SR));
    let last = 0;
    for (let i = 0; i < SR * 5; i++) last = f.tick(Math.sin((2 * Math.PI * 100 * i) / SR) * 0.99);
    expect(Number.isFinite(last)).toBe(true);
  });

  it("flushes denormals so silence costs nothing", () => {
    const f = new Biquad();
    f.setCoefficients(lowpass(200, 0.707, SR));
    f.tick(1);
    for (let i = 0; i < 20000; i++) f.tick(0);
    // Not just small — exactly zero, which is what makes the CPU stop caring.
    expect(f.tick(0)).toBe(0);
  });
});

describe("StereoBiquad", () => {
  it("keeps the two channels independent", () => {
    const s = new StereoBiquad();
    s.setCoefficients(lowpass(500, 0.707, SR));
    // Only the left channel is fed; the right must stay silent.
    for (let i = 0; i < 100; i++) s.tickLeft(1);
    expect(s.tickRight(0)).toBe(0);
  });

  it("applies the same curve to both", () => {
    const s = new StereoBiquad();
    s.setCoefficients(peaking(1000, 6, 1, SR));
    const l: number[] = [];
    const r: number[] = [];
    for (let i = 0; i < 500; i++) {
      const x = Math.sin((2 * Math.PI * 1000 * i) / SR);
      l.push(s.tickLeft(x));
      r.push(s.tickRight(x));
    }
    expect(l).toEqual(r);
  });

  it("reset clears the tails", () => {
    const s = new StereoBiquad();
    s.setCoefficients(lowpass(300, 0.707, SR));
    for (let i = 0; i < 100; i++) s.tickLeft(1);
    s.reset();
    expect(s.tickLeft(0)).toBe(0);
  });
});
