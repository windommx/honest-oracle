'use client';

/**
 * กราฟของแดชบอร์ด COT — Recharts ที่ผูก syncId เดียวกัน (เลื่อนเมาส์บนกราฟใดก็เห็นสัปดาห์เดียวกันทุกกราฟ)
 * ทุกกราฟมี role="img" + aria-label สรุปค่าล่าสุด (screen reader ไม่ต้องอ่าน SVG)
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
import type { CotSeriesPoint } from '@/lib/cot/types';

export const COT_COLORS = {
  commercials: '#ef4444',
  largeSpecs: '#22c55e',
  smallTraders: '#3b82f6',
  producer: '#ef4444',
  swap: '#22c55e',
  managed: '#3b82f6',
  other: '#eab308',
  nonrept: '#a1a1aa',
  up: '#34d399',
  down: '#a78bfa',
} as const;

const AXIS = { fontSize: 10, fill: '#a1a1aa' };
const GRID = '#27272a';
const TOOLTIP = {
  contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 },
  labelStyle: { color: '#d4d4d8' },
  itemStyle: { padding: 0 },
};

export const fmtK = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
};
const fmtInt = (v: number) => Math.round(v).toLocaleString('en-US');
const monthTick = (d: string) => {
  const [y, m] = d.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${y.slice(2)}`;
};

function ChartFrame({ title, label, height, children }: { title: string; label: string; height: number; children: React.ReactNode }) {
  return (
    <figure className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">{title}</figcaption>
      <div role="img" aria-label={label} style={{ height }} className="w-full">
        {children}
      </div>
    </figure>
  );
}

interface CandleProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CotSeriesPoint;
}

/** แท่งเทียนจาก ranged bar [low, high] — ตัวแท่ง open/close คำนวณจากสัดส่วนความสูง */
function Candle(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props as CandleProps;
  if (!payload) return <g />;
  const { o, c, h, l } = payload;
  const ppu = h > l ? height / (h - l) : 0;
  const top = y + (h - Math.max(o, c)) * ppu;
  const bodyH = Math.max(1, Math.abs(o - c) * ppu);
  const color = c >= o ? COT_COLORS.up : COT_COLORS.down;
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x + width * 0.18} y={top} width={Math.max(1, width * 0.64)} height={bodyH} fill={color} />
    </g>
  );
}

