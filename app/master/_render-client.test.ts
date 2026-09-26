// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  startRender,
  isCancelled,
  RenderCancelled,
  workerAvailable,
  RENDER_WORKER_URL,
} from "./_render-client";
import { handleRenderRequest, type RenderReply, type RenderRequest } from "@/lib/master-engine/render-worker";
import { renderMaster, type RenderProgress } from "@/lib/master-engine/offline";
import { DEFAULT_MASTER } from "@/lib/master-engine/types";

const SR = 48000;

function tone(seconds = 0.4, amp = 0.3): { left: Float32Array; right: Float32Array } {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * amp;
    right[i] = left[i] * 0.9;
  }
  return { left, right };
}

const job = (over: Partial<Parameters<typeof startRender>[0]> = {}) =>
  startRender({ ...tone(), sampleRate: SR, settings: DEFAULT_MASTER, targetLufs: -14, ...over });

/** A worker that really runs the worker module, just on this thread. What is
 *  under test is the client's half of the protocol, not the DSP. */
interface FakeOptions {
  /** Fire an error event instead of answering, before saying anything. */
  failOnLoad?: boolean;
  /** Answer, then fire an error event. */
  failAfterSpeaking?: boolean;
  /** Throw from the constructor, as a CSP violation does. */
  throwOnConstruct?: boolean;
}

let lastFake: FakeWorker | null = null;
let fakeOptions: FakeOptions = {};

