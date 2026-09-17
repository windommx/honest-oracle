"use client";

import { useEffect, useState } from "react";

// Same contract as app/rush/_toast.tsx (deterministic counter ids, aria-live stack) —
// re-implemented here rather than imported because that stack is styled for the dark
// suite chrome and this module is light. The store is module-local, so a toast fired
// from any /competency component lands in the one <Toaster /> the layout mounts.

export type ToastVariant = "info" | "success" | "error";
export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

export function toast(message: string, opts?: { variant?: ToastVariant; duration?: number }): number {
  const variant = opts?.variant ?? "info";
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
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  const before = toasts.length;
  toasts = toasts.filter((x) => x.id !== id);
  if (toasts.length !== before) emit();
}

export function _resetToasts(): void {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  toasts = [];
  nextId = 1;
  emit();
}

export function _getToasts(): Toast[] {
  return toasts;
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => {
    listeners.delete(l);
  };
}

const TONE: Record<ToastVariant, { border: string; dot: string }> = {
  info: { border: "border-teal-200", dot: "bg-teal-600" },
  success: { border: "border-emerald-200", dot: "bg-emerald-600" },
  error: { border: "border-red-200", dot: "bg-red-600" },
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribe(setItems), []);
  if (!items.length) return null;
  return (
    <div className="no-print fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2" role="region" aria-label="การแจ้งเตือน">
      {items.map((t) => {
        const tone = TONE[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            className={`flex items-start gap-2.5 rounded-xl border ${tone.border} bg-white px-3.5 py-3 shadow-lg shadow-slate-900/10`}
          >
            <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
            <p className="flex-1 text-[0.8rem] leading-snug text-slate-700">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="ปิดการแจ้งเตือน"
              className="shrink-0 px-1 text-sm leading-none text-slate-600 transition hover:text-slate-900"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
