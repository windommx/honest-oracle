import { describe, it, expect } from "vitest";
import { decodeWav, encodeWav, toStereo, type BitDepth } from "./wav";

const SR = 48000;

function ramp(n: number, scale = 1): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ((i / (n - 1)) * 2 - 1) * scale;
  return out;
}

/** Build a WAV by hand so the decoder is tested against file shapes this
 *  codec never writes — which is the whole point of reading files. */
function handBuilt(options: {
  format: number;
  bitDepth: number;
  channels: number;
  sampleRate: number;
  data: Uint8Array;
  extraChunks?: { id: string; body: Uint8Array }[];
  fmtSize?: number;
  subFormat?: number;
}): Uint8Array {
  const fmtSize = options.fmtSize ?? 16;
  const extras = options.extraChunks ?? [];
  const extrasBytes = extras.reduce((n, c) => n + 8 + c.body.length + (c.body.length % 2), 0);
  const total = 12 + 8 + fmtSize + extrasBytes + 8 + options.data.length;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };

  tag(0, "RIFF");
  view.setUint32(4, total - 8, true);
  tag(8, "WAVE");

  let at = 12;
  tag(at, "fmt ");
  view.setUint32(at + 4, fmtSize, true);
  view.setUint16(at + 8, options.format, true);
  view.setUint16(at + 10, options.channels, true);
  view.setUint32(at + 12, options.sampleRate, true);
  view.setUint32(at + 16, (options.sampleRate * options.channels * options.bitDepth) / 8, true);
  view.setUint16(at + 20, (options.channels * options.bitDepth) / 8, true);
  view.setUint16(at + 22, options.bitDepth, true);
  if (fmtSize >= 40 && options.subFormat !== undefined) {
    view.setUint16(at + 24, 22, true); // cbSize
    view.setUint16(at + 26, options.bitDepth, true);
    view.setUint32(at + 28, 3, true); // channel mask
    view.setUint16(at + 32, options.subFormat, true); // first two bytes of the GUID
  }
  at += 8 + fmtSize;

  for (const chunk of extras) {
    tag(at, chunk.id);
    view.setUint32(at + 4, chunk.body.length, true);
    bytes.set(chunk.body, at + 8);
    at += 8 + chunk.body.length + (chunk.body.length % 2);
  }

  tag(at, "data");
  view.setUint32(at + 4, options.data.length, true);
  bytes.set(options.data, at + 8);
  return bytes;
}

describe("round trips at every depth this writes", () => {
  it.each([16, 24, 32] as BitDepth[])("%s-bit survives the trip", (bitDepth) => {
    const left = ramp(600, 0.9);
    const right = ramp(600, 0.4);
    const decoded = decodeWav(encodeWav([left, right], SR, bitDepth));
    expect(decoded.sampleRate).toBe(SR);
    expect(decoded.bitDepth).toBe(bitDepth);
    expect(decoded.float).toBe(bitDepth === 32);
    // Quantisation is the only loss, and it gets smaller with depth.
    const places = bitDepth === 16 ? 4 : 6;
    for (let i = 0; i < left.length; i++) {
      expect(decoded.channels[0][i]).toBeCloseTo(left[i], places);
      expect(decoded.channels[1][i]).toBeCloseTo(right[i], places);
    }
  });

  it("24-bit really is finer than 16-bit", () => {
    // Otherwise the extra file size buys nothing and the option is a lie.
    const quiet = new Float32Array(400);
    for (let i = 0; i < quiet.length; i++) quiet[i] = Math.sin(i / 9) * 0.0008;
    const err = (depth: BitDepth) => {
      const back = decodeWav(encodeWav([quiet], SR, depth)).channels[0];
      let worst = 0;
      for (let i = 0; i < quiet.length; i++) worst = Math.max(worst, Math.abs(back[i] - quiet[i]));
      return worst;
    };
    expect(err(24)).toBeLessThan(err(16) / 100);
  });

  it("32-bit float keeps samples above full scale", () => {
    // A bounce from a DAW can be over 0dBFS; clamping it on import would
    // silently destroy the headroom the mastering stage exists to manage.
    const hot = new Float32Array([0, 1.8, -1.8, 0.5]);
    const back = decodeWav(encodeWav([hot], SR, 32)).channels[0];
    expect(back[1]).toBeCloseTo(1.8, 5);
    expect(back[2]).toBeCloseTo(-1.8, 5);
  });

  it("integer depths clamp rather than wrapping", () => {
    const hot = new Float32Array([0, 1.5, -1.5, 0]);
    for (const depth of [16, 24] as BitDepth[]) {
      const back = decodeWav(encodeWav([hot], SR, depth)).channels[0];
      expect(back[1], `${depth}-bit`).toBeCloseTo(1, 3);
      expect(back[2], `${depth}-bit`).toBeCloseTo(-1, 3);
    }
  });
});

