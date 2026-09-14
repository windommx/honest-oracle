import { describe, it, expect } from "vitest";
import {
  MIN_BPM,
  MAX_BPM,
  ROLL_ROWS,
  STEP_LENGTHS,
  applyToAllSteps,
  clearPattern,
  demoPattern,
  patternHasContent,
  notesOutsideView,
  octaveContaining,
  rollBase,
  setLength,
  stepHasContent,
  toggleDrum,
  toggleNote,
} from "./_pattern";
import { MAX_STEPS, emptyPattern } from "@/lib/synth-engine/sequencer";

describe("toggleNote", () => {
  it("adds then removes", () => {
    let p = emptyPattern(4);
    p = toggleNote(p, 1, 60);
    expect(p.steps[1].notes).toEqual([60]);
    p = toggleNote(p, 1, 60);
    expect(p.steps[1].notes).toEqual([]);
  });

  it("keeps notes sorted whatever order they were clicked", () => {
    let p = emptyPattern(2);
    p = toggleNote(p, 0, 67);
    p = toggleNote(p, 0, 60);
    p = toggleNote(p, 0, 64);
    expect(p.steps[0].notes).toEqual([60, 64, 67]);
  });

  it("never mutates the pattern it was given", () => {
    // React renders from the previous object; mutating it means the grid shows
    // the new note but the engine is never told, or the reverse.
    const before = emptyPattern(4);
    const snapshot = JSON.stringify(before);
    const after = toggleNote(before, 0, 60);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
    expect(after.steps[0]).not.toBe(before.steps[0]);
  });

  it("ignores a step index outside the pattern", () => {
    const p = emptyPattern(4);
    expect(toggleNote(p, 9, 60)).toBe(p);
    expect(toggleNote(p, -1, 60)).toBe(p);
  });
});

describe("toggleDrum", () => {
  it("adds then removes", () => {
    let p = emptyPattern(4);
    p = toggleDrum(p, 0, "kick");
    expect(p.steps[0].drums).toEqual(["kick"]);
    p = toggleDrum(p, 0, "kick");
    expect(p.steps[0].drums).toEqual([]);
  });

  it("leaves the notes on that step alone", () => {
    let p = toggleNote(emptyPattern(4), 0, 60);
    p = toggleDrum(p, 0, "hat");
    expect(p.steps[0].notes).toEqual([60]);
    expect(p.steps[0].drums).toEqual(["hat"]);
  });
});

describe("setLength", () => {
  it("keeps what is already written when growing", () => {
    const p = setLength(toggleNote(emptyPattern(8), 3, 60), 16);
    expect(p.steps).toHaveLength(16);
    expect(p.steps[3].notes).toEqual([60]);
    expect(p.steps[15].notes).toEqual([]);
  });

  it("keeps the first steps when shrinking, not the last", () => {
    let p = emptyPattern(16);
    p = toggleNote(p, 1, 60);
    p = toggleNote(p, 14, 72);
    const short = setLength(p, 8);
    expect(short.steps).toHaveLength(8);
    expect(short.steps[1].notes).toEqual([60]);
  });

  it("clamps to the engine's limits", () => {
    expect(setLength(emptyPattern(4), 0).steps).toHaveLength(1);
    expect(setLength(emptyPattern(4), 9999).steps).toHaveLength(MAX_STEPS);
  });

  it("every offered length fits the engine", () => {
    for (const n of STEP_LENGTHS) expect(n).toBeLessThanOrEqual(MAX_STEPS);
  });
});

describe("clearPattern", () => {
  it("empties the notes but keeps the song settings", () => {
    let p = emptyPattern(8);
    p = { ...p, bpm: 145, swing: 0.4 };
    p = toggleNote(p, 0, 60);
    const cleared = clearPattern(p);
    expect(patternHasContent(cleared)).toBe(false);
    expect(cleared.steps).toHaveLength(8);
    expect(cleared.bpm).toBe(145);
    expect(cleared.swing).toBe(0.4);
  });
});

describe("applyToAllSteps", () => {
  it("writes the value to every step", () => {
    const p = applyToAllSteps(emptyPattern(8), { gate: 0.25, velocity: 0.4 });
    for (const s of p.steps) {
      expect(s.gate).toBe(0.25);
      expect(s.velocity).toBe(0.4);
    }
  });

  it("leaves the notes alone", () => {
    const p = applyToAllSteps(toggleNote(emptyPattern(4), 2, 64), { gate: 0.9 });
    expect(p.steps[2].notes).toEqual([64]);
  });
});

describe("demoPattern", () => {
  it("has something in it", () => {
    expect(patternHasContent(demoPattern())).toBe(true);
  });

  it("plays at a tempo the UI can show", () => {
    const p = demoPattern();
    expect(p.bpm).toBeGreaterThanOrEqual(MIN_BPM);
    expect(p.bpm).toBeLessThanOrEqual(MAX_BPM);
  });

  it("keeps every note inside the rows the roll draws", () => {
    // A note above or below the visible rows is a note the user cannot delete.
    const p = demoPattern();
    const base = rollBase(4);
    for (const step of p.steps) {
      for (const note of step.notes) {
        expect(note, `note ${note} is off the grid`).toBeGreaterThanOrEqual(base);
        expect(note).toBeLessThan(base + ROLL_ROWS);
      }
    }
  });
});

describe("notesOutsideView", () => {
  it("is empty when everything fits", () => {
    expect(notesOutsideView(demoPattern(), 4)).toEqual([]);
  });

  it("reports the notes the roll is not drawing, sorted and deduplicated", () => {
    let p = emptyPattern(4);
    p = toggleNote(p, 0, 40);
    p = toggleNote(p, 1, 40);
    p = toggleNote(p, 2, 80);
    p = toggleNote(p, 3, 55);
    expect(notesOutsideView(p, 4)).toEqual([40, 80]);
  });

  it("includes the top C of the octave above as out of view", () => {
    // rollBase(4)..rollBase(4)+12 inclusive is what the grid draws.
    const p = toggleNote(emptyPattern(2), 0, rollBase(4) + 12);
    expect(notesOutsideView(p, 4)).toEqual([]);
    const above = toggleNote(emptyPattern(2), 0, rollBase(4) + 13);
    expect(notesOutsideView(above, 4)).toEqual([rollBase(4) + 13]);
  });
});

describe("octaveContaining", () => {
  it("picks the octave that brings a note into view", () => {
    const note = 31;
    const oct = octaveContaining(note);
    expect(notesOutsideView(toggleNote(emptyPattern(2), 0, note), oct)).toEqual([]);
  });

  it("stays inside the keyboard's range", () => {
    expect(octaveContaining(0)).toBe(0);
    expect(octaveContaining(127)).toBeLessThanOrEqual(8);
  });
});

describe("stepHasContent", () => {
  it("is false for an empty step and true for either kind of content", () => {
    const p = emptyPattern(4);
    expect(stepHasContent(p.steps[0])).toBe(false);
    expect(stepHasContent(toggleNote(p, 0, 60).steps[0])).toBe(true);
    expect(stepHasContent(toggleDrum(p, 0, "kick").steps[0])).toBe(true);
  });
});
