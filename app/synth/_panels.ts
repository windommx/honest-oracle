// The control surface, declared as data.
//
// Written as a list rather than as JSX so the page stays readable, and so the
// panel can be checked against the patch type by a test: every knob must name a
// real numeric field, and no numeric field may be left with no way to reach it.

import type { SynthGroup } from "./_tokens";
import type { SynthPatch } from "@/lib/synth-engine/types";

/** Patch fields that are numbers — every one should have a control. */
export type NumericPatchKey = {
  [K in keyof SynthPatch]: SynthPatch[K] extends number ? K : never;
}[keyof SynthPatch];

export interface KnobSpec {
  key: NumericPatchKey;
  label: string;
  min: number;
  max: number;
  unit?: string;
  log?: boolean;
  precision?: number;
}

export interface PanelSpec {
  title: string;
  group: SynthGroup;
  knobs: KnobSpec[];
}

export const PANELS: PanelSpec[] = [
  {
    title: "OSC 1 · OSC 2",
    group: "source",
    knobs: [
      { key: "osc1Morph", label: "Morph 1", min: 0, max: 3, precision: 2 },
      { key: "osc1Octave", label: "Oct 1", min: -3, max: 3, precision: 0 },
      { key: "osc1Level", label: "Level 1", min: 0, max: 1 },
      { key: "osc2Morph", label: "Morph 2", min: 0, max: 3, precision: 2 },
      { key: "osc2Detune", label: "Detune", min: -50, max: 50, unit: "¢", precision: 0 },
      { key: "osc2Level", label: "Level 2", min: 0, max: 1 },
    ],
  },
  {
    title: "SUB · NOISE · FM · RING",
    group: "source",
    knobs: [
      { key: "subLevel", label: "Sub", min: 0, max: 1 },
      { key: "noiseLevel", label: "Noise", min: 0, max: 1 },
      { key: "fmAmount", label: "FM", min: 0, max: 500, precision: 0 },
      { key: "ringAmount", label: "Ring", min: 0, max: 1 },
      { key: "unisonVoices", label: "Unison", min: 1, max: 8, precision: 0 },
      { key: "unisonDetune", label: "Spread", min: 0, max: 50, unit: "¢", precision: 0 },
    ],
  },
  {
    title: "FILTER",
    group: "filter",
    knobs: [
      { key: "filterCutoff", label: "Cutoff", min: 20, max: 18000, unit: "Hz", log: true, precision: 0 },
      { key: "filterResonance", label: "Reso", min: 0, max: 1.2 },
      { key: "filterDrive", label: "Drive", min: 0.1, max: 6 },
      { key: "filterKeyTrack", label: "Key", min: 0, max: 1 },
      { key: "filterEnvAmount", label: "Env amt", min: -8000, max: 8000, precision: 0 },
    ],
  },
  {
    title: "FILTER ENV",
    group: "envelope",
    knobs: [
      { key: "filterAttack", label: "Attack", min: 0, max: 2, unit: "s", log: false },
      { key: "filterDecay", label: "Decay", min: 0, max: 2, unit: "s" },
      { key: "filterSustain", label: "Sustain", min: 0, max: 1 },
    ],
  },
  {
    title: "AMP ENV",
    group: "envelope",
    knobs: [
      { key: "ampAttack", label: "Attack", min: 0, max: 3, unit: "s" },
      { key: "ampDecay", label: "Decay", min: 0, max: 3, unit: "s" },
      { key: "ampSustain", label: "Sustain", min: 0, max: 1 },
      { key: "ampRelease", label: "Release", min: 0, max: 5, unit: "s" },
    ],
  },
  {
    title: "LFO 1 · LFO 2",
    group: "modulation",
    knobs: [
      { key: "lfo1Rate", label: "Rate 1", min: 0.05, max: 30, unit: "Hz", log: true },
      { key: "lfo1Amount", label: "Depth 1", min: 0, max: 1 },
      { key: "lfo2Rate", label: "Rate 2", min: 0.05, max: 30, unit: "Hz", log: true },
      { key: "lfo2Amount", label: "Depth 2", min: 0, max: 1 },
    ],
  },
  {
    title: "EFFECTS",
    group: "effects",
    knobs: [
      { key: "saturation", label: "Drive", min: 0, max: 1 },
      { key: "chorusRate", label: "Chorus Hz", min: 0.1, max: 5 },
      { key: "chorusDepth", label: "Chorus", min: 0, max: 1 },
      { key: "delayTime", label: "Delay", min: 0.02, max: 1.5, unit: "s" },
      { key: "delayFeedback", label: "Feedback", min: 0, max: 0.95 },
      { key: "delayMix", label: "Dly mix", min: 0, max: 1 },
      { key: "reverbDecay", label: "Rev size", min: 0, max: 1 },
      { key: "reverbMix", label: "Rev mix", min: 0, max: 1 },
    ],
  },
  {
    title: "MASTER",
    group: "master",
    knobs: [
      { key: "compThreshold", label: "Comp thr", min: -60, max: 0, unit: "dB", precision: 0 },
      { key: "compRatio", label: "Ratio", min: 1, max: 20, precision: 1 },
      { key: "compMakeup", label: "Makeup", min: -12, max: 12, unit: "dB", precision: 1 },
      { key: "volume", label: "Volume", min: 0, max: 1 },
      { key: "stereoWidth", label: "Width", min: 0, max: 1 },
    ],
  },
];

/** Every knob on the surface, flattened. */
export const ALL_KNOBS: KnobSpec[] = PANELS.flatMap((p) => p.knobs);
