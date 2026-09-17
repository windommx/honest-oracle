import { describe, it, expect } from "vitest";
import { EqStage, eqSections, responseCurve, responseDbAt } from "./eq";
import {
  DEFAULT_MASTER,
  HI_CUT_HZ,
  LOW_CUT_HZ,
  NEUTRAL,
  TONE_BASS_HZ,
  TONE_MUD_HZ,
  TONE_TREBLE_HZ,
  defaultEqBands,
  type MasterSettings,
} from "./types";

const SR = 48000;
const settings = (over: Partial<MasterSettings> = {}): MasterSettings => ({
  ...NEUTRAL,
  eq: defaultEqBands(),
  ...over,
});

/** Gain the real stage applies to a steady sine, measured by RMS. */
function measuredGainDb(s: MasterSettings, freq: number): number {
  const stage = new EqStage(SR);
  stage.setSettings(s);
  const settle = SR;
  const measure = SR / 2;
  let sumIn = 0;
  let sumOut = 0;
  for (let i = 0; i < settle + measure; i++) {
    const x = Math.sin((2 * Math.PI * freq * i) / SR);
    const y = stage.tickLeft(x);
    if (i >= settle) {
      sumIn += x * x;
      sumOut += y * y;
    }
  }
  return 10 * Math.log10(sumOut / sumIn);
}

const drawnDb = (s: MasterSettings, freq: number) => responseDbAt(eqSections(s, SR), freq, SR);

describe("the curve on screen is the audio", () => {
  const scenarios: { name: string; s: MasterSettings; probes: number[] }[] = [
    { name: "everything flat", s: settings(), probes: [50, 200, 1000, 8000] },
    {
      name: "the default master",
      s: { ...DEFAULT_MASTER, eq: defaultEqBands() },
      probes: [40, 90, 320, 1400, 8000, 15000],
    },
    {
      name: "tone stack pushed hard",
      s: settings({ bass: 5, mud: -5, mid: 3, treble: 4 }),
      probes: [60, TONE_MUD_HZ, 1400, 12000],
    },
    {
      name: "overlapping parametric bands",
      s: settings({
        eq: [
          { freq: 40, gainDb: 3, q: 0.7, kind: "lowShelf", enabled: true },
          { freq: 90, gainDb: -4, q: 1.4, kind: "peaking", enabled: true },
          { freq: 140, gainDb: 5, q: 2, kind: "peaking", enabled: true },
          { freq: 3000, gainDb: -3, q: 1, kind: "peaking", enabled: true },
          { freq: 9000, gainDb: 4, q: 0.7, kind: "highShelf", enabled: true },
        ],
      }),
      probes: [40, 90, 140, 400, 3000, 12000],
    },
    { name: "both cuts engaged", s: settings({ lowCut: true, hiCut: true }), probes: [20, 60, 1000, 16000] },
  ];

  for (const { name, s, probes } of scenarios) {
    it(`${name}: drawn dB equals measured dB`, () => {
      for (const f of probes) {
        const drawn = drawnDb(s, f);
        const measured = measuredGainDb(s, f);
        expect(measured, `${name} at ${f}Hz — drawn ${drawn.toFixed(2)}, measured ${measured.toFixed(2)}`)
          .toBeCloseTo(drawn, 2);
      }
    });
  }
});

describe("cuts", () => {
  it("the low cut is 24dB/oct, not 12", () => {
    // One octave below the corner a 4th-order Butterworth is ~24dB down; a
    // single biquad would only be ~12.
    const s = settings({ lowCut: true });
    const atCorner = drawnDb(s, LOW_CUT_HZ);
    const octaveBelow = drawnDb(s, LOW_CUT_HZ / 2);
    expect(atCorner).toBeCloseTo(-3, 0);
    expect(atCorner - octaveBelow).toBeGreaterThan(20);
  });

  it("the hi cut leaves the midrange alone", () => {
    expect(drawnDb(settings({ hiCut: true }), 1000)).toBeCloseTo(0, 1);
    expect(drawnDb(settings({ hiCut: true }), HI_CUT_HZ)).toBeCloseTo(-3, 0);
  });

  it("off means off", () => {
    expect(drawnDb(settings({ lowCut: false }), 20)).toBe(0);
  });
});

