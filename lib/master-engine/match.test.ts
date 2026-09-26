import { describe, it, expect } from "vitest";
import {
  THIRD_OCTAVE_HZ,
  balanceDelta,
  balanceDistanceDb,
  spectralBalance,
} from "./spectrum";
import { MAX_MATCH_DB, describeMatch, matchToReference } from "./match";
import { EqStage, eqSections, responseDbAt } from "./eq";
import { NEUTRAL, defaultEqBands, type MasterSettings } from "./types";

const SR = 48000;

/** Pink-ish noise, deterministic, so a balance can be measured on it. */
function noise(seconds: number, tilt: (hz: number) => number): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  // Built from a sum of tones on the third-octave grid: the level of each is
  // known exactly, so the expected balance is known exactly too.
  for (const hz of THIRD_OCTAVE_HZ) {
    if (hz >= SR / 2) continue;
    const amp = Math.pow(10, tilt(hz) / 20) * 0.02;
    const phase = (hz * 7919) % (2 * Math.PI);
    for (let i = 0; i < n; i++) out[i] += Math.sin((2 * Math.PI * hz * i) / SR + phase) * amp;
  }
  return out;
}

const flat = () => noise(1.5, () => 0);

describe("spectral balance measures tone, not level", () => {
  it("a flat source reads flat", () => {
    const b = spectralBalance([flat()], SR);
    const usable = b.db.filter((d) => Number.isFinite(d));
    const mean = usable.reduce((a, x) => a + x, 0) / usable.length;
    // Every band within 1dB of the average. The bottom few are the hard ones:
    // a third-octave at 20Hz is 4.6Hz wide, so the analysis block has to be
    // long enough to resolve it.
    THIRD_OCTAVE_HZ.forEach((hz, i) => {
      if (!Number.isFinite(b.db[i])) return;
      expect(Math.abs(b.db[i] - mean), `${hz}Hz read ${(b.db[i] - mean).toFixed(2)}dB off flat`).toBeLessThan(1);
    });
  });

  it("the same tone at half the volume reads the same", () => {
    // Otherwise "matching" a quiet reference would just be a volume change.
    const loud = flat();
    const quiet = Float32Array.from(loud, (v) => v * 0.25);
    const a = spectralBalance([loud], SR);
    const b = spectralBalance([quiet], SR);
    for (let i = 0; i < a.db.length; i++) {
      if (!Number.isFinite(a.db[i])) continue;
      expect(b.db[i]).toBeCloseTo(a.db[i], 1);
    }
  });

  it("a brighter source reads brighter, by about the amount it is", () => {
    const dull = spectralBalance([noise(1.5, (hz) => (hz > 4000 ? -6 : 0))], SR);
    const bright = spectralBalance([flat()], SR);
    const delta = balanceDelta(dull, bright);
    const top = delta.filter((d) => d.hz >= 5000 && d.hz <= 16000 && d.usable);
    const low = delta.filter((d) => d.hz >= 100 && d.hz <= 1000 && d.usable);
    expect(top.length).toBeGreaterThan(3);
    for (const d of top) expect(d.db, `${d.hz}Hz`).toBeGreaterThan(3);
    for (const d of low) expect(Math.abs(d.db), `${d.hz}Hz`).toBeLessThan(2.5);
  });

  it("silence is not a balance", () => {
    const b = spectralBalance([new Float32Array(SR)], SR);
    expect(b.db.every((d) => !Number.isFinite(d))).toBe(true);
  });

  it("a clip shorter than a block is refused rather than guessed at", () => {
    const b = spectralBalance([new Float32Array(100)], SR);
    expect(b.db.every((d) => !Number.isFinite(d))).toBe(true);
  });

  it("distance is zero against itself and grows with difference", () => {
    const a = spectralBalance([flat()], SR);
    const b = spectralBalance([noise(1.5, (hz) => (hz > 4000 ? -6 : 0))], SR);
    expect(balanceDistanceDb(a, a)).toBeCloseTo(0, 5);
    expect(balanceDistanceDb(a, b)).toBeGreaterThan(1);
  });
});

