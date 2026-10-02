'use client';

import { useState } from 'react';
import { Sparkles, Bot, Gauge } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Panel } from './quant-widgets';
import { fmtDate, fmtNum } from '@/lib/format';
import { apiCall } from '@/hooks/use-api';
import type { AuditReportT } from '@/lib/quant/api-types';
import { LLM_MISSING_HINT, READ_ONLY_HINT, useCanWrite, useLlmReady } from '@/components/providers/app-meta';

export function AuditorTab({
  reports,
  loading,
  onDone,
}: {
  reports: AuditReportT[] | null;
  loading: boolean;
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = useCanWrite();
  const llmReady = useLlmReady();
  const [latest, setLatest] = useState<AuditReportT | null>(null);

  const runAudit = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiCall<{ report: AuditReportT }>('/api/audit', { method: 'POST' });
      setLatest(res.report);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'audit failed');
    } finally {
      setRunning(false);
    }
  };

  const shown = latest ?? reports?.[0] ?? null;

  return (
    <div className="space-y-4">
      <Panel
        title="Autonomous Reflection Agent — LLM Market Auditor"
        subtitle="System 2 (Slow Thinking): อ่าน journal + gate attribution + calibration แล้วสรุป root cause และข้อเสนอการปรับระบบรอบถัดไป"
        right={
          <Button
            onClick={runAudit}
            disabled={running || !canWrite || !llmReady}
            title={!canWrite ? READ_ONLY_HINT : !llmReady ? LLM_MISSING_HINT : undefined}
            className="h-9 bg-amber-500 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
          >
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
            {running ? 'กำลังตรวจสอบ...' : 'รัน Audit ตอนนี้'}
          </Button>
        }
      >
        {(!canWrite || !llmReady) && (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{!canWrite ? READ_ONLY_HINT : LLM_MISSING_HINT}</p>
        )}
        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            Audit ล้มเหลว: {error}
          </p>
        )}
        {running && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Bot className="h-4 w-4 animate-pulse text-amber-300" />
              กำลังรวบรวมหลักฐาน (journal, gate attribution, backtest metrics, calibration) และให้ LLM วิเคราะห์...
            </div>
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        )}
        {!running && !shown && !error && loading && (
          <p className="py-8 text-center text-sm text-zinc-400" role="status">
            กำลังโหลดประวัติรายงาน…
          </p>
        )}
        {!running && !shown && !error && !loading && (
          <div className="py-8 text-center">
            <p className="text-sm text-zinc-500">ยังไม่มีรายงาน audit</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              แนะนำให้ &quot;เติมตัวอย่าง journal&quot; ในแท็บ Backtest &amp; Journal ก่อน เพื่อให้ auditor มีข้อมูลจริงวิเคราะห์
            </p>
          </div>
        )}
        {!running && shown && <AuditReportCard report={shown} />}
      </Panel>

      {reports && reports.length > 1 && (
        <Panel title="Audit History" subtitle="รายงานย้อนหลัง — ใช้ติดตามว่าคำแนะนำช่วยปรับปรุงรอบถัดไปหรือไม่ (A/B mindset)">
          <div className="space-y-3">
            {reports.slice(1).map((r) => (
              <AuditReportCard key={r.id} report={r} compact />
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Reflection Protocol (Meta-Cognition Loop)" subtitle="วงจรที่ทำให้ระบบเรียนรู้จากความผิดพลาดของตัวเอง">
        <ol className="space-y-2 text-xs leading-relaxed text-zinc-400">
          {[
            'Identify Discrepancies — เทียบ prediction vs ผลจริงจาก journal (ground truth)',
            'Root Cause Attribution — ใช้ gate attribution + feature evidence ระบุว่าอะไรทำให้พลาด',
            'Hypothesis Generation — ตั้งสมมติฐานใหม่เรื่องพฤติกรรมตลาดที่ยังจับไม่ได้',
            'Experimentation — ปรับ gate threshold / feature / ขนาดไม้ ตามคำแนะนำ แล้ววัดผลรอบถัดไป',
            'Knowledge Distillation — สรุปบทเรียนกลับเข้า governance (walk-forward, FDR, PIT, drift schedule)',
          ].map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 font-mono text-[9px] text-amber-300">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function AuditReportCard({ report, compact = false }: { report: AuditReportT; compact?: boolean }) {
  const riskPct = Math.round((report.riskAdjustment ?? 1) * 100);
  const riskTone = riskPct >= 80 ? 'text-emerald-400' : riskPct >= 50 ? 'text-amber-300' : 'text-rose-400';
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          รายงาน ณ {fmtDate(report.createdAt)}
        </p>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="flex items-center gap-1 text-zinc-400">
            <Gauge className="h-3.5 w-3.5" /> ปรับขนาดไม้เหลือ{' '}
            <span className={riskTone}>{riskPct}%</span>
          </span>
          <span className="text-zinc-500">conf {fmtNum(report.confidence * 100, 0)}%</span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-200">{report.summary}</p>
      {!compact && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-rose-500/25 bg-rose-500/[0.05] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-300/80">Root Cause</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-300">{report.rootCause}</p>
          </div>
          <div className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">Recommended Action</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-300">{report.recommendedAction}</p>
          </div>
        </div>
      )}
    </div>
  );
}
