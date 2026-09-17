import { describe, it, expect } from "vitest";
import { ConsoleSaturator, EVEN_MODELS, shapeWithoutOversampling } from "./saturation";
import { Exciter, EXCITER_CROSSOVER_HZ } from "./exciter";
import { CONSOLE_MODELS, type ConsoleModel } from "./types";
import { allFinite, dcOffset, magnitudeAt, peak, rms } from "@/lib/synth-engine/analysis";

const SR = 48000;
const db = (a: number, b: number) => 20 * Math.log10(Math.max(a, 1e-12) / Math.max(b, 1e-12));

function tone(freq: number, seconds: number, amp = 0.5): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR) * amp;
  return out;
}

function saturate(model: ConsoleModel, warmth: number, input: Float32Array): Float32Array {
  const s = new ConsoleSaturator(SR);
  s.setModel(model);
  s.setWarmth(warmth);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = s.tickLeft(input[i]);
  return out;
}

describe("console models", () => {
  const input = tone(1000, 0.4, 0.5);

  it("clean is a wire, whatever the warmth knob says", () => {
    const out = saturate("clean", 1, input);
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(input[i]);
  });

  it("every model is a wire at zero warmth", () => {
    for (const model of CONSOLE_MODELS) {
      const out = saturate(model, 0, input);
      expect(Array.from(out.subarray(0, 200)), model).toEqual(Array.from(input.subarray(0, 200)));
    }
  });

  it.each(CONSOLE_MODELS.filter((m) => m !== "clean"))("%s generates harmonics", (model) => {
    const out = saturate(model, 1, input).subarray(SR * 0.1);
    const h2 = magnitudeAt(out, 2000, SR);
    const h3 = magnitudeAt(out, 3000, SR);
    const fundamental = magnitudeAt(out, 1000, SR);
    expect(Math.max(h2, h3) / fundamental, `${model} added nothing`).toBeGreaterThan(0.001);
  });

  it("tube and transformer are even-weighted; console and tape are odd-weighted", () => {
    // This is the claim the four names make to a user. If it is not true, the
    // dropdown is decoration.
    const ratio = (model: ConsoleModel) => {
      const out = saturate(model, 1, input).subarray(SR * 0.1);
      return magnitudeAt(out, 2000, SR) / magnitudeAt(out, 3000, SR);
    };
    expect(ratio("tube"), "tube should be even-dominant").toBeGreaterThan(1);
    expect(ratio("transformer"), "transformer should be even-dominant").toBeGreaterThan(1);
    expect(ratio("console"), "console should be odd-dominant").toBeLessThan(1);
    expect(ratio("tape"), "tape should be odd-dominant").toBeLessThan(1);
  });

  it("tape loses a little top end and the others do not", () => {
    const high = tone(15000, 0.4, 0.4);
    const tapeOut = saturate("tape", 1, high).subarray(SR * 0.1);
    const consoleOut = saturate("console", 1, high).subarray(SR * 0.1);
    const ref = high.subarray(SR * 0.1);
    expect(db(magnitudeAt(tapeOut, 15000, SR), magnitudeAt(ref, 15000, SR))).toBeLessThan(-3);
    expect(db(magnitudeAt(consoleOut, 15000, SR), magnitudeAt(ref, 15000, SR))).toBeGreaterThan(-1.5);
  });

  it("oversampling removes the fold-back the same curve makes without it", () => {
    // A 9kHz tone through a waveshaper makes a 4th harmonic at 36kHz. At a
    // 48k rate that folds to 12kHz — a loud inharmonic tone in the middle of
    // the mix, which is what un-oversampled saturation actually sounds like.
    // The 3rd lands at 27kHz and folds to 21kHz.
    const bright = tone(9000, 0.3, 0.6);
    for (const model of CONSOLE_MODELS.filter((m) => m !== "clean")) {
      const naive = new Float32Array(bright.length);
      for (let i = 0; i < bright.length; i++) naive[i] = shapeWithoutOversampling(model, bright[i]);

      const good = saturate(model, 1, bright).subarray(SR * 0.1);
      const bad = naive.subarray(SR * 0.1);
      // 12kHz is the folded 4th harmonic, which only an even-harmonic curve
      // produces at all; a symmetric one has nothing there to fold.
      const aliases = EVEN_MODELS.includes(model) ? [12000, 21000] : [21000];
      for (const alias of aliases) {
        const improvement = db(magnitudeAt(bad, alias, SR), magnitudeAt(good, alias, SR));
        expect(improvement, `${model} at ${alias}Hz: only ${improvement.toFixed(1)}dB better`).toBeGreaterThan(12);
      }
    }
  });

  it("the transformer weighs its saturation toward the low end", () => {
    // What distinguishes it from the tube: a real transformer saturates where
    // the flux swing is largest, which is the bass.
    const evenRatio = (freq: number) => {
      const out = saturate("transformer", 1, tone(freq, 0.4, 0.5)).subarray(SR * 0.1);
      return magnitudeAt(out, freq * 2, SR) / magnitudeAt(out, freq, SR);
    };
    expect(evenRatio(200)).toBeGreaterThan(evenRatio(6000) * 2);
  });

  it("the calibration is doing something rather than sitting at 1", () => {
    const s = new ConsoleSaturator(SR);
    s.setModel("console");
    s.setWarmth(1);
    expect(s.makeupGain).toBeGreaterThan(1);
    s.setWarmth(0);
    expect(s.makeupGain).toBe(1);
  });

  it("does not quietly turn the track down as warmth goes up", () => {
    const quiet = tone(220, 0.4, 0.25);
    const dry = rms(quiet.subarray(SR * 0.1));
    for (const model of CONSOLE_MODELS.filter((m) => m !== "clean")) {
      const wet = rms(saturate(model, 1, quiet).subarray(SR * 0.1));
      expect(db(wet, dry), `${model} level shift`).toBeGreaterThan(-2);
      expect(db(wet, dry), `${model} level shift`).toBeLessThan(2);
    }
  });

  it("stays finite and bounded on hot input", () => {
    const hot = tone(100, 0.3, 0.999);
    for (const model of CONSOLE_MODELS) {
      const out = saturate(model, 1, hot);
      expect(allFinite(out), model).toBe(true);
      expect(peak(out), model).toBeLessThan(2);
    }
  });

  it("keeps the channels apart", () => {
    const s = new ConsoleSaturator(SR);
    s.setModel("tube");
    s.setWarmth(1);
    for (let i = 0; i < 2000; i++) s.tickLeft(Math.sin(i / 4) * 0.8);
    for (let i = 0; i < 200; i++) expect(s.tickRight(0)).toBe(0);
  });
});

