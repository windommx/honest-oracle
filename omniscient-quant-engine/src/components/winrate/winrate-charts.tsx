'use client';

/**
 * กราฟของหน้า "เป้าหมายชนะ 80%" — ทุกกราฟเทียบ "สัญญาณ" กับ "การสุ่มเข้าด้วยกติกาออกเดียวกัน" เสมอ
 * สี: สัญญาณ = น้ำเงิน (ช่อง 1) · การสุ่ม = เทา (บริบท) · เป้า 80% = เส้นประสีหมึก · ผ่าน/ไม่ผ่านมีป้ายข้อความกำกับเสมอ
 */

import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ForestPlot, pFmt, signedFmt, StatusBadge } from '@/components/atlas/atlas-charts';
import { AXIS, BASELINE, CATEGORICAL, ChartFrame, DIV_NEG, DIV_POS, GRID, HaloText, niceTicks, SEQUENTIAL, SURFACE, TipBox, type LegendItem, type TipProps, type ViewBox } from '@/components/charts/chart-kit';
import { thDate } from '@/lib/flows/format';
import { cn } from '@/lib/utils';
import { sampleSize } from '@/lib/winrate/stats';
import type { WinCell, WinCurvePoint, WinFilter, WinrateResponse, WinRow, WinStats } from '@/lib/winrate/types';

const SIGNAL = CATEGORICAL[0];
const RANDOM = '#a1a1aa';
const CONTEXT = '#71717a';
const INK = '#f4f4f5';
const POS = DIV_POS[3];
const NEG = DIV_NEG[3];
const figureCls = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-3';
const captionCls = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-300';
const pct = (v: number | null, d = 1) => (v === null ? '—' : `${v.toFixed(d)}%`);
const qFmt = (q: number | null) => (q === null ? '—' : pFmt(q));
/** "p = 0.034" · "p < 0.001" (ไม่เขียน "p = < 0.001") */
export const pEq = (p: number | null) => (p === null ? 'p = —' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);

