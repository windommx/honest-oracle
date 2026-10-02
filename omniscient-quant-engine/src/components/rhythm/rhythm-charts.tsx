'use client';

/**
 * กราฟของหน้า "จังหวะตลาด" — ดัดแปลงกราฟวิเคราะห์จังหวะการทำงาน 5 แบบมาใช้กับหุ้นไทย โดยคงองค์ประกอบของต้นฉบับ:
 * ตัวเลขในทุกช่องของ heatmap · แท่งขอบบน/ขวาพร้อมค่า · คำอธิบายวันพุ่งในกราฟ · ป้ายชื่อในพื้นที่ซ้อน · แท่งคู่รายเดือนพร้อมยอดรวม
 * สี: categorical ช่อง 1–6 ตามลำดับคงที่ (validator: adjacent CVD ΔE ≥ 8.4 · normal ΔE ≥ 19.3 บนพื้น #0f0f11)
 *     แผนที่วัน (scatter = ทุกคู่เห็นกัน) ใช้แค่ 2 สี: กลุ่มที่เลือก + วันล่าสุด (all-pairs ΔE 26.8) ที่เหลือเป็นเทา
 *     heatmap = diverging น้ำเงิน ↔ แดง จุดกลางเทา (ไล่ใน OKLab ความสว่างเท่ากันทั้งสองฝั่งต่อขั้น)
 * ข้อความเป็นสีหมึกเสมอ (บนพื้นสีเลือกขาว/ดำตาม contrast) · ทุกกราฟมี role="img" + aria-label สรุป · heatmap มีตารางข้อมูลให้เปิดดู
 */

import { Fragment, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
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
  niceTicks,
  robustMax,
  SURFACE,
  TipBox,
  TOOLTIP,
  type LegendItem,
  type TipProps,
  type ViewBox,
} from '@/components/charts/chart-kit';
import { TH_MONTH, thDate, thMonthTick } from '@/lib/flows/format';
import type { BreadthPanel, DayMapPanel, GateBlockPanel, SeasonalityPanel, SectorPanel } from '@/lib/rhythm/types';

// สีและสเกลย้ายไป chart-kit (ใช้ร่วมกับหน้า Atlas) — ส่งออกต่อเพื่อไม่ให้ผู้ใช้เดิมพัง
export { CATEGORICAL, divergingColor, inkOn, robustMax };
import { cn } from '@/lib/utils';

const BLUE = CATEGORICAL[0];
const ORANGE = CATEGORICAL[1];
const AQUA = CATEGORICAL[2];
/** เทาสำหรับข้อมูลบริบท (ลดความเด่น) */
const CONTEXT = '#71717a';
const INK = '#f4f4f5';
const INK_MUTED = '#a1a1aa';

