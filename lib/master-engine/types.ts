// The settings a master is described by. One flat object so a preset, a URL,
// and a worklet message are all the same shape.

export const CONSOLE_MODELS = ["clean", "tape", "tube", "transformer", "console"] as const;
export type ConsoleModel = (typeof CONSOLE_MODELS)[number];

export interface EqBand {
  /** Centre (peaking) or corner (shelf) frequency in Hz. */
  freq: number;
  gainDb: number;
  q: number;
  /** Band 1 is a low shelf and band 5 a high shelf; the rest are bells. */
  kind: "lowShelf" | "peaking" | "highShelf";
  enabled: boolean;
}

export const EQ_BAND_COUNT = 5;

export interface MasterSettings {
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
    { freq: 32, gainDb: 0, q: 0.7, kind: "lowShelf", enabled: true },
    { freq: 60, gainDb: 0, q: 1, kind: "peaking", enabled: true },
    { freq: 220, gainDb: 0, q: 1, kind: "peaking", enabled: true },
    { freq: 2500, gainDb: 0, q: 1, kind: "peaking", enabled: true },
    { freq: 10000, gainDb: 0, q: 0.7, kind: "highShelf", enabled: true },
  ];
}

/** The starting point. These are the values the reference screenshot shows,
 *  which are a reasonable general-purpose master rather than a null setting —
 *  `NEUTRAL` below is the one that changes nothing. */
export const DEFAULT_MASTER: MasterSettings = {
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

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => (g <= 1e-9 ? -180 : 20 * Math.log10(g));
