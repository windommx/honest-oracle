import { describe, it, expect } from "vitest";
import { MAX_WIDTH, StereoStage, correlation, monoHighHz, monoLowHz, widthFactor } from "./stereo";
import { MONO_HIGH_MAX_HZ, MONO_LOW_MAX_HZ } from "./types";
import { magnitudeAt, rms } from "@/lib/synth-engine/analysis";

const SR = 48000;

/** A signal that exists only in the side channel: L = -R. */
function sideOnly(freq: number, seconds = 0.5, amp = 0.5) {
  const n = Math.round(seconds * SR);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / SR) * amp;
    l[i] = v;
    r[i] = -v;
  }
  return { l, r };
}

function run(
  input: { l: Float32Array; r: Float32Array },
  set: (s: StereoStage) => void
): { l: Float32Array; r: Float32Array } {
  const stage = new StereoStage(SR);
  set(stage);
  const l = new Float32Array(input.l.length);
  const r = new Float32Array(input.r.length);
  for (let i = 0; i < input.l.length; i++) {
    stage.process(input.l[i], input.r[i]);
    l[i] = stage.outLeft;
    r[i] = stage.outRight;
  }
  return { l, r };
}

describe("the mono sum is untouchable", () => {
  it.each([
    ["mono low", (s: StereoStage) => s.setMonoLow(1)],
    ["mono high", (s: StereoStage) => s.setMonoHigh(1)],
    ["narrow", (s: StereoStage) => s.setWidth(0.1)],
    ["wide", (s: StereoStage) => s.setWidth(1)],
    ["everything", (s: StereoStage) => {
      s.setMonoLow(0.7);
      s.setMonoHigh(0.7);
      s.setWidth(0.9);
    }],
  ])("%s leaves L+R identical", (_name, set) => {
    // The safety property the whole file is built around: whatever these
    // controls do in stereo, the phone-speaker version cannot change.
    const n = 4800;
    const inL = new Float32Array(n);
    const inR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      inL[i] = Math.sin((2 * Math.PI * 100 * i) / SR) * 0.4 + Math.sin((2 * Math.PI * 7000 * i) / SR) * 0.2;
      inR[i] = Math.sin((2 * Math.PI * 100 * i) / SR) * 0.4 - Math.sin((2 * Math.PI * 7000 * i) / SR) * 0.2;
    }
    const out = run({ l: inL, r: inR }, set);
    for (let i = 0; i < n; i++) {
      expect(out.l[i] + out.r[i]).toBeCloseTo(inL[i] + inR[i], 6);
    }
  });
});

describe("Mono Low", () => {
  it("folds the bottom to mono", () => {
    const low = sideOnly(60);
    const out = run(low, (s) => s.setMonoLow(1));
    expect(rms(out.l), "60Hz side content should be gone").toBeLessThan(rms(low.l) * 0.25);
  });

  it("leaves the top alone", () => {
    const high = sideOnly(5000);
    const out = run(high, (s) => s.setMonoLow(1));
    expect(rms(out.l)).toBeCloseTo(rms(high.l), 2);
  });

  it("reaches further up as the knob goes up", () => {
    expect(monoLowHz(0)).toBe(0);
    expect(monoLowHz(1)).toBe(MONO_LOW_MAX_HZ);
    expect(monoLowHz(0.5)).toBeLessThan(monoLowHz(1));
  });

  it("at zero it is a wire", () => {
    const input = sideOnly(60);
    const out = run(input, (s) => s.setMonoLow(0));
    for (let i = 0; i < input.l.length; i++) expect(out.l[i]).toBeCloseTo(input.l[i], 6);
  });
});

