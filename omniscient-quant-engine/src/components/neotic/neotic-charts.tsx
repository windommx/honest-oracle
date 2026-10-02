'use client';

/**
 * กราฟของหน้า "สแกน Neotic 3D" — แผนที่โซน (RS Rank × ระยะจากจุดสูงสุด 52 สัปดาห์) · ตารางสแกน · กรวยเงื่อนไข
 * · รายการความพร้อมของข้อมูล · ผลสะสมเทียบการสุ่ม · ตารางไม้ · ตารางหน้าต่างเดินหน้า · MAE/MFE
 * สี/รูปของจุด = สถานะการเติบโต (เขียวตามสเปก · ม่วง = โตด้านเดียว · แดง = ไม่โต · เทา = ไม่มีงบ) — รูปต่างกันด้วย
 * เพื่อไม่พึ่งสีอย่างเดียว · ขนาดจุด = ปริมาณเทียบค่าเฉลี่ย · วงขาว = ผ่านครบทุกเงื่อนไข (สัญญาณ)
 */

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Check, CheckCircle2, Info, Minus, XCircle, type LucideIcon } from 'lucide-react';
import { signedFmt, StatusBadge } from '@/components/atlas/atlas-charts';
import { AXIS, BASELINE, CATEGORICAL, ChartFrame, DIV_NEG, DIV_POS, GRID, HaloText, niceTicks, SURFACE, TipBox, type LegendItem, type TipProps } from '@/components/charts/chart-kit';
import { thDate, thMonthTick } from '@/lib/flows/format';
import { cn } from '@/lib/utils';
import type { GrowthStatus, NeoCheck, NeoExcursion, NeoFunnel, NeoScanRow, NeoThresholds, NeoTrade, NeoWalkforward, NeoZone } from '@/lib/neotic/types';
import type { ExitKind } from '@/lib/workflow/execution';

const figureCls = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-3';
const captionCls = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-300';
const POS = DIV_POS[3];
const NEG = DIV_NEG[3];
const SIGNAL = CATEGORICAL[0];
const RANDOM = '#a1a1aa';
const pct = (v: number | null, d = 1) => (v === null ? '—' : `${v.toFixed(d)}%`);
const signedPct = (v: number | null, d = 1) => (v === null ? '—' : `${signedFmt(v, d)}%`);

type Shape = 'circle' | 'diamond' | 'triangle' | 'square';
export const GROWTH: Record<GrowthStatus, { label: string; short: string; color: string; shape: Shape }> = {
  green: { label: 'โตทั้ง QoQ และ YoY (เขียว · ตามสเปก)', short: 'เขียว', color: '#199e70', shape: 'circle' },
  mixed: { label: 'โตด้านเดียว', short: 'โตด้านเดียว', color: '#a77fe0', shape: 'diamond' },
  red: { label: 'ไม่โตทั้งคู่', short: 'ไม่โต', color: '#e66767', shape: 'triangle' },
  unknown: { label: 'งบไม่พอ (ไม่มี QoQ/YoY)', short: 'ไม่มีงบ', color: '#71717a', shape: 'square' },
};
export const ZONE_LABEL: Record<NeoZone, string> = { B: 'โซน B', near: 'ใกล้จุดสูงสุด', far: 'ไกลจากจุดสูงสุด', weak: 'RS ต่ำกว่าเกณฑ์', na: 'ข้อมูลไม่พอ' };
export const EXIT_TH: Record<ExitKind, string> = { target: 'ถึงเป้า', stop: 'stop', time: 'ครบเพดานวัน', trail: 'หลุด EMA20' };

// ─────────────────────────── แผนที่โซน ───────────────────────────

type ZonePoint = { symbol: string; x: number; y: number; vol: number | null; growth: GrowthStatus; signal: boolean; label: boolean; row: NeoScanRow };

function shapePath(shape: Shape, cx: number, cy: number, r: number): string {
  if (shape === 'diamond') return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
  if (shape === 'triangle') return `M ${cx} ${cy - r} L ${cx + r * 0.95} ${cy + r * 0.75} L ${cx - r * 0.95} ${cy + r * 0.75} Z`;
  const s = r * 0.85;
  return `M ${cx - s} ${cy - s} L ${cx + s} ${cy - s} L ${cx + s} ${cy + s} L ${cx - s} ${cy + s} Z`;
}

