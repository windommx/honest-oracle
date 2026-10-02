'use client';

/**
 * หน้า "จังหวะตลาด" (หุ้นไทย) — 5 แผงที่ดัดแปลงจากกราฟวิเคราะห์จังหวะการทำงาน:
 *  1) หุ้นเคลื่อนแรงพร้อมกัน + ความกว้างของตลาด + ปฏิทิน breadth   (← ความพร้อมกันของงาน)
 *  2) ฤดูกาลของผลตอบแทน วัน × เดือน (SET proxy หรือหุ้นที่เลือก)     (← heatmap ชั่วโมง × วัน)
 *  3) สัดส่วนมูลค่าซื้อขายรายหมวด rolling + รายเดือน + N_eff           (← สัดส่วน model)
 *  4) แผนที่วันซื้อขาย PCA + k-means — วันนี้คล้ายวันแบบไหน            (← แผนที่ความหมาย)
 *  5) ด่านแรกที่บล็อกสัญญาณรายเดือน (ทุกหุ้น หรือหุ้นที่เลือก)           (← ใครเริ่ม turn)
 * หัวข้อของแต่ละแผง = ข้อค้นพบจากตัวเลข (สร้างที่ server ด้วยกฎตายตัว ไม่ใช้ LLM)
 */

import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { sectorLabel, thDate } from '@/lib/flows/format';
import type { FlowEntitiesResponse } from '@/lib/flows/types';
import type { DayMapPanel, RhythmResponse } from '@/lib/rhythm/types';
import { cn } from '@/lib/utils';
import {
  BreadthCalendar,
  BreadthChart,
  BreadthMonthHeat,
  CATEGORICAL,
  ClusterProfile,
  DayMapChart,
  ExtremeChart,
  ExtremeMonthlyChart,
  GateShareChart,
  SeasonalityHeatmap,
  SectorMonthlyPairs,
  SectorShareChart,
  SignalCountChart,
} from './rhythm-charts';

