import { describe, it, expect } from "vitest";
import { ALL_KNOBS, PANELS } from "./_panels";
import { GROUP_COLOR, GROUP_LABEL } from "./_tokens";
import { DEFAULT_MASTER, NEUTRAL, type MasterSettings } from "@/lib/master-engine/types";

describe("the control surface covers the engine", () => {
  it("every knob drives a real setting", () => {
    for (const knob of ALL_KNOBS) {
      expect(DEFAULT_MASTER, `${knob.label} writes a key that does not exist`).toHaveProperty(knob.key);
      expect(typeof DEFAULT_MASTER[knob.key], knob.label).toBe("number");
    }
  });

  it("every numeric setting has a control, or is deliberately elsewhere", () => {
    // A setting with no way to change it is dead weight; one that only a
    // preset can reach is worse, because the page then lies about its state.
    const covered = new Set<string>(ALL_KNOBS.map((k) => k.key));
    const numericKeys = (Object.keys(NEUTRAL) as (keyof MasterSettings)[]).filter(
      (k) => typeof NEUTRAL[k] === "number"
    );
    const missing = numericKeys.filter((k) => !covered.has(k as never));
    expect(missing, `no control for: ${missing.join(", ")}`).toEqual([]);
  });

  it("each knob's default sits inside its range", () => {
    for (const knob of ALL_KNOBS) {
      const value = DEFAULT_MASTER[knob.key];
      expect(value, `${knob.label} default ${value} is outside ${knob.min}..${knob.max}`)
        .toBeGreaterThanOrEqual(knob.min);
      expect(value, knob.label).toBeLessThanOrEqual(knob.max);
    }
  });

  it("no setting is driven by two knobs", () => {
    const keys = ALL_KNOBS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every knob explains itself", () => {
    for (const knob of ALL_KNOBS) {
      expect(knob.hint.length, `${knob.label} has no hint`).toBeGreaterThan(10);
      expect(knob.label.length).toBeGreaterThan(0);
    }
  });

  it("every panel group has a colour and a label", () => {
    for (const panel of PANELS) {
      expect(GROUP_COLOR[panel.group], `no colour for ${panel.group}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(GROUP_LABEL[panel.group], `no label for ${panel.group}`).toBeTruthy();
    }
  });

  it("panels are in signal order", () => {
    // The page reads as a chain only if the panels are in the order the audio
    // meets them, which is the order lib/master-engine/chain.ts fixes.
    expect(PANELS.map((p) => p.group)).toEqual(["tone", "dynamics", "character", "stereo", "output"]);
  });
});
