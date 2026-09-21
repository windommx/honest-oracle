// ╔══════════════════════════════════════════════════════════════════╗
// ║  PATTERN EDITS — every grid click, as a pure function.            ║
// ║                                                                    ║
// ║  The piano roll is a big grid of buttons, and grids of buttons are ║
// ║  where editing bugs live: a toggle that mutates the array React is ║
// ║  rendering, a resize that silently drops the bars you just wrote,  ║
// ║  a clear that forgets the tempo. None of that is visible in a      ║
// ║  screenshot, so the edits live here as pure functions with tests   ║
// ║  rather than inline in the component.                              ║
// ╚══════════════════════════════════════════════════════════════════╝

import { MAX_STEPS, emptyPattern, emptyStep, type SequencerPattern, type SequencerStep } from "@/lib/synth-engine/sequencer";
import { DRUM_IDS, type DrumId } from "@/lib/synth-engine/drums";
import { MAX_MIDI_NOTE, MAX_OCTAVE } from "./_notes";

/** Semitone rows the roll shows: one octave, inclusive of the top C. */
export const ROLL_ROWS = 13;

export const MIN_BPM = 40;
export const MAX_BPM = 220;

/** Lengths offered in the UI. All are whole bars at 4 steps per beat. */
export const STEP_LENGTHS = [8, 16, 32] as const;

function replaceStep(
  pattern: SequencerPattern,
  index: number,
  change: (step: SequencerStep) => SequencerStep
): SequencerPattern {
  if (index < 0 || index >= pattern.steps.length) return pattern;
  const steps = pattern.steps.slice();
  steps[index] = change(steps[index]);
  return { ...pattern, steps };
}

/** Add the note to a step, or remove it if it is already there. */
export function toggleNote(pattern: SequencerPattern, index: number, note: number): SequencerPattern {
  return replaceStep(pattern, index, (step) => {
    const has = step.notes.includes(note);
    return {
      ...step,
      // Sorted so two patterns with the same notes are the same object shape —
      // click order should not change what gets exported or compared.
      notes: has ? step.notes.filter((n) => n !== note) : [...step.notes, note].sort((a, b) => a - b),
    };
  });
}

export function toggleDrum(pattern: SequencerPattern, index: number, id: DrumId): SequencerPattern {
  return replaceStep(pattern, index, (step) => ({
    ...step,
    // Sorted into kit order for the same reason toggleNote sorts: click order
    // must not change what gets exported or compared. Without it, kick-then-
    // snare and snare-then-kick produce two patterns that sound identical and
    // serialise differently.
    drums: step.drums.includes(id)
      ? step.drums.filter((d) => d !== id)
      : [...step.drums, id].sort((a, b) => DRUM_IDS.indexOf(a) - DRUM_IDS.indexOf(b)),
  }));
}

/** Grow or shrink the pattern. Growing keeps what is already written and adds
 *  empty steps; shrinking keeps the first N rather than the last. */
export function setLength(pattern: SequencerPattern, length: number): SequencerPattern {
  const target = Math.min(MAX_STEPS, Math.max(1, Math.round(length)));
  if (target === pattern.steps.length) return pattern;
  const steps = pattern.steps.slice(0, target);
  while (steps.length < target) steps.push(emptyStep());
  return { ...pattern, steps };
}

/** Empty every step, keeping tempo, swing and length — the user asked to clear
 *  the notes, not to reset the song. */
export function clearPattern(pattern: SequencerPattern): SequencerPattern {
  return { ...pattern, steps: pattern.steps.map(() => emptyStep()) };
}

/** Velocity and gate are edited for the whole pattern rather than per step:
 *  two controls instead of one per cell, which is the right trade for a grid
 *  this small. */
export function applyToAllSteps(
  pattern: SequencerPattern,
  values: Partial<Pick<SequencerStep, "velocity" | "gate">>
): SequencerPattern {
  return { ...pattern, steps: pattern.steps.map((s) => ({ ...s, ...values })) };
}

export function stepHasContent(step: SequencerStep): boolean {
  return step.notes.length > 0 || step.drums.length > 0;
}

export function patternHasContent(pattern: SequencerPattern): boolean {
  return pattern.steps.some(stepHasContent);
}

/** Lowest note the roll shows for a given octave — the same numbering the
 *  keyboard uses, so the roll and the keys always agree about where C is. */
export function rollBase(octave: number): number {
  return octave * 12;
}

/** Notes in the pattern that the roll is not currently showing. A note the user
 *  can hear but cannot see is a note they cannot delete, so the UI says so. */
export function notesOutsideView(pattern: SequencerPattern, octave: number): number[] {
  const base = rollBase(octave);
  const found = new Set<number>();
  for (const step of pattern.steps) {
    for (const note of step.notes) {
      if (note < base || note >= base + ROLL_ROWS) found.add(note);
    }
  }
  return Array.from(found).sort((a, b) => a - b);
}

/**
 * The octave that brings a note into view.
 *
 * The clamp used to stop at 8, which draws [96, 108] — so notes 109 to 127
 * could not be reached at all, and the "N notes off-screen, press to jump"
 * button did nothing for them while the warning stayed on screen. The top
 * octave is the one whose window still contains the highest note, which is
 * what the docstring claimed all along; the old test only asserted the clamp.
 */
export const MAX_ROLL_OCTAVE = MAX_OCTAVE;

export function octaveContaining(note: number): number {
  return Math.max(0, Math.min(MAX_ROLL_OCTAVE, Math.floor(note / 12)));
}

/**
 * A starter groove, so the grid is not an empty page.
 *
 * Deliberately simple and in one key: it exists to prove the sequencer works
 * the moment the page loads, not to be a composition.
 */
export function demoPattern(): SequencerPattern {
  const p = emptyPattern(16);
  p.bpm = 104;
  p.stepsPerBeat = 4;
  p.swing = 0.18;

  const kick = [0, 4, 8, 11];
  const snare = [4, 12];
  const bass: Record<number, number> = { 0: 48, 6: 55, 8: 51, 14: 55 };

  p.steps = p.steps.map((step, i) => ({
    ...step,
    notes: bass[i] === undefined ? [] : [bass[i]],
    drums: [
      ...(kick.includes(i) ? (["kick"] as DrumId[]) : []),
      ...(snare.includes(i) ? (["snare"] as DrumId[]) : []),
      ...(i % 2 === 1 ? (["hat"] as DrumId[]) : []),
    ],
    gate: 0.55,
    velocity: 0.9,
  }));
  return p;
}
