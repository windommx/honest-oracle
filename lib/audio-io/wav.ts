// ╔══════════════════════════════════════════════════════════════════╗
// ║  WAV — the full codec, shared by every product that touches a     ║
// ║  file.                                                             ║
// ║                                                                    ║
// ║  Lifted out of lib/synth-engine/wav.ts, which handled exactly the  ║
// ║  files it had written itself: stereo, 16-bit, header at offset 0,  ║
// ║  data at offset 36. That is fine for an exporter and wrong for an  ║
// ║  importer. Real files carry LIST/INFO chunks from the DAW that     ║
// ║  made them, `fact` chunks, and cue points, so the data chunk is    ║
// ║  rarely at 36; they arrive at 24-bit from an interface or 32-bit   ║
// ║  float from a bounce; and a lot of them declare                    ║
// ║  WAVE_FORMAT_EXTENSIBLE rather than plain PCM.                     ║
// ║                                                                    ║
// ║  Every one of those is a file a user would drag in and be told was ║
// ║  "not a WAV file", so each is handled and each has a test that     ║
// ║  builds that exact shape of file and reads it back.                ║
// ╚══════════════════════════════════════════════════════════════════╝

/** 16 and 24 are integer PCM; 32 means IEEE float. */
export type BitDepth = 16 | 24 | 32;

/**
 * Sample rates a file is allowed to declare.
 *
 * A WAV header is untrusted input — it is whatever bytes the user dragged in.
 * A file declaring 0 Hz used to pass straight through into the engine, where
 * every time constant is computed as `seconds * sampleRate` and every filter
 * corner as a fraction of it; the result was an allocation failure several
 * layers away from the actual cause. Bad headers are refused here, once, with
 * a message that names the file rather than the maths.
 */
export const MIN_SAMPLE_RATE = 4000;
export const MAX_SAMPLE_RATE = 768000;

const HEADER_BYTES = 44;
const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

const INT16_SCALE = 32767;
const INT24_SCALE = 8388607;

export interface DecodedWav {
  sampleRate: number;
  channels: Float32Array[];
  bitDepth: number;
  /** True when the samples were stored as IEEE floats. */
  float: boolean;
}

function ascii(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

/**
 * Encode to RIFF/WAVE.
 *
 * Returns Uint8Array<ArrayBuffer> rather than the default Uint8Array: the
 * default permits a SharedArrayBuffer, and both Blob and fetch refuse one.
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: BitDepth = 16
): Uint8Array<ArrayBuffer> {
  if (channels.length === 0) throw new RangeError("encodeWav needs at least one channel");
  const frames = channels[0].length;
  for (const ch of channels) {
    if (ch.length !== frames) throw new RangeError("every channel must be the same length");
  }

  const channelCount = channels.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channelCount * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const format = bitDepth === 32 ? FORMAT_FLOAT : FORMAT_PCM;

  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  tag(0, "RIFF");
  // Everything after this field — the first 8 header bytes are excluded.
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");

  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  tag(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < channelCount; c++) {
      const raw = channels[c][frame];
      if (bitDepth === 32) {
        view.setFloat32(offset, raw, true);
        offset += 4;
        continue;
      }
      // Clamp before scaling: a sample above 1 would wrap to a large negative
      // value, heard as a loud click rather than as clipping.
      const sample = Math.max(-1, Math.min(1, raw));
      if (bitDepth === 16) {
        view.setInt16(offset, Math.round(sample * INT16_SCALE), true);
        offset += 2;
      } else {
        const v = Math.round(sample * INT24_SCALE);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Uint8Array(buffer);
}

/**
 * Decode any reasonable RIFF/WAVE file.
 *
 * Walks the chunk list rather than assuming offsets, so a file with a LIST or
 * fact chunk before `data` reads correctly instead of decoding metadata as
 * audio — which is not an error, it is a burst of noise.
 */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) throw new RangeError("file is too short to be a WAV");
  if (ascii(view, 0) !== "RIFF" || ascii(view, 8) !== "WAVE") throw new RangeError("not a RIFF/WAVE file");

  let format = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bitDepth = 0;
  let dataStart = -1;
  let dataBytes = 0;

  let cursor = 12;
  while (cursor + 8 <= bytes.byteLength) {
    const id = ascii(view, cursor);
    const size = view.getUint32(cursor + 4, true);
    const body = cursor + 8;

    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitDepth = view.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE hides the real format in a sub-GUID whose
      // first two bytes are the format tag. Files from Pro Tools and from
      // most interfaces are shaped this way.
      if (format === FORMAT_EXTENSIBLE && size >= 26) {
        format = view.getUint16(body + 24, true);
      }
    } else if (id === "data") {
      dataStart = body;
      // A truncated file declares more data than it has; trust the bytes.
      dataBytes = Math.min(size, bytes.byteLength - body);
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte.
    cursor = body + size + (size % 2);
  }

  if (dataStart < 0) throw new RangeError("WAV file has no data chunk");
  if (channelCount < 1) throw new RangeError("WAV file declares no channels");
  if (!(sampleRate >= MIN_SAMPLE_RATE && sampleRate <= MAX_SAMPLE_RATE)) {
    throw new RangeError(`WAV file declares an impossible sample rate (${sampleRate} Hz)`);
  }
  if (format !== FORMAT_PCM && format !== FORMAT_FLOAT) {
    throw new RangeError(`unsupported WAV format ${format} — only PCM and IEEE float are read`);
  }
  if (![16, 24, 32, 8].includes(bitDepth)) {
    throw new RangeError(`unsupported bit depth ${bitDepth}`);
  }

  const bytesPerSample = bitDepth / 8;
  const frames = Math.floor(dataBytes / (channelCount * bytesPerSample));
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames));

  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < channelCount; c++) {
      const at = dataStart + (frame * channelCount + c) * bytesPerSample;
      let value: number;
      if (format === FORMAT_FLOAT) {
        value = bitDepth === 32 ? view.getFloat32(at, true) : view.getFloat64(at, true);
      } else if (bitDepth === 8) {
        // 8-bit PCM is unsigned, with 128 as silence — the one format where
        // reading it as signed gives a full-scale square wave.
        value = (view.getUint8(at) - 128) / 128;
      } else if (bitDepth === 16) {
        value = view.getInt16(at, true) / INT16_SCALE;
      } else {
        const lo = view.getUint8(at);
        const mid = view.getUint8(at + 1);
        const hi = view.getInt8(at + 2);
        value = ((hi << 16) | (mid << 8) | lo) / INT24_SCALE;
      }
      channels[c][frame] = value;
    }
  }

  return { sampleRate, channels, bitDepth, float: format === FORMAT_FLOAT };
}

/** Suggested filename for an export. Avoids characters Windows rejects. */
export function wavFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${safe}.wav`;
}

/** Fold to the two channels everything downstream assumes. Mono is duplicated
 *  rather than left silent on one side; more than two are summed in pairs. */
export function toStereo(channels: Float32Array[]): { left: Float32Array; right: Float32Array } {
  if (channels.length === 0) return { left: new Float32Array(0), right: new Float32Array(0) };
  if (channels.length === 1) return { left: channels[0], right: channels[0] };
  if (channels.length === 2) return { left: channels[0], right: channels[1] };

  const frames = channels[0].length;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let c = 0; c < channels.length; c++) {
    const into = c % 2 === 0 ? left : right;
    for (let i = 0; i < frames; i++) into[i] += channels[c][i];
  }
  const scale = 2 / channels.length;
  for (let i = 0; i < frames; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
  return { left, right };
}
