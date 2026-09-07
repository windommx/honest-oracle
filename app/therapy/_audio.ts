// ╔══════════════════════════════════════════════════════════════════╗
// ║  AUDIO — a tone bed and a tempo pulse, and no pretence about it.  ║
// ║                                                                    ║
// ║  What this synthesises is NOT what the music-therapy trials        ║
// ║  measured. Those studied listener-chosen music and therapist-led   ║
// ║  sessions; this is two detuned oscillators and a click. The UI     ║
// ║  says so on the same screen, and the honest use of this module is  ║
// ║  the SECOND one: it holds the tempo the iso-principle ramp asks    ║
// ║  for, so you can put on music you actually like at that tempo.     ║
// ║                                                                    ║
// ║  Implementation notes:                                             ║
// ║   · An AudioContext may only be created from a user gesture, so    ║
// ║     construction is deferred to start().                           ║
// ║   · The pulse uses the standard lookahead scheduler — a JS timer   ║
// ║     wakes every 25ms and schedules any beat falling inside the     ║
// ║     next 100ms against the audio clock. Scheduling beats straight  ║
// ║     from setInterval would inherit the timer's jitter, which is    ║
// ║     audible as an unsteady pulse at exactly the tempos we use.     ║
// ║   · Every gain change is a ramp, never a step: an instant gain     ║
// ║     change produces a click, and a click in a relaxation app is    ║
// ║     the opposite of the product.                                   ║
// ╚══════════════════════════════════════════════════════════════════╝

/** How far ahead of the audio clock beats are scheduled, in seconds. */
const LOOKAHEAD_S = 0.1;
/** How often the scheduler wakes, in ms. */
const TICK_MS = 25;
/** Root of the pad, in Hz. A low A — deliberately below the register that
 *  competes with speech, so the bed sits under thought rather than in it. */
const ROOT_HZ = 110;

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True when this browser can produce sound at all — checked before the UI
 *  offers a Play button it cannot honour. */
export function audioSupported(): boolean {
  return audioContextCtor() !== null;
}

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
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private opts: AudioOptions = { bpm: 62, pad: true, pulse: true, volume: 0.4 };

  get running(): boolean {
    return this.ctx !== null;
  }

  /** Start playback. Must be called from a user gesture. Returns false when the
   *  browser has no Web Audio at all, so the caller can say so rather than
   *  leaving a dead Play button. */
  start(opts: Partial<AudioOptions> = {}): boolean {
    if (this.ctx) return true;
    const Ctor = audioContextCtor();
    if (!Ctor) return false;

    this.opts = { ...this.opts, ...opts };
    this.ctx = new Ctor();
    const now = this.ctx.currentTime;

    this.master = this.ctx.createGain();
    this.master.gain.setValueAtTime(0, now);
    // Fade in over a second — a relaxation session that begins with a jolt has
    // undone its own first minute.
    this.master.gain.linearRampToValueAtTime(this.opts.volume, now + 1);
    this.master.connect(this.ctx.destination);

    this.buildPad();
    this.nextBeat = now + 0.2;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    return true;
  }

  /** A soft bed: a root, its fifth, and a slightly detuned root for movement,
   *  all under a lowpass so the upper partials never get bright. */
  private buildPad(): void {
    if (!this.ctx || !this.master) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.6;

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = this.opts.pad ? 0.22 : 0;

    filter.connect(this.padGain);
    this.padGain.connect(this.master);

    for (const [hz, detune] of [
      [ROOT_HZ, 0],
      [ROOT_HZ, 6], // a few cents apart: the beating between them is the movement
      [ROOT_HZ * 1.5, -4], // the fifth
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
      this.oscillators.push(osc);
    }
  }

  /** Schedule every beat that falls inside the lookahead window. */
  private schedule(): void {
    if (!this.ctx) return;
    const period = 60 / this.opts.bpm;
    while (this.nextBeat < this.ctx.currentTime + LOOKAHEAD_S) {
      if (this.opts.pulse) this.click(this.nextBeat);
      this.nextBeat += period;
    }
  }

  /** One pulse: a short sine with a fast attack and an exponential tail. */
  private click(at: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(392, at); // a soft G, not a hard tick
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.16, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(at);
    osc.stop(at + 0.25);
  }

  /** Change tempo mid-session. The ramp calls this at each segment boundary; the
   *  already-scheduled beat stands, so the change takes effect on the next one
   *  rather than cutting a beat short. */
  setBpm(bpm: number): void {
    this.opts.bpm = Math.max(30, Math.min(220, bpm));
  }

  setVolume(volume: number): void {
    this.opts.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.master) {
      this.master.gain.linearRampToValueAtTime(this.opts.volume, this.ctx.currentTime + 0.1);
    }
  }

  setPad(on: boolean): void {
    this.opts.pad = on;
    if (this.ctx && this.padGain) {
      this.padGain.gain.linearRampToValueAtTime(on ? 0.22 : 0, this.ctx.currentTime + 0.3);
    }
  }

  setPulse(on: boolean): void {
    this.opts.pulse = on;
  }

  /** A breath cue: a tone that glides up over an inhale and down over an exhale.
   *  `seconds` comes from the pattern, so the cue is exactly as long as the phase. */
  cueBreath(direction: "up" | "down" | "hold", seconds: number): void {
    if (!this.ctx || !this.master || direction === "hold") return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";

    const [from, to] = direction === "up" ? [220, 330] : [330, 220];
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.linearRampToValueAtTime(to, now + seconds);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + Math.min(0.4, seconds / 3));
    gain.gain.linearRampToValueAtTime(0.0001, now + seconds);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
  }

  /** Stop and release everything. Fades out first, then closes the context a
   *  beat later — closing mid-tone is an audible click. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx) return;

    if (master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    }
    const oscillators = this.oscillators;
    setTimeout(() => {
      for (const o of oscillators) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      void ctx.close();
    }, 500);

    this.ctx = null;
    this.master = null;
    this.padGain = null;
    this.oscillators = [];
  }
}
