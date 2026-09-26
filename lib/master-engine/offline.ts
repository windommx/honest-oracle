// ╔══════════════════════════════════════════════════════════════════╗
// ║  OFFLINE MASTER — the whole file at once, with no device.         ║
// ║                                                                    ║
// ║  Same property as the synth's exporter, for the same reason: the   ║
// ║  chain is a pure function, so mastering a file is just running it  ║
// ║  with nothing attached. Faster than the audio, bit-exact, and      ║
// ║  identical on every run.                                           ║
// ║                                                                    ║
// ║  It also means the numbers under the export are measured on the    ║
// ║  BYTES BEING WRITTEN rather than on whatever the meter happened to ║
// ║  be showing when the operator pressed the button. A LUFS reading   ║
// ║  taken from a live playhead is a reading of one moment; this one   ║
// ║  is the file.                                                      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { MasterChain, applyFades } from "./chain";
import { auditMaster, type AuditResult } from "./audit";
import type { MasterSettings } from "./types";
import { MAX_SAMPLE_RATE, MIN_SAMPLE_RATE } from "@/lib/audio-io/wav";

/** Refuse to render more than this at once. A two-hour file at 48kHz stereo
 *  is 1.4GB of Float32 and would take the tab down. */
export const MAX_MASTER_SECONDS = 1800;

/** How far along a render is, and at which of its two phases.
 *
 *  Two phases rather than one bar, because they are not the same kind of
 *  work and pretending otherwise would be a lie told by the progress bar:
 *  the chain runs sample by sample and its position IS known, while the
 *  audit is three whole-file passes with no useful interior position. The UI
 *  shows a real bar for the first and says what it is doing for the second. */
export interface RenderProgress {
  phase: "render" | "measure";
  /** 0..1 within the phase. The measure phase only ever reports 0 and 1. */
  fraction: number;
}

/** Frames per chunk of the render loop.
 *
 *  Only a reporting granularity: the chain is sample-serial and holds all its
 *  state internally, so chunking cannot change the output — which
 *  offline.test.ts asserts byte for byte rather than assuming. 2^16 frames is
 *  ~1.4s of audio at 48kHz, so a three-minute track reports about 130 times:
 *  often enough to look continuous, rarely enough that the postMessage
 *  traffic is nothing next to the DSP. */
export const RENDER_CHUNK_FRAMES = 1 << 16;

export interface MasterRenderOptions {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  settings: MasterSettings;
  /** The delivery loudness the audit compares against. */
  targetLufs?: number;
  /** Called as the work advances. Synchronous — on the main thread it runs
   *  inside the same blocking call and can only feed a worker's postMessage
   *  or a test; it is the worker that makes it visible. */
  onProgress?: (progress: RenderProgress) => void;
}

export interface MasterRender {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  seconds: number;
  integratedLufs: number;
  truePeakDb: number;
  audit: AuditResult;
  /** Wall-clock milliseconds the render took, for the UI to report honestly. */
  elapsedMs: number;
}

/**
 * Master a whole buffer.
 *
 * The chain's latency is compensated here rather than left in the file: the
 * limiter's lookahead and Analog Life's delay together would otherwise push
 * the audio a few milliseconds late relative to the original, which shows up
 * as flam the moment anyone lines the two up.
 */
export function renderMaster(options: MasterRenderOptions): MasterRender {
  const { left, right, sampleRate, settings } = options;
  // Checked here as well as in the decoder: this function is also reachable
  // from the browser's own decodeAudioData, whose rate comes from a container
  // this code never parsed.
  if (!(sampleRate >= MIN_SAMPLE_RATE && sampleRate <= MAX_SAMPLE_RATE)) {
    throw new RangeError(`sample rate ${sampleRate} Hz is outside the range this can process`);
  }
  const frames = Math.min(left.length, right.length);
  const seconds = frames / sampleRate;
  if (seconds > MAX_MASTER_SECONDS) {
    throw new RangeError(`file is ${Math.round(seconds)}s; the limit is ${MAX_MASTER_SECONDS}s`);
  }

  const started = Date.now();
  const chain = new MasterChain(sampleRate, settings);
  const latency = chain.latencySamples;

  // Render past the end by the chain's latency, so the tail that is still
  // inside the delay lines comes out rather than being cut off.
  const padded = frames + latency;
  const inL = new Float32Array(padded);
  const inR = new Float32Array(padded);
  inL.set(left.subarray(0, frames), 0);
  inR.set(right.subarray(0, frames), 0);

  const wetL = new Float32Array(padded);
  const wetR = new Float32Array(padded);
  const report = options.onProgress;
  report?.({ phase: "render", fraction: 0 });
  for (let at = 0; at < padded; at += RENDER_CHUNK_FRAMES) {
    const to = Math.min(padded, at + RENDER_CHUNK_FRAMES);
    // Views, not copies: subarray shares the buffer, so this is the same
    // memory the single call would have written.
    chain.process(
      inL.subarray(at, to),
      inR.subarray(at, to),
      wetL.subarray(at, to),
      wetR.subarray(at, to)
    );
    report?.({ phase: "render", fraction: to / padded });
  }

  // Drop the latency from the front: what is left lines up sample for sample
  // with the input.
  const outL = wetL.slice(latency, latency + frames);
  const outR = wetR.slice(latency, latency + frames);

  applyFades([outL, outR], sampleRate, settings.fadeInSeconds, settings.fadeOutSeconds);

  // The audit already measures both of these, and both are expensive: the
  // loudness pass allocates four arrays the length of the file and the true
  // peak pass evaluates four interpolations per sample per channel. Computing
  // them again here doubled the cost and the peak memory of every measure and
  // every export, on the main thread, inside one animation frame.
  report?.({ phase: "measure", fraction: 0 });
  const audit = auditMaster([outL, outR], sampleRate, { targetLufs: options.targetLufs ?? -14 });
  report?.({ phase: "measure", fraction: 1 });
  return {
    left: outL,
    right: outR,
    sampleRate,
    seconds,
    integratedLufs: audit.measurements.integratedLufs,
    truePeakDb: audit.measurements.truePeakDb,
    audit,
    elapsedMs: Date.now() - started,
  };
}

/** Peak buckets for a waveform display — min and max per pixel column.
 *
 *  Drawing every sample is both slow and wrong: at any realistic width a
 *  column covers thousands of samples, and picking one of them makes a
 *  waveform that changes shape when the window is resized. */
export function waveformPeaks(
  channels: Float32Array[],
  buckets: number
): { min: Float32Array; max: Float32Array } {
  const count = Math.max(1, Math.floor(buckets));
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  const frames = channels.length === 0 ? 0 : channels[0].length;
  if (frames === 0) return { min, max };

  const per = frames / count;
  for (let b = 0; b < count; b++) {
    const from = Math.floor(b * per);
    const to = Math.min(frames, Math.max(from + 1, Math.floor((b + 1) * per)));
    let lo = Infinity;
    let hi = -Infinity;
    for (const ch of channels) {
      for (let i = from; i < to; i++) {
        const v = ch[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = Number.isFinite(lo) ? lo : 0;
    max[b] = Number.isFinite(hi) ? hi : 0;
  }
  return { min, max };
}
