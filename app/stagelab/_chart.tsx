"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { fmt, fmtBaht } from "@/lib/stagelab/utils";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Charts, drawn as inline SVG.                                            ║
// ║                                                                          ║
// ║  The first version of this file drew a bare path with                    ║
// ║  `preserveAspectRatio="none"` and no axes. Two problems with that, and   ║
// ║  they are the reason this file was rewritten rather than tweaked:        ║
// ║                                                                          ║
// ║   1. A line with no scale is decoration. "Equity went up" is not a       ║
// ║      finding; "equity went from ฿1.0M to ฿2.4M, with a 31% hole in       ║
// ║      2024" is. Axes are what turn the first into the second.             ║
// ║   2. Non-uniform scaling stretches glyphs, so the moment a label is      ║
// ║      added the type distorts with the container.                        ║
// ║                                                                          ║
// ║  So: the container is measured and the SVG is drawn at real pixel size,  ║
// ║  which also makes pointer-to-data mapping exact instead of approximate.  ║
// ║                                                                          ║
// ║  Every chart also renders its numbers as a real table for screen readers ║
// ║  and for anyone who would rather read them — a chart is a summary of     ║
// ║  data, never the only copy of it.                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const MARGIN = { top: 10, right: 12, bottom: 22, left: 54 };
const MIN_HEIGHT = 180;

/** Measure a container so the SVG can be drawn in real pixels. */
function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: MIN_HEIGHT });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () =>
      setSize({ width: node.clientWidth, height: Math.max(MIN_HEIGHT, node.clientHeight) });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

/**
 * Round a range outward to human numbers.
 *
 * Auto-scaling to the exact min and max gives axis labels like ฿1,037,412 —
 * technically accurate and impossible to read at a glance.
 */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const rawStep = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks.length >= 2 ? ticks : [min, max];
}

export interface Series {
  label: string;
  values: number[];
  color: string;
  /** Dashed lines read as "reference", not "result". */
  dashed?: boolean;
}

export interface Band {
  lo: number[];
  hi: number[];
  color: string;
}

function formatValue(v: number, kind: "baht" | "plain"): string {
  if (kind === "plain") return fmt(v, 2);
  if (Math.abs(v) >= 1_000_000) return `฿${fmt(v / 1_000_000, 2)}M`;
  if (Math.abs(v) >= 1_000) return `฿${fmt(v / 1_000, 0)}k`;
  return fmtBaht(v);
}

/**
 * A line chart with axes, an optional percentile band, and a hover readout.
 *
 * `xLabels` are used for the axis and the readout; when absent the index is
 * shown, which is right for a Monte Carlo (step number) and wrong for an
 * equity curve (date) — so callers pass them.
 */
