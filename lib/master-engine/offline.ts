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
import { integratedLufs } from "./loudness";
import { truePeak } from "./limiter";
import { gainToDb, type MasterSettings } from "./types";
import { MAX_SAMPLE_RATE, MIN_SAMPLE_RATE } from "@/lib/audio-io/wav";

/** Refuse to render more than this at once. A two-hour file at 48kHz stereo
 *  is 1.4GB of Float32 and would take the tab down. */
export const MAX_MASTER_SECONDS = 1800;

export interface MasterRenderOptions {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  settings: MasterSettings;
  /** The delivery loudness the audit compares against. */
  targetLufs?: number;
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
  chain.process(inL, inR, wetL, wetR);

  // Drop the latency from the front: what is left lines up sample for sample
  // with the input.
  const outL = wetL.slice(latency, latency + frames);
  const outR = wetR.slice(latency, latency + frames);

  applyFades([outL, outR], sampleRate, settings.fadeInSeconds, settings.fadeOutSeconds);

  const channels = [outL, outR];
  return {
    left: outL,
    right: outR,
    sampleRate,
    seconds,
    integratedLufs: integratedLufs(channels, sampleRate),
    truePeakDb: gainToDb(truePeak(channels)),
    audit: auditMaster(channels, sampleRate, { targetLufs: options.targetLufs ?? -14 }),
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
