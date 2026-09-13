// GENERATED FILE — do not edit.
// Bundled from lib/synth-engine/worklet-processor.ts by scripts/build-worklet.ts.
// Run `npm run build:worklet` after changing the engine.
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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
  var Allpass = class {
    constructor(delaySamples, gain = 0.7) {
      __publicField(this, "line");
      __publicField(this, "delaySamples");
      __publicField(this, "gain");
      this.delaySamples = Math.max(1, Math.round(delaySamples));
      this.line = new DelayLine(this.delaySamples + 2);
      this.gain = Math.min(Math.max(gain, -0.99), 0.99);
    }
    tick(x) {
      const delayed = this.line.read(this.delaySamples);
      const v = x + this.gain * delayed;
      this.line.write(v);
      return delayed - this.gain * v;
    }
    clear() {
      this.line.clear();
    }
  };

  // lib/synth-engine/effects.ts
  var Saturator = class {
    constructor(sampleRate2) {
      __publicField(this, "previousInput", 0);
      __publicField(this, "dcX", 0);
      __publicField(this, "dcY", 0);
      __publicField(this, "dcCoeff");
      this.dcCoeff = 1 - 2 * Math.PI * 20 / sampleRate2;
    }
    /** @param amount 0..1 */
    tick(x, amount) {
      if (amount <= 1e-4) return x;
      const drive = 1 + amount * 8;
      const mid = (x + this.previousInput) * 0.5;
      this.previousInput = x;
      const shaped = (Math.tanh(mid * drive) + Math.tanh(x * drive)) * 0.5;
      const normalised = shaped / Math.tanh(drive);
      this.dcY = normalised - this.dcX + this.dcCoeff * this.dcY;
      this.dcX = normalised;
      return this.dcY;
    }
    reset() {
      this.previousInput = this.dcX = this.dcY = 0;
    }
  };
  var Chorus = class {
    constructor(sampleRate2) {
      __publicField(this, "line");
      __publicField(this, "phase", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
      this.line = new DelayLine(Math.ceil(sampleRate2 * 0.05));
    }
    /** @returns [left, right] */
    tick(x, rateHz, depth) {
      this.line.write(x);
      if (depth <= 1e-4) return [x, x];
      this.phase += Math.max(0.01, rateHz) / this.sampleRate;
      if (this.phase >= 1) this.phase -= 1;
      const lfo = Math.sin(2 * Math.PI * this.phase);
      const base = 8e-3 * this.sampleRate;
      const swing = depth * 4e-3 * this.sampleRate;
      const left = this.line.readInterpolated(base + lfo * swing);
      const right = this.line.readInterpolated(base - lfo * swing);
      const wet = depth * 0.5;
      return [x * (1 - wet * 0.5) + left * wet, x * (1 - wet * 0.5) + right * wet];
    }
    reset() {
      this.line.clear();
      this.phase = 0;
    }
  };
  var StereoDelay = class {
    constructor(sampleRate2, maxSeconds = 2) {
      __publicField(this, "left");
      __publicField(this, "right");
      __publicField(this, "lpL", 0);
      __publicField(this, "lpR", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
      this.left = new DelayLine(sampleRate2 * maxSeconds);
      this.right = new DelayLine(sampleRate2 * maxSeconds);
    }
    tick(inL, inR, timeSeconds, feedback, mix) {
      const d = Math.min(Math.max(timeSeconds, 1e-3), this.left.size / this.sampleRate - 0.01) * this.sampleRate;
      const fb = Math.min(Math.max(feedback, 0), 0.95);
      const tapL = this.left.read(d);
      const tapR = this.right.read(d);
      const cutoff = 3e3 + (1 - fb) * 9e3;
      const k = Math.min(1, 2 * Math.PI * cutoff / this.sampleRate);
      this.lpL += (tapL - this.lpL) * k;
      this.lpR += (tapR - this.lpR) * k;
      this.left.write(inL + this.lpR * fb);
      this.right.write(inR + this.lpL * fb);
      const m = Math.min(Math.max(mix, 0), 1);
      return [inL + tapL * m, inR + tapR * m];
    }
    reset() {
      this.left.clear();
      this.right.clear();
      this.lpL = this.lpR = 0;
    }
  };
  var Compressor = class {
    constructor(sampleRate2, attackSeconds = 3e-3, releaseSeconds = 0.1) {
      __publicField(this, "envelope", 0);
      __publicField(this, "attackCoeff");
      __publicField(this, "releaseCoeff");
      this.attackCoeff = 1 - Math.exp(-1 / (attackSeconds * sampleRate2));
      this.releaseCoeff = 1 - Math.exp(-1 / (releaseSeconds * sampleRate2));
    }
    /** @param thresholdDb typically -60..0  @param ratio 1..20  @param makeupDb -12..12 */
    tick(x, thresholdDb, ratio, makeupDb) {
      const level = Math.abs(x);
      const coeff = level > this.envelope ? this.attackCoeff : this.releaseCoeff;
      this.envelope += (level - this.envelope) * coeff;
      const envDb = this.envelope > 1e-6 ? 20 * Math.log10(this.envelope) : -120;
      const r = Math.max(1, ratio);
      const over = envDb - thresholdDb;
      const reductionDb = over > 0 ? over * (1 - 1 / r) : 0;
      return x * Math.pow(10, (makeupDb - reductionDb) / 20);
    }
    /** Current gain reduction in dB, for a meter. */
    get reductionDb() {
      return this.envelope > 1e-6 ? 20 * Math.log10(this.envelope) : -120;
    }
    reset() {
      this.envelope = 0;
    }
  };
  var PlateReverb = class {
    constructor(sampleRate2) {
      __publicField(this, "inputDiffusers");
      __publicField(this, "tankL");
      __publicField(this, "tankR");
      __publicField(this, "lineL");
      __publicField(this, "lineR");
      __publicField(this, "delayL");
      __publicField(this, "delayR");
      __publicField(this, "dampL", 0);
      __publicField(this, "dampR", 0);
      __publicField(this, "feedL", 0);
      __publicField(this, "feedR", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
      const ms = (m) => Math.round(m / 1e3 * sampleRate2);
      this.inputDiffusers = [
        new Allpass(ms(4.77), 0.75),
        new Allpass(ms(3.59), 0.75),
        new Allpass(ms(12.73), 0.625),
        new Allpass(ms(9.3), 0.625)
      ];
      this.tankL = [new Allpass(ms(22.58), 0.7), new Allpass(ms(60.48), 0.5)];
      this.tankR = [new Allpass(ms(30.51), 0.7), new Allpass(ms(89.24), 0.5)];
      this.delayL = ms(74.5);
      this.delayR = ms(104.6);
      this.lineL = new DelayLine(this.delayL + 2);
      this.lineR = new DelayLine(this.delayR + 2);
    }
    /**
     * @param decay 0..1 — how long the tail rings
     * @param mix   0..1 — wet level; the caller adds this to its dry signal
     * @returns the WET signal only, [left, right]
     */
    tick(x, decay, mix) {
      if (mix <= 1e-4) return [0, 0];
      const d = Math.min(Math.max(decay, 0), 1);
      const feedbackGain = 0.3 + d * 0.68;
      let diffused = x;
      for (const ap of this.inputDiffusers) diffused = ap.tick(diffused);
      const cutoff = 2e3 + (1 - d) * 8e3;
      const k = Math.min(1, 2 * Math.PI * cutoff / this.sampleRate);
      let l = this.tankL[0].tick(diffused + this.feedR * feedbackGain);
      this.lineL.write(l);
      l = this.lineL.read(this.delayL);
      this.dampL += (l - this.dampL) * k;
      l = this.tankL[1].tick(this.dampL);
      this.feedL = l * feedbackGain;
      let r = this.tankR[0].tick(diffused + this.feedL * feedbackGain);
      this.lineR.write(r);
      r = this.lineR.read(this.delayR);
      this.dampR += (r - this.dampR) * k;
      r = this.tankR[1].tick(this.dampR);
      this.feedR = r * feedbackGain;
      return [l * mix, r * mix];
    }
    reset() {
      for (const ap of [...this.inputDiffusers, ...this.tankL, ...this.tankR]) ap.clear();
      this.lineL.clear();
      this.lineR.clear();
      this.dampL = this.dampR = this.feedL = this.feedR = 0;
    }
  };
  var PHASER_STAGES = 6;
  var Phaser = class {
    constructor(sampleRate2) {
      __publicField(this, "state", new Float64Array(PHASER_STAGES));
      __publicField(this, "phase", 0);
      __publicField(this, "feedbackSample", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
    }
    /**
     * @param rate  LFO speed in Hz
     * @param depth 0..1 wet amount
     * @param feedback 0..1 — resonance, clamped below unity
     */
    tick(x, rate, depth, feedback = 0) {
      if (depth <= 1e-3) return x;
      this.phase += Math.max(0.01, rate) / this.sampleRate;
      if (this.phase >= 1) this.phase -= 1;
      const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * this.phase);
      const centre = 200 * Math.pow(40, lfo);
      const fb = Math.min(Math.max(feedback, 0), 0.95);
      let out = x + this.feedbackSample * fb;
      for (let i = 0; i < PHASER_STAGES; i++) {
        const hz = Math.min(centre * (1 + i * 0.35), this.sampleRate * 0.45);
        const t = Math.tan(Math.PI * hz / this.sampleRate);
        const c = (t - 1) / (t + 1);
        const v = c * out + this.state[i];
        this.state[i] = out - c * v;
        out = v;
      }
      this.feedbackSample = out;
      return x + out * depth;
    }
    reset() {
      this.state.fill(0);
      this.phase = 0;
      this.feedbackSample = 0;
    }
  };
  var Flanger = class {
    constructor(sampleRate2) {
      __publicField(this, "line");
      __publicField(this, "phase", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
      this.line = new DelayLine(Math.ceil(sampleRate2 * 0.03));
    }
    tick(x, rate, depth, feedback = 0) {
      if (depth <= 1e-3) {
        this.line.write(x);
        return x;
      }
      this.phase += Math.max(0.01, rate) / this.sampleRate;
      if (this.phase >= 1) this.phase -= 1;
      const lfo = Math.sin(2 * Math.PI * this.phase);
      const base = (1e-3 + depth * 4e-3) * this.sampleRate;
      const swing = lfo * depth * 2e-3 * this.sampleRate;
      const delayed = this.line.readInterpolated(Math.max(1, base + swing));
      const fb = Math.min(Math.max(feedback, 0), 0.92);
      this.line.write(x + delayed * fb);
      return x + delayed * depth;
    }
    reset() {
      this.line.clear();
      this.phase = 0;
    }
  };
  var BitCrusher = class {
    constructor() {
      __publicField(this, "held", 0);
      __publicField(this, "countdown", 0);
      __publicField(this, "primed", false);
    }
    /**
     * @param bits 1..16
     * @param rateDivisor 1 = untouched; 8 = one sample in eight
     */
    tick(x, bits, rateDivisor) {
      const b = Math.min(Math.max(bits, 1), 16);
      const div = Math.max(1, Math.round(rateDivisor));
      if (b >= 16 && div === 1) {
        this.held = x;
        this.primed = true;
        return x;
      }
      if (--this.countdown <= 0 || !this.primed) {
        this.countdown = div;
        this.primed = true;
        const levels = Math.pow(2, b - 1);
        this.held = Math.round(x * levels) / levels;
      }
      return this.held;
    }
    reset() {
      this.held = 0;
      this.countdown = 0;
      this.primed = false;
    }
  };

  // lib/synth-engine/envelope.ts
  var NINETY_NINE_PERCENT = 4.605;
  var Envelope = class {
    constructor(sampleRate2) {
      __publicField(this, "stage", "idle");
      __publicField(this, "level", 0);
      __publicField(this, "target", 0);
      __publicField(this, "coeff", 1);
      /** Samples left in the current timed stage. */
      __publicField(this, "remaining", 0);
      __publicField(this, "sustainLevel", 0);
      __publicField(this, "decaySeconds", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
    }
    /** Per-sample coefficient that covers 99% of the span in `seconds`. */
    coeffFor(seconds) {
      const samples = seconds * this.sampleRate;
      return samples >= 1 ? 1 - Math.exp(-NINETY_NINE_PERCENT / samples) : 1;
    }
    beginStage(stage, target, seconds) {
      this.stage = stage;
      this.target = target;
      this.coeff = this.coeffFor(seconds);
      this.remaining = Math.max(0, Math.round(seconds * this.sampleRate));
    }
    noteOn(attack, decay, sustain) {
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
    noteOff(release) {
      if (this.stage === "idle") return;
      this.beginStage("release", 0, Math.max(0, release));
      if (this.remaining === 0) {
        this.level = 0;
        this.stage = "idle";
      }
    }
    /** Cut to silence immediately — for voice stealing, where the stolen note's
     *  release tail would otherwise bleed into the new one. */
    kill() {
      this.stage = "idle";
      this.level = 0;
      this.remaining = 0;
    }
    tick() {
      if (this.stage === "idle") return 0;
      if (this.stage === "sustain") {
        this.level = this.sustainLevel;
        return this.level;
      }
      this.level += (this.target - this.level) * this.coeff;
      this.remaining--;
      if (this.remaining <= 0) {
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
    get active() {
      return this.stage !== "idle";
    }
    get currentStage() {
      return this.stage;
    }
    get currentLevel() {
      return this.level;
    }
  };

  // lib/synth-engine/drums.ts
  var TAU = Math.PI * 2;
  var DRUM_IDS = ["kick", "snare", "hat", "perc"];
  var DRUM_RECIPES = {
    // Falling, not rising: 150Hz at impact down to 45Hz.
    kick: { attack: 1e-3, decay: 0.36, startHz: 150, endHz: 45, pitchCurve: 26, noise: 0, gain: 1.1 },
    // Noise for the snares, plus a body tone around 190Hz.
    snare: { attack: 1e-3, decay: 0.19, startHz: 240, endHz: 185, pitchCurve: 40, noise: 0.72, gain: 0.85 },
    // Almost pure noise with a very short tail — the tone is just enough to keep
    // it from sounding like a burst of static.
    hat: { attack: 5e-4, decay: 0.055, startHz: 8e3, endHz: 6e3, pitchCurve: 60, noise: 0.94, gain: 0.55 },
    perc: { attack: 1e-3, decay: 0.13, startHz: 760, endHz: 300, pitchCurve: 34, noise: 0.08, gain: 0.7 }
  };
  var DrumVoice = class {
    constructor(sampleRate2, rng) {
      __publicField(this, "envelope");
      __publicField(this, "rng");
      __publicField(this, "sampleRate");
      __publicField(this, "recipe", DRUM_RECIPES.kick);
      __publicField(this, "phase", 0);
      __publicField(this, "elapsed", 0);
      __publicField(this, "velocity", 1);
      this.sampleRate = sampleRate2;
      this.rng = rng;
      this.envelope = new Envelope(sampleRate2);
    }
    trigger(id, velocity = 1) {
      this.recipe = DRUM_RECIPES[id];
      this.velocity = Math.min(Math.max(velocity, 0), 1);
      this.elapsed = 0;
      this.phase = 0;
      this.envelope.noteOn(this.recipe.attack, this.recipe.decay, 0);
    }
    get active() {
      return this.envelope.active;
    }
    tick() {
      if (!this.envelope.active) return 0;
      const level = this.envelope.tick();
      const r = this.recipe;
      const fall = Math.exp(-this.elapsed * r.pitchCurve);
      const hz = r.endHz + (r.startHz - r.endHz) * fall;
      this.elapsed += 1 / this.sampleRate;
      this.phase += hz / this.sampleRate;
      if (this.phase >= 1) this.phase -= 1;
      const tone = Math.sin(TAU * this.phase);
      const noise = this.rng.bipolar();
      const mixed = tone * (1 - r.noise) + noise * r.noise;
      return Math.tanh(mixed * level * this.velocity * r.gain * 1.4);
    }
    silence() {
      this.envelope.kill();
    }
  };
  var DrumKit = class {
    constructor(sampleRate2, rng) {
      __publicField(this, "voices");
      this.voices = {
        kick: new DrumVoice(sampleRate2, rng),
        snare: new DrumVoice(sampleRate2, rng),
        hat: new DrumVoice(sampleRate2, rng),
        perc: new DrumVoice(sampleRate2, rng)
      };
    }
    trigger(id, velocity = 1) {
      this.voices[id].trigger(id, velocity);
    }
    get activeCount() {
      return DRUM_IDS.reduce((n, id) => n + (this.voices[id].active ? 1 : 0), 0);
    }
    tick() {
      let out = 0;
      for (const id of DRUM_IDS) out += this.voices[id].tick();
      return out;
    }
    silence() {
      for (const id of DRUM_IDS) this.voices[id].silence();
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

  // lib/synth-engine/presets.ts
  var DEFAULT_PATCH = {
    oscSource: "classic",
    osc1Morph: 2,
    // sawtooth
    osc1Octave: 0,
    osc1Level: 0.7,
    osc2Morph: 2,
    osc2Detune: 7,
    osc2Level: 0.5,
    subLevel: 0,
    noiseLevel: 0,
    fmAmount: 0,
    ringAmount: 0,
    grainDensity: 60,
    grainSize: 0.04,
    grainJitter: 0,
    stringDamping: 0.3,
    unisonVoices: 1,
    unisonDetune: 10,
    filterCutoff: 8e3,
    filterResonance: 0.15,
    filterDrive: 1,
    filterKeyTrack: 0,
    filterAttack: 0.01,
    filterDecay: 0.3,
    filterSustain: 0.3,
    filterEnvAmount: 2e3,
    ampAttack: 5e-3,
    ampDecay: 0.3,
    ampSustain: 0.8,
    ampRelease: 0.3,
    lfo1Rate: 3,
    lfo1Amount: 0,
    lfo1Target: "cutoff",
    lfo2Rate: 4,
    lfo2Amount: 0,
    lfo2Target: "pitch",
    saturation: 0,
    phaserRate: 0.5,
    phaserDepth: 0,
    phaserFeedback: 0.4,
    flangerRate: 0.3,
    flangerDepth: 0,
    flangerFeedback: 0.5,
    crushBits: 16,
    crushRateDivisor: 1,
    chorusRate: 1.2,
    chorusDepth: 0,
    delayTime: 0.35,
    delayFeedback: 0.3,
    delayMix: 0,
    reverbDecay: 0.6,
    reverbMix: 0,
    compThreshold: -24,
    compRatio: 4,
    compMakeup: 0,
    volume: 0.5,
    stereoWidth: 0
  };
  var from = (over) => ({ ...DEFAULT_PATCH, ...over });
  var PRESETS = [
    {
      id: "init",
      name: "Init",
      note: "Two saws a few cents apart \u2014 the plain starting point.",
      patch: DEFAULT_PATCH
    },
    {
      id: "acid",
      name: "Acid",
      note: "High resonance plus a fast filter envelope: the sound the ladder's saturated feedback exists for.",
      patch: from({
        osc1Morph: 3,
        osc1Octave: -1,
        osc1Level: 0.9,
        osc2Detune: 5,
        osc2Level: 0.4,
        subLevel: 0.35,
        filterCutoff: 250,
        filterResonance: 0.85,
        filterDrive: 1.4,
        filterKeyTrack: 0.3,
        filterAttack: 0,
        filterDecay: 0.14,
        filterSustain: 0,
        filterEnvAmount: 5200,
        ampAttack: 0,
        ampDecay: 0.15,
        ampSustain: 0.3,
        ampRelease: 0.08,
        saturation: 0.3,
        delayMix: 0.22,
        delayFeedback: 0.4,
        compThreshold: -18,
        compMakeup: 3,
        volume: 0.45
      })
    },
    {
      id: "pad",
      name: "Pad",
      note: "Four unison voices, slow envelopes, wide chorus into a long plate.",
      patch: from({
        osc1Morph: 2.3,
        osc2Morph: 2.5,
        osc2Detune: 12,
        osc2Level: 0.6,
        subLevel: 0.15,
        unisonVoices: 4,
        unisonDetune: 15,
        filterCutoff: 3e3,
        filterResonance: 0.2,
        filterAttack: 0.8,
        filterDecay: 1,
        filterSustain: 0.8,
        filterEnvAmount: 1500,
        ampAttack: 0.8,
        ampDecay: 0.5,
        ampSustain: 0.8,
        ampRelease: 1.5,
        lfo1Rate: 0.5,
        lfo1Amount: 0.15,
        chorusRate: 0.8,
        chorusDepth: 0.6,
        delayMix: 0.2,
        reverbDecay: 0.85,
        reverbMix: 0.45,
        compThreshold: -30,
        compRatio: 2,
        compMakeup: 2,
        volume: 0.4,
        stereoWidth: 0.6
      })
    },
    {
      id: "bell",
      name: "Bell",
      note: "FM at a non-integer ratio gives inharmonic partials \u2014 the metallic part of a bell.",
      patch: from({
        osc1Morph: 0,
        osc1Octave: 1,
        osc1Level: 0.8,
        osc2Morph: 0,
        osc2Detune: 3,
        osc2Level: 0.35,
        fmAmount: 180,
        filterCutoff: 12e3,
        filterResonance: 0.1,
        filterAttack: 0,
        filterDecay: 0.8,
        filterSustain: 0,
        filterEnvAmount: 5e3,
        ampAttack: 0,
        ampDecay: 0.9,
        ampSustain: 0,
        ampRelease: 0.9,
        unisonVoices: 2,
        unisonDetune: 8,
        delayMix: 0.25,
        reverbDecay: 0.8,
        reverbMix: 0.4,
        compThreshold: -30,
        compRatio: 2,
        compMakeup: 4,
        stereoWidth: 0.4
      })
    },
    {
      id: "pluck",
      name: "Pluck",
      note: "Zero attack, short decay, filter tracking the keyboard \u2014 energy leaves fast, as it does on a string.",
      patch: from({
        osc2Morph: 3,
        osc2Detune: 5,
        osc2Level: 0.3,
        noiseLevel: 0.06,
        filterCutoff: 6e3,
        filterResonance: 0.35,
        filterKeyTrack: 0.5,
        filterAttack: 0,
        filterDecay: 0.06,
        filterSustain: 0,
        filterEnvAmount: 8e3,
        ampAttack: 0,
        ampDecay: 0.13,
        ampSustain: 0,
        ampRelease: 0.2,
        saturation: 0.12,
        delayTime: 0.25,
        delayMix: 0.18,
        reverbDecay: 0.5,
        reverbMix: 0.25,
        compThreshold: -20,
        compMakeup: 3
      })
    },
    {
      id: "wobble",
      name: "Wobble",
      note: "LFO straight onto the cutoff at depth \u2014 the filter is the instrument here.",
      patch: from({
        osc1Octave: -1,
        osc1Level: 0.8,
        osc2Detune: 10,
        osc2Level: 0.7,
        subLevel: 0.3,
        filterCutoff: 400,
        filterResonance: 0.7,
        filterDrive: 2,
        filterEnvAmount: 1200,
        ampAttack: 0.01,
        ampDecay: 0.2,
        ampSustain: 0.7,
        lfo1Rate: 2,
        lfo1Amount: 0.85,
        lfo1Target: "cutoff",
        saturation: 0.4,
        compThreshold: -18,
        compRatio: 6,
        compMakeup: 4,
        volume: 0.4
      })
    },
    {
      id: "strings",
      name: "Strings",
      note: "Six unison voices spread wide \u2014 the ensemble effect is just many slightly detuned copies.",
      patch: from({
        osc1Morph: 2.15,
        osc2Morph: 2.15,
        osc2Detune: 10,
        unisonVoices: 6,
        unisonDetune: 18,
        filterCutoff: 4e3,
        filterResonance: 0.15,
        filterKeyTrack: 0.2,
        filterAttack: 0.5,
        filterDecay: 0.8,
        filterSustain: 0.7,
        filterEnvAmount: 1e3,
        ampAttack: 0.5,
        ampDecay: 0.3,
        ampSustain: 0.85,
        ampRelease: 1.2,
        lfo1Rate: 1,
        lfo1Amount: 0.1,
        chorusRate: 0.6,
        chorusDepth: 0.5,
        delayMix: 0.1,
        reverbDecay: 0.85,
        reverbMix: 0.45,
        compThreshold: -28,
        compRatio: 2,
        compMakeup: 2,
        volume: 0.38,
        stereoWidth: 0.75
      })
    },
    {
      id: "lead",
      name: "Lead",
      note: "A little FM for bite, moderate resonance, and enough delay to sit forward.",
      patch: from({
        osc1Morph: 3,
        osc2Detune: 8,
        fmAmount: 18,
        unisonVoices: 2,
        unisonDetune: 12,
        filterCutoff: 6e3,
        filterResonance: 0.4,
        filterDrive: 1.3,
        filterKeyTrack: 0.2,
        filterEnvAmount: 2e3,
        ampAttack: 0.01,
        ampDecay: 0.2,
        ampSustain: 0.7,
        ampRelease: 0.2,
        lfo1Rate: 5,
        lfo1Amount: 0.12,
        lfo1Target: "pitch",
        saturation: 0.2,
        chorusDepth: 0.35,
        delayTime: 0.3,
        delayFeedback: 0.35,
        delayMix: 0.25,
        reverbMix: 0.2,
        compThreshold: -18,
        compMakeup: 3,
        stereoWidth: 0.3
      })
    },
    {
      id: "organ",
      name: "Organ",
      note: "Sines plus a sub, almost no envelope \u2014 the filter stays out of the way.",
      patch: from({
        osc1Morph: 0,
        osc1Level: 0.45,
        osc2Morph: 0,
        osc2Detune: 0,
        osc2Level: 0.3,
        subLevel: 0.28,
        unisonVoices: 3,
        unisonDetune: 5,
        filterCutoff: 1e4,
        filterResonance: 0.05,
        filterEnvAmount: 0,
        ampAttack: 6e-3,
        ampDecay: 0.05,
        ampSustain: 0.9,
        ampRelease: 0.12,
        lfo1Rate: 6,
        lfo1Amount: 0.08,
        lfo1Target: "volume",
        chorusRate: 0.7,
        chorusDepth: 0.5,
        reverbDecay: 0.7,
        reverbMix: 0.28,
        compThreshold: -24,
        compRatio: 3,
        compMakeup: 2,
        stereoWidth: 0.45
      })
    },
    {
      id: "brass",
      name: "Brass",
      note: "The filter opens a beat after the note starts, which is what makes a brass attack read as brass.",
      patch: from({
        osc1Morph: 2.2,
        osc2Morph: 2.3,
        osc2Detune: 5,
        osc2Level: 0.7,
        noiseLevel: 0.03,
        unisonVoices: 3,
        unisonDetune: 8,
        filterCutoff: 2500,
        filterResonance: 0.3,
        filterKeyTrack: 0.3,
        filterAttack: 0.09,
        filterDecay: 0.2,
        filterSustain: 0.8,
        filterEnvAmount: 3200,
        ampAttack: 0.08,
        ampDecay: 0.2,
        ampSustain: 0.8,
        ampRelease: 0.3,
        lfo1Rate: 5,
        lfo1Amount: 0.12,
        lfo1Target: "pitch",
        saturation: 0.15,
        chorusDepth: 0.3,
        delayMix: 0.1,
        reverbMix: 0.2,
        compThreshold: -20,
        compMakeup: 3,
        volume: 0.42,
        stereoWidth: 0.35
      })
    },
    {
      id: "plucked",
      name: "Plucked",
      note: "Karplus-Strong: a burst of noise circulating through a delay line one period long, losing a little each lap.",
      patch: from({
        oscSource: "karplus",
        osc1Level: 0.9,
        stringDamping: 0.25,
        filterCutoff: 9e3,
        filterResonance: 0.1,
        filterEnvAmount: 0,
        ampAttack: 0,
        ampDecay: 2.5,
        ampSustain: 0,
        ampRelease: 1.2,
        delayTime: 0.28,
        delayMix: 0.2,
        reverbDecay: 0.75,
        reverbMix: 0.35,
        compThreshold: -24,
        compMakeup: 3,
        stereoWidth: 0.4
      })
    },
    {
      id: "cloud",
      name: "Cloud",
      note: "Granular: hundreds of short detuned grains a second, which is why the density knob changes texture rather than volume.",
      patch: from({
        oscSource: "granular",
        osc1Level: 0.8,
        grainDensity: 420,
        grainSize: 0.09,
        grainJitter: 45,
        filterCutoff: 4200,
        filterResonance: 0.12,
        filterEnvAmount: 900,
        ampAttack: 0.9,
        ampDecay: 1.2,
        ampSustain: 0.85,
        ampRelease: 1.8,
        chorusRate: 0.5,
        chorusDepth: 0.5,
        reverbDecay: 0.9,
        reverbMix: 0.5,
        compThreshold: -28,
        compRatio: 2,
        compMakeup: 3,
        volume: 0.42,
        stereoWidth: 0.7
      })
    },
    {
      id: "crush",
      name: "Crush",
      note: "Bit reduction and rate division into a resonant phaser \u2014 two separate degradations that usually get conflated.",
      patch: from({
        osc1Morph: 3,
        osc1Octave: -1,
        osc2Detune: 14,
        subLevel: 0.25,
        filterCutoff: 3200,
        filterResonance: 0.4,
        filterEnvAmount: 1800,
        ampAttack: 2e-3,
        ampDecay: 0.25,
        ampSustain: 0.6,
        ampRelease: 0.25,
        crushBits: 5,
        crushRateDivisor: 6,
        phaserRate: 0.35,
        phaserDepth: 0.7,
        phaserFeedback: 0.7,
        saturation: 0.25,
        delayMix: 0.18,
        reverbMix: 0.15,
        compThreshold: -16,
        compRatio: 6,
        compMakeup: 3,
        volume: 0.4
      })
    }
  ];

  // lib/synth-engine/filter.ts
  var SELF_OSCILLATION_K = 4;
  var MAX_RESONANCE = 1.2;
  var LadderFilter = class {
    constructor(sampleRate2, initialCutoff = 1e3) {
      __publicField(this, "s1", 0);
      __publicField(this, "s2", 0);
      __publicField(this, "s3", 0);
      __publicField(this, "s4", 0);
      __publicField(this, "smoothedCutoff");
      __publicField(this, "sampleRate");
      __publicField(this, "cutoffCoeff");
      this.sampleRate = sampleRate2;
      this.smoothedCutoff = initialCutoff;
      this.cutoffCoeff = 1 - Math.exp(-1 / (1e-3 * sampleRate2));
    }
    /**
     * One sample.
     *
     * @param input     signal in
     * @param cutoff    Hz
     * @param resonance 0..1, where 1 is the edge of self-oscillation
     * @param drive     input gain into the saturator; 1 is clean
     */
    tick(input, cutoff, resonance, drive = 1) {
      const target = Math.min(Math.max(cutoff, 20), this.sampleRate * 0.49);
      this.smoothedCutoff += (target - this.smoothedCutoff) * this.cutoffCoeff;
      const g = Math.tan(Math.PI * this.smoothedCutoff / this.sampleRate);
      const k = Math.min(Math.max(resonance, 0), MAX_RESONANCE) * SELF_OSCILLATION_K;
      let x = Math.tanh(input * Math.max(1e-4, drive));
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
      return y4 * (1 + k * 0.5);
    }
    reset() {
      this.s1 = this.s2 = this.s3 = this.s4 = 0;
    }
  };

  // lib/synth-engine/oscillator.ts
  var WAVE_NAMES = ["sine", "triangle", "sawtooth", "square"];
  var TAU2 = Math.PI * 2;
  function blep(t, dt) {
    if (t < dt) {
      const x = t / dt;
      return x + x - x * x - 1;
    }
    if (t > 1 - dt) {
      const x = (t - 1) / dt;
      return x * x + x + x + 1;
    }
    return 0;
  }
  var Oscillator = class {
    constructor(sampleRate2) {
      __publicField(this, "phase", 0);
      __publicField(this, "inc", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
    }
    setFrequency(hz) {
      const f = Math.min(Math.max(hz, 0), this.sampleRate * 0.49);
      this.inc = f / this.sampleRate;
    }
    get frequency() {
      return this.inc * this.sampleRate;
    }
    /** Reset phase — used on note-on so a percussive attack starts identically
     *  every time (and so tests are reproducible). */
    reset(phase = 0) {
      this.phase = phase - Math.floor(phase);
    }
    advance() {
      this.phase += this.inc;
      if (this.phase >= 1) this.phase -= 1;
    }
    // ── The four shapes, each band-limited where it needs to be ───────────────
    /** A sine has no discontinuity, so it needs no correction. */
    sineAt(t) {
      return Math.sin(TAU2 * t);
    }
    /** A triangle is continuous (its DERIVATIVE steps), so plain evaluation is
     *  already close to band-limited — its harmonics fall off as 1/n². */
    triangleAt(t) {
      return 4 * Math.abs(t - 0.5) - 1;
    }
    sawAt(t, dt) {
      return 2 * t - 1 - blep(t, dt);
    }
    squareAt(t, dt) {
      const raw = t < 0.5 ? 1 : -1;
      return raw + blep(t, dt) - blep((t + 0.5) % 1, dt);
    }
    /** Sample one of the four shapes without advancing. */
    shapeAt(index, t, dt) {
      switch (index) {
        case 0:
          return this.sineAt(t);
        case 1:
          return this.triangleAt(t);
        case 2:
          return this.sawAt(t, dt);
        default:
          return this.squareAt(t, dt);
      }
    }
    /**
     * One sample at position `morph` along sine → triangle → saw → square.
     * Integer values give the exact classic shape; anything between crossfades
     * the two neighbours.
     */
    tick(morph) {
      const m = Math.min(Math.max(morph, 0), WAVE_NAMES.length - 1);
      const lo = Math.floor(m);
      const frac = m - lo;
      const t = this.phase;
      const dt = this.inc;
      let out;
      if (frac === 0) {
        out = this.shapeAt(lo, t, dt);
      } else {
        const a = this.shapeAt(lo, t, dt);
        const b = this.shapeAt(lo + 1, t, dt);
        out = a + (b - a) * frac;
      }
      this.advance();
      return out;
    }
  };

  // lib/synth-engine/sources.ts
  var TAU3 = Math.PI * 2;
  var MAX_GRAINS = 24;
  var GranularOscillator = class {
    constructor(sampleRate2, rng) {
      __publicField(this, "grains", []);
      __publicField(this, "spawnCountdown", 0);
      __publicField(this, "frequency", 220);
      __publicField(this, "sampleRate");
      __publicField(this, "rng");
      this.sampleRate = sampleRate2;
      this.rng = rng;
    }
    setFrequency(hz) {
      this.frequency = Math.max(1, Math.min(hz, this.sampleRate * 0.45));
    }
    reset() {
      this.grains.length = 0;
      this.spawnCountdown = 0;
    }
    spawn(sizeSeconds, jitterCents) {
      if (this.grains.length >= MAX_GRAINS) return;
      const detune = jitterCents === 0 ? 0 : this.rng.bipolar() * jitterCents;
      const hz = this.frequency * Math.pow(2, detune / 1200);
      const lengthSamples = Math.max(8, sizeSeconds * this.sampleRate);
      this.grains.push({
        // A random start phase per grain: identical phases would sum into one
        // loud in-phase transient instead of a cloud.
        phase: this.rng.next(),
        phaseInc: hz / this.sampleRate,
        window: 0,
        windowInc: 1 / lengthSamples,
        amplitude: 0.6 + this.rng.next() * 0.4
      });
    }
    /**
     * @param density grains per second
     * @param sizeSeconds length of each grain
     * @param jitterCents pitch spread between grains
     */
    tick(density, sizeSeconds = 0.04, jitterCents = 0) {
      const rate = Math.max(0.1, density);
      const size = Math.max(2e-3, sizeSeconds);
      if (--this.spawnCountdown <= 0) {
        this.spawnCountdown = Math.max(1, Math.round(this.sampleRate / rate));
        this.spawn(size, jitterCents);
      }
      let out = 0;
      for (let i = this.grains.length - 1; i >= 0; i--) {
        const g = this.grains[i];
        const envelope = 0.5 - 0.5 * Math.cos(TAU3 * g.window);
        out += Math.sin(TAU3 * g.phase) * envelope * g.amplitude;
        g.phase += g.phaseInc;
        if (g.phase >= 1) g.phase -= 1;
        g.window += g.windowInc;
        if (g.window >= 1) this.grains.splice(i, 1);
      }
      const overlap = Math.max(1, rate * size);
      return out / Math.sqrt(overlap);
    }
    get activeGrains() {
      return this.grains.length;
    }
  };
  var KS_MAX = 4096;
  var KarplusStrong = class {
    constructor(sampleRate2, rng) {
      __publicField(this, "buffer", new Float64Array(KS_MAX));
      __publicField(this, "length", 0);
      __publicField(this, "position", 0);
      __publicField(this, "brightness", 0.5);
      __publicField(this, "loopGain", 0.999);
      __publicField(this, "sampleRate");
      __publicField(this, "rng");
      this.sampleRate = sampleRate2;
      this.rng = rng;
    }
    /**
     * @param frequency pitch in Hz
     * @param damping 0..1 — 0 is a long bright string, 1 a short dull one
     */
    pluck(frequency, damping = 0.3) {
      const d = Math.min(Math.max(damping, 0), 1);
      const hz = Math.max(this.sampleRate / KS_MAX, Math.min(frequency, this.sampleRate * 0.45));
      this.length = Math.max(2, Math.min(KS_MAX, Math.round(this.sampleRate / hz)));
      this.brightness = 1 - d * 0.85;
      const decaySeconds = 6 * Math.pow(0.06, d);
      this.loopGain = Math.pow(1e-3, this.length / Math.max(1, decaySeconds * this.sampleRate));
      for (let i = 0; i < this.length; i++) this.buffer[i] = this.rng.bipolar();
      this.position = 0;
    }
    tick() {
      if (this.length < 2) return 0;
      const current = this.buffer[this.position];
      const next = this.buffer[(this.position + 1) % this.length];
      const averaged = (current + next) * 0.5;
      const filtered = (averaged + (current - averaged) * this.brightness) * this.loopGain;
      this.buffer[this.position] = filtered;
      this.position = (this.position + 1) % this.length;
      return filtered;
    }
    /** Silence the string — voice stealing. */
    mute() {
      this.length = 0;
    }
  };
  var USER_TABLE_SIZE = 128;
  var UserWavetable = class {
    constructor(sampleRate2) {
      __publicField(this, "table", new Float64Array(USER_TABLE_SIZE));
      __publicField(this, "phase", 0);
      __publicField(this, "inc", 0);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
      for (let i = 0; i < USER_TABLE_SIZE; i++) {
        this.table[i] = Math.sin(TAU3 * i / USER_TABLE_SIZE);
      }
    }
    /** Replace the table. Input of any length is resampled to USER_TABLE_SIZE and
     *  normalised to peak 1, so a faintly-drawn shape is as loud as a bold one. */
    setTable(samples) {
      if (samples.length === 0) return;
      const next = new Float64Array(USER_TABLE_SIZE);
      for (let i = 0; i < USER_TABLE_SIZE; i++) {
        const source = i / USER_TABLE_SIZE * samples.length;
        const i0 = Math.floor(source) % samples.length;
        const i1 = (i0 + 1) % samples.length;
        const frac = source - Math.floor(source);
        const value = samples[i0] * (1 - frac) + samples[i1] * frac;
        next[i] = Number.isFinite(value) ? value : 0;
      }
      let peak = 0;
      for (let i = 0; i < USER_TABLE_SIZE; i++) peak = Math.max(peak, Math.abs(next[i]));
      if (peak > 1e-6) for (let i = 0; i < USER_TABLE_SIZE; i++) next[i] /= peak;
      this.table = next;
    }
    getTable() {
      return this.table.slice();
    }
    setFrequency(hz) {
      this.inc = Math.max(0, Math.min(hz, this.sampleRate * 0.49)) / this.sampleRate;
    }
    reset(phase = 0) {
      this.phase = phase - Math.floor(phase);
    }
    /** True once the pitch is high enough that an edge in the table will fold.
     *  The UI uses it to warn rather than to silently change the sound. */
    get aliasWarning() {
      return this.inc * USER_TABLE_SIZE > 0.5;
    }
    tick() {
      const pos = this.phase * USER_TABLE_SIZE;
      const i0 = Math.floor(pos) % USER_TABLE_SIZE;
      const i1 = (i0 + 1) % USER_TABLE_SIZE;
      const frac = pos - Math.floor(pos);
      const out = this.table[i0] * (1 - frac) + this.table[i1] * frac;
      this.phase += this.inc;
      if (this.phase >= 1) this.phase -= 1;
      return out;
    }
  };

  // lib/synth-engine/voice.ts
  var MAX_UNISON = 8;
  function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }
  var Voice = class {
    constructor(sampleRate2, seed) {
      __publicField(this, "note", -1);
      /** Rising counter set on note-on, so the oldest voice can be identified. */
      __publicField(this, "age", 0);
      __publicField(this, "osc1", []);
      __publicField(this, "osc2", []);
      __publicField(this, "sub");
      // The alternate architectures. Built once per voice rather than per note:
      // allocating a 4096-sample delay line inside noteOn() would put the cost on
      // the audio thread at exactly the moment it has least room for it.
      __publicField(this, "granular");
      __publicField(this, "karplus");
      __publicField(this, "userTable");
      __publicField(this, "filter");
      __publicField(this, "ampEnv");
      __publicField(this, "filterEnv");
      __publicField(this, "rng");
      __publicField(this, "unisonCount", 1);
      __publicField(this, "velocity", 1);
      __publicField(this, "baseFrequency", 440);
      __publicField(this, "sampleRate");
      this.sampleRate = sampleRate2;
      for (let i = 0; i < MAX_UNISON; i++) {
        this.osc1.push(new Oscillator(sampleRate2));
        this.osc2.push(new Oscillator(sampleRate2));
      }
      this.sub = new Oscillator(sampleRate2);
      this.filter = new LadderFilter(sampleRate2);
      this.ampEnv = new Envelope(sampleRate2);
      this.filterEnv = new Envelope(sampleRate2);
      this.rng = new Rng(19088743 + seed * 2654435761);
      this.granular = new GranularOscillator(sampleRate2, this.rng);
      this.karplus = new KarplusStrong(sampleRate2, this.rng);
      this.userTable = new UserWavetable(sampleRate2);
    }
    get active() {
      return this.ampEnv.active;
    }
    noteOn(note, velocity, patch, age) {
      this.note = note;
      this.age = age;
      this.velocity = Math.min(Math.max(velocity, 0), 1);
      this.baseFrequency = midiToFrequency(note);
      this.unisonCount = Math.min(MAX_UNISON, Math.max(1, Math.round(patch.unisonVoices)));
      this.tuneOscillators(patch);
      for (let i = 0; i < this.unisonCount; i++) {
        const spread = this.unisonCount > 1 ? i / this.unisonCount : 0;
        this.osc1[i].reset(spread);
        this.osc2[i].reset(spread);
      }
      this.sub.reset();
      this.filter.reset();
      switch (patch.oscSource) {
        case "granular":
          this.granular.reset();
          this.granular.setFrequency(this.baseFrequency * Math.pow(2, patch.osc1Octave));
          break;
        case "karplus":
          this.karplus.pluck(this.baseFrequency * Math.pow(2, patch.osc1Octave), patch.stringDamping);
          break;
        case "user":
          this.userTable.reset();
          this.userTable.setFrequency(this.baseFrequency * Math.pow(2, patch.osc1Octave));
          break;
        default:
          break;
      }
      this.ampEnv.noteOn(patch.ampAttack, patch.ampDecay, patch.ampSustain);
      this.filterEnv.noteOn(patch.filterAttack, patch.filterDecay, patch.filterSustain);
    }
    tuneOscillators(patch) {
      const f1 = this.baseFrequency * Math.pow(2, patch.osc1Octave);
      const f2 = f1 * Math.pow(2, patch.osc2Detune / 1200);
      const spread = patch.unisonDetune;
      for (let i = 0; i < this.unisonCount; i++) {
        const offset = this.unisonCount > 1 ? (i / (this.unisonCount - 1) * 2 - 1) * spread : 0;
        const ratio = Math.pow(2, offset / 1200);
        this.osc1[i].setFrequency(f1 * ratio);
        this.osc2[i].setFrequency(f2 * ratio);
      }
      this.sub.setFrequency(f1 * 0.5);
    }
    noteOff(patch) {
      this.ampEnv.noteOff(patch.ampRelease);
      this.filterEnv.noteOff(Math.max(0.01, patch.ampRelease));
    }
    /** Silence immediately — voice stealing. */
    steal() {
      this.ampEnv.kill();
      this.filterEnv.kill();
      this.karplus.mute();
      this.granular.reset();
      this.note = -1;
    }
    /** Replace the drawable wavetable this voice reads. */
    setUserTable(samples) {
      this.userTable.setTable(samples);
    }
    /**
     * One sample.
     * @param lfoCutoff  Hz to add to the cutoff this sample
     * @param lfoPitch   semitones to bend this sample
     * @param lfoMorph   added to both oscillators' morph
     * @param lfoVolume  multiplier on the output
     */
    tick(patch, lfoCutoff, lfoPitch, lfoMorph, lfoVolume) {
      if (!this.ampEnv.active) return 0;
      const ampLevel = this.ampEnv.tick();
      const filterLevel = this.filterEnv.tick();
      if (lfoPitch !== 0) {
        const bend = Math.pow(2, lfoPitch / 12);
        const f1 = this.baseFrequency * Math.pow(2, patch.osc1Octave) * bend;
        const f2 = f1 * Math.pow(2, patch.osc2Detune / 1200);
        for (let i = 0; i < this.unisonCount; i++) {
          const offset = this.unisonCount > 1 ? (i / (this.unisonCount - 1) * 2 - 1) * patch.unisonDetune : 0;
          const ratio = Math.pow(2, offset / 1200);
          this.osc1[i].setFrequency(f1 * ratio);
          this.osc2[i].setFrequency(f2 * ratio);
        }
      }
      if (patch.oscSource !== "classic") {
        let source = 0;
        if (patch.oscSource === "granular") {
          if (lfoPitch !== 0) {
            this.granular.setFrequency(
              this.baseFrequency * Math.pow(2, patch.osc1Octave) * Math.pow(2, lfoPitch / 12)
            );
          }
          source = this.granular.tick(patch.grainDensity, patch.grainSize, patch.grainJitter);
        } else if (patch.oscSource === "karplus") {
          source = this.karplus.tick();
        } else {
          if (lfoPitch !== 0) {
            this.userTable.setFrequency(
              this.baseFrequency * Math.pow(2, patch.osc1Octave) * Math.pow(2, lfoPitch / 12)
            );
          }
          source = this.userTable.tick();
        }
        let mixed = source * patch.osc1Level;
        if (patch.subLevel > 0) mixed += this.sub.tick(3) * patch.subLevel;
        if (patch.noiseLevel > 0) mixed += this.rng.bipolar() * patch.noiseLevel;
        mixed *= this.velocity;
        const keyTrackAlt = (this.note - 60) * 100 * patch.filterKeyTrack;
        const cutoffAlt = patch.filterCutoff + filterLevel * patch.filterEnvAmount + keyTrackAlt + lfoCutoff;
        const filteredAlt = this.filter.tick(
          mixed,
          cutoffAlt,
          patch.filterResonance,
          Math.max(0.01, patch.filterDrive)
        );
        return filteredAlt * ampLevel * lfoVolume;
      }
      const morph1 = patch.osc1Morph + lfoMorph;
      const morph2 = patch.osc2Morph + lfoMorph;
      const norm = 1 / Math.sqrt(this.unisonCount);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < this.unisonCount; i++) {
        s2 += this.osc2[i].tick(morph2) * norm;
      }
      if (patch.fmAmount > 0) {
        const f1 = this.baseFrequency * Math.pow(2, patch.osc1Octave);
        for (let i = 0; i < this.unisonCount; i++) {
          this.osc1[i].setFrequency(Math.max(0, f1 + s2 * patch.fmAmount));
        }
      }
      for (let i = 0; i < this.unisonCount; i++) {
        s1 += this.osc1[i].tick(morph1) * norm;
      }
      let mix = s1 * patch.osc1Level + s2 * patch.osc2Level;
      if (patch.ringAmount > 0) mix += s1 * s2 * patch.ringAmount;
      if (patch.subLevel > 0) mix += this.sub.tick(3) * patch.subLevel;
      if (patch.noiseLevel > 0) mix += this.rng.bipolar() * patch.noiseLevel;
      mix *= this.velocity;
      const keyTrack = (this.note - 60) * 100 * patch.filterKeyTrack;
      const cutoff = patch.filterCutoff + filterLevel * patch.filterEnvAmount + keyTrack + lfoCutoff;
      const filtered = this.filter.tick(mix, cutoff, patch.filterResonance, Math.max(0.01, patch.filterDrive));
      return filtered * ampLevel * lfoVolume;
    }
    /** Retune to a changed patch while held — an octave or detune knob moved
     *  mid-note should be heard, not wait for the next note. */
    retune(patch) {
      if (this.note >= 0) this.tuneOscillators(patch);
    }
  };

  // lib/synth-engine/synth.ts
  var MAX_VOICES = 16;
  var PULSE_OFF = {
    enabled: false,
    bpm: 60,
    note: 67,
    velocity: 0.5,
    gateSeconds: 0.1
  };
  var Synth = class {
    constructor(sampleRate2, patch = {}) {
      __publicField(this, "sampleRate");
      __publicField(this, "patch");
      __publicField(this, "voices", []);
      __publicField(this, "saturator");
      __publicField(this, "chorus");
      __publicField(this, "delay");
      __publicField(this, "reverb");
      __publicField(this, "compL");
      __publicField(this, "compR");
      __publicField(this, "phaser");
      __publicField(this, "flanger");
      __publicField(this, "crusher");
      __publicField(this, "drums");
      __publicField(this, "lfo1Phase", 0);
      __publicField(this, "lfo2Phase", 0);
      __publicField(this, "ageCounter", 0);
      /** Events queued between render calls, applied at the top of the next block. */
      __publicField(this, "pending", []);
      __publicField(this, "pulse", { ...PULSE_OFF });
      /** Samples until the next pulse fires. */
      __publicField(this, "pulseCountdown", 0);
      /** Samples until the sounding pulse is released; -1 when none is sounding. */
      __publicField(this, "pulseGate", -1);
      this.sampleRate = sampleRate2;
      this.patch = { ...DEFAULT_PATCH, ...patch };
      for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice(sampleRate2, i));
      this.saturator = new Saturator(sampleRate2);
      this.chorus = new Chorus(sampleRate2);
      this.delay = new StereoDelay(sampleRate2);
      this.reverb = new PlateReverb(sampleRate2);
      this.compL = new Compressor(sampleRate2);
      this.compR = new Compressor(sampleRate2);
      this.phaser = new Phaser(sampleRate2);
      this.flanger = new Flanger(sampleRate2);
      this.crusher = new BitCrusher();
      this.drums = new DrumKit(sampleRate2, new Rng(860165));
    }
    /** Hit a drum pad. Independent of the keyboard: pads do not consume voices
     *  and are not affected by note-off. */
    triggerDrum(id, velocity = 1) {
      this.drums.trigger(id, velocity);
    }
    /** Replace the drawable wavetable every voice reads. */
    setUserTable(samples) {
      for (const v of this.voices) v.setUserTable(samples);
    }
    get activeVoiceCount() {
      return this.voices.reduce((n, v) => n + (v.active ? 1 : 0), 0);
    }
    get activeDrumCount() {
      return this.drums.activeCount;
    }
    noteOn(note, velocity = 1) {
      this.pending.push({ type: "on", note, velocity });
    }
    noteOff(note) {
      this.pending.push({ type: "off", note, velocity: 0 });
    }
    /** Release everything. */
    allNotesOff() {
      for (const v of this.voices) if (v.active) v.noteOff(this.patch);
      this.pending = [];
    }
    /** Silence everything at once, including tails. */
    panic() {
      for (const v of this.voices) v.steal();
      this.pending = [];
      this.pulseGate = -1;
      this.saturator.reset();
      this.chorus.reset();
      this.phaser.reset();
      this.flanger.reset();
      this.crusher.reset();
      this.drums.silence();
      this.delay.reset();
      this.reverb.reset();
      this.compL.reset();
      this.compR.reset();
    }
    setPatch(update) {
      this.patch = { ...this.patch, ...update };
      for (const v of this.voices) v.retune(this.patch);
    }
    /** Configure the audio-thread pulse. Changing the tempo keeps the phase — the
     *  next beat lands where the new tempo says, rather than restarting the bar,
     *  so a tempo ramp glides instead of stuttering at every segment boundary. */
    setPulse(update) {
      const wasEnabled = this.pulse.enabled;
      this.pulse = { ...this.pulse, ...update };
      if (this.pulse.enabled && !wasEnabled) {
        this.pulseCountdown = 0;
      }
      if (!this.pulse.enabled && wasEnabled && this.pulseGate >= 0) {
        this.applyNoteOff(this.pulse.note);
        this.pulseGate = -1;
      }
    }
    get pulseSettings() {
      return this.pulse;
    }
    /** Advance the pulse by one sample, triggering and releasing as due. */
    tickPulse() {
      if (this.pulseGate >= 0 && --this.pulseGate <= 0) {
        this.applyNoteOff(this.pulse.note);
        this.pulseGate = -1;
      }
      if (!this.pulse.enabled) return;
      if (--this.pulseCountdown > 0) return;
      const period = Math.max(1, Math.round(60 / Math.max(1, this.pulse.bpm) * this.sampleRate));
      this.pulseCountdown = period;
      this.pulseGate = Math.min(period - 1, Math.max(1, Math.round(this.pulse.gateSeconds * this.sampleRate)));
      this.applyNoteOn(this.pulse.note, this.pulse.velocity);
    }
    applyNoteOn(note, velocity) {
      let voice = this.voices.find((v) => v.active && v.note === note);
      if (!voice) voice = this.voices.find((v) => !v.active);
      if (!voice) {
        voice = this.voices.reduce((oldest, v) => v.age < oldest.age ? v : oldest, this.voices[0]);
        voice.steal();
      }
      voice.noteOn(note, velocity, this.patch, ++this.ageCounter);
    }
    applyNoteOff(note) {
      for (const v of this.voices) if (v.active && v.note === note) v.noteOff(this.patch);
    }
    drainEvents() {
      for (const e of this.pending) {
        if (e.type === "on") this.applyNoteOn(e.note, e.velocity);
        else this.applyNoteOff(e.note);
      }
      this.pending.length = 0;
    }
    /** Split one LFO's output across the four destinations. */
    lfoContribution(value, amount, target) {
      const v = value * amount;
      return {
        cutoff: target === "cutoff" ? v * 4e3 : 0,
        pitch: target === "pitch" ? v * 0.5 : 0,
        // ±½ semitone at full depth
        morph: target === "morph" ? v * 1.5 : 0,
        volume: target === "volume" ? 1 + v * 0.5 : 1
      };
    }
    /**
     * Render one block. `left` and `right` are filled, not added to.
     * The same call the AudioWorklet makes and the tests make.
     */
    render(left, right) {
      this.drainEvents();
      const p = this.patch;
      const n = Math.min(left.length, right.length);
      const lfo1Inc = p.lfo1Rate / this.sampleRate;
      const lfo2Inc = p.lfo2Rate / this.sampleRate;
      for (let i = 0; i < n; i++) {
        this.tickPulse();
        this.lfo1Phase += lfo1Inc;
        if (this.lfo1Phase >= 1) this.lfo1Phase -= 1;
        this.lfo2Phase += lfo2Inc;
        if (this.lfo2Phase >= 1) this.lfo2Phase -= 1;
        const a = this.lfoContribution(Math.sin(2 * Math.PI * this.lfo1Phase), p.lfo1Amount, p.lfo1Target);
        const b = this.lfoContribution(Math.sin(2 * Math.PI * this.lfo2Phase), p.lfo2Amount, p.lfo2Target);
        let mono = 0;
        for (const v of this.voices) {
          if (v.active) {
            mono += v.tick(p, a.cutoff + b.cutoff, a.pitch + b.pitch, a.morph + b.morph, a.volume * b.volume);
          }
        }
        mono += this.drums.tick() * 0.8;
        mono *= 0.35;
        mono = this.saturator.tick(mono, p.saturation);
        mono = this.phaser.tick(mono, p.phaserRate, p.phaserDepth, p.phaserFeedback);
        mono = this.flanger.tick(mono, p.flangerRate, p.flangerDepth, p.flangerFeedback);
        mono = this.crusher.tick(mono, p.crushBits, p.crushRateDivisor);
        const [chL, chR] = this.chorus.tick(mono, p.chorusRate, p.chorusDepth);
        const mid = (chL + chR) * 0.5;
        const side = (chL - chR) * 0.5 * p.stereoWidth;
        let outL = mid + side;
        let outR = mid - side;
        [outL, outR] = this.delay.tick(outL, outR, p.delayTime, p.delayFeedback, p.delayMix);
        const [revL, revR] = this.reverb.tick(mono, p.reverbDecay, p.reverbMix);
        outL += revL;
        outR += revR;
        outL = this.compL.tick(outL, p.compThreshold, p.compRatio, p.compMakeup);
        outR = this.compR.tick(outR, p.compThreshold, p.compRatio, p.compMakeup);
        outL *= p.volume;
        outR *= p.volume;
        left[i] = Math.tanh(outL);
        right[i] = Math.tanh(outR);
      }
    }
    /** Render `seconds` into a fresh pair of buffers — the test/offline entry. */
    renderSeconds(seconds) {
      const n = Math.round(seconds * this.sampleRate);
      const left = new Float32Array(n);
      const right = new Float32Array(n);
      this.render(left, right);
      return { left, right };
    }
  };

  // lib/synth-engine/worklet-processor.ts
  var STATUS_EVERY_BLOCKS = 8;
  var SynthProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      __publicField(this, "synth", new Synth(sampleRate));
      __publicField(this, "blocks", 0);
      __publicField(this, "peak", 0);
      this.port.onmessage = (event) => {
        const msg = event.data;
        switch (msg.type) {
          case "noteOn":
            this.synth.noteOn(msg.note, msg.velocity);
            break;
          case "noteOff":
            this.synth.noteOff(msg.note);
            break;
          case "patch":
            this.synth.setPatch(msg.patch);
            break;
          case "allNotesOff":
            this.synth.allNotesOff();
            break;
          case "pulse":
            this.synth.setPulse(msg.pulse);
            break;
          case "drum":
            this.synth.triggerDrum(msg.id, msg.velocity);
            break;
          case "userTable":
            this.synth.setUserTable(msg.samples);
            break;
          case "panic":
            this.synth.panic();
            break;
        }
      };
    }
    process(_inputs, outputs) {
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const left = output[0];
      const right = output.length > 1 ? output[1] : left;
      this.synth.render(left, right);
      for (let i = 0; i < left.length; i++) {
        const a = Math.abs(left[i]);
        if (a > this.peak) this.peak = a;
      }
      if (++this.blocks >= STATUS_EVERY_BLOCKS) {
        this.blocks = 0;
        const status = {
          type: "status",
          activeVoices: this.synth.activeVoiceCount,
          peak: this.peak
        };
        this.port.postMessage(status);
        this.peak = 0;
      }
      return true;
    }
  };
  registerProcessor("synth-processor", SynthProcessor);
})();
