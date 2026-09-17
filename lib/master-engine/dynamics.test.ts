import { describe, it, expect } from "vitest";
import { CHIRP_BAND_HZ, DeChirp, DeEsser, EnvelopeFollower, PUNCH_MAX_DB, TransientShaper } from "./dynamics";
import { magnitudeAt, peak, rms } from "@/lib/synth-engine/analysis";

const SR = 48000;
const db = (a: number, b: number) => 20 * Math.log10(a / b);

/** A drum-ish hit: instant attack, exponential decay. */
function hits(count: number, spacingS: number, decayS: number, freq = 200): Float32Array {
  const n = Math.round(count * spacingS * SR);
  const out = new Float32Array(n);
  for (let h = 0; h < count; h++) {
    const start = Math.round(h * spacingS * SR);
    for (let i = 0; start + i < n; i++) {
      const t = i / SR;
      const env = Math.exp(-t / decayS);
      if (env < 1e-4) break;
      out[start + i] += Math.sin(2 * Math.PI * freq * t) * env * 0.5;
    }
  }
  return out;
}

const crestFactor = (b: Float32Array) => peak(b) / rms(b);

describe("EnvelopeFollower", () => {
  it("rises at the attack time and falls at the release time", () => {
    const f = new EnvelopeFollower(SR, 0.01, 0.2);
    // One time constant reaches ~63% of the target.
    for (let i = 0; i < SR * 0.01; i++) f.tick(1);
    expect(f.level).toBeCloseTo(0.632, 2);
    for (let i = 0; i < SR * 0.2; i++) f.tick(0);
    expect(f.level).toBeCloseTo(0.632 * 0.368, 2);
  });

  it("treats a zero time as instant rather than dividing by zero", () => {
    const f = new EnvelopeFollower(SR, 0, 0);
    expect(f.tick(0.7)).toBe(0.7);
    expect(f.tick(0)).toBe(0);
  });
});

describe("Punch", () => {
  it("raises transients without raising the sustain", () => {
    // The whole point: a compressor would lower the crest factor, this raises
    // it. If that inverts, the control is mislabelled.
    const source = hits(8, 0.25, 0.08);
    const render = (amount: number) => {
      const s = new TransientShaper(SR);
      s.setAmount(amount);
      const out = new Float32Array(source.length);
      for (let i = 0; i < source.length; i++) out[i] = source[i] * s.gainFor(source[i]);
      return out;
    };
    const off = crestFactor(render(0));
    const on = crestFactor(render(1));
    expect(on, `crest ${off.toFixed(2)} -> ${on.toFixed(2)}`).toBeGreaterThan(off * 1.1);
  });

  it("leaves a steady tone alone — there is no transient to shape", () => {
    const s = new TransientShaper(SR);
    s.setAmount(1);
    let maxLift = 0;
    for (let i = 0; i < SR; i++) {
      const g = s.gainFor(Math.sin((2 * Math.PI * 440 * i) / SR) * 0.4);
      if (i > SR * 0.5) maxLift = Math.max(maxLift, g);
    }
    expect(20 * Math.log10(maxLift)).toBeLessThan(0.5);
  });

  it("at zero it is exactly unity", () => {
    const s = new TransientShaper(SR);
    s.setAmount(0);
    for (let i = 0; i < 1000; i++) expect(s.gainFor(Math.sin(i))).toBe(1);
  });

  it("shapes a quiet passage as much as a loud one", () => {
    // A level-dependent transient shaper stops working as soon as the mix
    // drops, which is exactly where the operator notices.
    const measure = (scale: number) => {
      const s = new TransientShaper(SR);
      s.setAmount(1);
      const src = hits(4, 0.25, 0.08);
      let top = 0;
      for (let i = 0; i < src.length; i++) top = Math.max(top, s.gainFor(src[i] * scale));
      return top;
    };
    expect(measure(0.05)).toBeCloseTo(measure(1), 1);
  });

  it("never lifts more than it says it can", () => {
    const s = new TransientShaper(SR);
    s.setAmount(1);
    const src = hits(6, 0.2, 0.02);
    let top = 0;
    for (let i = 0; i < src.length; i++) top = Math.max(top, s.gainFor(src[i]));
    expect(20 * Math.log10(top)).toBeLessThanOrEqual(PUNCH_MAX_DB + 0.01);
  });
});

