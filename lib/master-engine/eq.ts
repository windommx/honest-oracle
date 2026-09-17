// ╔══════════════════════════════════════════════════════════════════╗
// ║  EQ — the parametric bands, the cuts, and the tone stack.         ║
// ║                                                                    ║
// ║  One function builds the coefficient list, and BOTH the audio path ║
// ║  and the on-screen curve are derived from that same list. They     ║
// ║  cannot drift apart, because there is only one of them: the        ║
// ║  processor runs the sections, the display multiplies their         ║
// ║  responses. A test pushes sine tones through the real chain and    ║
// ║  checks the drawn dB against the measured dB.                      ║
// ╚══════════════════════════════════════════════════════════════════╝

import {
  type BiquadCoefficients,
  StereoBiquad,
  highShelf,
  highpass,
  lowShelf,
  lowpass,
  magnitudeDbAt,
  peaking,
} from "./biquad";
import {
  HI_CUT_HZ,
  LOW_CUT_HZ,
  TONE_BASS_HZ,
  TONE_MID_HZ,
  TONE_MUD_HZ,
  TONE_TREBLE_HZ,
  type MasterSettings,
} from "./types";

/** Butterworth Q values for a 4th-order cascade. A single biquad cut is
 *  12dB/oct, which on a master leaves audible rumble above the corner; two
 *  sections with these Qs give a maximally flat 24dB/oct. */
const BUTTERWORTH_4TH = [0.5412, 1.3066];

/**
 * Every biquad the EQ section runs, in order.
 *
 * The single source of truth for both the sound and the picture.
 */
export function eqSections(settings: MasterSettings, sampleRate: number): BiquadCoefficients[] {
  const out: BiquadCoefficients[] = [];

  if (settings.lowCut) {
    for (const q of BUTTERWORTH_4TH) out.push(highpass(LOW_CUT_HZ, q, sampleRate));
  }
  if (settings.hiCut) {
    for (const q of BUTTERWORTH_4TH) out.push(lowpass(HI_CUT_HZ, q, sampleRate));
  }

  for (const band of settings.eq) {
    // A disabled or flat band is left out entirely rather than run at 0dB: a
    // biquad at unity still costs five multiplies a sample per channel, and a
    // master chain has plenty of those already.
    if (!band.enabled || band.gainDb === 0) continue;
    if (band.kind === "lowShelf") out.push(lowShelf(band.freq, band.gainDb, band.q, sampleRate));
    else if (band.kind === "highShelf") out.push(highShelf(band.freq, band.gainDb, band.q, sampleRate));
    else out.push(peaking(band.freq, band.gainDb, band.q, sampleRate));
  }

  // The tone stack runs after the parametric bands. Fixed frequencies, chosen
  // for what each name means to a listener rather than to be adjustable.
  if (settings.bass !== 0) out.push(lowShelf(TONE_BASS_HZ, settings.bass, 0.7, sampleRate));
  if (settings.mud !== 0) out.push(peaking(TONE_MUD_HZ, settings.mud, 1.1, sampleRate));
  if (settings.mid !== 0) out.push(peaking(TONE_MID_HZ, settings.mid, 0.9, sampleRate));
  if (settings.treble !== 0) out.push(highShelf(TONE_TREBLE_HZ, settings.treble, 0.7, sampleRate));

  return out;
}

/** The curve the UI draws: the sections' responses multiplied, which in dB is
 *  a sum. Same list the audio runs through. */
export function responseDbAt(sections: BiquadCoefficients[], freq: number, sampleRate: number): number {
  let db = 0;
  for (const c of sections) db += magnitudeDbAt(c, freq, sampleRate);
  return db;
}

/** Sample the curve across the audible band on a log scale — what a display
 *  needs, computed once per settings change rather than per frame. */
export function responseCurve(
  sections: BiquadCoefficients[],
  sampleRate: number,
  points = 240,
  fromHz = 20,
  toHz = 20000
): { freq: number; db: number }[] {
  const nyquist = sampleRate / 2;
  const top = Math.min(toHz, nyquist * 0.999);
  const curve: { freq: number; db: number }[] = [];
  for (let i = 0; i < points; i++) {
    const freq = fromHz * Math.pow(top / fromHz, i / (points - 1));
    curve.push({ freq, db: responseDbAt(sections, freq, sampleRate) });
  }
  return curve;
}

/** Runs the sections. Rebuilt whenever the settings change, which on a master
 *  is a knob move rather than a per-sample event. */
export class EqStage {
  private readonly sampleRate: number;
  private filters: StereoBiquad[] = [];
  private sections: BiquadCoefficients[] = [];

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  setSettings(settings: MasterSettings): void {
    const next = eqSections(settings, this.sampleRate);
    // Reuse the filter objects where the count is unchanged, so a knob move
    // swaps coefficients instead of throwing away the filter state — which
    // would click on every turn of the knob.
    while (this.filters.length < next.length) this.filters.push(new StereoBiquad());
    if (this.filters.length > next.length) this.filters.length = next.length;
    for (let i = 0; i < next.length; i++) this.filters[i].setCoefficients(next[i]);
    this.sections = next;
  }

  /** The exact list the audio is running through, for the display. */
  get currentSections(): readonly BiquadCoefficients[] {
    return this.sections;
  }

  reset(): void {
    for (const f of this.filters) f.reset();
  }

  tickLeft(x: number): number {
    let y = x;
    for (let i = 0; i < this.filters.length; i++) y = this.filters[i].tickLeft(y);
    return y;
  }

  tickRight(x: number): number {
    let y = x;
    for (let i = 0; i < this.filters.length; i++) y = this.filters[i].tickRight(y);
    return y;
  }
}
