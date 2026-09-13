import { describe, it, expect } from "vitest";
import { GranularOscillator, KarplusStrong, USER_TABLE_SIZE, UserWavetable } from "./sources";
import { Rng } from "./rng";
import { allFinite, dominantFrequency, levelVariation, magnitudeAt, peak, rms } from "./analysis";

const SR = 48000;

function renderGrains(density: number, seconds: number, size = 0.04, jitter = 0): Float64Array {
  const g = new GranularOscillator(SR, new Rng(7));
  g.setFrequency(220);
  const out = new Float64Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = g.tick(density, size, jitter);
  return out;
}

describe("granular — grains, not modulation", () => {
  it("a sparse cloud pulses and a dense one does not", () => {
    // The defining property, and the one the ported version did not have: at
    // low density the grains are separated by silence, at high density they
    // overlap into a continuous texture. The version this replaced summed four
    // fixed phase offsets of one sine, so "density" only mixed in noise and
    // this measurement would be flat.
    const sparse = levelVariation(renderGrains(6, 2), 2048);
    const dense = levelVariation(renderGrains(300, 2), 2048);
    expect(sparse).toBeGreaterThan(dense * 2);
  });

  it("spawns roughly the requested number of grains per second", () => {
    const g = new GranularOscillator(SR, new Rng(1));
    g.setFrequency(220);
    let spawns = 0;
    let previous = 0;
    for (let i = 0; i < SR; i++) {
      g.tick(50, 0.01, 0);
      if (g.activeGrains > previous) spawns++;
      previous = g.activeGrains;
    }
    expect(spawns).toBeGreaterThan(40);
    expect(spawns).toBeLessThan(60);
  });

  it("holds pitch when grains are not detuned", () => {
    const out = renderGrains(400, 1, 0.05, 0);
    expect(dominantFrequency(out, SR)).toBeCloseTo(220, -1);
  });

  it("stays bounded across the whole density range", () => {
    for (const density of [0.5, 20, 200, 2000]) {
      const out = renderGrains(density, 0.5);
      expect(allFinite(out), `density ${density}`).toBe(true);
      expect(peak(out), `density ${density}`).toBeLessThan(4);
    }
  });

  it("keeps a roughly steady level as density changes", () => {
    // Without the overlap normalisation a dense cloud would be far louder than
    // a sparse one, and the knob would read as a volume control.
    const quiet = rms(renderGrains(30, 1));
    const busy = rms(renderGrains(600, 1));
    expect(busy).toBeLessThan(quiet * 3);
    expect(busy).toBeGreaterThan(quiet / 3);
  });

  it("caps concurrent grains rather than growing without limit", () => {
    const g = new GranularOscillator(SR, new Rng(3));
    g.setFrequency(110);
    for (let i = 0; i < SR; i++) g.tick(20000, 0.5, 0);
    expect(g.activeGrains).toBeLessThanOrEqual(24);
  });

  it("is deterministic", () => {
    expect(Array.from(renderGrains(120, 0.3, 0.03, 30))).toEqual(
      Array.from(renderGrains(120, 0.3, 0.03, 30))
    );
  });
});

