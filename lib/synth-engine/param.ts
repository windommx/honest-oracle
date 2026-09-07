// A parameter that ramps toward its target instead of jumping to it.
//
// An instant parameter change is a step discontinuity in the signal, which is
// heard as a click — the "zipper noise" of a knob being turned. A one-pole
// smoother at a few milliseconds removes it without audible lag.
//
// The coefficient is derived from the sample rate, so the smoothing lasts the
// same number of MILLISECONDS at 44.1k and 48k, rather than the same number of
// samples.

/** Seconds for a parameter to cover ~63% of the distance to its target. */
export const SMOOTHING_SECONDS = 0.005;

export class Param {
  /** The target. Set instantly; read by anything that wants the knob position. */
  target: number;
  /** The value the DSP should actually use this sample. */
  private current: number;
  private readonly coeff: number;

  constructor(initial: number, sampleRate: number, smoothingSeconds = SMOOTHING_SECONDS) {
    this.target = initial;
    this.current = initial;
    this.coeff = 1 - Math.exp(-1 / Math.max(1, smoothingSeconds * sampleRate));
  }

  set(v: number): void {
    this.target = v;
  }

  /** Jump immediately — for a preset load, where a 5ms glide on forty knobs at
   *  once is heard as a smear rather than as smoothness. */
  snap(v: number): void {
    this.target = v;
    this.current = v;
  }

  /** Advance one sample and return the smoothed value. */
  next(): number {
    this.current += (this.target - this.current) * this.coeff;
    return this.current;
  }

  /** The smoothed value without advancing — for metering and display. */
  get value(): number {
    return this.current;
  }
}
