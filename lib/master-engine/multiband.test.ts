import { describe, it, expect } from "vitest";
import {
  BAND_COUNT,
  DEFAULT_BAND,
  DEFAULT_MULTIBAND,
  MultibandCompressor,
  type BandIndex,
  type MultibandSettings,
} from "./multiband";
import { allFinite, magnitudeAt, peak, rms } from "@/lib/synth-engine/analysis";

const SR = 48000;

const settings = (over: Partial<MultibandSettings> = {}): MultibandSettings => ({
  ...DEFAULT_MULTIBAND,
  ...over,
  bands: (over.bands ?? DEFAULT_MULTIBAND.bands).map((b) => ({ ...b })),
});

/** Every band wide open: the crossovers run, nothing compresses. */
const transparent = (over: Partial<MultibandSettings> = {}) =>
  settings({
    enabled: true,
    ...over,
    bands: Array.from({ length: BAND_COUNT }, () => ({ ...DEFAULT_BAND, ratio: 1, thresholdDb: 0 })),
  });

function run(s: MultibandSettings, left: Float32Array, right = left) {
  const mb = new MultibandCompressor(SR);
  mb.setSettings(s);
  const outL = new Float32Array(left.length);
  const outR = new Float32Array(left.length);
  // The hardest each band worked, not where it happened to be at the last
  // sample — reading the instantaneous value after a decaying signal reports
  // zero, because the compressor has released by then.
  const worst = [0, 0, 0];
  for (let i = 0; i < left.length; i++) {
    mb.process(left[i], right[i]);
    outL[i] = mb.outLeft;
    outR[i] = mb.outRight;
    for (let b = 0; b < BAND_COUNT; b++) {
      const r = mb.reductionDb(b as BandIndex);
      if (r < worst[b]) worst[b] = r;
    }
  }
  return { outL, outR, mb, worst };
}

const tone = (hz: number, seconds = 0.5, amp = 0.3) => {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / SR) * amp;
  return out;
};

describe("the crossover sums back to what went in", () => {
  // The whole reason for Linkwitz-Riley. Two ordinary Butterworth filters give
  // each band a -3dB corner and a 90-degree phase difference, so the bands sum
  // to a DIP right at the crossover — where most of a mix's energy is.
  const probes = [40, 80, 120, 200, 400, 1000, 2000, 2500, 3000, 6000, 12000, 16000];

  it.each(probes)("passes %dHz within a tenth of a dB", (hz) => {
    const input = tone(hz, 0.6, 0.3);
    const { outL } = run(transparent(), input);
    // Skip the filters' settling time.
    const from = Math.round(SR * 0.3);
    const before = rms(input.subarray(from));
    const after = rms(outL.subarray(from));
    const db = 20 * Math.log10(after / before);
    expect(db, `${hz}Hz moved ${db.toFixed(3)}dB`).toBeGreaterThan(-0.1);
    expect(db, `${hz}Hz moved ${db.toFixed(3)}dB`).toBeLessThan(0.1);
  });

  it("is flat at the crossover frequencies specifically", () => {
    // The place the naive version is 3dB down.
    for (const hz of [DEFAULT_MULTIBAND.crossoverLowHz, DEFAULT_MULTIBAND.crossoverHighHz]) {
      const input = tone(hz, 0.6, 0.3);
      const { outL } = run(transparent(), input);
      const from = Math.round(SR * 0.3);
      const db = 20 * Math.log10(rms(outL.subarray(from)) / rms(input.subarray(from)));
      expect(db, `crossover at ${hz}Hz moved ${db.toFixed(3)}dB`).toBeCloseTo(0, 1);
    }
  });

  it("keeps a broadband signal intact, not just single tones", () => {
    const n = SR;
    const mix = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      mix[i] =
        Math.sin((2 * Math.PI * 60 * i) / SR) * 0.25 +
        Math.sin((2 * Math.PI * 700 * i) / SR) * 0.2 +
        Math.sin((2 * Math.PI * 5000 * i) / SR) * 0.12;
    }
    const { outL } = run(transparent(), mix);
    const from = Math.round(SR * 0.3);
    for (const hz of [60, 700, 5000]) {
      const db =
        20 *
        Math.log10(magnitudeAt(outL.subarray(from), hz, SR) / magnitudeAt(mix.subarray(from), hz, SR));
      expect(db, `${hz}Hz in the mix moved ${db.toFixed(3)}dB`).toBeCloseTo(0, 1);
    }
  });
});

