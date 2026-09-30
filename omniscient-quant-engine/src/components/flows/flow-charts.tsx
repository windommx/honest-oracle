'use client';

/**
 * กราฟของแดชบอร์ดเงินไหล (หุ้นไทย) — Recharts ที่ผูก syncId เดียวกัน (ชี้สัปดาห์ใดก็เห็นสัปดาห์เดียวกันทุกกราฟ)
 * สีกลุ่ม = ช่อง categorical 1–4 ที่ผ่าน validator (CVD/contrast) บนพื้นกราฟมืด #0f0f11 ตามลำดับคงที่
 * ทุกกราฟมี role="img" + aria-label สรุปค่าล่าสุด · กราฟ ≥ 2 เส้นมี legend พร้อมค่าล่าสุด · แท่งเทียนขึ้น = โปร่ง ลง = ทึบ (ไม่พึ่งสีอย่างเดียว)
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS, BASELINE, ChartFrame, GRID, RoundedEndBar, SURFACE, TOOLTIP, type LegendItem } from '@/components/charts/chart-kit';
import { thMonthTick } from '@/lib/flows/format';
import type { FlowGroup, FlowSeriesPoint } from '@/lib/flows/types';

export const FLOW_COLORS: Record<FlowGroup | 'short', string> = {
  foreign: '#3987e5',
  institution: '#d95926',
  prop: '#199e70',
  retail: '#c98500',
  nvdr: '#3987e5',
  others: '#d95926',
  short: '#199e70',
};
const UP = '#0ca30c';
const DOWN = '#d03b3b';

/** ล้านบาท: จำนวนเต็มคั่นหลักพัน */
export const fmtMb = (v: number) => Math.round(v).toLocaleString('en-US');
/** แกน: ตัวเลขเต็มคั่นหลักพัน · ≥ 1,000,000 ล้านบาท ย่อเป็น M */
const fmtAxis = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : fmtMb(v));
export const fmtSignedMb = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtMb(Math.abs(v))}`;

interface CandleProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: FlowSeriesPoint;
}

/** แท่งเทียนจาก ranged bar [low, high] — ขึ้น = ตัวแท่งโปร่ง (ขอบเขียว) · ลง = ทึบแดง */
function Candle(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props as CandleProps;
  if (!payload) return <g />;
  const { o, c, h, l } = payload;
  const ppu = h > l ? height / (h - l) : 0;
  const top = y + (h - Math.max(o, c)) * ppu;
  const bodyH = Math.max(1, Math.abs(o - c) * ppu);
  const up = c >= o;
  const color = up ? UP : DOWN;
  const cx = x + width / 2;
  const bw = Math.max(1, width * 0.64);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={top} stroke={color} strokeWidth={1} />
      <line x1={cx} x2={cx} y1={top + bodyH} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x + width * 0.18} y={top} width={bw} height={bodyH} fill={up ? SURFACE : color} stroke={color} strokeWidth={up ? 1 : 0} />
    </g>
  );
}

export function PriceChart({ title, data, decimals = 2 }: { title: string; data: FlowSeriesPoint[]; decimals?: number }) {
  const rows = data.map((p) => ({ ...p, range: [p.l, p.h] as [number, number] }));
  const last = data[data.length - 1];
  const first = data[0];
  const chg = first ? ((last.c / first.o - 1) * 100).toFixed(1) : '0';
  const top = Math.max(...data.map((p) => p.h));
  const axisDigits = top >= 100 ? 0 : top >= 10 ? 1 : 2;
  return (
    <ChartFrame
      title={title}
      height={190}
      label={`${title}: แท่งเทียนรายสัปดาห์ ${data.length} สัปดาห์ ปิดล่าสุด ${last?.c.toFixed(decimals)} เปลี่ยน ${chg}% ในช่วงที่แสดง`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} syncId="flows" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis domain={['auto', 'auto']} tick={AXIS} width={56} stroke={BASELINE} interval={0} tickFormatter={(v: number) => v.toFixed(axisDigits)} />
          <Tooltip
            {...TOOLTIP}
            formatter={(_v: unknown, _n: unknown, item: { payload?: FlowSeriesPoint }) => {
              const p = item.payload;
              return p ? [`O ${p.o.toFixed(decimals)} · H ${p.h.toFixed(decimals)} · L ${p.l.toFixed(decimals)} · C ${p.c.toFixed(decimals)}`, 'ราคา'] : ['', ''];
            }}
          />
          <Bar dataKey="range" shape={Candle} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export interface LineSpec {
  key: string;
  label: string;
  color: string;
  get: (p: FlowSeriesPoint) => number | null;
  dashed?: boolean;
}

/** กราฟเส้นหลายชุดบนแกนเดียว (หน่วยเดียวกัน) + legend ที่บอกค่าล่าสุดของแต่ละเส้น */
export function LinesChart({
  title,
  data,
  lines,
  height = 150,
  format = fmtMb,
  axisFormat = fmtAxis,
  zeroLine = true,
  fromZero = false,
}: {
  title: string;
  data: FlowSeriesPoint[];
  lines: LineSpec[];
  height?: number;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  /** เส้นอ้างอิงที่ 0 (ค่าที่มีเครื่องหมาย เช่น เงินไหลสุทธิ) */
  zeroLine?: boolean;
  /** แกนเริ่มที่ 0 (ขนาด เช่น มูลค่าซื้อขาย / % short) */
  fromZero?: boolean;
}) {
  const last = data[data.length - 1];
  const latest = (l: LineSpec) => {
    const v = last ? l.get(last) : null;
    return v === null ? '—' : format(v);
  };
  const summary = lines.map((l) => `${l.label} ${latest(l)}`).join(', ');
  return (
    <ChartFrame
      title={title}
      height={height}
      label={`${title}: ค่าล่าสุด ${summary}`}
      legend={lines.map((l) => ({ label: l.label, color: l.color, value: latest(l), dashed: l.dashed }))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} syncId="flows" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={56} stroke={BASELINE} interval={0} tickFormatter={axisFormat} domain={fromZero ? [0, 'auto'] : ['auto', 'auto']} />
          {zeroLine && <ReferenceLine y={0} stroke={BASELINE} />}
          <Tooltip {...TOOLTIP} formatter={(v: number | string, name: string) => [format(Number(v)), name]} />
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.get}
              name={l.label}
              stroke={l.color}
              strokeDasharray={l.dashed ? '5 3' : undefined}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function FlowIndexChart({ data, group }: { data: FlowSeriesPoint[]; group: string }) {
  const last = data[data.length - 1];
  const legend: LegendItem[] = [
    { label: '6 เดือน', color: '#f4f4f5', value: last?.flowIndex6m?.toFixed(1) ?? '—' },
    { label: '36 เดือน', color: '#a1a1aa', value: last?.flowIndex36m?.toFixed(1) ?? '—', dashed: true },
  ];
  return (
    <ChartFrame
      title={`Flow Index · ${group}`}
      height={150}
      legend={legend}
      note="ตำแหน่งของเงินไหลสุทธิสะสมเทียบช่วงต่ำสุด–สูงสุดในกรอบ 6 / 36 เดือน (0–100) · ≥ 80 = สะสมใกล้สูงสุดของกรอบ (ซื้อต่อเนื่อง) · ≤ 20 = ใกล้ต่ำสุด (ขายต่อเนื่อง)"
      label={`Flow Index (${group}): 6 เดือน ${last?.flowIndex6m ?? '—'}, 36 เดือน ${last?.flowIndex36m ?? '—'} (80–100 = เงินไหลสะสมสูงสุดในกรอบ, 0–20 = ต่ำสุดในกรอบ)`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} syncId="flows" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <ReferenceArea y1={80} y2={100} fill={UP} fillOpacity={0.16} />
          <ReferenceArea y1={0} y2={20} fill={DOWN} fillOpacity={0.16} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis domain={[0, 100]} ticks={[0, 20, 50, 80, 100]} tick={AXIS} width={56} stroke={BASELINE} />
          <Tooltip {...TOOLTIP} formatter={(v: number | string, name: string) => [`${Number(v).toFixed(1)}`, name]} />
          <Line type="stepAfter" dataKey="flowIndex6m" name="Flow Index 6 เดือน" stroke="#f4f4f5" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
          <Line
            type="stepAfter"
            dataKey="flowIndex36m"
            name="Flow Index 36 เดือน"
            stroke="#a1a1aa"
            strokeDasharray="5 3"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** แท่งเงินไหลสุทธิต่อกลุ่ม */
export function NetBars({ title, bars }: { title: string; bars: Array<{ label: string; value: number; color: string }> }) {
  return (
    <ChartFrame title={title} height={170} label={`${title}: ${bars.map((b) => `${b.label} ${fmtSignedMb(b.value)} ล้านบาท`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ ...AXIS, fontSize: 10 }} interval={0} stroke={BASELINE} />
          <YAxis tick={AXIS} width={52} stroke={BASELINE} interval={0} tickFormatter={fmtAxis} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number | string) => [`${fmtSignedMb(Number(v))} ล้านบาท`, 'สุทธิ']} />
          <Bar dataKey="value" isAnimationActive={false} shape={RoundedEndBar} maxBarSize={48}>
            {bars.map((b) => (
              <Cell key={b.label} fill={b.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** มาตรวัดครึ่งวงกลม 0–100 ของ Flow Index (SVG ล้วน) — โซนบอกเป็นข้อความเสมอ ไม่พึ่งสีอย่างเดียว */
export function IndexGauge({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const angle = Math.PI * (1 - v / 100);
  const r = 60;
  const cx = 75;
  const cy = 72;
  const end = { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
  const color = v >= 80 ? UP : v <= 20 ? DOWN : '#d4d4d8';
  const zone = v >= 80 ? 'สะสมสูงสุดในกรอบ' : v <= 20 ? 'สะสมต่ำสุดในกรอบ' : 'กลางกรอบ';
  return (
    <figure className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <svg viewBox="0 0 150 90" className="w-full max-w-[180px]" role="img" aria-label={`${label} ${v.toFixed(1)} (${zone})`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#3f3f46" strokeWidth={12} strokeLinecap="round" />
        {v > 0 && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#f4f4f5" fontSize="20" fontWeight="600">
          {v.toFixed(1)}
        </text>
      </svg>
      <figcaption className="text-center text-xs font-medium text-zinc-300">
        {label} <span className="text-zinc-400">· {zone}</span>
        {sub && <span className="block text-[11px] font-normal text-zinc-400">{sub}</span>}
      </figcaption>
    </figure>
  );
}

export interface ShareSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** สัดส่วนของทั้งหมด (part-to-whole) เป็นแท่งซ้อนแนวนอน เว้นช่อง 2px ระหว่างส่วน + ป้าย % ในส่วนที่กว้างพอ */
export function ShareBars({ title, rows }: { title: string; rows: Array<{ label: string; segments: ShareSegment[] }> }) {
  const legendKeys = rows[0]?.segments ?? [];
  const desc = rows
    .map((r) => {
      const total = r.segments.reduce((a, s) => a + s.value, 0) || 1;
      return `${r.label}: ${r.segments.map((s) => `${s.label} ${((s.value / total) * 100).toFixed(1)}%`).join(', ')}`;
    })
    .join(' · ');
  return (
    <section aria-label={title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <h3 className="mb-2 text-xs font-semibold text-zinc-200">{title}</h3>
      <div role="img" aria-label={`${title} — ${desc}`} className="space-y-2">
        {rows.map((r) => {
          const total = r.segments.reduce((a, s) => a + s.value, 0) || 1;
          return (
            <div key={r.label} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <span className="text-[11px] text-zinc-300">{r.label}</span>
              <div className="flex h-6 gap-[2px] overflow-hidden rounded">
                {r.segments.map((s) => {
                  const pct = (s.value / total) * 100;
                  return (
                    <div key={s.key} className="flex items-center justify-center" style={{ width: `${pct}%`, background: s.color }}>
                      {pct >= 9 && <span className="font-mono text-[10.5px] font-semibold text-zinc-950">{pct.toFixed(0)}%</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-300">
        {legendKeys.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** มาตรวัดอัตราส่วนเดียวเทียบเพดาน (แทนวงกลม 2 ชิ้น) */
export function Meter({ label, value, max, color, caption }: { label: string; value: number; max: number; color: string; caption?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-sm font-semibold text-zinc-50">{value.toFixed(1)}%</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 w-full overflow-hidden rounded bg-zinc-800"
      >
        <div className="h-full rounded" style={{ width: `${w}%`, background: color }} />
      </div>
      {caption && <p className="mt-1 text-[11px] text-zinc-400">{caption}</p>}
    </div>
  );
}
