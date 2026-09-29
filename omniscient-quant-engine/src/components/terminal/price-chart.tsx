'use client';

/**
 * PriceChart — custom-SVG candlestick panel for the Market Intelligence terminal.
 * Pure presentational (props in, no fetching). All geometry / formatting helpers
 * live at module level; the SVG chart body is memoized on [data, width, overlays, tf]
 * so hover/crosshair re-renders stay cheap.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Maximize2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import type { SeriesResponse } from '@/lib/quant/api-types';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// ─── layout constants ────────────────────────────────────────────────────────

const CHART_H = 460; // 20 top pad + 330 price + 10 gap + 80 volume + 20 x-axis
const TOP_PAD = 20;
const PRICE_H = 330;
const VOL_H = 80;
const AXIS_GAP = 10;
const LEFT_PAD = 8;
const RIGHT_W = 56;

const UP = '#10b981';
const DOWN = '#f43f5e';
const GRID = '#27272a';
const AXIS_TXT = '#71717a';

type Tf = '1D' | '1W';
type ChartMode = 'CANDLES' | 'LINE';

type OverlayKey =
  | 'ema20'
  | 'ema50'
  | 'sma20'
  | 'bb'
  | 'don'
  | 'vwap'
  | 'vol'
  | 'swing'
  | 'levels';
type Overlays = Record<OverlayKey, boolean>;

export interface PlanLevels {
  entryLow: number;
  entryHigh: number;
  stopHard: number;
}

export interface PriceChartProps {
  data: SeriesResponse | null;
  loading: boolean;
  error?: string | null;
  plan?: PlanLevels | null;
  tf: Tf;
  onTfChange: (tf: Tf) => void;
  onRefresh: () => void;
  onToggleExpand?: () => void;
}

// ─── module-level helpers ────────────────────────────────────────────────────

const OVERLAY_DEFS: Array<{ key: OverlayKey; label: string; dot: string | null }> = [
  { key: 'ema20', label: 'EMA 20', dot: '#fbbf24' },
  { key: 'ema50', label: 'EMA 50', dot: '#fb923c' },
  { key: 'sma20', label: 'SMA 20', dot: '#a1a1aa' },
  { key: 'bb', label: 'Bollinger', dot: '#71717a' },
  { key: 'don', label: 'Donchian 20', dot: '#2dd4bf' },
  { key: 'vwap', label: 'VWAP', dot: '#c084fc' },
  { key: 'vol', label: 'Volume', dot: null },
  { key: 'swing', label: 'Swing H/L', dot: null },
  { key: 'levels', label: 'Levels', dot: null },
];

const DEFAULT_OVERLAYS: Overlays = {
  ema20: true,
  ema50: true,
  sma20: false,
  bb: false,
  don: false,
  vwap: false,
  vol: true,
  swing: true,
  levels: true,
};

const TFS: Tf[] = ['1D', '1W'];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const fx = (v: number): string => v.toFixed(2);

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return [min];
  const step0 = (max - min) / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 2.5 ? 2.5 * mag : norm <= 5 ? 5 * mag : 10 * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-6; t += step) ticks.push(t);
  return ticks.length > 0 ? ticks : [min];
}

const axisDecimals = (step: number): number => (step >= 10 ? 0 : step >= 0.5 ? 2 : 4);

function dateTick(iso: string, tf: Tf): string {
  const head = iso.slice(0, 10);
  const p = head.split('-');
  if (p.length !== 3) return iso;
  return tf === '1D' ? `${p[1]}-${p[2]}` : `${p[0].slice(2)}-${p[1]}-${p[2]}`;
}

/** Build one path string per series, splitting into M/L runs around null gaps. */
function overlayPath(
  values: Array<number | null>,
  xc: (i: number) => number,
  y: (v: number) => number,
  n: number,
): string {
  let d = '';
  let pen = false;
  const m = Math.min(values.length, n);
  for (let i = 0; i < m; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${fx(xc(i))} ${fx(y(v))}`;
    pen = true;
  }
  return d;
}

// ─── geometry ────────────────────────────────────────────────────────────────

interface Geom {
  n: number;
  plotX: number;
  plotR: number;
  plotW: number;
  slot: number;
  bw: number;
  thin: boolean;
  priceTop: number;
  priceBot: number;
  volBot: number;
  lo: number;
  hi: number;
  dec: number;
  priceY: (v: number) => number;
  priceAt: (y: number) => number;
  volY: (v: number) => number;
  xc: (i: number) => number;
  hTicks: Array<{ v: number; y: number }>;
  vTicks: Array<{ x: number; label: string }>;
  advY: number;
}

function buildGeom(data: SeriesResponse, width: number, overlays: Overlays, tf: Tf): Geom {
  const bars = data.bars;
  const n = bars.length;
  const plotX = LEFT_PAD;
  const plotR = Math.max(plotX + 60, Math.round(width) - RIGHT_W);
  const plotW = Math.max(60, plotR - plotX);
  const slot = n > 0 ? plotW / n : plotW;
  const bw = Math.max(1.5, slot * 0.62);
  const thin = slot < 3;

  const priceTop = TOP_PAD;
  const priceBot = TOP_PAD + PRICE_H;
  const volBot = priceBot + AXIS_GAP + VOL_H;

  // Y domain: visible bars' low/high, extended by enabled overlay values.
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const b of bars) {
    if (b.l < lo) lo = b.l;
    if (b.h > hi) hi = b.h;
  }
  const extend = (arr: Array<number | null> | undefined) => {
    if (!arr) return;
    const m = Math.min(arr.length, n);
    for (let i = 0; i < m; i++) {
      const v = arr[i];
      if (v == null || !Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  };
  if (n > 0) {
    if (overlays.bb) {
      extend(data.ind.bbU);
      extend(data.ind.bbL);
    }
    if (overlays.don) {
      extend(data.ind.donU);
      extend(data.ind.donL);
    }
    if (overlays.ema20) extend(data.ind.ema20);
    if (overlays.ema50) extend(data.ind.ema50);
    if (overlays.sma20) extend(data.ind.sma20);
    if (overlays.vwap) extend(data.ind.vwap);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const pad = (hi - lo) * 0.04 || Math.abs(hi) * 0.01 || 1;
  lo -= pad;
  hi += pad;
  const span = hi - lo || 1;

  const priceY = (v: number): number => priceTop + ((hi - v) / span) * PRICE_H;
  const priceAt = (y: number): number => hi - ((y - priceTop) / PRICE_H) * span;
  const xc = (i: number): number => plotX + slot * (i + 0.5);

  let maxV = 1;
  for (const b of bars) if (b.v > maxV) maxV = b.v;
  const volY = (v: number): number => volBot - clamp(v / maxV, 0, 1) * VOL_H * 0.96;

  const ticks = niceTicks(lo, hi, 5);
  const dec = ticks.length > 1 ? axisDecimals(ticks[1] - ticks[0]) : 2;
  const hTicks = ticks.map((v) => ({ v, y: priceY(v) }));

  const vTicks: Array<{ x: number; label: string }> = [];
  if (n > 0) {
    const seen = new Set<number>();
    for (let k = 0; k < 6; k++) {
      const i = Math.round((k * (n - 1)) / 5);
      if (seen.has(i)) continue;
      seen.add(i);
      vTicks.push({ x: xc(i), label: dateTick(bars[i].date, tf) });
    }
  }

  return {
    n,
    plotX,
    plotR,
    plotW,
    slot,
    bw,
    thin,
    priceTop,
    priceBot,
    volBot,
    lo,
    hi,
    dec,
    priceY,
    priceAt,
    volY,
    xc,
    hTicks,
    vTicks,
    advY: volY(data.adv20),
  };
}

// ─── SVG chart (module-level component; owns crosshair state) ───────────────

interface HoverT {
  i: number;
  px: number;
  py: number;
}

interface ChartSvgProps {
  data: SeriesResponse;
  width: number;
  mode: ChartMode;
  overlays: Overlays;
  tf: Tf;
  plan: PlanLevels | null;
}

function PriceChartSvg({ data, width, mode, overlays, tf, plan }: ChartSvgProps) {
  const [hover, setHover] = useState<HoverT | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rawId = useId();
  const clipId = `pcClip${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const geom = useMemo(() => buildGeom(data, width, overlays, tf), [data, width, overlays, tf]);

  // Static chart body (grid + candles/line + overlays + volume + levels) — rebuilt
  // only when geometry inputs change, NOT on every hover move.
  const layers = useMemo(() => {
    const { n, dec, plotX, plotR, plotW, priceTop, priceBot, volBot, bw, thin, xc, priceY, volY, hTicks, vTicks, advY } = geom;
    const bars = data.bars;

    const wickUp: ReactNode[] = [];
    const wickDown: ReactNode[] = [];
    const bodyUp: ReactNode[] = [];
    const bodyDown: ReactNode[] = [];
    const volUp: ReactNode[] = [];
    const volDown: ReactNode[] = [];
    let thinUpD = '';
    let thinDownD = '';
    let lineD = '';

    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const up = b.c >= b.o;
      const x = xc(i);
      const yH = priceY(b.h);
      const yL = priceY(b.l);
      const yT = priceY(Math.max(b.o, b.c));
      const yB = priceY(Math.min(b.o, b.c));
      const bodyH = Math.max(1, yB - yT);
      const vY = volY(b.v);

      lineD += `${i === 0 ? 'M' : 'L'}${fx(x)} ${fx(priceY(b.c))}`;
      const volBar = <rect key={`vl${i}`} x={x - bw / 2} y={vY} width={bw} height={Math.max(0, volBot - vY)} />;
      if (up) volUp.push(volBar);
      else volDown.push(volBar);

      if (thin) {
        const seg = `M${fx(x)} ${fx(yH)}V${fx(yL)}`;
        if (up) thinUpD += seg;
        else thinDownD += seg;
      } else {
        const wick = <line key={`wk${i}`} x1={x} x2={x} y1={yH} y2={yL} />;
        const body = <rect key={`bd${i}`} x={x - bw / 2} y={yT} width={bw} height={bodyH} />;
        if (up) {
          wickUp.push(wick);
          bodyUp.push(body);
        } else {
          wickDown.push(wick);
          bodyDown.push(body);
        }
      }
    }

    const series: Array<{ key: string; d: string; color: string; w: number; dash?: string; op?: number }> = [];
    if (overlays.ema20) series.push({ key: 'e20', d: overlayPath(data.ind.ema20, xc, priceY, n), color: '#fbbf24', w: 1.3 });
    if (overlays.ema50) series.push({ key: 'e50', d: overlayPath(data.ind.ema50, xc, priceY, n), color: '#fb923c', w: 1.3 });
    if (overlays.sma20) series.push({ key: 's20', d: overlayPath(data.ind.sma20, xc, priceY, n), color: '#a1a1aa', w: 1.1 });
    if (overlays.bb) {
      series.push({ key: 'bbU', d: overlayPath(data.ind.bbU, xc, priceY, n), color: '#71717a', w: 1, dash: '4 3' });
      series.push({ key: 'bbM', d: overlayPath(data.ind.bbM, xc, priceY, n), color: '#71717a', w: 1, dash: '2 4', op: 0.7 });
      series.push({ key: 'bbL', d: overlayPath(data.ind.bbL, xc, priceY, n), color: '#71717a', w: 1, dash: '4 3' });
    }
    if (overlays.don) {
      series.push({ key: 'donU', d: overlayPath(data.ind.donU, xc, priceY, n), color: '#2dd4bf', w: 1.2 });
      series.push({ key: 'donL', d: overlayPath(data.ind.donL, xc, priceY, n), color: '#2dd4bf', w: 1.2 });
    }
    if (overlays.vwap) series.push({ key: 'vwap', d: overlayPath(data.ind.vwap, xc, priceY, n), color: '#c084fc', w: 1.3 });

    const stopY = plan ? clamp(priceY(plan.stopHard), priceTop + 8, priceBot - 8) : 0;

    return (
      <>
        <clipPath id={clipId}>
          <rect x={plotX} y={priceTop} width={plotW} height={PRICE_H} />
        </clipPath>

        {/* grid */}
        <g shapeRendering="crispEdges">
          {hTicks.map((t) => (
            <line key={`ht${t.v}`} x1={plotX} x2={plotR} y1={t.y} y2={t.y} stroke={GRID} strokeWidth={1} />
          ))}
          {vTicks.map((t, k) => (
            <line key={`vt${k}`} x1={t.x} x2={t.x} y1={priceTop} y2={volBot} stroke={GRID} strokeWidth={1} />
          ))}
          <line x1={plotR} x2={plotR} y1={priceTop} y2={volBot} stroke={GRID} strokeWidth={1} />
        </g>
        <g className="font-mono">
          {hTicks.map((t) => (
            <text key={`hl${t.v}`} x={plotR + 6} y={t.y + 3.5} fontSize={10} fill={AXIS_TXT}>
              {t.v.toFixed(dec)}
            </text>
          ))}
          {vTicks.map((t, k) => (
            <text key={`vlbl${k}`} x={clamp(t.x, plotX + 18, plotR - 18)} y={volBot + 14} textAnchor="middle" fontSize={10} fill={AXIS_TXT}>
              {t.label}
            </text>
          ))}
        </g>

        {/* price area (clipped) */}
        <g clipPath={`url(#${clipId})`}>
          {mode === 'LINE' ? (
            <path d={lineD} fill="none" stroke="#fbbf24" strokeWidth={1.6} strokeLinejoin="round" />
          ) : thin ? (
            <g fill="none" strokeWidth={1}>
              {thinUpD !== '' && <path d={thinUpD} stroke={UP} />}
              {thinDownD !== '' && <path d={thinDownD} stroke={DOWN} />}
            </g>
          ) : (
            <g strokeWidth={1}>
              <g stroke={UP} fill={UP}>
                {wickUp}
                {bodyUp}
              </g>
              <g stroke={DOWN} fill={DOWN}>
                {wickDown}
                {bodyDown}
              </g>
            </g>
          )}

          {series.map((s) => (
            <path
              key={s.key}
              d={s.d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.w}
              strokeDasharray={s.dash}
              strokeOpacity={s.op ?? 1}
            />
          ))}

          {/* trade-plan entry zone + hard stop */}
          {plan && (
            <g>
              <rect
                x={plotX}
                y={priceY(plan.entryHigh)}
                width={plotW}
                height={Math.max(0, priceY(plan.entryLow) - priceY(plan.entryHigh))}
                fill={UP}
                fillOpacity={0.08}
              />
              <line x1={plotX} x2={plotR} y1={priceY(plan.entryHigh)} y2={priceY(plan.entryHigh)} stroke={UP} strokeOpacity={0.5} strokeWidth={1} />
              <line x1={plotX} x2={plotR} y1={priceY(plan.entryLow)} y2={priceY(plan.entryLow)} stroke={UP} strokeOpacity={0.5} strokeWidth={1} />
              <line x1={plotX} x2={plotR} y1={priceY(plan.stopHard)} y2={priceY(plan.stopHard)} stroke={DOWN} strokeOpacity={0.8} strokeWidth={1} strokeDasharray="5 4" />
            </g>
          )}

          {/* S/R dashed lines */}
          {overlays.levels &&
            data.sr.resistances.map((r, k) => (
              <line key={`srR${k}`} x1={plotX} x2={plotR} y1={priceY(r)} y2={priceY(r)} stroke="#f59e0b" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="5 4" />
            ))}
          {overlays.levels &&
            data.sr.supports.map((s, k) => (
              <line key={`srS${k}`} x1={plotX} x2={plotR} y1={priceY(s)} y2={priceY(s)} stroke={UP} strokeOpacity={0.7} strokeWidth={1} strokeDasharray="5 4" />
            ))}

          {/* swing pivots */}
          {overlays.swing &&
            data.swings.map((s) => {
              if (s.i < 0 || s.i >= n) return null;
              const x = xc(s.i);
              const py = priceY(s.price);
              return s.type === 'H' ? (
                <polygon key={`sw${s.i}H`} points={`${fx(x - 4)},${fx(py - 9)} ${fx(x + 4)},${fx(py - 9)} ${fx(x)},${fx(py - 4)}`} fill="#fb7185">
                  <title>{`Swing High ${s.price.toFixed(2)}`}</title>
                </polygon>
              ) : (
                <polygon key={`sw${s.i}L`} points={`${fx(x - 4)},${fx(py + 9)} ${fx(x + 4)},${fx(py + 9)} ${fx(x)},${fx(py + 4)}`} fill="#34d399">
                  <title>{`Swing Low ${s.price.toFixed(2)}`}</title>
                </polygon>
              );
            })}
        </g>

        {/* volume histogram + ADV20 */}
        {overlays.vol && (
          <g>
            <g fillOpacity={0.35}>
              <g fill={UP}>{volUp}</g>
              <g fill={DOWN}>{volDown}</g>
            </g>
            <line x1={plotX} x2={plotR} y1={advY} y2={advY} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="4 3" />
            <text x={plotR + 6} y={advY + 3} fontSize={9} fill="#a1a1aa" className="font-mono">
              ADV20
            </text>
          </g>
        )}

        {/* right-edge level chips */}
        {overlays.levels &&
          data.sr.resistances.map((r, k) => {
            const y = clamp(priceY(r), priceTop + 8, priceBot - 8);
            return (
              <g key={`chR${k}`}>
                <rect x={plotR + 2} y={y - 7} width={48} height={14} rx={2} fill="#78350f" fillOpacity={0.9} />
                <text x={plotR + 5} y={y + 3} fontSize={9} fill="#fcd34d" className="font-mono">{`R ${r.toFixed(2)}`}</text>
              </g>
            );
          })}
        {overlays.levels &&
          data.sr.supports.map((s, k) => {
            const y = clamp(priceY(s), priceTop + 8, priceBot - 8);
            return (
              <g key={`chS${k}`}>
                <rect x={plotR + 2} y={y - 7} width={48} height={14} rx={2} fill="#064e3b" fillOpacity={0.9} />
                <text x={plotR + 5} y={y + 3} fontSize={9} fill="#6ee7b7" className="font-mono">{`S ${s.toFixed(2)}`}</text>
              </g>
            );
          })}
        {plan && (
          <g>
            <rect x={plotR + 2} y={stopY - 7} width={48} height={14} rx={2} fill="#4c0519" fillOpacity={0.9} />
            <text x={plotR + 5} y={stopY + 3} fontSize={9} fill="#fda4af" className="font-mono">
              STOP
            </text>
          </g>
        )}
      </>
    );
  }, [geom, data, mode, overlays, plan, clipId]);

  // ─── crosshair interaction ───

  const handleMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || geom.n === 0) return;
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (px < geom.plotX || px > geom.plotR || py < geom.priceTop || py > geom.volBot) {
        setHover(null);
        return;
      }
      const i = clamp(Math.floor((px - geom.plotX) / geom.slot), 0, geom.n - 1);
      setHover({ i, px, py });
    },
    [geom],
  );

  const handleLeave = useCallback(() => setHover(null), []);

  const bars = data.bars;
  const hov = hover && bars[hover.i] ? hover : null;
  const hb = hov ? bars[hov.i] : null;
  const hx = hov ? geom.xc(hov.i) : 0;
  const hpy = hov ? clamp(hov.py, geom.priceTop + 8, geom.priceBot - 8) : 0;
  const hPrice = hov ? geom.priceAt(hpy) : 0;
  const tagX = hov ? clamp(hx - 27, geom.plotX, geom.plotR - 54) : 0;
  const prevC = hb && hov && hov.i > 0 ? bars[hov.i - 1].c : hb ? hb.o : 0;
  const hChg = hb && prevC !== 0 ? ((hb.c - prevC) / prevC) * 100 : 0;
  const hUp = hb ? hb.c >= hb.o : true;
  const dirCls = hUp ? 'text-emerald-400' : 'text-rose-400';
  const hVr = hb && data.adv20 > 0 ? hb.v / data.adv20 : 0;

  const TIP_W = 188;
  const TIP_H = 128;
  const tipLeft = hov ? clamp(hov.px + 14, 4, Math.max(4, width - TIP_W - 4)) : 0;
  const tipTop = hov ? clamp(hov.py - TIP_H / 2, 4, Math.max(4, CHART_H - TIP_H - 4)) : 0;

  const cross = hb && hov ? (
    <g pointerEvents="none">
      <line x1={hx} x2={hx} y1={geom.priceTop} y2={geom.volBot} stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" />
      <rect x={geom.plotR + 1} y={hpy - 8} width={RIGHT_W - 2} height={16} rx={2} fill="#3f3f46" />
      <text x={geom.plotR + RIGHT_W / 2 - 1} y={hpy + 3.5} textAnchor="middle" fontSize={10} fill="#fafafa" className="font-mono">
        {hPrice.toFixed(2)}
      </text>
      <rect x={tagX} y={geom.volBot + 3} width={54} height={15} rx={2} fill="#3f3f46" />
      <text x={tagX + 27} y={geom.volBot + 14} textAnchor="middle" fontSize={9} fill="#fafafa" className="font-mono">
        {dateTick(hb.date, tf)}
      </text>
    </g>
  ) : null;

  const tip = hb && hov ? (
    <div
      className="pointer-events-none absolute z-20 rounded-md border border-zinc-700 bg-zinc-900/95 p-2 text-[11px] shadow-xl"
      style={{ left: tipLeft, top: tipTop, width: TIP_W }}
    >
      <div className="font-mono text-[10px] text-zinc-400">{hb.date}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono">
        <span className="text-zinc-500">O <span className={dirCls}>{hb.o.toFixed(2)}</span></span>
        <span className="text-zinc-500">H <span className={dirCls}>{hb.h.toFixed(2)}</span></span>
        <span className="text-zinc-500">L <span className={dirCls}>{hb.l.toFixed(2)}</span></span>
        <span className="text-zinc-500">C <span className={dirCls}>{hb.c.toFixed(2)}</span></span>
      </div>
      <div className="mt-1 flex items-center justify-between font-mono">
        <span className="text-zinc-500">
          Chg <span className={hChg >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{`${hChg >= 0 ? '+' : ''}${hChg.toFixed(2)}%`}</span>
        </span>
        <span className="text-zinc-500">VR <span className="text-zinc-300">{`${hVr.toFixed(2)}×`}</span></span>
      </div>
      <div className="mt-0.5 font-mono text-zinc-500">
        V <span className="text-zinc-300">{hb.v.toLocaleString()}</span>
      </div>
    </div>
  ) : null;

  return (
    <div className="relative" style={{ height: CHART_H }}>
      <svg
        ref={svgRef}
        width={width}
        height={CHART_H}
        role="img"
        aria-label={`แผนภูมิแท่งเทียน ${data.symbol}`}
        className="block select-none"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {layers}
        {cross}
      </svg>
      {tip}
    </div>
  );
}

