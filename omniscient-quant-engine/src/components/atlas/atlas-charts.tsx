'use client';

/**
 * กราฟของหน้า "Atlas พฤติกรรมระบบ" — 6 มุม (A–F) ตามรูปแบบ Grid Behavior Atlas ดัดแปลงให้ส่องเอนจิน 5 ด่านบนหุ้นไทย
 * ช่วงความเชื่อมั่นเป็น forest plot: จุด = ค่าเฉลี่ย · เส้น = CI 95% · เส้นตั้ง = "ไม่มีผล" (0 หรือ AUC 0.5) · ตัวเลขเป็นข้อความเสมอ
 * สี: categorical ช่อง 1–6 ลำดับคงที่ = ตัวตน (กลุ่มวัน · หมวด) · ผลลัพธ์ที่มีลำดับ (ถึงเป้า → stop) และกำไร/ขาดทุน = diverging น้ำเงิน ↔ แดง
 *     จำนวนนับ = ramp น้ำเงินเฉดเดียว · คำตัดสินมีป้ายข้อความกำกับเสมอ (ไม่สื่อด้วยสีอย่างเดียว) · ข้อความเป็นสีหมึก
 */

import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AXIS,
  BASELINE,
  CATEGORICAL,
  ChartFrame,
  DIV_NEG,
  DIV_POS,
  divergingColor,
  DivergingLegend,
  GRID,
  HaloText,
  inkOn,
  Legend,
  niceTicks,
  robustMax,
  sequentialColor,
  SEQUENTIAL,
  SURFACE,
  TipBox,
  type LegendItem,
  type TipProps,
  type ViewBox,
} from '@/components/charts/chart-kit';
import type {
  AtlasCI,
  AtlasDepth,
  AtlasHeader,
  AtlasIntel,
  AtlasLifecycle,
  AtlasMix,
  AtlasStateMap,
  AtlasTiming,
  AtlasVerdict,
  EndKey,
} from '@/lib/atlas/types';
import { thDate, thMonthTick } from '@/lib/flows/format';
import { cn } from '@/lib/utils';

const BLUE = CATEGORICAL[0];
/** เทาสำหรับข้อมูลบริบท / "ไม่มีผล" */
const CONTEXT = '#71717a';
const NEUTRAL = '#d4d4d8';
const INK = '#f4f4f5';
const INK_MUTED = '#a1a1aa';
const POS = DIV_POS[3];
const NEG = DIV_NEG[3];
const slot = (i: number) => CATEGORICAL[i % CATEGORICAL.length];

export const signedFmt = (v: number, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;
const ciText = (c: AtlasCI, digits = 2) => `${signedFmt(c.mean, digits)} [${signedFmt(c.lo, digits)}, ${signedFmt(c.hi, digits)}]`;
export const pFmt = (p: number) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const plainTick = (v: number) => (v < 0 ? `−${Math.abs(v)}` : String(v));
const captionCls = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-300';
const figureCls = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-3';

// ─────────────────────────── คำตัดสิน + forest plot (ใช้ทุกมุม) ───────────────────────────

export const VERDICT: Record<AtlasVerdict, { label: string; color: string }> = {
  better: { label: 'ดีกว่า', color: POS },
  worse: { label: 'แย่กว่า', color: NEG },
  unclear: { label: 'ยังสรุปไม่ได้', color: INK_MUTED },
  same: { label: 'ไม่เปลี่ยนสัญญาณ', color: CONTEXT },
  baseline: { label: 'กติกาปัจจุบัน', color: INK },
};

export function StatusBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 px-1 text-[10px] font-normal text-zinc-200">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      {text}
    </span>
  );
}

export const VerdictBadge = ({ v }: { v: AtlasVerdict }) => <StatusBadge text={VERDICT[v].label} color={VERDICT[v].color} />;

export interface ForestRow {
  key: string;
  label: string;
  ci: AtlasCI;
  color: string;
  /** ป้ายสถานะ/คำตัดสิน (ข้อความ) */
  badge?: ReactNode;
  /** บรรทัดรอง: n · อัตราชนะ ฯลฯ */
  sub?: string;
  /** ค่าเป็นข้อความทางขวา (ค่าเริ่มต้น = mean [lo, hi]) */
  value?: string;
  /** แถวอ้างอิง (กติกาปัจจุบัน) = จุดโปร่ง */
  hollow?: boolean;
}

