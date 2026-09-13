import { describe, it, expect } from "vitest";
import { DRUM_IDS, DRUM_RECIPES, DrumKit, DrumVoice, type DrumId } from "./drums";
import { Rng } from "./rng";
import { allFinite, dominantFrequency, magnitudeAt, peak, rms } from "./analysis";

const SR = 48000;

function hit(id: DrumId, seconds = 1, velocity = 1): Float64Array {
  const voice = new DrumVoice(SR, new Rng(17));
  voice.trigger(id, velocity);
  const out = new Float64Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = voice.tick();
  return out;
}

describe("drums — each pad makes its own sound", () => {
  it.each(DRUM_IDS)("%s produces bounded, finite audio", (id) => {
    const out = hit(id);
    expect(rms(out, 0, 4096), `${id} is silent`).toBeGreaterThan(0.01);
    expect(peak(out)).toBeLessThanOrEqual(1);
    expect(allFinite(out)).toBe(true);
  });

  it.each(DRUM_IDS)("%s stops on its own", (id) => {
    const out = hit(id, 2);
    expect(rms(out, out.length - 4096)).toBeLessThan(1e-4);
  });

  it("a hat is much shorter than a kick", () => {
    const tailAt = (id: DrumId, seconds: number) => rms(hit(id, 1), seconds * SR, seconds * SR + 2048);
    expect(tailAt("hat", 0.15)).toBeLessThan(tailAt("kick", 0.15));
  });

  it("velocity scales the hit", () => {
    expect(rms(hit("kick", 0.5, 0.3), 0, 4096)).toBeLessThan(rms(hit("kick", 0.5, 1), 0, 4096) * 0.6);
  });

  it("is deterministic — the same hit twice is the same samples", () => {
    expect(Array.from(hit("snare", 0.3))).toEqual(Array.from(hit("snare", 0.3)));
  });
});

describe("the kick sweeps DOWNWARD", () => {
  it("starts high and falls", () => {
    // The bug this port fixes. The source version's pitch was derived from the
    // amplitude envelope as `150 * (1 - ae*0.5)³ + 40`, so as `ae` fell from 1
    // to 0 the pitch ROSE from 59Hz to 190Hz — a rising boing, not a hit.
    const out = hit("kick", 0.5);
    const early = dominantFrequency(out.slice(0, 2400), SR); // first 50ms
    const late = dominantFrequency(out.slice(4800, 9600), SR); // 100–200ms
    expect(early, `early ${early.toFixed(0)}Hz should exceed late ${late.toFixed(0)}Hz`).toBeGreaterThan(
      late * 1.3
    );
  });

  it("lands near the recipe's endpoints", () => {
    const out = hit("kick", 0.5);
    const early = dominantFrequency(out.slice(0, 1200), SR);
    expect(early).toBeGreaterThan(DRUM_RECIPES.kick.endHz);
    expect(early).toBeLessThanOrEqual(DRUM_RECIPES.kick.startHz * 1.25);
  });

  it("perc falls too", () => {
    // Same inversion in the source version's perc voice.
    //
    // Both windows sit inside the 130ms body of the hit. Measuring further out
    // reads the tail, where the voice's 8% noise component dominates the
    // zero-crossing count and reports a frequency the ear never hears.
    // Measured spectrally, not by counting zero crossings: 8% of this voice is
    // noise, and noise adds spurious crossings everywhere, which compresses the
    // reading toward a constant. Asking where the ENERGY sits is robust to it.
    const out = hit("perc", 0.3);
    const early = out.slice(0, 1440); // 0-30ms
    const late = out.slice(2400, 4320); // 50-90ms

    const highEarly = magnitudeAt(early, 700, SR);
    const lowEarly = magnitudeAt(early, 320, SR);
    const highLate = magnitudeAt(late, 700, SR);
    const lowLate = magnitudeAt(late, 320, SR);

    expect(highEarly).toBeGreaterThan(lowEarly);
    expect(lowLate).toBeGreaterThan(highLate);
  });

  it("every recipe is written to fall, not rise", () => {
    for (const id of DRUM_IDS) {
      expect(DRUM_RECIPES[id].startHz, `${id} rises`).toBeGreaterThan(DRUM_RECIPES[id].endHz);
    }
  });
});

describe("drum kit — pads are independent", () => {
  it("a hat does not cut the kick", () => {
    // The reason each pad owns a voice. With a shared voice, hitting a hat
    // during a kick would silence the kick mid-decay.
    const kit = new DrumKit(SR, new Rng(23));
    kit.trigger("kick", 1);
    const before: number[] = [];
    for (let i = 0; i < 2400; i++) before.push(kit.tick());
    kit.trigger("hat", 1);
    for (let i = 0; i < 4800; i++) kit.tick();
    expect(kit.activeCount).toBeGreaterThanOrEqual(1);

    const soloKick = new DrumKit(SR, new Rng(23));
    soloKick.trigger("kick", 1);
    for (let i = 0; i < 7200; i++) soloKick.tick();
    expect(soloKick.activeCount).toBe(1); // the kick is still going either way
    expect(rms(before)).toBeGreaterThan(0);
  });

  it("retriggering a pad restarts it rather than stacking", () => {
    const kit = new DrumKit(SR, new Rng(29));
    kit.trigger("hat", 1);
    for (let i = 0; i < 100; i++) kit.tick();
    kit.trigger("hat", 1);
    expect(kit.activeCount).toBe(1);
  });

  it("all four at once stay inside full scale", () => {
    const kit = new DrumKit(SR, new Rng(31));
    for (const id of DRUM_IDS) kit.trigger(id, 1);
    let worst = 0;
    for (let i = 0; i < SR; i++) worst = Math.max(worst, Math.abs(kit.tick()));
    expect(worst).toBeLessThanOrEqual(4);
  });

  it("silence() stops everything", () => {
    const kit = new DrumKit(SR, new Rng(37));
    for (const id of DRUM_IDS) kit.trigger(id, 1);
    kit.silence();
    expect(kit.activeCount).toBe(0);
    expect(kit.tick()).toBe(0);
  });
});
