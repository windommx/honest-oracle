// ╔══════════════════════════════════════════════════════════════════╗
// ║  WAV — encode rendered samples into a file.                       ║
// ║                                                                    ║
// ║  Worth noting WHY this is so small. The usual way to get audio out ║
// ║  of a web synth is MediaRecorder: play the patch in real time,     ║
// ║  capture the stream, get a compressed WebM back. That means a      ║
// ║  four-minute export takes four minutes, the result is lossy, and   ║
// ║  any dropout on the audio thread is baked into the file.           ║
// ║                                                                    ║
// ║  Because this engine is a pure function into a buffer, export is   ║
// ║  just rendering with no device attached: faster than real time,    ║
// ║  bit-exact, reproducible, and immune to whatever the page is doing ║
// ║  at the time. That property is the whole reason the engine is      ║
// ║  shaped the way it is, and this file is where it pays off.         ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Bits per sample. 16 is what every consumer tool expects. */
const BIT_DEPTH = 16;
const HEADER_BYTES = 44;
/** Largest magnitude a signed 16-bit sample can hold. */
const FULL_SCALE = 32767;

/**
 * Encode interleaved 16-bit PCM into a RIFF/WAVE file.
 *
 * @param channels one Float32Array per channel, all the same length, -1..1
 * @param sampleRate frames per second
 */
// Uint8Array<ArrayBuffer>, not the default Uint8Array: the default allows a
// SharedArrayBuffer, and both Blob and fetch refuse one.
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  if (channels.length === 0) throw new RangeError("encodeWav needs at least one channel");
  const frames = channels[0].length;
  for (const ch of channels) {
    if (ch.length !== frames) throw new RangeError("every channel must be the same length");
  }

  const channelCount = channels.length;
  const bytesPerSample = BIT_DEPTH / 8;
  const blockAlign = channelCount * bytesPerSample;
  const dataBytes = frames * blockAlign;

  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  // Everything after this field — the header's own first 8 bytes are excluded.
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");

  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk is 16 bytes
  view.setUint16(20, 1, true); // 1 = uncompressed PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BIT_DEPTH, true);

  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < channelCount; c++) {
      // Clamp before scaling: a sample above 1 would wrap to a large negative
      // value, which is heard as a loud click rather than as clipping.
      const sample = Math.max(-1, Math.min(1, channels[c][frame]));
      view.setInt16(offset, Math.round(sample * FULL_SCALE), true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

export interface DecodedWav {
  sampleRate: number;
  channels: Float32Array[];
}

/** Decode what encodeWav produced. Exists so a test can prove the round trip
 *  rather than only checking header bytes by eye. */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new RangeError("not a RIFF/WAVE file");

  const channelCount = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitDepth = view.getUint16(34, true);
  if (bitDepth !== BIT_DEPTH) throw new RangeError(`expected ${BIT_DEPTH}-bit samples`);

  const dataBytes = view.getUint32(40, true);
  const frames = dataBytes / (channelCount * (BIT_DEPTH / 8));
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames));

  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < channelCount; c++) {
      channels[c][frame] = view.getInt16(offset, true) / FULL_SCALE;
      offset += 2;
    }
  }
  return { sampleRate, channels };
}

/** Suggested filename for an export. Avoids characters Windows rejects. */
export function wavFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${safe}.wav`;
}
