// ╔══════════════════════════════════════════════════════════════════╗
// ║  RNG — seeded, because a synth engine has to be reproducible.     ║
// ║                                                                    ║
// ║  All three source versions reached for the platform's own random   ║
// ║  (Math.random / new Random()) for the noise oscillator. That makes ║
// ║  the whole engine non-deterministic, which in this repo is not a   ║
// ║  style objection — CONTRIBUTING forbids Math.random() in an output ║
// ║  path — but a practical one: an engine whose output differs run to ║
// ║  run cannot be snapshot-tested, so nothing downstream of the noise ║
// ║  source can be regression-tested at all.                           ║
// ║                                                                    ║
// ║  mulberry32: one multiply-xorshift round, ~2^32 period. Plenty for ║
// ║  a noise source, and it costs about the same as Math.random().     ║
// ╚══════════════════════════════════════════════════════════════════╝

export class Rng {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    // Zero is a fixed point for this generator, so it is nudged off it.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [-1, 1) — the white-noise sample. */
  bipolar(): number {
    return this.next() * 2 - 1;
  }

  reset(seed = 0x9e3779b9): void {
    this.state = seed >>> 0 || 0x9e3779b9;
  }
}
