import { describe, it, expect } from "vitest";
import {
  MAX_MASTER_SECONDS,
  RENDER_CHUNK_FRAMES,
  renderMaster,
  waveformPeaks,
  type RenderProgress,
} from "./offline";
import { MasterChain, applyFades } from "./chain";
import { MASTER_PRESETS, getMasterPreset } from "./presets";
import { DEFAULT_MASTER, NEUTRAL, dbToGain, defaultEqBands } from "./types";
import { encodeWav, decodeWav } from "@/lib/audio-io/wav";
import { allFinite, peak, rms } from "@/lib/synth-engine/analysis";

const SR = 48000;

function music(seconds = 3, amp = 0.4): { left: Float32Array; right: Float32Array } {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const beat = Math.exp(-((t * 2) % 1) * 10);
    const v =
      Math.sin(2 * Math.PI * 55 * t) * 0.5 * beat +
      Math.sin(2 * Math.PI * 440 * t) * 0.3 +
      Math.sin(2 * Math.PI * 6000 * t) * 0.12;
    left[i] = v * amp;
    right[i] = (v * 0.9 + Math.sin(2 * Math.PI * 2800 * t) * 0.08) * amp;
  }
  return { left, right };
}

const render = (over = {}, input = music()) =>
  renderMaster({ ...input, sampleRate: SR, settings: { ...DEFAULT_MASTER, ...over } });