/** forest plot แบบ HTML: ทุกแถวมีตัวเลขเป็นข้อความ (ส่วนภาพซ่อนจาก AT) · แคบกว่า 560px = เรียงเป็นแถวเดียว */
export function ForestPlot({
  title,
  rows,
  reference = 0,
  refNote,
  digits = 2,
  fmt,
  tickFmt = plainTick,
}: {
  title: string;
  rows: ForestRow[];
  reference?: number;
  refNote: string;
  digits?: number;
  fmt?: (v: number) => string;
  tickFmt?: (v: number) => string;
}) {
  const f = fmt ?? ((v: number) => signedFmt(v, digits));
  const vals = [reference, ...rows.flatMap((r) => [r.ci.lo, r.ci.hi, r.ci.mean])];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.06, 1e-3);
  const lo = min - pad;
  const hi = max + pad;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks = niceTicks(lo, hi, 5).filter((t) => t >= lo && t <= hi);
  // กว้างพอ = 3 คอลัมน์ (ป้าย | แผนภาพ | ตัวเลข) · กว้างมาก = ป้ายกว้างขึ้นให้บรรทัดสถิติไม่ต้องตัดหลายบรรทัด
  // คอลัมน์ตัวเลขกว้างคงที่: ทุกแถว (และแกน) ต้องได้แผนภาพกว้างเท่ากัน ไม่อย่างนั้นเส้นอ้างอิง/จุดของแต่ละแถวจะไม่ตรงกัน
  const grid =
    'grid items-center gap-x-3 gap-y-0.5 @min-[720px]:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_15rem] @min-[1000px]:grid-cols-[minmax(0,24rem)_minmax(0,1fr)_16rem]';
  return (
    <figure className={cn('@container', figureCls)}>
      <figcaption className={cn('mb-2', captionCls)}>{title}</figcaption>
      <ul className="space-y-2 text-[11px]">
        {rows.map((r) => (
          <li key={r.key} className={grid}>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-zinc-100">
                <span>{r.label}</span>
                {r.badge}
              </p>
              {r.sub && <p className="text-[10.5px] leading-snug text-zinc-400">{r.sub}</p>}
            </div>
            <div className="relative h-5" aria-hidden>
              <span className="absolute inset-y-0 w-px bg-zinc-500" style={{ left: `${x(reference)}%` }} />
              <span
                className="absolute top-1/2 h-0.5 -translate-y-1/2"
                style={{ left: `${x(r.ci.lo)}%`, width: `${Math.max(0, x(r.ci.hi) - x(r.ci.lo))}%`, background: r.color }}
              />
              <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2" style={{ left: `${x(r.ci.lo)}%`, background: r.color }} />
              <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2" style={{ left: `${x(r.ci.hi)}%`, background: r.color }} />
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${x(r.ci.mean)}%`,
                  background: r.hollow ? SURFACE : r.color,
                  boxShadow: r.hollow ? `inset 0 0 0 2px ${r.color}` : `0 0 0 2px ${SURFACE}`,
                }}
              />
            </div>
            <p className="whitespace-nowrap font-mono text-zinc-100 @min-[720px]:text-right">{r.value ?? `${f(r.ci.mean)} [${f(r.ci.lo)}, ${f(r.ci.hi)}]`}</p>
          </li>
        ))}
      </ul>
      <div className={cn(grid, 'mt-1')} aria-hidden>
        <span className="hidden @min-[720px]:block" />
        <div className="relative h-4 border-t border-zinc-700">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0.5 -translate-x-1/2 font-mono text-[10px] text-zinc-400" style={{ left: `${x(t)}%` }}>
              {tickFmt(t)}
            </span>
          ))}
        </div>
        <span className="hidden @min-[720px]:block" />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-zinc-400">{refNote}</p>
    </figure>
  );
}

// ─────────────────────────── A · แผนที่สถานะตลาด ───────────────────────────

type MapPoint = AtlasStateMap['points'][number];
export type MapMode = 'outcome' | 'cluster';

function dot(props: unknown, fill: string, r: number, stroke?: string) {
  const { cx = 0, cy = 0 } = props as { cx?: number; cy?: number };
  return (
    <g>
      <circle cx={cx} cy={cy} r={Math.max(r + 3, 6)} fill="transparent" />
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke ?? 'none'} strokeWidth={stroke ? 0.75 : 0} />
    </g>
  );
}

/** ป้ายหมายเลขกลุ่มที่จุดศูนย์กลางของกลุ่ม */
function clusterTag(id: number, on: boolean) {
  return function ClusterTag(props: unknown) {
    const vb = (props as { viewBox?: ViewBox }).viewBox;
    if (!vb || vb.x === undefined || vb.y === undefined) return <g />;
    const cx = vb.x + (vb.width ?? 0) / 2;
    const cy = vb.y + (vb.height ?? 0) / 2;
    return (
      <g>
        <circle cx={cx} cy={cy} r={8.5} fill={SURFACE} stroke={on ? INK : INK_MUTED} strokeWidth={on ? 2 : 1} />
        <text x={cx} y={cy + 3.5} textAnchor="middle" fill={on ? INK : '#d4d4d8'} fontSize={10} fontWeight={on ? 700 : 500}>
          {String(id + 1)}
        </text>
      </g>
    );
  };
}

export function StateMapChart({ p, mode, selected }: { p: AtlasStateMap; mode: MapMode; selected: number }) {
  const xs = p.points.map((q) => q.x);
  const ys = p.points.map((q) => q.y);
  const xDom: [number, number] = [Math.floor(Math.min(...xs) - 0.5), Math.ceil(Math.max(...xs) + 0.5)];
  const yDom: [number, number] = [Math.floor(Math.min(...ys) - 0.5), Math.ceil(Math.max(...ys) + 0.5)];
  const centers = p.clusters.map((c) => {
    const pts = p.points.filter((q) => q.c === c.id);
    return { id: c.id, x: avg(pts.map((q) => q.x)), y: avg(pts.map((q) => q.y)) };
  });
  const oos = p.points.filter((q) => q.outcome !== null);
  const outside = p.points.filter((q) => q.outcome === null);
  const max = robustMax(oos.map((q) => q.outcome ?? 0));
  const hl = slot(selected);
  const c = p.clusters[selected];
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<MapPoint>;
    const pt = payload?.[0]?.payload;
    if (!active || !pt || pt.date === undefined) return null;
    return (
      <TipBox
        title={thDate(pt.date)}
        rows={[
          { label: 'กลุ่มวัน', value: `${pt.c + 1} · ${p.clusters[pt.c]?.label ?? ''}` },
          { label: 'ส่วนต่างของโมเดล', value: pt.outcome === null ? 'นอกช่วง walk-forward' : `${signedFmt(pt.outcome)} จุด %` },
        ]}
      />
    );
  };
  const legend: LegendItem[] | undefined =
    mode === 'cluster'
      ? [
          { label: `กลุ่ม ${selected + 1} · ${c?.label ?? ''}`, color: hl, shape: 'dot' },
          { label: 'วันอื่น', color: CONTEXT, shape: 'dot' },
        ]
      : undefined;
  const series =
    mode === 'outcome'
      ? [
          <Scatter key="outside" data={outside} isAnimationActive={false} shape={(props: unknown) => dot(props, 'rgba(113,113,122,0.45)', 2)} />,
          <Scatter
            key="oos"
            data={oos}
            isAnimationActive={false}
            shape={(props: unknown) => dot(props, divergingColor((props as { payload?: MapPoint }).payload?.outcome ?? 0, max), 3.2, CONTEXT)}
          />,
        ]
      : [
          <Scatter key="rest" data={p.points.filter((q) => q.c !== selected)} isAnimationActive={false} shape={(props: unknown) => dot(props, 'rgba(113,113,122,0.55)', 2.5)} />,
          <Scatter key="sel" data={p.points.filter((q) => q.c === selected)} isAnimationActive={false} shape={(props: unknown) => dot(props, hl, 3)} />,
        ];
  return (
    <ChartFrame
      title={`แผนที่สถานะตลาด ${p.points.length} วัน · PCA 2 มิติ · ${p.clusters.length} กลุ่ม`}
      height={380}
      legend={legend}
      label={`แผนที่สถานะตลาด ${p.points.length} วัน แบ่ง ${p.clusters.length} กลุ่ม · ${p.neighbor.n} วันมีผลของโมเดล · ความสอดคล้องกับเพื่อนบ้าน ρ = ${p.neighbor.rho.toFixed(3)} (p = ${pFmt(p.neighbor.p)})`}
      note={
        mode === 'outcome' ? (
          <DivergingLegend
            neg="โมเดลเลือกผิดทาง"
            pos="โมเดลเลือกถูกทาง"
            note={`สี = ส่วนต่างของโมเดลวันนั้น (เข้มสุด ≥ ${max.toFixed(2)} จุด %) · เทาเล็ก = นอกช่วง walk-forward · เลขในวงกลม = กลุ่มวัน`}
          />
        ) : (
          'เลขในวงกลม = กลุ่มวัน (จุดศูนย์กลาง) · กดชื่อกลุ่มในตารางเพื่อไฮไลต์'
        )
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name="PC1" tick={AXIS} stroke={BASELINE} domain={xDom} ticks={niceTicks(xDom[0], xDom[1])} tickFormatter={plainTick} />
          <YAxis type="number" dataKey="y" name="PC2" tick={AXIS} width={28} stroke={BASELINE} domain={yDom} ticks={niceTicks(yDom[0], yDom[1], 4)} tickFormatter={plainTick} />
          <Tooltip content={tip} cursor={false} isAnimationActive={false} />
          {series}
          {centers.map((cc) => (
            <ReferenceDot key={cc.id} x={cc.x} y={cc.y} r={0} fill="none" stroke="none" label={clusterTag(cc.id, mode === 'cluster' && cc.id === selected)} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function NeighborCard({ p }: { p: AtlasStateMap }) {
  const n = p.neighbor;
  const structured = n.p < 0.05 && n.rho > 0;
  return (
    <div className={cn(figureCls, 'text-[11px]')}>
      <p className={captionCls}>ความสอดคล้องกับเพื่อนบ้าน (k-NN)</p>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <dt className="text-zinc-400">ρ (Spearman)</dt>
          <dd className="font-mono text-lg text-zinc-50">{signedFmt(n.rho, 3)}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">p (เลื่อนวงกลม)</dt>
          <dd className="font-mono text-lg text-zinc-50">{pFmt(n.p)}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">วันที่มีผล</dt>
          <dd className="font-mono text-lg text-zinc-50">{n.n}</dd>
        </div>
      </dl>
      <p className="mt-2 leading-relaxed text-zinc-300">
        เทียบผลของโมเดลแต่ละวันกับค่าเฉลี่ยของ {n.k} วันที่ “หน้าตาตลาด” ใกล้ที่สุด (ไม่นับวันที่ห่างกันไม่เกิน {n.exclude} วันทำการ เพื่อตัดความต่อเนื่องของเวลา) —{' '}
        {structured
          ? 'ρ เป็นบวกและ p < 0.05: ตำแหน่งบนแผนที่ช่วยบอกได้บางส่วนว่าวันไหนโมเดลทำงานดี'
          : 'ρ ใกล้ 0 หรือ p ≥ 0.05: ตำแหน่งบนแผนที่ยังบอกไม่ได้ว่าวันไหนโมเดลทำงานดี (ตัวกรองสภาพตลาดเพิ่มจึงยังไม่มีหลักฐานรองรับ)'}
      </p>
    </div>
  );
}

export function ClusterOutcomeTable({ p, selected, onSelect }: { p: AtlasStateMap; selected: number; onSelect: (id: number) => void }) {
  const th = 'px-2 py-1.5 text-right font-medium';
  const num = 'px-2 py-1.5 text-right font-mono';
  const fmt = (v: number | null, d = 2, unit = '') => (v === null ? '—' : `${signedFmt(v, d)}${unit}`);
  return (
    <div tabIndex={0} role="region" aria-label="ตารางผลของระบบตามกลุ่มวัน" className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[560px] text-[11px]">
        <caption className="sr-only">
          ผลของระบบตามกลุ่มวันบนแผนที่: สัดส่วนวัน จำนวนสัญญาณ สัญญาณต่อ 100 หุ้น-วัน อัตราชนะและผลเฉลี่ยของไม้จำลอง และส่วนต่างของโมเดลเฉลี่ย
        </caption>
        <thead className="bg-zinc-900 text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">
              กลุ่มวัน (กดเพื่อไฮไลต์)
            </th>
            <th scope="col" className={th}>% วัน</th>
            <th scope="col" className={th}>สัญญาณ</th>
            <th scope="col" className={th}>ต่อ 100 หุ้น-วัน</th>
            <th scope="col" className={th}>ชนะ</th>
            <th scope="col" className={th}>ผล/ไม้</th>
            <th scope="col" className={th}>ส่วนต่างโมเดล (จุด %)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
          {p.clusters.map((c) => {
            const on = c.id === selected;
            return (
              <tr key={c.id} className={cn(on && 'bg-zinc-800/60')}>
                <th scope="row" className="px-1 py-1 text-left font-normal">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onSelect(c.id)}
                    className={cn('flex min-h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-zinc-200 hover:bg-zinc-800', on && 'font-semibold text-zinc-50')}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slot(c.id) }} aria-hidden />
                    <span className="font-mono text-zinc-400">{c.id + 1}</span>
                    <span>{c.label}</span>
                  </button>
                </th>
                <td className={num}>{c.share.toFixed(1)}%</td>
                <td className={cn(num, 'text-zinc-100')}>{c.nSignals}</td>
                <td className={num}>{c.signalRate.toFixed(2)}</td>
                <td className={num}>{c.winRate === null ? '—' : `${c.winRate.toFixed(0)}%`}</td>
                <td className={cn(num, 'text-zinc-100')}>{fmt(c.meanRet, 2, '%')}</td>
                <td className={num}>{fmt(c.spread, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FeatureCorrBars({ p }: { p: AtlasStateMap }) {
  const max = Math.max(0.15, ...p.featureCorr.map((f) => Math.abs(f.rho))) * 1.1;
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-2', captionCls)}>ตัวแปรตลาดตัวไหนสัมพันธ์กับผลของโมเดล (Spearman ρ)</figcaption>
      <div role="img" aria-label={`สหสัมพันธ์อันดับกับผลของโมเดล: ${p.featureCorr.map((f) => `${f.feature} ${signedFmt(f.rho, 2)}`).join(', ')}`} className="space-y-1">
        {p.featureCorr.map((f) => {
          const w = Math.min(50, (Math.abs(f.rho) / max) * 50);
          return (
            <div key={f.feature} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-[11px]">
              <span className="truncate text-zinc-300">{f.feature}</span>
              <span className="relative h-3" aria-hidden>
                <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                <span
                  className="absolute inset-y-0.5"
                  style={f.rho >= 0 ? { left: '50%', width: `${w}%`, background: POS, borderRadius: '0 2px 2px 0' } : { right: '50%', width: `${w}%`, background: NEG, borderRadius: '2px 0 0 2px' }}
                />
              </span>
              <span className="text-right font-mono text-zinc-100">{signedFmt(f.rho, 2)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">เส้นกลาง = 0 · ครึ่งแถบเต็ม = ±{max.toFixed(2)} · |ρ| &lt; 0.1 ถือว่าแทบไม่สัมพันธ์ · ใช้เฉพาะวันในช่วง walk-forward</p>
    </figure>
  );
}

export function RegimeForest({ p }: { p: AtlasStateMap }) {
  return (
    <ForestPlot
      title="ส่วนต่างของโมเดลตามภาวะตลาด (จุด % ต่อวัน)"
      rows={p.regime.map((r) => ({ key: r.key, label: `วัน ${r.label}`, sub: `${r.n} วัน`, ci: r.ci, color: NEUTRAL }))}
      refNote="เส้นตั้ง = 0 (หุ้นที่โมเดลให้ P(up) สูงสุดกับต่ำสุดให้ผลเท่ากัน) · CI 95% จาก block bootstrap"
    />
  );
}

// ─────────────────────────── B · จังหวะเวลา ───────────────────────────

export function TimingHeatmap({ p }: { p: AtlasTiming }) {
  const total = p.byWeekday.reduce((a, w) => a + w.signals, 0);
  const max = Math.max(1, ...p.cells.flat());
  const expected = (share: number) => (total * share) / 100;
  const mMax = Math.max(1, ...p.byMonth.map((m) => Math.max(m.signals, expected(m.dayShare))));
  const wMax = Math.max(1, ...p.byWeekday.map((w) => Math.max(w.signals, expected(w.dayShare))));
  const isPeak = (r: number, c: number) => p.peak !== null && p.rows[r] === p.peak.weekday && p.cols[c] === p.peak.month;
  const grid = { gridTemplateColumns: '2.25rem repeat(12, minmax(0, 1fr)) 9rem' };
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-1', captionCls)}>จำนวนสัญญาณ · วันในสัปดาห์ × เดือน (รวมทุกปีในช่วง)</figcaption>
      <p className="mb-2 text-[11px] text-zinc-300">
        ตัวเลขในช่อง = จำนวนสัญญาณ · ขอบบน = รายเดือน · ขอบขวา = รายวันในสัปดาห์ · เส้นประ = จำนวนที่ควรเป็นถ้าสัญญาณกระจายตามจำนวนวันทำการ
      </p>
      <div tabIndex={0} role="region" aria-label="heatmap จังหวะเวลาของสัญญาณ เลื่อนดูในแนวนอนได้" className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`สัญญาณ ${total} ครั้ง · รายเดือน: ${p.byMonth.map((m) => `${m.label} ${m.signals}`).join(', ')} · รายวัน: ${p.byWeekday.map((w) => `${w.label} ${w.signals}`).join(', ')}${p.peak ? ` · ช่องสูงสุด ${p.peak.weekday} × ${p.peak.month} = ${p.peak.n}` : ''}`}
          className="min-w-[720px] max-w-6xl space-y-[2px]"
        >
          <div className="grid gap-[2px]" style={grid}>
            <span className="self-end text-[10px] leading-tight text-zinc-400">รายเดือน</span>
            {p.byMonth.map((m) => (
              <span key={m.label} className="flex h-20 flex-col px-0.5 pt-0.5" title={`${m.label}: ${m.signals} สัญญาณ (${m.share}% ของสัญญาณ · ${m.dayShare}% ของวัน)`}>
                <span className="text-center font-mono text-[10px] leading-tight text-zinc-100">{m.signals}</span>
                <span className="relative min-h-0 flex-1">
                  <span className="absolute bottom-0 left-1/2 w-3/5 -translate-x-1/2 rounded-t-[3px]" style={{ height: `${(m.signals / mMax) * 100}%`, background: BLUE }} />
                  <span className="absolute inset-x-0 border-t border-dashed border-zinc-200" style={{ bottom: `${(expected(m.dayShare) / mMax) * 100}%` }} />
                </span>
              </span>
            ))}
            <span className="self-end pl-1 text-[10px] leading-tight text-zinc-400">เส้นประ = คาดหมายตามจำนวนวัน</span>
          </div>
          <div className="grid gap-[2px]" style={grid}>
            <span />
            {p.cols.map((m) => (
              <span key={m} className="truncate text-center text-[10px] text-zinc-400">
                {m}
              </span>
            ))}
            <span className="pl-1 text-[10px] text-zinc-400">รายวัน (สัญญาณ · % ของทั้งหมด)</span>
          </div>
          {p.rows.map((wd, r) => (
            <div key={wd} className="grid gap-[2px]" style={grid}>
              <span className="self-center text-[10px] text-zinc-400">{wd}</span>
              {p.cells[r].map((n, ci) => {
                const bg = sequentialColor(n, max);
                return (
                  <span
                    key={p.cols[ci]}
                    title={`${wd} · ${p.cols[ci]}: ${n} สัญญาณ`}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-[3px] font-mono text-[10.5px]',
                      !bg && 'border border-zinc-800/80',
                      isPeak(r, ci) && 'outline outline-2 -outline-offset-2 outline-zinc-50',
                    )}
                    style={{ background: bg ?? 'transparent', color: bg ? inkOn(bg) : INK_MUTED }}
                  >
                    {n > 0 ? n : ''}
                  </span>
                );
              })}
              <span className="flex items-center gap-1.5 pl-1">
                <span className="relative h-5 min-w-0 flex-1" aria-hidden>
                  <span className="absolute inset-y-0.5 left-0 rounded-r-[3px]" style={{ width: `${(p.byWeekday[r].signals / wMax) * 100}%`, background: BLUE }} />
                  <span className="absolute -inset-y-0.5 border-l border-dashed border-zinc-200" style={{ left: `${(expected(p.byWeekday[r].dayShare) / wMax) * 100}%` }} />
                </span>
                <span className="w-[4.25rem] shrink-0 text-right font-mono text-[10px] text-zinc-200">
                  {p.byWeekday[r].signals} · {p.byWeekday[r].share.toFixed(0)}%
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-300">
        <span>น้อย</span>
        <span className="flex gap-[2px]" aria-hidden>
          {SEQUENTIAL.map((c) => (
            <span key={c} className="h-3 w-4 rounded-[2px]" style={{ background: c }} />
          ))}
        </span>
        <span>มาก ({max} สัญญาณ/ช่อง)</span>
        <span className="text-zinc-400">· ช่องว่าง = ไม่มีสัญญาณ · กรอบขาว = ช่องที่มีสัญญาณมากสุด</span>
      </div>
    </figure>
  );
}

/** สัดส่วนสัญญาณเทียบสัดส่วนวันทำการ (ขีดขาว) + ผลของไม้จำลองต่อช่วง */
export function ShareVsDays({ title, unitLabel, rows }: { title: string; unitLabel: string; rows: AtlasTiming['byWeekday'] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.share, r.dayShare)));
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-1', captionCls)}>{title}</figcaption>
      <Legend
        items={[
          { label: 'สัดส่วนสัญญาณ', color: BLUE, shape: 'box' },
          { label: 'สัดส่วนวันทำการ (ถ้าเกิดสม่ำเสมอ)', color: INK },
        ]}
      />
      <div tabIndex={0} role="region" aria-label={`ตาราง${title}`} className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-[11px]">
          <caption className="sr-only">
            {title}: สัดส่วนสัญญาณเทียบสัดส่วนวันทำการ จำนวนสัญญาณ อัตราชนะ และผลเฉลี่ยต่อไม้ของไม้จำลอง
          </caption>
          <thead className="text-zinc-400">
            <tr>
              <th scope="col" className="px-1.5 py-1 text-left font-medium">
                {unitLabel}
              </th>
              <th scope="col" className="w-[36%] px-1.5 py-1 text-left font-medium">
                สัญญาณ vs วัน
              </th>
              <th scope="col" className="px-1.5 py-1 text-right font-medium">
                % สัญญาณ / % วัน (n)
              </th>
              <th scope="col" className="px-1.5 py-1 text-right font-medium">
                ชนะ
              </th>
              <th scope="col" className="px-1.5 py-1 text-right font-medium">
                ผล/ไม้
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="px-1.5 py-1 text-left font-normal text-zinc-200">
                  {r.label}
                </th>
                <td className="px-1.5 py-1">
                  <span className="relative block h-3" aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-r-[3px]" style={{ width: `${(r.share / max) * 100}%`, background: BLUE }} />
                    <span className="absolute -inset-y-0.5 w-0.5 bg-zinc-100" style={{ left: `${(r.dayShare / max) * 100}%` }} />
                  </span>
                </td>
                <td className="whitespace-nowrap px-1.5 py-1 text-right font-mono text-zinc-100">
                  {r.share.toFixed(1)}% / {r.dayShare.toFixed(1)}% <span className="text-zinc-400">({r.signals})</span>
                </td>
                <td className="px-1.5 py-1 text-right font-mono">{r.winRate === null ? '—' : `${r.winRate.toFixed(0)}%`}</td>
                <td className="px-1.5 py-1 text-right font-mono">{r.meanRet === null ? '—' : `${signedFmt(r.meanRet)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// ─────────────────────────── C · ความลึก (สัญญาณพร้อมกัน) ───────────────────────────

type DepthDay = AtlasDepth['days'][number];
type DepthPeak = AtlasDepth['peaks'][number];

/** ป้ายวันที่พร้อมกันมากสุด: เส้นนำขึ้นไปแถวของตัวเอง (แถวละ 13px) · ฝั่งขวาของกราฟยื่นป้ายไปทางซ้าย */
function peakTag(pk: DepthPeak, row: number, side: 'start' | 'end') {
  return function PeakTag(props: unknown) {
    const vb = (props as { viewBox?: ViewBox }).viewBox;
    if (!vb || vb.x === undefined || vb.y === undefined) return <g />;
    const cx = vb.x + (vb.width ?? 0) / 2;
    const cy = vb.y + (vb.height ?? 0) / 2;
    const ty = 12 + row * 13;
    return (
      <g>
        <line x1={cx} y1={cy - 2} x2={cx} y2={ty + 3} stroke={INK_MUTED} strokeWidth={1} strokeDasharray="2 2" />
        <circle cx={cx} cy={cy - 2} r={2.5} fill={INK} />
        <HaloText x={cx + (side === 'start' ? 5 : -5)} y={ty} anchor={side} fill={INK}>
          {`${thDate(pk.date)} · ${pk.n} ตัว · breadth ${pk.breadth.toFixed(0)}% · SET ${signedFmt(pk.marketRet)}%`}
        </HaloText>
      </g>
    );
  };
}

export function DepthChart({ p }: { p: AtlasDepth }) {
  const n = p.days.length;
  const idx = new Map(p.days.map((d, i) => [d.date, i]));
  const tags = p.peaks.map((pk) => ({ pk, frac: (idx.get(pk.date) ?? 0) / Math.max(1, n - 1) }));
  const right = tags.filter((t) => t.frac > 0.55).sort((a, b) => b.frac - a.frac);
  const left = tags.filter((t) => t.frac <= 0.55).sort((a, b) => a.frac - b.frac);
  // แถวของป้าย: ฝั่งขวาเรียงจากขวาสุด ฝั่งซ้ายเรียงจากซ้ายสุด → เส้นนำไม่ผ่านป้ายของแถวที่ต่ำกว่า
  const placed = [...right.map((t) => ({ ...t, side: 'end' as const })), ...left.map((t) => ({ ...t, side: 'start' as const }))];
  const top = 14 + placed.length * 13;
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<DepthDay>;
    const d = payload?.[0]?.payload;
    if (!active || !d) return null;
    return (
      <TipBox
        title={thDate(d.date)}
        rows={[
          { label: 'สัญญาณวันนั้น', value: String(d.n), color: CONTEXT },
          { label: 'เฉลี่ย 7 วัน', value: d.mean7.toFixed(2), color: BLUE },
        ]}
      />
    );
  };
  const legend: LegendItem[] = [
    { label: 'สัญญาณรายวัน', color: CONTEXT, shape: 'box' },
    { label: 'เฉลี่ย 7 วันทำการ', color: BLUE },
  ];
  return (
    <ChartFrame
      title="สัญญาณพร้อมกันต่อวัน (จำนวนหุ้น)"
      height={220 + placed.length * 13}
      legend={legend}
      label={`สัญญาณพร้อมกันต่อวัน ${n} วัน: สูงสุด ${p.max} ตัว · วันที่ไม่มีสัญญาณ ${p.zeroShare}% · เมื่อมีเฉลี่ย ${p.meanWhenActive} ตัว · จุดสูงสุด ${p.peaks.map((pk) => `${thDate(pk.date)} ${pk.n} ตัว`).join(', ')}`}
      note={`วันที่ไม่มีสัญญาณ ${p.zeroShare}% · เมื่อมีเฉลี่ย ${p.meanWhenActive} ตัว · ป้าย = ${p.peaks.length} วันที่พร้อมกันมากสุด (ห่างกันอย่างน้อย 10 วันทำการ) พร้อม breadth และผลตอบแทน SET วันนั้น`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={p.days} margin={{ top, right: 8, left: 0, bottom: 0 }} barCategoryGap={0}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={28} stroke={BASELINE} allowDecimals={false} domain={[0, Math.max(1, p.max)]} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} isAnimationActive={false} />
          <Bar dataKey="n" fill={CONTEXT} isAnimationActive={false} />
          <Line dataKey="mean7" type="linear" stroke={BLUE} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          {placed.map((t, row) => (
            <ReferenceDot key={t.pk.date} x={t.pk.date} y={t.pk.n} r={0} fill="none" stroke="none" ifOverflow="visible" label={peakTag(t.pk, row, t.side)} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

type QuantRow = { month: string; q50: number; q90: number; q99: number; qmax: number; raw: AtlasDepth['monthly'][number] };

function maxOnTop(rows: QuantRow[]) {
  return function MaxOnTop(props: unknown) {
    const { x, y, width, index } = props as { x?: number; y?: number; width?: number; index?: number };
    if (x === undefined || y === undefined || width === undefined || index === undefined || !rows[index]?.raw.max) return null;
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill={INK} fontSize={9.5} fontFamily="ui-monospace, monospace">
        {rows[index].raw.max}
      </text>
    );
  };
}

/** การกระจายรายเดือนแบบซ้อนส่วนเพิ่ม: มัธยฐาน → p90 → p99 → สูงสุด (ความสูงรวม = ค่าสูงสุดของเดือน) */
export function DepthMonthlyChart({ p }: { p: AtlasDepth }) {
  const data: QuantRow[] = p.monthly.map((m) => ({
    month: m.month,
    q50: m.median,
    q90: Math.max(0, m.p90 - m.median),
    q99: Math.max(0, m.p99 - m.p90),
    qmax: Math.max(0, m.max - m.p99),
    raw: m,
  }));
  const parts = [
    { key: 'q50', label: 'มัธยฐาน', color: SEQUENTIAL[2] },
    { key: 'q90', label: 'ถึง p90', color: SEQUENTIAL[3] },
    { key: 'q99', label: 'ถึง p99', color: SEQUENTIAL[4] },
    { key: 'qmax', label: 'ถึงสูงสุด', color: SEQUENTIAL[5] },
  ] as const;
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<QuantRow>;
    const r = payload?.[0]?.payload?.raw;
    if (!active || !r) return null;
    return (
      <TipBox
        title={thMonthTick(r.month)}
        rows={[
          { label: 'มัธยฐาน', value: String(r.median), color: parts[0].color },
          { label: 'p90', value: String(r.p90), color: parts[1].color },
          { label: 'p99', value: String(r.p99), color: parts[2].color },
          { label: 'สูงสุด', value: String(r.max), color: parts[3].color },
        ]}
      />
    );
  };
  return (
    <ChartFrame
      title="สัญญาณพร้อมกันรายเดือน: มัธยฐาน → p90 → p99 → สูงสุด"
      height={230}
      legend={parts.map((x) => ({ label: x.label, color: x.color, shape: 'box' }))}
      label={`การกระจายของสัญญาณพร้อมกันรายเดือน ${data.length} เดือน · p99 รายเดือนสูงสุด ${Math.max(0, ...p.monthly.map((m) => m.p99))} · ค่าสูงสุด ${p.max}`}
      note="ความสูงรวมของแท่ง = วันที่พร้อมกันมากสุดของเดือน (ตัวเลขบนแท่ง) · ส่วนที่สว่างขึ้น = หางของการกระจาย"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={24} stroke={BASELINE} />
          <YAxis tick={AXIS} width={28} stroke={BASELINE} allowDecimals={false} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} isAnimationActive={false} />
          {parts.map((x) => (
            <Bar key={x.key} dataKey={x.key} stackId="q" fill={x.color} stroke={SURFACE} strokeWidth={1} isAnimationActive={false} maxBarSize={24}>
              {x.key === 'qmax' && <LabelList dataKey="qmax" content={maxOnTop(data)} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CrowdingForest({ p }: { p: AtlasDepth }) {
  const c = p.crowding;
  const sig = c.diff.lo > 0 || c.diff.hi < 0;
  const diffColor = sig ? (c.diff.mean > 0 ? POS : NEG) : INK_MUTED;
  return (
    <ForestPlot
      title="ผลต่อไม้ (%) · วันแออัดเทียบวันปกติ"
      rows={[
        { key: 'crowded', label: `วันแออัด (≥ ${c.threshold} สัญญาณ)`, sub: `${c.crowded.n} ไม้`, ci: c.crowded.ci, color: NEUTRAL },
        { key: 'sparse', label: 'วันปกติ', sub: `${c.sparse.n} ไม้`, ci: c.sparse.ci, color: NEUTRAL },
        {
          key: 'diff',
          label: 'ส่วนต่าง (แออัด − ปกติ)',
          ci: c.diff,
          color: diffColor,
          badge: <StatusBadge text={sig ? 'ต่างอย่างชัดเจน' : 'CI คร่อมศูนย์'} color={diffColor} />,
        },
      ]}
      refNote="เส้นตั้ง = 0 · CI 95% จาก bootstrap · ไม้ในวันเดียวกันเดิมพันทิศเดียวกัน ถ้าวันแออัดแย่กว่าชัดเจน = ควรจำกัดจำนวนไม้ต่อวัน"
    />
  );
}

// ─────────────────────────── D · ส่วนผสมของกำไร/ขาดทุน ───────────────────────────

type MixRow = { month: string; gain: number; loss: number; net: number | null; signals: number };

export function MixMonthlyChart({ p }: { p: AtlasMix }) {
  const data: MixRow[] = p.months.map((m) => ({
    month: m.month,
    gain: m.gain,
    loss: m.loss,
    net: m.gain || m.loss ? Math.round((m.gain + m.loss) * 100) / 100 : null,
    signals: m.signals,
  }));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<MixRow>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={`${thMonthTick(r.month)} · ${r.signals} สัญญาณ`}
        rows={[
          { label: 'กำไร', value: `${signedFmt(r.gain, 1)} จุด %`, color: POS },
          { label: 'ขาดทุน', value: `${signedFmt(r.loss, 1)} จุด %`, color: NEG },
          { label: 'สุทธิ', value: r.net === null ? '—' : `${signedFmt(r.net, 1)} จุด %`, color: INK },
        ]}
      />
    );
  };
  const legend: LegendItem[] = [
    { label: 'กำไร (ไม้ที่ปิดบวก)', color: POS, shape: 'box', value: signedFmt(p.totals.gain, 1) },
    { label: 'ขาดทุน (ไม้ที่ปิดลบ)', color: NEG, shape: 'box', value: signedFmt(p.totals.loss, 1) },
    { label: 'สุทธิรายเดือน', color: INK, value: signedFmt(p.totals.gain + p.totals.loss, 1) },
  ];
  return (
    <ChartFrame
      title="กำไร vs ขาดทุนรายเดือน (ผลรวม % ต่อไม้)"
      height={250}
      legend={legend}
      label={`กำไรรวม ${signedFmt(p.totals.gain, 1)} ขาดทุนรวม ${signedFmt(p.totals.loss, 1)} จุด % · N_eff ของกำไร ${p.nEff.gainMonths} เดือน ขาดทุน ${p.nEff.lossMonths} เดือน จาก ${p.nEff.months} เดือน`}
      note="หน่วย = ผลรวมของ % ต่อไม้ (ไม่หักค่าธรรมเนียม · ไม่ใช่ % ของพอร์ต) · เดือนที่ไม่มีไม้ปิด = ว่าง"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={24} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} tickFormatter={plainTick} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} isAnimationActive={false} />
          <Bar dataKey="gain" stackId="pl" fill={POS} isAnimationActive={false} maxBarSize={22} />
          <Bar dataKey="loss" stackId="pl" fill={NEG} isAnimationActive={false} maxBarSize={22} />
          <Line dataKey="net" type="linear" stroke={INK} strokeWidth={1} dot={{ r: 2.5, fill: INK, stroke: SURFACE, strokeWidth: 1 }} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** กำไร/ขาดทุนกระจุกแค่ไหน: แถบสัดส่วน + ขีด "ถ้ากระจายเท่ากัน" + N_eff */
export function ConcentrationBars({ p, h }: { p: AtlasMix; h: AtlasHeader }) {
  const stopTrades = h.nClosed ? (h.nStops / h.nClosed) * 100 : 0;
  const rows: Array<{ key: string; label: string; value: number; color: string; ref?: number }> = [
    { key: 'stop-n', label: 'ไม้ที่จบด้วย stop — สัดส่วนของจำนวนไม้', value: stopTrades, color: CONTEXT },
    { key: 'stop-loss', label: 'ไม้ที่จบด้วย stop — สัดส่วนของขาดทุนรวม', value: p.totals.stopShareOfLoss, color: NEG, ref: stopTrades },
    { key: 'worst', label: `ไม้ 10% ที่แย่สุด (${p.tail.worstN} ไม้) — สัดส่วนของขาดทุนรวม`, value: p.tail.worstShare, color: NEG, ref: 10 },
    { key: 'best', label: `ไม้ 10% ที่ดีสุด (${p.tail.worstN} ไม้) — สัดส่วนของกำไรรวม`, value: p.tail.bestShare, color: POS, ref: 10 },
  ];
  const activeMonths = p.months.filter((m) => m.gain !== 0 || m.loss !== 0).length;
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-2', captionCls)}>กำไร/ขาดทุนกระจุกแค่ไหน</figcaption>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="text-[11px]">
            <p className="flex justify-between gap-2 text-zinc-300">
              <span>{r.label}</span>
              <span className="font-mono text-zinc-50">{r.value.toFixed(0)}%</span>
            </p>
            <span className="relative mt-0.5 block h-2.5 rounded-sm bg-zinc-800" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.min(100, r.value)}%`, background: r.color }} />
              {r.ref !== undefined && <span className="absolute -inset-y-1 w-0.5 bg-zinc-100" style={{ left: `${Math.min(100, r.ref)}%` }} />}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-zinc-400">ขีดขาว = สัดส่วนที่ควรเป็นถ้ากระจายเท่ากัน</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-zinc-800 p-2">
          <dt className="text-zinc-400">N_eff ของกำไร</dt>
          <dd className="font-mono text-base text-zinc-50">
            {p.nEff.gainMonths.toFixed(1)} <span className="text-[11px] text-zinc-400">เดือน</span>
          </dd>
        </div>
        <div className="rounded-lg border border-zinc-800 p-2">
          <dt className="text-zinc-400">N_eff ของขาดทุน</dt>
          <dd className="font-mono text-base text-zinc-50">
            {p.nEff.lossMonths.toFixed(1)} <span className="text-[11px] text-zinc-400">เดือน</span>
          </dd>
        </div>
      </dl>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
        จาก {activeMonths} เดือนที่มีไม้ปิด ({p.nEff.months} เดือนในช่วง) · N_eff = (Σx)²/Σx² = จำนวนเดือนที่ “มีผลจริง” — ต่ำ = ผลทั้งช่วงมาจากไม่กี่เดือน
      </p>
    </figure>
  );
}

/** % ในส่วนของแท่งซ้อนที่สูงพอ */
function segmentPct(color: string, min = 14) {
  return function SegmentPct(props: unknown) {
    const { x, y, width, height, value } = props as { x?: number; y?: number; width?: number; height?: number; value?: number };
    if (x === undefined || y === undefined || width === undefined || height === undefined || value === undefined) return null;
    if (value < min || height < 12 || width < 14) return null;
    return (
      <text x={x + width / 2} y={y + height / 2 + 3.5} textAnchor="middle" fill={inkOn(color)} fontSize={9.5} fontFamily="ui-monospace, monospace">
        {Math.round(value)}
      </text>
    );
  };
}

export function SectorMixChart({ p }: { p: AtlasMix }) {
  const rows = p.months.filter((m) => m.sectorShare.some((v) => v > 0));
  const data = rows.map((m) => ({ month: m.month, abs: m.gain - m.loss, raw: m, ...Object.fromEntries(m.sectorShare.map((v, k) => [`s${k}`, v])) }));
  const totalAbs = data.reduce((a, r) => a + r.abs, 0) || 1;
  const overall = p.sectors.map((_, k) => rows.reduce((a, m) => a + m.sectorShare[k] * (m.gain - m.loss), 0) / totalAbs);
  const legend: LegendItem[] = p.sectors.map((s, k) => ({ label: s.label, color: slot(k), shape: 'box', value: `${overall[k].toFixed(0)}%` }));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<(typeof data)[number]>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={`${thMonthTick(r.month)} · |P&L| ${r.abs.toFixed(1)} จุด %`}
        rows={p.sectors.map((s, k) => ({ label: s.label, color: slot(k), value: `${r.raw.sectorShare[k].toFixed(1)}%` }))}
      />
    );
  };
  return (
    <ChartFrame
      title="P&L มาจากหมวดไหน: สัดส่วนของ |กำไร/ขาดทุน| รายเดือน"
      height={240}
      legend={legend}
      label={`สัดส่วน |P&L| ตามหมวดทั้งช่วง: ${p.sectors.map((s, k) => `${s.label} ${overall[k].toFixed(0)}%`).join(', ')}`}
      note={`แสดงเฉพาะ ${rows.length} เดือนที่มีไม้ปิด · ตัวเลขใน legend = สัดส่วนทั้งช่วง (ถ่วงตามขนาด P&L ของเดือน) · ในแท่ง = % ของเดือนนั้น`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="14%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} interval={data.length > 16 ? 1 : 0} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} isAnimationActive={false} />
          {p.sectors.map((s, k) => (
            <Bar key={s.key} dataKey={`s${k}`} name={s.label} stackId="s" fill={slot(k)} stroke={SURFACE} strokeWidth={1} isAnimationActive={false} maxBarSize={30}>
              <LabelList dataKey={`s${k}`} content={segmentPct(slot(k))} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ─────────────────────────── E · เริ่มอย่างไร จบอย่างไร ───────────────────────────

/** ผลลัพธ์ที่มีลำดับ (ดี → แย่) ใช้ diverging: ถึงเป้า/หมดเวลาบวก = น้ำเงิน · หมดเวลาลบ/stop = แดง · ยังเปิด = เทา */
export const END_COLOR: Record<EndKey, string> = {
  target: DIV_POS[3],
  timeUp: DIV_POS[1],
  timeDown: DIV_NEG[1],
  stop: DIV_NEG[3],
  open: CONTEXT,
};

export function EndMixBar({ p }: { p: AtlasLifecycle }) {
  const total = p.ends.reduce((a, e) => a + e.n, 0);
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-1', captionCls)}>ไม้จบอย่างไร · {total} สัญญาณ</figcaption>
      <Legend items={p.ends.map((e) => ({ label: e.label, color: END_COLOR[e.key], shape: 'box', value: `${e.n} · ${e.share}%` }))} />
      <div role="img" aria-label={`ไม้ ${total} ไม้: ${p.ends.map((e) => `${e.label} ${e.n} (${e.share}%)`).join(', ')}`} className="mt-1 flex h-8 w-full gap-[2px] overflow-hidden rounded-md">
        {p.ends
          .filter((e) => e.n > 0)
          .map((e) => (
            <span
              key={e.key}
              className="flex min-w-0 items-center justify-center font-mono text-[10.5px]"
              style={{ flexGrow: e.n, flexBasis: 0, background: END_COLOR[e.key], color: inkOn(END_COLOR[e.key]) }}
            >
              {e.share >= 7 ? `${Math.round(e.share)}%` : ''}
            </span>
          ))}
      </div>
    </figure>
  );
}

type EndRow = { month: string; target: number; timeUp: number; timeDown: number; stop: number; raw: Record<EndKey, number> };

/** จบดีอยู่เหนือเส้นศูนย์ · จบไม่ดีอยู่ใต้เส้น (ความยาว = จำนวนไม้) */
export function MonthlyEndChart({ p }: { p: AtlasLifecycle }) {
  const data: EndRow[] = p.monthlyEnd.map((m) => ({
    month: m.month,
    timeUp: m.counts.timeUp,
    target: m.counts.target,
    timeDown: -m.counts.timeDown,
    stop: -m.counts.stop,
    raw: m.counts,
  }));
  const open = p.ends.find((e) => e.key === 'open')?.n ?? 0;
  const keys: EndKey[] = ['timeUp', 'target', 'timeDown', 'stop'];
  const label = (k: EndKey) => p.ends.find((e) => e.key === k)?.label ?? k;
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<EndRow>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return <TipBox title={thMonthTick(r.month)} rows={(['target', 'timeUp', 'timeDown', 'stop', 'open'] as EndKey[]).map((k) => ({ label: label(k), color: END_COLOR[k], value: String(r.raw[k]) }))} />;
  };
  return (
    <ChartFrame
      title="ไม้จบอย่างไร รายเดือน (ตามเดือนที่เข้า)"
      height={240}
      legend={(['target', 'timeUp', 'timeDown', 'stop'] as EndKey[]).map((k) => ({ label: label(k), color: END_COLOR[k], shape: 'box' }))}
      label={`ไม้จบอย่างไรรายเดือน: ${p.ends.map((e) => `${e.label} ${e.n}`).join(', ')}`}
      note={`เหนือเส้น = จบดี (ถึงเป้า/หมดเวลาบวก) · ใต้เส้น = จบไม่ดี · ความยาว = จำนวนไม้${open ? ` · ยังเปิดอยู่ ${open} ไม้ไม่แสดง` : ''}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} stackOffset="sign" margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={24} stroke={BASELINE} />
          <YAxis tick={AXIS} width={28} stroke={BASELINE} allowDecimals={false} tickFormatter={(v: number) => String(Math.abs(v))} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} isAnimationActive={false} />
          {keys.map((k) => (
            <Bar key={k} dataKey={k} stackId="e" fill={END_COLOR[k]} stroke={SURFACE} strokeWidth={0.5} isAnimationActive={false} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function MonthlyStartChart({ p }: { p: AtlasLifecycle }) {
  const data = p.monthlyStart.map((m) => ({ month: m.month, ...m.counts }));
  const totals = p.starts.map((s) => p.monthlyStart.reduce((a, m) => a + (m.counts[s.key] ?? 0), 0));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<(typeof data)[number]>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    const counts = r as unknown as Record<string, number>;
    return <TipBox title={thMonthTick(r.month)} rows={p.starts.map((s, i) => ({ label: s.label, color: slot(i), value: String(counts[s.key] ?? 0) }))} />;
  };
  return (
    <ChartFrame
      title="ไม้เริ่มในสภาวะแบบไหน รายเดือน (กลุ่มวันจากมุม A)"
      height={240}
      legend={p.starts.map((s, i) => ({ label: s.label, color: slot(i), shape: 'box', value: String(totals[i]) }))}
      label={`จำนวนไม้ตามสภาวะตอนเข้า: ${p.starts.map((s, i) => `${s.label} ${totals[i]}`).join(', ')}`}
      note="สีเดียวกับกลุ่มวันบนแผนที่ในมุม A · ตัวเลขใน legend = จำนวนไม้ทั้งช่วง"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={24} stroke={BASELINE} />
          <YAxis tick={AXIS} width={28} stroke={BASELINE} allowDecimals={false} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} isAnimationActive={false} />
          {p.starts.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="s" fill={slot(i)} stroke={SURFACE} strokeWidth={0.5} isAnimationActive={false} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

const rStats = (r: { n: number; winRate: number; stopRate: number }) => `${r.n} ไม้ · ชนะ ${r.winRate}% · stop ${r.stopRate}%`;

export function StartForest({ p }: { p: AtlasLifecycle }) {
  const idx = new Map(p.starts.map((s, i) => [s.key, i]));
  return (
    <ForestPlot
      title="ผลต่อไม้ (R) ตามสภาวะตลาดตอนเข้า"
      rows={p.table.map((r) => ({
        key: r.key,
        label: r.label,
        sub: rStats(r),
        ci: r.meanR,
        color: slot(idx.get(r.key) ?? 0),
        badge: r.n < 10 ? <StatusBadge text="ตัวอย่างน้อย" color={CONTEXT} /> : undefined,
        value: `${ciText(r.meanR)}R`,
      }))}
      refNote="เส้นตั้ง = 0R (เท่าทุน) · 1R = ระยะจากราคาเข้าถึง stop · CI 95% จาก bootstrap"
    />
  );
}

export function KindForest({ p }: { p: AtlasLifecycle }) {
  return (
    <ForestPlot
      title="ผลต่อไม้ (R) ตามชนิดสัญญาณ"
      rows={p.byKind.map((r) => ({
        key: r.key,
        label: r.label,
        sub: rStats(r),
        ci: r.meanR,
        color: NEUTRAL,
        badge: r.n < 10 ? <StatusBadge text="ตัวอย่างน้อย" color={CONTEXT} /> : undefined,
        value: `${ciText(r.meanR)}R`,
      }))}
      refNote="เส้นตั้ง = 0R · ชนิดที่มีไม้น้อยกว่า 10 ไม้มีช่วงกว้าง อย่าเพิ่งสรุป"
    />
  );
}

export function ExitLeverForest({ p }: { p: AtlasLifecycle }) {
  return (
    <ForestPlot
      title="กติกาออกทางเลือก — ผลต่อไม้เทียบกติกาปัจจุบัน (จุด %) · สัญญาณชุดเดียวกัน"
      rows={p.exitLevers.map((l) => ({
        key: l.key,
        label: l.label,
        badge: <VerdictBadge v={l.verdict} />,
        sub: `${l.n} ไม้ · ชนะ ${l.winRate}% · stop ${l.stopRate}% · ถือ ${l.days} วัน · ต่อวันที่ถือ ${signedFmt(l.perDay, 3)}%`,
        ci: l.diff,
        color: VERDICT[l.verdict].color,
        hollow: l.verdict === 'baseline',
        value: l.verdict === 'baseline' ? `ฐาน ${signedFmt(l.meanRet)}%/ไม้` : l.verdict === 'same' ? 'เท่าเดิมทุกไม้' : `${ciText(l.diff)} · q ${l.q.toFixed(3)}`,
      }))}
      refNote="เส้นตั้ง = 0 (เท่ากติกาปัจจุบัน) · จับคู่ไม้ต่อไม้ + block bootstrap · q = ปรับหลายการทดสอบ (BH) · ผลในตัวอย่าง — ถือนานขึ้นใช้ทุนนานขึ้น ให้ดูผลต่อวันที่ถือประกอบ"
    />
  );
}

// ─────────────────────────── F · ทดสอบความฉลาดแบบ walk-forward ───────────────────────────

export function AucForest({ p }: { p: AtlasIntel }) {
  return (
    <ForestPlot
      title="AUC นอกตัวอย่าง: แยกวันขึ้น/ลงของวันถัดไปได้ดีกว่าโยนเหรียญไหม"
      reference={0.5}
      fmt={(v) => v.toFixed(3)}
      tickFmt={(v) => v.toFixed(2)}
      rows={p.auc.map((a) => {
        const ciOut = a.lo > 0.5 || a.hi < 0.5;
        const sig = ciOut && a.p < 0.05;
        const partial = !sig && (ciOut || a.p < 0.05);
        const color = sig ? (a.auc > 0.5 ? POS : NEG) : partial ? NEUTRAL : CONTEXT;
        const status = sig ? (a.auc > 0.5 ? 'เหนือโอกาส' : 'ต่ำกว่าโอกาส') : partial ? 'ก้ำกึ่ง' : 'ไม่ต่างจากโอกาส';
        return {
          key: a.key,
          label: a.label,
          ci: { mean: a.auc, lo: a.lo, hi: a.hi },
          color,
          badge: <StatusBadge text={status} color={color} />,
          value: `${a.auc.toFixed(3)} [${a.lo.toFixed(3)}, ${a.hi.toFixed(3)}] · p ${pFmt(a.p)}`,
        };
      })}
      refNote={`เส้นตั้ง = 0.5 (โยนเหรียญ) · ${p.auc[0]?.n ?? 0} หุ้น-วัน · “เหนือโอกาส” ต้องผ่านทั้ง CI ไม่ครอบ 0.5 และ p < 0.05 (เลื่อนผลเป็นวงกลม) · ก้ำกึ่ง = ผ่านเพียงเกณฑ์เดียว`}
    />
  );
}

export function LeverForest({ p }: { p: AtlasIntel }) {
  const w = p.window;
  return (
    <ForestPlot
      title="ปรับคันโยกบนข้อมูลนอกตัวอย่างชุดเดียวกัน — ผลตอบแทนรายวันของพอร์ตเทียบกติกาปัจจุบัน (bp/วัน)"
      rows={p.levers.map((l) => ({
        key: l.key,
        label: l.label,
        badge: <VerdictBadge v={l.verdict} />,
        sub: l.nSignals === 0 ? 'ไม่มีสัญญาณเลย = ถือเงินสดทุกวัน' : `${l.nSignals} สัญญาณ · ขึ้นวันถัดไป ${l.hitRate}% · เฉลี่ย ${signedFmt(l.meanDaily)} bp/วัน`,
        ci: l.diff,
        color: VERDICT[l.verdict].color,
        hollow: l.verdict === 'baseline',
        value: l.verdict === 'baseline' ? `ฐาน ${signedFmt(l.meanDaily)} bp/วัน` : l.verdict === 'same' ? 'เท่าเดิมทุกวัน' : `${ciText(l.diff)} · q ${l.q.toFixed(3)}`,
      }))}
      refNote={`เส้นตั้ง = 0 · ถือเท่ากันต่อไม้ 1 วัน วันไม่มีสัญญาณ = เงินสด · CI จาก block bootstrap ${w.block} วัน × ${w.boot} รอบ (จับคู่รายวัน) · q = ปรับหลายคันโยก (BH) · ผ่านเกณฑ์ = q < 0.1 และ CI ไม่คร่อม 0`}
    />
  );
}

/** ความแม่นของความน่าจะเป็น: วงโปร่ง = P(up) ที่ทำนายเฉลี่ยในช่วง · จุดทึบ = สัดส่วนที่ขึ้นจริง */
export function CalibrationChart({ p }: { p: AtlasIntel }) {
  const rows = p.calibration;
  const vals = rows.flatMap((r) => [r.predicted, r.actual]);
  const lo = Math.floor(Math.min(50, ...vals) / 5) * 5;
  const hi = Math.max(lo + 5, Math.ceil(Math.max(50, ...vals) / 5) * 5);
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks = niceTicks(lo, hi, 4).filter((t) => t >= lo && t <= hi);
  const worst = [...rows].sort((a, b) => Math.abs(b.actual - b.predicted) - Math.abs(a.actual - a.predicted))[0];
  // คอลัมน์ตัวเลขกว้างคงที่ → แผนภาพทุกแถวและแกนกว้างเท่ากัน (ตำแหน่ง 50% ตรงกันทุกแถว)
  const grid = 'grid items-center gap-x-3 gap-y-0.5 @min-[520px]:grid-cols-[5.5rem_minmax(0,1fr)_12rem]';
  return (
    <figure className={cn('@container', figureCls)}>
      <figcaption className={cn('mb-1', captionCls)}>ความแม่นของความน่าจะเป็น: P(up) ที่ทำนาย เทียบสัดส่วนที่ขึ้นจริง</figcaption>
      <Legend
        items={[
          { label: 'ทำนาย (เฉลี่ยในช่วง)', color: INK, shape: 'ring' },
          { label: 'ขึ้นจริง', color: BLUE, shape: 'dot' },
        ]}
      />
      <ul className="mt-1 space-y-2 text-[11px]">
        {rows.map((r) => (
          <li key={r.bucket} className={grid}>
            <span className="font-mono text-zinc-200">
              {r.bucket} <span className="text-[10px] text-zinc-400">n {r.n}</span>
            </span>
            <span className="relative h-5" aria-hidden>
              <span className="absolute inset-y-0 w-px bg-zinc-600" style={{ left: `${x(50)}%` }} />
              <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-zinc-500" style={{ left: `${Math.min(x(r.predicted), x(r.actual))}%`, width: `${Math.abs(x(r.actual) - x(r.predicted))}%` }} />
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(r.predicted)}%`, boxShadow: `inset 0 0 0 2px ${INK}`, background: SURFACE }} />
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(r.actual)}%`, background: BLUE, boxShadow: `0 0 0 2px ${SURFACE}` }} />
            </span>
            <span className="whitespace-nowrap font-mono text-zinc-100 @min-[520px]:text-right">
              ทำนาย {r.predicted.toFixed(1)}% · จริง {r.actual.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
      <div className={cn(grid, 'mt-1')} aria-hidden>
        <span className="hidden @min-[520px]:block" />
        <div className="relative h-4 border-t border-zinc-700">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0.5 -translate-x-1/2 font-mono text-[10px] text-zinc-400" style={{ left: `${x(t)}%` }}>
              {t}%
            </span>
          ))}
        </div>
        <span className="hidden @min-[520px]:block" />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-zinc-400">
        เส้นตั้ง = 50% · สองจุดยิ่งห่าง = ความน่าจะเป็นยิ่งคลาดเคลื่อน
        {worst ? ` · คลาดมากสุดช่วง ${worst.bucket}: ทำนาย ${worst.predicted.toFixed(1)}% แต่ขึ้นจริง ${worst.actual.toFixed(1)}% (n ${worst.n})` : ''}
      </p>
    </figure>
  );
}