describe("Mono High", () => {
  it("folds the top to mono", () => {
    const high = sideOnly(14000);
    const out = run(high, (s) => s.setMonoHigh(1));
    expect(rms(out.l)).toBeLessThan(rms(high.l) * 0.25);
  });

  it("leaves the midrange alone", () => {
    const mid = sideOnly(700);
    const out = run(mid, (s) => s.setMonoHigh(1));
    expect(rms(out.l)).toBeCloseTo(rms(mid.l), 2);
  });

  it("reaches further DOWN as the knob goes up", () => {
    expect(monoHighHz(0)).toBe(0);
    expect(monoHighHz(1)).toBeLessThan(monoHighHz(0.5));
    expect(monoHighHz(0.01)).toBeLessThanOrEqual(MONO_HIGH_MAX_HZ);
  });
});

describe("Width", () => {
  it("0.5 is exactly untouched", () => {
    expect(widthFactor(0.5)).toBe(1);
    const input = sideOnly(1000);
    const out = run(input, (s) => s.setWidth(0.5));
    for (let i = 0; i < input.l.length; i++) expect(out.l[i]).toBeCloseTo(input.l[i], 6);
  });

  it("0 collapses to mono", () => {
    expect(widthFactor(0)).toBe(0);
    const input = sideOnly(1000);
    const out = run(input, (s) => s.setWidth(0));
    expect(rms(out.l)).toBeCloseTo(0, 6);
    expect(correlation(out.l, out.r)).toBeCloseTo(1, 5);
  });

  it("1 widens", () => {
    expect(widthFactor(1)).toBe(MAX_WIDTH);
    const input = sideOnly(1000);
    const out = run(input, (s) => s.setWidth(1));
    expect(rms(out.l)).toBeCloseTo(rms(input.l) * MAX_WIDTH, 2);
  });

  it("does not affect a centred signal at any setting", () => {
    const n = 2400;
    const centre = new Float32Array(n);
    for (let i = 0; i < n; i++) centre[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * 0.5;
    for (const knob of [0, 0.25, 0.5, 0.75, 1]) {
      const out = run({ l: centre, r: centre }, (s) => s.setWidth(knob));
      expect(rms(out.l), `width ${knob}`).toBeCloseTo(rms(centre), 5);
    }
  });
});

describe("correlation", () => {
  it("is 1 for mono and -1 for out-of-phase", () => {
    const n = 4800;
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = Math.sin(i / 5);
      b[i] = -a[i];
    }
    expect(correlation(a, a)).toBeCloseTo(1, 6);
    expect(correlation(a, b)).toBeCloseTo(-1, 6);
  });

  it("is near zero for unrelated signals", () => {
    const n = 48000;
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = Math.sin((2 * Math.PI * 300 * i) / SR);
      b[i] = Math.sin((2 * Math.PI * 1100 * i) / SR);
    }
    expect(Math.abs(correlation(a, b))).toBeLessThan(0.05);
  });

  it("calls silence correlated rather than undefined", () => {
    expect(correlation(new Float32Array(100), new Float32Array(100))).toBe(1);
  });
});

describe("the mono maker actually removes the band, not just the level", () => {
  it("60Hz side goes and 3kHz side stays, in the same signal", () => {
    const n = SR;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const low = Math.sin((2 * Math.PI * 60 * i) / SR) * 0.4;
      const high = Math.sin((2 * Math.PI * 3000 * i) / SR) * 0.4;
      l[i] = low + high;
      r[i] = -low - high;
    }
    const sideOf = (o: { l: Float32Array; r: Float32Array }) => {
      const side = new Float32Array(n);
      for (let i = 0; i < n; i++) side[i] = (o.l[i] - o.r[i]) * 0.5;
      return side;
    };
    const before = sideOf(run({ l, r }, (s) => s.setMonoLow(0)));
    const after = sideOf(run({ l, r }, (s) => s.setMonoLow(0.5)));

    const drop = (hz: number) =>
      20 * Math.log10(Math.max(magnitudeAt(after, hz, SR), 1e-9) / magnitudeAt(before, hz, SR));
    expect(drop(60), `60Hz side fell ${drop(60).toFixed(1)}dB`).toBeLessThan(-30);
    expect(drop(3000), `3kHz side moved ${drop(3000).toFixed(1)}dB`).toBeGreaterThan(-0.5);
  });
});
