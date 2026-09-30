'use client';

/**
 * ชิ้นส่วนกราฟที่ใช้ร่วมกัน (แดชบอร์ดเงินไหล · จังหวะตลาด) — พื้นกราฟมืด #0f0f11 (zinc-900/40 บน zinc-950)
 * ข้อความใช้สีหมึก (zinc) เสมอ ไม่ใช้สีของ series · กริดเส้นเดียวจาง · กราฟ ≥ 2 ชุดมี legend
 */

import type { ReactNode } from 'react';

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
  /** รูปของ swatch: เส้น (ค่าเริ่มต้น) · ช่องสี (แท่ง/พื้นที่) */
  shape?: 'line' | 'box';
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-300">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.shape === 'box' ? (
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: it.color }} aria-hidden />
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
