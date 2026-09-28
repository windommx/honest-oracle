'use client';

/**
 * OQE Design System — Dashboard Primitives ("Institutional Quant Terminal")
 *
 * Presentational ล้วน — ห้าม fetch / ห้าม business logic ในไฟล์นี้
 * Design language: zinc-950 + amber brand + emerald/rose semantic
 * (ห้ามสีน้ำเงิน/indigo, ห้าม emoji, ตัวเลขทุกจุด font-mono + tabular-nums)
 */

import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Tone system (semantic: emerald = ขาขึ้น/ดี, rose = ขาลง/เสี่ยง, amber = brand/รอ) ───

export type Tone = 'up' | 'down' | 'warn' | 'default';

const TONE_TEXT: Record<Tone, string> = {
  up: 'text-emerald-400',
  down: 'text-rose-400',
  warn: 'text-amber-300',
  default: 'text-zinc-100',
};

const TONE_ICON: Record<Tone, string> = {
  up: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  down: 'border-rose-500/25 bg-rose-500/10 text-rose-400',
  warn: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  default: 'border-white/[0.08] bg-white/[0.04] text-zinc-400',
};

const TONE_STROKE: Record<Tone, string> = {
  up: '#34d399', // emerald-400
  down: '#fb7185', // rose-400
  warn: '#fbbf24', // amber-400
  default: '#fcd34d', // amber-300
};

const TONE_DOT: Record<Tone, string> = {
  up: 'bg-emerald-400',
  down: 'bg-rose-400',
  warn: 'bg-amber-400',
  default: 'bg-zinc-400',
};

const THAI_RE = /[\u0E00-\u0E7F]/;
const isThai = (s: string): boolean => THAI_RE.test(s);

/** จัดรูปเลขกลาง gauge ให้กระชับตามขนาดค่า */
const fmtGaugeValue = (v: number): string => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

const fmtSignedPct = (v: number, digits = 2): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;

