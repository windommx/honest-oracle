import { describe, it, expect } from "vitest";
import { MasterChain, applyFades } from "./chain";
import { MASTER_PRESETS, getMasterPreset } from "./presets";
import { QUICK_FIXES, QUICK_FIX_IDS, quickFix } from "./quickfix";
import {
  AUDIT_MEANING,
  CORRELATION_FLOOR,
  TRUE_PEAK_LIMIT_DB,
  auditMaster,
} from "./audit";
import { DEFAULT_MASTER, NEUTRAL, TONE_RANGE_DB, defaultEqBands, dbToGain } from "./types";
import { integratedLufs } from "./loudness";
import { allFinite, peak, rms } from "@/lib/synth-engine/analysis";

const SR = 48000;

function music(seconds = 2, amp = 0.4): { l: Float32Array; r: Float32Array } {
  // A bass note, a mid tone and some top, plus repeated transients — enough
  // for every stage in the chain to have something to act on.
  const n = Math.round(seconds * SR);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const beat = Math.exp(-((t * 2) % 1) * 12);
    const v =
      Math.sin(2 * Math.PI * 55 * t) * 0.5 * beat +
      Math.sin(2 * Math.PI * 440 * t) * 0.3 +
      Math.sin(2 * Math.PI * 6500 * t) * 0.12;
    l[i] = v * amp;
    r[i] = (v * 0.92 + Math.sin(2 * Math.PI * 3300 * t) * 0.1) * amp;
  }
  return { l, r };
}

function render(settings: Parameters<MasterChain["setSettings"]>[0], input = music()) {
  const chain = new MasterChain(SR, settings);
  const l = new Float32Array(input.l.length);
  const r = new Float32Array(input.r.length);
  chain.process(input.l, input.r, l, r);
  return { l, r, chain };
}

describe("neutral settings are a wire", () => {
  it("returns the input unchanged, allowing for the stated latency", () => {
    // The A/B guarantee. If this drifts, every comparison the operator makes
    // between RAW and MASTERED is against a moving reference.
    const input = music(1);
    const { l, chain } = render({ ...NEUTRAL, eq: defaultEqBands() }, input);
    const latency = chain.latencySamples;
    expect(latency).toBeGreaterThan(0);
    for (let i = 0; i < input.l.length - latency; i += 13) {
      expect(l[i + latency], `sample ${i}`).toBeCloseTo(input.l[i], 6);
    }
  });

  it("reports a latency that is actually its latency", () => {
    const chain = new MasterChain(SR, { ...NEUTRAL, eq: defaultEqBands() });
    // Nothing but the limiter is on, so the number must be the limiter's.
    expect(chain.latencySamples).toBe(Math.round(0.002 * SR));
  });

  it("Analog Life adds to the reported latency when it is on", () => {
    const off = new MasterChain(SR, { ...NEUTRAL, eq: defaultEqBands() }).latencySamples;
    const on = new MasterChain(SR, { ...NEUTRAL, eq: defaultEqBands(), analogLife: 1 }).latencySamples;
    expect(on).toBeGreaterThan(off);
  });
});

