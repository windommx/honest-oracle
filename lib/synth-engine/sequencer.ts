// ╔══════════════════════════════════════════════════════════════════╗
// ║  SEQUENCER — steps counted in samples, on the audio thread.       ║
// ║                                                                    ║
// ║  The version this follows kept its sequencer and arpeggiator on    ║
// ║  the MAIN thread, driven by setInterval. That is the standard way  ║
// ║  and it is also why so much browser music wobbles: setInterval is  ║
// ║  only a lower bound, and under layout or GC it drifts by tens of   ║
// ║  milliseconds — several percent of a sixteenth note, which is      ║
// ║  clearly audible as a rushing or dragging groove.                  ║
// ║                                                                    ║
// ║  Counting samples inside the render loop makes the period exact by ║
// ║  construction: a step is a whole number of samples, and the        ║
// ║  sequence cannot slip no matter what the page is doing.            ║
// ║                                                                    ║
// ║  Pure state machine — it emits events and never touches a voice,   ║
// ║  so it can be advanced in a test without a synth attached.         ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { DrumId } from "./drums";

export interface SequencerStep {
  /** MIDI notes to start on this step. Empty is a rest. */
  notes: number[];
  /** Drum pads to hit on this step. */
  drums: DrumId[];
  /** 0..1. */
  velocity: number;
  /** Fraction of the step the notes sound for. 1 is legato into the next step. */
  gate: number;
}

export interface SequencerPattern {
  steps: SequencerStep[];
  /** Steps per beat. 4 gives sixteenth notes in 4/4. */
  stepsPerBeat: number;
  bpm: number;
  /** 0..1. Delays every second step, which is what makes a groove shuffle. */
  swing: number;
}

export type SequencerEvent =
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "drum"; id: DrumId; velocity: number };

export const MAX_STEPS = 64;

export function emptyStep(): SequencerStep {
  return { notes: [], drums: [], velocity: 0.9, gate: 0.6 };
}

export function emptyPattern(length = 16): SequencerPattern {
  return {
    steps: Array.from({ length: Math.min(MAX_STEPS, Math.max(1, length)) }, emptyStep),
    stepsPerBeat: 4,
    bpm: 110,
    swing: 0,
  };
}

interface PendingOff {
  note: number;
  /** Samples remaining before the note is released. */
  countdown: number;
}

export class Sequencer {
  private pattern: SequencerPattern = emptyPattern();
  private readonly sampleRate: number;

  private running = false;
  /** Index of the step that will fire next. */
  private step = 0;
  /** Index of the step currently sounding; -1 before the first one fires. */
  private playing = -1;
  /** Samples until the next step fires. */
  private countdown = 0;
  private pending: PendingOff[] = [];
  /** Notes this sequencer started, so stop() releases exactly those. */
  private sounding = new Set<number>();

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  setPattern(pattern: Partial<SequencerPattern>): void {
    this.pattern = { ...this.pattern, ...pattern };
  }

  getPattern(): SequencerPattern {
    return this.pattern;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** The step a UI should highlight.
   *
   *  Deliberately NOT `step`: that one already points at what fires NEXT, so a
   *  playhead drawn from it lights the wrong square for the whole duration of
   *  every step. -1 means nothing has fired yet. */
  get currentStep(): number {
    return this.playing;
  }

  /** Start from the top. */
  start(): void {
    this.running = true;
    this.step = 0;
    this.playing = -1;
    // Zero so the first step fires on the very next sample rather than a step
    // late — a sequencer that starts silent for one step feels broken.
    this.countdown = 0;
  }

  /** Stop, returning the note-offs needed to leave nothing hanging. */
  stop(): SequencerEvent[] {
    this.running = false;
    this.playing = -1;
    this.pending = [];
    const offs: SequencerEvent[] = Array.from(this.sounding).map((note) => ({ type: "noteOff", note }));
    this.sounding.clear();
    return offs;
  }

  /**
   * Length of a step in samples.
   *
   * Swing lengthens even steps and shortens odd ones by the same amount, so a
   * PAIR always takes exactly two straight steps — the groove shuffles without
   * the tempo changing, which is what swing means.
   */
  stepSamples(index: number): number {
    const beats = 60 / Math.max(20, Math.min(300, this.pattern.bpm));
    const straight = (beats / Math.max(1, this.pattern.stepsPerBeat)) * this.sampleRate;
    const swing = Math.min(Math.max(this.pattern.swing, 0), 0.9);
    const shift = straight * swing * 0.5;
    return Math.max(1, Math.round(index % 2 === 0 ? straight + shift : straight - shift));
  }

  /**
   * Advance one sample.
   *
   * Returns the events due at this exact sample — usually none, which is why it
   * returns a shared empty array rather than allocating one per sample.
   */
  tick(): SequencerEvent[] {
    let events: SequencerEvent[] | null = null;

    // Note-offs first: a step that retriggers the note it is already holding
    // must release before it starts, or the new note is stolen by the old
    // note's release.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (--this.pending[i].countdown <= 0) {
        const { note } = this.pending[i];
        this.pending.splice(i, 1);
        this.sounding.delete(note);
        (events ??= []).push({ type: "noteOff", note });
      }
    }

    if (!this.running) return events ?? EMPTY;
    if (--this.countdown > 0) return events ?? EMPTY;

    const index = this.step % this.pattern.steps.length;
    const length = this.stepSamples(index);
    this.countdown = length;
    this.step = (this.step + 1) % this.pattern.steps.length;
    this.playing = index;

    const step = this.pattern.steps[index];
    if (!step) return events ?? EMPTY;

    const gate = Math.min(Math.max(step.gate, 0.05), 1);
    const holdFor = Math.max(1, Math.round(length * gate));

    for (const note of step.notes) {
      (events ??= []).push({ type: "noteOn", note, velocity: step.velocity });
      this.sounding.add(note);
      // Replace any pending release for the same note rather than keeping two.
      const existing = this.pending.findIndex((p) => p.note === note);
      if (existing >= 0) this.pending[existing].countdown = holdFor;
      else this.pending.push({ note, countdown: holdFor });
    }
    for (const id of step.drums) {
      (events ??= []).push({ type: "drum", id, velocity: step.velocity });
    }

    return events ?? EMPTY;
  }
}

/** Shared, never mutated — returned on the overwhelming majority of samples. */
const EMPTY: SequencerEvent[] = [];

/** How long one pass of the pattern takes, in seconds. Used by the exporter to
 *  decide how much to render. */
export function patternSeconds(pattern: SequencerPattern, sampleRate: number): number {
  const seq = new Sequencer(sampleRate);
  seq.setPattern(pattern);
  let total = 0;
  for (let i = 0; i < pattern.steps.length; i++) total += seq.stepSamples(i);
  return total / sampleRate;
}
