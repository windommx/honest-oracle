"use client";

import { useId } from "react";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Two charts, drawn as inline SVG.                                        ║
// ║                                                                          ║
// ║  A charting library would have been ~80 kB of JavaScript for an equity   ║
// ║  line and a percentile fan. These are paths computed from the same       ║
// ║  numbers the tables show, which also means the chart cannot disagree     ║
// ║  with the figures beside it.                                             ║
// ║                                                                          ║
// ║  Both are labelled for screen readers and both degrade to "not enough    ║
// ║  data" rather than rendering a misleading flat line.                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const W = 600;
const H = 180;
const PAD = 4;

function scale(values: number[], height = H) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (v: number) => height - PAD - ((v - min) / span) * (height - PAD * 2);
}

function pathFor(values: number[], y: (v: number) => number): string {
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(PAD + i * step).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
}

export function EquityChart({
  values,
  label,
  baseline,
}: {
  values: number[];
  label: string;
  /** Draws a dashed reference line — the starting capital. */
  baseline?: number;
}) {
  const gradientId = useId();
  if (values.length < 2) {
    return <p className="py-8 text-center text-xs text-zinc-400">ข้อมูลไม่พอสำหรับวาดกราฟ</p>;
  }

  const all = baseline === undefined ? values : [...values, baseline];
  const y = scale(all);
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "#34d399" : "#f87171";
  const step = (W - PAD * 2) / (values.length - 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-44 w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline !== undefined && (
        <line
          x1={PAD}
          x2={W - PAD}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="#52525b"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
      )}
      <path
        d={`${pathFor(values, y)} L${(PAD + (values.length - 1) * step).toFixed(1)},${H} L${PAD},${H} Z`}
        fill={`url(#${gradientId})`}
      />
      <path d={pathFor(values, y)} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FanChart({
  lo,
  med,
  hi,
  label,
}: {
  lo: number[];
  med: number[];
  hi: number[];
  label: string;
}) {
  if (med.length < 2) {
    return <p className="py-8 text-center text-xs text-zinc-400">ข้อมูลไม่พอสำหรับวาดกราฟ</p>;
  }
  const y = scale([...lo, ...hi]);
  const step = (W - PAD * 2) / (med.length - 1);
  const band =
    `${pathFor(hi, y)} ` +
    lo
      .map((v, i) => `L${(PAD + (lo.length - 1 - i) * step).toFixed(1)},${y(lo[lo.length - 1 - i]).toFixed(1)}`)
      .join(" ") +
    " Z";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <path d={band} fill="#34d399" fillOpacity="0.14" />
      <path d={pathFor(hi, y)} fill="none" stroke="#34d399" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={pathFor(lo, y)} fill="none" stroke="#f87171" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={pathFor(med, y)} fill="none" stroke="#e4e4e7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
