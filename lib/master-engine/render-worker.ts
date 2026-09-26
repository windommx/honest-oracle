// ╔══════════════════════════════════════════════════════════════════╗
// ║  RENDER WORKER — the master, computed off the main thread.        ║
// ║                                                                    ║
// ║  Mastering a four-minute track is a few seconds of solid           ║
// ║  arithmetic. On the main thread that is a few seconds in which     ║
// ║  the tab paints nothing, answers nothing, and — past about ten     ║
// ║  seconds — earns a "page unresponsive" dialog from the browser.    ║
// ║  The operator cannot tell that from a crash, because from the      ║
// ║  outside it is not different from one.                             ║
// ║                                                                    ║
// ║  So the same pure function runs here instead. Nothing about the    ║
// ║  audio changes: renderMaster is imported, not reimplemented, and   ║
// ║  the guard test bundles this file and renders through it to prove  ║
// ║  the shipped artifact is the engine the suite tests.               ║
// ║                                                                    ║
// ║  Two things the worker buys beyond a responsive tab: real          ║
// ║  progress, because the render already reports where it is, and     ║
// ║  cancellation, because terminating a worker is instant whereas a   ║
// ║  main-thread loop cannot be interrupted at all.                    ║
// ╚══════════════════════════════════════════════════════════════════╝

import { renderMaster, type RenderProgress } from "./offline";
import type { MasterSettings } from "./types";
import type { AuditResult } from "./audit";

export interface RenderRequest {
  /** Identifies the reply. The client abandons anything that is not the job
   *  it is currently waiting for — a superseded render's result arriving
   *  late must not overwrite a newer one. */
  id: number;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  settings: MasterSettings;
  targetLufs: number;
}

export interface RenderProgressMessage extends RenderProgress {
  kind: "progress";
  id: number;
}

export interface RenderDoneMessage {
  kind: "done";
  id: number;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  seconds: number;
  integratedLufs: number;
  truePeakDb: number;
  audit: AuditResult;
  elapsedMs: number;
}

export interface RenderErrorMessage {
  kind: "error";
  id: number;
  message: string;
  /** True for the engine's own refusals — too long, impossible rate — which
   *  are worth showing verbatim because they name the limit. Anything else
   *  is a bug and the client says so rather than pretending it is advice. */
  expected: boolean;
}

export type RenderReply = RenderProgressMessage | RenderDoneMessage | RenderErrorMessage;

/**
 * Handle one request. Exported so the guard test can drive the bundle in Node
 * with a fake `postMessage`, rather than only checking that the file parses.
 */
export function handleRenderRequest(
  request: RenderRequest,
  post: (message: RenderReply, transfer?: Transferable[]) => void
): void {
  try {
    // Reported at most once per whole percent. The render posts about 130
    // times for a three-minute track, which is already modest, but a short
    // file at a small chunk size can post far more often than the screen
    // refreshes, and every one of those is a structured clone and a wake-up
    // on the main thread — the exact cost the worker exists to avoid.
    let lastPercent = -1;
    const result = renderMaster({
      left: request.left,
      right: request.right,
      sampleRate: request.sampleRate,
      settings: request.settings,
      targetLufs: request.targetLufs,
      onProgress: ({ phase, fraction }) => {
        const percent = Math.round(fraction * 100);
        if (percent === lastPercent && fraction !== 0 && fraction !== 1) return;
        lastPercent = percent;
        post({ kind: "progress", id: request.id, phase, fraction });
      },
    });
    post(
      {
        kind: "done",
        id: request.id,
        left: result.left,
        right: result.right,
        sampleRate: result.sampleRate,
        seconds: result.seconds,
        integratedLufs: result.integratedLufs,
        truePeakDb: result.truePeakDb,
        audit: result.audit,
        elapsedMs: result.elapsedMs,
      },
      // Transferred, not copied. A four-minute stereo render is 80MB of
      // Float32; cloning it would cost another 80MB and a memcpy on the
      // main thread at the exact moment the operator is waiting. The worker
      // is finished with these buffers, so handing over ownership is free.
      [result.left.buffer, result.right.buffer]
    );
  } catch (err) {
    post({
      kind: "error",
      id: request.id,
      message: err instanceof Error ? err.message : String(err),
      expected: err instanceof RangeError,
    });
  }
}

// The worker realm. Guarded so importing this module from a test — or from
// the main bundle by accident — does nothing.
declare const self: {
  onmessage?: ((event: { data: RenderRequest }) => void) | null;
  postMessage?: (message: RenderReply, transfer?: Transferable[]) => void;
};

if (typeof self !== "undefined" && typeof self.postMessage === "function" && !("document" in self)) {
  self.onmessage = (event) => {
    const post = self.postMessage!.bind(self);
    handleRenderRequest(event.data, post);
  };
}
