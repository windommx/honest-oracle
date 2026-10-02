'use client';

/**
 * หน้า "เป้าหมายชนะ 80%" (หุ้นไทย) — ตอบคำถาม "ต้องทำอย่างไรจึงชนะ 80% อย่างมีนัยสำคัญ" ด้วยหลักฐาน ไม่ใช่คำสัญญา
 *  1) คำตัดสิน + เหตุผล  2) แผน 6 ขั้น (ข้อมูลจริง → ค้นหา → ทดสอบครั้งเดียว → ล็อกกติกาออก → ไม้ forward ครบ → ตัดสินครั้งเดียว)
 *  3) กับดักรูปทรง (การสุ่มก็ชนะสูงเมื่อเป้าใกล้)  4) ทุก config เทียบการสุ่ม  5) กรวยการคัด + ตารางผู้ถึงเป้า
 *  6) ตัวที่เลือก/ใกล้ที่สุด: ช่วงค้นหา vs ช่วงทดสอบ  7) จำนวนไม้ forward ที่ต้องใช้  8) วิธีคิด
 */

import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import { signedFmt, StatusBadge } from '@/components/atlas/atlas-charts';
import { useApi } from '@/hooks/use-api';
import { thDate } from '@/lib/flows/format';
import { cn } from '@/lib/utils';
import type { PlanStatus, WinLevel, WinrateResponse } from '@/lib/winrate/types';
import { CompareCard, ConfigScatter, Funnel, pEq, PowerChart, ReachTable, TrapCallout, TrapCharts } from './winrate-charts';

const PLAN_STYLE: Record<PlanStatus, { label: string; icon: LucideIcon; color: string }> = {
  ok: { label: 'ผ่าน', icon: CheckCircle2, color: '#199e70' },
  warn: { label: 'ระวัง', icon: AlertTriangle, color: '#c98500' },
  block: { label: 'ติดขัด', icon: XCircle, color: '#e66767' },
  wait: { label: 'รอ', icon: Clock, color: '#a1a1aa' },
};
const LEVEL_STYLE: Record<WinLevel, { label: string; color: string; box: string }> = {
  none: { label: 'ยังไม่มีหลักฐาน', color: '#e66767', box: 'border-rose-500/40 bg-rose-500/10' },
  discovery: { label: 'ตกช่วงทดสอบ', color: '#c98500', box: 'border-amber-500/40 bg-amber-500/10' },
  holdout: { label: 'รอไม้ forward', color: '#3987e5', box: 'border-sky-500/40 bg-sky-500/10' },
  rejected: { label: 'forward ไม่ยืนยัน', color: '#e66767', box: 'border-rose-500/40 bg-rose-500/10' },
  confirmed: { label: 'ยืนยันแล้ว', color: '#199e70', box: 'border-emerald-500/40 bg-emerald-500/10' },
};
const sectionCls = 'scroll-mt-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-4';
const FDR = 0.1;

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={sectionCls}>
      <header>
        <h3 id={`${id}-h`} className="text-sm font-semibold text-zinc-50">
          {title}
        </h3>
        {lead && <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <dt className="text-[11px] text-zinc-400">{label}</dt>
      <dd className="font-mono text-lg font-semibold text-zinc-50">{value}</dd>
      <dd className="text-[11px] text-zinc-400">{sub}</dd>
    </div>
  );
}

function Toggle<T extends string | number>({ label, options, value, onChange, fmt }: { label: string; options: T[]; value: T; onChange: (v: T) => void; fmt: (v: T) => string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-zinc-400">{label}</span>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn(
            'min-h-8 rounded-md border px-2.5 text-xs',
            value === o ? 'border-zinc-400 bg-zinc-800 font-semibold text-zinc-50' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800',
          )}
        >
          {fmt(o)}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ n, step }: { n: number; step: WinrateResponse['plan'][number] }) {
  const st = PLAN_STYLE[step.status];
  const Icon = st.icon;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold text-zinc-100">
          <span className="mr-1.5 font-mono text-zinc-400">{n}.</span>
          {step.title}
        </h4>
        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-100">
          <Icon className="h-3 w-3" style={{ color: st.color }} aria-hidden />
          {st.label}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-zinc-300">{step.detail}</p>
    </li>
  );
}

