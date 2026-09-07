// The patch: every knob on the instrument, as plain numbers.
//
// Deliberately flat and JSON-serialisable, because this object crosses a
// postMessage boundary into the AudioWorklet on every change. A class with
// methods, or a nested structure with getters, would not survive the trip.

export interface SynthPatch {
  // ── Oscillator 1 ──
  /** 0..3 along sine → triangle → saw → square. Fractional values crossfade. */
  osc1Morph: number;
  /** Octave offset, -3..3. */
  osc1Octave: number;
  osc1Level: number;

  // ── Oscillator 2 ──
  osc2Morph: number;
  /** Cents, -50..50. */
  osc2Detune: number;
  osc2Level: number;

  // ── Extra sources ──
  subLevel: number;
  noiseLevel: number;
  /** Osc 2 → osc 1 frequency, in Hz of deviation. */
  fmAmount: number;
  /** Osc 1 × osc 2. */
  ringAmount: number;

  // ── Unison ──
  /** 1..8 copies of each oscillator, detuned across `unisonDetune`. */
  unisonVoices: number;
  /** Total spread in cents. */
  unisonDetune: number;

  // ── Filter ──
  filterCutoff: number;
  /** 0..1, where 1 is the edge of self-oscillation. */
  filterResonance: number;
  filterDrive: number;
  /** 0..1 — how much the cutoff follows the note played. */
  filterKeyTrack: number;
  filterAttack: number;
  filterDecay: number;
  filterSustain: number;
  /** Hz added to cutoff at full envelope. Negative sweeps downward. */
  filterEnvAmount: number;

  // ── Amp envelope ──
  ampAttack: number;
  ampDecay: number;
  ampSustain: number;
  ampRelease: number;

  // ── LFOs ──
  lfo1Rate: number;
  lfo1Amount: number;
  /** What LFO 1 modulates. */
  lfo1Target: LfoTarget;
  lfo2Rate: number;
  lfo2Amount: number;
  lfo2Target: LfoTarget;

  // ── Effects ──
  saturation: number;
  chorusRate: number;
  chorusDepth: number;
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  reverbDecay: number;
  reverbMix: number;
  compThreshold: number;
  compRatio: number;
  compMakeup: number;

  // ── Master ──
  volume: number;
  stereoWidth: number;
}

export const LFO_TARGETS = ["cutoff", "pitch", "volume", "morph"] as const;
export type LfoTarget = (typeof LFO_TARGETS)[number];

/** Everything the engine will accept as a partial update. */
export type PatchUpdate = Partial<SynthPatch>;
