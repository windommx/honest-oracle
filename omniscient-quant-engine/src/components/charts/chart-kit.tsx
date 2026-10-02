'use client';

/**
 * ชิ้นส่วนกราฟที่ใช้ร่วมกัน (แดชบอร์ดเงินไหล · จังหวะตลาด) — พื้นกราฟมืด #0f0f11 (zinc-900/40 บน zinc-950)
 * ข้อความใช้สีหมึก (zinc) เสมอ ไม่ใช้สีของ series · กริดเส้นเดียวจาง · กราฟ ≥ 2 ชุดมี legend
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const SURFACE = '#0f0f11';
export const AXIS = { fontSize: 10, fill: '#a1a1aa' };
export const GRID = '#27272a';
export const BASELINE = '#52525b';
export const TOOLTIP = {
  contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 },
  labelStyle: { color: '#d4d4d8' },
  itemStyle: { padding: 0 },
};

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
  dashed?: boolean;
  /** รูปของ swatch: เส้น (ค่าเริ่มต้น) · ช่องสี (แท่ง/พื้นที่) · กรอบโปร่ง (แท่งโปร่ง) · จุดทึบ · วงโปร่ง */
  shape?: 'line' | 'box' | 'outline' | 'dot' | 'ring';
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-300">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.shape === 'box' || it.shape === 'outline' || it.shape === 'dot' || it.shape === 'ring' ? (
            <span
              className={cn('inline-block h-2.5 w-2.5 shrink-0', it.shape === 'dot' || it.shape === 'ring' ? 'rounded-full' : 'rounded-sm')}
              style={it.shape === 'box' || it.shape === 'dot' ? { background: it.color } : { boxShadow: `inset 0 0 0 1.5px ${it.color}` }}
              aria-hidden
            />
          ) : (
            <svg width="14" height="6" aria-hidden className="shrink-0">
              <line x1="0" y1="3" x2="14" y2="3" stroke={it.color} strokeWidth="2" strokeDasharray={it.dashed ? '4 2' : undefined} />
            </svg>
          )}
          {it.label}
          {it.value !== undefined && <span className="font-mono text-zinc-100">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame({
  title,
  label,
  height,
  legend,
  note,
  children,
}: {
  title: string;
  label: string;
  height: number;
  legend?: LegendItem[];
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">{title}</figcaption>
      {legend && legend.length > 1 && <Legend items={legend} />}
      {/* ตัวกราฟข้างในซ่อนจาก AT: ชื่อ/สรุปอยู่ที่ role="img" ชั้นนอกแล้ว (Recharts ใส่ role="img" ไร้ชื่อให้จุดของ scatter ทุกจุด) */}
      <div role="img" aria-label={label} style={{ height }} className="w-full">
        <div aria-hidden="true" className="h-full w-full">
          {children}
        </div>
      </div>
      {note && <div className="mt-1 text-[11px] leading-snug text-zinc-400">{note}</div>}
    </figure>
  );
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: { value: number };
}

/** แท่งที่มุมโค้ง 4px เฉพาะปลายข้อมูล (ด้านที่ห่างจากเส้นฐาน) */
export function RoundedEndBar(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props as BarShapeProps;
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  if (h < 0.5 || width <= 0) return <g />;
  const r = Math.min(4, h, width / 2);
  const up = (payload?.value ?? 0) >= 0;
  const d = up
    ? `M ${x} ${top + h} L ${x} ${top + r} Q ${x} ${top} ${x + r} ${top} L ${x + width - r} ${top} Q ${x + width} ${top} ${x + width} ${top + r} L ${x + width} ${top + h} Z`
    : `M ${x} ${top} L ${x + width} ${top} L ${x + width} ${top + h - r} Q ${x + width} ${top + h} ${x + width - r} ${top + h} L ${x + r} ${top + h} Q ${x} ${top + h} ${x} ${top + h - r} Z`;
  return <path d={d} fill={fill} />;
}

// ─── สี: categorical ที่ผ่าน validator + diverging น้ำเงิน↔แดง + หมึกบนพื้นสี (ใช้ร่วมหน้าจังหวะตลาด/Atlas) ───

/** ช่อง categorical 1–6 (โหมดมืด) — ลำดับคงที่ สีผูกกับตัวตน ไม่ใช่อันดับ */
export const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
export const DIV_MID = '#383835';
export const DIV_POS = ['#414f5e', '#49678a', '#507fb7', '#5598e7'];
export const DIV_NEG = ['#624541', '#8c524e', '#b85d5a', '#e66767'];
const INK_DARK = '#0f0f11';

function relLum(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** สีตัวอักษรบนพื้นสี: ขาวหรือดำ แล้วแต่ตัวไหน contrast สูงกว่า */
export const inkOn = (fill: string) => (contrastRatio(fill, '#ffffff') >= contrastRatio(fill, INK_DARK) ? '#ffffff' : INK_DARK);

/** สีแบบแบ่งขั้น 4 ขั้นต่อฝั่ง · |v| ≥ max = ขั้นเข้มสุด · 0 = เทากลาง */
export function divergingColor(v: number, max: number): string {
  if (max <= 0 || v === 0) return DIV_MID;
  const t = Math.min(1, Math.abs(v) / max);
  const step = Math.max(0, Math.min(3, Math.ceil(t * 4) - 1));
  return (v > 0 ? DIV_POS : DIV_NEG)[step];
}

/** เพดานสเกลแบบทนค่าผิดปกติ: เปอร์เซ็นไทล์ 95 ของ |ค่า| */
export function robustMax(values: number[]): number {
  const abs = values.map(Math.abs).sort((a, b) => a - b);
  if (!abs.length) return 0;
  return abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.95))] || abs[abs.length - 1];
}

