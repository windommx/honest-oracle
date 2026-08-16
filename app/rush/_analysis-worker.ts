// Module worker: runs the analyzer registry off the main thread so a 100k-char
// manuscript never freezes typing. Same registry as the sync fallback in
// _use-analysis.ts — identical results by construction, only the thread differs.

import { ANALYSIS_TASKS, type AnalysisTaskName } from "./_analysis-tasks";

interface TaskMessage {
  id: number;
  task: AnalysisTaskName;
  args: unknown[];
}

self.onmessage = (e: MessageEvent<TaskMessage>) => {
  const { id, task, args } = e.data;
  const post = (msg: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg);
  try {
    const fn = ANALYSIS_TASKS[task] as (...a: unknown[]) => unknown;
    post({ id, ok: true, result: fn(...args) });
  } catch (err) {
    post({ id, ok: false, error: String(err) });
  }
};