const MARKET_ID = 'SET';
const signedFmt = (v: number | null, digits = 2) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`);

const PANELS = [
  { id: 'rhythm-breadth', name: 'หุ้นเคลื่อนพร้อมกัน & ความกว้างของตลาด' },
  { id: 'rhythm-season', name: 'ฤดูกาลของผลตอบแทน (วัน × เดือน)' },
  { id: 'rhythm-sectors', name: 'สัดส่วนมูลค่าซื้อขายรายหมวด' },
  { id: 'rhythm-daymap', name: 'แผนที่วันซื้อขาย' },
  { id: 'rhythm-gates', name: 'อะไรบล็อกสัญญาณ' },
] as const;

function Panel({ index, finding, summary, basis, children }: { index: number; finding: string; summary: string; basis: string; children: ReactNode }) {
  const { id, name } = PANELS[index];
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-4">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {index + 1} · {name}
        </p>
        <h3 id={`${id}-h`} className="mt-0.5 text-sm font-semibold leading-snug text-zinc-50">
          {finding}
        </h3>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-300">{summary}</p>
      </header>
      {children}
      <p className="text-[11px] leading-relaxed text-zinc-400">{basis}</p>
    </section>
  );
}

function ClusterTable({ p, selected, onSelect }: { p: DayMapPanel; selected: number; onSelect: (id: number) => void }) {
  const th = 'px-2 py-1.5 text-right font-medium';
  const num = 'px-2 py-1.5 text-right font-mono';
  return (
    <div tabIndex={0} role="region" aria-label="ตารางกลุ่มของวันซื้อขาย" className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[460px] text-[11px]">
        <caption className="sr-only">
          กลุ่มของวันซื้อขาย: สัดส่วนวัน ผลตอบแทน SET proxy วันนั้น สัดส่วนหุ้นที่ปิดบวก และผลตอบแทน 5 วันถัดไป (สถิติย้อนหลังในตัวอย่าง)
        </caption>
        <thead className="bg-zinc-900 text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">
              กลุ่ม (กดเพื่อไฮไลต์)
            </th>
            <th scope="col" className={th}>% วัน</th>
            <th scope="col" className={th}>SET วันนั้น</th>
            <th scope="col" className={th}>หุ้นบวก</th>
            <th scope="col" className={th}>SET +5 วัน</th>
            <th scope="col" className={th}>บวก (n)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {p.clusters.map((c) => {
            const on = c.id === selected;
            return (
              <tr key={c.id} className={cn(on && 'bg-zinc-800/60')}>
                <th scope="row" className="px-1 py-1 text-left font-normal">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      'flex min-h-7 w-full items-center gap-1.5 rounded border-l-2 px-1.5 text-left text-zinc-200 hover:bg-zinc-800',
                      on ? 'border-[#3987e5] font-semibold text-zinc-50' : 'border-transparent',
                    )}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-400 font-mono text-[10px]">{c.id + 1}</span>
                    <span>{c.label}</span>
                    {c.id === p.latest.cluster && (
                      <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 px-1 text-[10px] font-normal text-zinc-200">
                        <span className="h-2 w-2 rounded-full" style={{ background: CATEGORICAL[1] }} aria-hidden />
                        วันล่าสุด
                      </span>
                    )}
                  </button>
                </th>
                <td className={cn(num, 'text-zinc-100')}>{c.share.toFixed(1)}%</td>
                <td className={num}>{signedFmt(c.avgRet)}%</td>
                <td className={num}>{c.pctUp.toFixed(0)}%</td>
                <td className={cn(num, 'text-zinc-100')}>{signedFmt(c.fwd5)}%</td>
                <td className={cn(num, 'whitespace-nowrap')}>
                  {c.fwdUp ?? '—'}% <span className="text-zinc-400">({c.nFwd})</span>
                </td>
              </tr>
            );
          })}
          <tr className="bg-zinc-900/60">
            <th scope="row" className="px-2 py-1.5 text-left font-medium text-zinc-300">
              ทั้งช่วง (ฐานเปรียบเทียบ)
            </th>
            <td className={num}>100%</td>
            <td className={num}>—</td>
            <td className={num}>—</td>
            <td className={cn(num, 'text-zinc-100')}>{signedFmt(p.baseline.fwd5)}%</td>
            <td className={cn(num, 'whitespace-nowrap')}>
              {p.baseline.fwdUp ?? '—'}% <span className="text-zinc-400">({p.baseline.nFwd})</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function RhythmView() {
  const [symbol, setSymbol] = useState(MARKET_ID);
  const [picked, setPicked] = useState<number | null>(null);
  const list = useApi<FlowEntitiesResponse>('/api/flows');
  const q = useApi<RhythmResponse>(`/api/rhythm?symbol=${encodeURIComponent(symbol)}`);
  const d = q.data;
  const selected = picked ?? d?.dayMap.latest.cluster ?? 0;
  const synthetic = d ? d.data.kind !== 'real' : false;

  return (
    <div className="@container min-w-0 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-50">จังหวะตลาด – หุ้นไทย</h2>
          <p className="text-xs text-zinc-400">
            {d
              ? `หุ้น ${d.breadth.nStocks} ตัว · ${thDate(d.start)} – ${thDate(d.asOf)} (${d.nDays} วันทำการ) · ข้อมูลชุดเดียวกับ Terminal / Decision`
              : 'ความพร้อมกัน · ฤดูกาล · สัดส่วนรายหมวด · แผนที่วันซื้อขาย · ด่านสัญญาณ'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="rhythm-symbol" className="text-xs text-zinc-300">
            ฤดูกาล + ด่านสัญญาณของ
          </label>
          <select
            id="rhythm-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="h-8 max-w-[16rem] rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
          >
            <option value={MARKET_ID}>SET — ทั้งตลาด / ทุกหุ้น</option>
            {list.data?.sectors.map((g) => (
              <optgroup key={g.sector} label={sectorLabel(g.sector)}>
                {g.stocks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </header>

      {d && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-xs leading-relaxed',
            synthetic ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-zinc-700 bg-zinc-900/60 text-zinc-200',
          )}
        >
          <strong>{d.data.label}</strong>
          {synthetic && ' — รูปแบบในหน้านี้มาจากข้อมูลจำลอง ใช้สาธิตวิธีอ่านกราฟเท่านั้น ไม่ใช่พฤติกรรมจริงของตลาดหุ้นไทย'} · สถิติทั้งหมดเป็นการมองย้อนหลัง ไม่ใช่คำแนะนำการลงทุน
        </p>
      )}

      {q.error ? (
        <p role="alert" className="text-sm text-rose-300">
          โหลดจังหวะตลาดไม่สำเร็จ: {q.error}
        </p>
      ) : !d ? (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังคำนวณจังหวะตลาด…
        </p>
      ) : (
        <>
          <nav aria-label="สรุปข้อค้นพบ" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <h3 className="mb-1.5 text-xs font-semibold text-zinc-200">สรุปจากตัวเลข (กดเพื่อไปที่แผง)</h3>
            <ol className="space-y-1 text-xs leading-relaxed">
              {[d.breadth.title, d.seasonality.title, d.sectors.title, d.dayMap.title, d.gates.title].map((t, i) => (
                <li key={PANELS[i].id} className="flex gap-2">
                  <span className="font-mono text-zinc-400">{i + 1}.</span>
                  <a href={`#${PANELS[i].id}`} className="block min-h-6 py-0.5 text-zinc-200 underline-offset-2 hover:text-zinc-50 hover:underline">
                    {t}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <Panel index={0} finding={d.breadth.title} summary={d.breadth.summary} basis={d.breadth.basis}>
            <BreadthChart p={d.breadth} />
            <ExtremeChart p={d.breadth} />
            <div className="grid gap-3 @min-[1100px]:grid-cols-2">
              <ExtremeMonthlyChart p={d.breadth} />
              <BreadthMonthHeat p={d.breadth} />
            </div>
            <BreadthCalendar p={d.breadth} />
          </Panel>

          <Panel index={1} finding={d.seasonality.title} summary={d.seasonality.summary} basis={d.seasonality.basis}>
            <SeasonalityHeatmap p={d.seasonality} />
          </Panel>

          <Panel index={2} finding={d.sectors.title} summary={d.sectors.summary} basis={d.sectors.basis}>
            <SectorShareChart p={d.sectors} />
            <SectorMonthlyPairs p={d.sectors} />
          </Panel>

          <Panel index={3} finding={d.dayMap.title} summary={d.dayMap.summary} basis={d.dayMap.basis}>
            <div className="grid gap-3 @min-[1100px]:grid-cols-2">
              <DayMapChart p={d.dayMap} selected={selected} />
              <div className="min-w-0 space-y-3">
                <ClusterTable p={d.dayMap} selected={selected} onSelect={setPicked} />
                <ClusterProfile p={d.dayMap} selected={selected} />
              </div>
            </div>
          </Panel>

          <Panel index={4} finding={d.gates.title} summary={d.gates.summary} basis={d.gates.basis}>
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-3">
                <GateShareChart p={d.gates} />
                <SignalCountChart p={d.gates} />
              </div>
              <dl className="grid content-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[11px]">
                {d.gates.categories.map((c, k) => (
                  <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
                    <dt className="flex items-center gap-2 font-medium text-zinc-200">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORICAL[k] }} aria-hidden />
                      {c.label}
                    </dt>
                    <dd className="font-mono text-zinc-100">{d.gates.overall.shares[c.key].toFixed(1)}%</dd>
                    <dd className="col-span-2 pl-[1.125rem] text-zinc-400">{c.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
