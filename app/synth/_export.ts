// ╔══════════════════════════════════════════════════════════════════╗
// ║  EXPORT — render the pattern offline and hand the user a file.    ║
// ║                                                                    ║
// ║  The usual browser approach is MediaRecorder: play the loop in     ║
// ║  real time, record the output, get compressed WebM. That takes as  ║
// ║  long as the music, loses quality, and bakes in any dropout the    ║
// ║  audio thread had on the way past.                                 ║
// ║                                                                    ║
// ║  This renders the same engine with no device attached — measured   ║
// ║  at roughly 13x real time on a busy four-note pattern — and writes ║
// ║  uncompressed 16-bit PCM. It runs on the main thread, so the page  ║
// ║  is unresponsive for the duration; that is a fraction of a second  ║
// ║  for a normal loop, and the caller shows a rendering state anyway. ║
// ╚══════════════════════════════════════════════════════════════════╝

"use client";

import { renderPattern } from "@/lib/synth-engine/offline";
import { encodeWav, wavFilename } from "@/lib/synth-engine/wav";
import type { SequencerPattern } from "@/lib/synth-engine/sequencer";
import type { SynthPatch } from "@/lib/synth-engine/types";

/** Times through the loop a file contains. One repeat of a two-second loop is
 *  not something anyone can use; two gives it a shape. */
export const EXPORT_REPEATS = 2;

export interface ExportRequest {
  pattern: SequencerPattern;
  patch: SynthPatch;
  presetName: string;
  sampleRate: number;
  repeats?: number;
}

export interface ExportResult {
  filename: string;
  seconds: number;
  /** Loudest sample in the file, 0..1. */
  peak: number;
  byteLength: number;
}

/** Render, encode, and start the download. Throws whatever renderPattern
 *  throws — the caller reports it rather than this swallowing it. */
export function exportPatternToWav(request: ExportRequest): ExportResult {
  const render = renderPattern({
    pattern: request.pattern,
    patch: request.patch,
    sampleRate: request.sampleRate,
    repeats: request.repeats ?? EXPORT_REPEATS,
  });

  const bytes = encodeWav([render.left, render.right], render.sampleRate);
  const filename = wavFilename(`synthpro-${request.presetName || "patch"}-${Math.round(request.pattern.bpm)}bpm`);

  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in some browsers; one turn of
  // the event loop is enough for the click to have been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return { filename, seconds: render.seconds, peak: render.peak, byteLength: bytes.byteLength };
}