describe("tone stack", () => {
  it("each control moves its own region and not the others", () => {
    const only = (k: "bass" | "mud" | "mid" | "treble") => settings({ [k]: 5 } as Partial<MasterSettings>);
    expect(drawnDb(only("bass"), TONE_BASS_HZ / 2)).toBeGreaterThan(3);
    expect(drawnDb(only("bass"), 5000)).toBeCloseTo(0, 1);
    expect(drawnDb(only("treble"), 16000)).toBeGreaterThan(3);
    expect(drawnDb(only("treble"), 100)).toBeCloseTo(0, 1);
    expect(drawnDb(only("mud"), TONE_MUD_HZ)).toBeCloseTo(5, 5);
    expect(drawnDb(only("mid"), 1400)).toBeCloseTo(5, 5);
  });

  it("Mud cuts when turned down — it is the only negative-by-default control", () => {
    expect(DEFAULT_MASTER.mud).toBeLessThan(0);
    expect(drawnDb({ ...DEFAULT_MASTER, eq: defaultEqBands() }, TONE_MUD_HZ)).toBeLessThan(0);
  });
});

describe("EqStage", () => {
  it("passes audio through untouched when nothing is engaged", () => {
    const stage = new EqStage(SR);
    stage.setSettings(settings());
    expect(stage.currentSections).toHaveLength(0);
    for (let i = 0; i < 1000; i++) {
      const x = Math.sin(i / 7) * 0.5;
      expect(stage.tickLeft(x)).toBe(x);
    }
  });

  it("leaves out bands that are flat or disabled", () => {
    const bands = defaultEqBands();
    bands[0].gainDb = 4;
    bands[1].gainDb = 4;
    bands[1].enabled = false;
    expect(eqSections(settings({ eq: bands }), SR)).toHaveLength(1);
  });

  it("does not click when a knob moves", () => {
    // Rebuilding the filters from scratch on every knob move discards their
    // state, and the discontinuity is an audible tick.
    const stage = new EqStage(SR);
    const bands = defaultEqBands();
    bands[2].gainDb = 6;
    stage.setSettings(settings({ eq: bands }));
    let last = 0;
    for (let i = 0; i < 4800; i++) last = stage.tickLeft(Math.sin((2 * Math.PI * 220 * i) / SR));

    bands[2].gainDb = 6.5;
    stage.setSettings(settings({ eq: bands }));
    const next = stage.tickLeft(Math.sin((2 * Math.PI * 220 * 4800) / SR));
    expect(Math.abs(next - last)).toBeLessThan(0.1);
  });

  it("keeps the two channels independent", () => {
    const stage = new EqStage(SR);
    stage.setSettings(settings({ bass: 6, lowCut: true }));
    for (let i = 0; i < 2000; i++) stage.tickLeft(Math.sin(i / 3));
    expect(stage.tickRight(0)).toBe(0);
  });

  it("stays finite on a long loud run", () => {
    const stage = new EqStage(SR);
    stage.setSettings({ ...DEFAULT_MASTER, eq: defaultEqBands(), hiCut: true });
    let last = 0;
    for (let i = 0; i < SR * 3; i++) last = stage.tickLeft(Math.sin(i / 2.3) * 0.99);
    expect(Number.isFinite(last)).toBe(true);
  });
});

describe("responseCurve", () => {
  it("is log-spaced across the audible band", () => {
    const curve = responseCurve(eqSections(settings({ bass: 3 }), SR), SR, 100);
    expect(curve).toHaveLength(100);
    expect(curve[0].freq).toBeCloseTo(20, 5);
    expect(curve[99].freq).toBeLessThanOrEqual(20000);
    const firstOctave = curve.findIndex((p) => p.freq >= 40);
    const secondOctave = curve.findIndex((p) => p.freq >= 80);
    // Equal point counts per octave is what "log-spaced" means.
    expect(Math.abs(secondOctave - 2 * firstOctave)).toBeLessThanOrEqual(1);
  });

  it("never asks for a frequency above Nyquist", () => {
    for (const rate of [8000, 22050, 44100]) {
      const curve = responseCurve(eqSections(settings({ treble: 4 }), rate), rate);
      for (const p of curve) {
        expect(p.freq).toBeLessThan(rate / 2);
        expect(Number.isFinite(p.db)).toBe(true);
      }
    }
  });
});
