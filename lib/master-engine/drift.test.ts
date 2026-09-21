import { describe, it, expect } from "vitest";
import { AnalogLife, HISS_CENTRE_HZ, HISS_MAX_DBFS, TapeHiss } from "./drift";
import { DEFAULT_LOOKAHEAD_S, Limiter, truePeak } from "./limiter";
import { allFinite, levelVariation, magnitudeAt, peak, rms } from "@/lib/synth-engine/analysis";
import { dbToGain, gainToDb } from "./types";

const SR = 48000;

function tone(freq: number, seconds: number, amp = 0.5): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR) * amp;
  return out;
}

describe("Analog Life", () => {
  function run(amount: number, input: Float32Array, seed?: number): Float32Array {
    const a = new AnalogLife(SR, seed);
    a.setAmount(amount);
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      a.advance();
      out[i] = a.tickLeft(input[i]);
    }
    return out;
  }

  it("at zero it is a wire, with no latency added", () => {
    const input = tone(440, 0.2);
    const out = run(0, input);
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(input[i]);
    const a = new AnalogLife(SR);
    a.setAmount(0);
    expect(a.latencySamples).toBe(0);
  });

  it("moves the signal when it is on", () => {
    const input = tone(440, 1);
    const out = run(1, input);
    let differences = 0;
    for (let i = SR / 2; i < input.length; i++) if (Math.abs(out[i] - input[i]) > 1e-4) differences++;
    expect(differences).toBeGreaterThan(1000);
  });

  it("is deterministic — the same settings give the same bytes", () => {
    const input = tone(220, 0.5);
    expect(Array.from(run(1, input))).toEqual(Array.from(run(1, input)));
  });

  it("different seeds drift differently", () => {
    const input = tone(220, 0.5);
    expect(Array.from(run(1, input, 1))).not.toEqual(Array.from(run(1, input, 2)));
  });

  it("drifts slowly rather than wobbling audibly", () => {
    // Fast modulation is a vibrato effect; this is meant to be barely there.
    const out = run(1, tone(440, 3));
    expect(levelVariation(out, 256)).toBeLessThan(0.05);
  });

  it("keeps the two channels together", () => {
    // Independent drift per channel swings the stereo image, which is a much
    // more noticeable — and much worse — effect than the one intended.
    const a = new AnalogLife(SR);
    a.setAmount(1);
    const input = tone(330, 0.5);
    const l = new Float32Array(input.length);
    const r = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      a.advance();
      l[i] = a.tickLeft(input[i]);
      r[i] = a.tickRight(input[i]);
    }
    expect(Array.from(l)).toEqual(Array.from(r));
  });

  it("stays sane and finite", () => {
    const out = run(1, tone(60, 1, 0.95));
    expect(allFinite(out)).toBe(true);
    expect(peak(out)).toBeLessThan(1.2);
  });

  it("reports the latency it adds", () => {
    const a = new AnalogLife(SR);
    a.setAmount(1);
    expect(a.latencySamples).toBeGreaterThan(0);
    expect(a.latencySamples).toBeLessThan(SR * 0.01);
  });
});

describe("Tape Hiss", () => {
  function run(amount: number, length = SR): { left: Float32Array; right: Float32Array } {
    const h = new TapeHiss(SR);
    h.setAmount(amount);
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      left[i] = h.tickLeft(0);
      right[i] = h.tickRight(0);
    }
    return { left, right };
  }

  it("at zero it adds exactly nothing", () => {
    const { left } = run(0);
    expect(peak(left)).toBe(0);
  });

  it("lands near the level it advertises", () => {
    const { left } = run(1);
    const db = gainToDb(rms(left));
    expect(db).toBeGreaterThan(HISS_MAX_DBFS - 12);
    expect(db).toBeLessThan(HISS_MAX_DBFS + 3);
  });

  it("is hiss, not rumble — weighted to the top", () => {
    const { left } = run(1);
    expect(magnitudeAt(left, HISS_CENTRE_HZ, SR)).toBeGreaterThan(magnitudeAt(left, 80, SR) * 3);
  });

  it("is not the same in both channels", () => {
    // Identical hiss in both channels collapses to a line in the centre of the
    // image, which sounds like a fault rather than like tape.
    const { left, right } = run(1, 4800);
    expect(Array.from(left)).not.toEqual(Array.from(right));
  });

  it("is deterministic", () => {
    const a = run(0.5, 4800);
    const b = run(0.5, 4800);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
  });

  it("scales with the knob", () => {
    expect(rms(run(1).left)).toBeGreaterThan(rms(run(0.25).left) * 2);
  });
});