describe("files this codec did not write", () => {
  it("finds the audio behind a LIST chunk", () => {
    // Almost every DAW writes one. Assuming data sits at offset 36 decodes
    // the metadata as audio, which is a burst of noise at the start.
    const samples = new Int16Array([0, 8000, -8000, 16000]);
    const wav = handBuilt({
      format: 1,
      bitDepth: 16,
      channels: 1,
      sampleRate: 44100,
      data: new Uint8Array(samples.buffer),
      extraChunks: [{ id: "LIST", body: new Uint8Array([73, 78, 70, 79, 1, 2, 3, 4]) }],
    });
    const decoded = decodeWav(wav);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels[0][1]).toBeCloseTo(8000 / 32767, 4);
  });

  it("handles an odd-sized chunk and its pad byte", () => {
    const samples = new Int16Array([0, 4000, -4000, 12000]);
    const wav = handBuilt({
      format: 1,
      bitDepth: 16,
      channels: 1,
      sampleRate: SR,
      data: new Uint8Array(samples.buffer),
      // 5 bytes: word alignment means a pad byte follows. Skipping it walks
      // the cursor one byte off and every later chunk id is garbage.
      extraChunks: [{ id: "fact", body: new Uint8Array([1, 2, 3, 4, 5]) }],
    });
    expect(decodeWav(wav).channels[0][3]).toBeCloseTo(12000 / 32767, 4);
  });

  it("reads WAVE_FORMAT_EXTENSIBLE, which is what most interfaces write", () => {
    const samples = new Int16Array([0, 20000, -20000, 0]);
    const wav = handBuilt({
      format: 0xfffe,
      subFormat: 1,
      fmtSize: 40,
      bitDepth: 16,
      channels: 1,
      sampleRate: SR,
      data: new Uint8Array(samples.buffer),
    });
    const decoded = decodeWav(wav);
    expect(decoded.float).toBe(false);
    expect(decoded.channels[0][1]).toBeCloseTo(20000 / 32767, 4);
  });

  it("reads 8-bit PCM as unsigned, not signed", () => {
    // 8-bit is the one depth stored unsigned with 128 as silence. Read as
    // signed it becomes a full-scale square wave.
    const wav = handBuilt({
      format: 1,
      bitDepth: 8,
      channels: 1,
      sampleRate: SR,
      data: new Uint8Array([128, 255, 0, 128]),
    });
    const ch = decodeWav(wav).channels[0];
    expect(ch[0]).toBeCloseTo(0, 5);
    expect(ch[1]).toBeGreaterThan(0.9);
    expect(ch[2]).toBeCloseTo(-1, 5);
  });

  it("reads a truncated file up to where it actually ends", () => {
    const full = encodeWav([ramp(1000)], SR, 16);
    const cut = full.subarray(0, full.length - 500);
    const decoded = decodeWav(cut);
    expect(decoded.channels[0].length).toBeGreaterThan(0);
    expect(decoded.channels[0].length).toBeLessThan(1000);
  });

  it("reads more than two channels", () => {
    const decoded = decodeWav(encodeWav([ramp(100), ramp(100, 0.5), ramp(100, 0.25)], SR, 16));
    expect(decoded.channels).toHaveLength(3);
  });
});

describe("refusals are specific", () => {
  it("rejects something that is not a WAV", () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow(/RIFF/);
  });

  it("rejects a file shorter than a header", () => {
    expect(() => decodeWav(new Uint8Array(4))).toThrow(/too short/);
  });

  it("names the compression it cannot read", () => {
    const wav = handBuilt({ format: 85, bitDepth: 16, channels: 2, sampleRate: SR, data: new Uint8Array(8) });
    expect(() => decodeWav(wav)).toThrow(/unsupported WAV format 85/);
  });

  it("says when there is no audio at all", () => {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    for (const [at, text] of [[0, "RIFF"], [8, "WAVE"]] as const) {
      for (let i = 0; i < 4; i++) view.setUint8(at + i, text.charCodeAt(i));
    }
    expect(() => decodeWav(new Uint8Array(buffer))).toThrow(/no data chunk/);
  });

  it("refuses mismatched channel lengths on the way out", () => {
    expect(() => encodeWav([new Float32Array(10), new Float32Array(11)], SR)).toThrow(RangeError);
  });

  it("refuses an empty channel list", () => {
    expect(() => encodeWav([], SR)).toThrow(RangeError);
  });
});