describe("a band only reacts to its own content", () => {
  it("a loud kick does not pull the top end down", () => {
    // The reason multiband exists: a full-band compressor is controlled by
    // whatever is loudest, and on a mix that is the kick.
    const n = SR;
    const hats = tone(8000, 1, 0.08);
    const withKick = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const kick = Math.exp(-((t * 2) % 1) * 12) * Math.sin(2 * Math.PI * 55 * t) * 0.8;
      withKick[i] = hats[i] + kick;
    }

    const s = settings({
      enabled: true,
      bands: [
        { ...DEFAULT_BAND, thresholdDb: -30, ratio: 8 },
        { ...DEFAULT_BAND, ratio: 1 },
        { ...DEFAULT_BAND, ratio: 1 },
      ],
    });
    const { outL, worst } = run(s, withKick);

    // The low band worked hard...
    expect(worst[0], `low band pulled down ${worst[0].toFixed(1)}dB`).toBeLessThan(-6);
    // ...and the 8kHz content came through at its original level.
    const from = Math.round(SR * 0.4);
    const db =
      20 * Math.log10(magnitudeAt(outL.subarray(from), 8000, SR) / magnitudeAt(withKick.subarray(from), 8000, SR));
    expect(db, `8kHz moved ${db.toFixed(2)}dB while the low band compressed`).toBeGreaterThan(-0.5);
  });

  it("a full-band compressor would NOT manage that", () => {
    // The comparison that makes the previous test mean something: one detector
    // across the whole signal ducks everything together.
    const n = SR;
    const hats = tone(8000, 1, 0.08);
    const withKick = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      withKick[i] = hats[i] + Math.exp(-((t * 2) % 1) * 12) * Math.sin(2 * Math.PI * 55 * t) * 0.8;
    }
    // One band across everything is exactly a full-band compressor.
    const s = settings({
      enabled: true,
      crossoverLowHz: 30,
      crossoverHighHz: 20000,
      bands: [
        { ...DEFAULT_BAND, ratio: 1 },
        { ...DEFAULT_BAND, thresholdDb: -30, ratio: 8 },
        { ...DEFAULT_BAND, ratio: 1 },
      ],
    });
    const { outL } = run(s, withKick);
    const from = Math.round(SR * 0.4);
    const db =
      20 * Math.log10(magnitudeAt(outL.subarray(from), 8000, SR) / magnitudeAt(withKick.subarray(from), 8000, SR));
    expect(db, `full-band moved 8kHz by ${db.toFixed(2)}dB`).toBeLessThan(-1);
  });

  it("each band reports its own reduction", () => {
    const s = settings({
      enabled: true,
      bands: [
        { ...DEFAULT_BAND, thresholdDb: -40, ratio: 6 },
        { ...DEFAULT_BAND, ratio: 1 },
        { ...DEFAULT_BAND, ratio: 1 },
      ],
    });
    const { worst } = run(s, tone(60, 0.5, 0.5));
    expect(worst[0]).toBeLessThan(-3);
    expect(worst[1]).toBe(0);
    expect(worst[2]).toBe(0);
  });
});

