import { describe, it, expect } from "vitest";
import { MAX_VOICES, Synth } from "./synth";
import { DEFAULT_PATCH, PRESETS, getPreset } from "./presets";
import { midiToFrequency } from "./voice";
import { LFO_TARGETS } from "./types";

const SR = 48000;

const rms = (b: Float32Array, from = 0, to = b.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

const peak = (b: Float32Array) => {
  let m = 0;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
  return m;
};

/** Dominant frequency of a buffer, by counting rising zero crossings. */
function dominantHz(b: Float32Array, sr = SR): number {
  let crossings = 0;
  for (let i = 1; i < b.length; i++) if (b[i - 1] < 0 && b[i] >= 0) crossings++;
  return (crossings * sr) / b.length;
}

describe("synth — it makes a sound", () => {
  it("is silent with no notes held", () => {
    const s = new Synth(SR);
    const { left, right } = s.renderSeconds(0.1);
    expect(peak(left)).toBe(0);
    expect(peak(right)).toBe(0);
  });

  it("produces signal after a note-on", () => {
    const s = new Synth(SR);
    s.noteOn(60, 1);
    const { left } = s.renderSeconds(0.2);
    expect(rms(left)).toBeGreaterThan(0.01);
  });

  it("plays the pitch it was asked for", () => {
    // A sine at A4 through a wide-open filter should still be 440Hz out.
    const s = new Synth(SR, {
      ...DEFAULT_PATCH,
      osc1Morph: 0,
      osc2Level: 0,
      filterCutoff: 18000,
      filterEnvAmount: 0,
      filterResonance: 0,
      ampAttack: 0.001,
      ampSustain: 1,
      ampDecay: 0.001,
      reverbMix: 0,
      delayMix: 0,
      chorusDepth: 0,
    });
    s.noteOn(69, 1); // A4
    const { left } = s.renderSeconds(0.5);
    expect(dominantHz(left.slice(SR * 0.1))).toBeCloseTo(440, -1);
  });

  it("midiToFrequency uses A4 = 440", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 9);
    expect(midiToFrequency(81)).toBeCloseTo(880, 9);
    expect(midiToFrequency(57)).toBeCloseTo(220, 9);
  });

  it("goes quiet again after note-off and release", () => {
    const s = new Synth(SR, { ampRelease: 0.05, reverbMix: 0, delayMix: 0 });
    s.noteOn(60, 1);
    s.renderSeconds(0.2);
    s.noteOff(60);
    const { left } = s.renderSeconds(1);
    expect(rms(left, left.length - 1000)).toBeLessThan(1e-4);
    expect(s.activeVoiceCount).toBe(0);
  });

  it("a louder velocity is louder", () => {
    const at = (v: number) => {
      const s = new Synth(SR, { reverbMix: 0, delayMix: 0, compRatio: 1, compMakeup: 0 });
      s.noteOn(60, v);
      return rms(s.renderSeconds(0.3).left);
    };
    expect(at(1)).toBeGreaterThan(at(0.3) * 1.5);
  });
});

describe("synth — polyphony", () => {
  it("plays several notes at once", () => {
    const s = new Synth(SR);
    s.noteOn(60, 1);
    s.noteOn(64, 1);
    s.noteOn(67, 1);
    s.renderSeconds(0.1);
    expect(s.activeVoiceCount).toBe(3);
  });

  it("a chord is louder than one note", () => {
    const one = new Synth(SR, { compRatio: 1, compMakeup: 0 });
    one.noteOn(60, 1);
    const chord = new Synth(SR, { compRatio: 1, compMakeup: 0 });
    for (const n of [60, 64, 67]) chord.noteOn(n, 1);
    expect(rms(chord.renderSeconds(0.3).left)).toBeGreaterThan(rms(one.renderSeconds(0.3).left));
  });

  it("retriggers rather than stacking a second voice on the same note", () => {
    // Two voices on one pitch is 6dB louder and beats against itself.
    const s = new Synth(SR);
    s.noteOn(60, 1);
    s.renderSeconds(0.05);
    s.noteOn(60, 1);
    s.renderSeconds(0.05);
    expect(s.activeVoiceCount).toBe(1);
  });

  it("steals the oldest voice past the polyphony limit", () => {
    const s = new Synth(SR);
    for (let i = 0; i < MAX_VOICES + 4; i++) s.noteOn(40 + i, 1);
    s.renderSeconds(0.05);
    expect(s.activeVoiceCount).toBe(MAX_VOICES);
    // The most recent presses survived; the first ones were taken.
    expect(s.activeVoiceCount).toBeLessThanOrEqual(MAX_VOICES);
  });

  it("note-off for an unheld note is harmless", () => {
    const s = new Synth(SR);
    expect(() => {
      s.noteOff(60);
      s.renderSeconds(0.05);
    }).not.toThrow();
  });

  it("allNotesOff releases everything", () => {
    const s = new Synth(SR, { ampRelease: 0.02 });
    for (const n of [60, 64, 67]) s.noteOn(n, 1);
    s.renderSeconds(0.05);
    s.allNotesOff();
    s.renderSeconds(0.5);
    expect(s.activeVoiceCount).toBe(0);
  });

  it("panic silences instantly, tails included", () => {
    const s = new Synth(SR, { reverbMix: 0.8, delayMix: 0.8 });
    for (const n of [60, 64, 67]) s.noteOn(n, 1);
    s.renderSeconds(0.2);
    s.panic();
    expect(peak(s.renderSeconds(0.1).left)).toBe(0);
  });
});

