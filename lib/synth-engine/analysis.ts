// ╔══════════════════════════════════════════════════════════════════╗
// ║  ANALYSIS — measuring a signal, so a test can assert about sound. ║
// ║                                                                    ║
// ║  Audio tests fail badly when they assert on exact samples: any     ║
// ║  change to a filter coefficient rewrites every number, so the test ║
// ║  becomes a change-detector nobody can read. These measure the      ║
// ║  PROPERTIES a listener would notice instead — is it loud, is it in ║
// ║  tune, is it clean, when did it start — which stay meaningful      ║
// ║  across an implementation change and say something when they fail. ║
// ║                                                                    ║
// ║  Everything here is dependency-free and works on a plain array or  ║
// ║  a Float32Array, so it travels with worklet-harness.ts into any    ║
// ║  project regardless of its test runner.                            ║
// ╚══════════════════════════════════════════════════════════════════╝

export type Signal = ArrayLike<number>;

/** Root mean square — the level a meter would show. */
export function rms(signal: Signal, from = 0, to = signal.length): number {
  const start = Math.max(0, from);
  const end = Math.min(signal.length, to);
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / (end - start));
}

/** Largest absolute sample — what a limiter has to keep under 1. */
export function peak(signal: Signal): number {
  let m = 0;
  for (let i = 0; i < signal.length; i++) {
    const a = Math.abs(signal[i]);
    if (a > m) m = a;
  }
  return m;
}

/** Index of the first non-finite sample, or -1. A single NaN anywhere in a
 *  feedback path poisons everything downstream of it forever, so this is worth
 *  checking explicitly rather than inferring from a level. */
export function firstNonFinite(signal: Signal): number {
  for (let i = 0; i < signal.length; i++) if (!Number.isFinite(signal[i])) return i;
  return -1;
}

export function allFinite(signal: Signal): boolean {
  return firstNonFinite(signal) === -1;
}

/** Mean sample value — non-zero means a DC offset, which eats headroom
 *  silently and is inaudible until something clips early. */
export function dcOffset(signal: Signal): number {
  if (signal.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i];
  return sum / signal.length;
}

/** Magnitude at one frequency, by direct correlation. O(n) per frequency, which
 *  beats an FFT when a test wants three specific bins rather than all of them. */
export function magnitudeAt(signal: Signal, hz: number, sampleRate: number): number {
  const n = signal.length;
  let re = 0;
  let im = 0;
  const k = (-2 * Math.PI * hz) / sampleRate;
  for (let i = 0; i < n; i++) {
    // Hann window: without it, a frequency that is not an exact bin smears
    // across neighbours and the measurement reads low.
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    const x = signal[i] * w;
    re += x * Math.cos(k * i);
    im += x * Math.sin(k * i);
  }
  return Math.sqrt(re * re + im * im) / n;
}

/** Dominant frequency, by counting rising zero crossings. Cheap and exact for a
 *  periodic signal; meaningless for noise or a chord, so use it on one note. */
export function dominantFrequency(signal: Signal, sampleRate: number): number {
  let crossings = 0;
  for (let i = 1; i < signal.length; i++) {
    if (signal[i - 1] < 0 && signal[i] >= 0) crossings++;
  }
  return (crossings * sampleRate) / signal.length;
}

/**
 * Energy at frequencies that are NOT harmonics of `fundamental` — i.e. aliasing.
 *
 * The measurement that tells a band-limited oscillator from a naive one: fold-back
 * lands on frequencies unrelated to the note, and moves the wrong way as pitch
 * rises, which is exactly the "digital" edge a cheap synth has.
 */
export function inharmonicEnergy(signal: Signal, fundamental: number, sampleRate: number): number {
  const n = signal.length;
  let total = 0;
  for (let k = 1; k < n / 2; k++) {
    const binHz = (k * sampleRate) / n;
    const ratio = binHz / fundamental;
    if (Math.abs(ratio - Math.round(ratio)) < 0.03) continue; // skip harmonics
    const m = magnitudeAt(signal, binHz, sampleRate);
    total += m * m;
  }
  return total;
}

/**
 * Sample indices where the signal rises out of silence — one per note or beat.
 *
 * `holdSamples` is the window that must stay quiet before a new onset counts,
 * so one note's own zero crossings do not read as a burst of onsets.
 */
export function onsets(signal: Signal, threshold = 0.02, holdSamples = 256): number[] {
  const found: number[] = [];
  let quiet = true;
  for (let i = 0; i < signal.length; i++) {
    const loud = Math.abs(signal[i]) > threshold;
    if (loud) {
      if (quiet) found.push(i);
      quiet = false;
    } else if (!quiet) {
      let stillQuiet = true;
      const until = Math.min(signal.length, i + holdSamples);
      for (let j = i; j < until; j++) {
        if (Math.abs(signal[j]) > threshold) {
          stillQuiet = false;
          break;
        }
      }
      if (stillQuiet) quiet = true;
    }
  }
  return found;
}

/** Spacing between successive onsets, in samples. A steady clock gives a flat
 *  list; a drifting one does not. */
export function onsetIntervals(signal: Signal, threshold = 0.02, holdSamples = 256): number[] {
  const hits = onsets(signal, threshold, holdSamples);
  const gaps: number[] = [];
  for (let i = 1; i < hits.length; i++) gaps.push(hits[i] - hits[i - 1]);
  return gaps;
}

/** How much the level varies between short windows — a still tone is near 0,
 *  a modulated one is not. Normalised by the mean, so it is level-independent. */
export function levelVariation(signal: Signal, windowSize = 2048): number {
  const levels: number[] = [];
  for (let i = 0; i + windowSize <= signal.length; i += windowSize) {
    levels.push(rms(signal, i, i + windowSize));
  }
  if (levels.length < 2) return 0;
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  if (mean === 0) return 0;
  const variance = levels.reduce((a, x) => a + (x - mean) ** 2, 0) / levels.length;
  return Math.sqrt(variance) / mean;
}