function ForwardProgress({ f, power }: { f: WinrateResponse['forward']; power: WinrateResponse['power'] }) {
  const need = f.needed ?? power.nNeeded;
  const share = need ? Math.min(100, (100 * f.closed) / need) : 0;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-zinc-100">
        ไม้ forward ที่นับได้ของกติกาที่ล็อกอยู่ ({f.config})
        <StatusBadge text={f.matchesReference ? 'นับเข้าการพิสูจน์ 80%' : 'ยังไม่ใช่ config อ้างอิง'} color={f.matchesReference ? '#199e70' : '#71717a'} />
      </p>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span
          role="progressbar"
          aria-label="ไม้ forward ที่ปิดแล้วเทียบจำนวนที่ต้องใช้"
          aria-valuemin={0}
          aria-valuemax={need ?? 0}
          aria-valuenow={f.closed}
          className="relative h-2.5 rounded-full bg-zinc-800"
        >
          <span className="absolute inset-y-0 left-0 rounded-full bg-[#3987e5]" style={{ width: `${share}%` }} />
        </span>
        <span className="font-mono text-zinc-50">
          {f.closed} / {need ?? '—'}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
        {f.closed
          ? `ชนะ ${f.winRate}% [${f.wilson?.lo}, ${f.wilson?.hi}] เทียบการสุ่ม ${f.baseline ?? '—'}% (${pEq(f.pVsBaseline)}) — ห้ามใช้ตัดสินก่อนครบ`
          : `ยังไม่มีไม้ forward ที่นับได้ — นับเฉพาะข้อมูลจริง + กติกาที่ล็อก + บันทึกก่อนตลาดเปิด (หน้า "กระบวนการทำงาน") · การสุ่มด้วยกติกาออกนี้ชนะ ${f.baseline ?? '—'}%`}
      </p>
    </div>
  );
}

