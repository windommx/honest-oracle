// ╔══════════════════════════════════════════════════════════════════╗
// ║  LOUDNESS — ITU-R BS.1770-4, because "loud enough" is a number.    ║
// ║                                                                    ║
// ║  Every streaming service normalises to a LUFS target. A master     ║
// ║  delivered louder than the target is turned DOWN on playback, so   ║
// ║  the extra limiting that bought the loudness is heard without the  ║
// ║  loudness — strictly worse than not having done it. A peak meter   ║
// ║  cannot show this: two masters with identical peaks can differ by  ║
// ║  6 LU. So the meter here implements the actual standard rather     ║
// ║  than an RMS reading with a nice name.                             ║
// ║                                                                    ║
// ║  Verified against EBU Tech 3341: a 1kHz sine at -23dBFS in both    ║
// ║  channels must read -23.0 LUFS. That test passes or this file is   ║
// ║  wrong, and the numbers it shows would be decoration.              ║
// ║                                                                    ║
// ║  The K-weighting coefficients are DERIVED from the standard's      ║
// ║  analog prototype rather than pasted at 48kHz, so a 44.1k file is  ║
// ║  measured correctly too. A test checks the derivation reproduces   ║
// ║  the published 48kHz numbers.                                      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Biquad, type BiquadCoefficients } from "./biquad";

/** The offset in the standard's loudness equation. It exists so that the
 *  K-weighting's own gain at 1kHz cancels out and a 1kHz tone reads its own
 *  dBFS value. */
const LUFS_OFFSET = -0.691;

/** Blocks quieter than this never count, however quiet the track is. */
export const ABSOLUTE_GATE_LUFS = -70;
/** And blocks more than this far below the ungated average are dropped too,
 *  which is what stops a long fade-out from dragging the reading down. */
export const RELATIVE_GATE_LU = -10;

const BLOCK_SECONDS = 0.4;
/** 75% overlap, per the standard. */
const BLOCK_STEP_SECONDS = 0.1;

