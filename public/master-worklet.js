// GENERATED FILE — do not edit.
// Bundled from lib/master-engine/worklet-processor.ts by scripts/build-worklet.ts.
// Run `npm run build:worklet` after changing the engine.
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // lib/master-engine/biquad.ts
  var MIN_Q = 0.1;
  var MAX_Q = 18;
  var clampQ = (q) => Math.min(MAX_Q, Math.max(MIN_Q, q));
  function clampFrequency(freq, sampleRate2) {
    return Math.min(sampleRate2 * 0.4995, Math.max(1, freq));
  }
  function normalise(b0, b1, b2, a0, a1, a2) {
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }
  function lowpass(freq, q, sampleRate2) {
    const w = 2 * Math.PI * clampFrequency(freq, sampleRate2) / sampleRate2;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * clampQ(q));
    return normalise((1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha);
  }
  function highpass(freq, q, sampleRate2) {
    const w = 2 * Math.PI * clampFrequency(freq, sampleRate2) / sampleRate2;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * clampQ(q));
    return normalise((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha);
  }
  function bandpass(freq, q, sampleRate2) {
    const w = 2 * Math.PI * clampFrequency(freq, sampleRate2) / sampleRate2;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * clampQ(q));
    return normalise(alpha, 0, -alpha, 1 + alpha, -2 * cw, 1 - alpha);
  }
  function peaking(freq, gainDb, q, sampleRate2) {
    const A = Math.pow(10, gainDb / 40);
    const w = 2 * Math.PI * clampFrequency(freq, sampleRate2) / sampleRate2;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * clampQ(q));
    return normalise(1 + alpha * A, -2 * cw, 1 - alpha * A, 1 + alpha / A, -2 * cw, 1 - alpha / A);
  }
  function lowShelf(freq, gainDb, slope, sampleRate2) {
    const A = Math.pow(10, gainDb / 40);
    const w = 2 * Math.PI * clampFrequency(freq, sampleRate2) / sampleRate2;
    const cw = Math.cos(w);
    const s = Math.min(2, Math.max(0.1, slope));
    const beta = Math.sqrt(A) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
    const sw = Math.sin(w);
    return normalise(
      A * (A + 1 - (A - 1) * cw + beta * sw),
      2 * A * (A - 1 - (A + 1) * cw),
      A * (A + 1 - (A - 1) * cw - beta * sw),
      A + 1 + (A - 1) * cw + beta * sw,
      -2 * (A - 1 + (A + 1) * cw),
      A + 1 + (A - 1) * cw - beta * sw
    );
  }
  function highShelf(freq, gainDb, slope, sampleRate2) {
    const A = Math.pow(10, gainDb / 40);
    const w = 2 * Math.PI * clampFrequency(freq, sampleRate2) / sampleRate2;
    const cw = Math.cos(w);
    const s = Math.min(2, Math.max(0.1, slope));
    const beta = Math.sqrt(A) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
    const sw = Math.sin(w);
    return normalise(
      A * (A + 1 + (A - 1) * cw + beta * sw),
      -2 * A * (A - 1 + (A + 1) * cw),
      A * (A + 1 + (A - 1) * cw - beta * sw),
      A + 1 - (A - 1) * cw + beta * sw,
      2 * (A - 1 - (A + 1) * cw),
      A + 1 - (A - 1) * cw - beta * sw
    );
  }
  var Biquad = class {
    constructor() {
      __publicField(this, "c", { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 });
      __publicField(this, "z1", 0);
      __publicField(this, "z2", 0);
    }
    setCoefficients(c) {
      this.c = c;
    }
    get coefficients() {
      return this.c;
    }
    reset() {
      this.z1 = 0;
      this.z2 = 0;
    }
    tick(x) {
      const { b0, b1, b2, a1, a2 } = this.c;
      const y = b0 * x + this.z1;
      this.z1 = b1 * x - a1 * y + this.z2;
      this.z2 = b2 * x - a2 * y;
      if (Math.abs(this.z1) < 1e-20) this.z1 = 0;
      if (Math.abs(this.z2) < 1e-20) this.z2 = 0;
      return y;
    }
  };
  var StereoBiquad = class {
    constructor() {
      __publicField(this, "left", new Biquad());
      __publicField(this, "right", new Biquad());
    }
    setCoefficients(c) {
      this.left.setCoefficients(c);
      this.right.setCoefficients(c);
    }
    get coefficients() {
      return this.left.coefficients;
    }
    reset() {
      this.left.reset();
      this.right.reset();
    }
    tickLeft(x) {
      return this.left.tick(x);
    }
    tickRight(x) {
      return this.right.tick(x);
    }
  };

  // lib/master-engine/db.ts
  var dbToGain = (db) => Math.pow(10, db / 20);
  var gainToDb = (g) => g <= 1e-9 ? -180 : 20 * Math.log10(g);

  // lib/master-engine/types.ts
  var BAND_COUNT = 3;
  var DEFAULT_BAND = {
    thresholdDb: -18,
    ratio: 2,
    attackSeconds: 0.01,
    releaseSeconds: 0.12,
    makeupDb: 0,
    solo: false,
    bypass: false
  };
  var DEFAULT_MULTIBAND = {
    enabled: false,
    // 120Hz keeps the kick and bass together below it; 2.5kHz puts the
    // presence region and the cymbals in the top band without splitting a
    // vocal's fundamental from its consonants.
    crossoverLowHz: 120,
    crossoverHighHz: 2500,
    bands: [
      { ...DEFAULT_BAND, thresholdDb: -20, ratio: 2.5, attackSeconds: 0.02, releaseSeconds: 0.18 },
      { ...DEFAULT_BAND },
      { ...DEFAULT_BAND, thresholdDb: -24, ratio: 1.8, attackSeconds: 5e-3, releaseSeconds: 0.08 }
    ]
  };
  var LOW_CUT_HZ = 30;
  var HI_CUT_HZ = 18e3;
  var TONE_BASS_HZ = 90;
  var TONE_MUD_HZ = 320;
  var TONE_MID_HZ = 1400;
  var TONE_TREBLE_HZ = 8e3;
  var MONO_LOW_MAX_HZ = 300;
  var MONO_HIGH_MIN_HZ = 4e3;
  var MONO_HIGH_MAX_HZ = 2e4;
  var ESS_LOW_HZ = 4500;
  var ESS_HIGH_HZ = 11e3;
  function defaultEqBands() {
    return [
      { freq: 32, gainDb: 0, q: 0.7, kind: "lowShelf", enabled: true },
      { freq: 60, gainDb: 0, q: 1, kind: "peaking", enabled: true },
      { freq: 220, gainDb: 0, q: 1, kind: "peaking", enabled: true },
      { freq: 2500, gainDb: 0, q: 1, kind: "peaking", enabled: true },
      { freq: 1e4, gainDb: 0, q: 0.7, kind: "highShelf", enabled: true }
    ];
  }
  var cloneMultiband = (m) => ({
    ...m,
    bands: m.bands.map((b) => ({ ...b }))
  });
  var DEFAULT_MASTER = {
    multiband: cloneMultiband(DEFAULT_MULTIBAND),
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    lowCut: true,
    hiCut: false,
    eq: defaultEqBands(),
    bass: 1.2,
    mud: -1,
    mid: 0.5,
    treble: 1,
    punch: 0.55,
    warmth: 0.65,
    analogLife: 0.5,
    deChirp: 0.2,
    deEsser: 0.2,
    oddExciter: 0.3,
    evenExciter: 0.6,
    tapeHiss: 0,
    consoleModel: "console",
    monoLow: 0.4,
    monoHigh: 0.4,
    width: 0.55,
    masterVolDb: 1.5,
    ceilingDb: -1
  };
  var NEUTRAL = {
    multiband: cloneMultiband({ ...DEFAULT_MULTIBAND, enabled: false }),
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    lowCut: false,
    hiCut: false,
    eq: defaultEqBands(),
    bass: 0,
    mud: 0,
    mid: 0,
    treble: 0,
    punch: 0,
    warmth: 0,
    analogLife: 0,
    deChirp: 0,
    deEsser: 0,
    oddExciter: 0,
    evenExciter: 0,
    tapeHiss: 0,
    consoleModel: "clean",
    monoLow: 0,
    monoHigh: 0,
    width: 0.5,
    masterVolDb: 0,
    ceilingDb: 0
  };

  // lib/master-engine/dynamics.ts
  var EnvelopeFollower = class {
    constructor(sampleRate2, attackSeconds, releaseSeconds) {
      __publicField(this, "sampleRate");
      __publicField(this, "attackCoeff", 0);
      __publicField(this, "releaseCoeff", 0);
      __publicField(this, "value", 0);
      this.sampleRate = sampleRate2;
      this.setTimes(attackSeconds, releaseSeconds);
    }
    setTimes(attackSeconds, releaseSeconds) {
      this.attackCoeff = attackSeconds <= 0 ? 0 : Math.exp(-1 / (attackSeconds * this.sampleRate));
      this.releaseCoeff = releaseSeconds <= 0 ? 0 : Math.exp(-1 / (releaseSeconds * this.sampleRate));
    }
    get level() {
      return this.value;
    }
    reset() {
      this.value = 0;
    }
    /** Feed the rectified signal. */
    tick(magnitude) {
      const coeff = magnitude > this.value ? this.attackCoeff : this.releaseCoeff;
      this.value = magnitude + coeff * (this.value - magnitude);
      if (this.value < 1e-20) this.value = 0;
      return this.value;
    }
  };
  var PUNCH_MAX_DB = 9;
  var TransientShaper = class {
    constructor(sampleRate2) {
      __publicField(this, "fast");
      __publicField(this, "slow");
      __publicField(this, "amount", 0);
      this.fast = new EnvelopeFollower(sampleRate2, 5e-4, 0.045);
      this.slow = new EnvelopeFollower(sampleRate2, 0.025, 0.18);
    }
    setAmount(amount) {
      this.amount = Math.min(1, Math.max(0, amount));
    }
    reset() {
      this.fast.reset();
      this.slow.reset();
    }
    /** Gain for this sample, from a mono sum of the two channels. */
    gainFor(detector) {
      const m = Math.abs(detector);
      const fast = this.fast.tick(m);
      const slow = this.slow.tick(fast);
      if (this.amount === 0) return 1;
      const diffDb = gainToDb(Math.max(fast, 1e-6)) - gainToDb(Math.max(slow, 1e-6));
      const lift = Math.min(PUNCH_MAX_DB, Math.max(0, diffDb)) * this.amount;
      return dbToGain(lift);
    }
  };
  var ESS_THRESHOLD_DB = -30;
  var ESS_MAX_REDUCTION_DB = 12;
  var DeEsser = class {
    constructor(sampleRate2) {
      __publicField(this, "sampleRate");
      __publicField(this, "detectLeft", new Biquad());
      __publicField(this, "detectRight", new Biquad());
      __publicField(this, "follower");
      __publicField(this, "shelfLeft", new Biquad());
      __publicField(this, "shelfRight", new Biquad());
      __publicField(this, "amount", 0);
      __publicField(this, "currentCutDb", 0);
      this.sampleRate = sampleRate2;
      const centre = Math.sqrt(ESS_LOW_HZ * ESS_HIGH_HZ);
      const q = centre / (ESS_HIGH_HZ - ESS_LOW_HZ);
      const c = bandpass(centre, q, sampleRate2);
      this.detectLeft.setCoefficients(c);
      this.detectRight.setCoefficients(c);
      this.follower = new EnvelopeFollower(sampleRate2, 1e-3, 0.05);
      this.setCut(0);
    }
    setAmount(amount) {
      this.amount = Math.min(1, Math.max(0, amount));
    }
    setCut(db) {
      this.currentCutDb = db;
      const c = highShelf(ESS_LOW_HZ, db, 0.7, this.sampleRate);
      this.shelfLeft.setCoefficients(c);
      this.shelfRight.setCoefficients(c);
    }
    get reductionDb() {
      return this.currentCutDb;
    }
    reset() {
      this.detectLeft.reset();
      this.detectRight.reset();
      this.shelfLeft.reset();
      this.shelfRight.reset();
      this.follower.reset();
    }
    /** Call once per sample, before the two tick calls. */
    detect(left, right) {
      if (this.amount === 0) {
        if (this.currentCutDb !== 0) this.setCut(0);
        return;
      }
      const band = (this.detectLeft.tick(left) + this.detectRight.tick(right)) * 0.5;
      const levelDb = gainToDb(Math.max(this.follower.tick(Math.abs(band)), 1e-9));
      const over = Math.max(0, levelDb - ESS_THRESHOLD_DB);
      const cut = -Math.min(ESS_MAX_REDUCTION_DB, over * this.amount);
      if (Math.abs(cut - this.currentCutDb) > 0.1) this.setCut(cut);
    }
    tickLeft(x) {
      return this.amount === 0 ? x : this.shelfLeft.tick(x);
    }
    tickRight(x) {
      return this.amount === 0 ? x : this.shelfRight.tick(x);
    }
  };
  var CHIRP_BAND_HZ = 6e3;
  var CHIRP_MAX_REDUCTION_DB = 9;
  var DeChirp = class {
    constructor(sampleRate2) {
      __publicField(this, "sampleRate");
      __publicField(this, "detectLeft", new Biquad());
      __publicField(this, "detectRight", new Biquad());
      __publicField(this, "fast");
      __publicField(this, "slow");
      __publicField(this, "shelfLeft", new Biquad());
      __publicField(this, "shelfRight", new Biquad());
      __publicField(this, "amount", 0);
      __publicField(this, "currentCutDb", 0);
      this.sampleRate = sampleRate2;
      const c = highpass(CHIRP_BAND_HZ, 0.707, sampleRate2);
      this.detectLeft.setCoefficients(c);
      this.detectRight.setCoefficients(c);
      this.fast = new EnvelopeFollower(sampleRate2, 3e-4, 0.02);
      this.slow = new EnvelopeFollower(sampleRate2, 0.05, 0.4);
      this.setCut(0);
    }
    setAmount(amount) {
      this.amount = Math.min(1, Math.max(0, amount));
    }
    setCut(db) {
      this.currentCutDb = db;
      const c = highShelf(CHIRP_BAND_HZ, db, 0.7, this.sampleRate);
      this.shelfLeft.setCoefficients(c);
      this.shelfRight.setCoefficients(c);
    }
    get reductionDb() {
      return this.currentCutDb;
    }
    reset() {
      this.detectLeft.reset();
      this.detectRight.reset();
      this.shelfLeft.reset();
      this.shelfRight.reset();
      this.fast.reset();
      this.slow.reset();
    }
    detect(left, right) {
      if (this.amount === 0) {
        if (this.currentCutDb !== 0) this.setCut(0);
        return;
      }
      const band = Math.abs((this.detectLeft.tick(left) + this.detectRight.tick(right)) * 0.5);
      const fast = this.fast.tick(band);
      const slow = this.slow.tick(band);
      const excessDb = gainToDb(Math.max(fast, 1e-7)) - gainToDb(Math.max(slow, 1e-7));
      const cut = -Math.min(CHIRP_MAX_REDUCTION_DB, Math.max(0, excessDb - 3) * this.amount);
      if (Math.abs(cut - this.currentCutDb) > 0.1) this.setCut(cut);
    }
    tickLeft(x) {
      return this.amount === 0 ? x : this.shelfLeft.tick(x);
    }
    tickRight(x) {
      return this.amount === 0 ? x : this.shelfRight.tick(x);
    }
  };

  // lib/synth-engine/delay-line.ts
  var DelayLine = class {
    constructor(maxSamples) {
      __publicField(this, "buffer");
      __publicField(this, "writePos", 0);
      this.buffer = new Float64Array(Math.max(2, Math.ceil(maxSamples)));
    }
    get size() {
      return this.buffer.length;
    }
    /** Write one sample and advance. */
    write(x) {
      this.buffer[this.writePos] = x;
      this.writePos = (this.writePos + 1) % this.buffer.length;
    }
    /** Read `delaySamples` back. Whole-sample; wraps safely for any delay,
     *  including one longer than has been written yet (reads the zeroed tail). */
    read(delaySamples) {
      const d = Math.min(Math.max(delaySamples, 0), this.buffer.length - 1);
      const idx = (this.writePos - Math.round(d) + this.buffer.length) % this.buffer.length;
      return this.buffer[idx];
    }
    /** Read at a fractional delay, linearly interpolated — needed by anything
     *  that modulates its delay time (chorus, flanger) without stepping. */
    readInterpolated(delaySamples) {
      const d = Math.min(Math.max(delaySamples, 0), this.buffer.length - 2);
      const whole = Math.floor(d);
      const frac = d - whole;
      const len = this.buffer.length;
      const i0 = (this.writePos - whole + len) % len;
      const i1 = (i0 - 1 + len) % len;
      return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
    }
    clear() {
      this.buffer.fill(0);
      this.writePos = 0;
    }
  };

  // lib/synth-engine/rng.ts
  var Rng = class {
    constructor(seed = 2654435769) {
      __publicField(this, "state");
      this.state = seed >>> 0 || 2654435769;
    }
    /** Uniform in [0, 1). */
    next() {
      this.state = this.state + 1831565813 >>> 0;
      let t = this.state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    /** Uniform in [-1, 1) — the white-noise sample. */
    bipolar() {
      return this.next() * 2 - 1;
    }
    reset(seed = 2654435769) {
      this.state = seed >>> 0 || 2654435769;
    }
  };

  // lib/master-engine/drift.ts
  var WOW_HZ = 1.1;
  var FLUTTER_HZ = 7.3;
  var MAX_DEVIATION_S = 15e-5;
  var BASE_DELAY_S = 3e-3;
  var MAX_GAIN_DRIFT_DB = 0.35;
  var RandomWalk = class {
    constructor(sampleRate2, hz, seed) {
      __publicField(this, "rng");
      __publicField(this, "seed");
      __publicField(this, "stepSamples");
      __publicField(this, "countdown", 0);
      __publicField(this, "from", 0);
      __publicField(this, "to", 0);
      this.seed = seed;
      this.rng = new Rng(seed);
      this.stepSamples = Math.max(1, Math.round(sampleRate2 / Math.max(0.05, hz)));
    }
    /** Back to the exact state the constructor left, generator included.
     *
     *  Clearing only the interpolation state looks like a reset and is not: the
     *  generator keeps running from wherever it had got to, so every replay of
     *  the same audio drifts differently. Measured before this line existed:
     *  7760 of 8000 samples differed between two passes over identical input,
     *  which breaks the determinism this file's header promises and makes an
     *  A/B of a track with Analog Life on a comparison of two different takes. */
    reset() {
      this.rng.reset(this.seed);
      this.countdown = 0;
      this.from = 0;
      this.to = 0;
    }
    tick() {
      if (this.countdown <= 0) {
        this.from = this.to;
        this.to = this.rng.bipolar();
        this.countdown = this.stepSamples;
      }
      this.countdown--;
      const t = 1 - this.countdown / this.stepSamples;
      return this.from + (this.to - this.from) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    }
  };
  var AnalogLife = class {
    constructor(sampleRate2, seed = 4350) {
      __publicField(this, "sampleRate");
      __publicField(this, "delayLeft");
      __publicField(this, "delayRight");
      __publicField(this, "wow");
      __publicField(this, "flutter");
      __publicField(this, "gainWalk");
      __publicField(this, "amount", 0);
      __publicField(this, "modulation", 0);
      __publicField(this, "gain", 1);
      this.sampleRate = sampleRate2;
      const size = Math.ceil((BASE_DELAY_S + MAX_DEVIATION_S * 4) * sampleRate2) + 4;
      this.delayLeft = new DelayLine(size);
      this.delayRight = new DelayLine(size);
      this.wow = new RandomWalk(sampleRate2, WOW_HZ, seed);
      this.flutter = new RandomWalk(sampleRate2, FLUTTER_HZ, seed ^ 23536);
      this.gainWalk = new RandomWalk(sampleRate2, 0.4, seed ^ 10977);
    }
    setAmount(amount) {
      this.amount = Math.min(1, Math.max(0, amount));
    }
    get active() {
      return this.amount > 0;
    }
    reset() {
      this.delayLeft.clear();
      this.delayRight.clear();
      this.wow.reset();
      this.flutter.reset();
      this.gainWalk.reset();
      this.modulation = 0;
      this.gain = 1;
    }
    /** Advance the drift by one sample. Call before the two tick calls so both
     *  channels move together — independent drift per channel would swing the
     *  stereo image, which is a different (and much worse) effect. */
    advance() {
      if (!this.active) return;
      const walk = this.wow.tick() * 0.8 + this.flutter.tick() * 0.2;
      this.modulation = walk * MAX_DEVIATION_S * this.sampleRate * this.amount;
      this.gain = Math.pow(10, this.gainWalk.tick() * MAX_GAIN_DRIFT_DB * this.amount / 20);
    }
    read(x, line) {
      line.write(x);
      return line.readInterpolated(BASE_DELAY_S * this.sampleRate + this.modulation) * this.gain;
    }
    tickLeft(x) {
      return this.active ? this.read(x, this.delayLeft) : x;
    }
    tickRight(x) {
      return this.active ? this.read(x, this.delayRight) : x;
    }
    /** Samples of delay this stage adds when it is on. Reported so the chain can
     *  state its total latency honestly rather than leaving it unexplained. */
    get latencySamples() {
      return this.active ? Math.round(BASE_DELAY_S * this.sampleRate) : 0;
    }
  };
  var HISS_MAX_DBFS = -55;
  var TapeHiss = class {
    constructor(sampleRate2, seed = 31326) {
      __publicField(this, "rng");
      __publicField(this, "seed");
      __publicField(this, "shapeLeft", new Biquad());
      __publicField(this, "shapeRight", new Biquad());
      __publicField(this, "amount", 0);
      __publicField(this, "gain", 0);
      this.seed = seed;
      this.rng = new Rng(seed);
      const c = bandpass(6e3, 0.6, sampleRate2);
      this.shapeLeft.setCoefficients(c);
      this.shapeRight.setCoefficients(c);
    }
    setAmount(amount) {
      this.amount = Math.min(1, Math.max(0, amount));
      this.gain = this.amount === 0 ? 0 : Math.pow(10, HISS_MAX_DBFS / 20) * this.amount;
    }
    /** Defaults to the seed this instance was BUILT with, not to the class
     *  default — otherwise reset() silently moves a caller's chosen noise
     *  stream onto a different one, and the seed parameter it passed to the
     *  constructor stops meaning anything after the first reset. */
    reset(seed = this.seed) {
      this.rng.reset(seed);
      this.shapeLeft.reset();
      this.shapeRight.reset();
    }
    tickLeft(x) {
      return this.gain === 0 ? x : x + this.shapeLeft.tick(this.rng.bipolar()) * this.gain;
    }
    tickRight(x) {
      return this.gain === 0 ? x : x + this.shapeRight.tick(this.rng.bipolar()) * this.gain;
    }
  };

  // lib/master-engine/saturation.ts
  var OVERSAMPLE = 4;
  var BUTTERWORTH_6TH = [0.5176, 0.7071, 1.9319];
  var BAND_LIMIT = 0.42;
  var MAX_DRIVE = 2.2;
  var REFERENCE_AMPLITUDE = 0.5;
  var TRANSFORMER_BIAS_HZ = 1200;
  var TAPE_ROLLOFF_HZ = 12e3;
  var TUBE_BIAS = 0.5;
  var TRANSFORMER_BIAS = 0.5;
  var MODEL_DRIVE_SCALE = {
    clean: 1,
    tube: 0.75,
    transformer: 0.75,
    console: 1,
    tape: 1
  };
  function shape(model, x, biased) {
    switch (model) {
      case "clean":
        return x;
      case "tube":
        return Math.tanh(x + TUBE_BIAS * x * x);
      case "transformer":
        return Math.tanh(x + TRANSFORMER_BIAS * biased * biased);
      case "console":
        return Math.tanh(x);
      case "tape":
        return x / Math.pow(1 + Math.pow(Math.abs(x), 2.5), 1 / 2.5);
    }
  }
  var SaturatorChannel = class {
    constructor(sampleRate2) {
      __publicField(this, "up");
      __publicField(this, "down");
      __publicField(this, "roll", new Biquad());
      __publicField(this, "bias", new Biquad());
      const overRate = sampleRate2 * OVERSAMPLE;
      const band = BUTTERWORTH_6TH.map((q) => lowpass(sampleRate2 * BAND_LIMIT, q, overRate));
      this.up = band.map((c) => {
        const f = new Biquad();
        f.setCoefficients(c);
        return f;
      });
      this.down = band.map((c) => {
        const f = new Biquad();
        f.setCoefficients(c);
        return f;
      });
      this.roll.setCoefficients(lowpass(Math.min(TAPE_ROLLOFF_HZ, sampleRate2 * 0.45), 0.707, sampleRate2));
      this.bias.setCoefficients(lowpass(TRANSFORMER_BIAS_HZ, 0.707, overRate));
    }
    reset() {
      for (const f of this.up) f.reset();
      for (const f of this.down) f.reset();
      this.roll.reset();
      this.bias.reset();
    }
    tick(x, model, drive, makeup) {
      let y = 0;
      for (let phase = 0; phase < OVERSAMPLE; phase++) {
        let up = phase === 0 ? x * OVERSAMPLE : 0;
        for (const f of this.up) up = f.tick(up);
        const driven = up * drive;
        const shaped = shape(model, driven, this.bias.tick(driven));
        let down = shaped;
        for (const f of this.down) down = f.tick(down);
        if (phase === 0) y = down;
      }
      const out = y / drive * makeup;
      return model === "tape" ? this.roll.tick(out) : out;
    }
  };
  var ConsoleSaturator = class {
    constructor(sampleRate2) {
      __publicField(this, "left");
      __publicField(this, "right");
      __publicField(this, "model", "clean");
      __publicField(this, "warmth", 0);
      __publicField(this, "drive", 1);
      __publicField(this, "makeup", 1);
      this.left = new SaturatorChannel(sampleRate2);
      this.right = new SaturatorChannel(sampleRate2);
    }
    setModel(model) {
      this.model = model;
      this.updateDrive();
    }
    /** `warmth` is 0..1. */
    setWarmth(warmth) {
      this.warmth = Math.min(1, Math.max(0, warmth));
      this.updateDrive();
    }
    updateDrive() {
      this.drive = 1 + this.warmth * (MAX_DRIVE - 1) * MODEL_DRIVE_SCALE[this.model];
      this.recalibrate();
    }
    /**
     * Find the gain that makes a reference-level sine come out at the level it
     * went in. Runs one cycle through the curve — a few hundred operations on a
     * knob move, which buys the guarantee that Warmth is not a volume control.
     */
    recalibrate() {
      this.makeup = 1;
      if (!this.active) return;
      const N = 512;
      let sumIn = 0;
      let sumOut = 0;
      for (let i = 0; i < N; i++) {
        const x = Math.sin(2 * Math.PI * i / N) * REFERENCE_AMPLITUDE;
        const driven = x * this.drive;
        const y = shape(this.model, driven, driven) / this.drive;
        sumIn += x * x;
        sumOut += y * y;
      }
      this.makeup = sumOut > 0 ? Math.sqrt(sumIn / sumOut) : 1;
    }
    get active() {
      return this.model !== "clean" && this.drive > 1;
    }
    /** The calibrated gain, exposed so a test can assert it is doing something
     *  and a reader can see what it settled on. */
    get makeupGain() {
      return this.makeup;
    }
    reset() {
      this.left.reset();
      this.right.reset();
    }
    tickLeft(x) {
      return this.active ? this.left.tick(x, this.model, this.drive, this.makeup) : x;
    }
    tickRight(x) {
      return this.active ? this.right.tick(x, this.model, this.drive, this.makeup) : x;
    }
  };

  // lib/master-engine/eq.ts
  var BUTTERWORTH_4TH = [0.5412, 1.3066];
  function eqSections(settings, sampleRate2) {
    const out = [];
    if (settings.lowCut) {
      for (const q of BUTTERWORTH_4TH) out.push(highpass(LOW_CUT_HZ, q, sampleRate2));
    }
    if (settings.hiCut) {
      for (const q of BUTTERWORTH_4TH) out.push(lowpass(HI_CUT_HZ, q, sampleRate2));
    }
    for (const band of settings.eq) {
      if (!band.enabled || band.gainDb === 0) continue;
      if (band.kind === "lowShelf") out.push(lowShelf(band.freq, band.gainDb, band.q, sampleRate2));
      else if (band.kind === "highShelf") out.push(highShelf(band.freq, band.gainDb, band.q, sampleRate2));
      else out.push(peaking(band.freq, band.gainDb, band.q, sampleRate2));
    }
    if (settings.bass !== 0) out.push(lowShelf(TONE_BASS_HZ, settings.bass, 0.7, sampleRate2));
    if (settings.mud !== 0) out.push(peaking(TONE_MUD_HZ, settings.mud, 1.1, sampleRate2));
    if (settings.mid !== 0) out.push(peaking(TONE_MID_HZ, settings.mid, 0.9, sampleRate2));
    if (settings.treble !== 0) out.push(highShelf(TONE_TREBLE_HZ, settings.treble, 0.7, sampleRate2));
    return out;
  }
  var EqStage = class {
    constructor(sampleRate2) {
      __publicField(this, "sampleRate");
      __publicField(this, "filters", []);
      __publicField(this, "sections", []);
      this.sampleRate = sampleRate2;
    }
    setSettings(settings) {
      const next = eqSections(settings, this.sampleRate);
      while (this.filters.length < next.length) this.filters.push(new StereoBiquad());
      if (this.filters.length > next.length) this.filters.length = next.length;
      for (let i = 0; i < next.length; i++) this.filters[i].setCoefficients(next[i]);
      this.sections = next;
    }
    /** The exact list the audio is running through, for the display. */
    get currentSections() {
      return this.sections;
    }
    reset() {
      for (const f of this.filters) f.reset();
    }
    tickLeft(x) {
      let y = x;
      for (let i = 0; i < this.filters.length; i++) y = this.filters[i].tickLeft(y);
      return y;
    }
    tickRight(x) {
      let y = x;
      for (let i = 0; i < this.filters.length; i++) y = this.filters[i].tickRight(y);
      return y;
    }
  };

  // lib/master-engine/multiband.ts
  var BUTTERWORTH_Q = Math.SQRT1_2;
  var Crossover = class {
    constructor() {
      __publicField(this, "lowA", new Biquad());
      __publicField(this, "lowB", new Biquad());
      __publicField(this, "highA", new Biquad());
      __publicField(this, "highB", new Biquad());
      __publicField(this, "low", 0);
      __publicField(this, "high", 0);
    }
    setFrequency(hz, sampleRate2) {
      const lp = lowpass(hz, BUTTERWORTH_Q, sampleRate2);
      const hp = highpass(hz, BUTTERWORTH_Q, sampleRate2);
      this.lowA.setCoefficients(lp);
      this.lowB.setCoefficients(lp);
      this.highA.setCoefficients(hp);
      this.highB.setCoefficients(hp);
    }
    reset() {
      this.lowA.reset();
      this.lowB.reset();
      this.highA.reset();
      this.highB.reset();
    }
    split(x) {
      this.low = this.lowB.tick(this.lowA.tick(x));
      this.high = this.highB.tick(this.highA.tick(x));
    }
  };
  var BandCompressor = class {
    constructor(sampleRate2) {
      __publicField(this, "follower");
      __publicField(this, "settings", { ...DEFAULT_BAND });
      __publicField(this, "currentGain", 1);
      this.follower = new EnvelopeFollower(sampleRate2, DEFAULT_BAND.attackSeconds, DEFAULT_BAND.releaseSeconds);
    }
    setSettings(s) {
      this.settings = s;
      this.follower.setTimes(Math.max(1e-4, s.attackSeconds), Math.max(1e-3, s.releaseSeconds));
    }
    reset() {
      this.follower.reset();
      this.currentGain = 1;
    }
    get reductionDb() {
      return gainToDb(this.currentGain);
    }
    /** Detector on the mono sum, gain applied to both channels: compressing the
     *  two separately moves the image on every transient. */
    gainFor(detector) {
      const level = this.follower.tick(Math.abs(detector));
      const s = this.settings;
      if (s.bypass || s.ratio <= 1) {
        this.currentGain = 1;
        return dbToGain(s.makeupDb);
      }
      const levelDb = gainToDb(Math.max(level, 1e-9));
      const over = levelDb - s.thresholdDb;
      if (over <= 0) {
        this.currentGain = 1;
        return dbToGain(s.makeupDb);
      }
      const knee = 6;
      const compressed = over < knee ? over * over * (1 / s.ratio - 1) / (2 * knee) : over * (1 / s.ratio - 1) + knee * (1 - 1 / s.ratio) / 2;
      this.currentGain = dbToGain(compressed);
      return this.currentGain * dbToGain(s.makeupDb);
    }
  };
  var MultibandCompressor = class {
    constructor(sampleRate2) {
      __publicField(this, "sampleRate");
      __publicField(this, "lowSplitL", new Crossover());
      __publicField(this, "lowSplitR", new Crossover());
      __publicField(this, "highSplitL", new Crossover());
      __publicField(this, "highSplitR", new Crossover());
      /**
       * All-pass partners for the low band.
       *
       * The mid and high bands both pass through the UPPER crossover; the low band
       * does not, so it has to be sent through that crossover's own allpass —
       * LP + HP of the same filter, magnitude-flat with exactly the phase the
       * other two picked up. Setting these to the LOWER crossover instead, which
       * reads as the natural pairing, applies the wrong phase and leaves the sum
       * dipping across the whole overlap region.
       */
      __publicField(this, "compensateL", new Crossover());
      __publicField(this, "compensateR", new Crossover());
      __publicField(this, "compressors");
      __publicField(this, "settings", DEFAULT_MULTIBAND);
      __publicField(this, "outLeft", 0);
      __publicField(this, "outRight", 0);
      this.sampleRate = sampleRate2;
      this.compressors = Array.from({ length: BAND_COUNT }, () => new BandCompressor(sampleRate2));
      this.setSettings(DEFAULT_MULTIBAND);
    }
    setSettings(settings) {
      this.settings = settings;
      const low = Math.min(Math.max(30, settings.crossoverLowHz), settings.crossoverHighHz - 50);
      const high = Math.min(Math.max(low + 50, settings.crossoverHighHz), this.sampleRate * 0.45);
      for (const c of [this.lowSplitL, this.lowSplitR]) c.setFrequency(low, this.sampleRate);
      for (const c of [this.highSplitL, this.highSplitR]) c.setFrequency(high, this.sampleRate);
      for (const c of [this.compensateL, this.compensateR]) c.setFrequency(high, this.sampleRate);
      settings.bands.forEach((b, i) => this.compressors[i]?.setSettings(b));
    }
    get active() {
      return this.settings.enabled;
    }
    reductionDb(band) {
      return this.compressors[band].reductionDb;
    }
    reset() {
      for (const c of [
        this.lowSplitL,
        this.lowSplitR,
        this.highSplitL,
        this.highSplitR,
        this.compensateL,
        this.compensateR
      ]) {
        c.reset();
      }
      for (const c of this.compressors) c.reset();
    }
    process(left, right) {
      if (!this.settings.enabled) {
        this.outLeft = left;
        this.outRight = right;
        return;
      }
      this.lowSplitL.split(left);
      this.lowSplitR.split(right);
      this.highSplitL.split(this.lowSplitL.high);
      this.highSplitR.split(this.lowSplitR.high);
      this.compensateL.split(this.lowSplitL.low);
      this.compensateR.split(this.lowSplitR.low);
      const lowL = this.compensateL.low + this.compensateL.high;
      const lowR = this.compensateR.low + this.compensateR.high;
      const midL = this.highSplitL.low;
      const midR = this.highSplitR.low;
      const highL = this.highSplitL.high;
      const highR = this.highSplitR.high;
      const soloing = this.settings.bands.some((b) => b.solo);
      const bandL = [lowL, midL, highL];
      const bandR = [lowR, midR, highR];
      let outL = 0;
      let outR = 0;
      for (let i = 0; i < BAND_COUNT; i++) {
        const band = this.settings.bands[i];
        const gain = this.compressors[i].gainFor((bandL[i] + bandR[i]) * 0.5);
        if (soloing && !band.solo) continue;
        outL += bandL[i] * gain;
        outR += bandR[i] * gain;
      }
      this.outLeft = outL;
      this.outRight = outR;
    }
  };

  // lib/master-engine/exciter.ts
  var EXCITER_CROSSOVER_HZ = 3e3;
  var EVEN_MAX = 0.35;
  var ODD_MAX = 0.3;
  var ExciterChannel = class {
    constructor(sampleRate2) {
      __publicField(this, "band", new Biquad());
      __publicField(this, "cleanUp", new Biquad());
      /** Removes the DC that squaring a signal always produces. */
      __publicField(this, "dcPrev", 0);
      __publicField(this, "dcOut", 0);
      const c = highpass(EXCITER_CROSSOVER_HZ, 0.707, sampleRate2);
      this.band.setCoefficients(c);
      this.cleanUp.setCoefficients(highpass(EXCITER_CROSSOVER_HZ * 1.5, 0.707, sampleRate2));
    }
    reset() {
      this.band.reset();
      this.cleanUp.reset();
      this.dcPrev = 0;
      this.dcOut = 0;
    }
    tick(x, even, odd) {
      if (even === 0 && odd === 0) return x;
      const b = this.band.tick(x);
      const squared = b * b;
      const blocked = squared - this.dcPrev + 0.9995 * this.dcOut;
      this.dcPrev = squared;
      this.dcOut = blocked;
      const cubed = b * b * b;
      const generated = blocked * even * EVEN_MAX + cubed * odd * ODD_MAX;
      return x + this.cleanUp.tick(generated);
    }
  };
  var Exciter = class {
    constructor(sampleRate2) {
      __publicField(this, "left");
      __publicField(this, "right");
      __publicField(this, "even", 0);
      __publicField(this, "odd", 0);
      this.left = new ExciterChannel(sampleRate2);
      this.right = new ExciterChannel(sampleRate2);
    }
    setAmounts(even, odd) {
      this.even = Math.min(1, Math.max(0, even));
      this.odd = Math.min(1, Math.max(0, odd));
    }
    reset() {
      this.left.reset();
      this.right.reset();
    }
    tickLeft(x) {
      return this.left.tick(x, this.even, this.odd);
    }
    tickRight(x) {
      return this.right.tick(x, this.even, this.odd);
    }
  };

  // lib/master-engine/limiter.ts
  var DEFAULT_LOOKAHEAD_S = 2e-3;
  var DEFAULT_RELEASE_S = 0.12;
  var SlidingMinimum = class {
    constructor(window) {
      __publicField(this, "values");
      /** Positions are stored as float64 so the counter cannot overflow — int32
       *  would wrap after about twelve hours of continuous audio. */
      __publicField(this, "positions");
      __publicField(this, "capacity");
      __publicField(this, "window");
      __publicField(this, "head", 0);
      __publicField(this, "tail", 0);
      __publicField(this, "pos", 0);
      this.window = Math.max(1, Math.round(window));
      this.capacity = this.window + 2;
      this.values = new Float64Array(this.capacity);
      this.positions = new Float64Array(this.capacity);
    }
    reset() {
      this.head = 0;
      this.tail = 0;
      this.pos = 0;
    }
    push(v) {
      while (this.tail !== this.head) {
        const back = (this.tail - 1 + this.capacity) % this.capacity;
        if (this.values[back] >= v) this.tail = back;
        else break;
      }
      this.values[this.tail] = v;
      this.positions[this.tail] = this.pos;
      this.tail = (this.tail + 1) % this.capacity;
      while (this.positions[this.head] <= this.pos - this.window) {
        this.head = (this.head + 1) % this.capacity;
      }
      this.pos++;
      return this.values[this.head];
    }
  };
  var Limiter = class {
    constructor(sampleRate2, lookaheadSeconds = DEFAULT_LOOKAHEAD_S) {
      __publicField(this, "sampleRate");
      __publicField(this, "lookahead");
      __publicField(this, "delayLeft");
      __publicField(this, "delayRight");
      __publicField(this, "slidingMin");
      __publicField(this, "ceiling", 1);
      __publicField(this, "riseRate", 0);
      __publicField(this, "gain", 1);
      __publicField(this, "lowestGain", 1);
      /** Filled by process(). Fields rather than a returned tuple: this runs once
       *  per sample and an allocation there is the whole budget. */
      __publicField(this, "outLeft", 0);
      __publicField(this, "outRight", 0);
      this.sampleRate = sampleRate2;
      this.lookahead = Math.max(1, Math.round(lookaheadSeconds * sampleRate2));
      this.delayLeft = new DelayLine(this.lookahead + 4);
      this.delayRight = new DelayLine(this.lookahead + 4);
      this.slidingMin = new SlidingMinimum(this.lookahead + 1);
      this.setRelease(DEFAULT_RELEASE_S);
      this.setCeilingDb(0);
    }
    setCeilingDb(db) {
      this.ceiling = dbToGain(Math.min(0, db));
    }
    setRelease(seconds) {
      const s = Math.max(1e-3, seconds);
      this.riseRate = Math.pow(10, 1 / (s * this.sampleRate * 2));
    }
    get latencySamples() {
      return this.lookahead;
    }
    /** Largest reduction applied since the last reset, in dB (negative). */
    get maxReductionDb() {
      return gainToDb(this.lowestGain);
    }
    /** Reduction being applied right now — what a moving meter shows. */
    get currentReductionDb() {
      return gainToDb(this.gain);
    }
    reset() {
      this.delayLeft.clear();
      this.delayRight.clear();
      this.slidingMin.reset();
      this.gain = 1;
      this.lowestGain = 1;
    }
    process(left, right) {
      this.delayLeft.write(left);
      this.delayRight.write(right);
      const magnitude = Math.max(Math.abs(left), Math.abs(right));
      const required = magnitude > this.ceiling ? this.ceiling / magnitude : 1;
      const floor = this.slidingMin.push(required);
      this.gain = Math.min(floor, this.gain * this.riseRate);
      if (this.gain > 1) this.gain = 1;
      if (this.gain < this.lowestGain) this.lowestGain = this.gain;
      this.outLeft = this.delayLeft.read(this.lookahead + 1) * this.gain;
      this.outRight = this.delayRight.read(this.lookahead + 1) * this.gain;
    }
  };

  // lib/master-engine/loudness.ts
  var LUFS_OFFSET = -0.691;
  var BLOCK_SECONDS = 0.4;
  function kWeightingShelf(sampleRate2) {
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const K = Math.tan(Math.PI * f0 / sampleRate2);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    return {
      b0: (Vh + Vb * K / Q + K * K) / a0,
      b1: 2 * (K * K - Vh) / a0,
      b2: (Vh - Vb * K / Q + K * K) / a0,
      a1: 2 * (K * K - 1) / a0,
      a2: (1 - K / Q + K * K) / a0
    };
  }
  function kWeightingHighpass(sampleRate2) {
    const f0 = 38.13547087602444;
    const Q = 0.5003270373238773;
    const K = Math.tan(Math.PI * f0 / sampleRate2);
    const a0 = 1 + K / Q + K * K;
    return {
      b0: 1,
      b1: -2,
      b2: 1,
      a1: 2 * (K * K - 1) / a0,
      a2: (1 - K / Q + K * K) / a0
    };
  }
  var KWeighting = class {
    constructor(sampleRate2) {
      __publicField(this, "shelf", new Biquad());
      __publicField(this, "highpass", new Biquad());
      this.shelf.setCoefficients(kWeightingShelf(sampleRate2));
      this.highpass.setCoefficients(kWeightingHighpass(sampleRate2));
    }
    reset() {
      this.shelf.reset();
      this.highpass.reset();
    }
    tick(x) {
      return this.highpass.tick(this.shelf.tick(x));
    }
  };
  var loudnessOf = (meanSquareSum) => meanSquareSum <= 0 ? -Infinity : LUFS_OFFSET + 10 * Math.log10(meanSquareSum);
  var LoudnessMeter = class {
    constructor(sampleRate2, shortTermSeconds = 3) {
      __publicField(this, "left");
      __publicField(this, "right");
      __publicField(this, "ring");
      __publicField(this, "momentarySamples");
      __publicField(this, "position", 0);
      __publicField(this, "filled", 0);
      __publicField(this, "momentarySum", 0);
      __publicField(this, "shortSum", 0);
      this.left = new KWeighting(sampleRate2);
      this.right = new KWeighting(sampleRate2);
      this.ring = new Float64Array(Math.max(1, Math.round(shortTermSeconds * sampleRate2)));
      this.momentarySamples = Math.max(1, Math.round(BLOCK_SECONDS * sampleRate2));
    }
    reset() {
      this.left.reset();
      this.right.reset();
      this.ring.fill(0);
      this.position = 0;
      this.filled = 0;
      this.momentarySum = 0;
      this.shortSum = 0;
    }
    tick(left, right) {
      const l = this.left.tick(left);
      const r = this.right.tick(right);
      const power = l * l + r * r;
      const leaving = this.ring[this.position];
      this.shortSum += power - leaving;
      this.ring[this.position] = power;
      const dropIndex = (this.position - this.momentarySamples + this.ring.length) % this.ring.length;
      this.momentarySum += power - (this.filled >= this.momentarySamples ? this.ring[dropIndex] : 0);
      this.position = (this.position + 1) % this.ring.length;
      if (this.filled < this.ring.length) this.filled++;
      if (this.position === 0) this.rebuild();
    }
    rebuild() {
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
    get momentaryLufs() {
      const n = Math.min(this.filled, this.momentarySamples);
      return n === 0 ? -Infinity : loudnessOf(Math.max(0, this.momentarySum) / n);
    }
    get shortTermLufs() {
      return this.filled === 0 ? -Infinity : loudnessOf(Math.max(0, this.shortSum) / this.filled);
    }
  };

  // lib/master-engine/stereo.ts
  var MAX_WIDTH = 2;
  function monoLowHz(amount) {
    const a = Math.min(1, Math.max(0, amount));
    return a === 0 ? 0 : MONO_LOW_MAX_HZ * a;
  }
  function monoHighHz(amount) {
    const a = Math.min(1, Math.max(0, amount));
    return a === 0 ? 0 : MONO_HIGH_MAX_HZ - (MONO_HIGH_MAX_HZ - MONO_HIGH_MIN_HZ) * a;
  }
  function widthFactor(knob) {
    const k = Math.min(1, Math.max(0, knob));
    return k <= 0.5 ? k * 2 : 1 + (k - 0.5) * 2 * (MAX_WIDTH - 1);
  }
  var BUTTERWORTH_4TH2 = [0.5412, 1.3066];
  var StereoStage = class {
    constructor(sampleRate2) {
      __publicField(this, "sampleRate");
      /**
       * These KEEP what stays in the side channel — a highpass for Mono Low, a
       * lowpass for Mono High.
       *
       * The first version instead extracted the unwanted band and subtracted it
       * (`side -= lowpass(side)`), which reads as obviously correct and removes
       * only about 70% of it: the filter passes that band at full level but with
       * a phase shift, so the subtraction is between two vectors at an angle
       * rather than between two identical signals. Filtering the side directly
       * has no such problem.
       */
      __publicField(this, "sideHighpass");
      __publicField(this, "sideLowpass");
      __publicField(this, "lowActive", false);
      __publicField(this, "highActive", false);
      __publicField(this, "side", 1);
      /** Written by process(). Fields, not a returned pair — this runs per sample. */
      __publicField(this, "outLeft", 0);
      __publicField(this, "outRight", 0);
      this.sampleRate = sampleRate2;
      this.sideHighpass = BUTTERWORTH_4TH2.map(() => new Biquad());
      this.sideLowpass = BUTTERWORTH_4TH2.map(() => new Biquad());
      this.setMonoLow(0);
      this.setMonoHigh(0);
    }
    setMonoLow(amount) {
      const hz = monoLowHz(amount);
      this.lowActive = hz > 0;
      if (!this.lowActive) return;
      BUTTERWORTH_4TH2.forEach((q, i) => this.sideHighpass[i].setCoefficients(highpass(hz, q, this.sampleRate)));
    }
    setMonoHigh(amount) {
      const hz = monoHighHz(amount);
      this.highActive = hz > 0 && hz < this.sampleRate * 0.45;
      if (!this.highActive) return;
      BUTTERWORTH_4TH2.forEach((q, i) => this.sideLowpass[i].setCoefficients(lowpass(hz, q, this.sampleRate)));
    }
    setWidth(knob) {
      this.side = widthFactor(knob);
    }
    reset() {
      for (const f of this.sideHighpass) f.reset();
      for (const f of this.sideLowpass) f.reset();
    }
    process(left, right) {
      const mid = (left + right) * 0.5;
      let side = (left - right) * 0.5;
      if (this.lowActive) for (const f of this.sideHighpass) side = f.tick(side);
      if (this.highActive) for (const f of this.sideLowpass) side = f.tick(side);
      side *= this.side;
      this.outLeft = mid + side;
      this.outRight = mid - side;
    }
  };

  // lib/master-engine/chain.ts
  var MasterChain = class {
    constructor(sampleRate2, settings = {}) {
      __publicField(this, "sampleRate");
      __publicField(this, "current");
      __publicField(this, "eq");
      __publicField(this, "multiband");
      __publicField(this, "deEsser");
      __publicField(this, "deChirp");
      __publicField(this, "punch");
      __publicField(this, "saturator");
      __publicField(this, "exciter");
      __publicField(this, "life");
      __publicField(this, "hiss");
      __publicField(this, "stereo");
      __publicField(this, "limiter");
      __publicField(this, "meter");
      __publicField(this, "volume", 1);
      __publicField(this, "peakSeen", 0);
      this.sampleRate = sampleRate2;
      this.eq = new EqStage(sampleRate2);
      this.multiband = new MultibandCompressor(sampleRate2);
      this.deEsser = new DeEsser(sampleRate2);
      this.deChirp = new DeChirp(sampleRate2);
      this.punch = new TransientShaper(sampleRate2);
      this.saturator = new ConsoleSaturator(sampleRate2);
      this.exciter = new Exciter(sampleRate2);
      this.life = new AnalogLife(sampleRate2);
      this.hiss = new TapeHiss(sampleRate2);
      this.stereo = new StereoStage(sampleRate2);
      this.limiter = new Limiter(sampleRate2);
      this.meter = new LoudnessMeter(sampleRate2);
      this.current = { ...DEFAULT_MASTER, ...settings };
      this.apply();
    }
    get settings() {
      return this.current;
    }
    setSettings(update) {
      this.current = { ...this.current, ...update };
      this.apply();
    }
    apply() {
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
    get eqSections() {
      return this.eq.currentSections;
    }
    /**
     * Delay the chain introduces, in samples.
     *
     * Reported rather than hidden: a player that crossfades between the raw and
     * mastered signals has to align them, and an A/B that is a few milliseconds
     * out sounds different for that reason alone.
     */
    get latencySamples() {
      return this.limiter.latencySamples + this.life.latencySamples;
    }
    get meters() {
      return {
        peak: this.peakSeen,
        momentaryLufs: this.meter.momentaryLufs,
        shortTermLufs: this.meter.shortTermLufs,
        gainReductionDb: this.limiter.currentReductionDb,
        deEssDb: this.deEsser.reductionDb,
        bandReductionDb: [
          this.multiband.reductionDb(0),
          this.multiband.reductionDb(1),
          this.multiband.reductionDb(2)
        ]
      };
    }
    resetMeters() {
      this.peakSeen = 0;
    }
    reset() {
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
    process(inLeft, inRight, outLeft, outRight) {
      const n = Math.min(inLeft.length, inRight.length, outLeft.length, outRight.length);
      for (let i = 0; i < n; i++) {
        let l = inLeft[i];
        let r = inRight[i];
        if (!Number.isFinite(l)) l = 0;
        if (!Number.isFinite(r)) r = 0;
        l = this.eq.tickLeft(l);
        r = this.eq.tickRight(r);
        this.multiband.process(l, r);
        l = this.multiband.outLeft;
        r = this.multiband.outRight;
        this.deEsser.detect(l, r);
        l = this.deEsser.tickLeft(l);
        r = this.deEsser.tickRight(r);
        this.deChirp.detect(l, r);
        l = this.deChirp.tickLeft(l);
        r = this.deChirp.tickRight(r);
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
    meterSample(left, right) {
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
    meterOnly(left, right) {
      const n = Math.min(left.length, right.length);
      for (let i = 0; i < n; i++) this.meterSample(left[i], right[i]);
    }
  };

  // lib/master-engine/worklet-processor.ts
  var STATUS_EVERY_BLOCKS = 8;
  var MasterProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      __publicField(this, "chain", new MasterChain(sampleRate, DEFAULT_MASTER));
      // Typed as plainly backed: a message can carry a Float32Array over any
      // ArrayBufferLike, and the fields that receive it are read in loops that
      // assume a normal buffer.
      __publicField(this, "left", new Float32Array(0));
      __publicField(this, "right", new Float32Array(0));
      /**
       * Playhead in FILE frames, fractional.
       *
       * It has to be fractional because the file's sample rate and the device's
       * are frequently different — a 44.1k track on the 48k context most browsers
       * open by default. Reading one frame per output sample, as this did, plays
       * the track 8.84% fast: a measured 440Hz tone came out at 481Hz, a semitone
       * and a half sharp, and the playhead ran ahead of the waveform it was drawn
       * over. Worse, the export path uses the file's own rate and is correct, so
       * what the operator auditioned was not what they shipped.
       */
      __publicField(this, "position", 0);
      __publicField(this, "fileRate", 0);
      __publicField(this, "playing", false);
      __publicField(this, "looping", true);
      __publicField(this, "mastered", true);
      __publicField(this, "blocks", 0);
      __publicField(this, "peak", 0);
      /** Scratch so process() allocates nothing on the audio thread. */
      __publicField(this, "dryL", new Float32Array(128));
      __publicField(this, "dryR", new Float32Array(128));
      this.port.onmessage = (event) => {
        const msg = event.data;
        switch (msg.type) {
          case "load":
            this.left = msg.left;
            this.right = msg.right;
            this.fileRate = msg.sampleRate > 0 ? msg.sampleRate : sampleRate;
            this.position = 0;
            this.chain.reset();
            break;
          case "settings":
            this.chain.setSettings(msg.settings);
            break;
          case "transport":
            if (msg.playing && this.position >= this.left.length) {
              this.position = 0;
              this.chain.reset();
            }
            this.playing = msg.playing && this.left.length > 0;
            break;
          case "loop":
            this.looping = msg.loop;
            break;
          case "seek":
            this.position = Math.min(Math.max(0, msg.frame), this.left.length);
            this.chain.reset();
            break;
          case "mastered":
            this.mastered = msg.mastered;
            this.chain.reset();
            break;
          case "reset":
            this.position = 0;
            this.chain.reset();
            break;
        }
      };
    }
    ensureScratch(size) {
      if (this.dryL.length !== size) {
        this.dryL = new Float32Array(size);
        this.dryR = new Float32Array(size);
      }
    }
    process(_inputs, outputs) {
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const outL = output[0];
      const outR = output.length > 1 ? output[1] : outL;
      const size = outL.length;
      if (!this.playing || this.left.length === 0) {
        outL.fill(0);
        if (outR !== outL) outR.fill(0);
        this.report(size);
        return true;
      }
      this.ensureScratch(size);
      const frames = this.left.length;
      const step = this.fileRate > 0 ? this.fileRate / sampleRate : 1;
      for (let i = 0; i < size; i++) {
        if (this.position >= frames) {
          if (this.looping) {
            this.position -= frames;
          } else {
            this.dryL[i] = 0;
            this.dryR[i] = 0;
            if (this.playing) {
              this.playing = false;
              const ended = { type: "ended" };
              this.port.postMessage(ended);
            }
            continue;
          }
        }
        const i0 = Math.floor(this.position);
        const frac = this.position - i0;
        const i1 = i0 + 1 < frames ? i0 + 1 : this.looping ? 0 : i0;
        this.dryL[i] = this.left[i0] + (this.left[i1] - this.left[i0]) * frac;
        this.dryR[i] = this.right[i0] + (this.right[i1] - this.right[i0]) * frac;
        this.position += step;
      }
      if (this.mastered) {
        this.chain.process(this.dryL, this.dryR, outL, outR);
      } else {
        outL.set(this.dryL);
        if (outR !== outL) outR.set(this.dryR);
        this.chain.meterOnly(outL, outR);
      }
      for (let i = 0; i < size; i++) {
        const a = Math.abs(outL[i]);
        if (a > this.peak) this.peak = a;
        if (outR !== outL) {
          const b = Math.abs(outR[i]);
          if (b > this.peak) this.peak = b;
        }
      }
      this.report(size);
      return true;
    }
    report(_size) {
      if (++this.blocks < STATUS_EVERY_BLOCKS) return;
      this.blocks = 0;
      const meters = this.chain.meters;
      const status = {
        type: "status",
        frame: Math.round(this.position),
        frames: this.left.length,
        rateRatio: this.fileRate > 0 ? this.fileRate / sampleRate : 1,
        playing: this.playing,
        peak: this.peak,
        momentaryLufs: meters.momentaryLufs,
        shortTermLufs: meters.shortTermLufs,
        gainReductionDb: meters.gainReductionDb,
        bandReductionDb: meters.bandReductionDb
      };
      this.port.postMessage(status);
      this.peak = 0;
    }
  };
  registerProcessor("master-processor", MasterProcessor);
})();
