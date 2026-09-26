// ╔══════════════════════════════════════════════════════════════════╗
// ║  MASTER WORKLET — plays a loaded file through the chain.          ║
// ║                                                                    ║
// ║  Bundled to public/master-worklet.js by scripts/build-worklet.ts,  ║
// ║  because a worklet module is loaded by URL into its own realm and  ║
// ║  cannot import from the app bundle. A guard test fails the build   ║
// ║  if the committed artifact is stale, so the audio thread and the   ║
// ║  test suite provably run the same code.                            ║
// ║                                                                    ║
// ║  The transport lives HERE rather than on the main thread. A        ║
// ║  playhead driven by requestAnimationFrame drifts from the audio    ║
// ║  under load, and on a mastering page the playhead is how the       ║
// ║  operator decides what they are hearing.                           ║
// ╚══════════════════════════════════════════════════════════════════╝

import { MasterChain } from "./chain";
import { DEFAULT_MASTER, type MasterUpdate } from "./types";

export type MasterCommand =
  /** Two channels of the whole file, transferred rather than copied.
   *  `sampleRate` is the FILE's rate, which is not necessarily the device's. */
  | { type: "load"; left: Float32Array; right: Float32Array; sampleRate: number }
  | { type: "settings"; settings: MasterUpdate }
  | { type: "transport"; playing: boolean }
  | { type: "loop"; loop: boolean }
  | { type: "seek"; frame: number }
  /** False plays the file untouched — the A/B. */
  | { type: "mastered"; mastered: boolean }
  | { type: "reset" };

/**
 * Sent ONCE, when a non-looping file runs out.
 *
 * Deliberately an event and not a field on the status message. `playing` is a
 * level, and levels race: a status generated before the transport message was
 * handled reports false, arrives after the page has already set itself to
 * playing, and switches the button back under the operator's finger. An event
 * only ever fires for the thing that actually happened.
 */
export interface MasterEnded {
  type: "ended";
}

export interface MasterStatus {
  type: "status";
  /** Playhead, in FILE frames — the unit the waveform and seeking use. */
  frame: number;
  frames: number;
  /** Frames of the file consumed per output sample. 1 when the device rate
   *  matches the file's; anything else means the audition is resampled and
   *  the page says so. */
  rateRatio: number;
  playing: boolean;
  peak: number;
  momentaryLufs: number;
  shortTermLufs: number;
  gainReductionDb: number;
  /** Multiband reduction, low to high. A multiband is the one processor where
   *  a setting is not enough to know what is happening — two bands can be set
   *  identically and do completely different work. */
  bandReductionDb: [number, number, number];
}

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare const AudioWorkletProcessor: {
  new (): { readonly port: MessagePort };
};

/** ~21ms between status messages at 128 samples a block. Every block would be
 *  375 postMessage calls a second, which costs more than the DSP. */
const STATUS_EVERY_BLOCKS = 8;

class MasterProcessor extends AudioWorkletProcessor {
  private readonly chain = new MasterChain(sampleRate, DEFAULT_MASTER);
  // Typed as plainly backed: a message can carry a Float32Array over any
  // ArrayBufferLike, and the fields that receive it are read in loops that
  // assume a normal buffer.
  private left: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private right: Float32Array<ArrayBufferLike> = new Float32Array(0);
  /**
   * Playhead in FILE frames, fractional.
   *
   * It has to be fractional because the file's sample rate and the device's
   * are frequently different — a 44.1k track on the 48k context most browsers
   * open by default. Reading one frame per output sample, as this did, plays
   * the track 8.84% fast: a measured 440Hz tone came out at 481Hz, a semitone
   * and a half sharp, and the playhead ran ahead of the waveform it was drawn
   * over. Worse, the export path uses the file's own rate and is correct, so
   * what the operator auditioned was not what they shipped.
   */
  private position = 0;
  private fileRate = 0;
  private playing = false;
  private looping = true;
  private mastered = true;
  private blocks = 0;
  private peak = 0;

