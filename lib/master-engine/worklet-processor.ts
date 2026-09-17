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
  /** Two channels of the whole file, transferred rather than copied. */
  | { type: "load"; left: Float32Array; right: Float32Array }
  | { type: "settings"; settings: MasterUpdate }
  | { type: "transport"; playing: boolean }
  | { type: "loop"; loop: boolean }
  | { type: "seek"; frame: number }
  /** False plays the file untouched — the A/B. */
  | { type: "mastered"; mastered: boolean }
  | { type: "reset" };

export interface MasterStatus {
  type: "status";
  /** Playhead, in frames. */
  frame: number;
  frames: number;
  playing: boolean;
  peak: number;
  momentaryLufs: number;
  shortTermLufs: number;
  gainReductionDb: number;
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
  private frame = 0;
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
          this.frame = 0;
          this.chain.reset();
          break;
        case "settings":
          this.chain.setSettings(msg.settings);
          break;
        case "transport":
          this.playing = msg.playing && this.left.length > 0;
          break;
        case "loop":
          this.looping = msg.loop;
          break;
        case "seek":
          this.frame = Math.min(Math.max(0, Math.round(msg.frame)), this.left.length);
          // The chain's delay lines hold audio from before the jump; without
          // this, seeking plays a few milliseconds of the old position first.
          this.chain.reset();
          break;
        case "mastered":
          this.mastered = msg.mastered;
          this.chain.reset();
          break;
        case "reset":
          this.frame = 0;
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
    for (let i = 0; i < size; i++) {
      if (this.frame >= frames) {
        if (this.looping) {
          this.frame = 0;
        } else {
          this.dryL[i] = 0;
          this.dryR[i] = 0;
          this.playing = false;
          continue;
        }
      }
      this.dryL[i] = this.left[this.frame];
      this.dryR[i] = this.right[this.frame];
      this.frame++;
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

    for (let i = 0; i < size; i++) {
      const a = Math.abs(outL[i]);
      if (a > this.peak) this.peak = a;
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
      frame: this.frame,
      frames: this.left.length,
      playing: this.playing,
      peak: this.peak,
      momentaryLufs: meters.momentaryLufs,
      shortTermLufs: meters.shortTermLufs,
      gainReductionDb: meters.gainReductionDb,
    };
    this.port.postMessage(status);
    this.peak = 0;
  }
}

registerProcessor("master-processor", MasterProcessor);
