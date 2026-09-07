import { describe, it, expect } from "vitest";
import {
  AROUSAL_BPM,
  BREATH_PATTERNS,
  TARGET_BPM,
  beatSeconds,
  breathsPerMinute,
  cycleSeconds,
  cyclesIn,
  isoRamp,
  phaseAt,
  planForBand,
} from "./music";

describe("iso-principle ramp", () => {
  it("meets the listener where they are and arrives where it promised", () => {
    // The whole point of the iso-principle: segment 0 is the CURRENT state, not
    // the target. An app that opens at 62 BPM for an agitated listener has
    // skipped the technique it claims to implement.
    const plan = isoRamp(112, 62, 20, 5);
    expect(plan.segments[0].bpm).toBe(112);
    expect(plan.segments[plan.segments.length - 1].bpm).toBe(62);
  });

  it("moves monotonically toward the target", () => {
    const plan = isoRamp(112, 62, 20, 6);
    const bpms = plan.segments.map((s) => s.bpm);
    for (let i = 1; i < bpms.length; i++) expect(bpms[i]).toBeLessThanOrEqual(bpms[i - 1]);
  });

  it("ramps upward just as correctly", () => {
    const plan = isoRamp(60, 90, 10, 4);
    const bpms = plan.segments.map((s) => s.bpm);
    expect(bpms[0]).toBe(60);
    expect(bpms[bpms.length - 1]).toBe(90);
    for (let i = 1; i < bpms.length; i++) expect(bpms[i]).toBeGreaterThanOrEqual(bpms[i - 1]);
  });

  it("is deterministic", () => {
    expect(isoRamp(100, 62, 25, 5)).toEqual(isoRamp(100, 62, 25, 5));
  });

  it("segments tile the session with no gap and no overlap", () => {
    const plan = isoRamp(100, 62, 30, 6);
    expect(plan.segments[0].startMin).toBe(0);
    expect(plan.segments[plan.segments.length - 1].endMin).toBeCloseTo(30, 5);
    for (let i = 1; i < plan.segments.length; i++) {
      expect(plan.segments[i].startMin).toBeCloseTo(plan.segments[i - 1].endMin, 5);
    }
  });

  it("emits whole-number BPM — a metronome cannot act on 87.4", () => {
    for (const s of isoRamp(113, 61, 17, 7).segments) expect(Number.isInteger(s.bpm)).toBe(true);
  });

  it("discloses the rule that produced the ramp", () => {
    // The ramp is an interpolation we chose, not an established optimum, and the
    // plan says so in its own text.
    const plan = isoRamp(96, 62, 20);
    expect(plan.methodTh).toContain("iso-principle");
    expect(plan.methodTh).toContain("ไม่ใช่เส้นโค้งที่พิสูจน์แล้วว่าดีที่สุด");
  });

  it("clamps absurd input instead of emitting an unusable plan", () => {
    const plan = isoRamp(9000, -50, 9999, 999);
    expect(plan.startBpm).toBeLessThanOrEqual(200);
    expect(plan.targetBpm).toBeGreaterThanOrEqual(40);
    expect(plan.totalMinutes).toBeLessThanOrEqual(120);
    expect(plan.segments.length).toBeLessThanOrEqual(12);
  });

  it("always produces at least two segments — match and arrive", () => {
    expect(isoRamp(90, 62, 5, 1).segments.length).toBeGreaterThanOrEqual(2);
  });
});