export function PriceChart({ data, decimals }: { data: CotSeriesPoint[]; decimals: number }) {
  const rows = data.map((p) => ({ ...p, range: [p.l, p.h] as [number, number] }));
  const last = data[data.length - 1];
  const first = data[0];
  const chg = first ? ((last.c / first.o - 1) * 100).toFixed(1) : '0';
  return (
    <ChartFrame
      title="Price Chart"
      height={190}
      label={`กราฟแท่งเทียนรายสัปดาห์ ${data.length} สัปดาห์ ราคาปิดล่าสุด ${last?.c.toFixed(decimals)} เปลี่ยน ${chg}% ในช่วงที่แสดง`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} syncId="cot" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={monthTick} minTickGap={40} />
          <YAxis domain={['auto', 'auto']} tick={AXIS} width={56} tickFormatter={(v: number) => v.toFixed(decimals > 2 ? 2 : decimals)} />
          <Tooltip
            {...TOOLTIP}
            formatter={(_v: unknown, _n: unknown, item: { payload?: CotSeriesPoint }) => {
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

export function NetLinesChart({
  title,
  data,
  lines,
  height = 150,
}: {
  title: string;
  data: CotSeriesPoint[];
  lines: Array<{ key: keyof CotSeriesPoint; label: string; color: string }>;
  height?: number;
}) {
  const last = data[data.length - 1];
  const summary = lines.map((l) => `${l.label} ${fmtInt(Number(last?.[l.key] ?? 0))}`).join(', ');
  return (
    <ChartFrame title={title} height={height} label={`${title}: สถานะสุทธิล่าสุด ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} syncId="cot" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={monthTick} minTickGap={40} />
          <YAxis tick={AXIS} width={56} tickFormatter={fmtK} />
          <ReferenceLine y={0} stroke="#52525b" />
          <Tooltip {...TOOLTIP} formatter={(v: number | string, name: string) => [fmtInt(Number(v)), name]} />
          {lines.map((l) => (
            <Line key={String(l.key)} type="monotone" dataKey={l.key as string} name={l.label} stroke={l.color} dot={false} strokeWidth={1.6} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function OpenInterestChart({ data }: { data: CotSeriesPoint[] }) {
  const last = data[data.length - 1];
  return (
    <ChartFrame title="Open Interest" height={130} label={`Open interest ล่าสุด ${fmtInt(last?.openInterest ?? 0)} สัญญา`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} syncId="cot" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={monthTick} minTickGap={40} />
          <YAxis tick={AXIS} width={56} tickFormatter={fmtK} domain={['auto', 'auto']} />
          <Tooltip {...TOOLTIP} formatter={(v: number | string) => [fmtInt(Number(v)), 'Open interest']} />
          <Line type="monotone" dataKey="openInterest" stroke="#c084fc" dot={false} strokeWidth={1.6} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CotIndexChart({ data, group }: { data: CotSeriesPoint[]; group: string }) {
  const last = data[data.length - 1];
  return (
    <ChartFrame
      title={`COT Index · ${group}`}
      height={150}
      label={`COT Index ของ ${group}: 6 เดือน ${last?.cotIndex6m ?? '—'}, 36 เดือน ${last?.cotIndex36m ?? '—'} (เขียว = 80–100 สุดขั้วบน, แดง = 0–20 สุดขั้วล่าง)`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} syncId="cot" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <ReferenceArea y1={80} y2={100} fill="#16a34a" fillOpacity={0.22} />
          <ReferenceArea y1={0} y2={20} fill="#dc2626" fillOpacity={0.22} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={monthTick} minTickGap={40} />
          <YAxis domain={[0, 100]} ticks={[0, 20, 50, 80, 100]} tick={AXIS} width={56} />
          <Tooltip {...TOOLTIP} formatter={(v: number | string, name: string) => [`${Number(v).toFixed(1)}`, name]} />
          <Line type="stepAfter" dataKey="cotIndex6m" name="COT Index 6 Month" stroke="#f4f4f5" dot={false} strokeWidth={1.4} isAnimationActive={false} connectNulls />
          <Line type="stepAfter" dataKey="cotIndex36m" name="COT Index 36 Month" stroke="#f59e0b" dot={false} strokeWidth={1.4} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** แท่งสถานะสุทธิรายกลุ่ม (สัปดาห์ล่าสุด) */
export function NetBars({ title, bars }: { title: string; bars: Array<{ label: string; value: number; color: string }> }) {
  return (
    <ChartFrame title={title} height={170} label={`${title}: ${bars.map((b) => `${b.label} ${fmtInt(b.value)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ ...AXIS, fontSize: 9 }} interval={0} tickFormatter={(s: string) => s.split(/[ /]/)[0]} />
          <YAxis tick={AXIS} width={48} tickFormatter={fmtK} />
          <ReferenceLine y={0} stroke="#71717a" />
          <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number | string) => [fmtInt(Number(v)), 'Net']} />
          <Bar dataKey="value" isAnimationActive={false}>
            {bars.map((b) => (
              <Cell key={b.label} fill={b.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** มาตรวัดครึ่งวงกลม 0–100 ของ COT Index (SVG ล้วน) */
export function IndexGauge({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const angle = Math.PI * (1 - v / 100);
  const r = 60;
  const cx = 75;
  const cy = 72;
  const end = { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
  const color = v >= 80 ? '#22c55e' : v <= 20 ? '#ef4444' : v >= 50 ? '#a3e635' : '#f59e0b';
  const zone = v >= 80 ? 'สุดขั้วบน' : v <= 20 ? 'สุดขั้วล่าง' : 'กลาง';
  return (
    <figure className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <svg viewBox="0 0 150 90" className="w-full max-w-[180px]" role="img" aria-label={`${label} ${v.toFixed(1)}% (${zone})`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#3f3f46" strokeWidth={12} strokeLinecap="round" />
        {v > 0 && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#f4f4f5" fontSize="20" fontWeight="600">
          {v.toFixed(1)}%
        </text>
      </svg>
      <figcaption className="text-center text-xs font-medium text-zinc-300">
        {label} <span className="text-zinc-400">· {zone}</span>
      </figcaption>
    </figure>
  );
}

/** วงกลมเล็ก: สัดส่วน (long/short หรือ % ของ OI ต่อกลุ่ม) — SVG ล้วน ชื่อสำหรับ screen reader อยู่ที่ตัวห่อชิ้นเดียว */
export function MiniPie({ title, slices }: { title: string; slices: Array<{ label: string; value: number; color: string }> }) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  const desc = slices.map((s) => `${s.label} ${((s.value / total) * 100).toFixed(0)}%`).join(', ');
  const r = 36;
  const shown = slices.filter((s) => s.value > 0);
  const ends = shown.map((_, i) => shown.slice(0, i + 1).reduce((a, x) => a + x.value, 0));
  const pt = (t: number) => `${(38 + r * Math.sin(t)).toFixed(2)} ${(38 - r * Math.cos(t)).toFixed(2)}`;
  const paths = shown.map((s, i) => {
    const start = ((ends[i] - s.value) / total) * 2 * Math.PI;
    const end = (ends[i] / total) * 2 * Math.PI;
    if (end - start >= 2 * Math.PI - 1e-9) return { s, d: null };
    return { s, d: `M 38 38 L ${pt(start)} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${pt(end)} Z` };
  });
  return (
    <figure className="flex min-w-0 flex-col items-center">
      <svg viewBox="0 0 76 76" width={76} height={76} role="img" aria-label={`${title}: ${desc}`}>
        {paths.map(({ s, d }) =>
          d ? <path key={s.label} d={d} fill={s.color} stroke="#18181b" strokeWidth={1} /> : <circle key={s.label} cx={38} cy={38} r={r} fill={s.color} />,
        )}
      </svg>
      <figcaption className="mt-1 max-w-[96px] text-center text-[10.5px] leading-tight text-zinc-300">{title}</figcaption>
    </figure>
  );
}
