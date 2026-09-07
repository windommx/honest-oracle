import { describe, it, expect } from "vitest";
import { Allpass, DelayLine } from "./delay-line";
import { Chorus, Compressor, PlateReverb, Saturator, StereoDelay } from "./effects";

const SR = 48000;

const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / Math.max(1, xs.length));

describe("delay line", () => {
  it("returns what was written, the requested number of samples ago", () => {
    const line = new DelayLine(100);
    for (let i = 0; i < 50; i++) line.write(i);
    expect(line.read(1)).toBe(49);
    expect(line.read(10)).toBe(40);
  });

  it("does not read a negative index in the first samples of playback", () => {
    // The exact crash in the reverb this replaced: `buf[(pos - 3) % len]` is a
    // negative index until three samples have been written.
    const line = new DelayLine(100);
    for (let i = 0; i < 3; i++) {
      expect(() => line.read(50)).not.toThrow();
      expect(Number.isFinite(line.read(50))).toBe(true);
      line.write(1);
    }
  });

  it("reads zero for a delay longer than has been written", () => {
    const line = new DelayLine(100);
    line.write(1);
    expect(line.read(90)).toBe(0);
  });

  it("clamps a delay longer than the buffer instead of wrapping into garbage", () => {
    const line = new DelayLine(64);
    for (let i = 0; i < 64; i++) line.write(i);
    expect(Number.isFinite(line.read(1e9))).toBe(true);
  });

  it("interpolates between samples for a fractional delay", () => {
    const line = new DelayLine(100);
    line.write(0);
    line.write(10);
    line.write(20);
    // 1.5 back from the write head sits between the 10 and the 0.
    expect(line.readInterpolated(1.5)).toBeCloseTo(15, 6);
  });

  it("clear() zeroes the buffer", () => {
    const line = new DelayLine(50);
    for (let i = 0; i < 50; i++) line.write(1);
    line.clear();
    expect(line.read(10)).toBe(0);
  });
});

describe("allpass", () => {
  it("passes broadband energy at roughly unity gain", () => {
    // The defining property: it smears phase without changing the magnitude
    // spectrum, so a reverb built from these diffuses without colouring.
    const ap = new Allpass(97, 0.7);
    const input: number[] = [];
    const output: number[] = [];
    let phase = 0;
    for (let i = 0; i < 20000; i++) {
      // A sweep, so the measurement covers the band rather than one tone.
      phase += (100 + (i / 20000) * 8000) / SR;
      const x = Math.sin(2 * Math.PI * phase);
      input.push(x);
      output.push(ap.tick(x));
    }
    const ratio = rms(output.slice(2000)) / rms(input.slice(2000));
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
  });

  it("stays stable at an extreme gain", () => {
    const ap = new Allpass(13, 5); // clamped internally
    for (let i = 0; i < 10000; i++) expect(Number.isFinite(ap.tick(Math.sin(i)))).toBe(true);
  });
});

describe("saturator", () => {
  it("is transparent at zero amount", () => {
    const sat = new Saturator(SR);
    for (let i = 0; i < 100; i++) {
      const x = Math.sin(i * 0.1);
      expect(sat.tick(x, 0)).toBe(x);
    }
  });

  it("adds harmonics to a pure sine", () => {
    // What saturation is FOR. Measured as energy at the third harmonic, which
    // a clean sine has none of.
    const sat = new Saturator(SR);
    const f = 500;
    const n = 4096;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(sat.tick(Math.sin((2 * Math.PI * f * i) / SR) * 0.8, 0.9));

    const energyAt = (hz: number) => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        re += out[i] * Math.cos((-2 * Math.PI * hz * i) / SR);
        im += out[i] * Math.sin((-2 * Math.PI * hz * i) / SR);
      }
      return (re * re + im * im) / (n * n);
    };
    expect(energyAt(1500)).toBeGreaterThan(energyAt(500) * 0.001);
  });

  it("removes the DC offset it creates", () => {
    const sat = new Saturator(SR);
    let sum = 0;
    const n = SR;
    for (let i = 0; i < n; i++) sum += sat.tick(0.6 + 0.3 * Math.sin((2 * Math.PI * 200 * i) / SR), 0.8);
    expect(Math.abs(sum / n)).toBeLessThan(0.02);
  });

  it("stays bounded on a hot input", () => {
    const sat = new Saturator(SR);
    for (let i = 0; i < 1000; i++) {
      const y = sat.tick(Math.sin(i * 0.3) * 50, 1);
      expect(Math.abs(y)).toBeLessThan(4);
    }
  });
});

