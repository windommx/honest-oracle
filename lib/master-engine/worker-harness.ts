// ╔══════════════════════════════════════════════════════════════════╗
// ║  WORKER HARNESS — run the bundled render worker in Node.          ║
// ║                                                                    ║
// ║  Same argument as worklet-harness.ts, and the same trick. A Web    ║
// ║  Worker is normally only testable through a browser, so worker     ║
// ║  code is usually verified by one of two non-tests: unit-testing    ║
// ║  the module it imports (which proves nothing about the artifact    ║
// ║  that ships) or checking that the bundle parses (which proves      ║
// ║  nothing at all).                                                  ║
// ║                                                                    ║
// ║  But the worker realm is one object: a `self` with `postMessage`   ║
// ║  and an `onmessage` the host assigns. Supply that and the shipped  ║
// ║  file runs UNMODIFIED, with every reply it posted in an array to   ║
// ║  assert on — including the progress messages, which are the part   ║
// ║  a browser makes hardest to observe.                               ║
// ║                                                                    ║
// ║  One thing the harness does NOT model: the boundary. Everything    ║
// ║  here is one realm and one thread, so a buffer that would be       ║
// ║  detached by a transfer is not, and a structured clone that would  ║
// ║  throw does not. What it proves is that the worker computes the    ║
// ║  right answer and reports it in the right order; that the messages ║
// ║  survive the wire is the browser's contract, checked by hand.      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { readFileSync } from "node:fs";
import type { RenderReply, RenderRequest } from "./render-worker";

export interface LoadedRenderWorker {
  /** Deliver a request, exactly as the browser's postMessage would. The
   *  bundle's handler is synchronous, so every reply is in `replies` when
   *  this returns. */
  send(request: RenderRequest): void;
  replies: RenderReply[];
  /** Buffers the worker asked to transfer, in the order it asked. */
  transferred: ArrayBufferLike[][];
}

/**
 * Evaluate a bundled worker file with a fake worker global.
 *
 * `new Function` rather than node:vm for the reason worklet-harness.ts
 * documents at length: a vm context costs about ten times the run time, and
 * the render's speed is one of the things worth measuring.
 */
export function loadRenderWorker(file: string): LoadedRenderWorker {
  const code = readFileSync(file, "utf8");
  const replies: RenderReply[] = [];
  const transferred: ArrayBufferLike[][] = [];

  const fakeSelf: {
    onmessage: ((event: { data: RenderRequest }) => void) | null;
    postMessage: (message: RenderReply, transfer?: ArrayBufferLike[]) => void;
  } = {
    onmessage: null,
    postMessage: (message, transfer) => {
      replies.push(message);
      transferred.push(transfer ?? []);
    },
  };

  // `self` as a parameter shadows any global of that name, so the bundle sees
  // exactly this object and nothing else.
  new Function("self", "globalThis", code)(fakeSelf, fakeSelf);

  if (typeof fakeSelf.onmessage !== "function") {
    throw new Error(`${file} did not install an onmessage handler — it is not a worker`);
  }

  return {
    send(request) {
      fakeSelf.onmessage!({ data: request });
    },
    replies,
    transferred,
  };
}