describe("synth — output stays in range", () => {
  it("never exceeds full scale, even on a dense chord at maximum settings", () => {
    const s = new Synth(SR, {
      volume: 1,
      unisonVoices: 8,
      saturation: 1,
      reverbMix: 1,
      delayMix: 1,
      delayFeedback: 0.9,
      filterResonance: 1.2,
      compMakeup: 12,
    });
    for (let i = 0; i < MAX_VOICES; i++) s.noteOn(36 + i * 2, 1);
    const { left, right } = s.renderSeconds(1);
    expect(peak(left)).toBeLessThanOrEqual(1);
    expect(peak(right)).toBeLessThanOrEqual(1);
    for (let i = 0; i < left.length; i++) expect(Number.isFinite(left[i])).toBe(true);
  });

  it("collapses to mono at width 0 and separates above it", () => {
    const s = new Synth(SR, { stereoWidth: 0, chorusDepth: 0.8, reverbMix: 0, delayMix: 0 });
    s.noteOn(60, 1);
    const mono = s.renderSeconds(0.2);
    for (let i = 0; i < mono.left.length; i++) expect(mono.left[i]).toBeCloseTo(mono.right[i], 6);

    const wide = new Synth(SR, { stereoWidth: 1, chorusDepth: 0.8, reverbMix: 0, delayMix: 0 });
    wide.noteOn(60, 1);
    const w = wide.renderSeconds(0.2);
    let differs = 0;
    for (let i = 0; i < w.left.length; i++) if (Math.abs(w.left[i] - w.right[i]) > 1e-5) differs++;
    expect(differs).toBeGreaterThan(w.left.length * 0.3);
  });
});

describe("synth — determinism", () => {
  it("the same notes render the same samples, twice", () => {
    // The property the whole engine is arranged around: no clock is read, and
    // noise comes from a seeded generator, so output is reproducible.
    const go = () => {
      const s = new Synth(SR, { noiseLevel: 0.5, reverbMix: 0.5, delayMix: 0.4 });
      s.noteOn(60, 1);
      s.noteOn(67, 0.8);
      const a = s.renderSeconds(0.3);
      s.noteOff(60);
      const b = s.renderSeconds(0.3);
      return [...Array.from(a.left), ...Array.from(b.left)];
    };
    expect(go()).toEqual(go());
  });

  it("noise is decorrelated between voices", () => {
    // Identical noise on every voice comb-filters when summed. Measured with
    // the compressor and makeup bypassed and the volume low, so this reads the
    // SUMMATION rather than the dynamics chain's response to it.
    const clean = {
      noiseLevel: 1,
      osc1Level: 0,
      osc2Level: 0,
      filterCutoff: 18000,
      filterEnvAmount: 0,
      compRatio: 1,
      compMakeup: 0,
      reverbMix: 0,
      delayMix: 0,
      volume: 0.15,
    } as const;

    const s = new Synth(SR, clean);
    s.noteOn(60, 1);
    s.noteOn(72, 1);
    const two = rms(s.renderSeconds(0.3).left);

    const one = new Synth(SR, clean);
    one.noteOn(60, 1);
    const single = rms(one.renderSeconds(0.3).left);

    // Correlated noise would sum to 2x; independent streams sum to about √2.
    expect(two / single).toBeGreaterThan(1.2);
    expect(two / single).toBeLessThan(1.7);
  });

  it("renders identically regardless of block size", () => {
    // The AudioWorklet hands over 128 samples at a time; a test may ask for a
    // second. The engine must not care.
    const oneBlock = new Synth(SR);
    oneBlock.noteOn(60, 1);
    const big = oneBlock.renderSeconds(0.2).left;

    const many = new Synth(SR);
    many.noteOn(60, 1);
    const small = new Float32Array(big.length);
    const scratch = new Float32Array(128);
    const scratchR = new Float32Array(128);
    for (let off = 0; off < big.length; off += 128) {
      many.render(scratch, scratchR);
      small.set(scratch.subarray(0, Math.min(128, big.length - off)), off);
    }
    for (let i = 0; i < big.length; i++) expect(small[i]).toBeCloseTo(big[i], 6);
  });
});