describe("De-Esser", () => {
  /** A steady 300Hz tone with a loud 7kHz burst laid over part of it. */
  function withEss(): { signal: Float32Array; essFrom: number; essTo: number } {
    const n = SR;
    const signal = new Float32Array(n);
    const essFrom = Math.round(SR * 0.4);
    const essTo = Math.round(SR * 0.6);
    for (let i = 0; i < n; i++) {
      signal[i] = Math.sin((2 * Math.PI * 300 * i) / SR) * 0.3;
      if (i >= essFrom && i < essTo) signal[i] += Math.sin((2 * Math.PI * 7000 * i) / SR) * 0.45;
    }
    return { signal, essFrom, essTo };
  }

  function run(amount: number, signal: Float32Array): Float32Array {
    const d = new DeEsser(SR);
    d.setAmount(amount);
    const out = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      d.detect(signal[i], signal[i]);
      out[i] = d.tickLeft(signal[i]);
    }
    return out;
  }

  it("pulls the ess down", () => {
    const { signal, essFrom, essTo } = withEss();
    const off = run(0, signal).subarray(essFrom + 2000, essTo);
    const on = run(1, signal).subarray(essFrom + 2000, essTo);
    const before = magnitudeAt(off, 7000, SR);
    const after = magnitudeAt(on, 7000, SR);
    expect(db(after, before), `ess ${db(after, before).toFixed(1)}dB`).toBeLessThan(-4);
  });

  it("leaves the music under the ess alone", () => {
    // The failure mode of a de-esser built as a full-band ducker: the whole
    // mix dips every time a vocalist says an s.
    const { signal, essFrom, essTo } = withEss();
    const off = run(0, signal).subarray(essFrom + 2000, essTo);
    const on = run(1, signal).subarray(essFrom + 2000, essTo);
    expect(db(magnitudeAt(on, 300, SR), magnitudeAt(off, 300, SR))).toBeCloseTo(0, 0);
  });

  it("does nothing to a track with no ess in it", () => {
    const n = SR / 2;
    const clean = new Float32Array(n);
    for (let i = 0; i < n; i++) clean[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * 0.4;
    const out = run(1, clean);
    const tail = out.subarray(n / 2);
    expect(db(magnitudeAt(tail, 440, SR), magnitudeAt(clean.subarray(n / 2), 440, SR))).toBeCloseTo(0, 1);
  });

  it("at zero it is a wire", () => {
    const { signal } = withEss();
    const out = run(0, signal);
    for (let i = 0; i < signal.length; i++) expect(out[i]).toBe(signal[i]);
  });
});

describe("De-Chirp", () => {
  function run(amount: number, signal: Float32Array): Float32Array {
    const d = new DeChirp(SR);
    d.setAmount(amount);
    const out = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      d.detect(signal[i], signal[i]);
      out[i] = d.tickLeft(signal[i]);
    }
    return out;
  }

  it("suppresses short isolated top-end bursts", () => {
    const n = SR * 2;
    const signal = new Float32Array(n);
    const burstAt: number[] = [];
    for (let b = 0; b < 6; b++) burstAt.push(Math.round((0.25 + b * 0.3) * SR));
    for (let i = 0; i < n; i++) signal[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.3;
    for (const start of burstAt) {
      for (let i = 0; i < SR * 0.004 && start + i < n; i++) {
        signal[start + i] += Math.sin((2 * Math.PI * 9000 * i) / SR) * 0.5 * Math.exp(-i / (SR * 0.001));
      }
    }
    const off = run(0, signal);
    const on = run(1, signal);
    // Measure the burst's own frequency, not the window's broadband level —
    // the 220Hz carrier running underneath dominates the RMS and would hide a
    // 9dB cut on the chirp entirely.
    const window = (b: Float32Array, at: number) => b.subarray(at, at + Math.round(SR * 0.004));
    let reduced = 0;
    for (const at of burstAt) {
      const before = magnitudeAt(window(off, at), 9000, SR);
      const after = magnitudeAt(window(on, at), 9000, SR);
      if (db(after, before) < -2) reduced++;
    }
    expect(reduced, `${reduced}/${burstAt.length} bursts pulled down`).toBeGreaterThanOrEqual(5);
  });

  it("leaves sustained top end alone — that is air, not a chirp", () => {
    const n = SR * 2;
    const sustained = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sustained[i] =
        Math.sin((2 * Math.PI * 220 * i) / SR) * 0.3 + Math.sin((2 * Math.PI * 9000 * i) / SR) * 0.25;
    }
    const off = run(0, sustained).subarray(SR);
    const on = run(1, sustained).subarray(SR);
    expect(db(magnitudeAt(on, 9000, SR), magnitudeAt(off, 9000, SR))).toBeGreaterThan(-1);
  });

  it("works above its band and not below it", () => {
    expect(CHIRP_BAND_HZ).toBeGreaterThan(4000);
  });

  it("at zero it is a wire", () => {
    const signal = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) signal[i] = Math.sin(i / 3) * 0.5;
    const out = run(0, signal);
    for (let i = 0; i < 1000; i++) expect(out[i]).toBe(signal[i]);
  });
});
