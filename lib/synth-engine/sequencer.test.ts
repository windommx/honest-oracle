import { describe, it, expect } from "vitest";
import {
  MAX_STEPS,
  Sequencer,
  emptyPattern,
  emptyStep,
  patternSeconds,
  type SequencerEvent,
} from "./sequencer";

const SR = 48000;

/** Run the sequencer for `samples`, collecting every event with its sample index. */
function run(seq: Sequencer, samples: number): { at: number; event: SequencerEvent }[] {
  const log: { at: number; event: SequencerEvent }[] = [];
  for (let i = 0; i < samples; i++) {
    for (const event of seq.tick()) log.push({ at: i, event });
  }
  return log;
}

function patternWithNoteEveryStep(length = 4, bpm = 120, swing = 0) {
  const pattern = emptyPattern(length);
  pattern.bpm = bpm;
  pattern.swing = swing;
  pattern.steps = pattern.steps.map((s, i) => ({ ...s, notes: [60 + i] }));
  return pattern;
}

describe("sequencer — timing is exact because it counts samples", () => {
  it("fires the first step immediately, not a step late", () => {
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep());
    seq.start();
    const log = run(seq, 100);
    expect(log[0]?.at).toBe(0);
    expect(log[0]?.event).toMatchObject({ type: "noteOn", note: 60 });
  });

  it("holds an exact step period", () => {
    // 120bpm, 4 steps per beat => a step is 0.125s = 6000 samples at 48kHz.
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep(4, 120));
    seq.start();
    const ons = run(seq, SR * 2)
      .filter((e) => e.event.type === "noteOn")
      .map((e) => e.at);
    expect(ons.length).toBeGreaterThan(8);
    for (let i = 1; i < ons.length; i++) {
      expect(ons[i] - ons[i - 1], `gap ${i}`).toBe(6000);
    }
  });

  it("tempo changes the period", () => {
    const period = (bpm: number) => {
      const seq = new Sequencer(SR);
      seq.setPattern(patternWithNoteEveryStep(4, bpm));
      seq.start();
      const ons = run(seq, SR * 2)
        .filter((e) => e.event.type === "noteOn")
        .map((e) => e.at);
      return ons[1] - ons[0];
    };
    expect(period(60)).toBe(12000);
    expect(period(120)).toBe(6000);
    expect(period(240)).toBe(3000);
  });

  it("loops back to the first step", () => {
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep(4, 240)); // 3000 samples/step
    seq.start();
    const notes = run(seq, 3000 * 9)
      .filter((e) => e.event.type === "noteOn")
      .map((e) => (e.event as { note: number }).note);
    expect(notes.slice(0, 8)).toEqual([60, 61, 62, 63, 60, 61, 62, 63]);
  });
});

describe("swing", () => {
  it("delays the odd steps and leaves the pair length alone", () => {
    // The definition of swing: the groove shuffles, the tempo does not change.
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep(4, 120, 0.5));
    seq.start();
    const ons = run(seq, SR * 2)
      .filter((e) => e.event.type === "noteOn")
      .map((e) => e.at);

    const even = ons[1] - ons[0]; // the lengthened step
    const odd = ons[2] - ons[1]; // the shortened one
    expect(even).toBeGreaterThan(odd);
    // A pair still adds up to two straight steps.
    expect(even + odd).toBe(12000);
  });

  it("is off by default", () => {
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep(4, 120));
    seq.start();
    const ons = run(seq, SR).filter((e) => e.event.type === "noteOn").map((e) => e.at);
    expect(ons[1] - ons[0]).toBe(ons[2] - ons[1]);
  });

  it("clamps an absurd swing rather than producing a zero-length step", () => {
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep(4, 200, 5));
    seq.start();
    for (let i = 0; i < 4; i++) expect(seq.stepSamples(i)).toBeGreaterThan(0);
  });
});

