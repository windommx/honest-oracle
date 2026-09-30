'use client';

/**
 * กราฟของหน้า "จังหวะตลาด" — ดัดแปลงกราฟวิเคราะห์จังหวะการทำงาน 5 แบบมาใช้กับหุ้นไทย
 * สี: categorical ช่อง 1–6 ตามลำดับคงที่ (validator: adjacent CVD ΔE ≥ 8.4 · normal ΔE ≥ 19.3 บนพื้น #0f0f11)
 *     แผนที่วัน (scatter = ทุกคู่เห็นกัน) ใช้แค่ 2 สี: กลุ่มที่เลือก + วันล่าสุด (all-pairs ΔE 26.8) ที่เหลือเป็นเทา
 *     heatmap = diverging น้ำเงิน ↔ แดง จุดกลางเทา (ไล่ใน OKLab ความสว่างเท่ากันทั้งสองฝั่งต่อขั้น)
 * ข้อความเป็นสีหมึกเสมอ · ทุกกราฟมี role="img" + aria-label สรุป · heatmap มีตารางข้อมูลให้เปิดดู
 */

import { Fragment, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { AXIS, BASELINE, ChartFrame, GRID, RoundedEndBar, SURFACE, TOOLTIP, type LegendItem } from '@/components/charts/chart-kit';
import { TH_MONTH, thDate, thMonthTick } from '@/lib/flows/format';
import type { BreadthPanel, DayMapPanel, GateBlockPanel, SeasonalityPanel, SectorPanel } from '@/lib/rhythm/types';
import { cn } from '@/lib/utils';

/** ช่อง categorical 1–6 (โหมดมืด) — ลำดับคงที่ สีผูกกับตัวตน ไม่ใช่อันดับ */
export const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const BLUE = CATEGORICAL[0];
const ORANGE = CATEGORICAL[1];
/** เทาสำหรับข้อมูลบริบท (ลดความเด่น) */
const CONTEXT = '#71717a';
const DIV_MID = '#383835';
const DIV_POS = ['#414f5e', '#49678a', '#507fb7', '#5598e7'];
const DIV_NEG = ['#624541', '#8c524e', '#b85d5a', '#e66767'];
const INK = '#f4f4f5';

const signedFmt = (v: number, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;

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

function DivergingLegend({ neg, pos, note }: { neg: string; pos: string; note?: string }) {
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

interface TipItem<T> {
  payload?: T;
  value?: number | string;
  name?: string;
  color?: string;
}
interface TipProps<T> {
  active?: boolean;
  payload?: Array<TipItem<T>>;
  label?: string | number;
}

function TipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: string; color?: string }> }) {
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

// ─────────────────────────── 1) หุ้นเคลื่อนแรงพร้อมกัน + ความกว้าง ───────────────────────────

export function ExtremeChart({ p }: { p: BreadthPanel }) {
  const L = p.days[p.days.length - 1];
  const legend: LegendItem[] = [
    { label: 'รายวัน', color: CONTEXT, shape: 'box', value: String(L.extreme) },
    { label: 'เฉลี่ย 20 วัน', color: BLUE, value: L.extremeMean20.toFixed(1) },
    { label: 'p90 ของเดือน', color: ORANGE, value: L.extremeP90m.toFixed(1) },
  ];
  const spikeText = p.spikes.map((s, i) => `${i + 1}) ${thDate(s.date)} ${s.extreme}/${p.nStocks} ตัว SET ${signedFmt(s.marketRet)}%`).join(' · ');
  return (
    <ChartFrame
      title={`หุ้นที่เคลื่อนแรงผิดปกติพร้อมกัน (ตัว/วัน จาก ${p.nStocks} ตัว)`}
      height={200}
      legend={legend}
      label={`จำนวนหุ้นที่เคลื่อนแรงผิดปกติต่อวัน: ล่าสุด ${L.extreme} ตัว เฉลี่ย 20 วัน ${L.extremeMean20.toFixed(1)} · วันพุ่ง: ${spikeText || 'ไม่มี'}`}
      note={
        p.spikes.length > 0 && (
          <ol className="mt-1 space-y-0.5">
            {p.spikes.map((s, i) => (
              <li key={s.date} className="flex flex-wrap items-center gap-x-1.5">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 font-mono text-[10px] text-zinc-100">{i + 1}</span>
                <span className="text-zinc-200">{thDate(s.date)}</span>
                <span>
                  {s.extreme}/{p.nStocks} ตัว ({s.share}%) · SET <span className="font-mono text-zinc-200">{signedFmt(s.marketRet)}%</span> · breadth {s.breadth.toFixed(0)}%
                </span>
              </li>
            ))}
          </ol>
        )
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={p.days} syncId="rhythm-breadth" margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={32} allowDecimals={false} stroke={BASELINE} domain={[0, 'dataMax']} />
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
              r={8}
              fill={SURFACE}
              stroke={INK}
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{ value: String(i + 1), position: 'center', fill: INK, fontSize: 10, fontWeight: 600 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function BreadthChart({ p }: { p: BreadthPanel }) {
  const L = p.days[p.days.length - 1];
  const legend: LegendItem[] = [
    { label: 'รายวัน', color: CONTEXT, value: `${L.breadth.toFixed(0)}%` },
    { label: 'เฉลี่ย 20 วัน', color: BLUE, value: `${L.breadthMean20.toFixed(0)}%` },
    { label: 'ช่วง risk-off', color: 'rgba(255,255,255,0.16)', shape: 'box' },
  ];
  return (
    <ChartFrame
      title="ความกว้างของตลาด (% หุ้นปิดเหนือ MA20)"
      height={180}
      legend={legend}
      label={`ความกว้างของตลาดล่าสุด ${L.breadth.toFixed(0)}% เฉลี่ย 20 วัน ${L.breadthMean20.toFixed(0)}% · ช่วง risk-off ${p.riskOffSpans.length} ช่วง`}
      note={p.regimeShift && `จุดเปลี่ยนล่าสุด ${thDate(p.regimeShift.date)} (${p.regimeShift.daysAgo} วันทำการก่อน): ${p.regimeShift.note}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={p.days} syncId="rhythm-breadth" margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          {p.riskOffSpans.map((s) => (
            <ReferenceArea key={s.start} x1={s.start} x2={s.end} fill="#ffffff" fillOpacity={0.07} ifOverflow="hidden" />
          ))}
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={32} stroke={BASELINE} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
          <ReferenceLine y={50} stroke={BASELINE} />
          {p.regimeShift && (
            <ReferenceLine
              x={p.regimeShift.date}
              stroke="#a1a1aa"
              label={{ value: p.regimeShift.to === 'risk_on' ? 'risk-on' : 'risk-off', position: 'insideTopRight', fill: '#d4d4d8', fontSize: 10 }}
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
      <div
        tabIndex={0}
        role="region"
        aria-label="ปฏิทินความกว้างของตลาด เลื่อนดูในแนวนอนได้"
        className="overflow-x-auto pb-1"
      >
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

function MarginBar({ v, max, vertical }: { v: number | null; max: number; vertical: boolean }) {
  if (v === null || max <= 0) return <span />;
  const pct = Math.min(50, (Math.abs(v) / max) * 50);
  const color = v >= 0 ? DIV_POS[3] : DIV_NEG[3];
  return vertical ? (
    <span className="relative block h-9 w-full" aria-hidden>
      <span className="absolute inset-x-0 top-1/2 h-px bg-zinc-600" />
      <span
        className="absolute left-1/2 w-2/3 -translate-x-1/2"
        style={v >= 0 ? { bottom: '50%', height: `${pct}%`, background: color, borderRadius: '2px 2px 0 0' } : { top: '50%', height: `${pct}%`, background: color, borderRadius: '0 0 2px 2px' }}
      />
    </span>
  ) : (
    <span className="relative block h-full min-h-4 w-full" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
      <span
        className="absolute top-1/2 h-2/3 -translate-y-1/2"
        style={v >= 0 ? { left: '50%', width: `${pct}%`, background: color, borderRadius: '0 2px 2px 0' } : { right: '50%', width: `${pct}%`, background: color, borderRadius: '2px 0 0 2px' }}
      />
    </span>
  );
}

export function SeasonalityHeatmap({ p }: { p: SeasonalityPanel }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const values = p.cells.flat().flatMap((c) => (c.value === null ? [] : [c.value]));
  const max = robustMax(values);
  const marginMax = Math.max(...[...p.byMonth, ...p.byWeekday].map((m) => Math.abs(m.mean ?? 0)), 1e-9);
  const cell = hover ? p.cells[hover.r][hover.c] : null;
  const fmt = (v: number | null) => (v === null ? '—' : `${signedFmt(v, 2)}%`);
  const stat = (m: SeasonalityPanel['byMonth'][number]) =>
    m.mean === null ? 'ไม่มีข้อมูล' : `${fmt(m.mean)}/วัน · บวก ${m.upPct}% · t=${m.tStat?.toFixed(1) ?? '—'} · n=${m.n}`;
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
            ชี้ที่ช่องเพื่อดูค่า · เฉลี่ยทุกวัน <span className="font-mono text-zinc-50">{fmt(p.overallMean)}</span>/วัน · ขอบขวา = รายวันในสัปดาห์ · ขอบล่าง = รายเดือน
          </>
        )}
      </p>
      <div tabIndex={0} role="region" aria-label="heatmap ฤดูกาลของผลตอบแทน เลื่อนดูในแนวนอนได้" className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`${p.label}: ${p.byMonth.map((m) => `${m.label} ${fmt(m.mean)}`).join(', ')} · ${p.byWeekday.map((m) => `${m.label} ${fmt(m.mean)}`).join(', ')}`}
          className="grid min-w-[600px] max-w-5xl gap-[2px]"
          style={{ gridTemplateColumns: '2.25rem repeat(12, minmax(0, 1fr)) 6.5rem' }}
          onMouseLeave={() => setHover(null)}
        >
          <span />
          {p.cols.map((m) => (
            <span key={m} className="truncate text-center text-[10px] text-zinc-400">
              {m}
            </span>
          ))}
          <span className="text-center text-[10px] text-zinc-400">เฉลี่ย</span>
          {p.rows.map((wd, r) => (
            <Fragment key={wd}>
              <span className="self-center text-[10px] text-zinc-400">{wd}</span>
              {p.cells[r].map((c, ci) => (
                <span
                  key={p.cols[ci]}
                  className={cn('h-9 rounded-[3px]', hover && hover.r === r && hover.c === ci && 'outline outline-1 outline-zinc-100')}
                  style={{ background: c.value === null ? 'transparent' : divergingColor(c.value, max), opacity: c.n > 0 && c.n < 5 ? 0.5 : 1 }}
                  onMouseEnter={() => setHover({ r, c: ci })}
                />
              ))}
              <span className="flex items-center gap-1 pl-1" title={stat(p.byWeekday[r])}>
                <MarginBar v={p.byWeekday[r].mean} max={marginMax} vertical={false} />
                <span className="w-11 shrink-0 text-right font-mono text-[10px] text-zinc-300">{p.byWeekday[r].mean === null ? '—' : signedFmt(p.byWeekday[r].mean!, 2)}</span>
              </span>
            </Fragment>
          ))}
          <span className="self-center text-[10px] text-zinc-400">เฉลี่ย</span>
          {p.byMonth.map((m) => (
            <span key={m.label} title={stat(m)} className="flex flex-col items-center">
              <MarginBar v={m.mean} max={marginMax} vertical />
              <span className="font-mono text-[10px] leading-tight text-zinc-300">{m.mean === null ? '—' : signedFmt(m.mean, 2)}</span>
            </span>
          ))}
          <span className="self-end pl-1 text-[10px] leading-tight text-zinc-400">%/วัน</span>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <DivergingLegend neg={`ลบ (≤ −${max.toFixed(2)}%)`} pos={`บวก (≥ +${max.toFixed(2)}%)`} note="ช่องจาง = ตัวอย่างน้อยกว่า 5 วัน" />
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

export function SectorShareChart({ p }: { p: SectorPanel }) {
  const data = p.rolling.map((r) => ({ date: r.date, ...Object.fromEntries(r.shares.map((v, k) => [`s${k}`, v])) }));
  const legend: LegendItem[] = p.sectors.map((s, k) => ({ label: s.label, color: CATEGORICAL[k], shape: 'box', value: `${p.latest.shares[k].toFixed(0)}%` }));
  return (
    <ChartFrame
      title="สัดส่วนมูลค่าซื้อขายรายหมวด (สะสม 20 วัน)"
      height={220}
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
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

interface MonthRow {
  month: string;
  nEff: number | null;
  net: number[] | null;
  shares: number[];
  [key: string]: unknown;
}

/** ป้ายแกนเดือน 2 บรรทัด: เดือน · N_eff ของเดือนนั้น */
function MonthTick(props: unknown, nEffByMonth: Map<string, number | null>) {
  const { x = 0, y = 0, payload } = props as { x?: number; y?: number; payload?: { value: string } };
  const ym = payload?.value ?? '';
  const mm = Number(ym.slice(5, 7));
  const n = nEffByMonth.get(ym);
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={10} textAnchor="middle" fill="#a1a1aa" fontSize={10}>
        {mm ? TH_MONTH[mm - 1] : ''}
      </text>
      <text dy={23} textAnchor="middle" fill="#e4e4e7" fontSize={10} fontFamily="ui-monospace, monospace">
        {n === null || n === undefined ? '' : n.toFixed(1)}
      </text>
    </g>
  );
}

export function SectorMonthlyChart({ p, measure }: { p: SectorPanel; measure: 'value' | 'flow' }) {
  const rows: MonthRow[] = p.monthly.map((m) => {
    const shares = (measure === 'value' ? m.value : m.flow) ?? [];
    return {
      month: m.month,
      nEff: measure === 'value' ? m.nEffValue : m.nEffFlow,
      net: m.flowNet,
      shares,
      ...Object.fromEntries(shares.map((v, k) => [`s${k}`, v])),
    };
  });
  const nEffByMonth = new Map(rows.map((r) => [r.month, r.nEff]));
  const last = rows[rows.length - 1];
  const title = measure === 'value' ? 'รายเดือน: สัดส่วนมูลค่าซื้อขาย' : 'รายเดือน: สัดส่วนขนาดเงินไหลสุทธิสถาบัน';
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<MonthRow>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={`${thMonthTick(r.month)} · N_eff ${r.nEff?.toFixed(2) ?? '—'}`}
        rows={p.sectors.map((s, k) => ({
          label: s.label,
          color: CATEGORICAL[k],
          value: `${r.shares[k]?.toFixed(1) ?? '—'}%${measure === 'flow' && r.net ? ` · สุทธิ ${signedFmt(r.net[k], 0)} ลบ.` : ''}`,
        }))}
      />
    );
  };
  return (
    <ChartFrame
      title={title}
      height={210}
      label={`${title} ${rows.length} เดือนล่าสุด · เดือนล่าสุด ${last ? p.sectors.map((s, k) => `${s.label} ${last.shares[k]?.toFixed(1)}%`).join(', ') : '—'} · N_eff ${last?.nEff?.toFixed(1) ?? '—'}`}
      note={`${rows.length ? `${thMonthTick(rows[0].month)} – ${thMonthTick(rows[rows.length - 1].month)} · ` : ''}ตัวเลขใต้ชื่อเดือน = N_eff (จำนวนหมวดที่มีน้ำหนักจริง)`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" interval={0} height={40} stroke={BASELINE} tick={(props: unknown) => MonthTick(props, nEffByMonth)} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {p.sectors.map((s, k) => (
            <Bar key={s.key} dataKey={`s${k}`} name={s.label} stackId="m" fill={CATEGORICAL[k]} stroke={SURFACE} strokeWidth={1} isAnimationActive={false} maxBarSize={30} />
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

export function DayMapChart({ p, selected }: { p: DayMapPanel; selected: number }) {
  const sel = p.points.filter((pt) => pt.c === selected);
  const rest = p.points.filter((pt) => pt.c !== selected);
  const latest = p.points[p.points.length - 1];
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
    { label: `วันล่าสุด ${thDate(latest.date)}`, color: ORANGE, shape: 'box' },
  ];
  return (
    <ChartFrame
      title="แผนที่วันซื้อขาย (PCA 2 มิติ · k-means 5 กลุ่ม)"
      height={340}
      legend={legend}
      label={`แผนที่วันซื้อขาย ${p.points.length} วัน แบ่ง 5 กลุ่ม: ${p.clusters.map((c) => `${c.id + 1}) ${c.label} ${c.share}%`).join(', ')} · วันล่าสุดอยู่กลุ่ม ${latest.c + 1}`}
      note={`แกนนอน = ${axisName(ax, 'PC1')} · แกนตั้ง = ${axisName(ay, 'PC2')} · วงกลมตัวเลข = จุดศูนย์กลางของกลุ่ม · กดชื่อกลุ่มในตารางเพื่อไฮไลต์`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name="PC1" tick={AXIS} stroke={BASELINE} domain={['dataMin - 0.3', 'dataMax + 0.3']} tickFormatter={(v: number) => v.toFixed(0)} />
          <YAxis type="number" dataKey="y" name="PC2" tick={AXIS} width={28} stroke={BASELINE} domain={['dataMin - 0.3', 'dataMax + 0.3']} tickFormatter={(v: number) => v.toFixed(0)} />
          <ReferenceLine x={0} stroke={BASELINE} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={tip} cursor={false} isAnimationActive={false} />
          <Scatter data={rest} isAnimationActive={false} shape={(props: unknown) => PointShape(props, 'rgba(113,113,122,0.55)', 2.5)} />
          <Scatter data={sel} isAnimationActive={false} shape={(props: unknown) => PointShape(props, BLUE, 3)} />
          <Scatter
            data={[latest]}
            isAnimationActive={false}
            shape={(props: unknown) => {
              const { cx = 0, cy = 0 } = props as { cx?: number; cy?: number };
              return <circle cx={cx} cy={cy} r={7} fill={ORANGE} stroke={SURFACE} strokeWidth={2} />;
            }}
          />
          {p.clusters.map((c) => (
            <ReferenceDot
              key={c.id}
              x={c.cx}
              y={c.cy}
              r={9}
              fill={SURFACE}
              stroke={c.id === selected ? INK : '#a1a1aa'}
              strokeWidth={c.id === selected ? 2 : 1}
              label={{ value: String(c.id + 1), position: 'center', fill: INK, fontSize: 10, fontWeight: 600 }}
            />
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

export function GateShareChart({ p }: { p: GateBlockPanel }) {
  const data = p.months.map((m) => ({ ...m.shares, month: m.month, raw: m }));
  const legend: LegendItem[] = p.categories.map((c, k) => ({ label: c.label, color: CATEGORICAL[k], shape: 'box', value: `${p.overall.shares[c.key].toFixed(1)}%` }));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<{ raw: GateMonth }>;
    const m = payload?.[0]?.payload?.raw;
    if (!active || !m) return null;
    return (
      <TipBox
        title={`${thMonthTick(m.month)} · ${m.total.toLocaleString('en-US')} ${p.scope === 'ALL' ? 'หุ้น-วัน' : 'วัน'}`}
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
      title={`ด่านแรกที่ไม่ผ่าน รายเดือน — ${p.label}`}
      height={230}
      legend={legend}
      label={`ด่านแรกที่ไม่ผ่านของ${p.label} ทั้งช่วง: ${p.categories.map((c) => `${c.label} ${p.overall.shares[c.key].toFixed(1)}%`).join(', ')}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="14%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={24} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {p.categories.map((c, k) => (
            <Bar key={c.key} dataKey={c.key} name={c.label} stackId="g" fill={CATEGORICAL[k]} stroke={SURFACE} strokeWidth={1} isAnimationActive={false} maxBarSize={26} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SignalCountChart({ p }: { p: GateBlockPanel }) {
  const signal = CATEGORICAL[p.categories.findIndex((c) => c.key === 'SIGNAL')];
  const data = p.months.map((m) => ({ month: m.month, value: m.counts.SIGNAL, pullback: m.pullback, momentum: m.momentum }));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<(typeof data)[number]>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return (
      <TipBox
        title={thMonthTick(r.month)}
        rows={[
          { label: 'สัญญาณทั้งหมด', value: String(r.value), color: signal },
          { label: 'pullback (ผ่านครบ 5 ด่าน)', value: String(r.pullback) },
          { label: 'momentum (G1–G4 + breakout)', value: String(r.momentum) },
        ]}
      />
    );
  };
  return (
    <ChartFrame
      title="สัญญาณเข้าซื้อต่อเดือน (ครั้ง)"
      height={150}
      label={`สัญญาณเข้าซื้อรวม ${p.overall.counts.SIGNAL} ครั้ง: pullback ${p.overall.pullback} · momentum ${p.overall.momentum}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={thMonthTick} minTickGap={24} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} allowDecimals={false} />
          <Tooltip content={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="value" fill={signal} shape={RoundedEndBar} isAnimationActive={false} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

