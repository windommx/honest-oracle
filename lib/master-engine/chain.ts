// ╔══════════════════════════════════════════════════════════════════╗
// ║  MASTER CHAIN — every stage, in a fixed order.                    ║
// ║                                                                    ║
// ║  The order is not configurable, and that is deliberate. Mastering  ║
// ║  order is not a matter of taste; each position is forced by what   ║
// ║  the stage downstream needs to see:                                ║
// ║                                                                    ║
// ║   1 EQ          shape before anything measures the signal, so the  ║
// ║                 de-esser and limiter react to the finished tone    ║
// ║   1b Multiband  split and control each part of the spectrum before ║
// ║                 anything downstream has to cope with a low end     ║
// ║                 that is still moving                               ║
// ║   2 De-Esser    before saturation, which would multiply an ess     ║
// ║   3 De-Chirp    same reason, and before anything adds top end      ║
// ║   4 Punch       transients intact, before they get squashed        ║
// ║   5 Warmth      saturation wants a clean, shaped signal in         ║
// ║   6 Exciter     after saturation, or its harmonics get saturated   ║
// ║                 again into mud                                     ║
// ║   7 Analog Life drift applies to the finished tone                 ║
// ║   8 Tape Hiss   a noise floor sits under everything, including     ║
// ║                 under the drift                                    ║
// ║   9 Stereo      image last, so no later stage can un-mono the bass ║
// ║  10 Volume      the operator's gain, feeding the limiter           ║
// ║  11 Limiter     absolutely last; nothing may add level after the   ║
// ║                 stage that guarantees the ceiling                  ║
// ║                                                                    ║
// ║  Fades are not here. They need to know the length of the file,     ║
// ║  which a block-based processor does not, so they are applied to    ║
// ║  the finished buffer by applyFades().                              ║
// ╚══════════════════════════════════════════════════════════════════╝

import { DeChirp, DeEsser, TransientShaper } from "./dynamics";
import { AnalogLife, TapeHiss } from "./drift";
import { ConsoleSaturator } from "./saturation";
import { EqStage } from "./eq";
import { MultibandCompressor, type BandIndex } from "./multiband";
import { Exciter } from "./exciter";
import { Limiter } from "./limiter";
import { LoudnessMeter } from "./loudness";
import { StereoStage } from "./stereo";
import { DEFAULT_MASTER, dbToGain, type MasterSettings, type MasterUpdate } from "./types";
import type { BiquadCoefficients } from "./biquad";

export interface MasterMeters {
  /** Sample peak of the output since the last reset. */
  peak: number;
  momentaryLufs: number;
  shortTermLufs: number;
  /** Negative. What the limiter is doing right now. */
  gainReductionDb: number;
  /** Negative. What the de-esser is doing right now. */
  deEssDb: number;
  /** Negative, one per multiband band: low, mid, high. */
  bandReductionDb: [number, number, number];
}

export class MasterChain {
  readonly sampleRate: number;
  private current: MasterSettings;

  private readonly eq: EqStage;
  private readonly multiband: MultibandCompressor;
  private readonly deEsser: DeEsser;
  private readonly deChirp: DeChirp;
  private readonly punch: TransientShaper;
  private readonly saturator: ConsoleSaturator;
  private readonly exciter: Exciter;
  private readonly life: AnalogLife;
  private readonly hiss: TapeHiss;
  private readonly stereo: StereoStage;
  private readonly limiter: Limiter;
  private readonly meter: LoudnessMeter;

  private volume = 1;
  private peakSeen = 0;

  constructor(sampleRate: number, settings: MasterUpdate = {}) {
    this.sampleRate = sampleRate;
    this.eq = new EqStage(sampleRate);
    this.multiband = new MultibandCompressor(sampleRate);
    this.deEsser = new DeEsser(sampleRate);
    this.deChirp = new DeChirp(sampleRate);
    this.punch = new TransientShaper(sampleRate);
    this.saturator = new ConsoleSaturator(sampleRate);
    this.exciter = new Exciter(sampleRate);
    this.life = new AnalogLife(sampleRate);
    this.hiss = new TapeHiss(sampleRate);
    this.stereo = new StereoStage(sampleRate);
    this.limiter = new Limiter(sampleRate);
    this.meter = new LoudnessMeter(sampleRate);
    this.current = { ...DEFAULT_MASTER, ...settings };
    this.apply();
  }

  get settings(): Readonly<MasterSettings> {
    return this.current;
  }

  setSettings(update: MasterUpdate): void {
    this.current = { ...this.current, ...update };
    this.apply();
  }

  private apply(): void {
    const s = this.current;
    this.eq.setSettings(s);
    this.multiband.setSettings(s.multiband);
    this.deEsser.setAmount(s.deEsser);
    this.deChirp.setAmount(s.deChirp);
    this.punch.setAmount(s.punch);
    this.saturator.setModel(s.consoleModel);
    this.saturator.setWarmth(s.warmth);
    this.exciter.setAmounts(s.evenExciter, s.oddExciter);
    this.life.setAmount(s.analogLife);
    this.hiss.setAmount(s.tapeHiss);
    this.stereo.setMonoLow(s.monoLow);
    this.stereo.setMonoHigh(s.monoHigh);
    this.stereo.setWidth(s.width);
    this.limiter.setCeilingDb(s.ceilingDb);
    this.volume = dbToGain(s.masterVolDb);
  }

  /** The coefficient list the audio is running through, for the EQ display. */
  get eqSections(): readonly BiquadCoefficients[] {
    return this.eq.currentSections;
  }

