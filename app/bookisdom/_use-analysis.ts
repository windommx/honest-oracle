"use client";

// useAnalysisTask — run a registered analyzer pass in the shared module worker,
// keeping the main thread free of measured >50ms long tasks. Environments
// without Worker (SSR, jsdom tests) compute synchronously from the SAME
// registry, so results are identical everywhere; only the thread differs.
//
// Returns null while disabled or while a worker result is in flight — the same
// nullable shape the views already guard on. Stale results are dropped by
// call-sequence, so fast retyping can never paint an older manuscript's report.

import { useEffect, useRef, useState } from "react";
import { ANALYSIS_TASKS, type AnalysisTaskName, type AnalysisTaskArgs, type AnalysisTaskResult } from "./_analysis-tasks";

let sharedWorker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, (result: unknown, ok: boolean) => void>();

function getWorker(): Worker | null {
  if (workerBroken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!sharedWorker) {
    try {
      sharedWorker = new Worker(new URL("./_analysis-worker.ts", import.meta.url));
      sharedWorker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown }>) => {
        const cb = pending.get(e.data.id);
        pending.delete(e.data.id);
        cb?.(e.data.result, e.data.ok);
      };
      sharedWorker.onerror = () => {
        // Worker failed to load (CSP, bundling) — fall back to sync for the session.
        workerBroken = true;
        pending.forEach((cb) => cb(undefined, false));
        pending.clear();
        sharedWorker = null;
      };
    } catch {
      workerBroken = true;
      sharedWorker = null;
    }
  }
  return sharedWorker;
}

function runSync<K extends AnalysisTaskName>(task: K, args: AnalysisTaskArgs<K>): AnalysisTaskResult<K> {
  return (ANALYSIS_TASKS[task] as (...a: unknown[]) => AnalysisTaskResult<K>)(...args);
}

/** Run `task` with `args` off-thread; pass `null` args to disable (result null). */
export function useAnalysisTask<K extends AnalysisTaskName>(
  task: K,
  args: AnalysisTaskArgs<K> | null
): AnalysisTaskResult<K> | null {
  const [result, setResult] = useState<AnalysisTaskResult<K> | null>(null);
  const call = useRef(0);
  // Cheap stable dependency key: args are short strings or manuscripts (joining
  // 100k chars is sub-ms, and this only runs per render of an open modal).
  const key = args ? args.join("\u0000") : null;
  useEffect(() => {
    if (!args) {
      setResult(null);
      return;
    }
    const mine = ++call.current;
    const w = getWorker();
    if (!w) {
      setResult(runSync(task, args));
      return;
    }
    const id = ++seq;
    pending.set(id, (r, ok) => {
      if (call.current !== mine) return;
      // A failed worker call falls back to the sync path — same registry.
      setResult(ok ? (r as AnalysisTaskResult<K>) : runSync(task, args));
    });
    w.postMessage({ id, task, args });
    return () => {
      pending.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, key]);
  return result;
}