const signedFmt = (v: number, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;
const intFmt = (v: number) => Math.round(v).toLocaleString('en-US');

// ─────────────────────────── 1) ความพร้อมกัน / ความกว้างของตลาด ───────────────────────────

export function BreadthChart({ p }: { p: BreadthPanel }) {
  const L = p.days[p.days.length - 1];
  const legend: LegendItem[] = [
    { label: 'รายวัน', color: CONTEXT, value: `${L.breadth.toFixed(0)}%` },
    { label: 'เฉลี่ย 20 วัน', color: BLUE, value: `${L.breadthMean20.toFixed(0)}%` },
    { label: 'ช่วง risk-off', color: 'rgba(255,255,255,0.16)', shape: 'box' },
  ];
  const shift = p.regimeShift;
  return (
    <ChartFrame
      title="ความกว้างโดยทั่วไป: % หุ้นที่ปิดเหนือ MA20"
      height={200}
      legend={legend}
      label={`ความกว้างของตลาดล่าสุด ${L.breadth.toFixed(0)}% เฉลี่ย 20 วัน ${L.breadthMean20.toFixed(0)}% · ช่วง risk-off ${p.riskOffSpans.length} ช่วง`}
      note={shift && `เส้นแนวตั้ง = จุดเปลี่ยน regime ล่าสุด ${thDate(shift.date)} (${shift.daysAgo} วันทำการก่อน): ${shift.note}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={p.days} syncId="rhythm-breadth" margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          {p.riskOffSpans.map((s) => (
            <ReferenceArea key={s.start} x1={s.start} x2={s.end} fill="#ffffff" fillOpacity={0.07} ifOverflow="hidden" />
          ))}
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={32} stroke={BASELINE} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
          <ReferenceLine y={50} stroke={BASELINE} />
          {shift && (
            <ReferenceLine
              x={shift.date}
              stroke={INK_MUTED}
              strokeDasharray="4 3"
              label={{ value: `${thDate(shift.date)}: ${shift.to === 'risk_on' ? 'กลับเป็น risk-on' : 'เข้าสู่ risk-off'}`, position: 'insideTopLeft', fill: INK, fontSize: 10 }}
            />
          )}
          <Tooltip {...TOOLTIP} labelFormatter={(d: string) => thDate(d)} formatter={(v: number | string, name: string) => [`${Number(v).toFixed(1)}%`, name]} />
          <Line type="monotone" dataKey="breadth" name="รายวัน" stroke={CONTEXT} strokeWidth={1} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="breadthMean20" name="เฉลี่ย 20 วัน" stroke={BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** คำอธิบายวันพุ่งในกราฟ: เส้นนำ + วันที่ + จำนวนหุ้น + SET (ฝั่งซ้ายเมื่อจุดอยู่ครึ่งขวาของกราฟ) */
function spikeLabel(s: BreadthPanel['spikes'][number], n: number, leftSide: boolean, row: number) {
  return function SpikeLabel(props: unknown) {
    const vb = (props as { viewBox?: ViewBox }).viewBox;
    if (!vb || vb.x === undefined || vb.y === undefined) return <g />;
    const cx = vb.x + (vb.width ?? 0) / 2;
    const cy = vb.y + (vb.height ?? 0) / 2;
    const dir = leftSide ? -1 : 1;
    const tx = cx + dir * 34;
    const ty = cy + 10 + row * 26;
    const anchor = leftSide ? 'end' : 'start';
    return (
      <g>
        <line x1={cx + dir * 5} y1={cy + 2} x2={tx - dir * 2} y2={ty - 4} stroke={INK_MUTED} strokeWidth={1} />
        <HaloText x={tx} y={ty} anchor={anchor} fill={INK} weight={600}>
          {`${thDate(s.date)} = ${s.extreme}/${n} ตัว`}
        </HaloText>
        <HaloText x={tx} y={ty + 12} anchor={anchor} fill={INK_MUTED}>
          {`SET ${signedFmt(s.marketRet)}% · breadth ${s.breadth.toFixed(0)}%`}
        </HaloText>
      </g>
    );
  };
}

export function ExtremeChart({ p }: { p: BreadthPanel }) {
  const L = p.days[p.days.length - 1];
  const legend: LegendItem[] = [
    { label: 'รายวัน', color: CONTEXT, shape: 'box', value: String(L.extreme) },
    { label: 'เฉลี่ย 20 วัน', color: BLUE, value: L.extremeMean20.toFixed(1) },
    { label: 'p90 ของเดือน', color: ORANGE, value: L.extremeP90m.toFixed(1) },
  ];
  const idx = new Map(p.days.map((d, i) => [d.date, i]));
  const spikeText = p.spikes.map((s) => `${thDate(s.date)} ${s.extreme}/${p.nStocks} ตัว SET ${signedFmt(s.marketRet)}%`).join(' · ');
  return (
    <ChartFrame
      title="วันพุ่ง: หุ้นเคลื่อนแรงพร้อมกันมาก = ข่าวระดับตลาด ไม่ใช่ข่าวรายตัว"
      height={230}
      legend={legend}
      label={`จำนวนหุ้นที่เคลื่อนแรงผิดปกติต่อวัน (จาก ${p.nStocks} ตัว): ล่าสุด ${L.extreme} ตัว เฉลี่ย 20 วัน ${L.extremeMean20.toFixed(1)} · วันพุ่ง: ${spikeText || 'ไม่มี'}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={p.days} syncId="rhythm-breadth" margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={32} allowDecimals={false} stroke={BASELINE} domain={[0, p.nStocks]} ticks={niceTicks(0, p.nStocks, 4)} />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(d: string) => thDate(d)}
            formatter={(v: number | string, name: string) => [name === 'รายวัน' ? `${v} ตัว` : Number(v).toFixed(1), name]}
          />
          <Bar dataKey="extreme" name="รายวัน" fill={CONTEXT} isAnimationActive={false} maxBarSize={6} />
          <Line type="monotone" dataKey="extremeMean20" name="เฉลี่ย 20 วัน" stroke={BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="extremeP90m" name="p90 ของเดือน" stroke={ORANGE} strokeWidth={2} dot={false} isAnimationActive={false} />
          {p.spikes.map((s, i) => (
            <ReferenceDot
              key={s.date}
              x={s.date}
              y={s.extreme}
              r={4}
              fill={INK}
              stroke={SURFACE}
              strokeWidth={2}
              ifOverflow="extendDomain"
              label={spikeLabel(s, p.nStocks, (idx.get(s.date) ?? 0) > p.days.length * 0.55, i)}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** ป้ายปลายเส้น (เฉพาะจุดสุดท้าย) — แทน legend ที่ต้องกวาดตา */
function endLabel(text: string, color: string, lastIndex: number) {
  return function EndLabel(props: unknown) {
    const { x, y, index, value } = props as { x?: number; y?: number; index?: number; value?: number };
    if (index !== lastIndex || x === undefined || y === undefined) return null;
    return (
      <g>
        <circle cx={x} cy={y} r={3} fill={color} />
        <HaloText x={x + 6} y={y + 3.5} anchor="start" fill={INK}>{`${text} ${value ?? ''}`}</HaloText>
      </g>
    );
  };
}

/** การกระจายของจำนวนหุ้นเคลื่อนแรงต่อวัน รายเดือน (มัธยฐาน · p90 · สูงสุด) + ป้ายค่าที่จุดสูงสุด */
export function ExtremeMonthlyChart({ p }: { p: BreadthPanel }) {
  const data = p.monthly;
  const last = data.length - 1;
  const peak = data.reduce((bi, m, i) => (m.max > data[bi].max ? i : bi), 0);
  const legend: LegendItem[] = [
    { label: 'สูงสุด', color: AQUA, value: String(data[last].max) },
    { label: 'p90', color: ORANGE, value: String(data[last].p90) },
    { label: 'มัธยฐาน', color: BLUE, value: String(data[last].median) },
  ];
  return (
    <ChartFrame
      title="การกระจายของวันเคลื่อนแรงรายเดือน (ตัว/วัน)"
      height={220}
      legend={legend}
      label={`จำนวนหุ้นเคลื่อนแรงต่อวันรายเดือน: เดือนล่าสุด มัธยฐาน ${data[last].median} p90 ${data[last].p90} สูงสุด ${data[last].max} · สูงสุดทั้งช่วง ${data[peak].max} ตัว (${thMonthTick(data[peak].month)})`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 64, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={28} stroke={BASELINE} />
          <YAxis tick={AXIS} width={32} allowDecimals={false} stroke={BASELINE} domain={[0, 'dataMax']} />
          <Tooltip {...TOOLTIP} labelFormatter={(m: string) => thMonthTick(m)} formatter={(v: number | string, name: string) => [`${v} ตัว`, name]} />
          <Line type="linear" dataKey="max" name="สูงสุด" stroke={AQUA} strokeWidth={2} dot={{ r: 2.5, fill: AQUA, strokeWidth: 0 }} isAnimationActive={false}>
            <LabelList dataKey="max" content={endLabel('สูงสุด', AQUA, last)} />
            <LabelList
              dataKey="max"
              content={(props: unknown) => {
                const { x, y, index, value } = props as { x?: number; y?: number; index?: number; value?: number };
                if (index !== peak || index === last || x === undefined || y === undefined) return null;
                return (
                  <HaloText x={x} y={y - 7} anchor="middle" fill={INK} weight={600}>
                    {String(value)}
                  </HaloText>
                );
              }}
            />
          </Line>
          <Line type="linear" dataKey="p90" name="p90" stroke={ORANGE} strokeWidth={2} dot={{ r: 2.5, fill: ORANGE, strokeWidth: 0 }} isAnimationActive={false}>
            <LabelList dataKey="p90" content={endLabel('p90', ORANGE, last)} />
          </Line>
          <Line type="linear" dataKey="median" name="มัธยฐาน" stroke={BLUE} strokeWidth={2} dot={{ r: 2.5, fill: BLUE, strokeWidth: 0 }} isAnimationActive={false}>
            <LabelList dataKey="median" content={endLabel('มัธยฐาน', BLUE, last)} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** breadth เฉลี่ย เดือน × วันในสัปดาห์ (ตัวเลขทุกช่อง) + ขอบขวา: เฉลี่ยทั้งเดือน | % วันที่ breadth > 50% */
export function BreadthMonthHeat({ p }: { p: BreadthPanel }) {
  const h = p.heat;
  const grid = { gridTemplateColumns: '4.5rem repeat(5, minmax(0, 1fr)) 6.75rem' };
  return (
    <figure className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <figcaption className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">breadth เฉลี่ย (%) · เดือน × วันในสัปดาห์</figcaption>
      <div
        role="img"
        aria-label={`breadth เฉลี่ยรายเดือน: ${h.rows.map((m, i) => `${thMonthTick(m)} ${h.rowMeta[i].mean.toFixed(0)}% (วันเกินครึ่ง ${h.rowMeta[i].pctAbove50}%)`).join(', ')}`}
        className="space-y-[2px]"
      >
        <div className="grid gap-[2px] text-[10px] text-zinc-400" style={grid}>
          <span />
          {h.cols.map((c) => (
            <span key={c} className="text-center">
              {c}
            </span>
          ))}
          <span className="text-right">เฉลี่ย | วัน &gt; 50%</span>
        </div>
        {h.rows.map((m, r) => (
          <div key={m} className="grid gap-[2px]" style={grid}>
            <span className="self-center text-[10px] text-zinc-400">{thMonthTick(m)}</span>
            {h.cells[r].map((c, ci) => {
              const bg = c.value === null ? 'transparent' : divergingColor(c.value - 50, 50);
              return (
                <span key={h.cols[ci]} className="flex h-6 items-center justify-center rounded-[3px] font-mono text-[10.5px]" style={{ background: bg, color: c.value === null ? INK_MUTED : inkOn(bg) }}>
                  {c.value === null ? '' : c.value}
                </span>
              );
            })}
            <span className="self-center text-right font-mono text-[10.5px] text-zinc-200">
              {h.rowMeta[r].mean.toFixed(0)} | {h.rowMeta[r].pctAbove50}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <DivergingLegend neg="ต่ำกว่า 50%" pos="สูงกว่า 50%" note="ตัวเลขในช่อง = breadth เฉลี่ยของวันนั้นในเดือนนั้น" />
      </div>
    </figure>
  );
}

/** ปฏิทิน breadth รายวัน 52 สัปดาห์ (ช่องละ 1 วัน · สีเทียบเส้น 50%) */
export function BreadthCalendar({ p }: { p: BreadthPanel }) {
  const [hover, setHover] = useState<{ date: string; breadth: number } | null>(null);
  const weeks = p.calendar;
  // ป้ายเดือนที่สัปดาห์แรกของเดือน · ห่างกัน ≥ 3 คอลัมน์ (ไม่ให้ป้ายทับกันตรงเดือนที่เริ่มกลางสัปดาห์)
  const monthLabel: string[] = [];
  let lastAt = -99;
  weeks.forEach((w, i) => {
    const starts = i === 0 || w.week.slice(0, 7) !== weeks[i - 1].week.slice(0, 7);
    const nextStart = weeks.findIndex((x, j) => j > i && x.week.slice(0, 7) !== w.week.slice(0, 7));
    const crowded = i === 0 && nextStart !== -1 && nextStart < 3;
    if (starts && !crowded && i - lastAt >= 3) {
      monthLabel.push(thMonthTick(w.week));
      lastAt = i;
    } else monthLabel.push('');
  });
  const DAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'];
  const all = weeks.flatMap((w) => w.days.filter((d): d is { date: string; breadth: number } => d !== null));
  const above = all.filter((d) => d.breadth > 50).length;
  return (
    <figure className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">ปฏิทินความกว้างของตลาด · {weeks.length} สัปดาห์ล่าสุด</figcaption>
      <p className="mb-2 min-h-4 text-[11px] text-zinc-300" aria-live="off">
        {hover ? (
          <>
            {thDate(hover.date)} · <span className="font-mono text-zinc-50">{hover.breadth.toFixed(0)}%</span> ของหุ้นปิดเหนือ MA20
          </>
        ) : (
          `ชี้ที่ช่องเพื่อดูค่ารายวัน · ${above} จาก ${all.length} วัน (${all.length ? Math.round((above / all.length) * 100) : 0}%) หุ้นเกินครึ่งอยู่เหนือ MA20`
        )}
      </p>
      <div tabIndex={0} role="region" aria-label="ปฏิทินความกว้างของตลาด เลื่อนดูในแนวนอนได้" className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`ปฏิทิน breadth ${weeks.length} สัปดาห์: ${above} จาก ${all.length} วันที่หุ้นเกินครึ่งปิดเหนือ MA20 · ล่าสุด ${p.latest.breadth.toFixed(0)}%`}
          className="grid min-w-[560px] gap-[2px]"
          style={{ gridTemplateColumns: `1.75rem repeat(${weeks.length}, minmax(0, 1fr))` }}
          onMouseLeave={() => setHover(null)}
        >
          <span />
          {monthLabel.map((m, i) => (
            <span key={weeks[i].week} className="h-3.5 overflow-visible whitespace-nowrap text-[9.5px] leading-none text-zinc-400">
              {m}
            </span>
          ))}
          {DAYS.map((label, r) => (
            <Fragment key={label}>
              <span className="text-[10px] leading-none text-zinc-400">{label}</span>
              {weeks.map((w) => {
                const d = w.days[r];
                return (
                  <span
                    key={w.week}
                    className="aspect-square rounded-[2px]"
                    style={{ background: d ? divergingColor(d.breadth - 50, 50) : 'transparent' }}
                    onMouseEnter={d ? () => setHover(d) : undefined}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <DivergingLegend neg="0% (ต่ำกว่า MA20 ทั้งหมด)" pos="100% (เหนือ MA20 ทั้งหมด)" note="กลาง = 50%" />
      </div>
    </figure>
  );
}

// ─────────────────────────── 2) ฤดูกาล วัน × เดือน ───────────────────────────

/** แท่งเบนจากศูนย์ (แนวตั้ง = ขอบบนรายเดือน · แนวนอน = ขอบขวารายวัน) */
function MarginBar({ v, max, vertical, reference }: { v: number | null; max: number; vertical: boolean; reference?: number }) {
  if (v === null || max <= 0) return <span className="block h-full w-full" />;
  const pct = Math.min(50, (Math.abs(v) / max) * 50);
  const color = v >= 0 ? DIV_POS[3] : DIV_NEG[3];
  const ref = reference === undefined ? null : 50 + Math.max(-50, Math.min(50, (reference / max) * 50));
  return vertical ? (
    <span className="relative block h-full w-full" aria-hidden>
      <span className="absolute inset-x-0 top-1/2 h-px bg-zinc-600" />
      <span
        className="absolute left-1/2 w-3/5 -translate-x-1/2"
        style={v >= 0 ? { bottom: '50%', height: `${pct}%`, background: color, borderRadius: '3px 3px 0 0' } : { top: '50%', height: `${pct}%`, background: color, borderRadius: '0 0 3px 3px' }}
      />
      {ref !== null && <span className="absolute inset-x-0 border-t border-dashed border-zinc-300" style={{ bottom: `${ref}%` }} />}
    </span>
  ) : (
    <span className="relative block h-full min-h-4 w-full" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
      <span
        className="absolute top-1/2 h-3/5 -translate-y-1/2"
        style={v >= 0 ? { left: '50%', width: `${pct}%`, background: color, borderRadius: '0 3px 3px 0' } : { right: '50%', width: `${pct}%`, background: color, borderRadius: '3px 0 0 3px' }}
      />
      {ref !== null && <span className="absolute inset-y-0 border-l border-dashed border-zinc-300" style={{ left: `${ref}%` }} />}
    </span>
  );
}

export function SeasonalityHeatmap({ p }: { p: SeasonalityPanel }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const values = p.cells.flat().flatMap((c) => (c.value === null ? [] : [c.value]));
  const max = robustMax(values);
  const marginMax = Math.max(...p.byMonth.map((m) => Math.abs(m.mean ?? 0)), Math.abs(p.overallMean), 1e-9);
  const wdMax = Math.max(...p.byWeekday.map((m) => Math.abs(m.mean ?? 0)), Math.abs(p.overallMean), 1e-9);
  const cell = hover ? p.cells[hover.r][hover.c] : null;
  const fmt = (v: number | null) => (v === null ? '—' : `${signedFmt(v, 2)}%`);
  const stat = (m: SeasonalityPanel['byMonth'][number]) =>
    m.mean === null ? 'ไม่มีข้อมูล' : `${fmt(m.mean)}/วัน · บวก ${m.upPct}% · t=${m.tStat?.toFixed(1) ?? '—'} · q=${m.q?.toFixed(2) ?? '—'} · n=${m.n}`;
  const sig = (m: SeasonalityPanel['byMonth'][number]) => m.tStat !== null && Math.abs(m.tStat) >= 2;
  const isMax = (r: number, c: number) => p.maxCell?.r === r && p.maxCell?.c === c;
  const isMin = (r: number, c: number) => p.minCell?.r === r && p.minCell?.c === c;
  const grid = { gridTemplateColumns: '2.25rem repeat(12, minmax(0, 1fr)) 9rem' };
  return (
    <figure className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        ผลตอบแทนเฉลี่ยต่อวัน (%) · วันในสัปดาห์ × เดือน — {p.label}
      </figcaption>
      <p className="mb-2 min-h-4 text-[11px] text-zinc-300">
        {hover && cell ? (
          <>
            {p.rows[hover.r]} · {p.cols[hover.c]}: <span className="font-mono text-zinc-50">{fmt(cell.value)}</span>/วัน ({cell.n} วัน)
          </>
        ) : (
          <>
            ชี้ที่ช่องเพื่อดูค่า · เฉลี่ยทุกวัน <span className="font-mono text-zinc-50">{fmt(p.overallMean)}</span>/วัน (เส้นประ) · ขอบบน = รายเดือน · ขอบขวา = รายวันในสัปดาห์
          </>
        )}
      </p>
      <div tabIndex={0} role="region" aria-label="heatmap ฤดูกาลของผลตอบแทน เลื่อนดูในแนวนอนได้" className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`${p.label}: ${p.byMonth.map((m) => `${m.label} ${fmt(m.mean)}`).join(', ')} · ${p.byWeekday.map((m) => `${m.label} ${fmt(m.mean)}`).join(', ')}`}
          className="min-w-[720px] max-w-6xl space-y-[2px]"
          onMouseLeave={() => setHover(null)}
        >
          {/* ขอบบน: ผลตอบแทนเฉลี่ยรายเดือน (แรเงา = |t| ≥ 2) */}
          <div className="grid gap-[2px]" style={grid}>
            <span className="self-end text-[10px] leading-tight text-zinc-400">รายเดือน</span>
            {p.byMonth.map((m) => (
              <span key={m.label} title={stat(m)} className={cn('flex h-20 flex-col rounded-t-[3px] px-0.5 pt-0.5', sig(m) && 'bg-white/[0.07]')}>
                <span className="text-center font-mono text-[10px] leading-tight text-zinc-100">{m.mean === null ? '—' : signedFmt(m.mean, 2)}</span>
                <span className="min-h-0 flex-1">
                  <MarginBar v={m.mean} max={marginMax} vertical reference={p.overallMean} />
                </span>
              </span>
            ))}
            <span className="self-end pl-1 text-[10px] leading-tight text-zinc-400">พื้นแรเงา = |t| ≥ 2 · เส้นประ = เฉลี่ยทุกวัน</span>
          </div>
          <div className="grid gap-[2px]" style={grid}>
            <span />
            {p.cols.map((m) => (
              <span key={m} className="truncate text-center text-[10px] text-zinc-400">
                {m}
              </span>
            ))}
            <span className="pl-1 text-[10px] text-zinc-400">รายวัน (เฉลี่ย · % วันบวก · สเกลของตัวเอง)</span>
          </div>
          {p.rows.map((wd, r) => (
            <div key={wd} className="grid gap-[2px]" style={grid}>
              <span className="self-center text-[10px] text-zinc-400">{wd}</span>
              {p.cells[r].map((c, ci) => {
                const bg = c.value === null ? 'transparent' : divergingColor(c.value, max);
                return (
                  <span
                    key={p.cols[ci]}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-[3px] font-mono text-[10.5px]',
                      isMax(r, ci) && 'outline outline-2 -outline-offset-2 outline-zinc-50',
                      isMin(r, ci) && 'outline-dashed outline-2 -outline-offset-2 outline-zinc-50',
                      hover && hover.r === r && hover.c === ci && !isMax(r, ci) && !isMin(r, ci) && 'outline outline-1 outline-zinc-300',
                    )}
                    style={{ background: bg, color: c.value === null ? INK_MUTED : inkOn(bg), opacity: c.n > 0 && c.n < 5 ? 0.55 : 1 }}
                    onMouseEnter={() => setHover({ r, c: ci })}
                  >
                    {c.value === null ? '' : signedFmt(c.value, 2)}
                  </span>
                );
              })}
              <span className="flex items-center gap-1.5 pl-1" title={stat(p.byWeekday[r])}>
                <span className="h-7 min-w-0 flex-1">
                  <MarginBar v={p.byWeekday[r].mean} max={wdMax} vertical={false} reference={p.overallMean} />
                </span>
                <span className="w-[4.5rem] shrink-0 text-right font-mono text-[10px] text-zinc-200">
                  {p.byWeekday[r].mean === null ? '—' : signedFmt(p.byWeekday[r].mean!, 2)} · {p.byWeekday[r].upPct ?? '—'}%
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <DivergingLegend
          neg={`ลบ (≤ −${max.toFixed(2)}%)`}
          pos={`บวก (≥ +${max.toFixed(2)}%)`}
          note="กรอบทึบ = ช่องสูงสุด · กรอบประ = ช่องต่ำสุด · ช่องจาง = ตัวอย่างน้อยกว่า 5 วัน"
        />
      </div>
      <details className="mt-2 text-[11px] text-zinc-300">
        <summary className="inline-flex min-h-6 cursor-pointer select-none items-center text-zinc-300 hover:text-zinc-100">ดูเป็นตาราง (ค่าเฉลี่ย · % วันบวก · t · q)</summary>
        <div tabIndex={0} role="region" aria-label="ตารางฤดูกาลของผลตอบแทน" className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-[11px]">
            <caption className="sr-only">ผลตอบแทนเฉลี่ยต่อวันแยกตามเดือนและวันในสัปดาห์ของ {p.label}</caption>
            <thead className="text-zinc-400">
              <tr>
                <th scope="col" className="px-1.5 py-1 text-left font-medium">ช่วง</th>
                <th scope="col" className="px-1.5 py-1 text-right font-medium">เฉลี่ย %/วัน</th>
                <th scope="col" className="px-1.5 py-1 text-right font-medium">% วันบวก</th>
                <th scope="col" className="px-1.5 py-1 text-right font-medium">t</th>
                <th scope="col" className="px-1.5 py-1 text-right font-medium">q (ปรับหลายช่อง)</th>
                <th scope="col" className="px-1.5 py-1 text-right font-medium">วัน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 font-mono">
              {[...p.byMonth, ...p.byWeekday].map((m, i) => (
                <tr key={`${i}-${m.label}`}>
                  <th scope="row" className="px-1.5 py-1 text-left font-sans font-normal text-zinc-200">
                    {i < 12 ? `เดือน ${m.label}` : `วัน${m.label}`}
                  </th>
                  <td className="px-1.5 py-1 text-right text-zinc-100">{fmt(m.mean)}</td>
                  <td className="px-1.5 py-1 text-right">{m.upPct ?? '—'}</td>
                  <td className={cn('px-1.5 py-1 text-right', m.tStat !== null && Math.abs(m.tStat) >= 2 && 'font-semibold text-zinc-50')}>{m.tStat?.toFixed(2) ?? '—'}</td>
                  <td className="px-1.5 py-1 text-right">{m.q?.toFixed(3) ?? '—'}</td>
                  <td className="px-1.5 py-1 text-right">{m.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

// ─────────────────────────── 3) สัดส่วนมูลค่าซื้อขายรายหมวด ───────────────────────────

/** ป้ายชื่อหมวดในพื้นที่ซ้อน — วางที่วันที่แถบของหมวดนั้นหนาที่สุด (ช่วงกลาง 80% ของเวลา) */
function sectorLabelSpots(p: SectorPanel): Array<{ k: number; date: string; y: number; share: number }> {
  const n = p.rolling.length;
  const lo = Math.floor(n * 0.1);
  const hi = Math.max(lo + 1, Math.ceil(n * 0.9));
  return p.sectors.map((_, k) => {
    let best = lo;
    for (let i = lo; i < hi; i++) if (p.rolling[i].shares[k] > p.rolling[best].shares[k]) best = i;
    const sh = p.rolling[best].shares;
    const total = sh.reduce((a, b) => a + b, 0) || 1;
    const below = sh.slice(0, k).reduce((a, b) => a + b, 0);
    return { k, date: p.rolling[best].date, y: (below + sh[k] / 2) / total, share: sh[k] };
  });
}

export function SectorShareChart({ p }: { p: SectorPanel }) {
  const data = p.rolling.map((r) => ({ date: r.date, ...Object.fromEntries(r.shares.map((v, k) => [`s${k}`, v])) }));
  const legend: LegendItem[] = p.sectors.map((s, k) => ({ label: s.label, color: CATEGORICAL[k], shape: 'box', value: `${p.latest.shares[k].toFixed(0)}%` }));
  const spots = sectorLabelSpots(p).filter((s) => s.share >= 7);
  return (
    <ChartFrame
      title="สัดส่วนมูลค่าซื้อขายรายหมวด (สะสม 20 วัน)"
      height={260}
      legend={legend}
      label={`สัดส่วนมูลค่าซื้อขาย 20 วันล่าสุด: ${p.sectors.map((s, k) => `${s.label} ${p.latest.shares[k].toFixed(1)}%`).join(', ')} · N_eff ${p.latest.nEff.toFixed(1)}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} stackOffset="expand" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <Tooltip {...TOOLTIP} labelFormatter={(d: string) => thDate(d)} formatter={(v: number | string, name: string) => [`${Number(v).toFixed(1)}%`, name]} />
          {p.sectors.map((s, k) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={`s${k}`}
              name={s.label}
              stackId="share"
              stroke={SURFACE}
              strokeWidth={1}
              fill={CATEGORICAL[k]}
              fillOpacity={1}
              isAnimationActive={false}
            />
          ))}
          {spots.map((s) => (
            <ReferenceDot
              key={p.sectors[s.k].key}
              x={s.date}
              y={s.y}
              r={0}
              fill="none"
              stroke="none"
              label={{ value: p.sectors[s.k].label, position: 'center', fill: inkOn(CATEGORICAL[s.k]), fontSize: 10.5, fontWeight: 600 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

interface MonthPair {
  month: string;
  totalValue: number;
  totalFlow: number | null;
  nEffValue: number;
  nEffFlow: number | null;
  value: number[];
  flow: number[] | null;
  net: number[] | null;
  [key: string]: unknown;
}

/** ยอดรวมบนแท่ง (อ่านจากแถวของเดือน) */
function totalOnTop(rows: MonthPair[], pick: (r: MonthPair) => string | null) {
  return function TotalOnTop(props: unknown) {
    const { x, y, width, index } = props as { x?: number; y?: number; width?: number; index?: number };
    if (x === undefined || y === undefined || width === undefined || index === undefined) return null;
    const text = pick(rows[index]);
    if (!text) return null;
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill={INK} fontSize={9.5} fontFamily="ui-monospace, monospace">
        {text}
      </text>
    );
  };
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

/** แท่งคู่รายเดือน: ซ้าย = สัดส่วนมูลค่าซื้อขาย (ยอดพันล้านบาทด้านบน) · ขวา = สัดส่วนขนาดเงินไหลสุทธิสถาบัน (ยอดล้านบาทด้านบน) · N_eff ใต้เดือน */
export function SectorMonthlyPairs({ p }: { p: SectorPanel }) {
  const flows = p.hasFlows;
  const rows: MonthPair[] = p.monthly.map((m) => ({
    month: m.month,
    totalValue: m.totalValue,
    totalFlow: m.totalFlow,
    nEffValue: m.nEffValue,
    nEffFlow: m.nEffFlow,
    value: m.value,
    flow: m.flow,
    net: m.flowNet,
    ...Object.fromEntries(m.value.map((v, k) => [`v${k}`, v])),
    ...Object.fromEntries((m.flow ?? []).map((v, k) => [`f${k}`, v])),
  }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const last = rows[rows.length - 1];
  const K = p.sectors.length;
  const tick = (props: unknown) => {
    const { x = 0, y = 0, payload } = props as { x?: number; y?: number; payload?: { value: string } };
    const r = byMonth.get(payload?.value ?? '');
    const mm = Number((payload?.value ?? '').slice(5, 7));
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={10} textAnchor="middle" fill={INK_MUTED} fontSize={10}>
          {mm ? TH_MONTH[mm - 1] : ''}
        </text>
        <text dy={23} textAnchor="middle" fill="#e4e4e7" fontSize={9.5} fontFamily="ui-monospace, monospace">
          {r ? (flows && r.nEffFlow !== null ? `${r.nEffValue.toFixed(1)}|${r.nEffFlow.toFixed(1)}` : r.nEffValue.toFixed(1)) : ''}
        </text>
      </g>
    );
  };
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<MonthPair>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={`${thMonthTick(r.month)} · มูลค่า ${intFmt(r.totalValue)} ล้านบาท · N_eff ${r.nEffValue.toFixed(2)}${r.nEffFlow !== null ? ` | ${r.nEffFlow.toFixed(2)}` : ''}`}
        rows={p.sectors.map((s, k) => ({
          label: s.label,
          color: CATEGORICAL[k],
          value: `${r.value[k]?.toFixed(1) ?? '—'}%${r.flow ? ` | ${r.flow[k].toFixed(1)}%` : ''}${r.net ? ` (สุทธิ ${signedFmt(r.net[k], 0)} ลบ.)` : ''}`,
        }))}
      />
    );
  };
  const title = flows ? 'รายเดือน: แท่งซ้าย = สัดส่วนมูลค่าซื้อขาย · แท่งขวา = สัดส่วนขนาดเงินไหลสุทธิสถาบัน' : 'รายเดือน: สัดส่วนมูลค่าซื้อขาย';
  return (
    <ChartFrame
      title={title}
      height={250}
      label={`${title} ${rows.length} เดือนล่าสุด · เดือนล่าสุด ${last ? p.sectors.map((s, k) => `${s.label} ${last.value[k]?.toFixed(1)}%${last.flow ? `/${last.flow[k].toFixed(1)}%` : ''}`).join(', ') : '—'} · N_eff ${last?.nEffValue.toFixed(1) ?? '—'}`}
      note={`${rows.length ? `${thMonthTick(rows[0].month)} – ${thMonthTick(rows[rows.length - 1].month)} · ` : ''}ตัวเลขบนแท่ง = ยอดรวม (มูลค่า: ล้านล้านบาท${flows ? ' | เงินไหล: พันล้านบาท' : ''}) · ในแท่ง = % ของหมวด · ใต้เดือน = N_eff (จำนวนหมวดที่มีน้ำหนักจริง${flows ? ' มูลค่า | เงินไหล' : ''})`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="16%" barGap={3}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" interval={0} height={40} stroke={BASELINE} tick={tick} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {p.sectors.map((s, k) => (
            <Bar key={`v-${s.key}`} dataKey={`v${k}`} name={s.label} stackId="v" fill={CATEGORICAL[k]} stroke={SURFACE} strokeWidth={1} isAnimationActive={false} maxBarSize={26}>
              <LabelList dataKey={`v${k}`} content={segmentPct(CATEGORICAL[k])} />
              {k === K - 1 && <LabelList dataKey={`v${k}`} content={totalOnTop(rows, (r) => (r.totalValue / 1_000_000).toFixed(2))} />}
            </Bar>
          ))}
          {flows &&
            p.sectors.map((s, k) => (
              <Bar key={`f-${s.key}`} dataKey={`f${k}`} name={`${s.label} (เงินไหล)`} stackId="f" fill={CATEGORICAL[k]} stroke={SURFACE} strokeWidth={1} isAnimationActive={false} maxBarSize={26}>
                <LabelList dataKey={`f${k}`} content={segmentPct(CATEGORICAL[k])} />
                {k === K - 1 && <LabelList dataKey={`f${k}`} content={totalOnTop(rows, (r) => (r.totalFlow === null ? null : (r.totalFlow / 1000).toFixed(1)))} />}
              </Bar>
            ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ─────────────────────────── 4) แผนที่วันซื้อขาย ───────────────────────────

type MapPoint = DayMapPanel['points'][number];

function PointShape(props: unknown, color: string, r: number) {
  const { cx = 0, cy = 0 } = props as { cx?: number; cy?: number };
  return (
    <g>
      <circle cx={cx} cy={cy} r={Math.max(r + 3, 6)} fill="transparent" />
      <circle cx={cx} cy={cy} r={r} fill={color} />
    </g>
  );
}

/** ป้ายกลุ่มแบบต้นฉบับ: เส้นนำออกจากจุดศูนย์กลาง + ชื่อกลุ่ม + % ของวัน (ดันออกจากกลางแผนที่) */
function clusterLabel(c: DayMapPanel['clusters'][number], selected: boolean, center: { x: number; y: number }, xFrac: number) {
  return function ClusterLabel(props: unknown) {
    const vb = (props as { viewBox?: ViewBox }).viewBox;
    if (!vb || vb.x === undefined || vb.y === undefined) return <g />;
    const cx = vb.x + (vb.width ?? 0) / 2;
    const cy = vb.y + (vb.height ?? 0) / 2;
    let dx = c.cx - center.x;
    let dy = -(c.cy - center.y);
    const len = Math.hypot(dx, dy);
    if (len < 0.25) {
      dx = 0.7;
      dy = 0.7;
    } else {
      dx /= len;
      dy /= len;
    }
    // กลุ่มที่อยู่ค่อนขวาของแผนที่ → ป้ายไปทางซ้าย (ไม่ล้นขอบกราฟ) และกลับกัน
    if (xFrac > 0.55 && dx > 0) dx = -Math.max(0.5, Math.abs(dx));
    if (xFrac < 0.3 && dx < 0) dx = Math.max(0.5, Math.abs(dx));
    const tx = cx + dx * 46;
    const ty = cy + dy * 34;
    const anchor = dx >= 0 ? 'start' : 'end';
    const off = dx >= 0 ? 4 : -4;
    return (
      <g>
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={selected ? INK : INK_MUTED} strokeWidth={1} />
        <circle cx={cx} cy={cy} r={3} fill={selected ? INK : INK_MUTED} />
        <HaloText x={tx + off} y={ty - 2} anchor={anchor} fill={INK} weight={selected ? 700 : 500} size={10.5}>
          {`${c.id + 1} · ${c.label}`}
        </HaloText>
        <HaloText x={tx + off} y={ty + 11} anchor={anchor} fill={INK_MUTED}>
          {`${c.share.toFixed(1)}% ของวัน`}
        </HaloText>
      </g>
    );
  };
}

export function DayMapChart({ p, selected }: { p: DayMapPanel; selected: number }) {
  const sel = p.points.filter((pt) => pt.c === selected);
  const rest = p.points.filter((pt) => pt.c !== selected);
  const latest = p.points[p.points.length - 1];
  const center = { x: p.points.reduce((a, q) => a + q.x, 0) / p.points.length, y: p.points.reduce((a, q) => a + q.y, 0) / p.points.length };
  const xs = p.points.map((q) => q.x);
  const ys = p.points.map((q) => q.y);
  const xDom: [number, number] = [Math.floor(Math.min(...xs) - 1), Math.ceil(Math.max(...xs) + 1)];
  const yDom: [number, number] = [Math.floor(Math.min(...ys) - 0.5), Math.ceil(Math.max(...ys) + 0.5)];
  const xFrac = (x: number) => (x - xDom[0]) / Math.max(1e-9, xDom[1] - xDom[0]);
  const [ax, ay] = p.axes;
  const axisName = (a: DayMapPanel['axes'][number], pc: string) => `${pc} (อธิบาย ${a.explained}% ของความแปรปรวน) ≈ ${a.top.slice(0, 2).map((t) => t.feature).join(' + ')}`;
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<MapPoint>;
    const pt = payload?.[0]?.payload;
    if (!active || !pt || pt.date === undefined) return null;
    const c = p.clusters[pt.c];
    return <TipBox title={thDate(pt.date)} rows={[{ label: 'กลุ่ม', value: `${c.id + 1} · ${c.label}` }]} />;
  };
  const legend: LegendItem[] = [
    { label: `กลุ่ม ${selected + 1} (ที่เลือก)`, color: BLUE, shape: 'box' },
    { label: 'วันอื่น', color: CONTEXT, shape: 'box' },
    { label: `5 วันล่าสุด → ${thDate(latest.date)}`, color: ORANGE },
  ];
  return (
    <ChartFrame
      title={`แผนที่วันซื้อขาย: ${p.points.length} วัน · PCA 2 มิติ · k-means ${p.clusters.length} กลุ่ม`}
      height={380}
      legend={legend}
      label={`แผนที่วันซื้อขาย ${p.points.length} วัน แบ่ง ${p.clusters.length} กลุ่ม: ${p.clusters.map((c) => `${c.id + 1}) ${c.label} ${c.share}%`).join(', ')} · 5 วันล่าสุดอยู่กลุ่ม ${p.recent.map((r) => r.c + 1).join(', ')}`}
      note={`แกนนอน = ${axisName(ax, 'PC1')} · แกนตั้ง = ${axisName(ay, 'PC2')} · กดชื่อกลุ่มในตารางเพื่อไฮไลต์`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name="PC1" tick={AXIS} stroke={BASELINE} domain={xDom} ticks={niceTicks(xDom[0], xDom[1])} />
          <YAxis type="number" dataKey="y" name="PC2" tick={AXIS} width={28} stroke={BASELINE} domain={yDom} ticks={niceTicks(yDom[0], yDom[1], 4)} />
          <ReferenceLine x={0} stroke={BASELINE} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={tip} cursor={false} isAnimationActive={false} />
          <Scatter data={rest} isAnimationActive={false} shape={(props: unknown) => PointShape(props, 'rgba(113,113,122,0.55)', 2.5)} />
          <Scatter data={sel} isAnimationActive={false} shape={(props: unknown) => PointShape(props, BLUE, 3)} />
          <Scatter
            data={p.recent}
            isAnimationActive={false}
            line={{ stroke: ORANGE, strokeWidth: 1.5 }}
            shape={(props: unknown) => {
              const { cx = 0, cy = 0, payload } = props as { cx?: number; cy?: number; payload?: MapPoint };
              const isLast = payload?.date === latest.date;
              return <circle cx={cx} cy={cy} r={isLast ? 7 : 3} fill={ORANGE} stroke={SURFACE} strokeWidth={isLast ? 2 : 1} />;
            }}
          />
          {p.clusters.map((c) => (
            <ReferenceDot key={c.id} x={c.cx} y={c.cy} r={0} fill="none" stroke="none" label={clusterLabel(c, c.id === selected, center, xFrac(c.cx))} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** ลักษณะเด่นของกลุ่ม: ค่ากลางแบบ z ของทุกตัวแปร (แท่งเบนจาก 0 · ±2σ = เต็ม) */
export function ClusterProfile({ p, selected }: { p: DayMapPanel; selected: number }) {
  const c = p.clusters[selected];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        ลักษณะของกลุ่ม {c.id + 1}: {c.label}
      </p>
      <div role="img" aria-label={`ค่ากลางของกลุ่ม ${c.id + 1} (หน่วย σ): ${p.features.map((f, j) => `${f} ${signedFmt(c.profile[j], 1)}`).join(', ')}`} className="space-y-1">
        {p.features.map((f, j) => {
          const z = c.profile[j];
          const w = Math.min(50, (Math.abs(z) / 2) * 50);
          return (
            <div key={f} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-[11px]">
              <span className="truncate text-zinc-300">{f}</span>
              <span className="relative h-3" aria-hidden>
                <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                <span
                  className="absolute inset-y-0.5"
                  style={z >= 0 ? { left: '50%', width: `${w}%`, background: DIV_POS[3], borderRadius: '0 2px 2px 0' } : { right: '50%', width: `${w}%`, background: DIV_NEG[3], borderRadius: '2px 0 0 2px' }}
                />
              </span>
              <span className="text-right font-mono text-zinc-100">{signedFmt(z, 1)}σ</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── 5) ด่านที่บล็อกสัญญาณ ───────────────────────────

type GateMonth = GateBlockPanel['months'][number];

/** ป้ายแกนเดือน 2 บรรทัด: เดือน · จำนวนหุ้น-วัน (หรือวัน) ของเดือนนั้น */
function monthTotalTick(totals: Map<string, number>) {
  return function MonthTotalTick(props: unknown) {
    const { x = 0, y = 0, payload } = props as { x?: number; y?: number; payload?: { value: string } };
    const m = payload?.value ?? '';
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={10} textAnchor="middle" fill={INK_MUTED} fontSize={10}>
          {m ? thMonthTick(m) : ''}
        </text>
        <text dy={22} textAnchor="middle" fill="#71717a" fontSize={9}>
          {totals.has(m) ? intFmt(totals.get(m)!) : ''}
        </text>
      </g>
    );
  };
}

export function GateShareChart({ p }: { p: GateBlockPanel }) {
  const data = p.months.map((m) => ({ ...m.shares, month: m.month, raw: m }));
  const totals = new Map(p.months.map((m) => [m.month, m.total]));
  const legend: LegendItem[] = p.categories.map((c, k) => ({ label: c.label, color: CATEGORICAL[k], shape: 'box', value: `${p.overall.shares[c.key].toFixed(1)}%` }));
  const unit = p.scope === 'ALL' ? 'หุ้น-วัน' : 'วัน';
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<{ raw: GateMonth }>;
    const m = payload?.[0]?.payload?.raw;
    if (!active || !m) return null;
    return (
      <TipBox
        title={`${thMonthTick(m.month)} · ${m.total.toLocaleString('en-US')} ${unit}`}
        rows={[...p.categories].reverse().map((c) => ({
          label: c.label,
          color: CATEGORICAL[p.categories.indexOf(c)],
          value: `${m.shares[c.key].toFixed(1)}% (${m.counts[c.key]})`,
        }))}
      />
    );
  };
  return (
    <ChartFrame
      title={`สัดส่วน${unit}ตามด่านแรกที่ไม่ผ่าน รายเดือน — ${p.label}`}
      height={270}
      legend={legend}
      label={`ด่านแรกที่ไม่ผ่านของ${p.label} ทั้งช่วง: ${p.categories.map((c) => `${c.label} ${p.overall.shares[c.key].toFixed(1)}%`).join(', ')}`}
      note={`ตัวเลขในแท่ง = % ของ${unit}ในเดือนนั้น · ใต้เดือน = จำนวน${unit}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="12%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" height={36} tick={monthTotalTick(totals)} interval={data.length > 18 ? 2 : 0} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {p.categories.map((c, k) => (
            <Bar key={c.key} dataKey={c.key} name={c.label} stackId="g" fill={CATEGORICAL[k]} stroke={SURFACE} strokeWidth={1} isAnimationActive={false} maxBarSize={30}>
              <LabelList dataKey={c.key} content={segmentPct(CATEGORICAL[k], 9)} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SignalCountChart({ p }: { p: GateBlockPanel }) {
  const signal = CATEGORICAL[p.categories.findIndex((c) => c.key === 'SIGNAL')];
  const data = p.months.map((m) => ({ month: m.month, pullback: m.pullback, momentum: m.momentum, total: m.pullback + m.momentum }));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<(typeof data)[number]>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={thMonthTick(r.month)}
        rows={[
          { label: 'สัญญาณทั้งหมด', value: String(r.total), color: signal },
          { label: 'pullback (ผ่านครบ 5 ด่าน)', value: String(r.pullback) },
          { label: 'momentum (G1–G4 + breakout)', value: String(r.momentum) },
        ]}
      />
    );
  };
  const totalLabel = (props: unknown) => {
    const { x, y, width, index } = props as { x?: number; y?: number; width?: number; index?: number };
    if (x === undefined || y === undefined || width === undefined || index === undefined || !data[index].total) return null;
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill={INK} fontSize={9.5} fontFamily="ui-monospace, monospace">
        {data[index].total}
      </text>
    );
  };
  const legend: LegendItem[] = [
    { label: 'pullback (ทึบ)', color: signal, shape: 'box', value: String(p.overall.pullback) },
    { label: 'momentum (โปร่ง)', color: signal, shape: 'outline', value: String(p.overall.momentum) },
  ];
  return (
    <ChartFrame
      title="สัญญาณเข้าซื้อต่อเดือน (ครั้ง)"
      height={170}
      legend={legend}
      label={`สัญญาณเข้าซื้อรวม ${p.overall.counts.SIGNAL} ครั้ง: pullback ${p.overall.pullback} · momentum ${p.overall.momentum}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={24} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} allowDecimals={false} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="pullback" stackId="s" fill={signal} isAnimationActive={false} maxBarSize={26} />
          <Bar dataKey="momentum" stackId="s" fill={SURFACE} stroke={signal} strokeWidth={1.5} isAnimationActive={false} maxBarSize={26}>
            <LabelList dataKey="momentum" content={totalLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
