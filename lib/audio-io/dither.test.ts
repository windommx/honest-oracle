import { describe, it, expect } from "vitest";
import {
  DITHER_MODES,
  ditherFloorDbfs,
  ditherRngFor,
  quantiseChannel,
  shapedGainAtDb,
  type DitherMode,
} from "./dither";
import { encodeWav, decodeWav } from "./wav";
import { magnitudeAt, rms } from "@/lib/synth-engine/analysis";

const SR = 48000;

/**
 * A STEADY low-level sine — the signal that exposes undithered truncation.
 *
 * At this level the waveform crosses the same few quantisation steps every
 * cycle, so the rounding error repeats at the signal's own period and appears
 * as harmonics of it rather than as noise. A fade shows the same thing to the
 * ear and is useless to measure: the level moves through the analysis window
 * and smears the harmonics across it.
 */
function quietSine(freq: number, seconds: number, dbfs: number): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const amp = Math.pow(10, dbfs / 20);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR) * amp;
  return out;
}

const fadingSine = (freq: number, seconds: number, startDb: number, endDb: number): Float32Array => {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const db = startDb + (endDb - startDb) * (i / n);
    out[i] = Math.sin((2 * Math.PI * freq * i) / SR) * Math.pow(10, db / 20);
  }
  return out;
};

/**
 * Power in a band, averaged over many bins.
 *
 * A single DFT bin of random noise is a chi-squared estimator with two degrees
 * of freedom — swings of several dB are normal — so comparing two noise
 * spectra one bin at a time says nothing at all.
 */
function bandDb(signal: Float32Array, lowHz: number, highHz: number): number {
  let sum = 0;
  let count = 0;
  const step = (highHz - lowHz) / 60;
  for (let f = lowHz; f <= highHz; f += step) {
    const m = magnitudeAt(signal, f, SR);
    sum += m * m;
    count++;
  }
  return 10 * Math.log10(sum / count);
}

const toFloat = (ints: Int32Array, full: number) => {
  const out = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] / full;
  return out;
};

const quantise = (input: Float32Array, mode: DitherMode, bitDepth: 16 | 24 = 16) =>
  toFloat(quantiseChannel(input, { bitDepth, mode }, ditherRngFor(0)), bitDepth === 16 ? 32767 : 8388607);

describe("dither removes distortion that tracks the signal", () => {
  const source = quietSine(1000, 1, -80);
  const errorOf = (mode: DitherMode) => {
    const q = quantise(source, mode);
    const e = new Float32Array(source.length);
    for (let i = 0; i < source.length; i++) e[i] = q[i] - source[i];
    return e.subarray(Math.round(e.length * 0.2));
  };

  it("undithered rounding puts harmonics of the tone into the error", () => {
    // The claim the whole module rests on, measured rather than asserted:
    // the error of a truncated quiet tone is not noise, it is that tone's
    // own harmonic series.
    const e = errorOf("none");
    const third = magnitudeAt(e, 3000, SR);
    const fifth = magnitudeAt(e, 5000, SR);
    const floor = rms(e);
    expect(third, `3f ${third.toExponential(2)} vs floor ${floor.toExponential(2)}`).toBeGreaterThan(floor / 20);
    expect(fifth).toBeGreaterThan(floor / 20);
  });

  it("TPDF dither decorrelates it", () => {
    const flat = errorOf("none");
    const tpdf = errorOf("tpdf");
    for (const hz of [3000, 5000]) {
      const before = magnitudeAt(flat, hz, SR);
      const after = magnitudeAt(tpdf, hz, SR);
      expect(after, `${hz}Hz: ${before.toExponential(2)} -> ${after.toExponential(2)}`).toBeLessThan(before / 4);
    }
  });

  it("and costs a little more total noise, which is the trade", () => {
    const fade = fadingSine(1000, 1, -60, -90);
    const errorRms = (mode: DitherMode) => {
      const q = quantise(fade, mode);
      let sum = 0;
      for (let i = 0; i < fade.length; i++) sum += (q[i] - fade[i]) ** 2;
      return Math.sqrt(sum / fade.length);
    };
    expect(errorRms("tpdf")).toBeGreaterThan(errorRms("none"));
  });
});