describe("arousal → starting tempo (a disclosed heuristic)", () => {
  it("opens faster the more aroused the band", () => {
    expect(AROUSAL_BPM.severe).toBeGreaterThan(AROUSAL_BPM.moderate);
    expect(AROUSAL_BPM.moderate).toBeGreaterThan(AROUSAL_BPM.mild);
    expect(AROUSAL_BPM.mild).toBeGreaterThan(AROUSAL_BPM.minimal);
  });

  it("every band opens above the relaxation target, so there is always a ramp", () => {
    for (const [band, bpm] of Object.entries(AROUSAL_BPM)) {
      expect(bpm, `${band} opens at or below target — nothing to entrain`).toBeGreaterThan(TARGET_BPM);
    }
  });

  it("planForBand routes the band through the ramp", () => {
    const plan = planForBand("severe", 30);
    expect(plan.startBpm).toBe(AROUSAL_BPM.severe);
    expect(plan.targetBpm).toBe(TARGET_BPM);
  });
});

describe("beatSeconds", () => {
  it("inverts BPM to seconds per beat", () => {
    expect(beatSeconds(60)).toBe(1);
    expect(beatSeconds(120)).toBe(0.5);
  });
});

describe("breath patterns", () => {
  it("cyclic sighing has a longer exhale than its inhales combined", () => {
    // That asymmetry IS the technique — a symmetric 'cyclic sighing' would be a
    // different practice wearing the name of the one with a trial behind it.
    const p = BREATH_PATTERNS["cyclic-sighing"];
    const inhale = p.phases.filter((x) => x.kind.startsWith("inhale")).reduce((s, x) => s + x.seconds, 0);
    const exhale = p.phases.filter((x) => x.kind === "exhale").reduce((s, x) => s + x.seconds, 0);
    expect(exhale).toBeGreaterThan(inhale);
  });

  it("resonance breathing paces about 6 breaths per minute", () => {
    expect(breathsPerMinute(BREATH_PATTERNS.resonance)).toBeCloseTo(6, 1);
  });

  it("box breathing is four equal phases", () => {
    const secs = BREATH_PATTERNS.box.phases.map((p) => p.seconds);
    expect(secs).toEqual([4, 4, 4, 4]);
  });

  it("every pattern states where it comes from", () => {
    for (const p of Object.values(BREATH_PATTERNS)) {
      expect(p.sourceTh.length, `${p.id}`).toBeGreaterThan(10);
      expect(p.phases.length).toBeGreaterThan(1);
      for (const ph of p.phases) expect(ph.seconds).toBeGreaterThan(0);
    }
  });

  it("box breathing admits it has no trial behind it", () => {
    expect(BREATH_PATTERNS.box.sourceTh).toContain("ไม่มี RCT");
  });

  it("counts whole cycles only — half a breath is not a breath", () => {
    const p = BREATH_PATTERNS["cyclic-sighing"]; // 9s per cycle
    expect(cycleSeconds(p)).toBe(9);
    expect(cyclesIn(p, 5)).toBe(33); // 300s / 9s = 33.33 → 33
  });
});

describe("phaseAt — the pacer's clock", () => {
  const p = BREATH_PATTERNS["cyclic-sighing"]; // 2s inhale, 1s top-up, 6s exhale

  it("walks the phases in order", () => {
    expect(phaseAt(p, 0).phase.kind).toBe("inhale");
    expect(phaseAt(p, 1.9).phase.kind).toBe("inhale");
    expect(phaseAt(p, 2).phase.kind).toBe("inhale-top");
    expect(phaseAt(p, 3).phase.kind).toBe("exhale");
    expect(phaseAt(p, 8.9).phase.kind).toBe("exhale");
  });

  it("wraps to the next cycle", () => {
    expect(phaseAt(p, 9).phase.kind).toBe("inhale");
    expect(phaseAt(p, 900).phase.kind).toBe("inhale");
  });

  it("reports progress through the current phase", () => {
    expect(phaseAt(p, 0).progress).toBe(0);
    expect(phaseAt(p, 1).progress).toBeCloseTo(0.5, 5);
    expect(phaseAt(p, 6).progress).toBeCloseTo(0.5, 5); // 3s into a 6s exhale
  });

  it("survives a negative clock rather than crashing the player", () => {
    expect(phaseAt(p, -1).phase.kind).toBe("exhale");
  });
});