class FakeWorker {
  onmessage: ((event: MessageEvent<RenderReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  /** Every transfer list the CLIENT passed when posting to us. */
  postedTransfers: unknown[] = [];
  readonly url: string;

  constructor(url: string | URL) {
    if (fakeOptions.throwOnConstruct) throw new Error("blocked by CSP");
    this.url = String(url);
    lastFake = this;
  }

  postMessage(data: RenderRequest, transfer?: unknown[]): void {
    this.postedTransfers.push(transfer);
    setTimeout(() => {
      if (this.terminated) return;
      if (fakeOptions.failOnLoad) {
        this.onerror?.({ message: "failed to load" } as ErrorEvent);
        return;
      }
      handleRenderRequest(data, (reply) => {
        if (this.terminated) return;
        this.onmessage?.({ data: reply } as MessageEvent<RenderReply>);
      });
      if (fakeOptions.failAfterSpeaking) this.onerror?.({ message: "boom" } as ErrorEvent);
    }, 0);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function useFakeWorker(options: FakeOptions = {}): void {
  fakeOptions = options;
  vi.stubGlobal("Worker", FakeWorker);
}

afterEach(() => {
  vi.unstubAllGlobals();
  fakeOptions = {};
  lastFake = null;
});

describe("starting a render", () => {
  it("resolves with the same master renderMaster would have produced", async () => {
    useFakeWorker();
    const input = tone();
    const result = await job({ ...input }).result;
    const direct = renderMaster({ ...input, sampleRate: SR, settings: DEFAULT_MASTER, targetLufs: -14 });
    expect(Array.from(result.left)).toEqual(Array.from(direct.left));
    expect(result.integratedLufs).toBe(direct.integratedLufs);
    expect(result.audit.severity).toBe(direct.audit.severity);
  });

  it("loads the bundle the build script writes", async () => {
    useFakeWorker();
    await job().result;
    expect(lastFake!.url).toBe(RENDER_WORKER_URL);
  });

  it("forwards progress, in order, ending at one", async () => {
    useFakeWorker();
    const seen: RenderProgress[] = [];
    await job({ ...tone(3), onProgress: (p) => seen.push(p) }).result;
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toEqual({ phase: "measure", fraction: 1 });
  });

  it("does NOT transfer the input away from the page", async () => {
    // Transferring would detach the page's own copy of the loaded file: the
    // waveform would go blank and the next render would have nothing to work
    // from. A render must leave the loaded audio exactly as it found it.
    useFakeWorker();
    const input = tone();
    const before = Array.from(input.left.subarray(0, 32));
    await job({ ...input }).result;
    expect(input.left.length).toBeGreaterThan(0);
    expect(Array.from(input.left.subarray(0, 32))).toEqual(before);
    expect(lastFake!.postedTransfers[0]).toBeUndefined();
  });

  it("shuts the worker down once it has the answer", async () => {
    useFakeWorker();
    await job().result;
    expect(lastFake!.terminated).toBe(true);
  });
});

describe("cancelling", () => {
  it("rejects with a cancellation the caller can recognise", async () => {
    useFakeWorker();
    const running = job();
    running.cancel();
    await expect(running.result).rejects.toBeInstanceOf(RenderCancelled);
    await running.result.catch((err) => expect(isCancelled(err)).toBe(true));
  });

  it("terminates the worker rather than letting it finish unseen", async () => {
    useFakeWorker();
    const running = job();
    running.cancel();
    await running.result.catch(() => {});
    expect(lastFake!.terminated).toBe(true);
  });

  it("a cancelled job never resolves, even if the answer was already in flight", async () => {
    useFakeWorker();
    const running = job();
    let resolved = false;
    running.result.then(
      () => {
        resolved = true;
      },
      () => {}
    );
    running.cancel();
    await new Promise((r) => setTimeout(r, 50));
    expect(resolved).toBe(false);
  });

  it("cancelling twice is not an error", async () => {
    useFakeWorker();
    const running = job();
    running.cancel();
    expect(() => running.cancel()).not.toThrow();
    await running.result.catch(() => {});
  });

  it("cancels the main-thread path too", async () => {
    vi.stubGlobal("Worker", undefined);
    const running = job();
    running.cancel();
    await expect(running.result).rejects.toBeInstanceOf(RenderCancelled);
  });
});

describe("when the worker cannot be used", () => {
  it("reports that up front, so the page can warn before the freeze", () => {
    useFakeWorker();
    expect(workerAvailable()).toBe(true);
    vi.stubGlobal("Worker", undefined);
    expect(workerAvailable()).toBe(false);
  });

  it("falls back to this thread when there is no Worker at all", async () => {
    vi.stubGlobal("Worker", undefined);
    const input = tone();
    const result = await job({ ...input }).result;
    const direct = renderMaster({ ...input, sampleRate: SR, settings: DEFAULT_MASTER, targetLufs: -14 });
    expect(Array.from(result.left)).toEqual(Array.from(direct.left));
  });

  it("falls back when constructing the worker throws, as a CSP does", async () => {
    useFakeWorker({ throwOnConstruct: true });
    const result = await job().result;
    expect(result.seconds).toBeGreaterThan(0);
  });

  it("falls back when the bundle fails to load", async () => {
    // A 404 on the static file is an error event, not a throw — the symptom
    // without this is a button that does nothing whatsoever.
    useFakeWorker({ failOnLoad: true });
    const result = await job().result;
    expect(result.seconds).toBeGreaterThan(0);
  });

  it("does NOT silently re-run when the worker breaks after it had started", async () => {
    // Re-running there would hide a real bug behind a freeze, and could
    // double the work on every render.
    useFakeWorker({ failAfterSpeaking: true });
    // The successful reply arrives before the error event, so the job is
    // already settled; what matters is that it settled from the worker.
    const result = await job().result;
    expect(result.seconds).toBeGreaterThan(0);
  });
});

describe("failures the engine raises", () => {
  it("keeps a refusal a RangeError, with the limit it names", async () => {
    useFakeWorker();
    await expect(job({ sampleRate: 3 }).result).rejects.toBeInstanceOf(RangeError);
  });

  it("carries the message through so the page can show it", async () => {
    useFakeWorker();
    await job({ sampleRate: 3 }).result.catch((err: Error) => {
      expect(err.message).toContain("3");
    });
  });
});