/** แกนที่ครอบข้อมูลทั้งหมดด้วย tick ก้าว 1/2/5 × 10^k (ปลายทั้งสองข้างเป็น tick เสมอ — niceTicks ให้เฉพาะ tick ภายในช่วง) */
function niceAxis(lo: number, hi: number, target = 4): number[] {
  if (!(hi - lo > 1e-9)) return [lo - 1, lo, lo + 1];
  const raw = (hi - lo) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 1e6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const FILTER_SHORT: Record<WinFilter, string> = { all: 'ทุกสัญญาณ', pullback: 'pullback', uncrowded: 'ไม่แออัด', quality: 'P(ขึ้น) สูง' };
export const cellLabel = (c: { targetR: number; stopMult: number; holdDays: number; filter: WinFilter }) =>
  `${c.targetR}R · stop ${c.stopMult}× · ${c.holdDays} วัน · ${FILTER_SHORT[c.filter]}`;

/** ป้ายเส้นเป้า 80% ที่ขอบขวาของกราฟ */
function targetTag(text: string) {
  return function TargetTag(props: unknown) {
    const vb = (props as { viewBox?: ViewBox }).viewBox;
    if (!vb || vb.x === undefined || vb.y === undefined) return <g />;
    return (
      <HaloText x={vb.x + (vb.width ?? 0) - 4} y={vb.y - 4} anchor="end" fill={INK} size={10} weight={600}>
        {text}
      </HaloText>
    );
  };
}

// ─────────────────────────── A · กับดักรูปทรง ───────────────────────────

type CurveRow = WinCurvePoint & { label: string };

export function TrapCharts({ points, stopMult, holdDays, target }: { points: WinCurvePoint[]; stopMult: number; holdDays: number; target: number }) {
  const data: CurveRow[] = points.map((p) => ({ ...p, label: `${p.targetR}R` }));
  const first = data[0];
  const last = data[data.length - 1];
  const winTip = (props: unknown) => {
    const { active, payload } = props as TipProps<CurveRow>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={`เป้า ${r.targetR}R · stop ${stopMult}× · ถือ ${holdDays} วัน`}
        rows={[
          { label: 'สัญญาณชนะ', value: pct(r.signalWin), color: SIGNAL },
          { label: 'สุ่มเข้าชนะ', value: pct(r.randomWin), color: RANDOM },
          { label: 'ไม้ปิด (สัญญาณ)', value: String(r.closed) },
        ]}
      />
    );
  };
  const expTip = (props: unknown) => {
    const { active, payload } = props as TipProps<CurveRow>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={`เป้า ${r.targetR}R · stop ${stopMult}× · ถือ ${holdDays} วัน`}
        rows={[
          { label: 'สัญญาณ', value: r.signalExp === null ? '—' : `${signedFmt(r.signalExp)}%/ไม้`, color: SIGNAL },
          { label: 'สุ่มเข้า', value: r.randomExp === null ? '—' : `${signedFmt(r.randomExp)}%/ไม้`, color: RANDOM },
        ]}
      />
    );
  };
  const legend: LegendItem[] = [
    { label: 'สัญญาณของระบบ', color: SIGNAL },
    { label: 'สุ่มเข้า (หุ้น/ช่วงเวลา/กติกาออกเดียวกัน)', color: RANDOM, dashed: true },
  ];
  const exps = data.flatMap((r) => [r.signalExp, r.randomExp]).filter((v): v is number => v !== null);
  const eTicks = niceAxis(Math.min(0, ...exps), Math.max(0, ...exps));
  return (
    <div className="grid gap-3 @min-[1000px]:grid-cols-2">
      <ChartFrame
        title="อัตราชนะสุทธิตามระยะเป้า"
        height={250}
        legend={legend}
        label={`อัตราชนะตามระยะเป้า (stop ${stopMult}× ถือ ${holdDays} วัน): เป้า ${first?.targetR}R สัญญาณชนะ ${pct(first?.signalWin ?? null)} สุ่มชนะ ${pct(first?.randomWin ?? null)} · เป้า ${last?.targetR}R สัญญาณ ${pct(last?.signalWin ?? null)} สุ่ม ${pct(last?.randomWin ?? null)}`}
        note={`เป้ายิ่งใกล้ ยิ่งชนะบ่อย — ทั้งสัญญาณและการสุ่ม · ส่วนที่สัญญาณชนะ "เหนือ" เส้นประเท่านั้นที่เป็นฝีมือ · เส้นประสีขาว = เป้า ${target}%`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 14, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} stroke={BASELINE} />
            <YAxis tick={AXIS} width={36} stroke={BASELINE} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v: number) => `${v}%`} />
            <ReferenceLine y={target} stroke={INK} strokeDasharray="5 3" label={targetTag(`เป้า ${target}%`)} />
            <Tooltip content={winTip} isAnimationActive={false} />
            <Line dataKey="randomWin" type="linear" stroke={RANDOM} strokeWidth={1.75} strokeDasharray="5 3" dot={{ r: 2.5, fill: RANDOM, stroke: SURFACE }} isAnimationActive={false} connectNulls />
            <Line dataKey="signalWin" type="linear" stroke={SIGNAL} strokeWidth={2} dot={{ r: 3, fill: SIGNAL, stroke: SURFACE }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      <ChartFrame
        title="ผลสุทธิเฉลี่ยต่อไม้ (% หลังค่าธรรมเนียม) ตามระยะเป้า"
        height={250}
        legend={legend}
        label={`ผลสุทธิเฉลี่ยต่อไม้ตามระยะเป้า (stop ${stopMult}× ถือ ${holdDays} วัน): เป้า ${first?.targetR}R สัญญาณ ${first?.signalExp ?? '—'}% สุ่ม ${first?.randomExp ?? '—'}% · เป้า ${last?.targetR}R สัญญาณ ${last?.signalExp ?? '—'}% สุ่ม ${last?.randomExp ?? '—'}%`}
        note="ชนะบ่อยไม่ได้แปลว่ากำไร: เป้าใกล้ = กำไรต่อไม้เล็ก ไม้ที่แพ้ครั้งเดียวกินกำไรหลายไม้ · เหนือเส้น 0 = กำไรสุทธิ"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 14, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} stroke={BASELINE} />
            <YAxis tick={AXIS} width={44} stroke={BASELINE} domain={[eTicks[0], eTicks[eTicks.length - 1]]} ticks={eTicks} tickFormatter={(v: number) => `${v < 0 ? '−' : ''}${Math.abs(v)}%`} />
            <ReferenceLine y={0} stroke={BASELINE} />
            <Tooltip content={expTip} isAnimationActive={false} />
            <Line dataKey="randomExp" type="linear" stroke={RANDOM} strokeWidth={1.75} strokeDasharray="5 3" dot={{ r: 2.5, fill: RANDOM, stroke: SURFACE }} isAnimationActive={false} connectNulls />
            <Line dataKey="signalExp" type="linear" stroke={SIGNAL} strokeWidth={2} dot={{ r: 3, fill: SIGNAL, stroke: SURFACE }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

export function TrapCallout({ trap }: { trap: NonNullable<WinrateResponse['trap']> }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-50">
      <p className="font-semibold">ตัวอย่างกับดัก: {trap.config}</p>
      <p className="mt-1">
        ชนะ <strong className="font-mono">{trap.win.toFixed(1)}%</strong> — ถ้าทดสอบเทียบโยนเหรียญ 50% จะได้ <span className="font-mono">{pEq(trap.pVs50)}</span> ดู “มีนัยมาก”
        แต่การสุ่มเข้าด้วยกติกาออกเดียวกันก็ชนะ <strong className="font-mono">{pct(trap.baseline)}</strong> · ชนะเหนือการสุ่ม{' '}
        <span className="font-mono">{pEq(trap.pExcess)}</span> (ทดสอบแบบเดียว ยังไม่นับว่าลองไปหลายแบบ) · ผลสุทธิ{' '}
        <span className="font-mono">{trap.expectancy === null ? '—' : `${signedFmt(trap.expectancy)}%/ไม้`}</span>
      </p>
      <p className="mt-1 text-amber-100/90">บทเรียน: ฐานเทียบที่ถูกต้องของ “ชนะ 80%” ไม่ใช่ 50% แต่คือการสุ่มเข้าที่ใช้กติกาออกแบบเดียวกัน</p>
    </div>
  );
}

