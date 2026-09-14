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

import { BitCrusher, Chorus, Compressor, Flanger, Phaser, PlateReverb, Saturator, StereoDelay } from "./effects";
import { DrumKit, type DrumId } from "./drums";
import { Rng } from "./rng";
import { Sequencer, type SequencerPattern } from "./sequencer";
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
  private readonly phaser: Phaser;
  private readonly flanger: Flanger;
  private readonly crusher: BitCrusher;
  private readonly drums: DrumKit;
  private readonly sequencer: Sequencer;

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
    this.phaser = new Phaser(sampleRate);
    this.flanger = new Flanger(sampleRate);
    this.crusher = new BitCrusher();
    // The kit gets its own noise stream so a drum hit cannot change what a
    // held note's noise oscillator produces — which would make the engine
    // non-reproducible in exactly the way the seeded Rng exists to prevent.
    this.drums = new DrumKit(sampleRate, new Rng(0xd2005));
    this.sequencer = new Sequencer(sampleRate);
  }

  /** Hit a drum pad. Independent of the keyboard: pads do not consume voices
   *  and are not affected by note-off. */
  triggerDrum(id: DrumId, velocity = 1): void {
    this.drums.trigger(id, velocity);
  }

  /** Replace the drawable wavetable every voice reads. */
  setUserTable(samples: ArrayLike<number>): void {
    for (const v of this.voices) v.setUserTable(samples);
  }

  get activeVoiceCount(): number {
    return this.voices.reduce((n, v) => n + (v.active ? 1 : 0), 0);
  }

  get activeDrumCount(): number {
    return this.drums.activeCount;
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
    // Panic means silence. Leaving the sequencer running would re-fill the
    // voices a few milliseconds later, which reads as the button not working.
    this.sequencer.stop();
    this.saturator.reset();
    this.chorus.reset();
    this.phaser.reset();
    this.flanger.reset();
    this.crusher.reset();
    this.drums.silence();
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

  /** Load or edit the step pattern.
   *
   *  Edits apply from the next step; the playing position is kept, so changing
   *  a note while the sequence runs does not jump it back to the top. */
  setPattern(pattern: Partial<SequencerPattern>): void {
    this.sequencer.setPattern(pattern);
  }

  getPattern(): SequencerPattern {
    return this.sequencer.getPattern();
  }

  startSequencer(): void {
    this.sequencer.start();
  }

  /** Stop and release whatever the sequence was holding — without this the
   *  last step's notes sustain forever. */
  stopSequencer(): void {
    for (const e of this.sequencer.stop()) {
      if (e.type === "noteOff") this.noteOff(e.note);
    }
  }

  get sequencerRunning(): boolean {
    return this.sequencer.isRunning;
  }

  /** Step currently sounding, or -1. What a playhead should highlight. */
  get sequencerStep(): number {
    return this.sequencer.currentStep;
  }

  /** Advance the sequence one sample and act on whatever it emits.
   *
   *  This runs INSIDE the render loop, so a step boundary lands on an exact
   *  sample rather than on whenever a main-thread timer happened to wake. */
  private tickSequencer(): void {
    const events = this.sequencer.tick();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.type === "noteOn") this.applyNoteOn(e.note, e.velocity);
      else if (e.type === "noteOff") this.applyNoteOff(e.note);
      else this.drums.trigger(e.id, e.velocity);
    }
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
      this.tickSequencer();

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

      // Drums join before the effects so they are shaped by the same chain —
      // a crushed, reverbed kit is most of what the effects are for here.
      mono += this.drums.tick() * 0.8;

      // Voices are summed, not averaged: a chord IS louder than one note. The
      // gentle scaling keeps a full 16-voice chord inside headroom without
      // making a single note quiet.
      mono *= 0.35;

      // Chain order follows the v7 layout: distortion first (it is loudest
      // when fed a clean signal), then the phase effects, then the crusher,
      // then the time effects. Reordering changes the sound, so it is fixed.
      mono = this.saturator.tick(mono, p.saturation);
      mono = this.phaser.tick(mono, p.phaserRate, p.phaserDepth, p.phaserFeedback);
      mono = this.flanger.tick(mono, p.flangerRate, p.flangerDepth, p.flangerFeedback);
      mono = this.crusher.tick(mono, p.crushBits, p.crushRateDivisor);

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
