// ╔══════════════════════════════════════════════════════════════════╗
// ║  RENDER CLIENT — start a master, watch it, abandon it.            ║
// ║                                                                    ║
// ║  Owns the one thing the page should not have to think about:       ║
// ║  whether this browser gave us a worker. Both paths return the      ║
// ║  same job object, so the page has one code path and the fallback   ║
// ║  is not a special case anyone can forget to write.                 ║
// ║                                                                    ║
// ║  WHY A FALLBACK AT ALL. Workers are universal now, but the bundle  ║
// ║  they load is a static file: a strict Content-Security-Policy, a   ║
// ║  stale service worker, a proxy that rewrites /public — any of      ║
// ║  those and `new Worker` resolves to nothing useful. Without a      ║
// ║  fallback the symptom is a button that does nothing at all, which  ║
// ║  is worse than the freeze the worker was added to fix. So a worker ║
// ║  that fails before it produces anything hands the job back to the  ║
// ║  main thread, and the page says which one it ran on rather than    ║
// ║  claiming the tab is free when it is not.                          ║
// ╚══════════════════════════════════════════════════════════════════╝

"use client";

import { renderMaster, type MasterRender, type RenderProgress } from "@/lib/master-engine/offline";
import type { MasterSettings } from "@/lib/master-engine/types";
import type { RenderReply, RenderRequest } from "@/lib/master-engine/render-worker";

/** Written by scripts/build-worklet.ts; served from public/. */
export const RENDER_WORKER_URL = "/master-render-worker.js";

export interface RenderJobOptions {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  settings: MasterSettings;
  targetLufs: number;
  onProgress?: (progress: RenderProgress) => void;
}

export interface RenderJob {
  result: Promise<MasterRender>;
  /** Stops the render. The promise then rejects with a RenderCancelled, which
   *  the caller is expected to swallow — it is not a failure. */
  cancel(): void;
}

/** Thrown into the job's promise when the caller cancels or supersedes it. */
export class RenderCancelled extends Error {
  constructor() {
    super("ยกเลิกการเรนเดอร์แล้ว");
    this.name = "RenderCancelled";
  }
}

export const isCancelled = (err: unknown): boolean => err instanceof RenderCancelled;

/** Whether this browser can take the render off the main thread at all.
 *  Reported in the UI, because "the page will freeze for a few seconds" is a
 *  thing the operator deserves to know BEFORE pressing the button. */
export function workerAvailable(): boolean {
  return typeof Worker !== "undefined";
}

let nextId = 1;

export function startRender(options: RenderJobOptions): RenderJob {
  let cancelled = false;
  let worker: Worker | null = null;
  let settle: { resolve: (r: MasterRender) => void; reject: (e: unknown) => void } | null = null;

  const result = new Promise<MasterRender>((resolve, reject) => {
    settle = { resolve, reject };
  });

  /**
   * The main-thread path, deferred past a paint.
   *
   * requestAnimationFrame callbacks run BEFORE style, layout and paint, so a
   * long synchronous job started inside one blocks the very frame that was
   * meant to show the loading state — the page freezes with the button still
   * reading its idle label, which is the symptom the rAF was added to
   * prevent. A timeout scheduled from inside the frame lands after the paint.
   * Not a nested rAF: those are suspended in a background tab, so switching
   * away mid-export would leave the button stuck disabled.
   */
  const runHere = () => {
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (cancelled) return;
        try {
          // No onProgress: on this thread nothing can paint between the
          // callbacks, so a progress bar here would be a bar that jumps from
          // 0 to 100 after the freeze is over. Saying nothing is honest; a
          // bar that pretends to move is not.
          settle!.resolve(
            renderMaster({
              left: options.left,
              right: options.right,
              sampleRate: options.sampleRate,
              settings: options.settings,
              targetLufs: options.targetLufs,
            })
          );
        } catch (err) {
          settle!.reject(err);
        }
      }, 0)
    );
  };

  if (!workerAvailable()) {
    runHere();
    return { result, cancel: () => { cancelled = true; settle!.reject(new RenderCancelled()); } };
  }

  const id = nextId++;
  /** True once the worker has said anything at all. After that a failure is a
   *  real failure; before it, the worker never loaded and the main thread can
   *  still do the job. */
  let spoke = false;

  try {
    worker = new Worker(RENDER_WORKER_URL);
  } catch {
    runHere();
    return { result, cancel: () => { cancelled = true; settle!.reject(new RenderCancelled()); } };
  }

  const stop = () => {
    worker?.terminate();
    worker = null;
  };

  worker.onmessage = (event: MessageEvent<RenderReply>) => {
    const reply = event.data;
    // Belt and braces: the client already makes one worker per job, so a
    // stale id cannot arrive — but the check costs nothing and the failure it
    // prevents (an abandoned render overwriting a newer one) is silent.
    if (cancelled || reply.id !== id) return;
    spoke = true;
    if (reply.kind === "progress") {
      options.onProgress?.({ phase: reply.phase, fraction: reply.fraction });
      return;
    }
    stop();
    if (reply.kind === "error") {
      settle!.reject(reply.expected ? new RangeError(reply.message) : new Error(reply.message));
      return;
    }
    settle!.resolve({
      left: reply.left,
      right: reply.right,
      sampleRate: reply.sampleRate,
      seconds: reply.seconds,
      integratedLufs: reply.integratedLufs,
      truePeakDb: reply.truePeakDb,
      audit: reply.audit,
      elapsedMs: reply.elapsedMs,
    });
  };

  worker.onerror = (event: ErrorEvent) => {
    if (cancelled) return;
    stop();
    if (spoke) {
      // It loaded and then broke: a real bug, not a missing file.
      settle!.reject(new Error(event.message || "การเรนเดอร์ล้มเหลว"));
      return;
    }
    runHere();
  };

  const request: RenderRequest = {
    id,
    left: options.left,
    right: options.right,
    sampleRate: options.sampleRate,
    settings: options.settings,
    targetLufs: options.targetLufs,
  };
  // Deliberately NOT transferring the input. Transferring would detach the
  // page's own copy of the loaded file, so the waveform would go blank and
  // the next render would have nothing to work from. The copy costs one pass
  // over the buffer on a thread that is about to be free anyway.
  worker.postMessage(request);

  return {
    result,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      stop();
      settle!.reject(new RenderCancelled());
    },
  };
}
