import { describe, it, expect } from "vitest";
import { Envelope } from "./envelope";

const SR = 48000;

/** Run an envelope, returning every level. */
function run(env: Envelope, samples: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) out.push(env.tick());
  return out;
}

describe("envelope — stages", () => {
  it("starts idle and silent", () => {
    const env = new Envelope(SR);
    expect(env.active).toBe(false);
    expect(env.tick()).toBe(0);
  });

  it("reaches full level in exactly the stated attack time", () => {
    // The regression that rewrote this module: a one-pole with a time constant
    // of `attack` needs ~4 of them to arrive, so a knob reading 10ms took 39ms.
    const env = new Envelope(SR);
    env.noteOn(0.01, 0.1, 0.5); // 10ms
    const tenMs = run(env, Math.round(SR * 0.01));
    expect(tenMs.at(-1)).toBeCloseTo(1, 6);
    // …and not before: at 8ms it is still climbing.
    const early = new Envelope(SR);
    early.noteOn(0.01, 0.1, 0.5);
    expect(run(early, Math.round(SR * 0.008)).at(-1)).toBeLessThan(0.99);
  });

  it("settles at the sustain level", () => {
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.01, 0.4);
    run(env, Math.ceil(SR * 0.2));
    expect(env.tick()).toBeCloseTo(0.4, 3);
    expect(env.currentStage).toBe("sustain");
  });

  it("holds sustain indefinitely until released", () => {
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.01, 0.6);
    run(env, SR * 2);
    expect(env.tick()).toBeCloseTo(0.6, 4);
    expect(env.active).toBe(true);
  });

  it("falls to silence and goes idle after release", () => {
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.01, 0.8);
    run(env, Math.ceil(SR * 0.1));
    env.noteOff(0.05);
    run(env, Math.ceil(SR * 0.5));
    expect(env.currentLevel).toBe(0);
    expect(env.active).toBe(false);
  });
});

describe("envelope — the curve is exponential, not linear", () => {
  it("decays fast at first and slows down", () => {
    // The property that makes a pluck sound plucked. A linear ramp covers the
    // same distance in every equal slice; an exponential covers far more in
    // the first.
    const env = new Envelope(SR);
    env.noteOn(0.001, 1, 0);
    run(env, Math.round(SR * 0.001)); // finish the attack exactly
    const start = env.currentLevel;
    expect(start).toBeCloseTo(1, 6);
    const slice = Math.round(SR * 0.1);
    const q1 = run(env, slice).at(-1)!;
    const q2 = run(env, slice).at(-1)!;
    expect(start - q1).toBeGreaterThan((q1 - q2) * 1.3);
  });

  it("release is exponential too", () => {
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.001, 1);
    run(env, Math.ceil(SR * 0.05));
    env.noteOff(0.6);
    const slice = Math.round(SR * 0.06);
    const a = run(env, slice).at(-1)!;
    const b = run(env, slice).at(-1)!;
    const c = run(env, slice).at(-1)!;
    expect(1 - a).toBeGreaterThan(a - b);
    expect(a - b).toBeGreaterThan(b - c);
  });

  it("never overshoots 1.0 despite aiming above it", () => {
    // The attack targets slightly past 1.0 so it arrives in finite time; the
    // stage must still clamp on arrival.
    const env = new Envelope(SR);
    env.noteOn(0.005, 0.1, 0.5);
    for (const l of run(env, SR)) expect(l).toBeLessThanOrEqual(1);
  });

  it("stays within 0..1 for every stage", () => {
    const env = new Envelope(SR);
    env.noteOn(0.01, 0.05, 0.3);
    const held = run(env, Math.ceil(SR * 0.2));
    env.noteOff(0.1);
    const released = run(env, Math.ceil(SR * 0.3));
    for (const l of [...held, ...released]) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });
});

describe("envelope — timing holds across sample rates", () => {
  it("a 100ms attack takes 100ms at 44.1k and at 48k", () => {
    for (const sr of [44100, 48000]) {
      const env = new Envelope(sr);
      env.noteOn(0.1, 1, 1);
      let samples = 0;
      while (env.currentStage === "attack" && samples < sr * 2) {
        env.tick();
        samples++;
      }
      // Exact, not approximate: the stage is ended by a sample countdown.
      expect(samples, `at ${sr}Hz`).toBe(Math.round(sr * 0.1));
    }
  });
});

describe("envelope — edge cases a synth actually hits", () => {
  it("a zero-length attack jumps straight to full", () => {
    const env = new Envelope(SR);
    env.noteOn(0, 0.1, 0.5);
    // Full level before any sample is consumed, then decay begins on the very
    // first tick — a click-transient, which is exactly what a 0ms attack is.
    expect(env.currentLevel).toBe(1);
    expect(env.currentStage).toBe("decay");
    expect(env.tick()).toBeGreaterThan(0.999);
  });

  it("a zero-length attack AND decay lands straight on sustain", () => {
    const env = new Envelope(SR);
    env.noteOn(0, 0, 0.35);
    expect(env.currentStage).toBe("sustain");
    expect(env.tick()).toBe(0.35);
  });

  it("a zero-length release ends the note at once", () => {
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.01, 0.5);
    run(env, 500);
    env.noteOff(0);
    expect(env.active).toBe(false);
    expect(env.tick()).toBe(0);
  });

  it("releasing an idle envelope does not restart it", () => {
    // A note-off arriving after the voice already finished must not resurrect
    // it — that is an audible ghost note.
    const env = new Envelope(SR);
    env.noteOff(0.5);
    expect(env.active).toBe(false);
    expect(env.tick()).toBe(0);
  });

  it("kill() silences immediately for voice stealing", () => {
    // A stolen voice must not bleed its release tail into the new note.
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.5, 0.9);
    run(env, 1000);
    env.kill();
    expect(env.currentLevel).toBe(0);
    expect(env.active).toBe(false);
  });

  it("clamps a sustain outside 0..1", () => {
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.001, 5);
    run(env, Math.ceil(SR * 0.05));
    expect(env.currentLevel).toBeLessThanOrEqual(1);
  });

  it("retriggering restarts the attack from the current level", () => {
    const env = new Envelope(SR);
    env.noteOn(0.001, 0.01, 0.3);
    run(env, Math.ceil(SR * 0.1));
    env.noteOn(0.01, 0.05, 0.8);
    expect(env.currentStage).toBe("attack");
  });

  it("is deterministic", () => {
    const go = () => {
      const env = new Envelope(SR);
      env.noteOn(0.01, 0.1, 0.4);
      const a = run(env, 5000);
      env.noteOff(0.2);
      return [...a, ...run(env, 5000)];
    };
    expect(go()).toEqual(go());
  });
});
