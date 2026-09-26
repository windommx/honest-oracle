// The settings a master is described by. One flat object so a preset, a URL,
// and a worklet message are all the same shape.

export const CONSOLE_MODELS = ["clean", "tape", "tube", "transformer", "console"] as const;
export type ConsoleModel = (typeof CONSOLE_MODELS)[number];

/**
 * Which part of the stereo image a band works on.
 *
 * "mid" is the centre — the kick, the bass, the lead vocal. "side" is what
 * differs between the channels — the room, the widened guitars, the reverb.
 * Being able to separate them is most of what mastering EQ is for: lifting
 * 10kHz on the sides adds air without putting a lisp on the vocal, and
 * cutting 200Hz on the mid alone tightens the bass without thinning the
 * guitars around it.
 */
export type EqChannel = "both" | "mid" | "side";

export interface EqBand {
  /** Centre (peaking) or corner (shelf) frequency in Hz. */
  freq: number;
  gainDb: number;
  q: number;
  /** Band 1 is a low shelf and band 5 a high shelf; the rest are bells. */
  kind: "lowShelf" | "peaking" | "highShelf";
  enabled: boolean;
  channel: EqChannel;
}

export const EQ_BAND_COUNT = 5;

export const BAND_COUNT = 3;
export type BandIndex = 0 | 1 | 2;

export interface BandSettings {
  /** dB. Above this the band starts to compress. */
  thresholdDb: number;
  /** 1 is no compression; 4 is firm; 20 is a limiter. */
  ratio: number;
  attackSeconds: number;
  releaseSeconds: number;
  /** dB of make-up applied after the band is compressed. */
  makeupDb: number;
  /** Silences the other two, for hearing what this band actually contains. */
  solo: boolean;
  bypass: boolean;
}

export interface MultibandSettings {
  enabled: boolean;
  /** Low/mid split, in Hz. */
  crossoverLowHz: number;
  /** Mid/high split, in Hz. */
  crossoverHighHz: number;
  bands: BandSettings[];
}

export const DEFAULT_BAND: BandSettings = {
  thresholdDb: -18,
  ratio: 2,
  attackSeconds: 0.01,
  releaseSeconds: 0.12,
  makeupDb: 0,
  solo: false,
  bypass: false,
};

export const DEFAULT_MULTIBAND: MultibandSettings = {
  enabled: false,
  // 120Hz keeps the kick and bass together below it; 2.5kHz puts the
  // presence region and the cymbals in the top band without splitting a
  // vocal's fundamental from its consonants.
  crossoverLowHz: 120,
  crossoverHighHz: 2500,
  bands: [
    { ...DEFAULT_BAND, thresholdDb: -20, ratio: 2.5, attackSeconds: 0.02, releaseSeconds: 0.18 },
    { ...DEFAULT_BAND },
    { ...DEFAULT_BAND, thresholdDb: -24, ratio: 1.8, attackSeconds: 0.005, releaseSeconds: 0.08 },
  ],
};

export const BAND_LABEL = ["ต่ำ", "กลาง", "สูง"] as const;

export interface MasterSettings {
  /** Split the spectrum and compress each part on its own. Declared first
   *  because it sits early in the chain, right after the EQ. */
  multiband: MultibandSettings;

  /** Seconds. Applied at the very end so a fade-out actually reaches silence. */
  fadeInSeconds: number;
  fadeOutSeconds: number;

  lowCut: boolean;
  hiCut: boolean;
  eq: EqBand[];

  /** Tone stack, in dB. Fixed frequencies — the parametric bands are there for
   *  anything that needs a frequency chosen. */
  bass: number;
  mud: number;
  mid: number;
  treble: number;

  /** 0..1 amounts. */
  punch: number;
  warmth: number;
  analogLife: number;
  deChirp: number;
  deEsser: number;
  oddExciter: number;
  evenExciter: number;
  tapeHiss: number;
  consoleModel: ConsoleModel;

  monoLow: number;
  monoHigh: number;
  /** 0.5 is untouched. Below narrows toward mono, above widens. */
  width: number;

