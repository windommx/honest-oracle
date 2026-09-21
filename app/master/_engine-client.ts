// ╔══════════════════════════════════════════════════════════════════╗
// ║  MASTER CLIENT — the UI thread's handle on the mastering chain.   ║
// ║                                                                    ║
// ║  Same shape as app/synth's client and for the same reason: the     ║
// ║  DSP runs on a real-time thread that must never block, and React   ║
// ║  renders on every knob move.                                       ║
// ║                                                                    ║
// ║  One difference worth naming. The whole decoded file is sent into  ║
// ║  the worklet once, TRANSFERRED rather than copied, so a five-      ║
// ║  minute track does not cost 50MB of structured-clone on every      ║
// ║  load. Transfer means the main thread loses its copy, so the page  ║
// ║  keeps its own reference for the waveform and the exporter and     ║
// ║  sends a duplicate.                                                ║
// ╚══════════════════════════════════════════════════════════════════╝

"use client";

import type { MasterCommand, MasterEnded, MasterStatus } from "@/lib/master-engine/worklet-processor";
import type { MasterSettings, MasterUpdate } from "@/lib/master-engine/types";

const WORKLET_URL = "/master-worklet.js";

export type EngineState = "idle" | "running" | "unsupported" | "failed";

export interface MasterEngineStatus {
  /** In FILE frames, so it indexes the waveform directly. */
  frame: number;
  frames: number;
  playing: boolean;
  peak: number;
  momentaryLufs: number;
  shortTermLufs: number;
  gainReductionDb: number;
  /** 1 when the device is running at the file's own rate. Anything else means
   *  the audition is being resampled and does not match the export exactly. */
  rateRatio: number;
}

export function audioWorkletSupported(): boolean {
  if (typeof window === "undefined") return false;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return typeof Ctor === "function" && typeof AudioWorkletNode === "function";
}

export class MasterClient {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private spectrum = new Float32Array(new ArrayBuffer(0));

  onStatus: ((s: MasterEngineStatus) => void) | null = null;
  /** Fired once when a non-looping file runs out. An event, not a level —
   *  see the note on MasterEnded. */
  onEnded: (() => void) | null = null;

  get running(): boolean {
    return this.node !== null;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 0;
  }

  /** An AudioContext for decodeAudioData, created without starting playback.
   *  Returns null before start() — the caller reports that rather than
   *  creating one outside a gesture, which arrives suspended and decodes
   *  nothing with no error anywhere. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Start audio, asking for a particular sample rate when one is known.
   *
   * Opening the context at the FILE's rate is what makes the audition and the
   * export the same computation: the chain is built at the context rate, so
   * when the two agree there is no resampling anywhere and the EQ curve on
   * screen is the filter the export will use. Browsers may refuse the
   * requested rate — the worklet then resamples and says so rather than
   * playing the track sharp.
   */
  async start(settings: MasterSettings, preferredSampleRate?: number): Promise<EngineState> {
    if (this.node) return "running";
    if (!audioWorkletSupported()) return "unsupported";

    try {
      const Ctor =
        window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      let ctx: AudioContext;
      try {
        ctx = preferredSampleRate ? new Ctor({ sampleRate: preferredSampleRate }) : new Ctor();
      } catch {
        // Some browsers and some hardware refuse an explicit rate outright.
        ctx = new Ctor();
      }
      if (ctx.state === "suspended") await ctx.resume();

      await ctx.audioWorklet.addModule(WORKLET_URL);
      const node = new AudioWorkletNode(ctx, "master-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.8;
      this.spectrum = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));

      node.connect(analyser);
      analyser.connect(ctx.destination);

      node.port.onmessage = (event: MessageEvent<MasterStatus | MasterEnded>) => {
        const data = event.data;
        if (data?.type === "ended") {
          this.onEnded?.();
          return;
        }
        if (data?.type !== "status") return;
        this.onStatus?.({
          frame: data.frame,
          frames: data.frames,
          playing: data.playing,
          peak: data.peak,
          momentaryLufs: data.momentaryLufs,
          shortTermLufs: data.shortTermLufs,
          gainReductionDb: data.gainReductionDb,
          rateRatio: data.rateRatio,
        });
      };

      this.ctx = ctx;
      this.node = node;
      this.analyser = analyser;
      this.send({ type: "settings", settings });
      return "running";
    } catch {
      await this.stop();
      return "failed";
    }
  }

  private send(command: MasterCommand, transfer?: Transferable[]): void {
    this.node?.port.postMessage(command, transfer ?? []);
  }

  /** Hand the file to the audio thread. Copies are made here because the
   *  buffers are transferred and the page still needs its own. The file's own
   *  sample rate goes with them — the device's may differ. */
  load(left: Float32Array, right: Float32Array, sampleRate: number): void {
    const l = Float32Array.from(left);
    const r = Float32Array.from(right);
    this.send({ type: "load", left: l, right: r, sampleRate }, [l.buffer, r.buffer]);
  }

  setSettings(settings: MasterUpdate): void {
    this.send({ type: "settings", settings });
  }

  setPlaying(playing: boolean): void {
    this.send({ type: "transport", playing });
  }

  setLoop(loop: boolean): void {
    this.send({ type: "loop", loop });
  }

  seek(frame: number): void {
    this.send({ type: "seek", frame });
  }

  setMastered(mastered: boolean): void {
    this.send({ type: "mastered", mastered });
  }

  /** Magnitudes in dB per FFT bin. Reused between calls. */
  readSpectrum(): Float32Array {
    if (!this.analyser) return this.spectrum;
    this.analyser.getFloatFrequencyData(this.spectrum);
    return this.spectrum;
  }

  async stop(): Promise<void> {
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
