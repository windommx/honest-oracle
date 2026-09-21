// ╔══════════════════════════════════════════════════════════════════╗
// ║  LOADING A FILE — two routes, and a reason for each.              ║
// ║                                                                    ║
// ║  WAV goes through lib/audio-io, which is pure TypeScript and       ║
// ║  therefore testable: the decoder that reads a 24-bit file with a   ║
// ║  LIST chunk in front of the audio has tests that build exactly     ║
// ║  that file. It also needs no AudioContext, so a file can be        ║
// ║  loaded and mastered and exported before the user has ever pressed ║
// ║  a button that browsers require for audio.                         ║
// ║                                                                    ║
// ║  Everything else — mp3, m4a, flac, ogg — goes through the          ║
// ║  browser's own decodeAudioData, because writing an mp3 decoder to  ║
// ║  avoid a dependency would be the wrong trade by a wide margin.     ║
// ║  That route needs an AudioContext, and the page says so rather     ║
// ║  than failing quietly.                                             ║
// ╚══════════════════════════════════════════════════════════════════╝

"use client";

import { decodeWav, toStereo, MAX_SAMPLE_RATE, MIN_SAMPLE_RATE } from "@/lib/audio-io/wav";

export interface LoadedAudio {
  name: string;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  seconds: number;
  /** How it was read, so the UI can be specific about what it did. */
  via: "wav" | "browser";
  /** Source bit depth, when the file said. */
  bitDepth?: number;
  /** Non-finite samples the decoder replaced with silence. A float file can
   *  carry a NaN, and one is enough to leave every later sample NaN; the page
   *  says the file was damaged rather than pretending it was fine. */
  repairedSamples: number;
}

/** Extensions handled without an AudioContext. */
const NATIVE = [".wav", ".wave"];

export function isWavName(name: string): boolean {
  const lower = name.toLowerCase();
  return NATIVE.some((ext) => lower.endsWith(ext));
}

/** What the file input should accept. Anything the browser can decode works;
 *  these are the ones worth naming. */
export const ACCEPTED_FILES = ".wav,.wave,.mp3,.m4a,.aac,.flac,.ogg,.opus,.webm,audio/*";

export class UnsupportedAudioError extends Error {}

/**
 * Read a dropped or chosen file into two channels.
 *
 * `makeContext` is injected rather than created here so the caller controls
 * when an AudioContext comes into existence — browsers refuse to start one
 * outside a user gesture, and creating one eagerly leaves a suspended context
 * that silently decodes nothing.
 */
export async function loadAudioFile(
  file: File,
  makeContext: () => BaseAudioContext | null
): Promise<LoadedAudio> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isWavName(file.name) || looksLikeRiff(bytes)) {
    const decoded = decodeWav(bytes);
    const { left, right } = toStereo(decoded.channels);
    return {
      name: file.name,
      left,
      right,
      sampleRate: decoded.sampleRate,
      seconds: left.length / decoded.sampleRate,
      via: "wav",
      bitDepth: decoded.bitDepth,
      repairedSamples: decoded.repairedSamples,
    };
  }

  const ctx = makeContext();
  if (!ctx) {
    throw new UnsupportedAudioError(
      "ไฟล์นี้ต้องให้เบราว์เซอร์ช่วยถอดรหัส — กดปุ่มเล่นหนึ่งครั้งก่อนแล้วลองใหม่"
    );
  }

  let buffer: AudioBuffer;
  try {
    // The ArrayBuffer is detached by decodeAudioData, so a fresh copy is
    // passed — otherwise a retry after a failure has nothing left to read.
    buffer = await ctx.decodeAudioData(bytes.slice().buffer);
  } catch {
    throw new UnsupportedAudioError(`เบราว์เซอร์ถอดรหัส ${file.name} ไม่ได้`);
  }

  if (!(buffer.sampleRate >= MIN_SAMPLE_RATE && buffer.sampleRate <= MAX_SAMPLE_RATE)) {
    throw new UnsupportedAudioError(`อัตราสุ่มของไฟล์ (${buffer.sampleRate} Hz) อยู่นอกช่วงที่รองรับ`);
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const { left, right } = toStereo(channels);

  // The browser's decoders are not immune either — a corrupt frame can come
  // back as NaN, and the chain has no way to recover from one.
  let repairedSamples = 0;
  for (const ch of [left, right]) {
    for (let i = 0; i < ch.length; i++) {
      if (!Number.isFinite(ch[i])) {
        ch[i] = 0;
        repairedSamples++;
      }
    }
  }

  return {
    name: file.name,
    left,
    right,
    sampleRate: buffer.sampleRate,
    seconds: buffer.duration,
    via: "browser",
    repairedSamples,
  };
}

/** A .bin or a misnamed file can still be a RIFF; check the bytes, not only
 *  the extension. */
function looksLikeRiff(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  );
}