/** Shelving stage — the head-and-torso response. */
export function kWeightingShelf(sampleRate: number): BiquadCoefficients {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

/** Highpass stage — removes the rumble the ear does not weigh. */
export function kWeightingHighpass(sampleRate: number): BiquadCoefficients {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / sampleRate);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

/** The two stages, per channel. */
export class KWeighting {
  private readonly shelf = new Biquad();
  private readonly highpass = new Biquad();

  constructor(sampleRate: number) {
    this.shelf.setCoefficients(kWeightingShelf(sampleRate));
    this.highpass.setCoefficients(kWeightingHighpass(sampleRate));
  }

  reset(): void {
    this.shelf.reset();
    this.highpass.reset();
  }

  tick(x: number): number {
    return this.highpass.tick(this.shelf.tick(x));
  }
}

const loudnessOf = (meanSquareSum: number) =>
  meanSquareSum <= 0 ? -Infinity : LUFS_OFFSET + 10 * Math.log10(meanSquareSum);

/** Mean squares of every 400ms block, K-weighted and summed across channels. */
function blockMeanSquares(channels: Float32Array[], sampleRate: number): number[] {
  const blockSamples = Math.round(BLOCK_SECONDS * sampleRate);
  const stepSamples = Math.round(BLOCK_STEP_SECONDS * sampleRate);
  const length = channels.length === 0 ? 0 : channels[0].length;
  if (length < blockSamples) return [];

  // Filter once into a scratch buffer rather than re-filtering per block; the
  // blocks overlap by 75%, so the naive version does four times the work.
  const weighted = channels.map((ch) => {
    const k = new KWeighting(sampleRate);
    const out = new Float64Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = k.tick(ch[i]);
    return out;
  });

  // Running sums of squares, so each block is two lookups instead of a scan.
  const cumulative = weighted.map((w) => {
    const c = new Float64Array(w.length + 1);
    for (let i = 0; i < w.length; i++) c[i + 1] = c[i] + w[i] * w[i];
    return c;
  });

  const blocks: number[] = [];
  for (let start = 0; start + blockSamples <= length; start += stepSamples) {
    let sum = 0;
    for (const c of cumulative) sum += (c[start + blockSamples] - c[start]) / blockSamples;
    blocks.push(sum);
  }
  return blocks;
}

/**
 * Integrated loudness over the whole programme, gated per the standard.
 *
 * Returns -Infinity for silence — not a made-up floor, because a floor would
 * be indistinguishable from a real quiet measurement.
 */
export function integratedLufs(channels: Float32Array[], sampleRate: number): number {
  const blocks = blockMeanSquares(channels, sampleRate);
  if (blocks.length === 0) return -Infinity;

  const aboveAbsolute = blocks.filter((z) => loudnessOf(z) > ABSOLUTE_GATE_LUFS);
  if (aboveAbsolute.length === 0) return -Infinity;

  const ungatedMean = aboveAbsolute.reduce((a, b) => a + b, 0) / aboveAbsolute.length;
  const relativeGate = loudnessOf(ungatedMean) + RELATIVE_GATE_LU;

  const kept = aboveAbsolute.filter((z) => loudnessOf(z) > relativeGate);
  if (kept.length === 0) return -Infinity;

  return loudnessOf(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/** Loudness over a trailing window, ungated — what a meter shows while
 *  playing. 0.4s is "momentary", 3s is "short-term" in the standard. */
export function windowedLufs(channels: Float32Array[], sampleRate: number, seconds: number): number {
  const want = Math.round(seconds * sampleRate);
  const trimmed = channels.map((ch) => ch.subarray(Math.max(0, ch.length - want)));
  if (trimmed.length === 0 || trimmed[0].length === 0) return -Infinity;
  let sum = 0;
  for (const ch of trimmed) {
    const k = new KWeighting(sampleRate);
    let acc = 0;
    for (let i = 0; i < ch.length; i++) {
      const y = k.tick(ch[i]);
      acc += y * y;
    }
    sum += acc / ch.length;
  }
  return loudnessOf(sum);
}

/**
 * Streaming meter for the audio thread.
 *
 * Keeps a ring of squared K-weighted samples so momentary and short-term
 * readings are available without re-filtering anything.
 */
export class LoudnessMeter {
  private readonly left: KWeighting;
  private readonly right: KWeighting;
  private readonly ring: Float64Array;
  private readonly momentarySamples: number;
  private position = 0;
  private filled = 0;
  private momentarySum = 0;
  private shortSum = 0;

  constructor(sampleRate: number, shortTermSeconds = 3) {
    this.left = new KWeighting(sampleRate);
    this.right = new KWeighting(sampleRate);
    this.ring = new Float64Array(Math.max(1, Math.round(shortTermSeconds * sampleRate)));
    this.momentarySamples = Math.max(1, Math.round(BLOCK_SECONDS * sampleRate));
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
    this.ring.fill(0);
    this.position = 0;
    this.filled = 0;
    this.momentarySum = 0;
    this.shortSum = 0;
  }

  tick(left: number, right: number): void {
    const l = this.left.tick(left);
    const r = this.right.tick(right);
    const power = l * l + r * r;

    const leaving = this.ring[this.position];
    this.shortSum += power - leaving;
    this.ring[this.position] = power;

    // The momentary window is the most recent 400ms of the same ring.
    const dropIndex = (this.position - this.momentarySamples + this.ring.length) % this.ring.length;
    this.momentarySum += power - (this.filled >= this.momentarySamples ? this.ring[dropIndex] : 0);

    this.position = (this.position + 1) % this.ring.length;
    if (this.filled < this.ring.length) this.filled++;
    // Accumulated sums drift over millions of samples; a periodic rebuild is
    // cheaper than carrying a second full-precision accumulator.
    if (this.position === 0) this.rebuild();
  }

  private rebuild(): void {
    let short = 0;
    for (let i = 0; i < this.filled; i++) short += this.ring[i];
    this.shortSum = short;
    let momentary = 0;
    const count = Math.min(this.filled, this.momentarySamples);
    for (let i = 0; i < count; i++) {
      momentary += this.ring[(this.position - 1 - i + this.ring.length) % this.ring.length];
    }
    this.momentarySum = momentary;
  }

  get momentaryLufs(): number {
    const n = Math.min(this.filled, this.momentarySamples);
    return n === 0 ? -Infinity : loudnessOf(Math.max(0, this.momentarySum) / n);
  }

  get shortTermLufs(): number {
    return this.filled === 0 ? -Infinity : loudnessOf(Math.max(0, this.shortSum) / this.filled);
  }
}

/** Where the common delivery targets sit, for the audit to compare against. */
export const LOUDNESS_TARGETS = [
  { id: "streaming", label: "Streaming (Spotify / Apple / YouTube)", lufs: -14, ceilingDb: -1 },
  { id: "broadcast", label: "Broadcast (EBU R128)", lufs: -23, ceilingDb: -1 },
  { id: "club", label: "Club / DJ", lufs: -8, ceilingDb: -0.3 },
] as const;

export type LoudnessTargetId = (typeof LOUDNESS_TARGETS)[number]["id"];
