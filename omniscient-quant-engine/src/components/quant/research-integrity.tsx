'use client';

/**
 * ความซื่อตรงของงานวิจัย (Research integrity)
 *  - RulesPanel: กติกาทั้งชุดเป็นข้อมูล + sha256 · สถานะการล็อก (pre-registration) · ป้าย "จูนบนข้อมูลจำลอง"
 *  - RobustnessPanel: กติกาเดียวกันบนโลกจำลองหลาย seed — ผลทางเดียวกันไหม (ไม่ใช่หลักฐานว่ามี edge ในตลาดจริง)
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Lock, Play, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from './quant-widgets';
import { apiCall, useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RobustnessReportT, RulesResponseT } from '@/lib/quant/api-types';
import { READ_ONLY_HINT, useAppMeta, useCanWrite } from '@/components/providers/app-meta';

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function RulesStatusBadge({ rules }: { rules: Pick<RulesResponseT, 'registered' | 'matchesRegistered'> }) {
  if (!rules.registered) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
        <AlertTriangle className="h-3 w-3" aria-hidden /> ยังไม่ล็อก
      </span>
    );
  }
  return rules.matchesRegistered ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
      <CheckCircle2 className="h-3 w-3" aria-hidden /> ตรงกับที่ล็อกไว้
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
      <ShieldAlert className="h-3 w-3" aria-hidden /> ถูกแก้หลังล็อก
    </span>
  );
}

export function RulesPanel() {
  const q = useApi<RulesResponseT>('/api/rules');
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = useCanWrite();
  const { refresh: refreshMeta } = useAppMeta();
  const r = q.data;

  const lock = async () => {
    setBusy(true);
    try {
      const res = await apiCall<{ registration: { hash: string } }>('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      toast({ title: 'ล็อกกติกาแล้ว', description: `hash ${res.registration.hash.slice(0, 12)} — รายงานทุกหน้าจะบอกว่าใช้กติกาชุดนี้หรือไม่` });
      setNote('');
      q.refresh();
      refreshMeta(); // แถบล่าง/รายงานอื่นเห็นสถานะการล็อกใหม่ทันที
    } catch (e) {
      toast({ title: 'ล็อกไม่สำเร็จ', description: e instanceof Error ? e.message : 'unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="กติกาที่ใช้ (pre-registration)"
      subtitle="ทุก threshold/น้ำหนักอยู่ในชุดเดียว (RULES) · แก้ค่าใดก็ตาม hash เปลี่ยน · ล็อกก่อนดูผลรอบใหม่ = กันการจูนย้อนหลังให้ผลสวย"
      right={r ? <RulesStatusBadge rules={r} /> : null}
    >
      {q.error ? (
        <p role="alert" className="text-xs text-rose-300">โหลดกติกาไม่สำเร็จ: {q.error}</p>
      ) : !r ? (
        <p className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> กำลังโหลดกติกา…
        </p>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-zinc-400">hash (sha256)</dt>
              <dd className="font-mono text-zinc-100" title={r.hash}>{r.hashShort}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">เวอร์ชันกติกา</dt>
              <dd className="font-mono text-zinc-100">{r.version}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">ล็อกล่าสุด</dt>
              <dd className="text-zinc-100">
                {r.registered ? (
                  <>
                    <span className="font-mono">{r.registered.hashShort}</span> · {fmtWhen(r.registered.at)} · {r.registered.actor}
                  </>
                ) : (
                  'ยังไม่เคยล็อก'
                )}
              </dd>
            </div>
          </dl>

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
            <p className="flex items-center gap-1.5 font-semibold">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden /> จูนบนข้อมูลจำลอง
            </p>
            <p className="mt-1">{r.provenance.tunedOn}</p>
            <p className="mt-1 text-amber-200/90">{r.provenance.note}</p>
          </div>

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void lock();
            }}
          >
            <label htmlFor="rules-note" className="sr-only">
              บันทึกเหตุผลการล็อก (ไม่บังคับ)
            </label>
            <Input
              id="rules-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เหตุผล เช่น 'ล็อกก่อนรัน forward test เดือน ต.ค.' (ไม่บังคับ)"
              className="h-9 border-zinc-700 bg-zinc-950 text-xs"
            />
            <Button type="submit" size="sm" disabled={busy || !canWrite} title={canWrite ? undefined : READ_ONLY_HINT} className="h-9 shrink-0 gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Lock className="h-3.5 w-3.5" aria-hidden />}
              ล็อกกติกาชุดนี้
            </Button>
          </form>

          {r.history.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">ประวัติการล็อก</p>
              <ul className="space-y-1 text-xs">
                {r.history.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-zinc-300">
                    <span className={cn('font-mono', h.rulesHash === r.hash ? 'text-emerald-300' : 'text-zinc-400')}>{h.hashShort}</span>
                    <span className="text-zinc-400">{fmtWhen(h.createdAt)} · {h.actor}</span>
                    {h.note && <span className="text-zinc-300">— {h.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="rounded-lg border border-zinc-800 bg-zinc-950/60">
            <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-300">ดูกติกาทั้งชุด (JSON)</summary>
            <pre
              tabIndex={0}
              aria-label="กติกาทั้งชุดในรูป JSON"
              className="max-h-72 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-zinc-300"
            >
              {JSON.stringify(r.rules, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </Panel>
  );
}

const VERDICT_STYLE: Record<RobustnessReportT['summary']['verdict'], { cls: string; label: string }> = {
  STABLE: { cls: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200', label: 'ทนทาน (STABLE)' },
  MIXED: { cls: 'border-amber-500/50 bg-amber-500/10 text-amber-200', label: 'ปนกัน (MIXED)' },
  UNSTABLE: { cls: 'border-rose-500/50 bg-rose-500/10 text-rose-200', label: 'ไม่ทนทาน (UNSTABLE)' },
};

const LABEL_STYLE: Record<'ROBUST' | 'FRAGILE' | 'NOISE', string> = {
  ROBUST: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  FRAGILE: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
  NOISE: 'border-zinc-600 bg-zinc-800/60 text-zinc-300',
};

export function RobustnessPanel() {
  const [run, setRun] = useState(false);
  const q = useApi<RobustnessReportT>(run ? '/api/research/robustness' : null);
  const rep = q.data;

  return (
    <Panel
      title="ความทนทานข้าม seed (robustness)"
      subtitle="สุ่มโลกจำลองใหม่หลาย seed แล้วรันกติกาเดิมทั้งท่อ (panel → walk-forward → gate attribution) · ถ้าผลกลับทิศเมื่อเปลี่ยน seed แปลว่าผลของ seed เดียวคือโชค"
      right={
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-zinc-700 text-xs"
          disabled={q.loading}
          onClick={() => (run ? q.refresh() : setRun(true))}
        >
          {q.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          {rep ? 'รันใหม่' : 'รันทดสอบ 5 seed'}
        </Button>
      }
    >
      {!run ? (
        <p className="text-xs leading-relaxed text-zinc-400">
          ใช้เวลาราว 3 วินาทีต่อ seed ในครั้งแรก (ผลถูก cache ต่อ process จนกว่ากติกาจะเปลี่ยน) · seed ของ demo ต้องให้ผลเท่ากับตัวเลขด้านบนทุกตัว (ท่อคำนวณเดียวกัน)
        </p>
      ) : q.error ? (
        <p role="alert" className="text-xs text-rose-300">รันไม่สำเร็จ: {q.error}</p>
      ) : !rep ? (
        <p className="flex items-center gap-2 text-xs text-zinc-400" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> กำลังรัน generator → panel → walk-forward ทีละ seed…
        </p>
      ) : (
        <div className="space-y-3">
          <div className={cn('rounded-lg border p-3 text-xs leading-relaxed', VERDICT_STYLE[rep.summary.verdict].cls)}>
            <p className="font-semibold">{VERDICT_STYLE[rep.summary.verdict].label}</p>
            <p className="mt-1">{rep.summary.note}</p>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-zinc-400">Hit rate (ต่ำสุด–สูงสุด)</dt>
              <dd className="font-mono text-zinc-100">{fmtNum(rep.summary.hitRate.min, 1)}–{fmtNum(rep.summary.hitRate.max, 1)}%</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Sharpe (ต่ำสุด–สูงสุด)</dt>
              <dd className="font-mono text-zinc-100">{fmtNum(rep.summary.sharpe.min)}–{fmtNum(rep.summary.sharpe.max)}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Max DD เฉลี่ย</dt>
              <dd className="font-mono text-zinc-100">{fmtNum(rep.summary.maxDD.mean, 1)}%</dd>
            </div>
            <div>
              <dt className="text-zinc-400">ชนะ Buy &amp; Hold</dt>
              <dd className="font-mono text-zinc-100">{rep.summary.beatsBuyHold}/{rep.runs.length} seed</dd>
            </div>
          </dl>

          <div tabIndex={0} role="region" aria-label="ผลต่อ seed" className="overflow-x-auto rounded-lg border border-zinc-800/80">
            <table className="w-full min-w-[640px] text-left text-xs">
              <caption className="sr-only">ผล walk-forward ต่อ seed</caption>
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Seed</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">สัญญาณ</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Hit rate [95% CI]</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Sharpe</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Max DD</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">กลยุทธ์ / B&amp;H</th>
                  <th scope="col" className="px-2 py-2 font-medium">Regime ล่าสุด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rep.runs.map((sr) => (
                  <tr key={sr.seed}>
                    <th scope="row" className="px-3 py-1.5 text-left font-mono font-semibold text-zinc-200">
                      {sr.seed}
                      {sr.seed === rep.demoSeed && <span className="ml-1.5 rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-normal text-zinc-300">demo</span>}
                    </th>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{sr.nSignals}</td>
                    <td className={cn('px-2 py-1.5 text-right font-mono', sr.hitRate >= 50 ? 'text-emerald-300' : 'text-rose-300')}>
                      {fmtNum(sr.hitRate, 1)}% <span className="text-zinc-400">[{fmtNum(sr.hitRateCI[0], 1)}–{fmtNum(sr.hitRateCI[1], 1)}]</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmtNum(sr.sharpe)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmtNum(sr.maxDD, 1)}%</td>
                    <td className={cn('px-2 py-1.5 text-right font-mono', sr.cumStrat > sr.cumBase ? 'text-emerald-300' : 'text-zinc-300')}>
                      {fmtPct(sr.cumStrat)} / {fmtPct(sr.cumBase)}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-300">{sr.regime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div tabIndex={0} role="region" aria-label="ความทนทานต่อ gate" className="overflow-x-auto rounded-lg border border-zinc-800/80">
            <table className="w-full min-w-[560px] text-left text-xs">
              <caption className="sr-only">gate ไหน &quot;พูดจริง&quot; ข้าม seed</caption>
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Gate</th>
                  <th scope="col" className="px-2 py-2 font-medium">ป้าย</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">SPEAKS_TRUTH</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">edge &gt; 0</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">edge เฉลี่ย (bp)</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">ต่ำสุด–สูงสุด (bp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rep.summary.gates.map((g) => (
                  <tr key={g.gate}>
                    <th scope="row" className="px-3 py-1.5 text-left font-mono font-semibold text-zinc-200">{g.gate}</th>
                    <td className="px-2 py-1.5">
                      <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium', LABEL_STYLE[g.label])}>{g.label}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{g.speaksTruth}/{rep.runs.length}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{g.positiveEdge}/{rep.runs.length}</td>
                    <td className={cn('px-2 py-1.5 text-right font-mono', g.meanEdge > 0 ? 'text-emerald-300' : 'text-rose-300')}>{fmtNum(g.meanEdge * 100, 1)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
                      {fmtNum(g.minEdge * 100, 1)} – {fmtNum(g.maxEdge * 100, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            ROBUST = พูดจริงอย่างน้อย 80% ของ seed · FRAGILE = บาง seed · NOISE = แทบไม่มี seed ที่ผ่าน · ทุก seed ใช้กติกา hash {rep.rulesHash.slice(0, 12)} · คำนวณ {fmtWhen(rep.computedAt)} ({fmtNum(rep.tookMs / 1000, 1)} วินาที)
          </p>
        </div>
      )}
    </Panel>
  );
}
