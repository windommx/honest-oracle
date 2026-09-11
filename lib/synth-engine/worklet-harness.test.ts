import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { OUTFILE } from "../../scripts/build-worklet";
import { countCalls, loadWorkletFile, loadWorkletSource, measureConstruction } from "./worklet-harness";
import { allFinite, dominantFrequency, onsetIntervals, peak, rms } from "./analysis";

const SR = 48000;
const source = () => readFileSync(OUTFILE, "utf8");

describe("harness — it runs a real worklet unmodified", () => {
  it("loads the module and reports the registered name", () => {
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    expect(w.name).toBe("synth-processor");
    expect(w.blockSize).toBe(128);
    expect(w.realtimeBudgetMs).toBeCloseTo((128 / SR) * 1000, 6);
  });

  it("renders silence before any note", () => {
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    expect(peak(w.render(0.1).left)).toBe(0);
  });

  it("renders sound after a note-on message", () => {
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    w.send({ type: "noteOn", note: 60, velocity: 1 });
    const { left, right } = w.render(0.3);
    expect(rms(left)).toBeGreaterThan(0.01);
    expect(allFinite(left) && allFinite(right)).toBe(true);
  });

  it("captures what the processor posts back", () => {
    // The status messages the meters read — observable here without a browser.
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    w.send({ type: "noteOn", note: 60, velocity: 1 });
    w.render(0.2);
    const statuses = w.outbox.filter((m): m is { type: string; activeVoices: number } =>
      typeof m === "object" && m !== null && (m as { type?: string }).type === "status"
    );
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.at(-1)!.activeVoices).toBe(1);
  });

  it("never lets the processor end its own node", () => {
    // Returning false from process() kills the node permanently; a synth with
    // no notes held must stay alive waiting for the next one.
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    expect(w.render(0.5).ended).toBe(false);
  });

  it("runs at a sample rate of its caller's choosing", () => {
    const w = loadWorkletSource(source(), { sampleRate: 44100 });
    w.send({ type: "patch", patch: { osc1Morph: 0, osc2Level: 0, filterCutoff: 18000, filterEnvAmount: 0, ampAttack: 0.001, ampSustain: 1, reverbMix: 0, delayMix: 0, chorusDepth: 0 } });
    w.send({ type: "noteOn", note: 69, velocity: 1 });
    const { left } = w.render(0.5);
    expect(dominantFrequency(left.slice(8000), 44100)).toBeCloseTo(440, -1);
  });
});

describe("harness — the checks a browser cannot make", () => {
  it("a block renders well inside its real-time deadline", () => {
    // The measurement that catches a processor which "works" but drops out
    // under polyphony. Generous here because CI machines vary; the point is to
    // catch an order-of-magnitude regression, not to benchmark.
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    for (let n = 0; n < 8; n++) w.send({ type: "noteOn", note: 48 + n * 3, velocity: 1 });
    const ms = w.measureBlockMs(200);
    expect(ms, `${ms.toFixed(3)}ms/block vs ${w.realtimeBudgetMs.toFixed(2)}ms budget`).toBeLessThan(
      w.realtimeBudgetMs
    );
  });

  it("construction does not stall the audio thread", () => {
    // Charged to the audio thread the moment the node is created, and invisible
    // to every other kind of test: the instrument works, it just takes seconds
    // to appear. Table-building constructors are the usual cause.
    const { constructMs } = measureConstruction(source(), { sampleRate: SR });
    expect(constructMs, `${constructMs.toFixed(1)}ms to construct`).toBeLessThan(250);
  });

  it("output stays inside full scale under a dense chord", () => {
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    w.send({ type: "patch", patch: { volume: 1, unisonVoices: 8, saturation: 1, reverbMix: 1, delayMix: 1, delayFeedback: 0.9, filterResonance: 1.2, compMakeup: 12 } });
    for (let n = 0; n < 16; n++) w.send({ type: "noteOn", note: 36 + n * 2, velocity: 1 });
    const { left, right } = w.render(1);
    expect(peak(left)).toBeLessThanOrEqual(1);
    expect(peak(right)).toBeLessThanOrEqual(1);
    expect(allFinite(left)).toBe(true);
  });

  it("the pulse clock holds its period", () => {
    const w = loadWorkletFile(OUTFILE, { sampleRate: SR });
    w.send({ type: "patch", patch: { ampAttack: 0, ampDecay: 0.05, ampSustain: 0, ampRelease: 0.02, reverbMix: 0, delayMix: 0 } });
    w.send({ type: "pulse", pulse: { enabled: true, bpm: 120, note: 72, gateSeconds: 0.05 } });
    const gaps = onsetIntervals(w.render(4).left);
    expect(gaps.length).toBeGreaterThan(4);
    for (const gap of gaps) expect(Math.abs(gap - SR / 2)).toBeLessThan(200);
  });

  it("countCalls tallies a function without changing what it does", () => {
    // Timing depends on the machine; a call count does not.
    const plain = loadWorkletFile(OUTFILE, { sampleRate: SR });
    plain.send({ type: "noteOn", note: 60, velocity: 1 });
    const before = rms(plain.render(0.2).left);

    let after = 0;
    const calls = countCalls(source(), "blep", (w) => {
      w.send({ type: "noteOn", note: 60, velocity: 1 });
      after = rms(w.render(0.2).left);
    }, { sampleRate: SR });

    expect(calls).toBeGreaterThan(0);
    expect(after).toBeCloseTo(before, 10); // instrumentation changed nothing
  });

  it("rejects a file that is not a worklet module", () => {
    expect(() => loadWorkletSource("const x = 1;")).toThrow(/registerProcessor/);
  });
});
