import { describe, it, expect } from "vitest";
import { decodeWav, encodeWav, wavFilename } from "./wav";
import { Synth } from "./synth";
import { emptyPattern, patternSeconds } from "./sequencer";
import { peak, rms } from "./analysis";

const SR = 48000;
const ascii = (bytes: Uint8Array, at: number, len: number) =>
  String.fromCharCode(...Array.from(bytes.slice(at, at + len)));

describe("wav header", () => {
  const sine = () => {
    const n = 1000;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * 0.5;
    return ch;
  };

  it("writes a RIFF/WAVE container", () => {
    const bytes = encodeWav([sine(), sine()], SR);
    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(ascii(bytes, 8, 4)).toBe("WAVE");
    expect(ascii(bytes, 12, 4)).toBe("fmt ");
    expect(ascii(bytes, 36, 4)).toBe("data");
  });

  it("declares the format it actually wrote", () => {
    const bytes = encodeWav([sine(), sine()], 44100);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(view.getUint16(32, true)).toBe(4); // block align: 2ch x 2 bytes
    expect(view.getUint32(28, true)).toBe(44100 * 4); // byte rate
  });

  it("sizes both length fields correctly", () => {
    // A wrong RIFF size is the classic way to produce a file that some players
    // open and others reject.
    const bytes = encodeWav([sine(), sine()], SR);
    const view = new DataView(bytes.buffer);
    const dataBytes = 1000 * 2 * 2;
    expect(view.getUint32(40, true)).toBe(dataBytes);
    expect(view.getUint32(4, true)).toBe(36 + dataBytes);
    expect(bytes.length).toBe(44 + dataBytes);
  });

  it("handles mono", () => {
    const bytes = encodeWav([sine()], SR);
    expect(new DataView(bytes.buffer).getUint16(22, true)).toBe(1);
    expect(bytes.length).toBe(44 + 1000 * 2);
  });
});

describe("wav round trip", () => {
  it("decodes back to what was encoded", () => {
    const n = 512;
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = Math.sin((2 * Math.PI * 300 * i) / SR) * 0.8;
      right[i] = Math.cos((2 * Math.PI * 300 * i) / SR) * 0.4;
    }
    const decoded = decodeWav(encodeWav([left, right], SR));
    expect(decoded.sampleRate).toBe(SR);
    expect(decoded.channels).toHaveLength(2);
    for (let i = 0; i < n; i++) {
      // 16-bit quantisation is the only loss.
      expect(decoded.channels[0][i]).toBeCloseTo(left[i], 4);
      expect(decoded.channels[1][i]).toBeCloseTo(right[i], 4);
    }
  });

  it("clamps rather than wrapping an over-range sample", () => {
    // Without the clamp, 1.5 wraps to a large negative value — a loud click
    // where the listener expected clipping.
    const hot = new Float32Array([0, 1.5, -1.5, 0]);
    const decoded = decodeWav(encodeWav([hot], SR));
    expect(decoded.channels[0][1]).toBeCloseTo(1, 3);
    expect(decoded.channels[0][2]).toBeCloseTo(-1, 3);
  });

  it("refuses mismatched channel lengths", () => {
    expect(() => encodeWav([new Float32Array(10), new Float32Array(11)], SR)).toThrow(RangeError);
  });

  it("refuses an empty channel list", () => {
    expect(() => encodeWav([], SR)).toThrow(RangeError);
  });

  it("rejects a file that is not RIFF/WAVE", () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow(RangeError);
  });
});

describe("export by offline render", () => {
  it("renders a pattern to a file with audio in it", () => {
    // The property that makes export cheap: no device, no real-time wait.
    const pattern = emptyPattern(4);
    pattern.bpm = 200;
    pattern.steps[0] = { notes: [60], drums: [], velocity: 1, gate: 0.8 };
    pattern.steps[2] = { notes: [67], drums: ["kick"], velocity: 1, gate: 0.8 };

    const synth = new Synth(SR, { ampAttack: 0.002, ampRelease: 0.1 });
    synth.setPattern(pattern);
    synth.startSequencer();

    const seconds = patternSeconds(pattern, SR);
    const { left, right } = synth.renderSeconds(seconds);

    expect(rms(left)).toBeGreaterThan(1e-3);
    const bytes = encodeWav([left, right], SR);
    const decoded = decodeWav(bytes);
    expect(decoded.channels[0].length).toBe(left.length);
    expect(peak(decoded.channels[0])).toBeLessThanOrEqual(1);
  });

  it("is reproducible — exporting twice gives identical bytes", () => {
    const render = () => {
      const pattern = emptyPattern(4);
      pattern.bpm = 180;
      pattern.steps[1] = { notes: [64], drums: ["snare"], velocity: 0.9, gate: 0.5 };
      const synth = new Synth(SR, { noiseLevel: 0.3 });
      synth.setPattern(pattern);
      synth.startSequencer();
      const { left, right } = synth.renderSeconds(1);
      return Array.from(encodeWav([left, right], SR));
    };
    expect(render()).toEqual(render());
  });

  it("renders faster than the audio it produces", () => {
    const synth = new Synth(SR);
    synth.noteOn(60, 1);
    const seconds = 2;
    const started = Date.now();
    synth.renderSeconds(seconds);
    const elapsed = (Date.now() - started) / 1000;
    expect(elapsed, `${elapsed.toFixed(2)}s to render ${seconds}s`).toBeLessThan(seconds);
  });
});

describe("wavFilename", () => {
  it("strips characters a filesystem would reject", () => {
    expect(wavFilename("My Patch / v2")).toBe("My-Patch-v2.wav");
    expect(wavFilename("  ")).toBe("export.wav");
  });
});
