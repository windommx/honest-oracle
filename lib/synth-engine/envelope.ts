// ╔══════════════════════════════════════════════════════════════════╗
// ║  ENVELOPE — exponential shape, exact duration.                    ║
// ║                                                                    ║
// ║  Two things have to be true at once, and the naive one-pole gets   ║
// ║  only the first:                                                   ║
// ║                                                                    ║
// ║  1. THE CURVE MUST BE EXPONENTIAL. Web Audio's                     ║
// ║     linearRampToValueAtTime draws a straight line, and a straight  ║
// ║     decay does not sound like a plucked string: physical energy    ║
// ║     decays exponentially and the ear hears loudness roughly        ║
// ║     logarithmically, so a linear ramp seems to hang and then fall  ║
// ║     off a cliff.                                                   ║
// ║                                                                    ║
// ║  2. THE TIME MUST BE THE TIME. An exponential aimed at its target  ║
// ║     never arrives, so "when is the stage over?" needs an answer.   ║
// ║     A plain one-pole with a time constant of `attack` reaches full ║
// ║     level after about FOUR time constants — a knob reading 10ms    ║
// ║     that takes 39ms. The first draft of this file did exactly      ║
// ║     that, and its own test caught it.                              ║
// ║                                                                    ║
// ║  So: the coefficient is set to cover 99% of the span in the stated ║
// ║  time (4.6 time constants), and a sample countdown ends the stage  ║
// ║  exactly on time, snapping the last 1%. The shape is exponential,  ║
// ║  the duration is what the knob says, and the residual step is a    ║
// ║  hundredth of the span — well under audibility.                    ║
// ╚══════════════════════════════════════════════════════════════════╝

export type EnvelopeStage = "idle" | "attack" | "decay" | "sustain" | "release";

/** Time constants to cover 99% of a span: -ln(0.01). */
const NINETY_NINE_PERCENT = 4.605;

export class Envelope {
  private stage: EnvelopeStage = "idle";
  private level = 0;
  private target = 0;
  private coeff = 1;
  /** Samples left in the current timed stage. */
  private remaining = 0;
  private sustainLevel = 0;
  private decaySeconds = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /** Per-sample coefficient that covers 99% of the span in `seconds`. */
  private coeffFor(seconds: number): number {
    const samples = seconds * this.sampleRate;
    return samples >= 1 ? 1 - Math.exp(-NINETY_NINE_PERCENT / samples) : 1;
  }

  private beginStage(stage: EnvelopeStage, target: number, seconds: number): void {
    this.stage = stage;
    this.target = target;
    this.coeff = this.coeffFor(seconds);
    this.remaining = Math.max(0, Math.round(seconds * this.sampleRate));
  }

  noteOn(attack: number, decay: number, sustain: number): void {
    this.sustainLevel = Math.min(Math.max(sustain, 0), 1);
    this.decaySeconds = Math.max(0, decay);
    this.beginStage("attack", 1, Math.max(0, attack));
    if (this.remaining === 0) {
      this.level = 1;
      this.beginStage("decay", this.sustainLevel, this.decaySeconds);
      if (this.remaining === 0) {
        this.level = this.sustainLevel;
        this.stage = "sustain";
      }
    }
  }

  noteOff(release: number): void {
    // A note-off arriving after the voice already finished must not resurrect
    // it — that would be an audible ghost note.
    if (this.stage === "idle") return;
    this.beginStage("release", 0, Math.max(0, release));
    if (this.remaining === 0) {
      this.level = 0;
      this.stage = "idle";
    }
  }

  /** Cut to silence immediately — for voice stealing, where the stolen note's
   *  release tail would otherwise bleed into the new one. */
  kill(): void {
    this.stage = "idle";
    this.level = 0;
    this.remaining = 0;
  }

  tick(): number {
    if (this.stage === "idle") return 0;
    if (this.stage === "sustain") {
      this.level = this.sustainLevel;
      return this.level;
    }

    this.level += (this.target - this.level) * this.coeff;
    this.remaining--;

    if (this.remaining <= 0) {
      // Snap the residual ~1% and move on, so the stage lasts exactly as long
      // as the knob says.
      this.level = this.target;
      if (this.stage === "attack") {
        this.beginStage("decay", this.sustainLevel, this.decaySeconds);
        if (this.remaining === 0) {
          this.level = this.sustainLevel;
          this.stage = "sustain";
        }
      } else if (this.stage === "decay") {
        this.stage = "sustain";
      } else {
        this.stage = "idle";
        this.level = 0;
      }
    }

    return this.level;
  }

  get active(): boolean {
    return this.stage !== "idle";
  }

  get currentStage(): EnvelopeStage {
    return this.stage;
  }

  get currentLevel(): number {
    return this.level;
  }
}
