"use client";

import { useEffect, useState } from "react";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  TOAST — in-app feedback, replacing window.alert().                ║
// ║  A native alert() blocks the thread, cannot be styled, and reads   ║
// ║  as a 1998 popup — the single most visible "unpolished" tell. This ║
// ║  is a dependency-free, accessible (aria-live) toast stack that any  ║
// ║  component can fire without prop-drilling or a provider wrapper.   ║
// ╚══════════════════════════════════════════════════════════════════╝

export type ToastVariant = "info" | "success" | "error";
export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  /** ms until auto-dismiss; 0 keeps it until dismissed. Errors linger longer. */
  duration: number;
}

type Listener = (toasts: Toast[]) => void;

// Module-level store so `toast()` works from anywhere. Ids come from a counter, NOT
// Date.now()/Math.random(), so the store is deterministic and unit-testable.
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

/** Fire a toast. Returns its id (so a caller can dismiss it early). */
export function toast(message: string, opts?: { variant?: ToastVariant; duration?: number }): number {
  const variant = opts?.variant ?? "info";
  // Errors default to a longer, non-auto-dismiss-friendly window; info/success are brief.
  const duration = opts?.duration ?? (variant === "error" ? 8000 : 4000);
  const id = nextId++;
  toasts = [...toasts, { id, message, variant, duration }];
  emit();
  if (duration > 0 && typeof setTimeout !== "undefined") {
    timers.set(id, setTimeout(() => dismissToast(id), duration));
  }
  return id;
}

export function dismissToast(id: number): void {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  const before = toasts.length;
  toasts = toasts.filter((x) => x.id !== id);
  if (toasts.length !== before) emit();
}

/** Test/reset hook — clears the store and any pending timers. */
export function _resetToasts(): void {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  toasts = [];
  nextId = 1;
  emit();
}

/** Current toasts — for tests and the subscribe bootstrap. */
export function _getToasts(): Toast[] {
  return toasts;
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => { listeners.delete(l); };
}

const TONE: Record<ToastVariant, { border: string; dot: string; label: string }> = {
  info: { border: "border-[#ab5bf7]/40", dot: "bg-[#ab5bf7]", label: "แจ้งเตือน" },
  success: { border: "border-emerald-500/40", dot: "bg-emerald-400", label: "สำเร็จ" },
  error: { border: "border-rose-500/45", dot: "bg-rose-400", label: "ผิดพลาด" },
};

/** The stack. Mount once (in the bookisdom layout). Accessible: an aria-live region so a
 *  screen reader announces each toast; each toast is dismissible by keyboard and pointer. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribe(setItems), []);
  if (!items.length) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
      role="region"
      aria-label="การแจ้งเตือน"
    >
      {items.map((t) => {
        const tone = TONE[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            className={`flex items-start gap-2.5 rounded-xl border ${tone.border} bg-[#151a27] px-3.5 py-3 shadow-lg shadow-black/40 backdrop-blur`}
          >
            <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
            <p className="flex-1 text-[0.8rem] leading-snug text-slate-200">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="ปิดการแจ้งเตือน"
              className="shrink-0 text-faint hover:text-slate-200 transition text-sm leading-none px-1"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