describe("controls do what they say", () => {
  it("disabled is a wire", () => {
    const input = tone(500, 0.2, 0.4);
    const { outL } = run(settings({ enabled: false }), input);
    for (let i = 0; i < input.length; i++) expect(outL[i]).toBe(input[i]);
  });

  it("solo leaves only that band audible", () => {
    const n = SR / 2;
    const mix = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      mix[i] = Math.sin((2 * Math.PI * 50 * i) / SR) * 0.3 + Math.sin((2 * Math.PI * 9000 * i) / SR) * 0.3;
    }
    const s = settings({
      enabled: true,
      bands: DEFAULT_MULTIBAND.bands.map((b, i) => ({ ...b, ratio: 1, solo: i === 2 })),
    });
    const { outL } = run(s, mix);
    const from = Math.round(SR * 0.2);
    expect(magnitudeAt(outL.subarray(from), 9000, SR)).toBeGreaterThan(0.05);
    expect(magnitudeAt(outL.subarray(from), 50, SR)).toBeLessThan(0.005);
  });

  it("bypassing a band leaves it uncompressed but still summed", () => {
    const loud = tone(60, 0.5, 0.8);
    const compressing = settings({
      enabled: true,
      bands: [{ ...DEFAULT_BAND, thresholdDb: -40, ratio: 8 }, { ...DEFAULT_BAND }, { ...DEFAULT_BAND }],
    });
    const bypassed = settings({
      enabled: true,
      bands: [
        { ...DEFAULT_BAND, thresholdDb: -40, ratio: 8, bypass: true },
        { ...DEFAULT_BAND },
        { ...DEFAULT_BAND },
      ],
    });
    expect(rms(run(bypassed, loud).outL)).toBeGreaterThan(rms(run(compressing, loud).outL) * 1.5);
  });

  it("make-up gain is applied after the compression", () => {
    const input = tone(60, 0.4, 0.05); // below every threshold
    const plain = settings({ enabled: true, bands: DEFAULT_MULTIBAND.bands.map((b) => ({ ...b, ratio: 1 })) });
    const lifted = settings({
      enabled: true,
      bands: DEFAULT_MULTIBAND.bands.map((b, i) => ({ ...b, ratio: 1, makeupDb: i === 0 ? 6 : 0 })),
    });
    const ratio = rms(run(lifted, input).outL) / rms(run(plain, input).outL);
    expect(20 * Math.log10(ratio)).toBeCloseTo(6, 0);
  });

  it("a higher ratio compresses harder", () => {
    const loud = tone(60, 0.5, 0.8);
    const at = (ratio: number) =>
      rms(
        run(
          settings({
            enabled: true,
            bands: [{ ...DEFAULT_BAND, thresholdDb: -30, ratio }, { ...DEFAULT_BAND }, { ...DEFAULT_BAND }],
          }),
          loud
        ).outL
      );
    expect(at(8)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(1));
  });
});

describe("it survives what a mix throws at it", () => {
  it("stays finite and bounded on hot material", () => {
    const n = SR;
    const hot = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      hot[i] = Math.tanh(Math.sin((2 * Math.PI * 45 * i) / SR) * 4 + Math.sin((2 * Math.PI * 11000 * i) / SR) * 2);
    }
    const { outL } = run(settings({ enabled: true }), hot);
    expect(allFinite(outL)).toBe(true);
    expect(peak(outL)).toBeLessThan(4);
  });

  it("clamps crossovers that would cross over each other", () => {
    const s = settings({ enabled: true, crossoverLowHz: 9000, crossoverHighHz: 200 });
    const { outL } = run(s, tone(1000, 0.3, 0.3));
    expect(allFinite(outL)).toBe(true);
  });

  it("refuses a crossover above Nyquist rather than producing garbage", () => {
    const s = settings({ enabled: true, crossoverHighHz: 40000 });
    const { outL } = run(s, tone(1000, 0.3, 0.3));
    expect(allFinite(outL)).toBe(true);
  });

  it("keeps the two channels independent", () => {
    const left = tone(500, 0.3, 0.4);
    const silence = new Float32Array(left.length);
    const { outR } = run(settings({ enabled: true }), left, silence);
    expect(peak(outR)).toBeLessThan(1e-6);
  });

  it("is deterministic", () => {
    const input = tone(200, 0.3, 0.5);
    const a = Array.from(run(settings({ enabled: true }), input).outL);
    const b = Array.from(run(settings({ enabled: true }), input).outL);
    expect(a).toEqual(b);
  });
});
