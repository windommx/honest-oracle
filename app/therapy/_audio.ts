// ╔══════════════════════════════════════════════════════════════════╗
// ║  AUDIO — the session player's sound, on the shared synth engine.  ║
// ║                                                                    ║
// ║  What this produces is still NOT what the music-therapy trials     ║
// ║  measured, and the UI still says so on the same screen. Those      ║
// ║  studied listener-chosen music and therapist-led sessions; this is ║
// ║  a synthesised tone bed. Better synthesis does not change that     ║
// ║  claim, and nothing here should be read as making it.              ║
// ║                                                                    ║
// ║  What it does change is the two things the tone bed is honestly    ║
// ║  for. The pad was three sine oscillators through a lowpass; it is  ║
// ║  now the shared engine's pad — unison, ladder filter, plate        ║
// ║  reverb. And the tempo pulse, which is the genuinely useful part   ║
// ║  (it tells you which tempo to put your own music on), now runs on  ║
// ║  the audio thread's own sample counter instead of a JS timer, so   ║
// ║  it cannot drift when the page is busy.                            ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { SynthPatch } from "@/lib/synth-engine/types";
import { SynthClient, audioWorkletSupported } from "../synth/_engine-client";

/** True when this browser can produce sound at all — checked before the UI
 *  offers a Play button it cannot honour. */
export function audioSupported(): boolean {
  return audioWorkletSupported();
}

/** MIDI note of the drone. A low A, deliberately below the register that
 *  competes with speech, so the bed sits under thought rather than in it. */
const DRONE_NOTE = 45;
const DRONE_FIFTH = 52;
/** The pulse's own note — high and short, so it reads as a tick over the pad. */
const PULSE_NOTE = 81;

/** A deliberately plain pad: slow, dark, and with nothing that pulls attention.
 *  A patch that is interesting to listen to would be working against the task. */
const TONE_BED: Partial<SynthPatch> = {
  osc1Morph: 0.35,
  osc1Level: 0.5,
  osc2Morph: 0.2,
  osc2Detune: 6,
  osc2Level: 0.4,
  subLevel: 0.2,
  unisonVoices: 4,
  unisonDetune: 9,
  filterCutoff: 900,
  filterResonance: 0.08,
  filterEnvAmount: 400,
  filterAttack: 2,
  filterDecay: 3,
  filterSustain: 0.7,
  ampAttack: 2.5,
  ampDecay: 2,
  ampSustain: 0.85,
  ampRelease: 3,
  lfo1Rate: 0.08,
  lfo1Amount: 0.18,
  lfo1Target: "cutoff",
  chorusRate: 0.35,
  chorusDepth: 0.5,
  delayMix: 0,
  reverbDecay: 0.85,
  reverbMix: 0.4,
  compThreshold: -26,
  compRatio: 2.5,
  compMakeup: 2,
  volume: 0.32,
  stereoWidth: 0.6,
};

export interface AudioOptions {
  bpm: number;
  /** The sustained tone bed. */
  pad: boolean;
  /** The tempo pulse. */
  pulse: boolean;
  /** 0–1. */
  volume: number;
}

export class TherapyAudio {
  private client: SynthClient | null = null;
  private opts: AudioOptions = { bpm: 62, pad: true, pulse: true, volume: 0.4 };

  get running(): boolean {
    return this.client?.running ?? false;
  }

  /** Start playback. Must be called from a user gesture. Returns false when the
   *  browser cannot produce sound, so the caller can say so rather than leaving
   *  a dead Play button. */
  async start(opts: Partial<AudioOptions> = {}): Promise<boolean> {
    if (this.client?.running) return true;
    this.opts = { ...this.opts, ...opts };

    const client = new SynthClient();
    const state = await client.start({
      ...TONE_BED,
      volume: TONE_BED.volume! * this.opts.volume * 2,
    } as SynthPatch);
    if (state !== "running") return false;

    this.client = client;
    if (this.opts.pad) {
      // A root and a fifth: an interval with no third is neither major nor
      // minor, so it does not push the listener toward an emotion.
      client.noteOn(DRONE_NOTE, 0.75);
      client.noteOn(DRONE_FIFTH, 0.55);
    }
    client.setPulse({
      enabled: this.opts.pulse,
      bpm: this.opts.bpm,
      note: PULSE_NOTE,
      velocity: 0.32,
      gateSeconds: 0.14,
    });
    return true;
  }

  /** Change tempo mid-session. The ramp calls this at each segment boundary;
   *  the clock keeps its phase, so the tempo glides rather than restarting. */
  setBpm(bpm: number): void {
    this.opts.bpm = Math.max(30, Math.min(220, bpm));
    this.client?.setPulse({ bpm: this.opts.bpm });
  }

  setVolume(volume: number): void {
    this.opts.volume = Math.max(0, Math.min(1, volume));
    this.client?.setPatch({ volume: TONE_BED.volume! * this.opts.volume * 2 });
  }

  setPad(on: boolean): void {
    this.opts.pad = on;
    if (!this.client?.running) return;
    if (on) {
      this.client.noteOn(DRONE_NOTE, 0.75);
      this.client.noteOn(DRONE_FIFTH, 0.55);
    } else {
      this.client.noteOff(DRONE_NOTE);
      this.client.noteOff(DRONE_FIFTH);
    }
  }

  setPulse(on: boolean): void {
    this.opts.pulse = on;
    this.client?.setPulse({ enabled: on });
  }

  /**
   * A breath cue: a tone that glides up over an inhale and down over an exhale.
   *
   * Deliberately NOT a synth voice. A glide between two pitches is one
   * oscillator with a frequency ramp; routing it through a polyphonic engine
   * with envelopes and a filter would be more machinery for a worse result, so
   * it borrows the engine's context and mixes in beside it.
   */
  cueBreath(direction: "up" | "down" | "hold", seconds: number): void {
    const ctx = this.client?.context;
    const dest = this.client?.destination;
    if (!ctx || !dest || direction === "hold" || seconds <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";

    const [from, to] = direction === "up" ? [220, 330] : [330, 220];
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.linearRampToValueAtTime(to, now + seconds);

    // Ramps rather than steps at both ends: an instant gain change is a click,
    // and a click in a breathing exercise is the opposite of the point.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.08 * this.opts.volume, now + Math.min(0.4, seconds / 3));
    gain.gain.linearRampToValueAtTime(0.0001, now + seconds);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
  }

  /** Stop and release everything. */
  stop(): void {
    const client = this.client;
    this.client = null;
    void client?.stop();
  }
}
