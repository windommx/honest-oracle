"use client";

import { COMPETENCY_LEVELS } from "@/lib/competency/criteria";
import { levelInfo } from "@/lib/competency/scoring";
import { GRID, TEAM_SERIES, TEXT_BODY, TEXT_SECONDARY, ACCENT } from "./_tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  CHARTS — plain SVG, no chart library. Each one is a pure function ║
// ║  of its props (viewBox-scaled, so it needs no measuring), carries  ║
// ║  role="img" + an aria-label that states the numbers, and prints   ║
// ║  as vectors. Every value drawn is also written as text next to    ║
// ║  its mark, so nothing is conveyed by colour alone.                ║
// ╚══════════════════════════════════════════════════════════════════╝

const FONT = "font-family: inherit";

// ── Level distribution: five columns ─────────────────────────────────────────

export function LevelDistributionChart({ data }: { data: Array<{ level: number; count: number }> }) {
  const W = 600;
  const H = 240;
  const padL = 28;
  const padR = 12;
  const padT = 28;
  const padB = 52;
  const max = Math.max(1, ...data.map((d) => d.count));
  const cols = data.length || 1;
  const slot = (W - padL - padR) / cols;
  const barW = Math.min(64, slot * 0.6);
  const plotH = H - padT - padB;
  const label = data.map((d) => `LEVEL ${d.level} ${levelInfo(d.level).thName} ${d.count} คน`).join(", ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`การกระจายตามระดับ: ${label}`}>
      <title>การกระจายตามระดับ Competency</title>
      {[0, 0.5, 1].map((t) => {
        const y = padT + plotH * (1 - t);
        return <line key={t} x1={padL} x2={W - padR} y1={y} y2={y} stroke={GRID} strokeDasharray={t === 0 ? undefined : "4 4"} />;
      })}
      {data.map((d, i) => {
        const info = levelInfo(d.level);
        const h = (d.count / max) * plotH;
        const x = padL + slot * i + (slot - barW) / 2;
        const y = padT + plotH - h;
        return (
          <g key={d.level}>
            <rect x={x} y={y} width={barW} height={h} rx={6} fill={info.color} />
            <text x={x + barW / 2} y={y - 8} textAnchor="middle" fontSize={14} fontWeight={600} fill={TEXT_BODY} style={{ font: FONT }}>
              {d.count}
            </text>
            <text x={x + barW / 2} y={H - padB + 18} textAnchor="middle" fontSize={13} fontWeight={600} fill={TEXT_BODY}>
              L{d.level}
            </text>
            <text x={x + barW / 2} y={H - padB + 36} textAnchor="middle" fontSize={11} fill={TEXT_SECONDARY}>
              {info.thName}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Horizontal bars (criteria averages, per-nurse totals) ────────────────────

export interface HBarItem {
  key: string;
  label: string;
  value: number;
  /** Text drawn after the bar; defaults to the value. */
  display?: string;
  color?: string;
}

export function HBarChart({ items, max, ariaLabel, labelWidth = 150 }: { items: HBarItem[]; max: number; ariaLabel: string; labelWidth?: number }) {
  const W = 600;
  const rowH = 30;
  const padT = 8;
  const padR = 64;
  const H = padT * 2 + rowH * Math.max(1, items.length);
  const plotW = W - labelWidth - padR;
  const summary = items.map((i) => `${i.label} ${i.display ?? i.value}`).join(", ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${ariaLabel}: ${summary}`}>
      <title>{ariaLabel}</title>
      {[0.25, 0.5, 0.75, 1].map((t) => {
        const x = labelWidth + plotW * t;
        return <line key={t} x1={x} x2={x} y1={padT} y2={H - padT} stroke={GRID} strokeDasharray="4 4" />;
      })}
      {items.map((it, i) => {
        const y = padT + rowH * i;
        const w = Math.max(0, Math.min(1, it.value / max)) * plotW;
        return (
          <g key={it.key}>
            <text x={labelWidth - 10} y={y + rowH / 2 + 4} textAnchor="end" fontSize={13} fill={TEXT_BODY}>
              {it.label}
            </text>
            <rect x={labelWidth} y={y + 6} width={w} height={rowH - 12} rx={5} fill={it.color ?? ACCENT} />
            <text x={labelWidth + w + 8} y={y + rowH / 2 + 4} fontSize={13} fontWeight={600} fill={TEXT_BODY}>
              {it.display ?? it.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Radar: one nurse's ten points against the team mean ──────────────────────

export interface RadarSeries {
  name: string;
  values: number[];
  color: string;
  fillOpacity?: number;
}

function polar(cx: number, cy: number, r: number, i: number, n: number): [number, number] {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function RadarChart({ axes, series, max = 5 }: { axes: string[]; series: RadarSeries[]; max?: number }) {
  // Wider than tall: the axis labels sit R+26 out from the centre and the Thai ones run
  // ~80px, so a square 420 box clipped "แนะนำคนไข้" and "ผู้นำ/coaching" at the left edge.
  const W = 560;
  const H = 420;
  const cx = W / 2;
  const cy = H / 2;
  const R = 140;
  const n = axes.length;
  const rings = Array.from({ length: max }, (_, i) => i + 1);
  const summary = series
    .map((s) => `${s.name}: ${axes.map((a, i) => `${a} ${s.values[i] ?? 0}`).join(", ")}`)
    .join(" · ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-lg" role="img" aria-label={`โปรไฟล์สมรรถนะ (ระดับ 1-${max}) — ${summary}`}>
      <title>โปรไฟล์สมรรถนะรายเกณฑ์</title>
      {rings.map((ring) => {
        const pts = axes.map((_, i) => polar(cx, cy, (R * ring) / max, i, n).join(",")).join(" ");
        return <polygon key={ring} points={pts} fill="none" stroke={GRID} />;
      })}
      {axes.map((a, i) => {
        const [x, y] = polar(cx, cy, R, i, n);
        const [lx, ly] = polar(cx, cy, R + 26, i, n);
        const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
        return (
          <g key={a}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} />
            <text x={lx} y={ly + 4} textAnchor={anchor} fontSize={11} fill={TEXT_SECONDARY}>
              {a}
            </text>
          </g>
        );
      })}
      {series.map((s) => {
        const pts = axes
          .map((_, i) => polar(cx, cy, (R * Math.max(0, Math.min(max, s.values[i] ?? 0))) / max, i, n).join(","))
          .join(" ");
        return (
          <g key={s.name}>
            <polygon points={pts} fill={s.color} fillOpacity={s.fillOpacity ?? 0.3} stroke={s.color} strokeWidth={2} />
          </g>
        );
      })}
      <text x={cx + 4} y={cy - R - 4} fontSize={10} fill={TEXT_SECONDARY}>
        {max}
      </text>
    </svg>
  );
}

export const TEAM_COLOR = TEAM_SERIES;

// ── Trend: total score over successive assessments ───────────────────────────

export function TrendChart({ points }: { points: Array<{ label: string; value: number; level: number }> }) {
  const W = 600;
  const H = 220;
  const padL = 36;
  const padR = 16;
  const padT = 14;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH * (1 - Math.max(0, Math.min(100, v)) / 100);
  const summary = points.map((p) => `${p.label} ${p.value}`).join(", ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`แนวโน้มคะแนนรวม: ${summary}`}>
      <title>แนวโน้มคะแนนรวมตามครั้งที่ประเมิน</title>
      {COMPETENCY_LEVELS.filter((l) => l.level > 1).map((l) => (
        <g key={l.level}>
          <line x1={padL} x2={W - padR} y1={y(l.min)} y2={y(l.min)} stroke={l.color} strokeOpacity={0.35} strokeDasharray="3 5" />
          <text x={W - padR} y={y(l.min) - 3} textAnchor="end" fontSize={10} fill={l.color}>
            L{l.level} ≥ {l.min}
          </text>
        </g>
      ))}
      {[0, 50, 100].map((v) => (
        <text key={v} x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={TEXT_SECONDARY}>
          {v}
        </text>
      ))}
      {n > 1 && (
        <polyline fill="none" stroke={ACCENT} strokeWidth={2.5} points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
      )}
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle cx={x(i)} cy={y(p.value)} r={5} fill={levelInfo(p.level).color} stroke="#fff" strokeWidth={2} />
          <text x={x(i)} y={y(p.value) - 10} textAnchor="middle" fontSize={12} fontWeight={600} fill={TEXT_BODY}>
            {p.value}
          </text>
          <text x={x(i)} y={H - padB + 18} textAnchor="middle" fontSize={11} fill={TEXT_SECONDARY}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