describe("exciter", () => {
  function excite(even: number, odd: number, input: Float32Array): Float32Array {
    const e = new Exciter(SR);
    e.setAmounts(even, odd);
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = e.tickLeft(input[i]);
    return out;
  }

  const input = tone(4000, 0.4, 0.5);

  it("even puts energy an octave up", () => {
    const out = excite(1, 0, input).subarray(SR * 0.1);
    const ref = excite(0, 0, input).subarray(SR * 0.1);
    expect(db(magnitudeAt(out, 8000, SR), magnitudeAt(ref, 8000, SR))).toBeGreaterThan(12);
  });

  it("odd puts energy an octave and a fifth up", () => {
    const out = excite(0, 1, input).subarray(SR * 0.1);
    const ref = excite(0, 0, input).subarray(SR * 0.1);
    expect(db(magnitudeAt(out, 12000, SR), magnitudeAt(ref, 12000, SR))).toBeGreaterThan(12);
  });

  it("the two controls are independent", () => {
    const evenOnly = excite(1, 0, input).subarray(SR * 0.1);
    const oddOnly = excite(0, 1, input).subarray(SR * 0.1);
    expect(magnitudeAt(evenOnly, 8000, SR)).toBeGreaterThan(magnitudeAt(oddOnly, 8000, SR));
    expect(magnitudeAt(oddOnly, 12000, SR)).toBeGreaterThan(magnitudeAt(evenOnly, 12000, SR));
  });

  it("leaves the bass alone — harmonics there would be distortion, not air", () => {
    const low = tone(120, 0.4, 0.5);
    const out = excite(1, 1, low).subarray(SR * 0.1);
    const ref = low.subarray(SR * 0.1);
    expect(db(magnitudeAt(out, 240, SR), magnitudeAt(ref, 240, SR))).toBeLessThan(6);
    expect(EXCITER_CROSSOVER_HZ).toBeGreaterThan(1000);
  });

  it("adds no DC offset", () => {
    // Squaring a signal produces a DC term that tracks the music; left in, it
    // shows up as the low end pumping.
    const out = excite(1, 1, tone(5000, 0.5, 0.6)).subarray(SR * 0.2);
    expect(Math.abs(dcOffset(out))).toBeLessThan(1e-3);
  });

  it("at zero it is a wire", () => {
    const out = excite(0, 0, input);
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(input[i]);
  });
});