describe("matching fits the EQ the operator can see", () => {
  const subject = spectralBalance([noise(1.5, (hz) => (hz > 4000 ? -8 : 0))], SR);
  const target = spectralBalance([flat()], SR);

  it("moves the master toward the reference", () => {
    // The end-to-end claim: run the fitted EQ over the dull source and the
    // measured distance to the reference goes down.
    const result = matchToReference(subject, target, {
      bands: defaultEqBands(),
      sampleRate: SR,
      strength: 1,
    });

    const settings: MasterSettings = { ...NEUTRAL, eq: result.bands };
    const stage = new EqStage(SR);
    stage.setSettings(settings);
    const dull = noise(1.5, (hz) => (hz > 4000 ? -8 : 0));
    const corrected = new Float32Array(dull.length);
    for (let i = 0; i < dull.length; i++) {
      stage.process(dull[i], dull[i]);
      corrected[i] = stage.outLeft;
    }

    const after = spectralBalance([corrected.subarray(SR / 2)], SR);
    const before = balanceDistanceDb(subject, target);
    const now = balanceDistanceDb(after, target);
    expect(now, `${before.toFixed(2)}dB apart -> ${now.toFixed(2)}dB`).toBeLessThan(before * 0.7);
  });

  it("only moves the gains — the operator's frequencies and kinds survive", () => {
    const bands = defaultEqBands();
    bands[2].freq = 777;
    bands[2].q = 2.5;
    const result = matchToReference(subject, target, { bands, sampleRate: SR });
    expect(result.bands[2].freq).toBe(777);
    expect(result.bands[2].q).toBe(2.5);
    expect(result.bands[0].kind).toBe("lowShelf");
    expect(result.bands[4].kind).toBe("highShelf");
  });

  it("never asks for more than the stated maximum", () => {
    // A reference from another genre asks for 12dB of shelf; obeying it makes
    // a caricature.
    const veryBright = spectralBalance([noise(1.5, (hz) => (hz > 2000 ? 18 : 0))], SR);
    const result = matchToReference(subject, veryBright, {
      bands: defaultEqBands(),
      sampleRate: SR,
      strength: 1,
    });
    for (const b of result.bands) expect(Math.abs(b.gainDb)).toBeLessThanOrEqual(MAX_MATCH_DB + 0.01);
    expect(result.clampedBands.length, "nothing reported as clamped").toBeGreaterThan(0);
  });

  it("applies only the fraction it says it does", () => {
    // Measured as the curve's actual response, not as a sum of gains: the fit
    // is a least-squares over shelves and bells, so halving the target does
    // not halve each gain individually even though it halves the result.
    //
    // A GENTLE difference, deliberately: at full strength an 8dB gap clamps
    // at the +/-6dB ceiling, and a clamped full-strength result is not twice
    // a half-strength one. That is the ceiling working, not the strength
    // control failing, and mixing the two into one test measures neither.
    const gentle = spectralBalance([noise(1.5, (hz) => (hz > 4000 ? -4 : 0))], SR);
    const responseAt = (strength: number, hz: number) => {
      const r = matchToReference(gentle, target, { bands: defaultEqBands(), sampleRate: SR, strength });
      expect(r.clampedBands, `strength ${strength} clamped`).toEqual([]);
      return responseDbAt(eqSections({ ...NEUTRAL, eq: r.bands }, SR), hz, SR);
    };
    const full = responseAt(1, 10000);
    const half = responseAt(0.5, 10000);
    expect(full).toBeGreaterThan(2);
    expect(half / full, `half strength gave ${(half / full).toFixed(2)} of the full curve`).toBeCloseTo(0.5, 1);
  });

  it("does nothing when the two already match", () => {
    const result = matchToReference(target, target, { bands: defaultEqBands(), sampleRate: SR, strength: 1 });
    for (const b of result.bands) expect(Math.abs(b.gainDb)).toBeLessThan(0.5);
  });

  it("reports what it could NOT fit", () => {
    // Five bands cannot follow an arbitrary 31-band difference, and a matcher
    // that reports only its successes is not a measurement.
    const jagged = spectralBalance([noise(1.5, (hz) => (Math.log2(hz) % 2 < 1 ? 6 : -6))], SR);
    const result = matchToReference(subject, jagged, {
      bands: defaultEqBands(),
      sampleRate: SR,
      strength: 1,
    });
    expect(result.residualDb).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const a = matchToReference(subject, target, { bands: defaultEqBands(), sampleRate: SR });
    const b = matchToReference(subject, target, { bands: defaultEqBands(), sampleRate: SR });
    expect(a.bands.map((x) => x.gainDb)).toEqual(b.bands.map((x) => x.gainDb));
  });

  it("produces a curve that is really what the EQ will do", () => {
    // The fit is evaluated through the same biquad designs the audio runs.
    const result = matchToReference(subject, target, {
      bands: defaultEqBands(),
      sampleRate: SR,
      strength: 1,
    });
    const sections = eqSections({ ...NEUTRAL, eq: result.bands }, SR);
    const atTop = responseDbAt(sections, 10000, SR);
    expect(atTop, "the fitted curve does not lift the top end it was asked to").toBeGreaterThan(1);
  });
});

describe("what the UI is allowed to say", () => {
  const subject = spectralBalance([noise(1.5, (hz) => (hz > 4000 ? -8 : 0))], SR);
  const target = spectralBalance([flat()], SR);

  it("names the fraction applied and the residual, not 'matched'", () => {
    const result = matchToReference(subject, target, { bands: defaultEqBands(), sampleRate: SR });
    const text = describeMatch(result, balanceDistanceDb(subject, target));
    expect(text).toContain("50%");
    expect(text).toContain("ยังเหลือ");
    expect(text).not.toContain("ตรงกันแล้ว");
  });

  it("says when bands hit the ceiling", () => {
    const veryBright = spectralBalance([noise(1.5, (hz) => (hz > 2000 ? 18 : 0))], SR);
    const result = matchToReference(subject, veryBright, {
      bands: defaultEqBands(),
      sampleRate: SR,
      strength: 1,
    });
    expect(describeMatch(result, 9)).toContain("ชนเพดาน");
  });
});