describe("chorus", () => {
  it("is a passthrough at zero depth, on both channels", () => {
    const ch = new Chorus(SR);
    for (let i = 0; i < 100; i++) {
      const x = Math.sin(i * 0.1);
      expect(ch.tick(x, 1, 0)).toEqual([x, x]);
    }
  });

  it("produces two different channels from a mono input", () => {
    // The point of the effect: the two taps read opposite sides of the LFO, so
    // the difference between them IS the stereo image.
    const ch = new Chorus(SR);
    let differing = 0;
    for (let i = 0; i < SR; i++) {
      const [l, r] = ch.tick(Math.sin((2 * Math.PI * 300 * i) / SR), 1.2, 0.8);
      if (Math.abs(l - r) > 1e-6) differing++;
    }
    expect(differing).toBeGreaterThan(SR * 0.5);
  });

  it("stays bounded and finite", () => {
    const ch = new Chorus(SR);
    for (let i = 0; i < SR; i++) {
      const [l, r] = ch.tick(Math.sin(i * 0.01), 3, 1);
      expect(Math.abs(l)).toBeLessThan(4);
      expect(Number.isFinite(r)).toBe(true);
    }
  });
});

describe("stereo delay", () => {
  it("repeats the input after the delay time", () => {
    const dly = new StereoDelay(SR);
    const time = 0.1;
    const outs: number[] = [];
    for (let i = 0; i < SR; i++) {
      const x = i === 0 ? 1 : 0; // one impulse
      outs.push(dly.tick(x, x, time, 0.5, 1)[0]);
    }
    const expectedAt = Math.round(time * SR);
    expect(Math.abs(outs[expectedAt])).toBeGreaterThan(0.5);
  });

  it("each repeat is quieter than the last", () => {
    const dly = new StereoDelay(SR);
    const time = 0.05;
    const step = Math.round(time * SR);
    const outs: number[] = [];
    for (let i = 0; i < SR; i++) outs.push(dly.tick(i === 0 ? 1 : 0, 0, time, 0.6, 1)[0]);
    const first = Math.abs(outs[step]);
    const third = Math.abs(outs[step * 3]);
    expect(third).toBeLessThan(first);
  });

  it("cannot run away, even at a feedback of 1", () => {
    // Feedback is clamped below unity; without that, a knob at maximum builds
    // energy forever and the output eventually goes non-finite.
    const dly = new StereoDelay(SR);
    let peak = 0;
    for (let i = 0; i < SR * 3; i++) {
      const [l] = dly.tick(i < 100 ? 1 : 0, 0, 0.05, 1, 1);
      peak = Math.max(peak, Math.abs(l));
      expect(Number.isFinite(l)).toBe(true);
    }
    expect(peak).toBeLessThan(50);
  });

  it("is dry at zero mix", () => {
    const dly = new StereoDelay(SR);
    for (let i = 0; i < 1000; i++) {
      const x = Math.sin(i * 0.1);
      expect(dly.tick(x, x, 0.2, 0.5, 0)[0]).toBeCloseTo(x, 10);
    }
  });
});

