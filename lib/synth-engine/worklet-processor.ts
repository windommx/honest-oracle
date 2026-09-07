// ╔══════════════════════════════════════════════════════════════════╗
// ║  AUDIO WORKLET — the browser's entry point into the engine.       ║
// ║                                                                    ║
// ║  This file is BUNDLED to public/synth-worklet.js by                ║
// ║  scripts/build-worklet.ts, because an AudioWorklet module is       ║
// ║  loaded by URL into its own realm: it cannot import from the app   ║
// ║  bundle, and bare specifiers do not resolve inside it. Bundling    ║
// ║  from this source is what keeps the audio thread running the SAME  ║
// ║  code the test suite runs, rather than a hand-maintained copy that ║
// ║  drifts — a guard test fails the build if the two disagree.        ║
// ║                                                                    ║
// ║  Everything below the message handler is the engine untouched. The ║
// ║  worklet's whole job is: receive patch and note messages, call     ║
// ║  render(), and report a little state back for the meters.          ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Synth, type PulseSettings } from "./synth";
import type { PatchUpdate } from "./types";

/** Messages the UI thread sends in. */
export type WorkletCommand =
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "patch"; patch: PatchUpdate }
  | { type: "allNotesOff" }
  | { type: "pulse"; pulse: Partial<PulseSettings> }
  | { type: "panic" };

/** Messages the worklet sends back. */
export interface WorkletStatus {
  type: "status";
  activeVoices: number;
  /** Peak absolute sample in the last block, for a meter. */
  peak: number;
}

// `registerProcessor`, `AudioWorkletProcessor` and `sampleRate` are globals that
// exist only inside the worklet realm, so they are declared rather than imported.
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare const AudioWorkletProcessor: {
  new (): { readonly port: MessagePort };
};

/** How often to post a status message back, in render blocks (~128 samples each).
 *  Every block would be ~375 messages a second per meter — enough postMessage
 *  traffic to cost more than the DSP. */
const STATUS_EVERY_BLOCKS = 8;

class SynthProcessor extends AudioWorkletProcessor {
  private readonly synth = new Synth(sampleRate);
  private blocks = 0;
  private peak = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletCommand>) => {
      const msg = event.data;
      switch (msg.type) {
        case "noteOn":
          this.synth.noteOn(msg.note, msg.velocity);
          break;
        case "noteOff":
          this.synth.noteOff(msg.note);
          break;
        case "patch":
          this.synth.setPatch(msg.patch);
          break;
        case "allNotesOff":
          this.synth.allNotesOff();
          break;
        case "pulse":
          this.synth.setPulse(msg.pulse);
          break;
        case "panic":
          this.synth.panic();
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    // A mono output bus still has to be filled; render into left twice rather
    // than leaving the second channel silent.
    const right = output.length > 1 ? output[1] : left;
    this.synth.render(left, right);

    for (let i = 0; i < left.length; i++) {
      const a = Math.abs(left[i]);
      if (a > this.peak) this.peak = a;
    }

    if (++this.blocks >= STATUS_EVERY_BLOCKS) {
      this.blocks = 0;
      const status: WorkletStatus = {
        type: "status",
        activeVoices: this.synth.activeVoiceCount,
        peak: this.peak,
      };
      this.port.postMessage(status);
      this.peak = 0;
    }

    // Never return false: that permanently ends the processor, and a synth with
    // no notes held has to stay alive waiting for the next one.
    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);