  /** Scratch so process() allocates nothing on the audio thread. */
  private dryL = new Float32Array(128);
  private dryR = new Float32Array(128);

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<MasterCommand>) => {
      const msg = event.data;
      switch (msg.type) {
        case "load":
          this.left = msg.left;
          this.right = msg.right;
          this.fileRate = msg.sampleRate > 0 ? msg.sampleRate : sampleRate;
          this.position = 0;
          this.chain.reset();
          break;
        case "settings":
          this.chain.setSettings(msg.settings);
          break;
        case "transport":
          // Rewind first when the file has already finished. Without this the
          // non-looping transport is permanently dead after one pass: play
          // sets playing = true, the very next sample finds the playhead past
          // the end, and sets it straight back to false. The button looked
          // broken and the only escape was seeking or reloading.
          if (msg.playing && this.position >= this.left.length) {
            this.position = 0;
            this.chain.reset();
          }
          this.playing = msg.playing && this.left.length > 0;
          break;
        case "loop":
          this.looping = msg.loop;
          break;
        case "seek":
          this.position = Math.min(Math.max(0, msg.frame), this.left.length);
          // The chain's delay lines hold audio from before the jump; without
          // this, seeking plays a few milliseconds of the old position first.
          this.chain.reset();
          break;
        case "mastered":
          this.mastered = msg.mastered;
          this.chain.reset();
          break;
        case "reset":
          this.position = 0;
          this.chain.reset();
          break;
      }
    };
  }

  private ensureScratch(size: number): void {
    if (this.dryL.length !== size) {
      this.dryL = new Float32Array(size);
      this.dryR = new Float32Array(size);
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : outL;
    const size = outL.length;

    if (!this.playing || this.left.length === 0) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      this.report(size);
      return true;
    }

    this.ensureScratch(size);
    const frames = this.left.length;
    // Frames of the file per output sample. Exactly 1 when the rates agree,
    // and then `position` stays integral and the read below is the sample
    // itself with no interpolation at all — the common case is bit-exact.
    const step = this.fileRate > 0 ? this.fileRate / sampleRate : 1;

    for (let i = 0; i < size; i++) {
      if (this.position >= frames) {
        if (this.looping) {
          this.position -= frames;
        } else {
          this.dryL[i] = 0;
          this.dryR[i] = 0;
          if (this.playing) {
            this.playing = false;
            const ended: MasterEnded = { type: "ended" };
            this.port.postMessage(ended);
          }
          continue;
        }
      }
      const i0 = Math.floor(this.position);
      const frac = this.position - i0;
      // Wrapping the far sample keeps a loop seamless instead of dipping to
      // the first frame's value at the join.
      const i1 = i0 + 1 < frames ? i0 + 1 : this.looping ? 0 : i0;
      this.dryL[i] = this.left[i0] + (this.left[i1] - this.left[i0]) * frac;
      this.dryR[i] = this.right[i0] + (this.right[i1] - this.right[i0]) * frac;
      this.position += step;
    }

    if (this.mastered) {
      this.chain.process(this.dryL, this.dryR, outL, outR);
    } else {
      // RAW plays the file, not a neutral pass through the chain: a neutral
      // chain still adds the limiter's lookahead delay, and an A/B where one
      // side is milliseconds late sounds different for that reason alone.
      outL.set(this.dryL);
      if (outR !== outL) outR.set(this.dryR);
      // The chain did not run, so it has not seen these samples; meter them
      // explicitly or the loudness reading goes blank on the RAW side.
      this.chain.meterOnly(outL, outR);
    }

    // Both channels. Reading only the left one hid anything peaking on the
    // right: a file silent on the left and at 0.9 on the right metered as
    // zero, so the operator saw an empty bar on material a decibel from
    // clipping.
    for (let i = 0; i < size; i++) {
      const a = Math.abs(outL[i]);
      if (a > this.peak) this.peak = a;
      if (outR !== outL) {
        const b = Math.abs(outR[i]);
        if (b > this.peak) this.peak = b;
      }
    }
    this.report(size);
    return true;
  }

  private report(_size: number): void {
    if (++this.blocks < STATUS_EVERY_BLOCKS) return;
    this.blocks = 0;
    const meters = this.chain.meters;
    const status: MasterStatus = {
      type: "status",
      frame: Math.round(this.position),
      frames: this.left.length,
      rateRatio: this.fileRate > 0 ? this.fileRate / sampleRate : 1,
      playing: this.playing,
      peak: this.peak,
      momentaryLufs: meters.momentaryLufs,
      shortTermLufs: meters.shortTermLufs,
      gainReductionDb: meters.gainReductionDb,
      bandReductionDb: meters.bandReductionDb,
    };
    this.port.postMessage(status);
    this.peak = 0;
  }
}

registerProcessor("master-processor", MasterProcessor);
