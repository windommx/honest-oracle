// ╔══════════════════════════════════════════════════════════════════╗
// ║  SYNTH — the whole instrument, as a function from time to samples.║
// ║                                                                    ║
// ║  The architectural decision that separates this from all three     ║
// ║  versions it came from: THE ENGINE RENDERS INTO A BUFFER and knows ║
// ║  nothing about how that buffer reaches a speaker.                  ║
// ║                                                                    ║
// ║  The Web Audio version built its signal path out of live           ║
// ║  AudioNodes, and the C# versions out of NAudio device callbacks.   ║
// ║  Both are untestable by construction: you cannot assert anything   ║
// ║  about a sound that only exists inside an audio driver. Here the   ║
// ║  browser calls render() from an AudioWorklet and the test suite    ║
// ║  calls the same render() into a plain array, so every claim in     ║
// ║  this folder is checked against the actual samples the instrument  ║
// ║  produces.                                                         ║
// ║                                                                    ║
// ║  Determinism follows from the same decision: no clock is read      ║
// ║  anywhere (LFO phase advances per sample), and noise comes from a  ║
// ║  seeded generator, so the same notes always render the same bytes. ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Chorus, Compressor, PlateReverb, Saturator, StereoDelay } from "./effects";
import { DEFAULT_PATCH } from "./presets";
import { Voice } from "./voice";
import type { LfoTarget, PatchUpdate, SynthPatch } from "./types";

/** Simultaneous notes. Above this the oldest is stolen. */
export const MAX_VOICES = 16;

interface NoteEvent {
  type: "on" | "off";
  note: number;
  velocity: number;
}

/** A steady pulse generated ON THE AUDIO THREAD.
 *
 *  A metronome driven from the main thread inherits setInterval's jitter, which
 *  under load is tens of milliseconds — several percent of a beat, and audible
 *  as an unsteady tempo. Counting samples inside the render loop makes the
 *  period exact by construction. MindBridge's iso-principle ramp uses this to
 *  hold each segment's tempo; a synth can use it as a metronome or a simple
 *  repeat. */
export interface PulseSettings {
  enabled: boolean;
  bpm: number;
  /** MIDI note the pulse plays. */
  note: number;
  velocity: number;
  /** How long each pulse sounds, in seconds. */
  gateSeconds: number;
}

export const PULSE_OFF: PulseSettings = {
  enabled: false,
  bpm: 60,
  note: 67,
  velocity: 0.5,
  gateSeconds: 0.1,
};

export class Synth {
  readonly sampleRate: number;
  patch: SynthPatch;

  private readonly voices: Voice[] = [];
  private readonly saturator: Saturator;
  private readonly chorus: Chorus;
  private readonly delay: StereoDelay;
  private readonly reverb: PlateReverb;
  private readonly compL: Compressor;
  private readonly compR: Compressor;

  private lfo1Phase = 0;
  private lfo2Phase = 0;
  private ageCounter = 0;
  /** Events queued between render calls, applied at the top of the next block. */
  private pending: NoteEvent[] = [];

  private pulse: PulseSettings = { ...PULSE_OFF };
  /** Samples until the next pulse fires. */
  private pulseCountdown = 0;
  /** Samples until the sounding pulse is released; -1 when none is sounding. */
  private pulseGate = -1;