describe("toStereo", () => {
  it("duplicates mono rather than leaving one side silent", () => {
    const mono = ramp(50);
    const { left, right } = toStereo([mono]);
    expect(Array.from(left)).toEqual(Array.from(right));
  });

  it("passes stereo through untouched", () => {
    const l = ramp(50);
    const r = ramp(50, 0.5);
    const out = toStereo([l, r]);
    expect(out.left).toBe(l);
    expect(out.right).toBe(r);
  });

  it("folds more than two channels without changing the level", () => {
    const a = new Float32Array(50).fill(0.5);
    const { left, right } = toStereo([a, a, a, a]);
    expect(left[0]).toBeCloseTo(0.5, 5);
    expect(right[0]).toBeCloseTo(0.5, 5);
  });

  it("survives no channels at all", () => {
    const { left } = toStereo([]);
    expect(left.length).toBe(0);
  });
});

describe("headers are untrusted input", () => {
  it("refuses an impossible sample rate", () => {
    // Every time constant downstream is seconds x sampleRate. A file
    // declaring 0 Hz used to pass straight through and fail as an allocation
    // error several layers away from the cause.
    for (const rate of [0, 1, 2000000]) {
      const wav = handBuilt({
        format: 1,
        bitDepth: 16,
        channels: 1,
        sampleRate: rate,
        data: new Uint8Array(8),
      });
      expect(() => decodeWav(wav), `rate ${rate}`).toThrow(/impossible sample rate/);
    }
  });

  it("accepts the rates real files use", () => {
    for (const rate of [44100, 48000, 88200, 96000, 192000]) {
      const decoded = decodeWav(encodeWav([ramp(64)], rate, 16));
      expect(decoded.sampleRate).toBe(rate);
    }
  });
});

describe("float files can carry samples that are not numbers", () => {
  const withFloats = (values: number[]) => {
    const data = new Uint8Array(values.length * 4);
    const dv = new DataView(data.buffer);
    values.forEach((v, i) => dv.setFloat32(i * 4, v, true));
    return handBuilt({ format: 3, bitDepth: 32, channels: 1, sampleRate: SR, data });
  };

  it("replaces a NaN with silence and says how many", () => {
    // One NaN propagates into every filter's state and never leaves, because
    // every comparison against NaN is false — including the denormal flush
    // that would otherwise clear it. The rest of the track comes out NaN and
    // the export is silent with nothing naming the cause.
    const decoded = decodeWav(withFloats([0.5, Number.NaN, -0.25, Number.NaN]));
    expect(decoded.repairedSamples).toBe(2);
    expect(decoded.channels[0][1]).toBe(0);
    expect(decoded.channels[0][3]).toBe(0);
    expect(decoded.channels[0][0]).toBeCloseTo(0.5, 5);
  });

  it("replaces infinities too", () => {
    const decoded = decodeWav(withFloats([Infinity, -Infinity, 0.1]));
    expect(decoded.repairedSamples).toBe(2);
    expect(decoded.channels[0][0]).toBe(0);
    expect(decoded.channels[0][1]).toBe(0);
  });

  it("reports zero repairs for a clean file", () => {
    expect(decodeWav(encodeWav([ramp(64)], SR, 32)).repairedSamples).toBe(0);
    expect(decodeWav(encodeWav([ramp(64)], SR, 16)).repairedSamples).toBe(0);
  });

  it("reads 64-bit doubles rather than claiming to and refusing", () => {
    // The float branch could always read them; the bit-depth whitelist made
    // that half of the expression unreachable, so it read as support for a
    // format the decoder actually rejected.
    const data = new Uint8Array(24);
    const dv = new DataView(data.buffer);
    [0.5, -0.25, 0.125].forEach((v, i) => dv.setFloat64(i * 8, v, true));
    const decoded = decodeWav(
      handBuilt({ format: 3, bitDepth: 64, channels: 1, sampleRate: SR, data })
    );
    expect(decoded.bitDepth).toBe(64);
    expect(decoded.float).toBe(true);
    expect(Array.from(decoded.channels[0])).toEqual([0.5, -0.25, 0.125]);
  });

  it("still refuses a depth no format supports", () => {
    const wav = handBuilt({ format: 1, bitDepth: 64, channels: 1, sampleRate: SR, data: new Uint8Array(16) });
    expect(() => decodeWav(wav)).toThrow(/unsupported bit depth 64/);
  });
});
