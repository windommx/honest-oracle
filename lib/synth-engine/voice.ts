// One voice: the sound of a single held note, from oscillators to amplifier.
//
// A voice owns its own oscillators, filter and envelopes, so voices are fully
// independent — which is what makes polyphony work and what lets a stolen voice
// be reset without touching any other.

import { Envelope } from "./envelope";
import { LadderFilter } from "./filter";
import { Oscillator } from "./oscillator";
import { Rng } from "./rng";
import type { SynthPatch } from "./types";

/** Hard cap on unison width. Each voice above one costs two more oscillators,
 *  so 8 across 16 notes is already 256 oscillators. */
export const MAX_UNISON = 8;

export function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class Voice {
  note = -1;
  /** Rising counter set on note-on, so the oldest voice can be identified. */
  age = 0;

  private readonly osc1: Oscillator[] = [];
  private readonly osc2: Oscillator[] = [];
  private readonly sub: Oscillator;
  private readonly filter: LadderFilter;
  private readonly ampEnv: Envelope;
  private readonly filterEnv: Envelope;
  private readonly rng: Rng;

  private unisonCount = 1;
  private velocity = 1;
  private baseFrequency = 440;
  private readonly sampleRate: number;

  constructor(sampleRate: number, seed: number) {
    this.sampleRate = sampleRate;
    for (let i = 0; i < MAX_UNISON; i++) {
      this.osc1.push(new Oscillator(sampleRate));
      this.osc2.push(new Oscillator(sampleRate));
    }
    this.sub = new Oscillator(sampleRate);
    this.filter = new LadderFilter(sampleRate);
    this.ampEnv = new Envelope(sampleRate);
    this.filterEnv = new Envelope(sampleRate);
    // Each voice gets its own noise stream, seeded from its index — so noise is
    // decorrelated between voices (it would comb-filter if identical) while the
    // engine as a whole stays reproducible.
    this.rng = new Rng(0x1234567 + seed * 2654435761);
  }

  get active(): boolean {
    return this.ampEnv.active;
  }

  noteOn(note: number, velocity: number, patch: SynthPatch, age: number): void {
    this.note = note;
    this.age = age;
    this.velocity = Math.min(Math.max(velocity, 0), 1);
    this.baseFrequency = midiToFrequency(note);
    this.unisonCount = Math.min(MAX_UNISON, Math.max(1, Math.round(patch.unisonVoices)));

    this.tuneOscillators(patch);

    // Phases reset together so a percussive attack is identical every time —
    // free-running oscillators make the same patch sound different note to note.
    for (let i = 0; i < this.unisonCount; i++) {
      // Unison copies start spread around the cycle; starting them all at zero
      // sums to one loud in-phase transient instead of a wide chorus.
      const spread = this.unisonCount > 1 ? i / this.unisonCount : 0;
      this.osc1[i].reset(spread);
      this.osc2[i].reset(spread);
    }
    this.sub.reset();
    this.filter.reset();

    this.ampEnv.noteOn(patch.ampAttack, patch.ampDecay, patch.ampSustain);
    this.filterEnv.noteOn(patch.filterAttack, patch.filterDecay, patch.filterSustain);
  }

  private tuneOscillators(patch: SynthPatch): void {
    const f1 = this.baseFrequency * Math.pow(2, patch.osc1Octave);
    const f2 = f1 * Math.pow(2, patch.osc2Detune / 1200);
    const spread = patch.unisonDetune;

    for (let i = 0; i < this.unisonCount; i++) {
      // Symmetric spread: with one voice the offset is zero, so unison at 1
      // is exactly the same pitch as unison off.
      const offset = this.unisonCount > 1 ? ((i / (this.unisonCount - 1)) * 2 - 1) * spread : 0;
      const ratio = Math.pow(2, offset / 1200);
      this.osc1[i].setFrequency(f1 * ratio);
      this.osc2[i].setFrequency(f2 * ratio);
    }
    this.sub.setFrequency(f1 * 0.5);
  }

  noteOff(patch: SynthPatch): void {
    this.ampEnv.noteOff(patch.ampRelease);
    this.filterEnv.noteOff(Math.max(0.01, patch.ampRelease));
  }

  /** Silence immediately — voice stealing. */
  steal(): void {
    this.ampEnv.kill();
    this.filterEnv.kill();
    this.note = -1;
  }

  /**
   * One sample.
   * @param lfoCutoff  Hz to add to the cutoff this sample
   * @param lfoPitch   semitones to bend this sample
   * @param lfoMorph   added to both oscillators' morph
   * @param lfoVolume  multiplier on the output
   */
  tick(patch: SynthPatch, lfoCutoff: number, lfoPitch: number, lfoMorph: number, lfoVolume: number): number {
    if (!this.ampEnv.active) return 0;

    const ampLevel = this.ampEnv.tick();
    const filterLevel = this.filterEnv.tick();

    // Pitch modulation retunes the oscillators; done here rather than per
    // oscillator so unison spread is preserved through the bend.
    if (lfoPitch !== 0) {
      const bend = Math.pow(2, lfoPitch / 12);
      const f1 = this.baseFrequency * Math.pow(2, patch.osc1Octave) * bend;
      const f2 = f1 * Math.pow(2, patch.osc2Detune / 1200);
      for (let i = 0; i < this.unisonCount; i++) {
        const offset =
          this.unisonCount > 1 ? ((i / (this.unisonCount - 1)) * 2 - 1) * patch.unisonDetune : 0;
        const ratio = Math.pow(2, offset / 1200);
        this.osc1[i].setFrequency(f1 * ratio);
        this.osc2[i].setFrequency(f2 * ratio);
      }
    }

    const morph1 = patch.osc1Morph + lfoMorph;
    const morph2 = patch.osc2Morph + lfoMorph;

    // Unison sums N copies, so it is normalised by √N: summing correlated-ish
    // signals grows roughly as √N in perceived level, and dividing by N instead
    // makes wide unison sound quieter than narrow.
    const norm = 1 / Math.sqrt(this.unisonCount);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < this.unisonCount; i++) {
      s2 += this.osc2[i].tick(morph2) * norm;
    }
    // Osc 2 is summed first so FM can use this sample's value rather than the
    // previous one — a one-sample delay in an FM path detunes the sidebands.
    if (patch.fmAmount > 0) {
      const f1 = this.baseFrequency * Math.pow(2, patch.osc1Octave);
      for (let i = 0; i < this.unisonCount; i++) {
        this.osc1[i].setFrequency(Math.max(0, f1 + s2 * patch.fmAmount));
      }
    }
    for (let i = 0; i < this.unisonCount; i++) {
      s1 += this.osc1[i].tick(morph1) * norm;
    }

    let mix = s1 * patch.osc1Level + s2 * patch.osc2Level;
    if (patch.ringAmount > 0) mix += s1 * s2 * patch.ringAmount;
    if (patch.subLevel > 0) mix += this.sub.tick(3) * patch.subLevel;
    if (patch.noiseLevel > 0) mix += this.rng.bipolar() * patch.noiseLevel;

    mix *= this.velocity;

    // Cutoff: knob + envelope + key tracking + LFO, clamped once at the end.
    const keyTrack = (this.note - 60) * 100 * patch.filterKeyTrack;
    const cutoff = patch.filterCutoff + filterLevel * patch.filterEnvAmount + keyTrack + lfoCutoff;

    const filtered = this.filter.tick(mix, cutoff, patch.filterResonance, Math.max(0.01, patch.filterDrive));

    return filtered * ampLevel * lfoVolume;
  }

  /** Retune to a changed patch while held — an octave or detune knob moved
   *  mid-note should be heard, not wait for the next note. */
  retune(patch: SynthPatch): void {
    if (this.note >= 0) this.tuneOscillators(patch);
  }
}
