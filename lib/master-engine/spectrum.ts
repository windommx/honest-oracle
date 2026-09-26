// ╔══════════════════════════════════════════════════════════════════╗
// ║  SPECTRAL BALANCE — what a track sounds like, as 31 numbers.      ║
// ║                                                                    ║
// ║  The measurement behind reference matching. An engineer comparing  ║
// ║  their master to a record they trust is not comparing waveforms;   ║
// ║  they are asking "is my bottom end heavier than theirs, is my top  ║
// ║  duller". That question has an answer, and it is the energy in     ║
// ║  each third-octave band, averaged over the track.                  ║
// ║                                                                    ║
// ║  Third-octave because that is roughly how the ear divides the      ║
// ║  spectrum — narrower and the numbers describe individual notes     ║
// ║  rather than tone; wider and a boxy 400Hz and a thin 800Hz average ║
// ║  into "fine".                                                      ║
// ║                                                                    ║
// ║  Levels are RELATIVE to the track's own total, so a quiet mix and  ║
// ║  a loud one with the same tone compare as equal. Matching absolute ║
// ║  levels would just be a volume difference wearing an EQ's clothes. ║
// ╚══════════════════════════════════════════════════════════════════╝

/** ISO third-octave centres, 20Hz to 20kHz. */
export const THIRD_OCTAVE_HZ = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
] as const;

export interface SpectralBalance {
  /** One level per band in THIRD_OCTAVE_HZ, in dB relative to the track's own
   *  broadband level. */
  db: number[];
  /** Seconds of audio the measurement covers. */
  seconds: number;
}

/** Bands quieter than this below the track's own level are noise, not tone,
 *  and matching them would chase a noise floor. */
const FLOOR_DB = -60;

/**
 * Goertzel power at one frequency over a block.
 *
 * Cheaper than a full FFT when the answer wanted is 31 specific bins, and
 * exact at those bins rather than interpolated between neighbours.
 */
function goertzelPower(signal: Float32Array, from: number, to: number, hz: number, sampleRate: number): number {
  const n = to - from;
  if (n <= 0) return 0;
  const k = (2 * Math.PI * hz) / sampleRate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < to; i++) {
    const s0 = signal[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Math.max(0, power) / (n * n);
}

export interface BalanceOptions {
  /**
   * Analysis block length.
   *
   * 250ms gives 4Hz resolution, which is what the bottom third-octave bands
   * need: at 20Hz a third-octave is only 4.6Hz wide, so a 100ms block (10Hz)
   * cannot separate 20 from 25 and the lowest bands read each other's energy.
   * Measured on a source with equal energy per band, 100ms blocks scattered
   * the bottom four bands by 1.5dB; 250ms brings them inside 0.5dB.
   */
  blockSeconds?: number;
  /** Blocks quieter than this below the loudest are skipped, so silence and
   *  fades do not drag the average toward the noise floor. */
  gateDb?: number;
}

/**
 * Measure a track's third-octave balance.
 *
 * Gated and averaged across blocks, then normalised to the track's own total,
 * so what comes back is tone rather than level.
 */
export function spectralBalance(
  channels: Float32Array[],
  sampleRate: number,
  options: BalanceOptions = {}
): SpectralBalance {
  const blockSeconds = options.blockSeconds ?? 0.25;
  const gateDb = options.gateDb ?? -40;
  const frames = channels.length === 0 ? 0 : channels[0].length;
  const blockSize = Math.max(256, Math.round(blockSeconds * sampleRate));
  const bands = THIRD_OCTAVE_HZ.length;

  if (frames < blockSize) {
    return { db: new Array(bands).fill(-Infinity), seconds: frames / sampleRate };
  }

  // A mono sum: tonal balance is a property of the whole record, and the two
  // channels of a finished master agree about it to within a fraction of a dB.
  const mono = new Float32Array(frames);
  for (const ch of channels) for (let i = 0; i < frames; i++) mono[i] += ch[i];
  const scale = 1 / channels.length;
  for (let i = 0; i < frames; i++) mono[i] *= scale;

  // Block levels first, so the gate can be relative to the loudest.
  const blockCount = Math.floor(frames / blockSize);
  const levels = new Float64Array(blockCount);
  for (let b = 0; b < blockCount; b++) {
    let sum = 0;
    const from = b * blockSize;
    for (let i = from; i < from + blockSize; i++) sum += mono[i] * mono[i];
    levels[b] = sum / blockSize;
  }
  let loudest = 0;
  for (let b = 0; b < blockCount; b++) if (levels[b] > loudest) loudest = levels[b];
  const gate = loudest * Math.pow(10, gateDb / 10);

  const sums = new Float64Array(bands);
  let counted = 0;
  for (let b = 0; b < blockCount; b++) {
    if (levels[b] <= gate) continue;
    const from = b * blockSize;
    for (let k = 0; k < bands; k++) {
      // Bands above Nyquist cannot be measured and are left at zero rather
      // than filled with whatever aliasing puts there.
      if (THIRD_OCTAVE_HZ[k] >= sampleRate / 2) continue;
      sums[k] += goertzelPower(mono, from, from + blockSize, THIRD_OCTAVE_HZ[k], sampleRate);
    }
    counted++;
  }

  if (counted === 0) return { db: new Array(bands).fill(-Infinity), seconds: frames / sampleRate };

  // Normalise to the total across bands, so this describes tone and not level.
  let total = 0;
  for (let k = 0; k < bands; k++) total += sums[k];
  const db = new Array<number>(bands);
  for (let k = 0; k < bands; k++) {
    const share = total > 0 ? sums[k] / total : 0;
    db[k] = share <= 0 ? -Infinity : 10 * Math.log10(share);
  }
  return { db, seconds: frames / sampleRate };
}

export interface BalanceDelta {
  hz: number;
  /** Positive means the target has MORE there than the subject does. */
  db: number;
  /** False when either side is below the usable floor, so the UI can show a
   *  gap rather than a confident zero. */
  usable: boolean;
}

/** What the subject would have to change to sound like the target. */
export function balanceDelta(subject: SpectralBalance, target: SpectralBalance): BalanceDelta[] {
  return THIRD_OCTAVE_HZ.map((hz, i) => {
    const a = subject.db[i];
    const b = target.db[i];
    const usable = Number.isFinite(a) && Number.isFinite(b) && a > FLOOR_DB && b > FLOOR_DB;
    return { hz, db: usable ? b - a : 0, usable };
  });
}

/** How far apart two balances are overall, in dB — one number for "is this
 *  close". Root-mean-square across the usable bands. */
export function balanceDistanceDb(subject: SpectralBalance, target: SpectralBalance): number {
  const delta = balanceDelta(subject, target).filter((d) => d.usable);
  if (delta.length === 0) return Infinity;
  const sum = delta.reduce((acc, d) => acc + d.db * d.db, 0);
  return Math.sqrt(sum / delta.length);
}