describe("compressor", () => {
  it("leaves a quiet signal alone", () => {
    const comp = new Compressor(SR);
    let maxGain = 0;
    for (let i = 0; i < SR; i++) {
      const x = Math.sin((2 * Math.PI * 200 * i) / SR) * 0.01; // ~-40dB
      maxGain = Math.max(maxGain, Math.abs(comp.tick(x, -20, 4, 0) / (x || 1e-9)));
    }
    expect(maxGain).toBeLessThan(1.05);
  });

  it("reduces the gain of a loud signal", () => {
    const comp = new Compressor(SR);
    const out: number[] = [];
    for (let i = 0; i < SR; i++) out.push(comp.tick(Math.sin((2 * Math.PI * 200 * i) / SR) * 0.9, -20, 8, 0));
    expect(rms(out.slice(SR / 2))).toBeLessThan(0.9 * 0.707 * 0.8);
  });

  it("compresses more at a higher ratio", () => {
    const measure = (ratio: number) => {
      const comp = new Compressor(SR);
      const out: number[] = [];
      for (let i = 0; i < SR; i++) out.push(comp.tick(Math.sin((2 * Math.PI * 200 * i) / SR) * 0.9, -20, ratio, 0));
      return rms(out.slice(SR / 2));
    };
    expect(measure(12)).toBeLessThan(measure(2));
  });

  it("applies makeup gain", () => {
    const comp = new Compressor(SR);
    let out = 0;
    for (let i = 0; i < 100; i++) out = comp.tick(0.001, 0, 1, 6);
    expect(out).toBeCloseTo(0.001 * Math.pow(10, 6 / 20), 6);
  });

  it("a ratio below 1 is treated as 1 rather than expanding", () => {
    const comp = new Compressor(SR);
    for (let i = 0; i < 1000; i++) expect(Number.isFinite(comp.tick(0.9, -30, 0.1, 0))).toBe(true);
  });
});

describe("plate reverb", () => {
  it("survives its own first samples", () => {
    // The reverb this replaced indexed a delay line at a negative offset for
    // the first three samples and threw immediately.
    const rev = new PlateReverb(SR);
    for (let i = 0; i < 10; i++) {
      const [l, r] = rev.tick(1, 0.7, 1);
      expect(Number.isFinite(l)).toBe(true);
      expect(Number.isFinite(r)).toBe(true);
    }
  });

  it("produces a tail that outlives the input", () => {
    const rev = new PlateReverb(SR);
    for (let i = 0; i < 100; i++) rev.tick(1, 0.8, 1);
    const tail: number[] = [];
    for (let i = 0; i < SR; i++) tail.push(rev.tick(0, 0.8, 1)[0]);
    expect(rms(tail.slice(SR / 4, SR / 2))).toBeGreaterThan(1e-5);
  });

  it("the tail decays rather than sustaining forever", () => {
    const rev = new PlateReverb(SR);
    for (let i = 0; i < 100; i++) rev.tick(1, 0.9, 1);
    const seg: number[][] = [[], [], []];
    for (let s = 0; s < 3; s++) for (let i = 0; i < SR; i++) seg[s].push(rev.tick(0, 0.9, 1)[0]);
    expect(rms(seg[1])).toBeLessThan(rms(seg[0]));
    expect(rms(seg[2])).toBeLessThan(rms(seg[1]));
  });

  it("a longer decay rings longer", () => {
    const tailEnergy = (decay: number) => {
      const rev = new PlateReverb(SR);
      for (let i = 0; i < 100; i++) rev.tick(1, decay, 1);
      const tail: number[] = [];
      for (let i = 0; i < SR * 2; i++) tail.push(rev.tick(0, decay, 1)[0]);
      return rms(tail.slice(SR));
    };
    expect(tailEnergy(0.95)).toBeGreaterThan(tailEnergy(0.2));
  });

  it("stays finite under sustained input at maximum decay", () => {
    const rev = new PlateReverb(SR);
    let peak = 0;
    for (let i = 0; i < SR * 4; i++) {
      const [l, r] = rev.tick(Math.sin(i * 0.05) * 0.8, 1, 1);
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      expect(Number.isFinite(l) && Number.isFinite(r)).toBe(true);
    }
    expect(peak).toBeLessThan(50);
  });

  it("returns exactly zero when mixed out", () => {
    const rev = new PlateReverb(SR);
    for (let i = 0; i < 100; i++) expect(rev.tick(1, 0.8, 0)).toEqual([0, 0]);
  });

  it("is deterministic", () => {
    const run = () => {
      const rev = new PlateReverb(SR);
      const out: number[] = [];
      for (let i = 0; i < 2000; i++) out.push(rev.tick(Math.sin(i * 0.02), 0.7, 1)[0]);
      return out;
    };
    expect(run()).toEqual(run());
  });
});
