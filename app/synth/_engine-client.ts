// ╔══════════════════════════════════════════════════════════════════╗
// ║  ENGINE CLIENT — the UI thread's handle on the audio thread.      ║
// ║                                                                    ║
// ║  The DSP runs in an AudioWorklet, which means it runs on a         ║
// ║  real-time thread that must never block. That is the whole reason  ║
// ║  for the arrangement: a synth driven from the main thread stutters ║
// ║  whenever React renders, and React renders on every knob move.     ║
// ║                                                                    ║
// ║  So nothing here computes audio. It loads the bundled worklet,     ║
// ║  posts messages, and reads back a little state for the meters.     ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { PatchUpdate, SynthPatch } from "@/lib/synth-engine/types";
import type { WorkletCommand, WorkletStatus } from "@/lib/synth-engine/worklet-processor";

/** Where scripts/build-worklet.ts writes the bundle. */
const WORKLET_URL = "/synth-worklet.js";

export type EngineState = "idle" | "starting" | "running" | "unsupported" | "failed";

export interface EngineStatus {
  activeVoices: number;
  peak: number;
}

export function audioWorkletSupported(): boolean {
  if (typeof window === "undefined") return false;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return typeof Ctor === "function" && typeof AudioWorkletNode === "function";
}

export class SynthClient {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  // Typed as backed by a plain ArrayBuffer: getFloatFrequencyData refuses a
  // possibly-shared buffer, and the default Float32Array type allows one.
  private spectrum = new Float32Array(new ArrayBuffer(0));

  onStatus: ((s: EngineStatus) => void) | null = null;

  get running(): boolean {
    return this.node !== null;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 0;
  }

  /**
   * Start audio. Must be called from a user gesture — browsers refuse to start
   * an AudioContext otherwise, and one created outside a gesture arrives
   * suspended with no error anywhere.
   */
  async start(patch: SynthPatch): Promise<EngineState> {
    if (this.node) return "running";
    if (!audioWorkletSupported()) return "unsupported";

    try {
      const Ctor =
        window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      const ctx = new Ctor();
      // Even from a gesture a context can arrive suspended (Safari, and Chrome
      // under some autoplay settings). Without this the whole session runs in
      // silence with nothing reported anywhere.
      if (ctx.state === "suspended") await ctx.resume();

      await ctx.audioWorklet.addModule(WORKLET_URL);

      const node = new AudioWorkletNode(ctx, "synth-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.82;
      this.spectrum = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));

      node.connect(analyser);
      analyser.connect(ctx.destination);

      node.port.onmessage = (event: MessageEvent<WorkletStatus>) => {
        if (event.data?.type === "status") {
          this.onStatus?.({ activeVoices: event.data.activeVoices, peak: event.data.peak });
        }
      };

      this.ctx = ctx;
      this.node = node;
      this.analyser = analyser;

      this.send({ type: "patch", patch });
      return "running";
    } catch {
      // A blocked worklet fetch, a refused context, an unsupported option — all
      // land here, and all mean the same thing to the page: no sound.
      await this.stop();
      return "failed";
    }
  }

  private send(command: WorkletCommand): void {
    this.node?.port.postMessage(command);
  }

  noteOn(note: number, velocity = 1): void {
    this.send({ type: "noteOn", note, velocity });
  }

  noteOff(note: number): void {
    this.send({ type: "noteOff", note });
  }

  setPatch(patch: PatchUpdate): void {
    this.send({ type: "patch", patch });
  }

  allNotesOff(): void {
    this.send({ type: "allNotesOff" });
  }

  panic(): void {
    this.send({ type: "panic" });
  }

  /** Magnitudes in dB, one per FFT bin. The array is reused between calls, so
   *  the caller must read it before the next frame rather than retaining it. */
  readSpectrum(): Float32Array {
    if (!this.analyser) return this.spectrum;
    this.analyser.getFloatFrequencyData(this.spectrum);
    return this.spectrum;
  }

  async stop(): Promise<void> {
    this.panic();
    this.node?.disconnect();
    this.analyser?.disconnect();
    this.node = null;
    this.analyser = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") {
      try {
        await ctx.close();
      } catch {
        /* already closing */
      }
    }
  }
}