describe("renderMaster", () => {
  it("returns exactly as many samples as it was given", () => {
    const input = music(2);
    const out = render({}, input);
    expect(out.left.length).toBe(input.left.length);
    expect(out.right.length).toBe(input.right.length);
    expect(out.seconds).toBeCloseTo(2, 5);
  });

  it("lines up with the input rather than arriving late", () => {
    // The chain has a lookahead; leaving it in the file makes the master flam
    // against the original the moment anyone compares them.
    const input = music(1, 0.3);
    const out = renderMaster({
      ...input,
      sampleRate: SR,
      settings: { ...NEUTRAL, eq: defaultEqBands() },
    });
    for (let i = 100; i < input.left.length - 100; i += 271) {
      expect(out.left[i], `sample ${i}`).toBeCloseTo(input.left[i], 5);
    }
  });

  it("is deterministic", () => {
    const input = music(1);
    expect(Array.from(render({}, input).left)).toEqual(Array.from(render({}, input).left));
  });

  it("holds the ceiling under every preset", () => {
    const hot = music(1.5, 0.95);
    for (const preset of MASTER_PRESETS) {
      const out = renderMaster({ ...hot, sampleRate: SR, settings: preset.settings });
      const ceiling = dbToGain(preset.settings.ceilingDb);
      expect(Math.max(peak(out.left), peak(out.right)), preset.id).toBeLessThanOrEqual(ceiling + 1e-6);
      expect(allFinite(out.left), preset.id).toBe(true);
    }
  });

  it("measures the bytes it is about to write, not a passing meter reading", () => {
    const out = render({}, music(4));
    expect(Number.isFinite(out.integratedLufs)).toBe(true);
    expect(Number.isFinite(out.truePeakDb)).toBe(true);
    expect(out.audit.measurements.integratedLufs).toBe(out.integratedLufs);
  });

  it("applies fades to the finished file", () => {
    const out = render({ fadeInSeconds: 0.5, fadeOutSeconds: 0.5 }, music(3));
    expect(Math.abs(out.left[0])).toBeLessThan(1e-4);
    expect(Math.abs(out.left[out.left.length - 1])).toBeLessThan(1e-4);
    expect(rms(out.left.subarray(SR, SR * 2))).toBeGreaterThan(0.01);
  });

  it("a louder preset measures louder, in LUFS not in peak", () => {
    const input = music(4, 0.5);
    const quiet = renderMaster({ ...input, sampleRate: SR, settings: getMasterPreset("broadcast")!.settings });
    const loud = renderMaster({ ...input, sampleRate: SR, settings: getMasterPreset("club")!.settings });
    expect(loud.integratedLufs).toBeGreaterThan(quiet.integratedLufs + 4);
  });

  it("refuses a file long enough to take the tab down", () => {
    // A low but legal rate is the cheap way to exceed the cap without
    // allocating a gigabyte to prove it.
    const rate = 8000;
    expect(() =>
      renderMaster({
        left: new Float32Array(rate),
        right: new Float32Array(rate),
        sampleRate: rate,
        settings: DEFAULT_MASTER,
      })
    ).not.toThrow();
    const tooLong = rate * (MAX_MASTER_SECONDS + 10);
    expect(() =>
      renderMaster({
        left: { length: tooLong } as unknown as Float32Array,
        right: { length: tooLong } as unknown as Float32Array,
        sampleRate: rate,
        settings: DEFAULT_MASTER,
      })
    ).toThrow(RangeError);
  });

  it("refuses an impossible sample rate rather than failing deep in the maths", () => {
    // A WAV header can declare anything. Every time constant in the chain is
    // seconds x sampleRate, so a zero reaches the engine as an allocation
    // failure several layers from the cause.
    for (const rate of [0, -48000, 3, Number.NaN, 1e9]) {
      expect(() =>
        renderMaster({
          left: new Float32Array(100),
          right: new Float32Array(100),
          sampleRate: rate,
          settings: DEFAULT_MASTER,
        }),
        `rate ${rate}`
      ).toThrow(RangeError);
    }
  });

  it("renders much faster than the audio it processes", () => {
    const input = music(8, 0.5);
    const out = renderMaster({ ...input, sampleRate: SR, settings: getMasterPreset("tape")!.settings });
    expect(
      out.elapsedMs / 1000,
      `${(out.elapsedMs / 1000).toFixed(2)}s for ${out.seconds}s of audio`
    ).toBeLessThan(out.seconds / 2);
  });

  it("survives a mono-ish file where both channels are identical", () => {
    const n = SR;
    const same = new Float32Array(n);
    for (let i = 0; i < n; i++) same[i] = Math.sin((2 * Math.PI * 300 * i) / SR) * 0.4;
    const out = renderMaster({ left: same, right: Float32Array.from(same), sampleRate: SR, settings: DEFAULT_MASTER });
    expect(allFinite(out.left)).toBe(true);
    expect(out.audit.measurements.correlation).toBeCloseTo(1, 2);
  });

  it("survives an empty file instead of throwing", () => {
    const out = renderMaster({
      left: new Float32Array(0),
      right: new Float32Array(0),
      sampleRate: SR,
      settings: DEFAULT_MASTER,
    });
    expect(out.left.length).toBe(0);
    expect(out.audit.severity).toBe("problem");
  });

  it("round-trips through a WAV file unchanged", () => {
    const out = render({}, music(1));
    const decoded = decodeWav(encodeWav([out.left, out.right], SR, 24));
    expect(decoded.sampleRate).toBe(SR);
    for (let i = 0; i < out.left.length; i += 101) {
      expect(decoded.channels[0][i]).toBeCloseTo(out.left[i], 6);
    }
  });
});

describe("chunking the render is a reporting decision, not an audio one", () => {
  // The render runs in chunks so it can report where it is. That is only
  // sound if the chunk boundary is invisible — the chain is sample-serial
  // and holds every filter's state internally, so it should be, but "should
  // be" is exactly the claim that turns out false when one stage quietly
  // does something per-call. So this runs the same input through one
  // unbroken process() and demands the bytes match.
  const settings = { ...DEFAULT_MASTER };
  const input = music(4.2); // several chunks, and a partial one at the end

  function unchunked(): { left: Float32Array; right: Float32Array } {
    const chain = new MasterChain(SR, settings);
    const latency = chain.latencySamples;
    const frames = input.left.length;
    const padded = frames + latency;
    const inL = new Float32Array(padded);
    const inR = new Float32Array(padded);
    inL.set(input.left, 0);
    inR.set(input.right, 0);
    const wetL = new Float32Array(padded);
    const wetR = new Float32Array(padded);
    chain.process(inL, inR, wetL, wetR);
    const left = wetL.slice(latency, latency + frames);
    const right = wetR.slice(latency, latency + frames);
    applyFades([left, right], SR, settings.fadeInSeconds, settings.fadeOutSeconds);
    return { left, right };
  }

  it("spans more than one chunk, so the comparison means something", () => {
    expect(input.left.length).toBeGreaterThan(RENDER_CHUNK_FRAMES * 2);
    expect(input.left.length % RENDER_CHUNK_FRAMES).not.toBe(0);
  });

  it("is bit-identical to one unbroken pass", () => {
    const chunked = renderMaster({ ...input, sampleRate: SR, settings });
    const whole = unchunked();
    // Not toBeCloseTo: a chunk boundary that disturbed any filter's state
    // would show as a small, local difference, which rounding tolerance is
    // exactly the wrong tool for finding.
    expect(Array.from(chunked.left)).toEqual(Array.from(whole.left));
    expect(Array.from(chunked.right)).toEqual(Array.from(whole.right));
  });
});

