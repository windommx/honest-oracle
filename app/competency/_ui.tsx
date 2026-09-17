"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { levelInfo, managementInfo } from "@/lib/competency/scoring";
import { LEVEL_BADGE, MGMT_BADGE } from "./_tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  UI PRIMITIVES — dependency-free (no Radix/shadcn in this repo):   ║
// ║  buttons, fields, cards, badges, an accessible modal and confirm. ║
// ║  Presentational only; no data fetching, no engine imports beyond  ║
// ║  the two badge lookups.                                           ║
// ╚══════════════════════════════════════════════════════════════════╝

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ── Buttons ───────────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";

const VARIANT: Record<Variant, string> = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 border border-transparent",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:border-teal-600 hover:text-teal-800",
  ghost: "bg-transparent text-teal-700 hover:bg-teal-50 border border-transparent",
  danger: "bg-red-700 text-white hover:bg-red-800 border border-transparent",
  "danger-outline": "bg-white text-red-700 border border-red-200 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; busy?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        VARIANT[variant],
        className
      )}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ── Fields ────────────────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/25 disabled:bg-slate-100";

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-red-700" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────────────────

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("px-4 py-4 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-slate-200/70", className)} aria-hidden />;
}

export function Spinner({ label = "กำลังโหลด" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-teal-700" aria-hidden />
      {label}
    </div>
  );
}

/** A failed load is NOT an empty roster. Say so and offer a retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
      <p className="font-medium text-red-800">โหลดข้อมูลไม่สำเร็จ</p>
      <p className="mt-1 text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          ลองใหม่อีกครั้ง
        </Button>
      )}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

export function LevelBadge({ level, showBand = false, className }: { level: number; showBand?: boolean; className?: string }) {
  const info = levelInfo(level);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        LEVEL_BADGE[info.level],
        className
      )}
      title={`${info.enName} · ${info.band}`}
    >
      <span className="font-bold">LEVEL {info.level}</span>
      <span aria-hidden>·</span>
      <span>{info.thName}</span>
      {showBand && <span className="opacity-80">({info.band})</span>}
    </span>
  );
}

export function MgmtBadge({ level, className }: { level: number | null | undefined; className?: string }) {
  const info = managementInfo(level);
  if (!info) return null;
  return (
    <span
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", MGMT_BADGE, className)}
      title={info.enName}
    >
      LEVEL {info.level} · {info.thName}
    </span>
  );
}

export function NotAssessedBadge() {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      ยังไม่ประเมิน
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: role=dialog + aria-modal, labelled by its title, Escape closes,
 * Tab cycles inside, focus moves in on open and back to the opener on close, and the
 * page behind stops scrolling. No portal — the fixed overlay sits at the end of the
 * component tree, which is fine because nothing in this module creates a stacking
 * context above it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first control in the BODY (not the header's close button — landing on
    // "close" is the classic way to make a keyboard user shut the dialog by accident),
    // else the panel itself.
    const first = body.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-4xl" : "sm:max-w-2xl";
  return (
    <div className="no-print fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl",
          width
        )}
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="shrink-0 rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div ref={body} className="overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "ยืนยัน",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="text-sm text-slate-700">{description}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          ยกเลิก
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** The 1-5 "pips" used in per-criterion rows (decorative; the number beside them carries the value). */
export function Pips({ point }: { point: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((p) => (
        <span key={p} className={cx("h-2 w-3.5 rounded-sm", p <= point ? "bg-teal-600" : "bg-slate-200")} />
      ))}
    </span>
  );
}
