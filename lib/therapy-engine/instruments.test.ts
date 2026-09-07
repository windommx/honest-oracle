import { describe, it, expect } from "vitest";
import { INSTRUMENTS, INSTRUMENT_LIST, getInstrument, WITHHELD_INSTRUMENTS } from "./instruments";

describe("instruments — the published item banks", () => {
  it("GAD-7 has exactly 7 items and PHQ-9 exactly 9", () => {
    // The item count IS the instrument's identity. A GAD-7 with 6 items scored
    // against GAD-7 cut-points would be a different, unvalidated test wearing
    // the name of a validated one.
    expect(INSTRUMENTS.gad7.items).toHaveLength(7);
    expect(INSTRUMENTS.phq9.items).toHaveLength(9);
  });

  it("declared min/max match what the items can actually sum to", () => {
    for (const inst of INSTRUMENT_LIST) {
      const values = inst.options.map((o) => o.value);
      expect(inst.min).toBe(inst.items.length * Math.min(...values));
      expect(inst.max).toBe(inst.items.length * Math.max(...values));
    }
  });

  it("item numbers are 1..n in order, with no gaps", () => {
    for (const inst of INSTRUMENT_LIST) {
      expect(inst.items.map((i) => i.n)).toEqual(inst.items.map((_, idx) => idx + 1));
    }
  });

  it("both instruments carry a source and a licence statement", () => {
    // Shipping an instrument we have no right to ship is the same class of
    // failure as printing a score we cannot compute.
    for (const inst of INSTRUMENT_LIST) {
      expect(inst.source.authors.length).toBeGreaterThan(0);
      expect(inst.source.year).toBeGreaterThan(1990);
      expect(inst.licence).toMatch(/public domain/i);
    }
  });

  it("every item has both English and Thai wording", () => {
    for (const inst of INSTRUMENT_LIST) {
      for (const item of inst.items) {
        expect(item.en.length, `${inst.id} item ${item.n} EN`).toBeGreaterThan(0);
        expect(item.th.length, `${inst.id} item ${item.n} TH`).toBeGreaterThan(0);
      }
    }
  });

  it("PHQ-9 item 9 is the only safety-critical item", () => {
    // Item 9 asks about thoughts of self-harm. safety.ts acts on it regardless
    // of the total score, so its flag must be exactly where it is meant to be.
    const critical = INSTRUMENT_LIST.flatMap((i) => i.items.filter((it) => it.safetyCritical).map((it) => `${i.id}:${it.n}`));
    expect(critical).toEqual(["phq9:9"]);
  });

  it("the frequency scale is 0..3 on both instruments", () => {
    for (const inst of INSTRUMENT_LIST) {
      expect(inst.options.map((o) => o.value)).toEqual([0, 1, 2, 3]);
    }
  });

  it("getInstrument returns the requested instrument", () => {
    expect(getInstrument("gad7").name).toBe("GAD-7");
    expect(getInstrument("phq9").name).toBe("PHQ-9");
  });

  it("withheld instruments each state a reason", () => {
    // The absence of PSQI/ISI/STAI is a licensing decision, and the app says so.
    expect(WITHHELD_INSTRUMENTS.length).toBeGreaterThan(0);
    for (const w of WITHHELD_INSTRUMENTS) expect(w.reasonTh.length).toBeGreaterThan(10);
  });
});
