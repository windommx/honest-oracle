import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WORKLETS, buildWorklet } from "../../scripts/build-worklet";
import { loadWorkletFile } from "@/lib/synth-engine/worklet-harness";
import { peak, rms } from "@/lib/synth-engine/analysis";
import { DEFAULT_MASTER, NEUTRAL, defaultEqBands } from "./types";
import type { MasterStatus } from "./worklet-processor";

const TARGET = WORKLETS.find((w) => w.outfile.includes("master-worklet"))!;
const OUTFILE = join(process.cwd(), TARGET.outfile);
const SR = 48000;

function music(seconds: number, amp = 0.4): { left: Float32Array; right: Float32Array } {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const v = Math.sin(2 * Math.PI * 110 * t) * 0.6 + Math.sin(2 * Math.PI * 1500 * t) * 0.3;
    left[i] = v * amp;
    right[i] = v * 0.9 * amp;
  }
  return { left, right };
}

describe("the master worklet artifact cannot drift from its source", () => {
  it("public/master-worklet.js exists", () => {
    expect(existsSync(OUTFILE), `${OUTFILE} is missing — run \`npm run build:worklet\``).toBe(true);
  });

  it("matches a fresh bundle of lib/master-engine", async () => {
    const committed = readFileSync(OUTFILE, "utf8");
    const fresh = await buildWorklet(false, TARGET);
    expect(committed, "public/master-worklet.js is stale — run `npm run build:worklet`").toBe(fresh);
  }, 30_000);

  it("is a self-contained classic script", () => {
    const code = readFileSync(OUTFILE, "utf8");
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/^\s*export\s/m);
    expect(code).not.toMatch(/\brequire\(/);
  });

  it("registers the processor name the page loads", () => {
    expect(readFileSync(OUTFILE, "utf8")).toContain('registerProcessor("master-processor"');
  });

  it("carries the chain itself, not a reference to it", () => {
    const code = readFileSync(OUTFILE, "utf8");
    for (const marker of ["MasterChain", "ConsoleSaturator", "LoudnessMeter", "SlidingMinimum"]) {
      expect(code, `bundle is missing ${marker}`).toContain(marker);
    }
  });
});

