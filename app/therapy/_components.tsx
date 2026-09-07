"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { EVIDENCE_GRADES } from "@/lib/therapy-engine/evidence";
import { BANDS } from "@/lib/therapy-engine/scoring";
import type { CrisisResource, SafetyResult } from "@/lib/therapy-engine/safety";
import type { Citation, EvidenceGrade, InstrumentId, SeverityBand } from "@/lib/therapy-engine/types";
import { GRADE_COLOR, SEVERITY_COLOR } from "./_tokens";

// Presentational primitives for /therapy. Colours never appear as literals here —
// they come from _tokens.ts through inline styles, which is what lets the guard
// test assert that no hex outside the palette exists in this folder.

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.02] p-5 ${className}`}>{children}</div>
  );
}

export function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "gold" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[0.7rem] ${
        tone === "gold" ? "border-gold/40 text-gold" : "border-white/10 text-gray-400"
      }`}
    >
      {children}
    </span>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-semibold text-gold">{value}</div>
      <div className="text-[0.65rem] text-faint mt-0.5 tracking-wide uppercase">{label}</div>
    </div>
  );
}

/** Evidence grade as stars + label, coloured by the shared confidence ladder. */
export function GradeBadge({ grade, showLabel = true }: { grade: EvidenceGrade; showLabel?: boolean }) {
  const meta = EVIDENCE_GRADES[grade];
  const color = GRADE_COLOR[grade];
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span aria-hidden style={{ color }} className="text-xs tracking-tight">
        {"★".repeat(meta.stars)}
        <span className="opacity-25">{"★".repeat(5 - meta.stars)}</span>
      </span>
      {showLabel && (
        <span style={{ color }} className="text-[0.7rem]">
          {meta.th}
        </span>
      )}
      <span className="sr-only">
        ระดับหลักฐาน: {meta.th} ({meta.stars} จาก 5)
      </span>
    </span>
  );
}

/** The band ladder for an instrument, with the reached band lit.
 *  Each segment is labelled with the published score range that opens it, so the
 *  meter shows the actual cut-points rather than an abstract gradient. */
export function SeverityScale({ instrument, band }: { instrument: InstrumentId; band: SeverityBand }) {
  const bands = BANDS[instrument];
  return (
    <div>
      <div className="flex gap-1.5" role="img" aria-label={`ระดับ: ${band.th}`}>
        {bands.map((b) => {
          const reached = b.from <= band.from;
          return (
            <div
              key={b.id}
              className="h-1.5 flex-1 rounded-full transition-opacity"
              style={{ backgroundColor: SEVERITY_COLOR[b.id], opacity: reached ? 1 : 0.18 }}
            />
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {bands.map((b) => (
          <div key={b.id} className="flex-1 text-[0.6rem] text-faint text-center leading-tight">
            {b.from}–{b.to}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceRow({ r }: { r: CrisisResource }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <a
        href={`tel:${r.phone.replace(/-/g, "")}`}
        className="font-semibold text-lg tabular-nums underline decoration-dotted underline-offset-4"
        style={{ color: "inherit" }}
      >
        {r.phone}
      </a>
      <span className="text-sm text-gray-200">{r.th}</span>
      <span className="text-[0.7rem] text-faint">{r.hoursTh}</span>
      {r.note && <span className="w-full text-[0.7rem] text-faint">{r.note}</span>}
    </li>
  );
}

/** The crisis banner. Rendered above everything else on the page — never in a
 *  collapsed section, never below the fold of a results card. */
export function CrisisBanner({ safety }: { safety: SafetyResult }) {
  if (safety.level === "none") return null;
  const isCrisis = safety.level === "crisis";
  const color = isCrisis ? SEVERITY_COLOR.severe : SEVERITY_COLOR.moderate;

  return (
    <section
      // A live region: when this appears after a form submission, a screen-reader
      // user hears it instead of discovering it by chance further down the page.
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border p-5 mb-6"
      style={{ borderColor: color, backgroundColor: `${color}14` }}
    >
      <h2 className="flex items-center gap-2 font-semibold text-lg" style={{ color }}>
        <Phone className="w-5 h-5 shrink-0" aria-hidden />
        {isCrisis ? "ติดต่อขอความช่วยเหลือตอนนี้" : "แนะนำให้ปรึกษาผู้ให้บริการสุขภาพ"}
      </h2>

      {safety.reasonsTh.length > 0 && (
        <ul className="mt-2 text-[0.8rem] text-gray-300 list-disc list-inside space-y-0.5">
          {safety.reasonsTh.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <ul className="mt-4 space-y-2.5" style={{ color }}>
        {safety.resources.map((r) => (
          <ResourceRow key={r.phone} r={r} />
        ))}
      </ul>

      <p className="mt-4 text-[0.7rem] text-faint leading-relaxed">{safety.note}</p>
    </section>
  );
}

/** One citation, rendered so the reader can go and check it. */
export function CitationLine({ c }: { c: Citation }) {
  const pooled = c.pooled
    ? [c.pooled.trials ? `${c.pooled.trials} trials` : null, c.pooled.participants ? `${c.pooled.participants.toLocaleString("en-US")} participants` : null]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <li className="text-[0.72rem] text-gray-400 leading-relaxed">
      <span className="text-gray-300">
        {c.authors} ({c.year}).
      </span>{" "}
      {c.title}. <span className="italic">{c.venue}</span>
      {pooled && <span className="text-faint"> · {pooled}</span>}
      {c.effect && (
        <span className="block text-faint">
          {c.effect.metric}: {c.effect.value}
          {c.effect.unit ? ` ${c.effect.unit}` : ""}
          {c.effect.ci ? ` (${c.effect.ci[0]}–${c.effect.ci[1]})` : ""}
        </span>
      )}
    </li>
  );
}

/** A standing caveat. Used wherever the product could be mistaken for care. */
export function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.7rem] text-faint leading-relaxed border-l-2 border-white/10 pl-3">{children}</p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
}) {
  return (
    <header className="text-center max-w-3xl mx-auto">
      <Chip tone="gold">{eyebrow}</Chip>
      <h1 className="mt-4 text-3xl sm:text-4xl font-semibold leading-snug">{title}</h1>
      {lead && <p className="mt-3 text-sm sm:text-base text-gray-400 leading-relaxed">{lead}</p>}
      <div className="mt-6 mx-auto h-px w-16 bg-gradient-to-r from-gold to-gold-light" />
    </header>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-black font-semibold hover:bg-gold-light transition"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/15 text-gray-200 hover:bg-white/5 transition"
    >
      {children}
    </Link>
  );
}