// ─── MicroLabel ───

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  // ข้อความไทย: tracking กว้างจะทำให้สระ/วรรณยุกต์แตก — ใช้ tracking-normal text-[11px] แทน
  const thai = typeof children === 'string' && isThai(children);
  return (
    <span
      className={cn(
        'block font-semibold text-zinc-500',
        thai ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-[0.14em]',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Panel ───

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
  titleClassName,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  titleClassName?: string;
}) {
  const hasHeader = Boolean(title || subtitle || actions);
  return (
    <section className={cn('oqe-panel flex min-w-0 flex-col', className)}>
      {hasHeader && (
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            {title && <MicroLabel className={titleClassName}>{title}</MicroLabel>}
            {subtitle && <p className="mt-1 text-[11px] leading-snug text-zinc-500">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1', padded && 'p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

// ─── StatTile ───

export function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'oqe-panel flex items-start justify-between gap-3 p-4 transition-colors duration-300 hover:border-white/[0.12]',
        className,
      )}
    >
      <div className="min-w-0">
        <MicroLabel>{label}</MicroLabel>
        <p className={cn('mt-1.5 truncate font-mono text-xl font-bold leading-none tabular-nums', TONE_TEXT[tone])}>
          {value}
        </p>
        {sub && <p className="mt-1.5 truncate text-[11px] text-zinc-500">{sub}</p>}
      </div>
      {Icon && (
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border', TONE_ICON[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}
    </div>
  );
}

// ─── RadialGauge ───

/** จุดบนวงกลมที่มุมองศา (0° = แกน x ขวา, ตามเข็มนาฬิกาเพราะแกน y ชี้ลง) */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const GAUGE_START = 150; // องศาเริ่ม (โค้งเปิดด้านล่าง)
const GAUGE_SWEEP = 240; // ความยาวโค้งทั้งเส้น

export function RadialGauge({
  value,
  min = -2,
  max = 2,
  label,
  sub,
  size = 104,
  tone = 'default',
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  sub?: string;
  size?: number;
  tone?: Tone;
}) {
  const stroke = TONE_STROKE[tone];
  const geom = useMemo(() => {
    const w = 7;
    const r = size / 2 - w / 2 - 3;
    const c = size / 2;
    const span = max - min;
    const t = span === 0 ? 0 : Math.min(1, Math.max(0, (value - min) / span));
    const sweep = GAUGE_SWEEP * t;
    return {
      track: arcPath(c, c, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP),
      arc: sweep > 1.5 ? arcPath(c, c, r, GAUGE_START, GAUGE_START + sweep) : null,
    };
  }, [value, min, max, size]);

  return (
    <div
      className="relative inline-flex shrink-0 flex-col items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${fmtGaugeValue(value)}${sub ? ` (${sub})` : ''}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible" aria-hidden="true" focusable="false">
        <title>{`${label} ${fmtGaugeValue(value)}`}</title>
        <path
          d={geom.track}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        {geom.arc && (
          <path
            d={geom.arc}
            fill="none"
            stroke={stroke}
            strokeWidth={7}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${stroke}59)` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span className={cn('font-mono font-bold leading-none tabular-nums', size >= 96 ? 'text-xl' : 'text-lg', TONE_TEXT[tone])}>
          {fmtGaugeValue(value)}
        </span>
        <span className={cn('mt-1.5 max-w-full truncate px-1 font-semibold text-zinc-400', isThai(label) ? 'text-[10px]' : 'text-[9px] uppercase tracking-[0.12em]')}>
          {label}
        </span>
        {sub && <span className="mt-0.5 max-w-full truncate px-1 font-mono text-[9px] text-zinc-600">{sub}</span>}
      </div>
    </div>
  );
}

// ─── BreadthBar ───

export function BreadthBar({ adv, dec, flat, className }: { adv: number; dec: number; flat: number; className?: string }) {
  const total = adv + dec + flat;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div
      className={cn('min-w-0', className)}
      role="img"
      aria-label={`ความกว้างตลาด: ขาขึ้น ${adv} ตัว · ทรงตัว ${flat} ตัว · ขาลง ${dec} ตัว จากทั้งหมด ${total} ตัว`}
    >
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <div className="bg-emerald-500" style={{ width: `${pct(adv)}%` }} />
        <div className="bg-zinc-600" style={{ width: `${pct(flat)}%` }} />
        <div className="bg-rose-500" style={{ width: `${pct(dec)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="shrink-0 font-mono text-emerald-400 tabular-nums">ขาขึ้น {adv}</span>
        {flat > 0 && <span className="shrink-0 font-mono text-zinc-500 tabular-nums">ทรงตัว {flat}</span>}
        <span className="shrink-0 font-mono text-rose-400 tabular-nums">ขาลง {dec}</span>
      </div>
    </div>
  );
}

// ─── Sparkline ───

export function Sparkline({
  data,
  width = 72,
  height = 22,
  positive,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  className?: string;
}) {
  const points = useMemo(() => {
    const pad = 2;
    if (!data || data.length < 2) {
      const y = height / 2;
      return `${pad},${y} ${width - pad},${y}`;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min || 1;
    const step = (width - pad * 2) / (data.length - 1);
    return data
      .map((v, i) => {
        const x = pad + i * step;
        const y = pad + (1 - (v - min) / span) * (height - pad * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [data, width, height]);

  const stroke = positive === false ? '#fb7185' : positive === true ? '#34d399' : '#a1a1aa';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── TickerTape ───

function TickerRow({
  items,
  onSelectSymbol,
  hidden,
}: {
  items: Array<{ symbol: string; price: number; chg1d: number }>;
  onSelectSymbol?: (s: string) => void;
  hidden?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((it, i) => {
        const up = it.chg1d >= 0;
        return (
          <span key={`${it.symbol}-${i}`} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onSelectSymbol?.(it.symbol)}
              aria-label={`${it.symbol} ราคา ${it.price.toFixed(2)} ${fmtSignedPct(it.chg1d)}`}
              className="flex h-full items-center gap-2 px-4 py-2.5 font-mono text-xs tabular-nums transition-colors hover:bg-white/[0.04]"
            >
              <span className="font-bold text-zinc-200">{it.symbol}</span>
              <span className="text-zinc-400">{it.price.toFixed(2)}</span>
              <span className={up ? 'text-emerald-400' : 'text-rose-400'}>{fmtSignedPct(it.chg1d)}</span>
            </button>
            <span className="h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
          </span>
        );
      })}
    </div>
  );
}

export function TickerTape({
  items,
  onSelectSymbol,
  className,
}: {
  items: Array<{ symbol: string; price: number; chg1d: number }>;
  onSelectSymbol?: (s: string) => void;
  className?: string;
}) {
  if (!items.length) return null;
  const duration = `${Math.max(24, Math.round(items.length * 3.2))}s`;
  const style = { '--marquee-duration': duration } as CSSProperties;
  return (
    <div
      className={cn('oqe-ticker-mask oqe-marquee-paused h-10 overflow-hidden border-b border-white/[0.06]', className)}
      role="marquee"
      aria-label="ราคาหุ้นวิ่งอัปเดตต่อเนื่อง"
    >
      <div className="oqe-animate-marquee flex h-full w-max" style={style}>
        <TickerRow items={items} onSelectSymbol={onSelectSymbol} />
        <TickerRow items={items} onSelectSymbol={onSelectSymbol} hidden />
      </div>
    </div>
  );
}

// ─── SectorHeat ───

export function SectorHeat({
  cells,
  className,
}: {
  cells: Array<{ sector: string; chg1d: number; chg21d: number; n: number }>;
  className?: string;
}) {
  const sorted = useMemo(() => [...cells].sort((a, b) => b.chg1d - a.chg1d), [cells]);
  const maxAbs = useMemo(
    () => Math.max(0.001, ...cells.map((c) => Math.abs(c.chg1d))),
    [cells],
  );

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
      {sorted.map((c) => {
        const rel = Math.abs(c.chg1d) / maxAbs; // 0..1
        const alpha = rel * 0.16;
        const bg =
          alpha < 0.02
            ? 'rgba(255,255,255,0.03)'
            : c.chg1d > 0
              ? `rgba(16,185,129,${alpha.toFixed(3)})`
              : `rgba(244,63,94,${alpha.toFixed(3)})`;
        const up = c.chg1d >= 0;
        return (
          <div
            key={c.sector}
            className="rounded-xl border border-white/[0.06] p-3 transition-colors duration-300 hover:border-white/[0.12]"
            style={{ backgroundColor: bg }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-semibold text-zinc-200">{c.sector}</span>
              <span className="shrink-0 font-mono text-[10px] text-zinc-500 tabular-nums">{c.n} ตัว</span>
            </div>
            <p className={cn('mt-2 font-mono text-lg font-bold leading-none tabular-nums', up ? 'text-emerald-400' : 'text-rose-400')}>
              {fmtSignedPct(c.chg1d)}
            </p>
            <p className="mt-1.5 font-mono text-[10px] text-zinc-500 tabular-nums">21D {fmtSignedPct(c.chg21d, 1)}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── EquityCurve ───

const EQ_W = 720;
const EQ_H = 240;
const EQ_MAX_POINTS = 160;

interface EqPoint {
  date: string;
  equity: number;
  buyHold: number;
  yEq: number;
  yBh: number;
}

interface EqGeom {
  pts: EqPoint[];
  lineEq: string;
  lineBh: string;
  area: string;
  grid: Array<{ top: number; value: number }>;
  xLabels: string[];
  retEq: number;
  retBh: number;
}

function buildEquityGeom(data: Array<{ date: string; equity: number; buyHold: number }>): EqGeom | null {
  const n = data.length;
  if (n < 2) return null;

  // Downsample: stride จำกัดจุดวาด (คงจุดแรกและจุดสุดท้ายไว้เสมอ)
  const stride = Math.max(1, Math.ceil(n / EQ_MAX_POINTS));
  const idx: number[] = [];
  for (let i = 0; i < n; i += stride) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

  let min = Infinity;
  let max = -Infinity;
  for (const i of idx) {
    min = Math.min(min, data[i].equity, data[i].buyHold);
    max = Math.max(max, data[i].equity, data[i].buyHold);
  }
  const pad = (max - min) * 0.06 || 1;
  min -= pad;
  max += pad;

  const m = idx.length;
  const X = (j: number) => (j / (m - 1)) * EQ_W;
  const Y = (v: number) => EQ_H - ((v - min) / (max - min)) * EQ_H;

  const pts: EqPoint[] = idx.map((i, j) => ({
    date: data[i].date,
    equity: data[i].equity,
    buyHold: data[i].buyHold,
    yEq: Y(data[i].equity),
    yBh: Y(data[i].buyHold),
  }));

  const toLine = (key: 'yEq' | 'yBh') =>
    pts.map((p, j) => `${j === 0 ? 'M' : 'L'} ${X(j).toFixed(2)} ${p[key].toFixed(2)}`).join(' ');

  const lineEq = toLine('yEq');
  const lineBh = toLine('yBh');
  const area = `${lineEq} L ${EQ_W} ${EQ_H} L 0 ${EQ_H} Z`;

  const grid = [0.2, 0.4, 0.6, 0.8].map((f) => ({
    top: f * EQ_H,
    value: max - f * (max - min),
  }));

  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => {
    const d = data[Math.round(f * (n - 1))]?.date ?? '';
    return d.length >= 8 ? d.slice(2) : d; // YY-MM-DD จากสตริงโดยตรง (เลี่ยง locale server/client)
  });

  const first = data[0];
  const last = data[n - 1];
  const retEq = ((last.equity - first.equity) / Math.abs(first.equity || 1)) * 100;
  const retBh = ((last.buyHold - first.buyHold) / Math.abs(first.buyHold || 1)) * 100;

  return { pts, lineEq, lineBh, area, grid, xLabels, retEq, retBh };
}

function EquityTooltip({ p, pct }: { p: EqPoint; pct: number }) {
  const clamped = Math.min(88, Math.max(12, pct));
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-white/[0.1] bg-zinc-950/95 px-2.5 py-1.5 shadow-xl backdrop-blur"
      style={{ left: `${clamped}%` }}
    >
      <p className="font-mono text-[9px] leading-none text-zinc-500 tabular-nums">{p.date}</p>
      <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] leading-none text-emerald-300 tabular-nums">
        <span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden="true" />
        {p.equity.toFixed(2)}
      </p>
      <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] leading-none text-zinc-300 tabular-nums">
        <span className="h-1 w-1 rounded-full bg-zinc-500" aria-hidden="true" />
        {p.buyHold.toFixed(2)}
      </p>
    </div>
  );
}

export function EquityCurve({
  data,
  className,
}: {
  data: Array<{ date: string; equity: number; buyHold: number }>;
  className?: string;
}) {
  const geom = useMemo(() => buildEquityGeom(data), [data]);
  const [hover, setHover] = useState<number | null>(null);

  if (!geom) {
    return (
      <div className={cn('oqe-panel flex h-56 items-center justify-center sm:h-64', className)}>
        <p className="text-[11px] text-zinc-600">ไม่มีข้อมูลผลตอบแทนสำหรับแสดงผล</p>
      </div>
    );
  }

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / Math.max(1, rect.width);
    const idx = Math.round(Math.min(1, Math.max(0, rel)) * (geom.pts.length - 1));
    setHover(idx);
  };

  const hoverPt = hover != null ? geom.pts[hover] : null;
  const hoverPct = hover != null ? (hover / (geom.pts.length - 1)) * 100 : 0;

  return (
    <div className={cn('min-w-0', className)} role="group" aria-label="เส้นมูลค่าพอร์ต: กลยุทธ์เทียบซื้อถือ">
      <div className="flex gap-2">
        {/* พื้นที่กราฟ (เว้นขวาให้แกน y) */}
        <div
          className="relative h-56 min-w-0 flex-1 sm:h-64"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${EQ_W} ${EQ_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id="oqe-eq-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* grid แนวนอน 4 เส้น */}
            {geom.grid.map((g) => (
              <line
                key={g.top}
                x1={0}
                x2={EQ_W}
                y1={g.top}
                y2={g.top}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* buy & hold (เส้นประ) */}
            <path
              d={geom.lineBh}
              fill="none"
              stroke="#71717a"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            {/* area + เส้นกลยุทธ์ */}
            <path d={geom.area} fill="url(#oqe-eq-area)" />
            <path
              d={geom.lineEq}
              fill="none"
              stroke="#34d399"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* crosshair + tooltip */}
          {hoverPt && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 w-px border-l border-dashed border-white/20"
                style={{ left: `${hoverPct}%` }}
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-emerald-400"
                style={{ left: `${hoverPct}%`, top: `${(hoverPt.yEq / EQ_H) * 100}%` }}
                aria-hidden="true"
              />
              <EquityTooltip p={hoverPt} pct={hoverPct} />
            </>
          )}
        </div>

        {/* y tick labels (HTML — กันตัวอักษรยืดตาม viewBox ที่ preserveAspectRatio="none") */}
        <div className="relative w-12 shrink-0" aria-hidden="true">
          {geom.grid.map((g) => (
            <span
              key={g.top}
              className="absolute right-0 -translate-y-1/2 font-mono text-[9px] leading-none text-zinc-500 tabular-nums"
              style={{ top: `${(g.top / EQ_H) * 100}%` }}
            >
              {g.value.toFixed(0)}
            </span>
          ))}
        </div>
      </div>

      {/* x labels */}
      <div className="mt-1.5 flex justify-between pr-14 font-mono text-[9px] leading-none text-zinc-500" aria-hidden="true">
        {geom.xLabels.map((d, i) => (
          <span key={`${d}-${i}`} className="tabular-nums">
            {d}
          </span>
        ))}
      </div>

      {/* legend + ผลตอบแทนรวม */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="text-zinc-400">กลยุทธ์</span>
          <span className={cn('font-mono tabular-nums', geom.retEq >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            {fmtSignedPct(geom.retEq)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden="true" />
          <span className="text-zinc-400">ซื้อถือ</span>
          <span className={cn('font-mono tabular-nums', geom.retBh >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            {fmtSignedPct(geom.retBh)}
          </span>
        </span>
      </div>
    </div>
  );
}

// ─── PulseDot ───

export function PulseDot({ tone = 'default', className }: { tone?: Tone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        TONE_DOT[tone],
        tone === 'up' && 'oqe-live-dot',
        className,
      )}
    />
  );
}
