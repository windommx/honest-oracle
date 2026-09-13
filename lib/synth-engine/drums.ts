// ╔══════════════════════════════════════════════════════════════════╗
// ║  DRUMS — four synthesised one-shots.                              ║
// ║                                                                    ║
// ║  Each is a small recipe rather than a sample, which is the point:  ║
// ║  a kick is a sine whose pitch falls, a snare is noise plus a body  ║
// ║  tone, a hat is noise with almost no tail.                         ║
// ║                                                                    ║
// ║  ⚠ THE KICK IN THE VERSION THIS WAS PORTED FROM SWEPT UPWARDS. Its ║
// ║  pitch was `150 * (1 - ae*0.5)³ + 40` where `ae` is the amplitude  ║
// ║  envelope falling from 1 to 0 — so the note STARTED at 59Hz and    ║
// ║  ROSE to 190Hz as it died. A kick drum does the opposite: the head ║
// ║  is tightest at the moment of impact and the pitch drops away,     ║
// ║  which is what makes the transient read as a hit rather than as a  ║
// ║  rising "boing". The perc voice had the same inversion.            ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Envelope } from "./envelope";
import type { Rng } from "./rng";

const TAU = Math.PI * 2;

export const DRUM_IDS = ["kick", "snare", "hat", "perc"] as const;
export type DrumId = (typeof DRUM_IDS)[number];

interface DrumRecipe {
  /** Amplitude envelope, in seconds. */
  attack: number;
  decay: number;
  /** Pitch at the moment of impact, and where it falls to. */
  startHz: number;
  endHz: number;
  /** How fast the pitch falls: higher is snappier. */
  pitchCurve: number;
  /** How much of the output is noise rather than tone, 0..1. */
  noise: number;
  gain: number;
}

export const DRUM_RECIPES: Record<DrumId, DrumRecipe> = {
  // Falling, not rising: 150Hz at impact down to 45Hz.
  kick: { attack: 0.001, decay: 0.36, startHz: 150, endHz: 45, pitchCurve: 26, noise: 0, gain: 1.1 },
  // Noise for the snares, plus a body tone around 190Hz.
  snare: { attack: 0.001, decay: 0.19, startHz: 240, endHz: 185, pitchCurve: 40, noise: 0.72, gain: 0.85 },
  // Almost pure noise with a very short tail — the tone is just enough to keep
  // it from sounding like a burst of static.
  hat: { attack: 0.0005, decay: 0.055, startHz: 8000, endHz: 6000, pitchCurve: 60, noise: 0.94, gain: 0.55 },
  perc: { attack: 0.001, decay: 0.13, startHz: 760, endHz: 300, pitchCurve: 34, noise: 0.08, gain: 0.7 },
};

/** One pad's voice. */
export class DrumVoice {
  private readonly envelope: Envelope;
  private readonly rng: Rng;
  private readonly sampleRate: number;
  private recipe: DrumRecipe = DRUM_RECIPES.kick;
  private phase = 0;
  private elapsed = 0;
  private velocity = 1;

  constructor(sampleRate: number, rng: Rng) {
    this.sampleRate = sampleRate;
    this.rng = rng;
    this.envelope = new Envelope(sampleRate);
  }

  trigger(id: DrumId, velocity = 1): void {
    this.recipe = DRUM_RECIPES[id];
    this.velocity = Math.min(Math.max(velocity, 0), 1);
    this.elapsed = 0;
    // Phase resets on every hit so the transient is identical each time — a
    // free-running phase makes the same pad sound different hit to hit.
    this.phase = 0;
    this.envelope.noteOn(this.recipe.attack, this.recipe.decay, 0);
  }

  get active(): boolean {
    return this.envelope.active;
  }

  tick(): number {
    if (!this.envelope.active) return 0;

    const level = this.envelope.tick();
    const r = this.recipe;

    // Pitch falls on its own exponential, independent of the amplitude
    // envelope — tying the two together is what inverted the source version.
    const fall = Math.exp(-this.elapsed * r.pitchCurve);
    const hz = r.endHz + (r.startHz - r.endHz) * fall;
    this.elapsed += 1 / this.sampleRate;

    this.phase += hz / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;

    const tone = Math.sin(TAU * this.phase);
    const noise = this.rng.bipolar();
    const mixed = tone * (1 - r.noise) + noise * r.noise;

    return Math.tanh(mixed * level * this.velocity * r.gain * 1.4);
  }

  silence(): void {
    this.envelope.kill();
  }
}

/**
 * The four pads.
 *
 * One voice per pad rather than a shared pool: retriggering a hat should cut
 * the previous hat (that is how a closed hi-hat behaves) but must never cut the
 * kick, which a single shared voice would do.
 */
export class DrumKit {
  private readonly voices: Record<DrumId, DrumVoice>;

  constructor(sampleRate: number, rng: Rng) {
    this.voices = {
      kick: new DrumVoice(sampleRate, rng),
      snare: new DrumVoice(sampleRate, rng),
      hat: new DrumVoice(sampleRate, rng),
      perc: new DrumVoice(sampleRate, rng),
    };
  }

  trigger(id: DrumId, velocity = 1): void {
    this.voices[id].trigger(id, velocity);
  }

  get activeCount(): number {
    return DRUM_IDS.reduce((n, id) => n + (this.voices[id].active ? 1 : 0), 0);
  }

  tick(): number {
    let out = 0;
    for (const id of DRUM_IDS) out += this.voices[id].tick();
    return out;
  }

  silence(): void {
    for (const id of DRUM_IDS) this.voices[id].silence();
  }
}