  masterVolDb: number;
  /** Limiter ceiling in dBFS. -1.0 is the streaming-safe convention. */
  ceilingDb: number;
}

// ── Frequencies the fixed stages use ────────────────────────────────────────
// Exported rather than buried, because the UI labels them and the tests assert
// against them; a number that appears in two places drifts.

export const LOW_CUT_HZ = 30;
export const HI_CUT_HZ = 18000;

export const TONE_BASS_HZ = 90;
/** The 250-400Hz region, where a mix goes boxy. */
export const TONE_MUD_HZ = 320;
export const TONE_MID_HZ = 1400;
export const TONE_TREBLE_HZ = 8000;

/** Mono Low at 1.0 collapses everything below this. */
export const MONO_LOW_MAX_HZ = 300;
/** Mono High at 1.0 collapses everything above this; at 0 it is off. */
export const MONO_HIGH_MIN_HZ = 4000;
export const MONO_HIGH_MAX_HZ = 20000;

/** De-esser band. */
export const ESS_LOW_HZ = 4500;
export const ESS_HIGH_HZ = 11000;

export const TONE_RANGE_DB = 6;

export function defaultEqBands(): EqBand[] {
  return [
    { freq: 32, gainDb: 0, q: 0.7, kind: "lowShelf", enabled: true, channel: "both" },
    { freq: 60, gainDb: 0, q: 1, kind: "peaking", enabled: true, channel: "both" },
    { freq: 220, gainDb: 0, q: 1, kind: "peaking", enabled: true, channel: "both" },
    { freq: 2500, gainDb: 0, q: 1, kind: "peaking", enabled: true, channel: "both" },
    { freq: 10000, gainDb: 0, q: 0.7, kind: "highShelf", enabled: true, channel: "both" },
  ];
}

/** The starting point. These are the values the reference screenshot shows,
 *  which are a reasonable general-purpose master rather than a null setting —
 *  `NEUTRAL` below is the one that changes nothing. */
const cloneMultiband = (m: MultibandSettings): MultibandSettings => ({
  ...m,
  bands: m.bands.map((b) => ({ ...b })),
});

export const DEFAULT_MASTER: MasterSettings = {
  multiband: cloneMultiband(DEFAULT_MULTIBAND),
  fadeInSeconds: 0,
  fadeOutSeconds: 0,
  lowCut: true,
  hiCut: false,
  eq: defaultEqBands(),
  bass: 1.2,
  mud: -1,
  mid: 0.5,
  treble: 1,
  punch: 0.55,
  warmth: 0.65,
  analogLife: 0.5,
  deChirp: 0.2,
  deEsser: 0.2,
  oddExciter: 0.3,
  evenExciter: 0.6,
  tapeHiss: 0,
  consoleModel: "console",
  monoLow: 0.4,
  monoHigh: 0.4,
  width: 0.55,
  masterVolDb: 1.5,
  ceilingDb: -1,
};

/** Every stage off. The A/B reference: rendering with this must return the
 *  input unchanged, which a test asserts sample for sample. */
export const NEUTRAL: MasterSettings = {
  multiband: cloneMultiband({ ...DEFAULT_MULTIBAND, enabled: false }),
  fadeInSeconds: 0,
  fadeOutSeconds: 0,
  lowCut: false,
  hiCut: false,
  eq: defaultEqBands(),
  bass: 0,
  mud: 0,
  mid: 0,
  treble: 0,
  punch: 0,
  warmth: 0,
  analogLife: 0,
  deChirp: 0,
  deEsser: 0,
  oddExciter: 0,
  evenExciter: 0,
  tapeHiss: 0,
  consoleModel: "clean",
  monoLow: 0,
  monoHigh: 0,
  width: 0.5,
  masterVolDb: 0,
  ceilingDb: 0,
};

export type MasterUpdate = Partial<MasterSettings>;

// Re-exported so every existing `from "./types"` keeps working; they live in
// db.ts because types.ts imports multiband.ts and multiband.ts needs them.
export { dbToGain, gainToDb } from "./db";