export function LineChart({
  series,
  band,
  xLabels,
  valueKind = "baht",
  caption,
  height = 200,
}: {
  series: Series[];
  band?: Band;
  xLabels?: string[];
  valueKind?: "baht" | "plain";
  caption: string;
  height?: number;
}) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const gradientId = useId();
  const tableId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const primary = series[0];
  const length = primary?.values.length ?? 0;

  const plotW = Math.max(0, size.width - MARGIN.left - MARGIN.right);
  const plotH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const all = [
    ...series.flatMap((s) => s.values),
    ...(band ? [...band.lo, ...band.hi] : []),
  ].filter(Number.isFinite);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const pad = (max - min) * 0.06 || 1;
  const yMin = min - pad;
  const yMax = max + pad;

  const x = useCallback(
    (i: number) => (length > 1 ? MARGIN.left + (i / (length - 1)) * plotW : MARGIN.left),
    [length, plotW],
  );
  const y = useCallback(
    (v: number) => MARGIN.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH,
    [plotH, yMin, yMax],
  );

  const onPointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (length < 2 || plotW <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left - MARGIN.left;
      const i = Math.round((px / plotW) * (length - 1));
      setHover(Math.max(0, Math.min(length - 1, i)));
    },
    [length, plotW],
  );

  if (length < 2) {
    return <p className="py-10 text-center text-xs text-zinc-400">ข้อมูลไม่พอสำหรับวาดกราฟ</p>;
  }

  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const ticks = niceTicks(yMin, yMax);
  const xTickIdx = [0, Math.floor((length - 1) / 2), length - 1];
  const first = primary.values[0];
  const last = primary.values[length - 1];

  return (
    <figure className="m-0">
      <div ref={ref} className="w-full" style={{ height }}>
        {size.width > 0 && (
          <svg
            width={size.width}
            height={height}
            role="img"
            aria-label={`${caption} จาก ${formatValue(first, valueKind)} ถึง ${formatValue(last, valueKind)}`}
            aria-describedby={tableId}
            onPointerMove={onPointer}
            onPointerLeave={() => setHover(null)}
            className="touch-none"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primary.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={primary.color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* horizontal gridlines + y labels */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#27272a"
                  strokeWidth="1"
                />
                <text
                  x={MARGIN.left - 6}
                  y={y(t) + 3}
                  textAnchor="end"
                  className="fill-zinc-400"
                  style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
                >
                  {formatValue(t, valueKind)}
                </text>
              </g>
            ))}

            {/* x labels */}
            {xLabels &&
              xTickIdx.map((i) => (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 6}
                  textAnchor={i === 0 ? "start" : i === length - 1 ? "end" : "middle"}
                  className="fill-zinc-400"
                  style={{ fontSize: 10 }}
                >
                  {xLabels[i] ?? ""}
                </text>
              ))}

            {/* percentile band */}
            {band && (
              <path
                d={`${path(band.hi)} ${band.lo
                  .map((_, k) => {
                    const i = band.lo.length - 1 - k;
                    return `L${x(i).toFixed(1)},${y(band.lo[i]).toFixed(1)}`;
                  })
                  .join(" ")} Z`}
                fill={band.color}
                fillOpacity="0.13"
              />
            )}

            {/* area under the primary series */}
            <path
              d={`${path(primary.values)} L${x(length - 1).toFixed(1)},${(MARGIN.top + plotH).toFixed(1)} L${MARGIN.left},${(MARGIN.top + plotH).toFixed(1)} Z`}
              fill={`url(#${gradientId})`}
            />

            {series.map((s) => (
              <path
                key={s.label}
                d={path(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.25 : 1.75}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                strokeLinejoin="round"
              />
            ))}

            {/* hover rule + dots */}
            {hover !== null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={MARGIN.top}
                  y2={MARGIN.top + plotH}
                  stroke="#71717a"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                {series.map((s) => (
                  <circle
                    key={s.label}
                    cx={x(hover)}
                    cy={y(s.values[hover])}
                    r="3"
                    fill={s.color}
                    stroke="#09090b"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>

      <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[0.7rem]">
        <span className="flex flex-wrap items-center gap-3">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 text-zinc-300">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded"
                style={{
                  background: s.dashed
                    ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)`
                    : s.color,
                }}
              />
              {s.label}
              {hover !== null && (
                <span className="font-mono tabular-nums text-zinc-100">
                  {formatValue(s.values[hover], valueKind)}
                </span>
              )}
            </span>
          ))}
          {hover !== null && xLabels?.[hover] && (
            <span className="font-mono text-zinc-400">{xLabels[hover]}</span>
          )}
        </span>
        <button
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="rounded px-1.5 py-0.5 text-zinc-400 underline-offset-2 hover:text-zinc-100 hover:underline"
        >
          {showTable ? "ซ่อนตาราง" : "ดูเป็นตาราง"}
        </button>
      </figcaption>

      <DataTable
        id={tableId}
        visible={showTable}
        series={series}
        xLabels={xLabels}
        valueKind={valueKind}
        caption={caption}
      />
    </figure>
  );
}

/**
 * The same numbers as a table.
 *
 * Kept in the DOM even when visually hidden so a screen reader reaches it via
 * aria-describedby, and thinned to at most 24 rows because reading 312 weekly
 * equity marks aloud helps nobody.
 */
function DataTable({
  id,
  visible,
  series,
  xLabels,
  valueKind,
  caption,
}: {
  id: string;
  visible: boolean;
  series: Series[];
  xLabels?: string[];
  valueKind: "baht" | "plain";
  caption: string;
}) {
  const length = series[0]?.values.length ?? 0;
  const stride = Math.max(1, Math.ceil(length / 24));
  const rows: number[] = [];
  for (let i = 0; i < length; i += stride) rows.push(i);
  if (rows[rows.length - 1] !== length - 1) rows.push(length - 1);

  return (
    <div
      id={id}
      className={visible ? "mt-2 max-h-64 overflow-y-auto" : "sr-only"}
    >
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th className="border-b border-zinc-800 px-2 py-1 text-left text-zinc-400">จุด</th>
            {series.map((s) => (
              <th key={s.label} className="border-b border-zinc-800 px-2 py-1 text-right text-zinc-400">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i}>
              <td className="border-b border-zinc-800/60 px-2 py-1 text-zinc-300">
                {xLabels?.[i] ?? i}
              </td>
              {series.map((s) => (
                <td
                  key={s.label}
                  className="border-b border-zinc-800/60 px-2 py-1 text-right font-mono tabular-nums text-zinc-200"
                >
                  {formatValue(s.values[i], valueKind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CHART_COLORS = {
  strategy: "#34d399",
  benchmark: "#a1a1aa",
  loss: "#f87171",
  median: "#e4e4e7",
  band: "#34d399",
} as const;
