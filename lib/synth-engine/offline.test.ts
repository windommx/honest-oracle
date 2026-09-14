import { describe, it, expect } from "vitest";
import { DEFAULT_TAIL_SECONDS, MAX_EXPORT_SECONDS, renderPattern } from "./offline";
import { emptyPattern, patternSeconds, type SequencerPattern } from "./sequencer";
import { rms } from "./analysis";

const SR = 48000;

const groove = (): SequencerPattern => {
  const p = emptyPattern(4);
  p.bpm = 150;
  p.steps[0] = { notes: [60], drums: ["kick"], velocity: 1, gate: 0.8 };
  p.steps[2] = { notes: [67], drums: ["hat"], velocity: 0.8, gate: 0.8 };
  return p;
};

describe("renderPattern", () => {
  it("produces exactly the length it says it did", () => {
    const pattern = groove();
    const out = renderPattern({ pattern, sampleRate: SR, tailSeconds: 0.5 });
    const expected = patternSeconds(pattern, SR) + 0.5;
    expect(out.seconds).toBeCloseTo(expected, 5);
    expect(out.left.length).toBe(Math.round(out.seconds * SR));
    expect(out.right.length).toBe(out.left.length);
  });

  it("repeats the pattern the number of times asked", () => {
    const pattern = groove();
    const once = renderPattern({ pattern, sampleRate: SR, tailSeconds: 0 });
    const twice = renderPattern({ pattern, sampleRate: SR, tailSeconds: 0, repeats: 2 });
    expect(twice.left.length).toBe(once.left.length * 2);
  });

  it("leaves room for the release and the reverb tail", () => {
    // A file that ends the instant the sequence does chops the last note.
    const pattern = groove();
    const out = renderPattern({ pattern, sampleRate: SR, patch: { reverbMix: 0.4, ampRelease: 0.8 } });
    const loopSamples = Math.round(patternSeconds(pattern, SR) * SR);
    const tail = out.left.subarray(loopSamples);
    expect(tail.length).toBe(Math.round(DEFAULT_TAIL_SECONDS * SR));
    // The tail is a decay, not silence and not another step.
    expect(rms(tail.subarray(0, SR / 4))).toBeGreaterThan(1e-4);
    expect(rms(tail.subarray(0, SR / 4))).toBeGreaterThan(rms(tail.subarray(tail.length - SR / 4)));
  });

  it("does not start another step during the tail", () => {
    // One note, on the last step of a slow pattern: if the sequencer kept
    // running through the tail the pattern would loop and play it again.
    const pattern = emptyPattern(2);
    pattern.bpm = 300;
    pattern.steps[0] = { notes: [72], drums: [], velocity: 1, gate: 0.2 };
    const out = renderPattern({
      pattern,
      sampleRate: SR,
      tailSeconds: 1,
      patch: { ampRelease: 0.01, reverbMix: 0, delayMix: 0 },
    });
    const tail = out.left.subarray(out.left.length - SR / 2);
    expect(rms(tail)).toBeLessThan(1e-5);
  });

  it("is deterministic", () => {
    const a = renderPattern({ pattern: groove(), sampleRate: SR, tailSeconds: 0.2 });
    const b = renderPattern({ pattern: groove(), sampleRate: SR, tailSeconds: 0.2 });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
  });

  it("reports the peak it produced", () => {
    const out = renderPattern({ pattern: groove(), sampleRate: SR, tailSeconds: 0.2 });
    expect(out.peak).toBeGreaterThan(0);
    // The chain ends in tanh, so nothing can leave it above full scale.
    expect(out.peak).toBeLessThanOrEqual(1);
  });

  it("refuses an export long enough to freeze the tab", () => {
    expect(() =>
      renderPattern({ pattern: groove(), sampleRate: SR, repeats: 100000 })
    ).toThrow(RangeError);
    expect(MAX_EXPORT_SECONDS).toBeGreaterThan(60);
  });

  it("renders much faster than real time", () => {
    const pattern = emptyPattern(16);
    pattern.bpm = 110;
    for (let i = 0; i < 16; i++) {
      pattern.steps[i].notes = i % 2 === 0 ? [48, 55, 60, 64] : [];
      pattern.steps[i].drums = i % 4 === 0 ? ["kick"] : ["hat"];
    }
    const started = Date.now();
    const out = renderPattern({ pattern, sampleRate: SR, repeats: 2, tailSeconds: 1 });
    const elapsed = (Date.now() - started) / 1000;
    // Measured at ~13x on this machine; asserting 2x leaves room for a slow CI
    // box while still failing if export ever becomes real-time capture.
    expect(elapsed, `${elapsed.toFixed(2)}s for ${out.seconds.toFixed(1)}s of audio`).toBeLessThan(
      out.seconds / 2
    );
  });
});
