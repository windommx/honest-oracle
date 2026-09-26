// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  HANDOFF_TTL_MS,
  MAX_HANDOFF_SECONDS,
  clearHandoff,
  peekHandoff,
  putHandoff,
  takeHandoff,
} from "./handoff";

const SR = 48000;

function tone(seconds = 0.5, amp = 0.3): { left: Float32Array; right: Float32Array } {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * amp;
    right[i] = left[i] * 0.8;
  }
  return { left, right };
}

const send = (over = {}) =>
  putHandoff({ from: "SynthPro", name: "loop.wav", ...tone(), sampleRate: SR, ...over });

beforeEach(async () => {
  await clearHandoff();
});

describe("handing audio between products", () => {
  it("round-trips the samples themselves, not a re-encoding of them", async () => {
    // The whole point: no 16-bit PCM in the middle. What MasterPro opens is
    // bit for bit what SynthPro rendered.
    const input = tone();
    expect(await send({ ...input })).toBe(true);
    const got = await takeHandoff();
    expect(got).toBeTruthy();
    expect(Array.from(got!.left)).toEqual(Array.from(input.left));
    expect(Array.from(got!.right)).toEqual(Array.from(input.right));
    expect(got!.sampleRate).toBe(SR);
  });

  it("carries where it came from and what to call it", async () => {
    await send({ from: "SynthPro", name: "acid-128bpm.wav" });
    const got = await takeHandoff();
    expect(got).toMatchObject({ from: "SynthPro", name: "acid-128bpm.wav" });
  });

  it("comes back usable by the engine, whatever realm it was cloned into", async () => {
    // NOT toBeInstanceOf. A structured clone can hand back a typed array
    // belonging to another realm, for which `instanceof Float32Array` is
    // false while every operation on it is identical — which is exactly what
    // this environment's IndexedDB does, and what an `instanceof` guard
    // inside takeHandoff rejected every handoff over. So this asserts the
    // things the DSP actually needs: a length, indexing, a subarray, and
    // being copyable into a buffer the engine allocates itself.
    const input = tone(0.1);
    await send({ ...input });
    const got = await takeHandoff();
    expect(Object.prototype.toString.call(got!.left)).toBe("[object Float32Array]");
    expect(got!.left.length).toBe(input.left.length);
    expect(got!.left[10]).toBe(input.left[10]);
    expect(got!.left.subarray(0, 4).length).toBe(4);
    const copy = new Float32Array(got!.left.length);
    copy.set(got!.left);
    expect(copy[10]).toBe(input.left[10]);
  });
});

describe("taking it is taking it", () => {
  it("a second take finds nothing", async () => {
    // Without the delete, reloading MasterPro would load the handoff again on
    // top of whatever the operator had opened since — which looks exactly
    // like the page losing their file.
    await send();
    expect(await takeHandoff()).toBeTruthy();
    expect(await takeHandoff()).toBeNull();
  });

  it("peeking does not take it", async () => {
    await send();
    expect(await peekHandoff()).toBe(true);
    expect(await peekHandoff()).toBe(true);
    expect(await takeHandoff()).toBeTruthy();
    expect(await peekHandoff()).toBe(false);
  });

  it("a second send replaces the first rather than queueing behind it", async () => {
    await send({ name: "first.wav" });
    await send({ name: "second.wav" });
    expect((await takeHandoff())!.name).toBe("second.wav");
    expect(await takeHandoff()).toBeNull();
  });

  it("clearing leaves nothing", async () => {
    await send();
    await clearHandoff();
    expect(await takeHandoff()).toBeNull();
  });
});

describe("it expires", () => {
  it("is gone once it is older than the window", async () => {
    await send();
    expect(await takeHandoff(Date.now() + HANDOFF_TTL_MS + 1)).toBeNull();
  });

  it("is still there just inside it", async () => {
    await send();
    expect(await takeHandoff(Date.now() + HANDOFF_TTL_MS - 1000)).toBeTruthy();
  });

  it("an expired one is cleared out, not left to be found later", async () => {
    await send();
    expect(await takeHandoff(Date.now() + HANDOFF_TTL_MS + 1)).toBeNull();
    // Taken means taken, even when what was taken was too old to use.
    expect(await takeHandoff()).toBeNull();
  });

  it("peek agrees with take about what has expired", async () => {
    await send();
    expect(await peekHandoff(Date.now() + HANDOFF_TTL_MS + 1)).toBe(false);
  });
});

describe("what it refuses to carry", () => {
  it("refuses silence-length audio rather than sending an empty page", async () => {
    expect(await putHandoff({ from: "x", name: "n", left: new Float32Array(0), right: new Float32Array(0), sampleRate: SR })).toBe(false);
  });

  it("refuses more than the receiving engine would render", async () => {
    // Storing something MasterPro will refuse to open only moves the refusal
    // somewhere more confusing.
    const n = Math.round((MAX_HANDOFF_SECONDS + 1) * 8000);
    const big = new Float32Array(n);
    expect(await putHandoff({ from: "x", name: "n", left: big, right: big, sampleRate: 8000 })).toBe(false);
  });

  it("refuses an impossible sample rate", async () => {
    expect(await send({ sampleRate: 3 })).toBe(false);
    expect(await send({ sampleRate: 4_000_000 })).toBe(false);
  });

  it("a refused send leaves whatever was already there alone", async () => {
    await send({ name: "good.wav" });
    await send({ sampleRate: 3 });
    expect((await takeHandoff())!.name).toBe("good.wav");
  });
});
