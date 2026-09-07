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

  // lib/synth-engine/presets.ts
  var DEFAULT_PATCH = {
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
    }
  ];

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
  var TAU = Math.PI * 2;
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
      return Math.sin(TAU * t);
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
      this.note = -1;
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
      __publicField(this, "lfo1Phase", 0);
      __publicField(this, "lfo2Phase", 0);
      __publicField(this, "ageCounter", 0);
      /** Events queued between render calls, applied at the top of the next block. */
      __publicField(this, "pending", []);
      this.sampleRate = sampleRate2;
      this.patch = { ...DEFAULT_PATCH, ...patch };
      for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice(sampleRate2, i));
      this.saturator = new Saturator(sampleRate2);
      this.chorus = new Chorus(sampleRate2);
      this.delay = new StereoDelay(sampleRate2);
      this.reverb = new PlateReverb(sampleRate2);
      this.compL = new Compressor(sampleRate2);
      this.compR = new Compressor(sampleRate2);
    }
    get activeVoiceCount() {
      return this.voices.reduce((n, v) => n + (v.active ? 1 : 0), 0);
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
      this.saturator.reset();
      this.chorus.reset();
      this.delay.reset();
      this.reverb.reset();
      this.compL.reset();
      this.compR.reset();
    }
    setPatch(update) {
      this.patch = { ...this.patch, ...update };
      for (const v of this.voices) v.retune(this.patch);
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
        mono *= 0.35;
        mono = this.saturator.tick(mono, p.saturation);
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