// ─────────────────────────── B · ทุก config บนแผนภาพกระจาย ───────────────────────────

type ScatterPoint = WinCell & { x: number; y: number };

function scatterDot(fill: string, ring: boolean) {
  return function Dot(props: unknown) {
    const { cx = 0, cy = 0 } = props as { cx?: number; cy?: number };
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="transparent" />
        <circle cx={cx} cy={cy} r={ring ? 4.5 : 3.2} fill={fill} stroke={ring ? INK : SURFACE} strokeWidth={ring ? 1.5 : 0.75} />
      </g>
    );
  };
}

export function ConfigScatter({ cells, target, fdr }: { cells: WinCell[]; target: number; fdr: number }) {
  const pts: ScatterPoint[] = cells.filter((c) => c.win !== null && c.base !== null && c.q !== null).map((c) => ({ ...c, x: c.base!, y: c.win! }));
  const reach = pts.filter((p) => p.y >= target);
  const below = pts.filter((p) => p.y < target);
  const sig = pts.filter((p) => p.q! < fdr);
  const vals = pts.flatMap((p) => [p.x, p.y]);
  const lo = Math.max(0, Math.floor((Math.min(target - 10, ...vals) - 2) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...vals, target) + 2) / 10) * 10);
  const above = pts.filter((p) => p.y > p.x).length;
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<ScatterPoint>;
    const c = payload?.[0]?.payload;
    if (!active || !c || c.key === undefined) return null;
    return (
      <TipBox
        title={cellLabel(c)}
        rows={[
          { label: 'สัญญาณชนะ', value: pct(c.win), color: SIGNAL },
          { label: 'สุ่มเข้าชนะ', value: pct(c.base), color: RANDOM },
          { label: 'เหนือการสุ่ม', value: c.excess === null ? '—' : `${signedFmt(c.excess, 1)} จุด` },
          { label: 'p / q', value: `${qFmt(c.p)} / ${qFmt(c.q)}` },
          { label: 'ผลสุทธิ/ไม้', value: c.exp === null ? '—' : `${signedFmt(c.exp)}%` },
          { label: 'ไม้ปิด', value: String(c.n) },
        ]}
      />
    );
  };
  const legend: LegendItem[] = [
    { label: `ชนะ ≥ ${target}% (${reach.length})`, color: SIGNAL, shape: 'dot' },
    { label: `ต่ำกว่าเป้า (${below.length})`, color: CONTEXT, shape: 'dot' },
    { label: `เหนือการสุ่มอย่างมีนัย q < ${fdr} (${sig.length})`, color: INK, shape: 'ring' },
  ];
  return (
    <ChartFrame
      title={`ทุก config ในช่วงค้นหา: อัตราชนะของสัญญาณเทียบการสุ่ม (${pts.length} แบบ)`}
      height={340}
      legend={legend}
      label={`แผนภาพกระจาย ${pts.length} config: ${reach.length} แบบชนะถึง ${target}% · ${above} แบบอยู่เหนือเส้นเท่าการสุ่ม · ${sig.length} แบบเหนือการสุ่มอย่างมีนัยหลังปรับการทดสอบหลายแบบ`}
      note={`แต่ละจุด = 1 config · แกนนอน = การสุ่มเข้าชนะกี่ % · แกนตั้ง = สัญญาณชนะกี่ % · เส้นทแยง = เท่าการสุ่ม (ไม่มีฝีมือ) · เส้นประ = เป้า ${target}% — จุดที่ถึงเป้ามักอยู่ขวามือ คือการสุ่มก็ชนะสูงอยู่แล้ว`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 14, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name="สุ่มชนะ" tick={AXIS} stroke={BASELINE} domain={[lo, hi]} ticks={niceTicks(lo, hi, 6)} tickFormatter={(v: number) => `${v}%`} />
          <YAxis type="number" dataKey="y" name="สัญญาณชนะ" tick={AXIS} width={36} stroke={BASELINE} domain={[lo, hi]} ticks={niceTicks(lo, hi, 6)} tickFormatter={(v: number) => `${v}%`} />
          <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={BASELINE} strokeWidth={1.25} ifOverflow="hidden" />
          <ReferenceLine y={target} stroke={INK} strokeDasharray="5 3" label={targetTag(`เป้า ${target}%`)} />
          <Tooltip content={tip} cursor={false} isAnimationActive={false} />
          <Scatter data={below} isAnimationActive={false} shape={scatterDot('rgba(113,113,122,0.7)', false)} />
          <Scatter data={reach.filter((p) => p.q! >= fdr)} isAnimationActive={false} shape={scatterDot(SIGNAL, false)} />
          <Scatter data={sig} isAnimationActive={false} shape={scatterDot(SIGNAL, true)} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ─────────────────────────── C · กรวยการคัด + ตารางผู้ถึงเป้า ───────────────────────────

export function Funnel({ f, target, fdr }: { f: WinrateResponse['funnel']; target: number; fdr: number }) {
  const rows: Array<{ label: string; n: number }> = [
    { label: 'ทุก config ในกริด', n: f.configs },
    { label: 'ไม้ปิดพอจึงทดสอบได้', n: f.tested },
    { label: `ชนะ ≥ ${target}% ในช่วงค้นหา`, n: f.reach },
    { label: '+ ผลสุทธิหลังค่าธรรมเนียม > 0', n: f.positive },
    { label: `+ เหนือการสุ่ม q < ${fdr} (นับทุกแบบที่ลอง)`, n: f.candidates },
    { label: '+ ผ่านช่วงทดสอบครั้งเดียว', n: f.holdoutPass ? 1 : 0 },
  ];
  const max = Math.max(1, f.configs);
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-2', captionCls)}>กรวยการคัด: เหลือกี่แบบในแต่ละเงื่อนไข</figcaption>
      <ol className="space-y-1.5 text-[11px]">
        {rows.map((r, i) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_3rem] items-center gap-2">
            <span className="text-zinc-200">{r.label}</span>
            <span className="relative h-3 rounded-sm bg-zinc-800" aria-hidden>
              <span
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${r.n ? Math.max(1.5, (100 * r.n) / max) : 0}%`, background: SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, 5 - i)] }}
              />
            </span>
            <span className={cn('text-right font-mono', r.n ? 'text-zinc-50' : 'text-rose-300')}>{r.n}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] leading-snug text-zinc-400">
        config ที่เหนือการสุ่มอย่างมีนัยโดยไม่สนอัตราชนะ: {f.significant} แบบ · ทุกขั้นใช้ข้อมูลช่วงค้นหาเท่านั้น ยกเว้นขั้นสุดท้าย
      </p>
    </figure>
  );
}

function reachStatus(r: WinRow, fdr: number): { text: string; color: string } {
  if ((r.discovery.expectancy?.mean ?? -1) <= 0) return { text: 'ขาดทุนสุทธิ', color: NEG };
  if (r.q !== null && r.q < fdr) return { text: 'ผ่านเกณฑ์', color: POS };
  return { text: 'โชคยังอธิบายได้', color: CONTEXT };
}

export function ReachTable({ rows, target, fdr }: { rows: WinRow[]; target: number; fdr: number }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-300">ไม่มี config ไหนชนะถึง {target}% ในช่วงค้นหา</p>;
  }
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-2', captionCls)}>config ที่ชนะ ≥ {target}% ในช่วงค้นหา ({rows.length} แบบ · เรียงตามชนะเหนือการสุ่ม)</figcaption>
      <div tabIndex={0} role="region" aria-label={`ตาราง config ที่ชนะถึง ${target}% ในช่วงค้นหา`} className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-[11px]">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-1.5 pr-2 font-medium">config</th>
              <th className="px-2 font-medium">ชนะ [Wilson 95%]</th>
              <th className="px-2 font-medium">สุ่มชนะ</th>
              <th className="px-2 font-medium">เหนือการสุ่ม (จุด) [CI 95%]</th>
              <th className="px-2 font-medium">p</th>
              <th className="px-2 font-medium">q (นับทุกแบบ)</th>
              <th className="px-2 font-medium">ผลสุทธิ/ไม้ [CI 95%]</th>
              <th className="px-2 font-medium">ไม้ปิด</th>
              <th className="pl-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-100">
            {rows.map((r) => {
              const d = r.discovery;
              const s = reachStatus(r, fdr);
              return (
                <tr key={r.key} className="border-b border-zinc-800/60">
                  <td className="py-1.5 pr-2 font-sans text-zinc-200">{cellLabel(r)}</td>
                  <td className="px-2">
                    {pct(d.winRate)} <span className="text-zinc-400">{d.wilson ? `[${d.wilson.lo.toFixed(0)}, ${d.wilson.hi.toFixed(0)}]` : ''}</span>
                  </td>
                  <td className="px-2">{pct(d.baseline)}</td>
                  <td className="px-2">{d.excess ? `${signedFmt(d.excess.mean, 1)} [${signedFmt(d.excess.lo, 1)}, ${signedFmt(d.excess.hi, 1)}]` : '—'}</td>
                  <td className="px-2">{qFmt(d.pExcess)}</td>
                  <td className="px-2">{qFmt(r.q)}</td>
                  <td className="px-2">{d.expectancy ? `${signedFmt(d.expectancy.mean)} [${signedFmt(d.expectancy.lo)}, ${signedFmt(d.expectancy.hi)}]` : '—'}</td>
                  <td className="px-2">{d.closed}</td>
                  <td className="pl-2 font-sans">
                    <StatusBadge text={s.text} color={s.color} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-zinc-400">
        p = ทดสอบแบบเดียว · q = หลังนับว่าลองทุกแบบ (Benjamini–Hochberg) — ต้อง q &lt; {fdr} จึงแยกจากโชคได้ · ตารางนี้แสดงเฉพาะผลช่วงค้นหา (ห้ามเลือกจากผลช่วงทดสอบ)
      </p>
    </figure>
  );
}

// ─────────────────────────── D · ช่วงค้นหา vs ช่วงทดสอบ ───────────────────────────

function StatsColumn({ title, s }: { title: string; s: WinStats }) {
  const items: Array<[string, string]> = [
    ['ชนะสุทธิ', `${pct(s.winRate)}${s.wilson ? ` [${s.wilson.lo.toFixed(1)}, ${s.wilson.hi.toFixed(1)}]` : ''}`],
    ['สุ่มเข้าชนะ', pct(s.baseline)],
    ['เหนือการสุ่ม', s.excess ? `${signedFmt(s.excess.mean, 1)} จุด (${pEq(s.pExcess)})` : '—'],
    ['ผลสุทธิ/ไม้', s.expectancy ? `${signedFmt(s.expectancy.mean)}% [${signedFmt(s.expectancy.lo)}, ${signedFmt(s.expectancy.hi)}]` : '—'],
    ['เท่าทุนต้องชนะ', pct(s.breakevenWin)],
    ['ไม้ปิด / ได้ของ', `${s.closed} / ${s.filled} (${pct(s.fillRate, 0)} ของคำสั่ง)`],
    ['design effect', s.deff === null ? '—' : s.deff.toFixed(2)],
  ];
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
      <p className="mb-1 text-[11px] font-semibold text-zinc-200">{title}</p>
      <dl className="space-y-0.5 text-[11px]">
        {items.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-zinc-400">{k}</dt>
            <dd className="font-mono text-zinc-100">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CompareCard({ row, selected, w }: { row: WinRow; selected: boolean; w: WinrateResponse['window'] }) {
  const ci = [
    { key: 'd', label: `ช่วงค้นหา (${thDate(w.start)} – ก่อน ${thDate(w.split)})`, s: row.discovery },
    { key: 'h', label: `ช่วงทดสอบ (${thDate(w.split)} – ${thDate(w.end)})`, s: row.holdout },
  ].filter((x) => x.s.excess !== null);
  return (
    <div className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-50">
        {cellLabel(row)}
        <StatusBadge text={selected ? 'ผ่านเกณฑ์ช่วงค้นหา' : 'ใกล้ที่สุด — ไม่ผ่านเกณฑ์'} color={selected ? POS : CONTEXT} />
      </p>
      {!selected && (
        <p className="text-[11px] leading-snug text-zinc-400">
          ตัวนี้ถูกเลือกด้วยกติกาตายตัวจากช่วงค้นหา (ชนะถึงเป้าและเหนือการสุ่มมากที่สุด) แต่ยังแยกจากโชคไม่ได้หลังนับทุกแบบที่ลอง — ผลช่วงทดสอบแสดงเพื่อความโปร่งใส ใช้ยืนยันไม่ได้
        </p>
      )}
      <div className="grid gap-2 @min-[700px]:grid-cols-2">
        <StatsColumn title="ช่วงค้นหา (ใช้เลือก)" s={row.discovery} />
        <StatsColumn title="ช่วงทดสอบ (ไม่ได้ใช้เลือก)" s={row.holdout} />
      </div>
      {ci.length > 0 && (
        <ForestPlot
          title="ชนะเหนือการสุ่ม (จุด %) · CI 95% แบบ cluster-robust รายสัปดาห์"
          rows={ci.map((x) => ({
            key: x.key,
            label: x.label,
            ci: x.s.excess!,
            color: x.s.excess!.lo > 0 ? POS : x.s.excess!.hi < 0 ? NEG : '#d4d4d8',
            sub: `ชนะ ${pct(x.s.winRate)} เทียบสุ่ม ${pct(x.s.baseline)} · ไม้ปิด ${x.s.closed}`,
          }))}
          digits={1}
          refNote="เส้นตั้ง = เท่าการสุ่ม (ไม่มีฝีมือ) · ช่วงที่คร่อมเส้น = ยังแยกจากโชคไม่ได้ · ช่วงทดสอบสั้น/สัญญาณกระจุก = ช่วงกว้าง"
        />
      )}
    </div>
  );
}

// ─────────────────────────── E · จำนวนไม้ที่ต้องใช้ ───────────────────────────

type PowerBar = { label: string; p1: number; n: number | null; years: number | null; value: number };

export function PowerChart({ power, target }: { power: WinrateResponse['power']; target: number }) {
  if (power.p0 === null) return null;
  const p0 = power.p0 / 100;
  const data: PowerBar[] = [0.75, 0.8, 0.85, 0.9].map((p1) => {
    const n0 = sampleSize(p0, p1);
    const n = n0 === null ? null : Math.ceil(n0 * power.deff);
    return { label: `ชนะจริง ${Math.round(p1 * 100)}%`, p1, n, years: n !== null && power.closedPerYear > 0 ? Math.round((n / power.closedPerYear) * 10) / 10 : null, value: n ?? 0 };
  });
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<PowerBar>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={r.label}
        rows={[
          { label: 'ไม้ปิดที่ต้องใช้', value: r.n === null ? 'พิสูจน์ไม่ได้ (ไม่สูงกว่าการสุ่ม)' : String(r.n) },
          { label: 'ประมาณ', value: r.years === null ? '—' : `${r.years} ปี` },
        ]}
      />
    );
  };
  const label = (props: unknown) => {
    const { x = 0, y = 0, width = 0, index = 0 } = props as { x?: number; y?: number; width?: number; index?: number };
    const r = data[index];
    if (!r) return <g />;
    return (
      <HaloText x={x + width / 2} y={y - 5} anchor="middle" fill={INK} size={10} weight={600}>
        {r.n === null ? 'พิสูจน์ไม่ได้' : `${r.n} ไม้${r.years !== null ? ` ≈ ${r.years} ปี` : ''}`}
      </HaloText>
    );
  };
  const yTicks = niceAxis(0, Math.max(10, ...data.map((d) => d.value)) * 1.12);
  return (
    <ChartFrame
      title={`ไม้ forward ที่ต้องใช้ (กำลังทดสอบ 80% · ระดับนัยสำคัญ 5% · คูณ design effect ${power.deff.toFixed(2)})`}
      height={220}
      label={`จำนวนไม้ forward ที่ต้องใช้พิสูจน์ว่าชนะเหนือการสุ่ม ${power.p0}%: ${data.map((d) => `${d.label} ${d.n ?? 'พิสูจน์ไม่ได้'}`).join(' · ')}`}
      note={`ฐาน = การสุ่มเข้าด้วยกติกาออกเดียวกันชนะ ${power.p0}% · ยิ่งชนะเหนือการสุ่มน้อย ยิ่งต้องใช้ไม้มาก · แท่งที่เน้น = เป้า ${target}% · ปี = ที่ความถี่ ${power.closedPerYear} ไม้ปิด/ปีในอดีต`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} stroke={BASELINE} />
          <YAxis tick={AXIS} width={40} stroke={BASELINE} domain={[0, yTicks[yTicks.length - 1]]} ticks={yTicks} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} isAnimationActive={false} />
          <Bar
            dataKey="value"
            isAnimationActive={false}
            shape={(props: unknown) => {
              const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props as { x?: number; y?: number; width?: number; height?: number; index?: number };
              const on = Math.round((data[index]?.p1 ?? 0) * 100) === target;
              return <rect x={x} y={y} width={width} height={Math.max(0, height)} rx={3} fill={on ? SIGNAL : SEQUENTIAL[1]} />;
            }}
          >
            <LabelList dataKey="value" content={label} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