describe("Karplus-Strong — a string that actually stops", () => {
  function pluckAndRender(damping: number, seconds: number): Float64Array {
    const ks = new KarplusStrong(SR, new Rng(11));
    ks.pluck(220, damping);
    const out = new Float64Array(Math.round(seconds * SR));
    for (let i = 0; i < out.length; i++) out[i] = ks.tick();
    return out;
  }

  it("decays to silence", () => {
    // The regression this port exists for. The source version's loop
    // coefficients summed to exactly 1.0, so the string rang forever: over five
    // seconds its level plateaued at ~22% of the initial value and stopped
    // falling. Here it has to reach silence.
    const out = pluckAndRender(0.3, 6);
    const start = rms(out, 0, 4096);
    const end = rms(out, out.length - 4096);
    expect(start).toBeGreaterThan(0.05);
    expect(end).toBeLessThan(start * 0.02);
  });

  it("falls monotonically rather than plateauing", () => {
    const out = pluckAndRender(0.3, 4);
    const windows = [0, 1, 2, 3].map((s) => rms(out, s * SR, s * SR + 4096));
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i], `window ${i} did not fall`).toBeLessThan(windows[i - 1]);
    }
  });

  it("damping genuinely shortens the note", () => {
    // In the source version the five-second level differed by under a decibel
    // across the whole knob. Here it has to matter.
    const long = rms(pluckAndRender(0, 3), 2 * SR, 2 * SR + 4096);
    const short = rms(pluckAndRender(1, 3), 2 * SR, 2 * SR + 4096);
    expect(short).toBeLessThan(long * 0.1);
  });

  it("damping also dulls the tone", () => {
    const bright = pluckAndRender(0, 0.5);
    const dull = pluckAndRender(0.9, 0.5);
    // High-frequency content, as the ratio of adjacent-sample difference to level.
    const edge = (b: Float64Array) => {
      let d = 0;
      for (let i = 1; i < b.length; i++) d += Math.abs(b[i] - b[i - 1]);
      return d / b.length / Math.max(1e-9, rms(b));
    };
    expect(edge(dull)).toBeLessThan(edge(bright));
  });

  it("plays the pitch it was plucked at", () => {
    // Measured as spectral energy rather than by counting zero crossings: a
    // freshly plucked string is still mostly the noise burst, and crossings
    // would report the noise, not the note.
    const ks = new KarplusStrong(SR, new Rng(5));
    ks.pluck(440, 0.2);
    const out = new Float64Array(SR / 4);
    for (let i = 0; i < out.length; i++) out[i] = ks.tick();
    const settled = out.slice(4096);
    const atNote = magnitudeAt(settled, 440, SR);
    for (const off of [-80, -40, 60, 120]) {
      expect(atNote, `440Hz should beat ${440 + off}Hz`).toBeGreaterThan(magnitudeAt(settled, 440 + off, SR));
    }
  });

  it("decay time holds across pitch", () => {
    // A per-lap gain would make high notes die faster than low ones; the gain
    // here is per-sample, derived from a time.
    const at = (hz: number) => {
      const ks = new KarplusStrong(SR, new Rng(9));
      ks.pluck(hz, 0.3);
      const out = new Float64Array(SR * 2);
      for (let i = 0; i < out.length; i++) out[i] = ks.tick();
      return rms(out, SR, SR + 4096) / rms(out, 0, 4096);
    };
    const low = at(110);
    const high = at(880);
    expect(Math.abs(low - high)).toBeLessThan(Math.max(low, high) * 0.6);
  });

  it("mute() stops it for voice stealing", () => {
    const ks = new KarplusStrong(SR, new Rng(2));
    ks.pluck(220, 0.2);
    for (let i = 0; i < 1000; i++) ks.tick();
    ks.mute();
    expect(ks.tick()).toBe(0);
  });

  it("survives an absurd pitch instead of writing out of bounds", () => {
    for (const hz of [0, -50, 1e9]) {
      const ks = new KarplusStrong(SR, new Rng(4));
      expect(() => {
        ks.pluck(hz, 0.5);
        for (let i = 0; i < 1000; i++) ks.tick();
      }, `pitch ${hz}`).not.toThrow();
    }
  });

  it("is deterministic", () => {
    expect(Array.from(pluckAndRender(0.4, 0.2))).toEqual(Array.from(pluckAndRender(0.4, 0.2)));
  });
});

describe("user wavetable", () => {
  it("plays a sine until something is drawn", () => {
    const w = new UserWavetable(SR);
    w.setFrequency(SR / 128);
    const out = new Float64Array(128);
    for (let i = 0; i < 128; i++) out[i] = w.tick();
    for (let i = 0; i < 128; i++) expect(out[i]).toBeCloseTo(Math.sin((2 * Math.PI * i) / 128), 3);
  });

  it("reads back the shape that was drawn", () => {
    const w = new UserWavetable(SR);
    const square = Array.from({ length: USER_TABLE_SIZE }, (_, i) => (i < 64 ? 1 : -1));
    w.setTable(square);
    w.setFrequency(SR / USER_TABLE_SIZE); // exactly one sample per table entry
    const out: number[] = [];
    for (let i = 0; i < USER_TABLE_SIZE; i++) out.push(w.tick());
    expect(out[10]).toBeCloseTo(1, 6);
    expect(out[100]).toBeCloseTo(-1, 6);
  });

  it("resamples a table of any length", () => {
    const w = new UserWavetable(SR);
    w.setTable([1, -1]); // two points
    expect(w.getTable().length).toBe(USER_TABLE_SIZE);
  });

  it("normalises, so a faint drawing is as loud as a bold one", () => {
    const faint = new UserWavetable(SR);
    faint.setTable(Array.from({ length: 64 }, (_, i) => 0.02 * Math.sin((2 * Math.PI * i) / 64)));
    expect(peak(faint.getTable())).toBeCloseTo(1, 3);
  });

  it("ignores an empty table rather than going silent", () => {
    const w = new UserWavetable(SR);
    const before = w.getTable();
    w.setTable([]);
    expect(Array.from(w.getTable())).toEqual(Array.from(before));
  });

  it("survives non-finite points in a drawing", () => {
    const w = new UserWavetable(SR);
    w.setTable([0, Number.NaN, 1, Number.POSITIVE_INFINITY, -1]);
    expect(allFinite(w.getTable())).toBe(true);
  });

  it("warns when the pitch is high enough for a drawn edge to alias", () => {
    // Inherent to the feature — the point is to hear the drawn shape — so the
    // UI says so instead of silently band-limiting it away.
    const w = new UserWavetable(SR);
    w.setFrequency(110);
    expect(w.aliasWarning).toBe(false);
    w.setFrequency(2000);
    expect(w.aliasWarning).toBe(true);
  });
});