  constructor(sampleRate: number, patch: Partial<SynthPatch> = {}) {
    this.sampleRate = sampleRate;
    this.patch = { ...DEFAULT_PATCH, ...patch };
    for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice(sampleRate, i));
    this.saturator = new Saturator(sampleRate);
    this.chorus = new Chorus(sampleRate);
    this.delay = new StereoDelay(sampleRate);
    this.reverb = new PlateReverb(sampleRate);
    this.compL = new Compressor(sampleRate);
    this.compR = new Compressor(sampleRate);
  }

  get activeVoiceCount(): number {
    return this.voices.reduce((n, v) => n + (v.active ? 1 : 0), 0);
  }

  noteOn(note: number, velocity = 1): void {
    this.pending.push({ type: "on", note, velocity });
  }

  noteOff(note: number): void {
    this.pending.push({ type: "off", note, velocity: 0 });
  }

  /** Release everything. */
  allNotesOff(): void {
    for (const v of this.voices) if (v.active) v.noteOff(this.patch);
    this.pending = [];
  }

  /** Silence everything at once, including tails. */
  panic(): void {
    for (const v of this.voices) v.steal();
    this.pending = [];
    this.pulseGate = -1;
    this.saturator.reset();
    this.chorus.reset();
    this.delay.reset();
    this.reverb.reset();
    this.compL.reset();
    this.compR.reset();
  }

  setPatch(update: PatchUpdate): void {
    this.patch = { ...this.patch, ...update };
    for (const v of this.voices) v.retune(this.patch);
  }

  /** Configure the audio-thread pulse. Changing the tempo keeps the phase — the
   *  next beat lands where the new tempo says, rather than restarting the bar,
   *  so a tempo ramp glides instead of stuttering at every segment boundary. */
  setPulse(update: Partial<PulseSettings>): void {
    const wasEnabled = this.pulse.enabled;
    this.pulse = { ...this.pulse, ...update };
    if (this.pulse.enabled && !wasEnabled) {
      // Fire immediately on enable so the first beat is not a period late.
      this.pulseCountdown = 0;
    }
    if (!this.pulse.enabled && wasEnabled && this.pulseGate >= 0) {
      this.applyNoteOff(this.pulse.note);
      this.pulseGate = -1;
    }
  }

  get pulseSettings(): Readonly<PulseSettings> {
    return this.pulse;
  }

  /** Advance the pulse by one sample, triggering and releasing as due. */
  private tickPulse(): void {
    if (this.pulseGate >= 0 && --this.pulseGate <= 0) {
      this.applyNoteOff(this.pulse.note);
      this.pulseGate = -1;
    }
    if (!this.pulse.enabled) return;
    if (--this.pulseCountdown > 0) return;

    const period = Math.max(1, Math.round((60 / Math.max(1, this.pulse.bpm)) * this.sampleRate));
    this.pulseCountdown = period;
    // A gate longer than the period would retrigger a note that is still
    // sounding, which on a fast tempo silently drops beats.
    this.pulseGate = Math.min(period - 1, Math.max(1, Math.round(this.pulse.gateSeconds * this.sampleRate)));
    this.applyNoteOn(this.pulse.note, this.pulse.velocity);
  }

  private applyNoteOn(note: number, velocity: number): void {
    // Retrigger the same note if it is already sounding, rather than stacking
    // a second voice on it — two voices on one pitch is 6dB louder and beats.
    let voice = this.voices.find((v) => v.active && v.note === note);
    if (!voice) voice = this.voices.find((v) => !v.active);
    if (!voice) {
      // All busy: steal the oldest. Stealing the newest would cut off the note
      // the player just pressed, which is the one they are listening for.
      voice = this.voices.reduce((oldest, v) => (v.age < oldest.age ? v : oldest), this.voices[0]);
      voice.steal();
    }
    voice.noteOn(note, velocity, this.patch, ++this.ageCounter);
  }

  private applyNoteOff(note: number): void {
    for (const v of this.voices) if (v.active && v.note === note) v.noteOff(this.patch);
  }

  private drainEvents(): void {
    for (const e of this.pending) {
      if (e.type === "on") this.applyNoteOn(e.note, e.velocity);
      else this.applyNoteOff(e.note);
    }
    this.pending.length = 0;
  }

  /** Split one LFO's output across the four destinations. */
  private lfoContribution(value: number, amount: number, target: LfoTarget) {
    const v = value * amount;
    return {
      cutoff: target === "cutoff" ? v * 4000 : 0,
      pitch: target === "pitch" ? v * 0.5 : 0, // ±½ semitone at full depth
      morph: target === "morph" ? v * 1.5 : 0,
      volume: target === "volume" ? 1 + v * 0.5 : 1,
    };
  }

  /**
   * Render one block. `left` and `right` are filled, not added to.
   * The same call the AudioWorklet makes and the tests make.
   */
  render(left: Float32Array, right: Float32Array): void {
    this.drainEvents();
    const p = this.patch;
    const n = Math.min(left.length, right.length);

    const lfo1Inc = p.lfo1Rate / this.sampleRate;
    const lfo2Inc = p.lfo2Rate / this.sampleRate;

    for (let i = 0; i < n; i++) {
      this.tickPulse();

      this.lfo1Phase += lfo1Inc;
      if (this.lfo1Phase >= 1) this.lfo1Phase -= 1;
      this.lfo2Phase += lfo2Inc;
      if (this.lfo2Phase >= 1) this.lfo2Phase -= 1;

      const a = this.lfoContribution(Math.sin(2 * Math.PI * this.lfo1Phase), p.lfo1Amount, p.lfo1Target);
      const b = this.lfoContribution(Math.sin(2 * Math.PI * this.lfo2Phase), p.lfo2Amount, p.lfo2Target);

      let mono = 0;
      for (const v of this.voices) {
        if (v.active) {
          mono += v.tick(p, a.cutoff + b.cutoff, a.pitch + b.pitch, a.morph + b.morph, a.volume * b.volume);
        }
      }

      // Voices are summed, not averaged: a chord IS louder than one note. The
      // gentle scaling keeps a full 16-voice chord inside headroom without
      // making a single note quiet.
      mono *= 0.35;

      mono = this.saturator.tick(mono, p.saturation);

      const [chL, chR] = this.chorus.tick(mono, p.chorusRate, p.chorusDepth);

      // Mid/side width. At width 0 the two channels collapse to mono, which is
      // what a mono-compatible patch needs.
      const mid = (chL + chR) * 0.5;
      const side = (chL - chR) * 0.5 * p.stereoWidth;
      let outL = mid + side;
      let outR = mid - side;

      [outL, outR] = this.delay.tick(outL, outR, p.delayTime, p.delayFeedback, p.delayMix);

      const [revL, revR] = this.reverb.tick(mono, p.reverbDecay, p.reverbMix);
      outL += revL;
      outR += revR;

      outL = this.compL.tick(outL, p.compThreshold, p.compRatio, p.compMakeup);
      outR = this.compR.tick(outR, p.compThreshold, p.compRatio, p.compMakeup);

      outL *= p.volume;
      outR *= p.volume;

      // Final limiter. tanh rather than a hard clip: a hard clip at the very
      // end of the chain undoes the anti-aliasing everything upstream did.
      left[i] = Math.tanh(outL);
      right[i] = Math.tanh(outR);
    }
  }

  /** Render `seconds` into a fresh pair of buffers — the test/offline entry. */
  renderSeconds(seconds: number): { left: Float32Array; right: Float32Array } {
    const n = Math.round(seconds * this.sampleRate);
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    this.render(left, right);
    return { left, right };
  }
}