  /**
   * Delay the chain introduces, in samples.
   *
   * Reported rather than hidden: a player that crossfades between the raw and
   * mastered signals has to align them, and an A/B that is a few milliseconds
   * out sounds different for that reason alone.
   */
  get latencySamples(): number {
    return this.limiter.latencySamples + this.life.latencySamples;
  }

  get meters(): MasterMeters {
    return {
      peak: this.peakSeen,
      momentaryLufs: this.meter.momentaryLufs,
      shortTermLufs: this.meter.shortTermLufs,
      gainReductionDb: this.limiter.currentReductionDb,
      deEssDb: this.deEsser.reductionDb,
      bandReductionDb: [
        this.multiband.reductionDb(0),
        this.multiband.reductionDb(1 as BandIndex),
        this.multiband.reductionDb(2 as BandIndex),
      ],
    };
  }

  resetMeters(): void {
    this.peakSeen = 0;
  }

  reset(): void {
    this.eq.reset();
    this.multiband.reset();
    this.deEsser.reset();
    this.deChirp.reset();
    this.punch.reset();
    this.saturator.reset();
    this.exciter.reset();
    this.life.reset();
    this.hiss.reset();
    this.stereo.reset();
    this.limiter.reset();
    this.meter.reset();
    this.peakSeen = 0;
  }

  /** One block. Input and output may be the same arrays. */
  process(inLeft: Float32Array, inRight: Float32Array, outLeft: Float32Array, outRight: Float32Array): void {
    const n = Math.min(inLeft.length, inRight.length, outLeft.length, outRight.length);

    for (let i = 0; i < n; i++) {
      // A single non-finite input sample permanently poisons the whole chain:
      // every biquad holds state, NaN propagates into it, and the denormal
      // guard cannot clear it because every comparison against NaN is false.
      // Measured: one NaN in a 64-sample block, then 4096 samples of clean
      // audio, and the output was still NaN at the end. A corrupt float WAV
      // or a truncated bounce is enough to do it, so the guard belongs here
      // where it costs two checks a sample rather than two per biquad.
      let l = inLeft[i];
      let r = inRight[i];
      if (!Number.isFinite(l)) l = 0;
      if (!Number.isFinite(r)) r = 0;

      l = this.eq.tickLeft(l);
      r = this.eq.tickRight(r);

      // Right after the EQ: the bands should see the tone the operator set,
      // and everything downstream should see a mix whose low end is already
      // under control rather than one still moving under the de-esser and
      // the limiter.
      this.multiband.process(l, r);
      l = this.multiband.outLeft;
      r = this.multiband.outRight;

      this.deEsser.detect(l, r);
      l = this.deEsser.tickLeft(l);
      r = this.deEsser.tickRight(r);

      this.deChirp.detect(l, r);
      l = this.deChirp.tickLeft(l);
      r = this.deChirp.tickRight(r);

      // One gain for both channels, from their sum: shaping them separately
      // would move the image on every transient.
      const gain = this.punch.gainFor((l + r) * 0.5);
      l *= gain;
      r *= gain;

      l = this.saturator.tickLeft(l);
      r = this.saturator.tickRight(r);

      l = this.exciter.tickLeft(l);
      r = this.exciter.tickRight(r);

      this.life.advance();
      l = this.life.tickLeft(l);
      r = this.life.tickRight(r);

      l = this.hiss.tickLeft(l);
      r = this.hiss.tickRight(r);

      this.stereo.process(l, r);
      l = this.stereo.outLeft * this.volume;
      r = this.stereo.outRight * this.volume;

      this.limiter.process(l, r);
      const outL = this.limiter.outLeft;
      const outR = this.limiter.outRight;

      this.meterSample(outL, outR);

      outLeft[i] = outL;
      outRight[i] = outR;
    }
  }

  private meterSample(left: number, right: number): void {
    this.meter.tick(left, right);
    const magnitude = Math.max(Math.abs(left), Math.abs(right));
    if (magnitude > this.peakSeen) this.peakSeen = magnitude;
  }

  /**
   * Meter a block that did NOT come through process().
   *
   * The RAW side of an A/B plays the file directly — deliberately, because a
   * neutral pass through the chain still adds the limiter's lookahead and an
   * A/B where one side is milliseconds late sounds different for that reason
   * alone. But the meters live in here, so without this they went blank the
   * moment the operator pressed RAW, which is exactly the moment they want to
   * read the two loudness numbers against each other.
   */
  meterOnly(left: Float32Array, right: Float32Array): void {
    const n = Math.min(left.length, right.length);
    for (let i = 0; i < n; i++) this.meterSample(left[i], right[i]);
  }
}

/**
 * Fades, applied to a finished buffer.
 *
 * Equal-power rather than linear. A linear fade-out sounds like it stalls at
 * the end — perceived loudness follows roughly the square root of power, so
 * a straight line in amplitude is a curve that hangs. This uses a raised
 * cosine, which is smooth at both ends and has no corner where it meets the
 * unfaded part.
 */
export function applyFades(
  channels: Float32Array[],
  sampleRate: number,
  fadeInSeconds: number,
  fadeOutSeconds: number
): void {
  const length = channels.length === 0 ? 0 : channels[0].length;
  if (length === 0) return;

  // A fade longer than the file, or two that overlap, would otherwise
  // multiply into a dip in the middle.
  const half = length / 2;
  const fadeIn = Math.min(Math.round(Math.max(0, fadeInSeconds) * sampleRate), Math.floor(half));
  const fadeOut = Math.min(Math.round(Math.max(0, fadeOutSeconds) * sampleRate), Math.floor(half));

  for (let i = 0; i < fadeIn; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
    for (const ch of channels) ch[i] *= g;
  }
  for (let i = 0; i < fadeOut; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOut);
    const at = length - 1 - i;
    for (const ch of channels) ch[at] *= g;
  }
}