describe("Limiter — the promise", () => {
  function run(input: { l: Float32Array; r: Float32Array }, ceilingDb: number) {
    const lim = new Limiter(SR);
    lim.setCeilingDb(ceilingDb);
    const outL = new Float32Array(input.l.length);
    const outR = new Float32Array(input.r.length);
    for (let i = 0; i < input.l.length; i++) {
      lim.process(input.l[i], input.r[i]);
      outL[i] = lim.outLeft;
      outR[i] = lim.outRight;
    }
    return { outL, outR, lim };
  }

  const hot = (amp: number, freq = 100, seconds = 1) => {
    const t = tone(freq, seconds, amp);
    return { l: t, r: t };
  };

  it.each([-0.1, -0.3, -1, -3, -6])("never exceeds a %sdB ceiling", (ceilingDb) => {
    const { outL } = run(hot(4), ceilingDb);
    const ceiling = dbToGain(ceilingDb);
    expect(peak(outL)).toBeLessThanOrEqual(ceiling + 1e-6);
  });

  it("holds the ceiling against a step from silence to four times full scale", () => {
    // The case a feed-forward limiter without lookahead cannot catch: there is
    // no warning at all before the peak arrives.
    const n = SR / 2;
    const l = new Float32Array(n);
    for (let i = n / 2; i < n; i++) l[i] = i % 2 === 0 ? 4 : -4;
    const { outL } = run({ l, r: l }, -1);
    expect(peak(outL)).toBeLessThanOrEqual(dbToGain(-1) + 1e-6);
  });

  it("holds the ceiling on noise, which changes every sample", () => {
    const n = SR;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };
    for (let i = 0; i < n; i++) {
      l[i] = rand() * 3;
      r[i] = rand() * 3;
    }
    const { outL, outR } = run({ l, r }, -0.5);
    expect(Math.max(peak(outL), peak(outR))).toBeLessThanOrEqual(dbToGain(-0.5) + 1e-6);
  });

  it("leaves quiet material completely alone", () => {
    const quiet = hot(0.2);
    const { outL, lim } = run(quiet, -1);
    // Only the lookahead delay, no gain change.
    const delayed = outL.subarray(lim.latencySamples);
    const source = quiet.l.subarray(0, delayed.length);
    for (let i = 0; i < delayed.length; i += 97) expect(delayed[i]).toBeCloseTo(source[i], 6);
    expect(lim.maxReductionDb).toBe(0);
  });

  it("links the two channels so the image does not move", () => {
    const n = SR / 4;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      l[i] = Math.sin((2 * Math.PI * 100 * i) / SR) * 2;
      r[i] = Math.sin((2 * Math.PI * 100 * i) / SR) * 0.4;
    }
    const { outL, outR } = run({ l, r }, -1);
    // The ratio between the channels must survive; a per-channel limiter would
    // pull the loud side down and leave the quiet one, centring the image.
    const before = peak(l) / peak(r);
    const after = peak(outL) / peak(outR);
    expect(after).toBeCloseTo(before, 1);
  });

  it("reports how hard it worked", () => {
    const { lim } = run(hot(4), -1);
    expect(lim.maxReductionDb).toBeLessThan(-10);
  });

  it("recovers rather than staying ducked", () => {
    const n = SR * 2;
    const l = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const loud = i < SR * 0.2;
      l[i] = Math.sin((2 * Math.PI * 100 * i) / SR) * (loud ? 4 : 0.5);
    }
    const { outL } = run({ l, r: l }, -1);
    expect(peak(outL.subarray(SR, n))).toBeCloseTo(0.5, 2);
  });

  it("states its latency", () => {
    const lim = new Limiter(SR);
    expect(lim.latencySamples).toBe(Math.round(DEFAULT_LOOKAHEAD_S * SR));
  });
});

describe("truePeak", () => {
  it("sees what sample peak misses", () => {
    // A sine landing between samples: every sample is below full scale but the
    // reconstructed waveform is not. This is what clips on a listener's DAC
    // after a master that only checked sample peak.
    const n = 4096;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 11999.5 * i) / SR + 0.78) * 0.99;
    expect(truePeak([ch])).toBeGreaterThan(peak(ch));
  });

  it("agrees with sample peak on a slow wave, where there is nothing to miss", () => {
    const ch = tone(50, 0.2, 0.8);
    expect(truePeak([ch])).toBeCloseTo(peak(ch), 2);
  });

  it("is zero for silence", () => {
    expect(truePeak([new Float32Array(1000)])).toBe(0);
  });
});

describe("reset means reset", () => {
  it("Analog Life replays identically after reset", () => {
    // The module header promises the same file mastered twice gives the same
    // bytes. Clearing only the interpolation state looks like a reset and is
    // not — the generator carries on from wherever it had got to. Measured
    // before the fix: 7760 of 8000 samples differed between two passes.
    const a = new AnalogLife(SR);
    a.setAmount(0.8);
    const input = tone(440, 0.2);
    const run = () => {
      const out = new Float32Array(input.length);
      for (let i = 0; i < input.length; i++) {
        a.advance();
        out[i] = a.tickLeft(input[i]);
      }
      return Array.from(out);
    };
    const first = run();
    a.reset();
    expect(run()).toEqual(first);
  });

  it("Tape Hiss keeps the seed it was constructed with", () => {
    // reset() defaulting to the class seed silently moves a caller's chosen
    // noise stream onto a different one, making the constructor argument
    // meaningless after the first reset.
    const h = new TapeHiss(SR, 1234);
    h.setAmount(1);
    const run = () => Array.from({ length: 500 }, () => h.tickLeft(0));
    const first = run();
    h.reset();
    expect(run()).toEqual(first);
  });

  it("an explicit seed still overrides it", () => {
    const h = new TapeHiss(SR, 1234);
    h.setAmount(1);
    const first = Array.from({ length: 200 }, () => h.tickLeft(0));
    h.reset(9999);
    expect(Array.from({ length: 200 }, () => h.tickLeft(0))).not.toEqual(first);
  });
});
