'use client';

/**
 * หน้า "กระบวนการทำงาน" — วงจรประจำวันหลังตลาดปิดที่ใช้งานได้จริง:
 *  ข้อมูล → ล็อกกติกา → สัญญาณ → บันทึกก่อนตลาดเปิดรอบถัดไป → โบรกเกอร์กระดาษติดตามผล → เทียบความคาดหวัง
 * รายการทุกไม้อยู่ใน Journal (ป้าย [รอบอัตโนมัติ]) · หลักฐาน forward นับเฉพาะข้อมูลจริง + กติกาที่ล็อก + บันทึกทันเวลา
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Info, Loader2, Lock, Play, XCircle, type LucideIcon } from 'lucide-react';
import { Line, LineChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ForestPlot, StatusBadge, signedFmt } from '@/components/atlas/atlas-charts';
import { AXIS, BASELINE, CATEGORICAL, ChartFrame, GRID, TipBox, type TipProps } from '@/components/charts/chart-kit';
import { READ_ONLY_HINT, useCanWrite } from '@/components/providers/app-meta';
import { apiCall, useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { thDate, thMonthTick } from '@/lib/flows/format';
import { cn } from '@/lib/utils';
import { EXIT_LABEL, REASON_LABEL } from '@/lib/workflow/cycle';
import type { PaperState } from '@/lib/workflow/execution';
import type { CycleReport, LedgerRow, PaperStats, StepStatus, WorkflowAlert, WorkflowResponse } from '@/lib/workflow/types';

const STEP_STYLE: Record<StepStatus, { label: string; icon: LucideIcon; color: string }> = {
  ok: { label: 'พร้อม', icon: CheckCircle2, color: '#199e70' },
  warn: { label: 'ระวัง', icon: AlertTriangle, color: '#c98500' },
  block: { label: 'ติดขัด', icon: XCircle, color: '#e66767' },
  wait: { label: 'รอ', icon: Clock, color: '#a1a1aa' },
};
const ALERT_STYLE: Record<WorkflowAlert['level'], { label: string; icon: LucideIcon; color: string; box: string }> = {
  danger: { label: 'ด่วน', icon: XCircle, color: '#e66767', box: 'border-rose-500/40 bg-rose-500/10' },
  warn: { label: 'ระวัง', icon: AlertTriangle, color: '#c98500', box: 'border-amber-500/40 bg-amber-500/10' },
  info: { label: 'ข้อมูล', icon: Info, color: '#3987e5', box: 'border-zinc-700 bg-zinc-900/60' },
};
const STATE_LABEL: Record<PaperState, string> = {
  order: 'รอราคา',
  open: 'ถืออยู่',
  closed: 'ปิดแล้ว',
  expired: 'หมดอายุคำสั่ง',
  gap: 'ยกเลิก (เปิดต่ำกว่า stop)',
  invalid: 'แผนใช้ไม่ได้',
};
const px = (v: number | null) => (v === null ? '—' : v >= 100 ? v.toFixed(1) : v.toFixed(2));
const whenText = (iso: string | null) => (iso ? `${thDate(new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10))} ${new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(11, 16)} น.` : '—');
const orderText = (r: LedgerRow) => (r.order.type === 'limit' ? `ตั้งซื้อ ≤ ${px(r.order.price)}` : 'ซื้อที่ราคาเปิด');
const sectionCls = 'space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-4';
const h3Cls = 'text-sm font-semibold text-zinc-50';

function ReasonChip({ r }: { r: LedgerRow['reason'] }) {
  return <StatusBadge text={REASON_LABEL[r]} color={r === 'counted' ? '#199e70' : '#71717a'} />;
}

function StepCard({ n, step, busy, canWrite, onAction }: { n: number; step: WorkflowResponse['steps'][number]; busy: boolean; canWrite: boolean; onAction: (a: 'run-cycle' | 'lock-rules') => void }) {
  const st = STEP_STYLE[step.status];
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
      <p className="text-xs leading-relaxed text-zinc-200">{step.summary}</p>
      {step.detail.length > 0 && (
        <ul className="space-y-0.5 text-[11px] leading-snug text-zinc-400">
          {step.detail.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {step.action && (
        <button
          type="button"
          onClick={() => onAction(step.action!)}
          disabled={busy || !canWrite}
          title={canWrite ? undefined : READ_ONLY_HINT}
          className="mt-auto inline-flex min-h-8 items-center justify-center gap-1.5 self-start rounded-md border border-zinc-600 bg-zinc-800 px-2.5 text-xs font-medium text-zinc-50 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {step.action === 'lock-rules' ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          {step.action === 'lock-rules' ? 'ล็อกกติกาชุดนี้' : 'รันรอบนี้'}
        </button>
      )}
    </li>
  );
}

function TodayTable({ rows, session }: { rows: LedgerRow[]; session: string | null }) {
  const th = 'px-2 py-1.5 text-right font-medium';
  const td = 'px-2 py-1.5 text-right font-mono';
  if (!rows.length) return <p className="text-xs text-zinc-400">ไม่มีสัญญาณจากราคาปิด{session ? `วันที่ ${thDate(session)}` : ''} — รอบนี้ไม่ต้องส่งคำสั่ง</p>;
  return (
    <div tabIndex={0} role="region" aria-label="ตารางคำสั่งของรอบล่าสุด" className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[760px] text-[11px]">
        <caption className="sr-only">คำสั่งที่ต้องส่งก่อนตลาดเปิดรอบถัดไป ตามแผนเทรดของแต่ละสัญญาณ</caption>
        <thead className="bg-zinc-900 text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">หุ้น</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">ชนิด</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">คำสั่ง</th>
            <th scope="col" className={th}>หมดอายุ</th>
            <th scope="col" className={th}>stop</th>
            <th scope="col" className={th}>ขนาดไม้</th>
            <th scope="col" className={th}>P(up)</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
          {rows.map((r) => (
            <tr key={`${r.symbol}-${r.session}`}>
              <th scope="row" className="px-2 py-1.5 text-left font-normal">
                <span className="font-semibold text-zinc-50">{r.symbol}</span> <span className="text-zinc-400">{r.name ?? ''}</span>
              </th>
              <td className="px-2 py-1.5">{r.kind}</td>
              <td className="px-2 py-1.5 font-mono text-zinc-100">{orderText(r)}</td>
              <td className={td}>{thDate(r.order.validUntil)}</td>
              <td className={td}>{px(r.stop)}</td>
              <td className={td}>{r.sizePct === null ? '—' : `${r.sizePct.toFixed(1)}%`}</td>
              <td className={td}>{r.probUp === null ? '—' : r.probUp.toFixed(2)}</td>
              <td className="px-2 py-1.5">
                <span className="flex flex-wrap items-center gap-1">
                  {r.id ? <StatusBadge text={`บันทึกแล้ว · ${STATE_LABEL[r.state]}`} color="#199e70" /> : <StatusBadge text="ยังไม่บันทึก" color="#c98500" />}
                  <ReasonChip r={r.reason} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const th = 'px-2 py-1.5 text-right font-medium';
  const td = 'px-2 py-1.5 text-right font-mono';
  if (!rows.length) return <p className="text-xs text-zinc-400">ยังไม่มีไม้จากรอบประจำวัน — กด “รันรอบนี้” เพื่อบันทึกสัญญาณของรอบล่าสุดลง Journal</p>;
  return (
    <div tabIndex={0} role="region" aria-label="สมุดไม้กระดาษจากรอบประจำวัน" className="max-h-[28rem] overflow-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[820px] text-[11px]">
        <caption className="sr-only">ไม้กระดาษทุกไม้ที่รอบประจำวันบันทึกไว้ใน Journal พร้อมสถานะล่าสุดจากราคาจริงในระบบ</caption>
        <thead className="sticky top-0 bg-zinc-900 text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">วันสัญญาณ · หุ้น</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">สถานะ</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">คำสั่ง</th>
            <th scope="col" className={th}>ได้ของ</th>
            <th scope="col" className={th}>ออก</th>
            <th scope="col" className={th}>R</th>
            <th scope="col" className={th}>%</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">หลักฐาน forward</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
          {rows.map((r) => (
            <tr key={r.id ?? `${r.symbol}-${r.session}`}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-normal">
                <span className="font-mono text-zinc-400">{thDate(r.session)}</span> <span className="font-semibold text-zinc-50">{r.symbol}</span> <span className="text-zinc-400">{r.kind}</span>
              </th>
              <td className="px-2 py-1.5 text-zinc-100">
                {STATE_LABEL[r.state]}
                {r.exit ? ` · ${EXIT_LABEL[r.exit.kind]}` : ''}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                {orderText(r)} · stop {px(r.stop)}
              </td>
              <td className={td}>{r.fill ? `${px(r.fill.price)} (${thDate(r.fill.date)})` : '—'}</td>
              <td className={td}>{r.exit ? `${px(r.exit.price)} (${thDate(r.exit.date)})` : '—'}</td>
              <td className={cn(td, 'text-zinc-100')}>{r.r === null ? '—' : signedFmt(r.r)}</td>
              <td className={td}>{r.retPct === null ? '—' : `${signedFmt(r.retPct)}%`}</td>
              <td className="px-2 py-1.5">
                <ReasonChip r={r.reason} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareTable({ base, fwd }: { base: PaperStats; fwd: PaperStats }) {
  const ci = (s: PaperStats) => (s.meanR ? `${signedFmt(s.meanR.mean)}R [${signedFmt(s.meanR.lo)}, ${signedFmt(s.meanR.hi)}]` : '—');
  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
  const rows: Array<[string, string, string]> = [
    ['สัญญาณ', String(base.signals), String(fwd.signals)],
    ['ได้ของ (% ของคำสั่งที่จบแล้ว)', `${base.filled} (${pct(base.fillRate)})`, `${fwd.filled} (${pct(fwd.fillRate)})`],
    ['หมดอายุ / ยกเลิกเพราะเปิดต่ำกว่า stop', `${base.expired} / ${base.gaps}`, `${fwd.expired} / ${fwd.gaps}`],
    ['ปิดแล้ว · ถึงเป้า / stop / หมดเวลา', `${base.closed} · ${base.byExit.target}/${base.byExit.stop}/${base.byExit.time}`, `${fwd.closed} · ${fwd.byExit.target}/${fwd.byExit.stop}/${fwd.byExit.time}`],
    ['อัตราชนะ', pct(base.winRate), pct(fwd.winRate)],
    ['ผลเฉลี่ยต่อไม้ (CI 95%)', ci(base), ci(fwd)],
    ['ผลเฉลี่ยต่อไม้ (%)', base.meanRet === null ? '—' : `${signedFmt(base.meanRet)}%`, fwd.meanRet === null ? '—' : `${signedFmt(fwd.meanRet)}%`],
    ['ถือเฉลี่ย (วันทำการ)', base.avgDays === null ? '—' : base.avgDays.toFixed(1), fwd.avgDays === null ? '—' : fwd.avgDays.toFixed(1)],
  ];
  return (
    <div tabIndex={0} role="region" aria-label="ตารางเทียบผลย้อนหลังกับผลจริง" className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[420px] text-[11px]">
        <caption className="sr-only">ผลของโบรกเกอร์กระดาษ: เล่นซ้ำย้อนหลังก่อนล็อกกติกา เทียบไม้จริงที่นับเป็นหลักฐาน forward</caption>
        <thead className="bg-zinc-900 text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">ตัวชี้วัด</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">ย้อนหลัง (คาดหวัง)</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">จริง (forward)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <th scope="row" className="px-2 py-1.5 text-left font-normal text-zinc-200">{k}</th>
              <td className="px-2 py-1.5 text-right font-mono">{a}</td>
              <td className="px-2 py-1.5 text-right font-mono text-zinc-100">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EquityChart({ points, label }: { points: Array<{ date: string; cumR: number }>; label: string }) {
  const last = points[points.length - 1];
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<{ date: string; cumR: number }>;
    const p = payload?.[0]?.payload;
    if (!active || !p) return null;
    return <TipBox title={thDate(p.date)} rows={[{ label: 'R สะสม', value: `${signedFmt(p.cumR)}R`, color: CATEGORICAL[0] }]} />;
  };
  return (
    <ChartFrame
      title="R สะสมของการเล่นซ้ำย้อนหลัง (ตามวันออก)"
      height={200}
      label={`${label}: R สะสม ${last ? `${signedFmt(last.cumR)}R ณ ${thDate(last.date)}` : 'ยังไม่มีไม้ที่ปิด'}`}
      note="เส้นขึ้น = ระบบทำกำไรเป็นหน่วยความเสี่ยงต่อไม้ (R) · เป็นผลในตัวอย่าง — ใช้เป็นความคาดหวัง ไม่ใช่คำสัญญา"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={thMonthTick} minTickGap={40} stroke={BASELINE} />
          <YAxis tick={AXIS} width={36} stroke={BASELINE} tickFormatter={(v: number) => `${v}R`} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={tip} isAnimationActive={false} />
          <Line dataKey="cumR" type="linear" stroke={CATEGORICAL[0]} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function WorkflowView() {
  const q = useApi<WorkflowResponse>('/api/workflow');
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'run-cycle' | 'lock-rules' | null>(null);
  const d = q.data;
  const synthetic = d ? d.data.kind !== 'real' : false;

  async function act(a: 'run-cycle' | 'lock-rules') {
    setBusy(a);
    try {
      if (a === 'run-cycle') {
        const { report } = await apiCall<{ report: CycleReport }>('/api/workflow/run', { method: 'POST' });
        toast({
          title: report.blocked ? 'รันรอบแล้ว — ไม่บันทึกสัญญาณใหม่' : `รันรอบ ${thDate(report.session)} แล้ว`,
          description: report.blocked ?? `บันทึกใหม่ ${report.recorded} · มีอยู่แล้ว ${report.alreadyRecorded} · อัปเดตสถานะ ${report.resolved} รายการ`,
        });
      } else {
        await apiCall('/api/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'ล็อกจากหน้ากระบวนการทำงาน' }) });
        toast({ title: 'ล็อกกติกาแล้ว', description: 'ไม้ที่บันทึกหลังจากนี้ด้วยกติกาชุดนี้นับเป็นหลักฐาน forward' });
      }
      q.refresh();
    } catch (e) {
      toast({ title: a === 'run-cycle' ? 'รันรอบไม่สำเร็จ' : 'ล็อกกติกาไม่สำเร็จ', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  const fwd = d?.forward.stats;
  const base = d?.baseline.stats;
  const forestRows = d && base && fwd
    ? [
        ...(base.meanR
          ? [{ key: 'base', label: 'ย้อนหลัง (คาดหวัง)', sub: `${base.closed} ไม้ปิด · ชนะ ${base.winRate ?? '—'}% · ${d.baseline.start ? `${thDate(d.baseline.start)} – ${thDate(d.baseline.end!)}` : ''}`, ci: base.meanR, color: '#d4d4d8' }]
          : []),
        ...(fwd.meanR
          ? [{ key: 'fwd', label: 'จริง (forward)', sub: `${fwd.closed} ไม้ปิด · ชนะ ${fwd.winRate ?? '—'}%`, ci: fwd.meanR, color: d.comparison.verdict === 'below' ? '#e66767' : '#3987e5' }]
          : []),
      ]
    : [];

  return (
    <div className="@container min-w-0 space-y-4">
      <header>
        <h2 className="text-lg font-bold text-zinc-50">กระบวนการทำงาน – วงจรประจำวันหลังตลาดปิด</h2>
        <p className="text-xs text-zinc-400">
          ข้อมูล → ล็อกกติกา → สัญญาณ → บันทึกก่อนตลาดเปิดรอบถัดไป → โบรกเกอร์กระดาษติดตามผล → เทียบความคาดหวัง
          {d?.session ? ` · รอบล่าสุด ${thDate(d.session)} · เส้นตาย ${whenText(d.deadline)}` : ''}
        </p>
      </header>

      {d && (
        <p className={cn('rounded-lg border px-3 py-2 text-xs leading-relaxed', synthetic ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-zinc-700 bg-zinc-900/60 text-zinc-200')}>
          <strong>{d.data.label}</strong>
          {synthetic
            ? ' — ซ้อมกระบวนการได้ครบทุกขั้น แต่ไม้ที่บันทึกจากข้อมูลจำลองไม่นับเป็นหลักฐาน forward · ดู “ใช้กับข้อมูลจริง” ด้านล่าง'
            : ' — ไม้ที่บันทึกทันเวลาหลังล็อกกติกานับเป็นหลักฐาน forward'}{' '}
          · ไม้กระดาษไม่หักค่าธรรมเนียม · ไม่ใช่คำแนะนำการลงทุน
        </p>
      )}

      {q.error ? (
        <p role="alert" className="text-sm text-rose-300">
          โหลดกระบวนการทำงานไม่สำเร็จ: {q.error}
        </p>
      ) : !d || !fwd || !base ? (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังตรวจสถานะของรอบ…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
            <button
              type="button"
              onClick={() => void act('run-cycle')}
              disabled={busy !== null || !canWrite}
              title={canWrite ? undefined : READ_ONLY_HINT}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#3987e5] px-3 font-semibold text-[#0f0f11] hover:bg-[#6da7ec] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'run-cycle' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              รันรอบนี้
            </button>
            {!d.rules.locked || !d.rules.matches ? (
              <button
                type="button"
                onClick={() => void act('lock-rules')}
                disabled={busy !== null || !canWrite}
                title={canWrite ? undefined : READ_ONLY_HINT}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-3 font-medium text-zinc-50 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Lock className="h-4 w-4" aria-hidden /> ล็อกกติกาชุดนี้
              </button>
            ) : null}
            <span className="text-zinc-300">
              {d.lastRun ? `รันล่าสุด ${whenText(d.lastRun.at)} โดย ${d.lastRun.actor} (รอบ ${d.lastRun.session ? thDate(d.lastRun.session) : '—'} · บันทึก ${d.lastRun.recorded} · อัปเดต ${d.lastRun.resolved})` : 'ยังไม่เคยรันรอบ'}
            </span>
            <span className="text-zinc-400">
              · รันอัตโนมัติ: {d.schedule.auto ? `เปิด (หลัง ${d.schedule.readyAfter} น. เมื่อข้อมูลของวันเข้า)` : 'ปิด (OQE_CYCLE_AUTO=1 หรือ cron)'}
            </span>
            {!canWrite && <span className="text-amber-200">{READ_ONLY_HINT}</span>}
          </div>

          {d.alerts.length > 0 && (
            <section aria-labelledby="wf-alerts-h" className="space-y-1.5">
              <h3 id="wf-alerts-h" className="sr-only">
                สัญญาณเตือน
              </h3>
              <ul className="space-y-1.5">
                {d.alerts.map((a) => {
                  const st = ALERT_STYLE[a.level];
                  const Icon = st.icon;
                  return (
                    <li key={a.text} className={cn('flex gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed text-zinc-100', st.box)}>
                      <span className="mt-0.5 inline-flex h-5 shrink-0 items-center gap-1 rounded border border-zinc-600 px-1.5 text-[10.5px] font-medium">
                        <Icon className="h-3 w-3" style={{ color: st.color }} aria-hidden />
                        {st.label}
                      </span>
                      <span>{a.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="wf-steps-h" className={sectionCls}>
            <h3 id="wf-steps-h" className={h3Cls}>
              ขั้นตอนของรอบนี้
            </h3>
            <ol className="grid gap-3 @min-[700px]:grid-cols-2 @min-[1100px]:grid-cols-3">
              {d.steps.map((s, i) => (
                <StepCard key={s.key} n={i + 1} step={s} busy={busy !== null} canWrite={canWrite} onAction={(a) => void act(a)} />
              ))}
            </ol>
          </section>

          <section aria-labelledby="wf-today-h" className={sectionCls}>
            <h3 id="wf-today-h" className={h3Cls}>
              คำสั่งของรอบล่าสุด{d.session ? ` (จากราคาปิด ${thDate(d.session)})` : ''}
            </h3>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              pullback = ตั้งซื้อที่ขอบบนของโซนเข้า · momentum = ซื้อที่ราคาเปิด · คำสั่งมีอายุ {d.exec.orderDays} วันทำการ · เปิดต่ำกว่า stop = ยกเลิก · ออกเมื่อโดน stop / ถึงเป้า +{d.exec.targetR}R / ถือครบ {d.exec.holdDays} วันทำการ
            </p>
            <TodayTable rows={d.today} session={d.session} />
          </section>

          <section aria-labelledby="wf-fwd-h" className={sectionCls}>
            <h3 id="wf-fwd-h" className={h3Cls}>
              ผลจริงเทียบความคาดหวัง
            </h3>
            <p className="text-xs leading-relaxed text-zinc-200">{d.comparison.text}</p>
            <div className="grid gap-3 @min-[1100px]:grid-cols-2">
              <CompareTable base={base} fwd={fwd} />
              {forestRows.length ? (
                <ForestPlot title="ผลเฉลี่ยต่อไม้ (R) · CI 95%" rows={forestRows.map((r) => ({ ...r, value: `${signedFmt(r.ci.mean)}R [${signedFmt(r.ci.lo)}, ${signedFmt(r.ci.hi)}]` }))} refNote="เส้นตั้ง = 0R (เท่าทุน) · ผลจริงต้องมีอย่างน้อย 10 ไม้ที่ปิดแล้วจึงเทียบได้" />
              ) : (
                <p className="text-xs text-zinc-400">ยังไม่มีไม้ที่ปิดแล้ว</p>
              )}
            </div>
            <EquityChart points={d.baseline.equity} label="การเล่นซ้ำย้อนหลัง" />
            <p className="text-[11px] leading-relaxed text-zinc-400">
              {d.baseline.note} · ไม่นับเป็นหลักฐาน forward: ข้อมูลจำลอง {d.forward.excluded.synthetic} · ยังไม่ล็อก {d.forward.excluded['not-locked']} · บันทึกก่อนล็อก {d.forward.excluded['pre-lock']} · กติกาชุดอื่น {d.forward.excluded['rules-changed']} · บันทึกหลังตลาดเปิด {d.forward.excluded.late}
            </p>
          </section>

          <section aria-labelledby="wf-ledger-h" className={sectionCls}>
            <h3 id="wf-ledger-h" className={h3Cls}>
              สมุดไม้กระดาษ ({d.ledger.length} รายการใน Journal)
            </h3>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              รายการป้าย [รอบอัตโนมัติ] ในแท็บ Backtest &amp; Journal — ระบบอัปเดตสถานะเองจากราคา (ไปข้างหน้าเท่านั้น · รายการที่ปิด/ข้ามแล้วไม่แตะอีก) · ถ้าเทรดจริง ให้บันทึกรายการใหม่ใน Journal
            </p>
            <LedgerTable rows={d.ledger} />
          </section>

          <section aria-labelledby="wf-real-h" className={sectionCls}>
            <h3 id="wf-real-h" className={h3Cls}>
              ใช้กับข้อมูลจริง
            </h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-zinc-200">
              <li>
                ดึงราคาจริงของหุ้นไทย: <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-100">bun scripts/fetch-yahoo.ts --universe demo --yes</code> (ต้องเข้าถึง query1.finance.yahoo.com) หรือไฟล์ CSV{' '}
                <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-100">bun scripts/ingest-csv.ts prices.csv --source &quot;csv:...&quot; --yes</code> — backup อัตโนมัติก่อนแทนที่
              </li>
              <li>ล็อกกติกา (ปุ่มด้านบน) — ผล forward นับเฉพาะไม้ที่บันทึกหลังล็อกด้วยกติกาชุดนั้น</li>
              <li>
                ตั้งรอบประจำวันหลัง {d.schedule.readyAfter} น.: cron{' '}
                <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-100">{d.schedule.cli} --fetch yahoo</code> หรือเปิด <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-100">OQE_CYCLE_AUTO=1</code> ให้เซิร์ฟเวอร์รันเองเมื่อข้อมูลของวันเข้า
              </li>
              <li>ทุกเช้าก่อน 10:00 น. ดูตาราง “คำสั่งของรอบล่าสุด” = คำสั่งที่ต้องส่ง · ถ้าเทรดจริงให้บันทึกผลจริงใน Journal แยกจากไม้กระดาษ</li>
              <li>เมื่อมีไม้ที่นับได้ ≥ 10 ไม้ ดูผลเทียบความคาดหวัง — ต่ำกว่าที่คาดอย่างมีนัย = พักระบบแล้วหาสาเหตุ (Atlas พฤติกรรมระบบช่วยได้)</li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