describe("the chain as a whole", () => {
  it("produces finite audio under every preset", () => {
    for (const preset of MASTER_PRESETS) {
      const { l, r } = render(preset.settings);
      expect(allFinite(l), preset.id).toBe(true);
      expect(allFinite(r), preset.id).toBe(true);
    }
  });

  it("never exceeds the ceiling, under any preset, on hot input", () => {
    const hot = music(1.5, 0.95);
    for (const preset of MASTER_PRESETS) {
      const { l, r } = render(preset.settings, hot);
      const ceiling = dbToGain(preset.settings.ceilingDb);
      expect(Math.max(peak(l), peak(r)), `${preset.id} overshot`).toBeLessThanOrEqual(ceiling + 1e-6);
    }
  });

  it("is deterministic — the same input and settings give the same bytes", () => {
    const input = music(1);
    const a = render(DEFAULT_MASTER, input).l;
    const b = render(DEFAULT_MASTER, input).l;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("actually changes the sound", () => {
    const input = music(1);
    const neutral = render({ ...NEUTRAL, eq: defaultEqBands() }, input).l;
    const mastered = render(DEFAULT_MASTER, input).l;
    expect(rms(mastered)).not.toBeCloseTo(rms(neutral), 4);
  });

  it("the loudest preset really is louder", () => {
    const input = music(3, 0.5);
    const quiet = render(getMasterPreset("broadcast")!.settings, input);
    const loud = render(getMasterPreset("club")!.settings, input);
    const quietLufs = integratedLufs([quiet.l, quiet.r], SR);
    const loudLufs = integratedLufs([loud.l, loud.r], SR);
    expect(loudLufs).toBeGreaterThan(quietLufs + 4);
  });

  it("exposes the EQ sections the audio is running through", () => {
    const chain = new MasterChain(SR, { ...NEUTRAL, eq: defaultEqBands(), bass: 3, lowCut: true });
    expect(chain.eqSections.length).toBe(3); // two cut sections plus the shelf
  });

  it("meters report something real once audio has passed", () => {
    const { chain } = render(DEFAULT_MASTER, music(2));
    const m = chain.meters;
    expect(m.peak).toBeGreaterThan(0);
    expect(Number.isFinite(m.shortTermLufs)).toBe(true);
    expect(m.gainReductionDb).toBeLessThanOrEqual(0);
  });

  it("input and output may be the same arrays", () => {
    const input = music(0.5);
    const chain = new MasterChain(SR, DEFAULT_MASTER);
    const copy = { l: Float32Array.from(input.l), r: Float32Array.from(input.r) };
    chain.process(copy.l, copy.r, copy.l, copy.r);
    expect(allFinite(copy.l)).toBe(true);
    expect(peak(copy.l)).toBeGreaterThan(0);
  });

  it("reset clears the tails so a replay starts clean", () => {
    const chain = new MasterChain(SR, DEFAULT_MASTER);
    const input = music(0.5);
    const out = { l: new Float32Array(input.l.length), r: new Float32Array(input.r.length) };
    chain.process(input.l, input.r, out.l, out.r);
    chain.reset();
    const silence = new Float32Array(2048);
    const after = new Float32Array(2048);
    chain.process(silence, silence, after, after);
    // Only the hiss, which the default preset has at zero.
    expect(peak(after)).toBe(0);
  });
});

describe("fades", () => {
  const flat = (n: number, v = 0.5) => {
    const a = new Float32Array(n);
    a.fill(v);
    return a;
  };

  it("start at silence and reach full level", () => {
    const ch = flat(SR);
    applyFades([ch], SR, 0.25, 0.25);
    expect(ch[0]).toBeCloseTo(0, 5);
    expect(ch[ch.length - 1]).toBeCloseTo(0, 5);
    expect(ch[Math.round(SR * 0.5)]).toBeCloseTo(0.5, 5);
  });

  it("are smooth, with no step anywhere", () => {
    const ch = flat(SR);
    applyFades([ch], SR, 0.3, 0.3);
    let biggestStep = 0;
    for (let i = 1; i < ch.length; i++) biggestStep = Math.max(biggestStep, Math.abs(ch[i] - ch[i - 1]));
    expect(biggestStep).toBeLessThan(0.001);
  });

  it("two fades longer than the file do not dig a hole in the middle", () => {
    // Both clamped to half the length, so they meet rather than overlap.
    const ch = flat(SR);
    applyFades([ch], SR, 10, 10);
    expect(ch[Math.round(SR * 0.5)]).toBeGreaterThan(0.45);
  });

  it("zero means untouched", () => {
    const ch = flat(100);
    applyFades([ch], SR, 0, 0);
    for (let i = 0; i < 100; i++) expect(ch[i]).toBe(0.5);
  });

  it("apply to every channel identically", () => {
    const l = flat(SR);
    const r = flat(SR);
    applyFades([l, r], SR, 0.2, 0.2);
    expect(Array.from(l)).toEqual(Array.from(r));
  });
});

describe("presets", () => {
  it("every one has a note that says what it does", () => {
    for (const p of MASTER_PRESETS) {
      expect(p.note.length, p.id).toBeGreaterThan(20);
      expect(p.name.length, p.id).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    expect(new Set(MASTER_PRESETS.map((p) => p.id)).size).toBe(MASTER_PRESETS.length);
  });

  it("bypass really is neutral", () => {
    const p = getMasterPreset("bypass")!;
    expect(p.settings.warmth).toBe(0);
    expect(p.settings.masterVolDb).toBe(0);
    expect(p.settings.width).toBe(0.5);
    expect(p.settings.consoleModel).toBe("clean");
  });

  it("no two presets are the same settings wearing different names", () => {
    const seen = MASTER_PRESETS.map((p) => JSON.stringify(p.settings));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("each keeps its own EQ band objects", () => {
    // Sharing them would mean dragging a node on one preset silently edits
    // every other preset in the list.
    const a = getMasterPreset("club")!.settings.eq;
    const b = getMasterPreset("tape")!.settings.eq;
    expect(a[0]).not.toBe(b[0]);
  });

  it("unknown ids return undefined", () => {
    expect(getMasterPreset("nope")).toBeUndefined();
  });
});

describe("quick fixes", () => {
  it("nudge rather than replace", () => {
    const start = { ...DEFAULT_MASTER, bass: 2, mid: -1 };
    const after = { ...start, ...quickFix("bass", start) };
    expect(after.bass).toBe(3);
    // Everything it did not name is untouched.
    expect(after.mid).toBe(-1);
    expect(after.warmth).toBe(start.warmth);
  });

  it("stack", () => {
    let s = { ...DEFAULT_MASTER, treble: 0 };
    s = { ...s, ...quickFix("high", s) };
    s = { ...s, ...quickFix("high", s) };
    expect(s.treble).toBe(2);
  });

  it("cannot be pushed past the end of a control", () => {
    let s = { ...DEFAULT_MASTER };
    for (let i = 0; i < 40; i++) {
      for (const id of QUICK_FIX_IDS) s = { ...s, ...quickFix(id, s) };
    }
    expect(s.bass).toBeLessThanOrEqual(TONE_RANGE_DB);
    expect(s.treble).toBeLessThanOrEqual(TONE_RANGE_DB);
    expect(s.mud).toBeGreaterThanOrEqual(-TONE_RANGE_DB);
    expect(s.width).toBeLessThanOrEqual(1);
    expect(s.monoLow).toBeLessThanOrEqual(1);
    expect(s.evenExciter).toBeLessThanOrEqual(1);
  });

  it("widening also tightens the bottom", () => {
    const start = { ...DEFAULT_MASTER };
    const change = quickFix("stereo", start);
    expect(change.width).toBeGreaterThan(start.width);
    expect(change.monoLow).toBeGreaterThan(start.monoLow);
  });

  it("every button has a note naming what it moves", () => {
    expect(QUICK_FIXES.map((q) => q.id).sort()).toEqual([...QUICK_FIX_IDS].sort());
    for (const q of QUICK_FIXES) expect(q.note.length).toBeGreaterThan(10);
  });
});

describe("audit", () => {
  const target = { targetLufs: -14 };

  it("says nothing when nothing is wrong", () => {
    const input = music(4, 0.3);
    const { l, r } = render(getMasterPreset("streaming")!.settings, input);
    const result = auditMaster([l, r], SR, target);
    expect(result.findings.map((f) => f.id)).not.toContain("phase");
    expect(result.findings.map((f) => f.id)).not.toContain("dc");
  });

  it("catches a true peak over the limit", () => {
    const n = SR;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 11999.5 * i) / SR + 0.78) * 0.999;
    const result = auditMaster([ch, ch], SR, target);
    const finding = result.findings.find((f) => f.id === "true-peak");
    expect(finding, "no true-peak finding").toBeDefined();
    expect(finding!.severity).toBe("problem");
    expect(result.measurements.truePeakDb).toBeGreaterThan(TRUE_PEAK_LIMIT_DB);
  });

  it("catches channels that cancel in mono", () => {
    const n = SR * 2;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      l[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.3;
      r[i] = -l[i];
    }
    const result = auditMaster([l, r], SR, target);
    expect(result.findings.map((f) => f.id)).toContain("phase");
    expect(result.measurements.correlation).toBeLessThan(CORRELATION_FLOOR);
  });

  it("catches a DC offset", () => {
    const n = SR * 2;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 300 * i) / SR) * 0.3 + 0.05;
    const result = auditMaster([ch, ch], SR, target);
    expect(result.findings.map((f) => f.id)).toContain("dc");
  });

  it("says when a master is louder than the target it will be normalised to", () => {
    const n = SR * 4;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.5;
    const result = auditMaster([ch, ch], SR, { targetLufs: -23 });
    expect(result.findings.map((f) => f.id)).toContain("too-loud");
  });

  it("says when a master is far below the target", () => {
    const n = SR * 4;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.01;
    const result = auditMaster([ch, ch], SR, { targetLufs: -14 });
    expect(result.findings.map((f) => f.id)).toContain("too-quiet");
  });

  it("reports silence as unmeasurable rather than as a score", () => {
    const silence = new Float32Array(SR * 2);
    const result = auditMaster([silence, silence], SR, target);
    expect(result.findings.map((f) => f.id)).toContain("silent");
    expect(result.measurements.integratedLufs).toBe(-Infinity);
  });

  it("every finding carries its measurement and a real fix", () => {
    const n = SR * 2;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      l[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.3 + 0.05;
      r[i] = -l[i];
    }
    const result = auditMaster([l, r], SR, target);
    expect(result.findings.length).toBeGreaterThan(0);
    for (const f of result.findings) {
      expect(f.measured, f.id).toMatch(/\d/);
      expect(f.fix.length, f.id).toBeGreaterThan(10);
    }
  });

  it("the face never claims the master is good", () => {
    // The whole reason this module exists rather than a 0-100 score.
    expect(AUDIT_MEANING.ok).toContain("ไม่ได้แปลว่ามาสเตอร์นี้ดี");
    expect(AUDIT_MEANING.ok).not.toMatch(/ยอดเยี่ยม|สมบูรณ์แบบ/);
  });

  it("severity is the worst finding", () => {
    const n = SR * 2;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.5;
    expect(auditMaster([ch, ch], SR, { targetLufs: -23 }).severity).toBe("caution");

    const bad = new Float32Array(n);
    const inverted = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      bad[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.3;
      inverted[i] = -bad[i];
    }
    expect(auditMaster([bad, inverted], SR, target).severity).toBe("problem");
  });
});

describe("metering the raw side of an A/B", () => {
  it("meterOnly fills the same meters process() does", () => {
    // Pressing RAW is exactly when an operator wants to read the two loudness
    // numbers against each other, so that is the worst possible moment for
    // the meter to go blank.
    const input = music(2, 0.4);
    const chain = new MasterChain(SR, { ...NEUTRAL, eq: defaultEqBands() });
    chain.meterOnly(input.l, input.r);
    const m = chain.meters;
    expect(m.peak).toBeGreaterThan(0);
    expect(Number.isFinite(m.shortTermLufs)).toBe(true);
  });

  it("agrees with what process() would have measured on the same samples", () => {
    const input = music(2, 0.4);
    const processed = new MasterChain(SR, { ...NEUTRAL, eq: defaultEqBands() });
    const out = { l: new Float32Array(input.l.length), r: new Float32Array(input.r.length) };
    processed.process(input.l, input.r, out.l, out.r);

    const metered = new MasterChain(SR, { ...NEUTRAL, eq: defaultEqBands() });
    metered.meterOnly(out.l, out.r);

    expect(metered.meters.shortTermLufs).toBeCloseTo(processed.meters.shortTermLufs, 6);
    expect(metered.meters.peak).toBeCloseTo(processed.meters.peak, 6);
  });

  it("does not change the samples it is given", () => {
    const input = music(0.5);
    const before = Array.from(input.l);
    new MasterChain(SR, DEFAULT_MASTER).meterOnly(input.l, input.r);
    expect(Array.from(input.l)).toEqual(before);
  });
});
