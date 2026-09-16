"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Per-view error boundary.                                                ║
// ║                                                                          ║
// ║  The app is one client route that swaps thirteen views in place. Without ║
// ║  a boundary, a render error anywhere — a malformed row from the API, an  ║
// ║  undefined a view forgot to guard — unmounts the whole tree and leaves a ║
// ║  blank page with no navigation and no way back except a reload.          ║
// ║                                                                          ║
// ║  Scoped to the view rather than the shell so the sidebar, the header and ║
// ║  every other view keep working. `resetKey` is the view name: switching   ║
// ║  views clears the error, which is what someone will try first and is     ║
// ║  also, usually, the thing that works.                                    ║
// ║                                                                          ║
// ║  A class component because React exposes no hook for this.               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

interface Props {
  children: ReactNode;
  /** Changing this clears a captured error — pass the active view key. */
  resetKey: string;
  /** Shown in the recovery panel so a report can name the surface. */
  label: string;
}

interface State {
  error: Error | null;
  seenKey: string;
}

export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null, seenKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Navigating away from a broken view is a recovery, not a re-render of the
    // failure. Derived rather than done in an effect so the healthy view paints
    // on the first commit instead of flashing the error panel.
    if (props.resetKey !== state.seenKey) return { error: null, seenKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Structured, and matching the server's log shape so both ends of a broken
    // request can be found by the same search.
    console.error(
      JSON.stringify({
        level: "error",
        module: "stagelab",
        where: `view:${this.props.resetKey}`,
        message: error.message,
        componentStack: info.componentStack,
      }),
    );
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-8 text-center"
      >
        <h2 className="text-sm font-semibold text-red-200">
          หน้า “{this.props.label}” แสดงผลไม่สำเร็จ
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-300">
          ส่วนอื่นของระบบยังใช้งานได้ตามปกติ — เมนูด้านซ้ายยังกดได้
          ข้อมูลของคุณไม่ได้รับผลกระทบ เพราะข้อผิดพลาดนี้เกิดตอนวาดหน้าจอ ไม่ใช่ตอนบันทึก
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            ลองแสดงผลใหม่
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-zinc-600"
          >
            โหลดหน้าใหม่ทั้งหมด
          </button>
        </div>
        <details className="mx-auto mt-4 max-w-md text-left">
          <summary className="cursor-pointer text-[0.7rem] text-zinc-400 hover:text-zinc-200">
            รายละเอียดทางเทคนิค
          </summary>
          <pre className="mt-1.5 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[0.65rem] text-zinc-300">
            {this.state.error.message}
          </pre>
        </details>
      </div>
    );
  }
}