function zoneDot(color: string, shape: Shape) {
  return function Dot(props: unknown) {
    const { cx = 0, cy = 0, payload } = props as { cx?: number; cy?: number; payload?: ZonePoint };
    if (!payload) return <g />;
    const r = 3.5 + 1.5 * Math.min(4, Math.max(0, payload.vol ?? 1));
    return (
      <g>
        {payload.signal && <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke="#f4f4f5" strokeWidth={1.5} />}
        {shape === 'circle' ? (
          <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.85} stroke={SURFACE} strokeWidth={1} />
        ) : (
          <path d={shapePath(shape, cx, cy, r)} fill={color} fillOpacity={0.85} stroke={SURFACE} strokeWidth={1} />
        )}
        {payload.label && (
          <HaloText x={cx + r + 3} y={cy + 3} anchor="start" fill="#e4e4e7" size={9.5}>
            {payload.symbol}
          </HaloText>
        )}
      </g>
    );
  };
}

export function ZoneMap({ scan, th, asOf }: { scan: NeoScanRow[]; th: NeoThresholds; asOf: string }) {
  const pts: ZonePoint[] = scan
    .filter((r) => r.rsRank !== null && r.dist !== null)
    .map((r) => ({ symbol: r.symbol, x: r.rsRank!, y: r.dist!, vol: r.volRatio, growth: r.growth, signal: r.signal, label: r.rsRank! >= th.rsDiv - 10 || r.signal, row: r }));
  const yMax = Math.max(30, Math.ceil(Math.max(0, ...pts.map((p) => p.y)) / 10) * 10);
  const groups = (Object.keys(GROWTH) as GrowthStatus[]).map((g) => ({ g, pts: pts.filter((p) => p.growth === g) })).filter((x) => x.pts.length);
  const legend: LegendItem[] = groups.map(({ g, pts: ps }) => ({ label: `${GROWTH[g].short} (${ps.length})`, color: GROWTH[g].color, shape: 'dot' }));
  const inB = pts.filter((p) => p.row.zone === 'B');
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<ZonePoint>;
    const p = payload?.[0]?.payload;
    if (!active || !p || p.row === undefined) return null;
    const r = p.row;
    return (
      <TipBox
        title={`${r.symbol} · ${ZONE_LABEL[r.zone]}${r.signal ? ' · สัญญาณ' : ''}`}
        rows={[
          { label: 'RS Rank', value: r.rsRank === null ? '—' : r.rsRank.toFixed(1) },
          { label: 'ต่ำกว่าจุดสูงสุด 52 สัปดาห์', value: pct(r.dist, 2) },
          { label: 'ปริมาณ ÷ ค่าเฉลี่ย 50 วัน', value: r.volRatio === null ? '—' : `${r.volRatio.toFixed(2)}×` },
          { label: `กำไร QoQ / YoY (${r.period ?? '—'})`, value: `${signedPct(r.qoq)} / ${signedPct(r.yoy)}`, color: GROWTH[r.growth].color },
        ]}
      />
    );
  };
  return (
    <ChartFrame
      title={`แผนที่โซน ณ ${thDate(asOf)} (RS Rank × % ต่ำกว่าจุดสูงสุด 52 สัปดาห์)`}
      height={380}
      legend={legend}
      label={`แผนภาพกระจายของ ${pts.length} หุ้น: แกนนอน RS Rank แกนตั้ง % ต่ำกว่าจุดสูงสุด 52 สัปดาห์ · กรอบโซน B คือ RS ≥ ${th.rsDiv} และต่ำกว่าจุดสูงสุด ${th.knee}–${th.distB}% · ในโซน B ${inB.length} หุ้น${inB.length ? ` (${inB.map((p) => p.symbol).join(', ')})` : ''} · สัญญาณ ${pts.filter((p) => p.signal).length} หุ้น`}
      note={`กรอบเขียว = โซน B · ขนาดจุด = ปริมาณวันนั้นเทียบค่าเฉลี่ย 50 วัน · วงขาว = ผ่านครบทุกเงื่อนไข (โซน B + เขียว + ปริมาณ ≥ ${th.volTrigger}×) · รูป/สีจุด = การเติบโตของกำไรตามงบที่ประกาศแล้ว · ชื่อหุ้นแสดงเฉพาะ RS ≥ ${th.rsDiv - 10}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 36, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name="RS Rank" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={AXIS} stroke={BASELINE} />
          <YAxis type="number" dataKey="y" name="ต่ำกว่าจุดสูงสุด" reversed domain={[0, yMax]} ticks={niceTicks(0, yMax, 6)} tick={AXIS} width={36} stroke={BASELINE} tickFormatter={(v: number) => `${v}%`} />
          <ReferenceArea x1={th.rsDiv} x2={100} y1={th.knee} y2={th.distB} fill="#199e70" fillOpacity={0.12} stroke="#199e70" strokeOpacity={0.6} strokeDasharray="4 3" ifOverflow="hidden" />
          <ReferenceLine x={th.rsDiv} stroke={BASELINE} strokeDasharray="3 3" />
          <Tooltip content={tip} cursor={false} isAnimationActive={false} />
          {groups.map(({ g, pts: ps }) => (
            <Scatter key={g} data={ps} isAnimationActive={false} shape={zoneDot(GROWTH[g].color, GROWTH[g].shape)} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ─────────────────────────── ตารางสแกน ───────────────────────────

function Tick({ ok, label }: { ok: boolean; label: string }) {
  return (
    // relative: ข้อความ sr-only (absolute) ต้องอยู่ในกล่องเลื่อนของตาราง ไม่งั้นหลุดออกไปขยายความกว้างหน้าบนมือถือ
    <span title={label} className={cn('relative inline-flex h-5 w-5 items-center justify-center rounded border', ok ? 'border-emerald-500/50 text-emerald-300' : 'border-zinc-700 text-zinc-500')}>
      {ok ? <Check className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
      <span className="sr-only">
        {label}: {ok ? 'ผ่าน' : 'ไม่ผ่าน'}
      </span>
    </span>
  );
}

export function ScanTable({ rows, th, label }: { rows: NeoScanRow[]; th: NeoThresholds; label: string }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="relative max-h-[30rem] overflow-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[980px] text-left text-[11px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <thead className="sticky top-0 bg-zinc-950 text-zinc-400">
          <tr className="border-b border-zinc-800">
            {['หุ้น', 'ราคาปิด', 'RS Rank', 'RS ดิบ', 'ต่ำกว่าจุดสูงสุด', 'ปริมาณ', 'กำไร QoQ', 'กำไร YoY', 'งวด', 'การเติบโต', 'โซน', 'เงื่อนไข', 'สัญญาณ'].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-zinc-100">
          {rows.map((r) => (
            <tr key={r.symbol} className={cn('border-b border-zinc-800/60', r.signal && 'bg-emerald-500/10')}>
              <td className="px-2 py-1 font-sans font-medium">{r.symbol}</td>
              <td className="px-2">{r.close >= 100 ? r.close.toFixed(1) : r.close.toFixed(2)}</td>
              <td className={cn('px-2', r.checks.rs && 'text-emerald-300')}>{r.rsRank === null ? '—' : r.rsRank.toFixed(1)}</td>
              <td className="px-2">{signedPct(r.rsRaw)}</td>
              <td className={cn('px-2', r.checks.zone && 'text-emerald-300')}>{pct(r.dist, 2)}</td>
              <td className={cn('px-2', r.checks.volume && 'text-emerald-300')}>{r.volRatio === null ? '—' : `${r.volRatio.toFixed(2)}×`}</td>
              <td className="px-2">{signedPct(r.qoq)}</td>
              <td className="px-2">{signedPct(r.yoy)}</td>
              <td className="px-2 text-zinc-300">{r.period ?? '—'}</td>
              <td className="px-2 font-sans">
                <StatusBadge text={GROWTH[r.growth].short} color={GROWTH[r.growth].color} />
              </td>
              <td className="px-2 font-sans text-zinc-200">{ZONE_LABEL[r.zone]}</td>
              <td className="px-2">
                <span className="inline-flex gap-1">
                  <Tick ok={r.checks.rs} label={`RS ≥ ${th.rsDiv}`} />
                  <Tick ok={r.checks.zone} label={`ต่ำกว่าจุดสูงสุด ${th.knee}–${th.distB}%`} />
                  <Tick ok={r.checks.growth} label="กำไรเขียว" />
                  <Tick ok={r.checks.volume} label={`ปริมาณ ≥ ${th.volTrigger}×`} />
                </span>
              </td>
              <td className="px-2 font-sans">{r.signal ? <StatusBadge text="สัญญาณ" color="#199e70" /> : <span className="text-zinc-500">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── กรวยเงื่อนไข ───────────────────────────

export function FunnelPanel({ funnel }: { funnel: NeoFunnel }) {
  const max = Math.max(1, funnel.steps[0].count);
  const v = funnel.volume;
  return (
    <div className="grid gap-3 @min-[1000px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <figure className={figureCls}>
        <figcaption className={cn('mb-2', captionCls)}>วัน-หุ้นที่ผ่านทีละเงื่อนไข (สะสม)</figcaption>
        <ol className="space-y-2" aria-label="กรวยเงื่อนไขของกติกา Neotic 3D">
          {funnel.steps.map((s, i) => {
            const prev = i ? funnel.steps[i - 1].count : null;
            const share = prev ? (100 * s.count) / prev : null;
            const binding = funnel.binding === s.key;
            return (
              <li key={s.key} className="space-y-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[11px]">
                  <span className={cn('text-zinc-200', binding && 'font-semibold text-amber-200')}>
                    {s.label}
                    {binding && ' · หายากที่สุด'}
                  </span>
                  <span className="font-mono text-zinc-100">
                    {s.count.toLocaleString()}
                    {share !== null && <span className="text-zinc-400"> ({share.toFixed(share < 1 && share > 0 ? 2 : 1)}% ของขั้นก่อน)</span>}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded bg-zinc-800" aria-hidden>
                  <div className="h-2.5 rounded" style={{ width: s.count ? `max(2px, ${(100 * s.count) / max}%)` : 0, background: binding ? '#c98500' : SIGNAL }} />
                </div>
                {s.alone !== null && (
                  <p className="text-[10.5px] text-zinc-400">
                    เงื่อนไขนี้อย่างเดียว: {s.alone.toLocaleString()} วัน-หุ้น ({((100 * s.alone) / max).toFixed(s.alone && s.alone / max < 0.01 ? 2 : 1)}%)
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </figure>
      <figure className={figureCls}>
        <figcaption className={cn('mb-2', captionCls)}>ปริมาณเทียบค่าเฉลี่ย 50 วัน</figcaption>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {(
            [
              ['มัธยฐาน', v.p50],
              ['เปอร์เซ็นไทล์ 90', v.p90],
              ['เปอร์เซ็นไทล์ 99', v.p99],
              ['สูงสุด', v.max],
            ] as const
          ).map(([k, x]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-zinc-800/60 py-0.5">
              <dt className="text-zinc-400">{k}</dt>
              <dd className="font-mono text-zinc-100">{x === null ? '—' : `${x}×`}</dd>
            </div>
          ))}
        </dl>
        <div tabIndex={0} role="region" aria-label="จำนวนสัญญาณเมื่อเปลี่ยนเกณฑ์ปริมาณ" className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[260px] text-left text-[11px]">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="py-1 pr-2 font-medium">เกณฑ์ปริมาณ</th>
                <th className="px-2 font-medium">สัญญาณ (เงื่อนไขอื่นตามสเปก)</th>
              </tr>
            </thead>
            <tbody className="font-mono text-zinc-100">
              {funnel.byTrigger.map((b) => (
                <tr key={b.trigger} className="border-b border-zinc-800/60">
                  <td className="py-1 pr-2">
                    ≥ {b.trigger}×{' '}
                    <span className="font-sans text-zinc-400">{b.locked ? '(สเปก)' : b.inGrid ? '' : '(นอกช่วงจูน)'}</span>
                  </td>
                  <td className="px-2">{b.signals.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    </div>
  );
}

// ─────────────────────────── ความพร้อมของข้อมูล ───────────────────────────

const CHECK: Record<NeoCheck['status'], { label: string; icon: LucideIcon; color: string }> = {
  ok: { label: 'พร้อม', icon: CheckCircle2, color: '#199e70' },
  warn: { label: 'ระวัง', icon: AlertTriangle, color: '#c98500' },
  block: { label: 'ติดขัด', icon: XCircle, color: '#e66767' },
  info: { label: 'ข้อมูล', icon: Info, color: '#3987e5' },
};

export function ReadinessList({ checks }: { checks: NeoCheck[] }) {
  return (
    <ul className="grid gap-2 @min-[900px]:grid-cols-2">
      {checks.map((c) => {
        const st = CHECK[c.status];
        const Icon = st.icon;
        return (
          <li key={c.key} className="flex min-w-0 flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-xs font-semibold text-zinc-100">{c.title}</h4>
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-100">
                <Icon className="h-3 w-3" style={{ color: st.color }} aria-hidden />
                {st.label}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-300">{c.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────── ผลสะสม + ตารางไม้ ───────────────────────────

type CurveRow = { date: string; cum: number; random: number | null };

export function CurveChart({ curve }: { curve: CurveRow[] }) {
  const monthTicks = curve.filter((r, i) => i === 0 || r.date.slice(0, 7) !== curve[i - 1].date.slice(0, 7)).map((r) => r.date);
  const vals = curve.flatMap((r) => [r.cum, r.random ?? 0]);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
  const last = curve.at(-1);
  const legend: LegendItem[] = [
    { label: 'สัญญาณตามสเปก', color: SIGNAL, value: last ? signedFmt(last.cum, 1) : '—' },
    { label: 'สุ่มเข้า (หุ้นเดียวกัน · กติกาออกเดียวกัน)', color: RANDOM, dashed: true, value: last?.random === null || !last ? '—' : signedFmt(last.random, 1) },
  ];
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<CurveRow>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={thDate(r.date)}
        rows={[
          { label: 'สัญญาณ', value: `${signedFmt(r.cum, 1)} จุด`, color: SIGNAL },
          { label: 'สุ่มเข้า', value: r.random === null ? '—' : `${signedFmt(r.random, 1)} จุด`, color: RANDOM },
        ]}
      />
    );
  };
  return (
    <ChartFrame
      title="ผลรวมสุทธิสะสม (จุด % · ไม้ละหน่วยเท่ากัน)"
      height={260}
      legend={legend}
      label={`ผลรวมสุทธิสะสมของ ${curve.length} ไม้: สัญญาณ ${last ? signedFmt(last.cum, 1) : '—'} จุด · การสุ่มเข้าที่จับคู่ ${last && last.random !== null ? signedFmt(last.random, 1) : '—'} จุด`}
      note="เส้นเทาประ = ผลเฉลี่ยของการสุ่มเข้าที่จับคู่กับแต่ละไม้ (หุ้นเดียวกัน · วันสุ่มในหน้าต่างเดียวกัน · กติกาออกเดียวกัน) · ไม่ใช่ % ของพอร์ต"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={curve} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} ticks={monthTicks} interval={0} tickFormatter={thMonthTick} stroke={BASELINE} />
          <YAxis tick={AXIS} width={40} stroke={BASELINE} domain={[ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1]} ticks={ticks} tickFormatter={(v: number) => (v < 0 ? `−${Math.abs(v)}` : String(v))} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={tip} isAnimationActive={false} />
          <Line dataKey="cum" type="stepAfter" stroke={SIGNAL} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="random" type="stepAfter" stroke={RANDOM} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function NeoTradesTable({ trades }: { trades: NeoTrade[] }) {
  return (
    <div tabIndex={0} role="region" aria-label="ตารางไม้ของกติกา Neotic 3D ตามสเปก" className="max-h-[26rem] overflow-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[1080px] text-left text-[11px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <thead className="sticky top-0 bg-zinc-950 text-zinc-400">
          <tr className="border-b border-zinc-800">
            {['#', 'หุ้น', 'สัญญาณ', 'เข้า', 'ออก', 'ราคาเข้า', 'ราคาออก', 'สุทธิ %', 'R สุทธิ', 'สะสม', 'วัน', 'ออกเพราะ', 'MAE %', 'MFE %', 'RS', 'ระยะ %', 'ปริมาณ'].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-zinc-100">
          {trades.map((t, i) => (
            <tr key={`${t.symbol}-${t.signalDate}-${i}`} className="border-b border-zinc-800/60">
              <td className="px-2 py-1 text-zinc-400">{i + 1}</td>
              <td className="px-2 font-sans">{t.symbol}</td>
              <td className="px-2">{t.signalDate}</td>
              <td className="px-2">{t.entryDate}</td>
              <td className="px-2">{t.exitDate}</td>
              <td className="px-2">{t.entry}</td>
              <td className="px-2">{t.exit}</td>
              <td className={cn('px-2', t.retNetPct > 0 ? 'text-sky-300' : 'text-orange-300')}>{signedFmt(t.retNetPct)}</td>
              <td className="px-2">{signedFmt(t.rNet)}</td>
              <td className="px-2">{signedFmt(t.cumPct, 1)}</td>
              <td className="px-2">{t.days}</td>
              <td className="px-2 font-sans">{EXIT_TH[t.exitKind]}</td>
              <td className="px-2">{t.maePct ?? '—'}</td>
              <td className="px-2">{t.mfePct ?? '—'}</td>
              <td className="px-2">{t.rsRank}</td>
              <td className="px-2">{t.dist}</td>
              <td className="px-2">{t.volRatio}×</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── เดินหน้าจูน 4 เกณฑ์ ───────────────────────────

export function NeoFoldTable({ wf }: { wf: NeoWalkforward }) {
  return (
    <div tabIndex={0} role="region" aria-label="ตารางหน้าต่างเดินหน้าของการจูนเกณฑ์ Neotic" className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[1100px] text-left text-[11px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <thead className="text-zinc-400">
          <tr className="border-b border-zinc-800">
            {['หน้าต่าง', 'train (ผู้สมัคร)', 'test', 'เกณฑ์ที่เลือกบน train', 'ใน train', 'จูนแล้ว (test)', 'ตามสเปก (test)', 'สุ่มเข้า (test)'].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-zinc-100">
          {wf.folds.map((f) => (
            <tr key={f.index} className="border-b border-zinc-800/60">
              <td className="px-2 py-1">{f.index}</td>
              <td className="px-2">
                {f.trainStart ? `${f.trainStart} – ${f.trainEnd}` : '—'} ({f.trainCandidates})
              </td>
              <td className="px-2">
                {f.testStart} – {f.testEnd} ({f.testCandidates})
              </td>
              <td className="px-2 font-sans">{f.fallback ? <span className="text-amber-200">ไม้ใน train ไม่พอ → ใช้สเปก</span> : f.pickLabel}</td>
              <td className="px-2">
                {f.isTrades} ไม้ · {signedPct(f.isExp, 2)}
              </td>
              <td className="px-2">
                {f.tuned.trades} ไม้ · {signedPct(f.tuned.exp, 2)}
              </td>
              <td className="px-2">
                {f.locked.trades} ไม้ · {signedPct(f.locked.exp, 2)}
              </td>
              <td className="px-2">{signedPct(f.randExp, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── MAE / MFE ───────────────────────────

type MPoint = NeoExcursion['points'][number];

function mDot(fill: string) {
  return function Dot(props: unknown) {
    const { cx = 0, cy = 0 } = props as { cx?: number; cy?: number };
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="transparent" />
        <circle cx={cx} cy={cy} r={3.2} fill={fill} stroke={SURFACE} strokeWidth={0.75} />
      </g>
    );
  };
}

export function ExcursionPanel({ e }: { e: NeoExcursion }) {
  const wins = e.points.filter((p) => p.win);
  const losses = e.points.filter((p) => !p.win);
  const xMax = Math.max(1, ...e.points.map((p) => p.mae));
  const yMax = Math.max(1, ...e.points.map((p) => p.mfe));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<MPoint>;
    const p = payload?.[0]?.payload;
    if (!active || !p || p.mae === undefined) return null;
    return (
      <TipBox
        title={p.win ? 'ปิดเป็นกำไรสุทธิ' : 'ปิดเป็นขาดทุนสุทธิ'}
        rows={[
          { label: 'MAE (วิ่งสวน)', value: `${p.mae.toFixed(2)}%` },
          { label: 'MFE (วิ่งตาม)', value: `${p.mfe.toFixed(2)}%` },
        ]}
      />
    );
  };
  const row = (label: string, q: NeoExcursion['signal']) => (
    <tr className="border-b border-zinc-800/60">
      <td className="py-1.5 pr-2 font-sans text-zinc-200">{label}</td>
      <td className="px-2">{q.n}</td>
      <td className="px-2">
        {q.maeP50 ?? '—'} / {q.maeP95 ?? '—'}
      </td>
      <td className="px-2">
        {q.mfeP50 ?? '—'} / {q.mfeP75 ?? '—'}
      </td>
      <td className="pl-2">{q.eRatio ?? '—'}</td>
    </tr>
  );
  return (
    <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ChartFrame
        title={`MAE × MFE ของสัญญาณ (% ของราคาได้ของ · stop กว้าง ${e.wideStopPct}% · ไม่มีเป้า · ถือ ${e.horizon} วัน)`}
        height={300}
        legend={[
          { label: `ปิดกำไร (${wins.length})`, color: SIGNAL, shape: 'dot' },
          { label: `ปิดขาดทุน (${losses.length})`, color: CATEGORICAL[1], shape: 'dot' },
        ]}
        label={`แผนภาพกระจาย MAE กับ MFE ของ ${e.points.length} สัญญาณ · MAE เปอร์เซ็นไทล์ 95 = ${e.signal.maeP95 ?? '—'}% · MFE เปอร์เซ็นไทล์ 75 = ${e.signal.mfeP75 ?? '—'}%`}
        note={`เส้นประตั้ง = MAE เปอร์เซ็นไทล์ 95 (→ stop ตามวิธีของต้นแบบ) · เส้นประนอน = MFE เปอร์เซ็นไทล์ 75 (→ เป้า) · ใช้บรรยายเท่านั้น`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 14, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis type="number" dataKey="mae" name="MAE" tick={AXIS} stroke={BASELINE} domain={[0, Math.ceil(xMax)]} ticks={niceTicks(0, Math.ceil(xMax), 5)} tickFormatter={(v: number) => `${v}%`} />
            <YAxis type="number" dataKey="mfe" name="MFE" tick={AXIS} width={40} stroke={BASELINE} domain={[0, Math.ceil(yMax)]} ticks={niceTicks(0, Math.ceil(yMax), 5)} tickFormatter={(v: number) => `${v}%`} />
            {e.signal.maeP95 !== null && <ReferenceLine x={e.signal.maeP95} stroke="#f4f4f5" strokeDasharray="4 3" />}
            {e.signal.mfeP75 !== null && <ReferenceLine y={e.signal.mfeP75} stroke="#f4f4f5" strokeDasharray="4 3" />}
            <Tooltip content={tip} cursor={false} isAnimationActive={false} />
            <Scatter data={losses} isAnimationActive={false} shape={mDot(CATEGORICAL[1])} />
            <Scatter data={wins} isAnimationActive={false} shape={mDot(SIGNAL)} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>
      <figure className={figureCls}>
        <figcaption className={cn('mb-2', captionCls)}>สัญญาณเทียบวันสุ่ม (% ของราคาได้ของ)</figcaption>
        <div tabIndex={0} role="region" aria-label="ตารางเปอร์เซ็นไทล์ MAE MFE ของสัญญาณ Neotic เทียบวันสุ่ม" className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-[11px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="py-1.5 pr-2 font-medium" />
                <th className="px-2 font-medium">ไม้</th>
                <th className="px-2 font-medium">MAE p50/95</th>
                <th className="px-2 font-medium">MFE p50/75</th>
                <th className="pl-2 font-medium">E-ratio</th>
              </tr>
            </thead>
            <tbody className="font-mono text-zinc-100">
              {row('สัญญาณ', e.signal)}
              {row('วันสุ่ม', e.random)}
            </tbody>
          </table>
        </div>
        {e.signal.eRatio !== null && e.random.eRatio !== null && (
          <p className="mt-2 text-[11px] text-zinc-300">
            E-ratio สัญญาณ {e.signal.eRatio} · วันสุ่ม {e.random.eRatio}{' '}
            <StatusBadge text={e.signal.eRatio > e.random.eRatio ? 'จังหวะเข้าดีกว่าวันสุ่ม' : 'ไม่ดีกว่าวันสุ่ม'} color={e.signal.eRatio > e.random.eRatio ? POS : NEG} />
          </p>
        )}
        {e.suggestion && (
          <p className="mt-2 text-[11px] leading-snug text-zinc-400">
            วิธีของต้นแบบบนทั้งหน้าต่าง: stop {e.suggestion.stopPct}% · เป้า {e.suggestion.targetPct}% — ใช้ตัวเลขนี้ย้อนทดสอบบนข้อมูลเดิม = จูนติดอดีต ต้องทดสอบนอกตัวอย่างหรือ forward ก่อนใช้
          </p>
        )}
      </figure>
    </div>
  );
}