export function WinrateView() {
  const q = useApi<WinrateResponse>('/api/winrate');
  const d = q.data;
  const [stopMult, setStopMult] = useState<number | null>(null);
  const [holdDays, setHoldDays] = useState<number | null>(null);
  const synthetic = d ? d.data.kind !== 'real' : false;
  const ref = d ? (d.selection.selected ?? d.selection.closest) : null;
  // ค่าเริ่มต้นของกราฟกับดัก = stop/วันถือของ config อ้างอิง (ตัวที่ใกล้ที่สุด) เพื่อให้เห็นจุดที่ "ชนะ 80%" เกิดขึ้น
  const sm = stopMult ?? ref?.stopMult ?? d?.grid.stopMults[0] ?? 1;
  const hd = holdDays ?? ref?.holdDays ?? d?.grid.holds[0] ?? 5;
  const level = d ? LEVEL_STYLE[d.verdict.level] : null;
  const cur = d?.current.row?.discovery;

  return (
    <div className="@container min-w-0 space-y-4">
      <header>
        <h2 className="text-lg font-bold text-zinc-50">เป้าหมายชนะ 80% – หุ้นไทย</h2>
        <p className="text-xs text-zinc-400">
          {d
            ? `ห้องทดลองกติกาออก ${d.grid.configs} แบบ · ${thDate(d.window.start)} – ${thDate(d.window.end)} (${d.window.years} ปี · ${d.window.signals} สัญญาณ) · เทียบการสุ่มเข้า ${d.window.randomPerSignal} วันต่อสัญญาณ`
            : 'ต้องทำอย่างไรจึงชนะ 80% อย่างมีนัยสำคัญ — ทดลองกติกาออกทุกแบบ เทียบการสุ่มเข้าแบบเดียวกัน แล้ววางแผนพิสูจน์ด้วยไม้ forward'}
        </p>
      </header>

      {d && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-xs leading-relaxed',
            synthetic ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-zinc-700 bg-zinc-900/60 text-zinc-200',
          )}
        >
          <strong>{d.data.label}</strong>
          {synthetic && ' — ตัวเลขในหน้านี้มาจากข้อมูลจำลอง ใช้ซ้อมวิธีพิสูจน์เท่านั้น ไม่ใช่ผลของตลาดหุ้นไทยจริง'} · “ชนะ” = ผลสุทธิหลังค่าธรรมเนียมไป-กลับ {d.costPct}% · ไม่ใช่คำแนะนำการลงทุน
        </p>
      )}

      {q.error ? (
        <p role="alert" className="text-sm text-rose-300">
          โหลดห้องทดลองไม่สำเร็จ: {q.error}
        </p>
      ) : !d || !level ? (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังทดลองกติกาออกทุกแบบเทียบการสุ่มเข้า (ครั้งแรกอาจใช้เวลาสักครู่)…
        </p>
      ) : (
        <>
          <section aria-labelledby="winrate-verdict-h" className={cn('rounded-xl border p-3', level.box)}>
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge text={level.label} color={level.color} />
              <span className="text-[11px] text-zinc-300">คำตอบสั้น</span>
            </p>
            <h3 id="winrate-verdict-h" className="mt-1 text-base font-semibold text-zinc-50">
              {d.verdict.title}
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-zinc-200">
              {d.verdict.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-300">
              “ชนะ {d.target}% อย่างมีนัยสำคัญ” ต้องครบ 4 ข้อ: (1) ชนะเหนือการสุ่มเข้าที่ใช้กติกาออกเดียวกัน หลังนับทุกแบบที่ลอง (2) ได้กำไรสุทธิหลังค่าธรรมเนียม (3) ผ่านช่วงทดสอบที่ไม่ได้ใช้เลือก
              (4) ยืนยันด้วยไม้ forward จริงครบจำนวนที่คำนวณไว้ล่วงหน้า — อัตราชนะสูงอย่างเดียวสร้างได้ด้วยการวางเป้าใกล้/stop กว้าง จึงไม่ใช่หลักฐาน
            </p>
          </section>

          <dl className="grid grid-cols-2 gap-2 @min-[700px]:grid-cols-3 @min-[1100px]:grid-cols-6">
            <Tile label="config ที่ทดลอง" value={`${d.funnel.tested}/${d.funnel.configs}`} sub={`เป้า ${d.grid.targetsR.length} × stop ${d.grid.stopMults.length} × วันถือ ${d.grid.holds.length} × ตัวกรอง ${d.grid.filters.length}`} />
            <Tile label={`ชนะ ≥ ${d.target}% (ช่วงค้นหา)`} value={String(d.funnel.reach)} sub={`ผลสุทธิ > 0 อยู่ ${d.funnel.positive} แบบ`} />
            <Tile label="เหนือการสุ่มอย่างมีนัย" value={String(d.funnel.candidates)} sub={`ถึงเป้าด้วย · q < ${FDR} หลังนับทุกแบบ`} />
            <Tile label="ไม้ forward ที่ต้องใช้" value={d.power.nNeeded === null ? '—' : String(d.power.nNeeded)} sub={d.power.years === null ? 'ยังคำนวณไม่ได้' : `≈ ${d.power.years} ปีที่ความถี่ในอดีต`} />
            <Tile label="กติกาที่ล็อกอยู่ชนะ" value={cur?.winRate == null ? '—' : `${cur.winRate}%`} sub={`${d.current.label} · สุ่ม ${cur?.baseline ?? '—'}%`} />
            <Tile label="ไม้ forward ที่นับได้" value={String(d.forward.closed)} sub={d.forward.matchesReference ? 'นับเข้าการพิสูจน์' : 'ยังไม่ใช่ config อ้างอิง'} />
          </dl>

          <Section
            id="winrate-plan"
            title="แผน 6 ขั้นสู่ “ชนะ 80% อย่างมีนัยสำคัญ”"
            lead="ทำตามลำดับ ห้ามข้ามขั้น · เกณฑ์ทุกข้อตั้งไว้ก่อนดูผล (ลดเกณฑ์หลังเห็นผล = หลอกตัวเอง) · สถานะคำนวณใหม่ทุกครั้งที่ข้อมูล/กติกา/ไม้ forward เปลี่ยน"
          >
            <ol className="grid gap-2 @min-[700px]:grid-cols-2 @min-[1100px]:grid-cols-3">
              {d.plan.map((s, i) => (
                <PlanCard key={s.key} n={i + 1} step={s} />
              ))}
            </ol>
            <ForwardProgress f={d.forward} power={d.power} />
          </Section>

          <Section
            id="winrate-trap"
            title="กับดักรูปทรง: อัตราชนะ “ซื้อ” ได้ด้วยกติกาออก"
            lead="เลือก stop และวันถือ แล้วดูว่าเมื่อเลื่อนเป้าให้ใกล้ขึ้น อัตราชนะของสัญญาณและของการสุ่มเข้าสูงขึ้นพร้อมกัน — ระยะห่างระหว่างสองเส้นเท่านั้นที่บอกฝีมือ"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Toggle label="stop" options={d.grid.stopMults} value={sm} onChange={setStopMult} fmt={(v) => `${v}×`} />
              <Toggle label="ถือ" options={d.grid.holds} value={hd} onChange={setHoldDays} fmt={(v) => `${v} วัน`} />
            </div>
            <TrapCharts points={d.curves.find((c) => c.stopMult === sm && c.holdDays === hd)?.points ?? []} stopMult={sm} holdDays={hd} target={d.target} />
            {d.trap && <TrapCallout trap={d.trap} />}
          </Section>

          <Section
            id="winrate-grid"
            title={`ทุก config เทียบการสุ่ม: ${d.funnel.reach} แบบถึง ${d.target}% · ${d.funnel.candidates} แบบผ่านเกณฑ์`}
            lead={`ช่วงค้นหา ${thDate(d.window.start)} – ก่อน ${thDate(d.window.split)} (${d.window.discoverySignals} สัญญาณ) · ช่วงทดสอบ ${thDate(d.window.split)} – ${thDate(d.window.end)} (${d.window.holdoutSignals} สัญญาณ) · ตัดรอยต่อ ${d.window.embargo} วันทำการ (${d.window.embargoSignals} สัญญาณ)`}
          >
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <ConfigScatter cells={d.cells} target={d.target} fdr={FDR} />
              <Funnel f={d.funnel} target={d.target} fdr={FDR} />
            </div>
            <ReachTable rows={d.reach} target={d.target} fdr={FDR} />
          </Section>

          {ref && (
            <Section
              id="winrate-compare"
              title={d.selection.selected ? 'ตัวที่ผ่านเกณฑ์: ช่วงค้นหาเทียบช่วงทดสอบ' : 'ตัวที่ใกล้ที่สุด: ช่วงค้นหาเทียบช่วงทดสอบ'}
              lead={`เกณฑ์เลือก (ตั้งไว้ก่อนดูผล): ${d.selection.rule}`}
            >
              <CompareCard row={ref} selected={!!d.selection.selected} w={d.window} />
            </Section>
          )}

          <Section id="winrate-power" title="ต้องใช้ไม้ forward กี่ไม้จึงพิสูจน์ได้" lead={d.power.note}>
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <PowerChart power={d.power} target={d.target} />
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs leading-relaxed text-zinc-200">
                <p className="font-semibold text-zinc-100">อ่านอย่างไร</p>
                <p>
                  config อ้างอิง: {d.power.reference ?? '—'} · การสุ่มด้วยกติกาออกเดียวกันชนะ <span className="font-mono">{d.power.p0 ?? '—'}%</span>
                </p>
                <p>
                  ถ้าไม้อิสระกันต้องใช้ <span className="font-mono">{d.power.nIid ?? '—'}</span> ไม้ · สัญญาณในสัปดาห์เดียวกันมักไปทางเดียวกัน (design effect{' '}
                  <span className="font-mono">{d.power.deff.toFixed(2)}</span>) จึงต้องใช้ <span className="font-mono">{d.power.nNeeded ?? '—'}</span> ไม้
                </p>
                <p>
                  ทางเร่ง (ไม่ใช่ทางลัดทางสถิติ): เพิ่มจำนวนหุ้นในจักรวาลเพื่อให้ได้ไม้ต่อปีมากขึ้น — แต่ไม้ที่เกิดวันเดียวกันนับเป็นหลักฐานไม่เต็มไม้ · ห้ามแอบดูแล้วหยุดเมื่อผลดูดี
                </p>
                {d.selection.closest && !d.selection.selected && d.selection.closest.discovery.excess && (
                  <p className="text-zinc-400">
                    ในอดีตตัวที่ใกล้ที่สุดชนะเหนือการสุ่ม {signedFmt(d.selection.closest.discovery.excess.mean, 1)} จุด — ตัวที่ถูกเลือกจากหลายแบบมักดีเกินจริง (winner&apos;s curse) ของจริงน่าจะน้อยกว่า
                    จึงต้องใช้ไม้มากกว่าตัวเลขนี้
                  </p>
                )}
              </div>
            </div>
          </Section>

          <Section id="winrate-method" title="วิธีคิด (ตั้งไว้ก่อนดูผล)">
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-300">
              {d.method.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