export function DivergingLegend({ neg, pos, note }: { neg: string; pos: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-300">
      <span>{neg}</span>
      <span className="flex gap-[2px]" aria-hidden>
        {[...DIV_NEG].reverse().map((c) => (
          <span key={c} className="h-3 w-4 rounded-[2px]" style={{ background: c }} />
        ))}
        <span className="h-3 w-4 rounded-[2px]" style={{ background: DIV_MID }} />
        {DIV_POS.map((c) => (
          <span key={c} className="h-3 w-4 rounded-[2px]" style={{ background: c }} />
        ))}
      </span>
      <span>{pos}</span>
      {note && <span className="text-zinc-400">· {note}</span>}
    </div>
  );
}

/** ramp ลำดับค่า (น้ำเงินเฉดเดียว · มืด = น้อย → สว่าง = มาก บนพื้นมืด) จากขั้นที่บันทึกไว้ 700 → 200 */
const SEQ = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'];
/** สีตามขนาด (0 = ไม่มีสี) แบ่ง 6 ขั้นเทียบเพดาน max */
export function sequentialColor(v: number, max: number): string | null {
  if (!(v > 0) || max <= 0) return null;
  const step = Math.max(0, Math.min(SEQ.length - 1, Math.ceil((Math.min(v, max) / max) * SEQ.length) - 1));
  return SEQ[step];
}
export const SEQUENTIAL = SEQ;

// ─── ชิ้นส่วน tooltip / ป้ายในกราฟ / tick (ใช้ร่วมหน้าจังหวะตลาด/Atlas) ───

/** tick จำนวนเต็มที่อ่านง่าย (ก้าว 1/2/5 × 10^k) ครอบช่วง [lo, hi] */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  const raw = Math.max(1e-9, (hi - lo) / target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export interface TipItem<T> {
  payload?: T;
  value?: number | string;
  name?: string;
  color?: string;
}
export interface TipProps<T> {
  active?: boolean;
  payload?: Array<TipItem<T>>;
  label?: string | number;
}
export interface ViewBox {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function TipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="mb-0.5 font-medium text-zinc-200">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-1.5 text-zinc-300">
          {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} aria-hidden />}
          {r.label} <span className="ml-auto pl-3 font-mono text-zinc-50">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** ข้อความในกราฟ SVG ที่อ่านออกบนเส้น/แท่งด้านหลัง (ขอบสีพื้นรอบตัวอักษร) */
export function HaloText({ x, y, anchor, fill, size = 10, weight, children }: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; fill: string; size?: number; weight?: number; children: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fill={fill} fontSize={size} fontWeight={weight} stroke={SURFACE} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
      {children}
    </text>
  );
}
