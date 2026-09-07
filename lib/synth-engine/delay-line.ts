// ╔══════════════════════════════════════════════════════════════════╗
// ║  DELAY LINE — the primitive every time-based effect is built on.  ║
// ║                                                                    ║
// ║  Factored out because the version this came from open-coded a      ║
// ║  circular buffer in five places and got the wrap wrong in one of   ║
// ║  them: `_delR[(_wPosR - 3) % len]` is a NEGATIVE index for the     ║
// ║  first three samples of playback, which in C# throws               ║
// ║  IndexOutOfRangeException — the reverb crashed on the first note   ║
// ║  every time.                                                       ║
// ║                                                                    ║
// ║  One implementation, wrapped correctly once, with a test for the   ║
// ║  first-samples case specifically.                                  ║
// ╚══════════════════════════════════════════════════════════════════╝

export class DelayLine {
  private readonly buffer: Float64Array;
  private writePos = 0;

  constructor(maxSamples: number) {
    this.buffer = new Float64Array(Math.max(2, Math.ceil(maxSamples)));
  }

  get size(): number {
    return this.buffer.length;
  }

  /** Write one sample and advance. */
  write(x: number): void {
    this.buffer[this.writePos] = x;
    this.writePos = (this.writePos + 1) % this.buffer.length;
  }

  /** Read `delaySamples` back. Whole-sample; wraps safely for any delay,
   *  including one longer than has been written yet (reads the zeroed tail). */
  read(delaySamples: number): number {
    const d = Math.min(Math.max(delaySamples, 0), this.buffer.length - 1);
    // + size before the modulo: the naive form goes negative early in playback.
    const idx = (this.writePos - Math.round(d) + this.buffer.length) % this.buffer.length;
    return this.buffer[idx];
  }

  /** Read at a fractional delay, linearly interpolated — needed by anything
   *  that modulates its delay time (chorus, flanger) without stepping. */
  readInterpolated(delaySamples: number): number {
    const d = Math.min(Math.max(delaySamples, 0), this.buffer.length - 2);
    const whole = Math.floor(d);
    const frac = d - whole;
    const len = this.buffer.length;
    const i0 = (this.writePos - whole + len) % len;
    const i1 = (i0 - 1 + len) % len;
    return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
  }

  clear(): void {
    this.buffer.fill(0);
    this.writePos = 0;
  }
}

/** A Schroeder allpass — the diffusion building block of a reverb. Passes all
 *  frequencies at equal gain while smearing them in time, which is how a room
 *  turns a click into a wash without colouring it. */
export class Allpass {
  private readonly line: DelayLine;
  private readonly delaySamples: number;
  private readonly gain: number;

  constructor(delaySamples: number, gain = 0.7) {
    this.delaySamples = Math.max(1, Math.round(delaySamples));
    this.line = new DelayLine(this.delaySamples + 2);
    this.gain = Math.min(Math.max(gain, -0.99), 0.99);
  }

  tick(x: number): number {
    const delayed = this.line.read(this.delaySamples);
    const v = x + this.gain * delayed;
    this.line.write(v);
    return delayed - this.gain * v;
  }

  clear(): void {
    this.line.clear();
  }
}