describe("progress reporting", () => {
  const collect = (seconds: number): RenderProgress[] => {
    const events: RenderProgress[] = [];
    renderMaster({
      ...music(seconds),
      sampleRate: SR,
      settings: DEFAULT_MASTER,
      onProgress: (p) => events.push(p),
    });
    return events;
  };

  it("reports both phases, render before measure", () => {
    const phases = collect(3).map((p) => p.phase);
    expect(phases).toContain("render");
    expect(phases).toContain("measure");
    expect(phases.lastIndexOf("render")).toBeLessThan(phases.indexOf("measure"));
  });

  it("never goes backwards and ends at one", () => {
    const events = collect(4.2);
    const renderPhase = events.filter((p) => p.phase === "render");
    expect(renderPhase.length).toBeGreaterThan(2);
    for (let i = 1; i < renderPhase.length; i++) {
      expect(renderPhase[i].fraction).toBeGreaterThanOrEqual(renderPhase[i - 1].fraction);
    }
    expect(renderPhase[0].fraction).toBe(0);
    expect(renderPhase[renderPhase.length - 1].fraction).toBe(1);
    expect(events[events.length - 1]).toEqual({ phase: "measure", fraction: 1 });
  });

  it("stays inside 0..1 even for a file shorter than one chunk", () => {
    for (const p of collect(0.2)) {
      expect(p.fraction).toBeGreaterThanOrEqual(0);
      expect(p.fraction).toBeLessThanOrEqual(1);
    }
  });

  it("changes nothing about the result", () => {
    const quiet = renderMaster({ ...music(1), sampleRate: SR, settings: DEFAULT_MASTER });
    const loud = renderMaster({
      ...music(1),
      sampleRate: SR,
      settings: DEFAULT_MASTER,
      onProgress: () => {},
    });
    expect(Array.from(loud.left)).toEqual(Array.from(quiet.left));
  });
});

describe("waveformPeaks", () => {
  it("returns one min and one max per bucket", () => {
    const { left, right } = music(2);
    const { min, max } = waveformPeaks([left, right], 400);
    expect(min).toHaveLength(400);
    expect(max).toHaveLength(400);
    for (let i = 0; i < 400; i++) expect(max[i]).toBeGreaterThanOrEqual(min[i]);
  });

  it("covers the whole file — the loudest sample shows up somewhere", () => {
    // Picking one sample per column instead of the range makes a waveform that
    // changes shape when the window is resized, and hides short peaks.
    const { left } = music(2);
    const spikeAt = Math.round(left.length * 0.37);
    left[spikeAt] = 0.99;
    const { max } = waveformPeaks([left], 300);
    expect(Math.max(...Array.from(max))).toBeCloseTo(0.99, 5);
  });

  it("handles more buckets than samples", () => {
    const tiny = new Float32Array([0.5, -0.5, 0.25]);
    const { min, max } = waveformPeaks([tiny], 100);
    expect(min).toHaveLength(100);
    expect(Number.isFinite(max[99])).toBe(true);
  });

  it("returns zeros for an empty file", () => {
    const { min, max } = waveformPeaks([new Float32Array(0)], 10);
    expect(Array.from(min)).toEqual(new Array(10).fill(0));
    expect(Array.from(max)).toEqual(new Array(10).fill(0));
  });
});