describe("the bundle actually runs, in the harness", () => {
  // The harness exists so a worklet can be proven to work outside a browser.
  // This is the same file the page loads, run in Node.
  const load = () => loadWorkletFile(OUTFILE, { sampleRate: SR, blockSize: 128, channels: 2 });

  it("loads and names itself", () => {
    expect(load().name).toBe("master-processor");
  });

  it("is silent until a file is loaded and play is pressed", () => {
    const w = load();
    expect(peak(w.render(0.1).left)).toBe(0);
    w.send({ type: "transport", playing: true });
    expect(peak(w.render(0.1).left), "playing with nothing loaded").toBe(0);
  });

  it("plays a loaded buffer", () => {
    const w = load();
    const source = music(1);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "settings", settings: DEFAULT_MASTER });
    w.send({ type: "transport", playing: true });
    expect(rms(w.render(0.3).left)).toBeGreaterThan(0.01);
  });

  it("RAW returns the file itself, sample for sample", () => {
    // Not a neutral pass through the chain: that still adds the limiter's
    // lookahead, and an A/B where one side is milliseconds late sounds
    // different for that reason alone.
    const w = load();
    const source = music(0.5, 0.3);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "mastered", mastered: false });
    w.send({ type: "transport", playing: true });
    const out = w.render(0.2).left;
    for (let i = 0; i < out.length; i += 37) expect(out[i]).toBeCloseTo(source.left[i], 6);
  });

  it("MASTERED is audibly different from RAW", () => {
    const source = music(1, 0.3);
    const render = (mastered: boolean) => {
      const w = load();
      w.send({ type: "load", left: source.left, right: source.right });
      w.send({ type: "settings", settings: DEFAULT_MASTER });
      w.send({ type: "mastered", mastered });
      w.send({ type: "transport", playing: true });
      return w.render(0.5).left;
    };
    expect(rms(render(true))).not.toBeCloseTo(rms(render(false)), 3);
  });

  it("loops rather than falling silent at the end", () => {
    const w = load();
    const source = music(0.1);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "loop", loop: true });
    w.send({ type: "transport", playing: true });
    // Well past the end of a 0.1s file.
    const out = w.render(0.5);
    expect(rms(out.left.subarray(out.left.length - 2048))).toBeGreaterThan(0.01);
  });

  it("stops at the end when looping is off", () => {
    const w = load();
    const source = music(0.1);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "loop", loop: false });
    w.send({ type: "mastered", mastered: false });
    w.send({ type: "transport", playing: true });
    const out = w.render(0.5);
    expect(peak(out.left.subarray(out.left.length - 2048))).toBe(0);
  });

  it("reports the playhead from the audio thread", () => {
    const w = load();
    const source = music(2);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "transport", playing: true });
    w.render(0.5);
    const statuses = w.outbox.filter((m): m is MasterStatus => (m as MasterStatus)?.type === "status");
    expect(statuses.length).toBeGreaterThan(0);
    const last = statuses[statuses.length - 1];
    expect(last.frames).toBe(source.left.length);
    // Roughly half a second in, give or take the status interval.
    expect(last.frame).toBeGreaterThan(SR * 0.4);
    expect(last.frame).toBeLessThanOrEqual(SR * 0.55);
  });

  it("seeking jumps without playing the old position first", () => {
    const w = load();
    const n = SR;
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    // Loud first half, silent second half.
    for (let i = 0; i < n / 2; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * 0.8;
      right[i] = left[i];
    }
    w.send({ type: "load", left, right });
    w.send({ type: "mastered", mastered: false });
    w.send({ type: "transport", playing: true });
    w.render(0.1);
    w.send({ type: "seek", frame: Math.round(n * 0.6) });
    expect(peak(w.render(0.2).left)).toBe(0);
  });

  it("keeps up with real time by a wide margin", () => {
    const w = load();
    const source = music(2);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "settings", settings: DEFAULT_MASTER });
    w.send({ type: "transport", playing: true });
    const perBlock = w.measureBlockMs(400);
    expect(
      perBlock,
      `${perBlock.toFixed(3)}ms per block against a ${w.realtimeBudgetMs.toFixed(2)}ms budget`
    ).toBeLessThan(w.realtimeBudgetMs * 0.5);
  });

  it("never ends the node", () => {
    // Returning false from process() kills the processor permanently; a
    // stopped transport has to stay alive waiting for the next press.
    const w = load();
    expect(w.render(0.2).ended).toBe(false);
    w.send({ type: "load", ...music(0.05) });
    w.send({ type: "loop", loop: false });
    w.send({ type: "transport", playing: true });
    expect(w.render(0.5).ended).toBe(false);
  });

  it("a neutral settings message leaves the signal alone apart from latency", () => {
    const w = load();
    const source = music(0.5, 0.3);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "settings", settings: { ...NEUTRAL, eq: defaultEqBands() } });
    w.send({ type: "transport", playing: true });
    const out = w.render(0.3).left;
    const latency = Math.round(0.002 * SR);
    for (let i = 0; i < 8000; i += 53) {
      expect(out[i + latency]).toBeCloseTo(source.left[i], 5);
    }
  });
});

describe("the RAW side still reads its own loudness", () => {
  const load = () => loadWorkletFile(OUTFILE, { sampleRate: SR, blockSize: 128, channels: 2 });

  it("reports a loudness while playing RAW", () => {
    const w = load();
    const source = music(2, 0.4);
    w.send({ type: "load", left: source.left, right: source.right });
    w.send({ type: "mastered", mastered: false });
    w.send({ type: "transport", playing: true });
    w.render(1);
    const statuses = w.outbox.filter((m): m is MasterStatus => (m as MasterStatus)?.type === "status");
    const last = statuses[statuses.length - 1];
    expect(Number.isFinite(last.shortTermLufs), "RAW showed no loudness").toBe(true);
    expect(last.peak).toBeGreaterThan(0);
  });

  it("RAW and MASTERED both report, and differ", () => {
    const source = music(2, 0.4);
    const measure = (mastered: boolean) => {
      const w = load();
      w.send({ type: "load", left: source.left, right: source.right });
      w.send({ type: "settings", settings: DEFAULT_MASTER });
      w.send({ type: "mastered", mastered });
      w.send({ type: "transport", playing: true });
      w.render(1.5);
      const statuses = w.outbox.filter((m): m is MasterStatus => (m as MasterStatus)?.type === "status");
      return statuses[statuses.length - 1].shortTermLufs;
    };
    const raw = measure(false);
    const mastered = measure(true);
    expect(Number.isFinite(raw)).toBe(true);
    expect(Number.isFinite(mastered)).toBe(true);
    expect(Math.abs(mastered - raw)).toBeGreaterThan(0.2);
  });
});
