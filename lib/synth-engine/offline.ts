// ╔══════════════════════════════════════════════════════════════════╗
// ║  OFFLINE RENDER — a pattern to samples, with no device involved.  ║
// ║                                                                    ║
// ║  This is the payoff for the engine being a pure function into a    ║
// ║  buffer. Nothing here waits for real time, so a bar of music is    ║
// ║  produced in a fraction of its own duration, identically on every  ║
// ║  run, no matter what the page is doing.                            ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Synth } from "./synth";
import { patternSeconds, type SequencerPattern } from "./sequencer";
import { peak } from "./analysis";
import type { SynthPatch } from "./types";

/** Seconds of silence-with-tails rendered after the last step.
 *
 *  Without it a file ends the instant the sequence does, chopping the reverb
 *  and the final note's release — the single most obvious way an export sounds
 *  wrong compared to what the player heard. */
export const DEFAULT_TAIL_SECONDS = 2;

/** Refuse an export longer than this. A slip of the repeat field should not
 *  silently allocate gigabytes and freeze the tab. */
export const MAX_EXPORT_SECONDS = 300;

export interface OfflineRenderOptions {
  pattern: SequencerPattern;
  patch?: Partial<SynthPatch>;
  sampleRate?: number;
  /** How many times to play the pattern through. */
  repeats?: number;
  tailSeconds?: number;
}

export interface OfflineRender {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  seconds: number;
  /** Loudest sample in the result, so a caller can say whether it clipped. */
  peak: number;
}

function concat(a: Float32Array, b: Float32Array): Float32Array {
  if (b.length === 0) return a;
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Render a pattern to samples.
 *
 * The sequence is stopped before the tail is rendered, so the tail contains
 * exactly the releases and reverb of what already played — not a further step.
 */
export function renderPattern(options: OfflineRenderOptions): OfflineRender {
  const sampleRate = options.sampleRate ?? 48000;
  const repeats = Math.max(1, Math.floor(options.repeats ?? 1));
  const tailSeconds = Math.max(0, options.tailSeconds ?? DEFAULT_TAIL_SECONDS);
  const loopSeconds = patternSeconds(options.pattern, sampleRate) * repeats;
  const seconds = loopSeconds + tailSeconds;

  if (seconds > MAX_EXPORT_SECONDS) {
    throw new RangeError(`export would be ${Math.round(seconds)}s; the limit is ${MAX_EXPORT_SECONDS}s`);
  }

  const synth = new Synth(sampleRate, options.patch ?? {});
  synth.setPattern(options.pattern);
  synth.startSequencer();
  const loop = synth.renderSeconds(loopSeconds);

  synth.stopSequencer();
  const tail = synth.renderSeconds(tailSeconds);

  const left = concat(loop.left, tail.left);
  const right = concat(loop.right, tail.right);
  return { left, right, sampleRate, seconds, peak: Math.max(peak(left), peak(right)) };
}
