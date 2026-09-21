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
import { MAX_MIDI_NOTE, MAX_OCTAVE } from "./_notes";
import { DRUM_IDS } from "@/lib/synth-engine/drums";

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
  it("brings EVERY note into view, not just the ones in the middle", () => {
    // The old clamp stopped at octave 8, which draws [96, 108] — so notes 109
    // to 127 could not be reached at all and the "press to jump" button did
    // nothing while the off-screen warning stayed up. The old test asserted
    // the clamp rather than the promise, so it passed throughout.
    const unreachable: number[] = [];
    for (let note = 0; note <= 127; note++) {
      const p = toggleNote(emptyPattern(2), 0, note);
      if (notesOutsideView(p, octaveContaining(note)).length > 0) unreachable.push(note);
    }
    expect(unreachable, `cannot reach: ${unreachable.join(", ")}`).toEqual([]);
  });

  it("never scrolls past the top of MIDI", () => {
    expect(octaveContaining(0)).toBe(0);
    expect(octaveContaining(127)).toBeLessThanOrEqual(MAX_OCTAVE);
  });
});

describe("toggleDrum ordering", () => {
  it("keeps drums in kit order whatever order they were clicked", () => {
    // toggleNote sorts for exactly this reason; drums appended, so two
    // patterns that sound identical serialised differently.
    let a = emptyPattern(2);
    a = toggleDrum(a, 0, "snare");
    a = toggleDrum(a, 0, "kick");
    let b = emptyPattern(2);
    b = toggleDrum(b, 0, "kick");
    b = toggleDrum(b, 0, "snare");
    expect(a.steps[0].drums).toEqual(b.steps[0].drums);
    expect(a.steps[0].drums).toEqual(["kick", "snare"]);
  });

  it("orders by the kit, not alphabetically", () => {
    let p = emptyPattern(2);
    for (const id of [...DRUM_IDS].reverse()) p = toggleDrum(p, 0, id);
    expect(p.steps[0].drums).toEqual([...DRUM_IDS]);
  });
});

describe("the roll stays inside MIDI", () => {
  it("the top octave's window still contains note 127", () => {
    expect(rollBase(MAX_OCTAVE)).toBeLessThanOrEqual(MAX_MIDI_NOTE);
    expect(rollBase(MAX_OCTAVE) + ROLL_ROWS - 1).toBeGreaterThanOrEqual(MAX_MIDI_NOTE);
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