describe("gate", () => {
  it("releases a note partway through its step", () => {
    const pattern = emptyPattern(2);
    pattern.bpm = 120; // 6000 samples per step
    pattern.steps[0] = { ...emptyStep(), notes: [60], gate: 0.5 };
    const seq = new Sequencer(SR);
    seq.setPattern(pattern);
    seq.start();

    const log = run(seq, 12000);
    const on = log.find((e) => e.event.type === "noteOn")!;
    const off = log.find((e) => e.event.type === "noteOff")!;
    expect(on.at).toBe(0);
    expect(off.at - on.at).toBe(3000);
  });

  it("a full gate holds right up to the next step", () => {
    const pattern = emptyPattern(2);
    pattern.bpm = 120;
    pattern.steps[0] = { ...emptyStep(), notes: [60], gate: 1 };
    const seq = new Sequencer(SR);
    seq.setPattern(pattern);
    seq.start();
    const log = run(seq, 12000);
    const off = log.find((e) => e.event.type === "noteOff")!;
    expect(off.at).toBe(6000);
  });

  it("releases before retriggering the same note", () => {
    // Otherwise the new note is stolen by the previous one's release and the
    // step is silently dropped.
    const pattern = emptyPattern(2);
    pattern.bpm = 240;
    pattern.steps[0] = { ...emptyStep(), notes: [60], gate: 1 };
    pattern.steps[1] = { ...emptyStep(), notes: [60], gate: 1 };
    const seq = new Sequencer(SR);
    seq.setPattern(pattern);
    seq.start();

    const log = run(seq, 9000);
    const kinds = log.map((e) => e.event.type);
    // on, then off-before-on for each retrigger.
    expect(kinds[0]).toBe("noteOn");
    expect(kinds.filter((k) => k === "noteOn").length).toBeGreaterThan(1);
    for (let i = 1; i < log.length; i++) {
      if (log[i].event.type === "noteOn") {
        const previous = log[i - 1];
        expect(previous.event.type, "a retrigger must be preceded by its release").toBe("noteOff");
        expect(previous.at).toBeLessThanOrEqual(log[i].at);
      }
    }
  });
});

describe("drums and rests", () => {
  it("fires drum hits on their steps", () => {
    const pattern = emptyPattern(4);
    pattern.bpm = 240;
    pattern.steps[0] = { ...emptyStep(), drums: ["kick"] };
    pattern.steps[2] = { ...emptyStep(), drums: ["snare", "hat"] };
    const seq = new Sequencer(SR);
    seq.setPattern(pattern);
    seq.start();

    const drums = run(seq, 3000 * 4).filter((e) => e.event.type === "drum");
    expect(drums.map((d) => (d.event as { id: string }).id)).toEqual(["kick", "snare", "hat"]);
    expect(drums[0].at).toBe(0);
    expect(drums[1].at).toBe(6000);
  });

  it("an empty step is a rest, not a repeat", () => {
    const pattern = emptyPattern(4);
    pattern.bpm = 240;
    pattern.steps[0] = { ...emptyStep(), notes: [60] };
    const seq = new Sequencer(SR);
    seq.setPattern(pattern);
    seq.start();
    const ons = run(seq, 3000 * 4).filter((e) => e.event.type === "noteOn");
    expect(ons).toHaveLength(1);
  });
});

describe("start and stop", () => {
  it("emits nothing until started", () => {
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep());
    expect(run(seq, 20000)).toEqual([]);
  });

  it("stop releases everything it started, and nothing else", () => {
    const pattern = emptyPattern(2);
    pattern.bpm = 60; // long steps, so the note is still held
    pattern.steps[0] = { ...emptyStep(), notes: [60, 64], gate: 1 };
    const seq = new Sequencer(SR);
    seq.setPattern(pattern);
    seq.start();
    run(seq, 1000);

    const offs = seq.stop();
    expect(offs.map((e) => (e as { note: number }).note).sort()).toEqual([60, 64]);
    expect(seq.isRunning).toBe(false);
    expect(run(seq, 20000)).toEqual([]);
  });

  it("restarting begins at the first step again", () => {
    const seq = new Sequencer(SR);
    seq.setPattern(patternWithNoteEveryStep(4, 240));
    seq.start();
    run(seq, 7000); // two steps in
    seq.stop();
    seq.start();
    const first = run(seq, 100).find((e) => e.event.type === "noteOn");
    expect((first!.event as { note: number }).note).toBe(60);
  });
});

describe("pattern helpers", () => {
  it("emptyPattern is silent and the right length", () => {
    const p = emptyPattern(16);
    expect(p.steps).toHaveLength(16);
    expect(p.steps.every((s) => s.notes.length === 0 && s.drums.length === 0)).toBe(true);
  });

  it("clamps the pattern length", () => {
    expect(emptyPattern(0).steps.length).toBe(1);
    expect(emptyPattern(1000).steps.length).toBe(MAX_STEPS);
  });

  it("patternSeconds matches what the sequencer actually takes", () => {
    // Used by the exporter to decide how much to render, so it has to agree
    // with the clock rather than approximate it.
    const pattern = patternWithNoteEveryStep(8, 137, 0.3);
    const expected = patternSeconds(pattern, SR);

    const seq = new Sequencer(SR);
    seq.setPattern(pattern);
    seq.start();
    const ons = run(seq, Math.ceil(expected * SR) + 2000)
      .filter((e) => e.event.type === "noteOn")
      .map((e) => e.at);
    // The 9th onset is the start of the second pass.
    expect(ons[8]).toBe(Math.round(expected * SR));
  });
});
