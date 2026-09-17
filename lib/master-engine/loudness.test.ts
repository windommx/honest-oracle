import { describe, it, expect } from "vitest";
import {
  ABSOLUTE_GATE_LUFS,
  LOUDNESS_TARGETS,
  LoudnessMeter,
  RELATIVE_GATE_LU,
  integratedLufs,
  kWeightingHighpass,
  kWeightingShelf,
  windowedLufs,
} from "./loudness";

const SR = 48000;

function sine(freq: number, seconds: number, dbfs: number, rate = SR): Float32Array {
  const amp = Math.pow(10, dbfs / 20);
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / rate) * amp;
  return out;
}

describe("K-weighting is the standard's filter", () => {
  // ITU-R BS.1770-4 publishes these coefficients for 48kHz. Deriving them from
  // the analog prototype is what makes 44.1k files measure correctly too, and
  // this is the check that the derivation is right.
  it("reproduces the published 48kHz shelf", () => {
    const c = kWeightingShelf(48000);
    expect(c.b0).toBeCloseTo(1.53512485958697, 9);
    expect(c.b1).toBeCloseTo(-2.69169618940638, 9);
    expect(c.b2).toBeCloseTo(1.19839281085285, 9);
    expect(c.a1).toBeCloseTo(-1.69065929318241, 9);
    expect(c.a2).toBeCloseTo(0.73248077421585, 9);
  });

  it("reproduces the published 48kHz highpass", () => {
    const c = kWeightingHighpass(48000);
    expect(c.b0).toBeCloseTo(1, 9);
    expect(c.b1).toBeCloseTo(-2, 9);
    expect(c.b2).toBeCloseTo(1, 9);
    expect(c.a1).toBeCloseTo(-1.99004745483398, 8);
    expect(c.a2).toBeCloseTo(0.99007225036621, 8);
  });
});

describe("EBU Tech 3341 compliance", () => {
  it("a stereo 1kHz sine at -23dBFS reads -23.0 LUFS", () => {
    // Test case 1 of the standard's own conformance set. If this is off, every
    // number this meter shows is off by the same amount.
    const ch = sine(1000, 20, -23);
    expect(integratedLufs([ch, ch], SR)).toBeCloseTo(-23, 1);
  });

  it("the same at -33dBFS reads -33.0 LUFS", () => {
    const ch = sine(1000, 20, -33);
    expect(integratedLufs([ch, ch], SR)).toBeCloseTo(-33, 1);
  });

  it("holds at 44.1kHz, which is where pasted 48k coefficients go wrong", () => {
    const ch = sine(1000, 20, -23, 44100);
    expect(integratedLufs([ch, ch], 44100)).toBeCloseTo(-23, 1);
  });

  it("a 6dB louder programme reads 6 LU louder", () => {
    const quiet = sine(1000, 10, -30);
    const loud = sine(1000, 10, -24);
    expect(integratedLufs([loud, loud], SR) - integratedLufs([quiet, quiet], SR)).toBeCloseTo(6, 1);
  });

  it("one channel alone is 3 LU quieter than the same signal in both", () => {
    const ch = sine(1000, 10, -23);
    const silence = new Float32Array(ch.length);
    const both = integratedLufs([ch, ch], SR);
    const one = integratedLufs([ch, silence], SR);
    expect(both - one).toBeCloseTo(3.01, 1);
  });
});

describe("gating", () => {
  it("silence between sections does not drag the reading down", () => {
    // The reason the standard gates at all: without it, every track with an
    // intro or an outro measures quieter than it sounds.
    const music = sine(1000, 10, -20);
    const silence = new Float32Array(SR * 20);
    const withSilence = new Float32Array(music.length + silence.length);
    withSilence.set(music, 0);
    const alone = integratedLufs([music, music], SR);
    const padded = integratedLufs([withSilence, withSilence], SR);
    expect(padded).toBeCloseTo(alone, 0);
  });

  it("a quiet passage more than 10 LU down is excluded", () => {
    const loud = sine(1000, 10, -18);
    const quiet = sine(1000, 10, -40);
    const joined = new Float32Array(loud.length + quiet.length);
    joined.set(loud, 0);
    joined.set(quiet, loud.length);
    const result = integratedLufs([joined, joined], SR);
    expect(result).toBeCloseTo(integratedLufs([loud, loud], SR), 0);
    expect(RELATIVE_GATE_LU).toBe(-10);
  });

  it("silence measures as -Infinity rather than an invented floor", () => {
    const silence = new Float32Array(SR * 2);
    expect(integratedLufs([silence, silence], SR)).toBe(-Infinity);
    expect(ABSOLUTE_GATE_LUFS).toBe(-70);
  });

  it("returns -Infinity rather than guessing from a clip shorter than a block", () => {
    const tiny = sine(1000, 0.1, -20);
    expect(integratedLufs([tiny, tiny], SR)).toBe(-Infinity);
  });
});

describe("windowed loudness", () => {
  it("reads the end of the file, which is what a meter shows", () => {
    const n = SR * 6;
    const ch = new Float32Array(n);
    const loud = sine(1000, 3, -14);
    const quiet = sine(1000, 3, -30);
    ch.set(quiet, 0);
    ch.set(loud, quiet.length);
    expect(windowedLufs([ch, ch], SR, 3)).toBeCloseTo(-14, 0);
  });
});

describe("LoudnessMeter — the streaming version agrees with the offline one", () => {
  it("momentary and short-term track the signal", () => {
    const meter = new LoudnessMeter(SR);
    const ch = sine(1000, 5, -20);
    for (let i = 0; i < ch.length; i++) meter.tick(ch[i], ch[i]);
    expect(meter.momentaryLufs).toBeCloseTo(-20, 0);
    expect(meter.shortTermLufs).toBeCloseTo(-20, 0);
  });

  it("momentary follows a change faster than short-term does", () => {
    const meter = new LoudnessMeter(SR);
    const loud = sine(1000, 4, -14);
    for (let i = 0; i < loud.length; i++) meter.tick(loud[i], loud[i]);
    const quiet = sine(1000, 0.5, -34);
    for (let i = 0; i < quiet.length; i++) meter.tick(quiet[i], quiet[i]);
    expect(meter.momentaryLufs).toBeLessThan(meter.shortTermLufs - 3);
  });

  it("starts at -Infinity rather than at 0", () => {
    expect(new LoudnessMeter(SR).momentaryLufs).toBe(-Infinity);
  });

  it("stays accurate over a long run without accumulator drift", () => {
    const meter = new LoudnessMeter(SR);
    const ch = sine(1000, 30, -23);
    for (let i = 0; i < ch.length; i++) meter.tick(ch[i], ch[i]);
    expect(meter.shortTermLufs).toBeCloseTo(-23, 1);
  });
});

describe("delivery targets", () => {
  it("each one names a real loudness and a ceiling", () => {
    for (const t of LOUDNESS_TARGETS) {
      expect(t.lufs).toBeLessThan(0);
      expect(t.ceilingDb).toBeLessThanOrEqual(0);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});
