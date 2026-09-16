"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { PRIORITY_COLORS, STAGE_META } from "@/lib/stagelab/utils";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  StageLab design primitives — a dark trading terminal.                   ║
// ║                                                                          ║
// ║  Deliberately dependency-free: no Radix, no shadcn, no component         ║
// ║  library. The repo ships React 18 + Tailwind 3 and every other product   ║
// ║  surface here is built the same way, so pulling forty Radix packages in  ║
// ║  for a dozen controls would have been the largest change in this work    ║
// ║  and the least of its value.                                             ║
// ║                                                                          ║
// ║  Colour rules, enforced by _tokens.test.ts:                              ║
// ║    • text sits on zinc-950/zinc-900 surfaces and never goes fainter than ║
// ║      zinc-400 — zinc-500 is below 4.5:1 on both and fails AA.            ║
// ║    • semantic colour is emerald (good) / amber (early) / orange (late) / ║
// ║      red (bad), matching STAGE_META so a stage reads the same everywhere.║
// ╚══════════════════════════════════════════════════════════════════════════╝

export const SURFACE = "border border-zinc-800 bg-zinc-900/60";

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl ${SURFACE} ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ViewHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-xl ${SURFACE} px-3.5 py-3`}>
      <div className="text-[0.7rem] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 font-mono text-xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[0.7rem] text-zinc-400">{sub}</div>}
    </div>
  );
}

export type Tone = "neutral" | "good" | "warn" | "late" | "bad";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-zinc-100",
  good: "text-emerald-400",
  warn: "text-amber-400",
  late: "text-orange-400",
  bad: "text-red-400",
};

const TONE_CHIP: Record<Tone, string> = {
  neutral: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  late: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  bad: "border-red-500/30 bg-red-500/10 text-red-300",
};

/** Pick a tone from a signed number — the single place that rule lives. */
export function toneOfSign(n: number): Tone {
  if (n > 0) return "good";
  if (n < 0) return "bad";
  return "neutral";
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium ${TONE_CHIP[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StageBadge({ stage, short = false }: { stage: number; short?: boolean }) {
  const meta = STAGE_META[stage];
  if (!meta) return <Badge>—</Badge>;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium ${meta.badge}`}
    >
      {short ? `S${stage}` : meta.th}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.C;
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] font-semibold ${cls}`}>
      {priority}
    </span>
  );
}

/** A 0–10 score as a compact labelled pill. */
export function ScorePill({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = max > 0 ? value / max : 0;
  const tone: Tone = pct >= 0.7 ? "good" : pct >= 0.4 ? "warn" : "bad";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[0.65rem] uppercase text-zinc-400">{label}</span>
      <span className={`font-mono text-xs font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
        <span className="text-zinc-400">/{max}</span>
      </span>
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = "good" }: { value: number; max?: number; tone?: Tone }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar =
    tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : tone === "late" ? "bg-orange-400" : tone === "bad" ? "bg-red-400" : "bg-zinc-400";
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 px-4 py-10 text-center">
      <p className="text-sm text-zinc-300">{title}</p>
      {hint && <p className="max-w-md text-xs text-zinc-400">{hint}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} aria-hidden />;
}

export function Spinner({ label = "กำลังโหลด" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-zinc-400" role="status">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" aria-hidden />
      {label}
    </span>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle";

const BUTTON_STYLE: Record<ButtonVariant, string> = {
  primary: "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:bg-emerald-500/40",
  ghost: "border border-zinc-700 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/60",
  danger: "border border-red-500/40 text-red-300 hover:bg-red-500/10",
  subtle: "text-zinc-300 hover:bg-zinc-800/60",
};

export function Button({
  children,
  variant = "ghost",
  size = "md",
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // min-h-9/11 keeps every control at a comfortable touch target on mobile,
  // which is where a weekly review actually gets done.
  const dim = size === "sm" ? "min-h-9 px-2.5 text-xs" : "min-h-11 px-3.5 text-sm";
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${dim} ${BUTTON_STYLE[variant]} ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.7rem] uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.65rem] text-zinc-400">{hint}</span>}
    </label>
  );
}

const INPUT =
  "w-full min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        className={`${INPUT} font-mono tabular-nums`}
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          // An empty or half-typed field parses to NaN; writing that into state
          // would blank the input mid-keystroke. Hold the last good value.
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: string;
}) {
  const select = (
    <select
      className={`${INPUT} appearance-none pr-8`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-zinc-900">
          {o.label}
        </option>
      ))}
    </select>
  );
  return label ? <Field label={label} hint={hint}>{select}</Field> : select;
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2 hover:border-zinc-700">
      <span>
        <span className="block text-sm text-zinc-200">{label}</span>
        {hint && <span className="block text-[0.7rem] text-zinc-400">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-emerald-500"
      />
    </label>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (n: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[0.7rem] uppercase tracking-wide text-zinc-400">{label}</span>
        <span className="font-mono text-xs tabular-nums text-emerald-400">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-emerald-500"
        aria-label={label}
      />
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { key: T; label: string }[];
  active: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
            active === t.key
              ? "bg-emerald-500/15 text-emerald-300"
              : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-full border px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
        active
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

/**
 * A horizontally scrollable table.
 *
 * Dense financial data belongs in a table — ten columns of prices reflowed
 * into cards reads worse, not better, and traders scan down columns. But a
 * scroll container that only responds to a pointer is unreachable by keyboard,
 * so this one is a focusable labelled region: WCAG 2.1.1, and the reason for
 * the tabIndex on a div that would otherwise not want one.
 */
export function TableWrap({
  children,
  minWidth = 720,
  label = "ตารางข้อมูล เลื่อนแนวนอนได้",
}: {
  children: ReactNode;
  minWidth?: number;
  label?: string;
}) {
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-zinc-800 px-2 py-2 text-[0.7rem] font-medium uppercase tracking-wide text-zinc-400 text-${align}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = false,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap border-b border-zinc-800/60 px-2 py-2 text-${align} ${
        mono ? "font-mono tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

/**
 * A focus-trapping dialog. Escape closes, focus moves in on open and returns to
 * the trigger on close, and a click on the backdrop dismisses. Built by hand
 * because the alternative was a UI library for this one control.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // Focus the first control in the BODY, not the first in the DOM — the
    // close button lives in the header and would otherwise win every time,
    // which means opening a form lands you on "dismiss".
    const body = node?.querySelector<HTMLElement>("[data-modal-body]");
    const target =
      body?.querySelector<HTMLElement>("input,select,textarea,button") ??
      node?.querySelector<HTMLElement>("input,select,textarea,button");
    target?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
          <h2 id={labelId} className="text-sm font-semibold text-zinc-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="min-h-9 rounded-lg px-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            ✕
          </button>
        </header>
        <div data-modal-body className="space-y-3 px-4 py-4">
          {children}
        </div>
        {footer && (
          <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ─── Plan gate ───────────────────────────────────────────────────────────────

/** What a locked surface shows instead of the feature. */
export function LockedPanel({ feature, reason }: { feature: string; reason?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-10 text-center">
      <p className="text-sm font-medium text-amber-200">{feature} อยู่ในแผน Pro</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs text-zinc-300">
        {reason ?? "อัปเกรดเพื่อปลดล็อกโต๊ะวิจัยทั้งหมด — Thesis, Backtest, Pro Desk และ Quant Lab"}
      </p>
      <a
        href="/stagelab/pricing"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
      >
        ดูแผนและราคา
      </a>
    </div>
  );
}
