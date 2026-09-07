// ╔══════════════════════════════════════════════════════════════════╗
// ║  LADDER FILTER — a four-pole cascade with a saturated resonance   ║
// ║  path, in the Moog lineage.                                       ║
// ║                                                                    ║
// ║  Why not a biquad: a biquad is a linear two-pole section, so its   ║
// ║  resonance is a clean mathematical peak that keeps growing until   ║
// ║  it blows up. A ladder's feedback runs through a nonlinearity, so  ║
// ║  as it approaches self-oscillation it COMPRESSES instead — which   ║
// ║  is most of what people mean by an analogue filter sounding warm.  ║
// ║  The tanh() in the feedback path below is that nonlinearity.       ║
// ║                                                                    ║
// ║  HONEST ABOUT WHAT THIS IS. The integrators are topology-          ║
// ║  preserving (trapezoidal, pre-warped), but the resonance is taken  ║
// ║  from the previous sample's fourth state, not solved implicitly.   ║
// ║  So this is a TPT cascade with a one-sample delay in the feedback  ║
// ║  path, NOT a true zero-delay-feedback ladder. The cost is a small  ║
// ║  resonance-frequency error that grows as cutoff approaches         ║
// ║  Nyquist. Calling it "ZDF" would be a nicer label than the code    ║
// ║  has earned.                                                       ║
// ║                                                                    ║
// ║  RESONANCE IS 0..1 HERE, and that is a deliberate correction. The  ║
// ║  version this came from exposed resonance on a 0–25 range — the    ║
// ║  range of a BIQUAD's Q, carried over when the filter was swapped   ║
// ║  for a ladder — and then multiplied it by four into the feedback   ║
// ║  gain. A ladder self-oscillates around k=4, so its "18" preset was ║
// ║  asking for k=72: eighteen times past the top of the scale, held   ║
// ║  together only by the saturator, and every value above ~0.06 on    ║
// ║  the knob sounded the same. One normalised range, mapped once.     ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Feedback gain at which the ladder self-oscillates. Resonance 1.0 maps here. */
export const SELF_OSCILLATION_K = 4;

/** Highest resonance accepted — slightly past self-oscillation, then clamped. */
export const MAX_RESONANCE = 1.2;

export class LadderFilter {
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private s4 = 0;
  private smoothedCutoff: number;
  private readonly sampleRate: number;
  private readonly cutoffCoeff: number;

  constructor(sampleRate: number, initialCutoff = 1000) {
    this.sampleRate = sampleRate;
    this.smoothedCutoff = initialCutoff;
    // ~1ms glide on cutoff, derived from the sample rate rather than a fixed
    // per-sample constant, so the filter sweeps at the same speed at 44.1k.
    this.cutoffCoeff = 1 - Math.exp(-1 / (0.001 * sampleRate));
  }

  /**
   * One sample.
   *
   * @param input     signal in
   * @param cutoff    Hz
   * @param resonance 0..1, where 1 is the edge of self-oscillation
   * @param drive     input gain into the saturator; 1 is clean
   */
  tick(input: number, cutoff: number, resonance: number, drive = 1): number {
    // Above ~49% of the sample rate the bilinear pre-warp diverges.
    const target = Math.min(Math.max(cutoff, 20), this.sampleRate * 0.49);
    this.smoothedCutoff += (target - this.smoothedCutoff) * this.cutoffCoeff;

    const g = Math.tan((Math.PI * this.smoothedCutoff) / this.sampleRate);
    // Clamped a little ABOVE 1.0: pushing just past self-oscillation is a
    // musically useful place to sit, so the range allows it while still
    // bounding what a stale preset value can ask for.
    const k = Math.min(Math.max(resonance, 0), MAX_RESONANCE) * SELF_OSCILLATION_K;

    // Drive into the saturator, then subtract the resonance feedback. Taking
    // the feedback through tanh() is what keeps a self-oscillating filter from
    // running away.
    let x = Math.tanh(input * Math.max(0.0001, drive));
    x -= k * Math.tanh(this.s4);

    const gg = g / (1 + g);

    const v1 = (x - this.s1) * gg;
    const y1 = v1 + this.s1;
    this.s1 = y1 + v1;

    const v2 = (y1 - this.s2) * gg;
    const y2 = v2 + this.s2;
    this.s2 = y2 + v2;

    const v3 = (y2 - this.s3) * gg;
    const y3 = v3 + this.s3;
    this.s3 = y3 + v3;

    const v4 = (y3 - this.s4) * gg;
    const y4 = v4 + this.s4;
    this.s4 = y4 + v4;

    // Resonance in a ladder is a feedback loss of low-frequency gain; adding a
    // fraction of the input back compensates, so turning resonance up does not
    // also turn the patch down.
    return y4 * (1 + k * 0.5);
  }

  reset(): void {
    this.s1 = this.s2 = this.s3 = this.s4 = 0;
  }
}
