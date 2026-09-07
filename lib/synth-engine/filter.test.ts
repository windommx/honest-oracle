import { describe, it, expect } from "vitest";
import { LadderFilter, SELF_OSCILLATION_K } from "./filter";
import { Oscillator } from "./oscillator";

const SR = 48000;

/** RMS gain the filter applies to a steady sine at `freq`. Warm-up samples are
 *  discarded so the cutoff smoother and the filter states have settled. */
function gainAt(freq: number, cutoff: number, resonance = 0, drive = 1): number {
  const filter = new LadderFilter(SR, cutoff);
  const osc = new Oscillator(SR);
  osc.setFrequency(freq);
  const warm = Math.ceil(SR * 0.05);
  const measure = 4096;
  let inSum = 0;
  let outSum = 0;
  for (let i = 0; i < warm + measure; i++) {
    // Small amplitude keeps the input saturator in its linear region, so this
    // measures the FILTER rather than the tanh().
    const x = osc.tick(0) * 0.1;
    const y = filter.tick(x, cutoff, resonance, drive);
    if (i >= warm) {
      inSum += x * x;
      outSum += y * y;
    }
  }
  return Math.sqrt(outSum / measure) / Math.sqrt(inSum / measure);
}

describe("ladder filter — it actually filters", () => {
  it("passes frequencies well below cutoff", () => {
    expect(gainAt(100, 4000)).toBeGreaterThan(0.7);
  });

  it("attenuates above cutoff, and more the further above", () => {
    const at2x = gainAt(2000, 1000);
    const at4x = gainAt(4000, 1000);
    const at8x = gainAt(8000, 1000);
    expect(at2x).toBeLessThan(0.7);
    expect(at4x).toBeLessThan(at2x);
    expect(at8x).toBeLessThan(at4x);
  });

  it("rolls off at roughly four poles — about 24dB per octave", () => {
    // The defining property of a ladder versus a one- or two-pole filter.
    // Measured an octave apart, well into the stopband.
    const a = gainAt(4000, 500);
    const b = gainAt(8000, 500);
    const dbPerOctave = 20 * Math.log10(a / b);
    expect(dbPerOctave).toBeGreaterThan(18);
    expect(dbPerOctave).toBeLessThan(30);
  });

  it("moving the cutoff moves the corner", () => {
    const lowCut = gainAt(2000, 500);
    const highCut = gainAt(2000, 8000);
    expect(highCut).toBeGreaterThan(lowCut * 3);
  });
});

describe("ladder filter — resonance", () => {
  it("lifts the region around cutoff", () => {
    const flat = gainAt(1000, 1000, 0);
    const resonant = gainAt(1000, 1000, 0.8);
    expect(resonant).toBeGreaterThan(flat);
  });

  it("stays bounded at and beyond self-oscillation", () => {
    // The saturator in the feedback path is what makes this true; a linear
    // biquad at equivalent Q diverges.
    for (const res of [0.9, 1.0, 1.2, 5]) {
      const filter = new LadderFilter(SR, 800);
      const osc = new Oscillator(SR);
      osc.setFrequency(220);
      let peak = 0;
      for (let i = 0; i < SR; i++) {
        const y = filter.tick(osc.tick(2) * 0.5, 800, res, 1);
        peak = Math.max(peak, Math.abs(y));
        expect(Number.isFinite(y), `res ${res} went non-finite at sample ${i}`).toBe(true);
      }
      expect(peak, `res ${res}`).toBeLessThan(20);
    }
  });

  it("resonance is normalised to 0..1 against the ladder's own scale", () => {
    // The range this replaced was a biquad's Q (0–25) multiplied by four into
    // a ladder's feedback gain, so a preset at 18 asked for k=72 — eighteen
    // times past self-oscillation, where every value sounds identical.
    expect(SELF_OSCILLATION_K).toBe(4);

    // The knob's whole travel does something: quarter, half and three-quarter
    // turns are audibly different. On the old 0–25 scale the entire useful
    // range was crushed into the first ~4% of the knob.
    const quarter = gainAt(1000, 1000, 0.25);
    const half = gainAt(1000, 1000, 0.5);
    const threeQuarter = gainAt(1000, 1000, 0.75);
    expect(half).toBeGreaterThan(quarter * 1.1);
    expect(threeQuarter).toBeGreaterThan(half * 1.1);

    // Past the clamp everything is identical, so a preset carrying a stale
    // biquad-scale value (18, 25) lands on the same sound rather than on a
    // different kind of broken.
    expect(gainAt(1000, 1000, 25)).toBe(gainAt(1000, 1000, 100));
  });
});

describe("ladder filter — robustness", () => {
  it("clamps cutoff into a usable band instead of diverging", () => {
    for (const cutoff of [-100, 0, 1, 1e9]) {
      const filter = new LadderFilter(SR, 1000);
      for (let i = 0; i < 1000; i++) {
        const y = filter.tick(Math.sin(i * 0.1), cutoff, 0.5);
        expect(Number.isFinite(y), `cutoff ${cutoff}`).toBe(true);
      }
    }
  });

  it("survives a zero or negative drive", () => {
    const filter = new LadderFilter(SR, 1000);
    for (let i = 0; i < 100; i++) expect(Number.isFinite(filter.tick(0.5, 1000, 0.5, 0))).toBe(true);
  });

  it("reset clears the state — a stolen voice starts clean", () => {
    const filter = new LadderFilter(SR, 1000);
    for (let i = 0; i < 1000; i++) filter.tick(1, 1000, 0.9);
    filter.reset();
    expect(filter.tick(0, 1000, 0.9)).toBeCloseTo(0, 10);
  });

  it("is deterministic", () => {
    const run = () => {
      const f = new LadderFilter(SR, 900);
      const out: number[] = [];
      for (let i = 0; i < 500; i++) out.push(f.tick(Math.sin(i * 0.07), 900, 0.6, 2));
      return out;
    };
    expect(run()).toEqual(run());
  });
});