// ─── main panel ──────────────────────────────────────────────────────────────

export default function PriceChart({
  data,
  loading,
  error = null,
  plan = null,
  tf,
  onTfChange,
  onRefresh,
  onToggleExpand,
}: PriceChartProps) {
  const [mode, setMode] = useState<ChartMode>('CANDLES');
  const [ov, setOv] = useState<Overlays>(DEFAULT_OVERLAYS);
  const [width, setWidth] = useState(720);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);

  // Measure the chart container so the SVG tracks the panel width.
  useEffect(() => {
    if (!wrapEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) {
        const w = Math.round(en.contentRect.width);
        if (w > 0) setWidth(Math.max(320, w));
      }
    });
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [wrapEl]);

  const toggleOv = useCallback((k: OverlayKey) => setOv((p) => ({ ...p, [k]: !p[k] })), []);

  const hasData = data != null && data.bars.length > 0;
  const q = data ? data.lastQuote : null;
  const qUp = q ? q.chg1d >= 0 : false;
  const lastBar = data && hasData ? data.bars[data.bars.length - 1] : null;

  const iconBtn =
    'rounded border border-zinc-800 p-1 text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40';

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-900/30">
      {/* header */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold tracking-widest text-zinc-400">
            PRICE CHART <span className="font-normal text-zinc-600">/ แผนภูมิราคา</span>
          </div>
          <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
            REAL OHLC
          </span>
        </div>
        {data && q ? (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xl font-bold leading-tight text-zinc-100">{data.symbol}</span>
              <span className="text-xs text-zinc-500">{data.name}</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]',
                  qUp ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300',
                )}
              >
                {qUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {`${q.chg1d >= 0 ? '+' : ''}${q.chg1d.toFixed(2)}%`}
              </span>
            </div>
            <div className="mt-0.5 pb-0.5 text-[10px] text-zinc-600">
              OQE Synthetic Generator · EOD · ข้อมูลถึง {fmtDate(data.lastDate)}
            </div>
          </>
        ) : (
          <div className="h-[46px]" />
        )}
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-zinc-800/60 px-4 py-2">
        <span className="text-[9px] tracking-wider text-zinc-600">TIMEFRAME</span>
        <div className="flex items-center gap-1">
          {TFS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tf === t}
              onClick={() => onTfChange(t)}
              className={cn(
                'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors',
                tf === t ? 'border-zinc-600 bg-zinc-800 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <span className="text-[9px] tracking-wider text-zinc-600">CHART</span>
        <div className="flex items-center gap-1">
          {(['CANDLES', 'LINE'] as ChartMode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded border px-2 py-0.5 text-[10px] transition-colors',
                mode === m ? 'border-zinc-600 bg-zinc-800 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              )}
            >
              {m === 'CANDLES' ? 'Candles' : 'Line'}
            </button>
          ))}
        </div>

        <span className="text-[9px] tracking-wider text-zinc-600">OVERLAYS</span>
        <div className="flex flex-wrap items-center gap-1">
          {OVERLAY_DEFS.map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={ov[d.key]}
              onClick={() => toggleOv(d.key)}
              className={cn(
                'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                ov[d.key] ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              )}
            >
              {d.dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: d.dot }} />}
              {d.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="รีเฟรชข้อมูล" onClick={onRefresh} className={iconBtn}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button type="button" aria-label="ขยายแผนภูมิ" onClick={onToggleExpand} disabled={!onToggleExpand} className={iconBtn}>
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* chart body */}
      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
        {loading ? (
          <div className="h-[460px] w-full animate-pulse rounded bg-zinc-800/30" />
        ) : error ? (
          <div className="m-2 rounded border border-rose-500/40 bg-rose-500/10 p-3">
            <div className="text-xs text-rose-300">{error}</div>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-2 rounded border border-rose-500/50 px-2 py-1 text-[10px] text-rose-200 transition-colors hover:bg-rose-500/10"
            >
              ลองใหม่
            </button>
          </div>
        ) : !hasData || !data ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">ไม่มีข้อมูล</div>
        ) : (
          <div ref={setWrapEl}>
            <PriceChartSvg data={data} width={width} mode={mode} overlays={ov} tf={tf} plan={plan ?? null} />
          </div>
        )}
      </div>

      {/* footer OHLCV strip */}
      {lastBar && data ? (
        <div tabIndex={0} role="region" aria-label="ค่าตัวชี้วัดล่าสุด" className="flex items-center gap-3 overflow-x-auto whitespace-nowrap border-t border-zinc-800/60 px-4 py-2 font-mono text-[11px]">
          <span className={lastBar.c >= lastBar.o ? 'text-emerald-400' : 'text-rose-400'}>O {lastBar.o.toFixed(2)}</span>
          <span className={lastBar.c >= lastBar.o ? 'text-emerald-400' : 'text-rose-400'}>H {lastBar.h.toFixed(2)}</span>
          <span className={lastBar.c >= lastBar.o ? 'text-emerald-400' : 'text-rose-400'}>L {lastBar.l.toFixed(2)}</span>
          <span className={lastBar.c >= lastBar.o ? 'text-emerald-400' : 'text-rose-400'}>C {lastBar.c.toFixed(2)}</span>
          <span className="text-zinc-500">
            V <span className="text-zinc-300">{lastBar.v.toLocaleString()}</span>
          </span>
          <span className="text-zinc-500">
            VR <span className="text-zinc-300">{`${(data.adv20 > 0 ? lastBar.v / data.adv20 : 0).toFixed(2)}×`}</span>
          </span>
          <span className="ml-auto pl-4 text-zinc-600">{`${data.bars.length} bars`}</span>
        </div>
      ) : null}
    </section>
  );
}