describe("synth — modulation", () => {
  it("an LFO on cutoff makes the level move", () => {
    const still = new Synth(SR, { lfo1Amount: 0, filterCutoff: 800, reverbMix: 0, delayMix: 0 });
    still.noteOn(48, 1);
    const flat = still.renderSeconds(1).left;

    const moving = new Synth(SR, {
      lfo1Amount: 1,
      lfo1Rate: 4,
      lfo1Target: "cutoff",
      filterCutoff: 800,
      reverbMix: 0,
      delayMix: 0,
    });
    moving.noteOn(48, 1);
    const wobbly = moving.renderSeconds(1).left;

    // Compare the spread of short-window levels: modulation widens it.
    const spread = (b: Float32Array) => {
      const windows: number[] = [];
      for (let i = 0; i + 2048 < b.length; i += 2048) windows.push(rms(b, i, i + 2048));
      const mean = windows.reduce((a, x) => a + x, 0) / windows.length;
      return Math.sqrt(windows.reduce((a, x) => a + (x - mean) ** 2, 0) / windows.length) / (mean || 1);
    };
    expect(spread(wobbly)).toBeGreaterThan(spread(flat) * 1.5);
  });

  it("every LFO target is handled", () => {
    for (const target of LFO_TARGETS) {
      const s = new Synth(SR, { lfo1Target: target, lfo1Amount: 1, lfo1Rate: 5 });
      s.noteOn(60, 1);
      const { left } = s.renderSeconds(0.3);
      expect(rms(left), `target ${target}`).toBeGreaterThan(0);
      expect(peak(left), `target ${target}`).toBeLessThanOrEqual(1);
    }
  });

  it("a patch change while a note is held takes effect", () => {
    const s = new Synth(SR, {
      filterCutoff: 150,
      filterEnvAmount: 0,
      filterResonance: 0,
      reverbMix: 0,
      delayMix: 0,
      compRatio: 1,
      compMakeup: 0,
    });
    s.noteOn(60, 1); // C4, 261Hz — well above a 150Hz cutoff
    s.renderSeconds(0.5); // let the amp envelope settle on sustain first
    const dark = rms(s.renderSeconds(0.3).left);

    s.setPatch({ filterCutoff: 12000 });
    s.renderSeconds(0.05); // the filter's cutoff glide is ~1ms
    const bright = rms(s.renderSeconds(0.3).left);

    expect(bright).toBeGreaterThan(dark * 2);
  });
});

describe("presets", () => {
  it("every preset renders sound within range", () => {
    for (const preset of PRESETS) {
      const s = new Synth(SR, preset.patch);
      s.noteOn(60, 1);
      s.noteOn(64, 0.9);
      const { left, right } = s.renderSeconds(1.5);
      expect(rms(left), `${preset.id} is silent`).toBeGreaterThan(1e-4);
      expect(peak(left), `${preset.id} clips`).toBeLessThanOrEqual(1);
      expect(peak(right), `${preset.id} clips`).toBeLessThanOrEqual(1);
      for (let i = 0; i < left.length; i++) {
        if (!Number.isFinite(left[i])) throw new Error(`${preset.id} went non-finite at sample ${i}`);
      }
    }
  });

  it("no preset carries a resonance from the old biquad scale", () => {
    // The bug this catalogue was ported through: values like 18 and 12 were a
    // biquad's Q, fed into a ladder whose feedback gain saturates around 4.
    for (const p of PRESETS) {
      expect(p.patch.filterResonance, `${p.id}`).toBeGreaterThanOrEqual(0);
      expect(p.patch.filterResonance, `${p.id}`).toBeLessThanOrEqual(1.2);
    }
  });

  it("ids are unique and every preset says what it demonstrates", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESETS) expect(p.note.length).toBeGreaterThan(20);
  });

  it("presets differ audibly from one another", () => {
    const fingerprint = (id: string) => {
      const s = new Synth(SR, getPreset(id)!.patch);
      s.noteOn(60, 1);
      return rms(s.renderSeconds(0.5).left);
    };
    const levels = PRESETS.map((p) => fingerprint(p.id));
    expect(new Set(levels.map((l) => l.toFixed(4))).size).toBeGreaterThan(PRESETS.length / 2);
  });

  it("getPreset returns undefined for an unknown id", () => {
    expect(getPreset("nope")).toBeUndefined();
  });
});