describe("noise shaping moves the noise, it does not remove it", () => {
  const silence = new Float32Array(SR);
  const tpdf = quantise(silence, "tpdf");
  const shaped = quantise(silence, "shaped");

  it("is much quieter across the band the ear is most sensitive in", () => {
    // Measured at 18.4dB with the dither inside the feedback loop. Outside it
    // — the obvious way to write the loop — every filter from first to ninth
    // order plateaued at 1.8dB, because only the rounding error is shaped and
    // that is a third of the noise power.
    const gain = bandDb(shaped, 2000, 5000) - bandDb(tpdf, 2000, 5000);
    expect(gain, `2-5kHz moved ${gain.toFixed(1)}dB`).toBeLessThan(-12);
  });

  it("and louder where it is not, which is where it went", () => {
    const gain = bandDb(shaped, 15000, 20000) - bandDb(tpdf, 15000, 20000);
    expect(gain, `15-20kHz moved ${gain.toFixed(1)}dB`).toBeGreaterThan(5);
  });

  it("matches the transfer function it is derived from", () => {
    // If the loop and the number the UI prints ever disagree, one of them is
    // lying about the other.
    expect(shapedGainAtDb(3000, SR)).toBeLessThan(-15);
    expect(shapedGainAtDb(18000, SR)).toBeGreaterThan(5);
  });

  it("raises the total noise power — the honest half of the trade", () => {
    expect(rms(shaped)).toBeGreaterThan(rms(tpdf));
  });

  it("stays bounded — a runaway error feedback loop would be a loud fault", () => {
    for (const source of [quietSine(60, 0.5, -1), quietSine(9000, 0.5, -0.1), fadingSine(1000, 0.5, 0, -120)]) {
      const q = quantise(source, "shaped");
      for (let i = 0; i < q.length; i++) {
        expect(Math.abs(q[i]), `sample ${i} ran away`).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});

describe("the export stays reproducible", () => {
  it("the same master dithered twice gives the same bytes", () => {
    const source = fadingSine(440, 0.5, -20, -70);
    const a = encodeWav([source, source], SR, 16, "tpdf");
    const b = encodeWav([source, source], SR, 16, "tpdf");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("a different seed gives different noise", () => {
    const source = fadingSine(440, 0.3, -60, -80);
    const a = encodeWav([source], SR, 16, "tpdf", 1);
    const b = encodeWav([source], SR, 16, "tpdf", 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("the two channels do not share a noise stream", () => {
    // Identical dither in both channels sums to a mono line in the centre of
    // the image — the one way dither is heard as a fault rather than a floor.
    const silence = new Float32Array(4096);
    const decoded = decodeWav(encodeWav([silence, silence], SR, 16, "tpdf"));
    expect(Array.from(decoded.channels[0])).not.toEqual(Array.from(decoded.channels[1]));
  });

  it("mode 'none' is byte-identical to what the encoder wrote before", () => {
    // Every existing caller and test depends on this.
    const source = fadingSine(300, 0.2, -6, -6);
    const withNone = encodeWav([source, source], SR, 16, "none");
    const bare = encodeWav([source, source], SR, 16);
    expect(Array.from(withNone)).toEqual(Array.from(bare));
  });

  it("32-bit float ignores dither — there is nothing to quantise to", () => {
    const source = fadingSine(300, 0.1, -20, -60);
    const a = encodeWav([source], SR, 32, "shaped");
    const b = encodeWav([source], SR, 32, "none");
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("the stated noise floor", () => {
  it("matches what the dither actually produces", () => {
    // The UI prints this number, so it has to be the real one — including the
    // quantiser's own contribution, not just the dither's.
    const silence = new Float32Array(SR);
    for (const bitDepth of [16, 24] as const) {
      for (const mode of ["tpdf", "shaped"] as DitherMode[]) {
        const measured = 20 * Math.log10(rms(quantise(silence, mode, bitDepth)));
        expect(measured, `${bitDepth}-bit ${mode}`).toBeCloseTo(ditherFloorDbfs(mode, bitDepth), 0);
      }
    }
  });

  it("is -Infinity when nothing is added", () => {
    expect(ditherFloorDbfs("none", 16)).toBe(-Infinity);
  });

  it("is quieter at 24 bits than at 16", () => {
    expect(ditherFloorDbfs("tpdf", 24)).toBeLessThan(ditherFloorDbfs("tpdf", 16) - 40);
  });

  it("every mode is offered with a label", () => {
    expect(DITHER_MODES).toContain("none");
    expect(DITHER_MODES).toContain("tpdf");
    expect(DITHER_MODES).toContain("shaped");
  });
});
