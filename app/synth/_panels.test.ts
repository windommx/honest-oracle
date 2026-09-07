import { describe, it, expect } from "vitest";
import { ALL_KNOBS, PANELS, type NumericPatchKey } from "./_panels";
import { DEFAULT_PATCH } from "@/lib/synth-engine/presets";
import { PRESETS } from "@/lib/synth-engine/presets";

/** Patch fields that are numbers — every one should be reachable from the UI. */
const NUMERIC_KEYS = (Object.keys(DEFAULT_PATCH) as (keyof typeof DEFAULT_PATCH)[]).filter(
  (k) => typeof DEFAULT_PATCH[k] === "number"
) as NumericPatchKey[];

describe("control surface — every parameter is reachable", () => {
  it("no numeric patch field is missing a control", () => {
    // A knob nobody can reach is a parameter that only presets can set, which
    // is how a synth ends up with a hidden sound nobody can dial in.
    const covered = new Set(ALL_KNOBS.map((k) => k.key));
    const missing = NUMERIC_KEYS.filter((k) => !covered.has(k));
    expect(missing, `unreachable parameters: ${missing.join(", ")}`).toEqual([]);
  });

  it("no knob points at a field that does not exist", () => {
    for (const k of ALL_KNOBS) {
      expect(DEFAULT_PATCH[k.key], `knob "${k.label}" targets missing field ${k.key}`).toBeTypeOf("number");
    }
  });

  it("each parameter appears exactly once", () => {
    const keys = ALL_KNOBS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("control surface — ranges are usable", () => {
  it("min is below max on every knob", () => {
    for (const k of ALL_KNOBS) expect(k.min, k.label).toBeLessThan(k.max);
  });

  it("a logarithmic knob never spans zero", () => {
    // log(0) is -Infinity; a log knob whose minimum is 0 pins to one end.
    for (const k of ALL_KNOBS) if (k.log) expect(k.min, k.label).toBeGreaterThan(0);
  });

  it("the default patch sits inside every knob's range", () => {
    for (const k of ALL_KNOBS) {
      const v = DEFAULT_PATCH[k.key];
      expect(v, `${k.label} default ${v} is outside ${k.min}..${k.max}`).toBeGreaterThanOrEqual(k.min);
      expect(v, `${k.label} default ${v} is outside ${k.min}..${k.max}`).toBeLessThanOrEqual(k.max);
    }
  });

  it("every preset sits inside every knob's range", () => {
    // A preset outside a knob's range would snap when touched, silently
    // changing the sound the moment a user reaches for it.
    for (const preset of PRESETS) {
      for (const k of ALL_KNOBS) {
        const v = preset.patch[k.key];
        expect(v, `preset "${preset.id}" ${k.key}=${v} outside ${k.min}..${k.max}`).toBeGreaterThanOrEqual(k.min);
        expect(v, `preset "${preset.id}" ${k.key}=${v} outside ${k.min}..${k.max}`).toBeLessThanOrEqual(k.max);
      }
    }
  });

  it("panels are non-empty and titled", () => {
    for (const p of PANELS) {
      expect(p.knobs.length, p.title).toBeGreaterThan(0);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });
});
