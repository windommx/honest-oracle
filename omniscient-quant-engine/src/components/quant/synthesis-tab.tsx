'use client';

/**
 * synthesis-tab.tsx — แท็บ "หลอมรวม" (Convergent-Evidence Synthesis)
 *
 * หลอมหลักฐาน 13 สายของเอนจิ้นให้เป็นบทวิเคราะห์หุ้นตัวเดียวที่เรียบเรียงแล้ว:
 *  1) มาตรวัดคะแนนบรรจบ (−100…+100) + คำตัดสิน
 *  2) ตารางสายหลักฐาน พร้อมโหวต/น้ำหนัก/สถานะ "ผ่านการตรวจจาก attribution"
 *  3) บทเรียบเรียงโดย LLM (พาดหัว/บทสรุป/การบรรจบ/มุมผิดพลาด)
 *  4) จุดแข็ง–จุดอ่อน, แผนเดินเกม, kill switches
 *  5) ประวัติรายงาน (append-only)
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Flame, Copy, Check, Sparkles, Loader2, RefreshCw, ShieldAlert,
  TrendingUp, TrendingDown, Minus, Archive, FlaskConical,
} from 'lucide-react';
import { Panel, KpiCard } from '@/components/quant/quant-widgets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useApi, apiCall } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type {
  SynthesisGetResponse, SynthesisPostResponse, SynthesisNarrativeT,
  EvidenceStrandT, SynthesisHistoryT, SynthesisVerdictT,
} from '@/lib/quant/api-types';
import { LLM_MISSING_HINT, READ_ONLY_HINT, useCanWrite, useLlmReady } from '@/components/providers/app-meta';

const VERDICT_STYLE: Record<SynthesisVerdictT['code'], string> = {
  STRONG_LONG: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
  LEAN_LONG: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  MIXED: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  LEAN_SHORT: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  STRONG_SHORT: 'border-rose-500/50 bg-rose-500/15 text-rose-300',
};

function voteChip(v: EvidenceStrandT['vote']) {
  const base = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold font-mono';
  if (v === 'LONG') return { cls: `${base} border-emerald-500/50 bg-emerald-500/15 text-emerald-300`, icon: <TrendingUp className="h-3 w-3" /> };
  if (v === 'SHORT') return { cls: `${base} border-rose-500/50 bg-rose-500/15 text-rose-300`, icon: <TrendingDown className="h-3 w-3" /> };
  return { cls: `${base} border-zinc-700 bg-zinc-800/70 text-zinc-400`, icon: <Minus className="h-3 w-3" /> };
}

/** มาตรวัดคะแนนบรรจบ −100…+100 */
function ConvergenceGauge({ score, agreement }: { score: number; agreement: number }) {
  // marker position: 0..100% ของแถบ
  const pos = ((score + 100) / 200) * 100;
  return (
    <div>
      <div className="relative h-8 w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
        {/* โซนทิศ */}
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-rose-500/25 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-emerald-500/25 to-transparent" />
        {/* เส้นกลาง + เส้น threshold ±55 */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-700" />
        <div className="absolute inset-y-0" style={{ left: `calc(${((55 + 100) / 200) * 100}% - 0.5px)` }}><div className="h-full w-px bg-emerald-500/40" /></div>
        <div className="absolute inset-y-0" style={{ left: `calc(${((-55 + 100) / 200) * 100}% - 0.5px)` }}><div className="h-full w-px bg-rose-500/40" /></div>
        {/* marker */}
        <div
          className="absolute top-0 h-full w-1 -translate-x-1/2 rounded bg-zinc-100 shadow-[0_0_10px_rgba(255,255,255,0.6)] transition-all duration-700"
          style={{ left: `${Math.min(99, Math.max(1, pos))}%` }}
          role="meter"
          aria-valuenow={score}
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-label={`คะแนนบรรจบ ${score}`}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-mono text-sm font-bold', score >= 25 ? 'text-emerald-300' : score <= -25 ? 'text-rose-300' : 'text-amber-300')}>
            {score > 0 ? '+' : ''}{score}
          </span>
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
        <span>−100 ขาลงชัด</span>
        <span>ความเห็นตายตรงกัน {Math.round(agreement * 100)}%</span>
        <span>ขาขึ้นชัด +100</span>
      </div>
    </div>
  );
}

function StrandRow({ s }: { s: EvidenceStrandT }) {
  const chip = voteChip(s.vote);
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-zinc-800/60 px-3 py-2.5 last:border-0 sm:grid-cols-[auto_minmax(0,7.5rem)_1fr_auto]">
      <div className="flex items-start pt-0.5">{chip.icon}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-zinc-200">{s.label}</span>
          <span className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[9px] text-zinc-500">{s.layer}</span>
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{s.value}</p>
        <div className="mt-1 flex items-center gap-2 sm:hidden">
          <span className={chip.cls}>{s.vote}</span>
          <span className={cn('font-mono text-[10px]', s.trusted ? 'text-emerald-400/80' : 'text-zinc-500')}>
            w {s.effWeight.toFixed(2)}{s.trusted ? ' ✓' : ' ½'}
          </span>
        </div>
      </div>
      <p className="col-span-2 text-[11px] leading-relaxed text-zinc-400 sm:col-span-1">{s.detail}</p>
      <div className="hidden flex-col items-end gap-1 sm:flex">
        <span className={chip.cls}>{s.vote}</span>
        <span className={cn('font-mono text-[10px]', s.trusted ? 'text-emerald-400/80' : 'text-zinc-500')} title={s.trusted ? 'gate นี้ผ่านการตรวจ attribution (SPEAKS_TRUTH)' : 'gate นี้ยังไม่ผ่าน attribution — น้ำหนักถูกหั่นครึ่ง'}>
          w {s.effWeight.toFixed(2)}{s.trusted ? ' ✓' : ' ½'}
        </span>
      </div>
    </div>
  );
}

export function SynthesisTab({ symbols, initialSymbol, onSelectSymbol }: { symbols: string[]; initialSymbol?: string; onSelectSymbol?: (s: string) => void }) {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState(initialSymbol && symbols.includes(initialSymbol) ? initialSymbol : (initialSymbol ?? symbols[0] ?? 'TSE'));
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [narrative, setNarrative] = useState<SynthesisNarrativeT | null>(null);
  const [reportText, setReportText] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const q = useApi<SynthesisGetResponse>(`/api/synthesis/${symbol}?r=${refreshKey}`);
  const canWrite = useCanWrite();
  const llmReady = useLlmReady();
  const dossier = q.data?.dossier ?? null;
  const history = useMemo(() => q.data?.history ?? [], [q.data]);

  const changeSymbol = useCallback((s: string) => {
    setSymbol(s);
    setNarrative(null);
    setReportText(null);
    onSelectSymbol?.(s);
  }, [onSelectSymbol]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await apiCall<SynthesisPostResponse>(`/api/synthesis/${symbol}`, { method: 'POST' });
      setNarrative(res.narrative);
      setReportText(res.reportText);
      setRefreshKey((k) => k + 1);
      toast({ title: 'หลอมรวมเสร็จ', description: `บทวิเคราะห์ ${symbol} ถูกเรียบเรียงและจัดเก็บแล้ว` });
    } catch (e) {
      toast({ title: 'หลอมรวมไม่สำเร็จ', description: e instanceof Error ? e.message : 'unknown error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [symbol, toast]);

  const handleCopy = useCallback(async () => {
    if (!dossier) return;
    const text = reportText ?? [
      `บทวิเคราะห์หลอมรวม — ${dossier.symbol} (${dossier.name}) · ${dossier.date}`,
      `คะแนนบรรจบ ${dossier.score > 0 ? '+' : ''}${dossier.score}/100 · ${dossier.verdict.label}`,
      ...dossier.strands.map((s) => `[${s.vote}] ${s.label} — ${s.value}: ${s.detail}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'คัดลอกไม่สำเร็จ', description: 'เบราว์เซอร์ไม่อนุญาตให้เข้าถึง clipboard', variant: 'destructive' });
    }
  }, [dossier, reportText, toast]);

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={symbol} onValueChange={changeSymbol}>
          <SelectTrigger className="w-[190px] border-zinc-800 bg-zinc-900 font-mono text-sm" aria-label="เลือกหุ้น">
            <SelectValue placeholder="เลือกหุ้น" />
          </SelectTrigger>
          <SelectContent className="max-h-72 border-zinc-800 bg-zinc-900 text-zinc-200">
            {symbols.map((s) => (
              <SelectItem key={s} value={s} className="font-mono text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleGenerate}
          disabled={generating || q.loading || !canWrite || !llmReady}
          title={!canWrite ? READ_ONLY_HINT : !llmReady ? LLM_MISSING_HINT : undefined}
          className="gap-1.5 bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
          {generating ? 'กำลังหลอมรวม...' : 'หลอมรวมด้วย AI'}
        </Button>
        <Button onClick={handleCopy} variant="outline" className="gap-1.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกรายงาน'}
        </Button>
        <Button onClick={q.refresh} variant="ghost" size="icon" className="border border-zinc-800" aria-label="รีเฟรช" title="รีเฟรช">
          <RefreshCw className={cn('h-4 w-4', q.loading && 'animate-spin')} />
        </Button>
        {(!canWrite || !llmReady) && (
          <p className="w-full text-[11px] leading-snug text-amber-200 sm:w-auto">{!canWrite ? READ_ONLY_HINT : LLM_MISSING_HINT}</p>
        )}
        <p className="ml-auto hidden text-[11px] leading-snug text-zinc-400 lg:block">
          หลอมหลักฐาน 13 สายจาก 8 เลเยอร์ (รวม L7 Apex) → คะแนนบรรจบ + บทเรียบเรียงโดย AI · รายงานจัดเก็บแบบ append-only
        </p>
      </div>

      {q.error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-300">โหลดข้อมูลไม่สำเร็จ: {q.error}</p>
          <button onClick={q.refresh} className="mt-3 rounded-md border border-rose-500/50 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10">ลองอีกครั้ง</button>
        </div>
      ) : q.loading || !dossier ? (
        <div className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          {/* คำตัดสิน + มาตรวัด */}
          <Panel
            title={`บทตัดสินหลอมรวม — ${dossier.symbol} (${dossier.name})`}
            subtitle={`${dossier.sector} · ${dossier.theme} · ราคา ${dossier.price.toFixed(2)} · panel ${dossier.date} · regime ${dossier.regime} (stress ${dossier.regimeStress.toFixed(2)} · drift ${dossier.drift})`}
            right={
              <span className={cn('rounded-md border px-2.5 py-1 text-xs font-semibold', VERDICT_STYLE[dossier.verdict.code])}>
                {dossier.verdict.label}
              </span>
            }
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <ConvergenceGauge score={dossier.score} agreement={dossier.agreement} />
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                  <span className="font-semibold text-zinc-100">ท่าที: </span>{dossier.verdict.action}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-56">
                <KpiCard label="โหวต LONG" value={`${dossier.nLong}`} tone="up" />
                <KpiCard label="โหวต SHORT" value={`${dossier.nShort}`} tone="down" />
                <KpiCard label="NEUTRAL" value={`${dossier.nNeutral}`} />
                <KpiCard label="สายหลักฐาน" value={`${dossier.strands.length}`} sub={`agree ${Math.round(dossier.agreement * 100)}%`} />
              </div>
            </div>
          </Panel>

          {/* บทเรียบเรียงโดย AI */}
          {narrative && (
            <Panel
              title="บทเรียบเรียงโดย AI"
              subtitle="หลอมหลักฐานทั้งหมดให้เป็นภาษาคน — ยึดข้อเท็จจริงจากเอนจิ้นเท่านั้น"
              right={<span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"><Sparkles className="h-3 w-3" />AI Synthesis</span>}
            >
              <div className="space-y-3">
                <h4 className="text-base font-bold leading-snug text-amber-200">{narrative.headline}</h4>
                {narrative.summary && <p className="text-sm leading-relaxed text-zinc-300">{narrative.summary}</p>}
                {narrative.convergence && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">การบรรจบของหลักฐาน</p>
                    <p className="text-sm leading-relaxed text-zinc-300">{narrative.convergence}</p>
                  </div>
                )}
                {narrative.risks.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                      <ShieldAlert className="h-3.5 w-3.5" /> มุมที่ผิดพลาดได้
                    </p>
                    <ul className="space-y-1">
                      {narrative.risks.map((r, i) => (
                        <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-zinc-400">
                          <span className="font-mono text-rose-400/70">?</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* ตารางหลักฐาน 13 สาย */}
          <Panel
            title="สายหลักฐานทั้งหมด"
            subtitle="โหวตของแต่ละสาย × น้ำหนัก (หั่นครึ่งถ้า gate ยังไม่ผ่าน attribution) = คะแนนบรรจบ"
            right={
              <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
                <span className="text-emerald-400">● LONG</span>
                <span className="text-rose-400">● SHORT</span>
                <span className="text-zinc-500">● NEUTRAL</span>
                <span>✓ = trusted</span>
              </div>
            }
          >
            <div tabIndex={0} role="region" aria-label="หลักฐาน 13 สาย" className="max-h-[26rem] overflow-y-auto rounded-lg border border-zinc-800/60 bg-zinc-950/40">
              {dossier.strands.map((s) => <StrandRow key={s.key} s={s} />)}
            </div>
          </Panel>

          {/* จุดแข็ง / จุดอ่อน */}
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="หลักฐานกระทิงแรงสุด" subtitle="เรียงตามน้ำหนักถ่วงน้ำหนัก">
              {dossier.strengthNotes.length === 0 ? (
                <p className="text-xs text-zinc-500">ไม่มีสายใดโหวตขาขึ้น</p>
              ) : (
                <ul className="space-y-2">
                  {dossier.strengthNotes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-zinc-300">
                      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{n}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="หลักฐานหมีแรงสุด" subtitle="สิ่งที่ต้องตอบให้ได้ก่อนเชื่อทิศขาขึ้น">
              {dossier.weaknessNotes.length === 0 ? (
                <p className="text-xs text-zinc-500">ไม่มีสายใดโหวตขาลง</p>
              ) : (
                <ul className="space-y-2">
                  {dossier.weaknessNotes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-zinc-300">
                      <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />{n}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* แผน + kill switch */}
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="แผนการเดินเกม" subtitle="เรียบเรียงจาก trade plan ของ L6">
              <ol className="space-y-2">
                {dossier.roadmap.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed text-zinc-300">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-300">{i + 1}</span>
                    {r}
                  </li>
                ))}
              </ol>
            </Panel>
            <Panel
              title="เงื่อนไขยกเลิก (Kill Switch)"
              subtitle="ข้อใดข้อหนึ่งเกิดขึ้น = ยุติทันที ไม่ต่อรอง"
              right={<Flame className="h-4 w-4 text-rose-400" />}
            >
              <ul className="space-y-2">
                {dossier.killSwitches.map((k, i) => (
                  <li key={i} className="flex gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 p-2 text-[12px] leading-relaxed text-rose-200/90">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />{k}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* ประวัติรายงาน */}
          <Panel
            title="ประวัติรายงานหลอมรวม"
            subtitle="append-only — ทุกครั้งที่กดหลอมรวมจะถูกเก็บเป็นหลักฐานอดีต ห้ามแก้ย้อนหลัง"
            right={<Archive className="h-4 w-4 text-zinc-600" />}
          >
            {history.length === 0 ? (
              <p className="text-xs text-zinc-500">ยังไม่มีรายงาน — กด &quot;หลอมรวมด้วย AI&quot; เพื่อสร้างรายการแรก</p>
            ) : (
              <div tabIndex={0} role="region" aria-label="ประวัติรายงานหลอมรวม" className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">เวลา</th>
                      <th className="px-3 py-2 font-medium">Panel</th>
                      <th className="px-3 py-2 font-medium">ราคา</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">L/S/N</th>
                      <th className="px-3 py-2 font-medium">คำตัดสิน</th>
                      <th className="px-3 py-2 font-medium">Regime</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-zinc-300">
                    {history.map((h: SynthesisHistoryT) => (
                      <tr key={h.id} className="border-t border-zinc-800/60">
                        <td className="px-3 py-1.5 text-zinc-500">{new Date(h.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-3 py-1.5">{h.runDate}</td>
                        <td className="px-3 py-1.5">{h.price.toFixed(2)}</td>
                        <td className={cn('px-3 py-1.5 font-bold', h.score >= 25 ? 'text-emerald-400' : h.score <= -25 ? 'text-rose-400' : 'text-amber-300')}>{h.score > 0 ? '+' : ''}{h.score}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{h.nLong}/{h.nShort}/{h.nNeutral}</td>
                        <td className="px-3 py-1.5 font-sans text-[11px]">{verdictThai(h.verdict)}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{h.regime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function verdictThai(code: string): string {
  switch (code) {
    case 'STRONG_LONG': return 'หลักฐานบรรจบขาขึ้น';
    case 'LEAN_LONG': return 'เอียงขาขึ้น';
    case 'MIXED': return 'ยังไม่บรรจบ';
    case 'LEAN_SHORT': return 'เอียงขาลง';
    case 'STRONG_SHORT': return 'หลักฐานบรรจบขาลง';
    default: return code;
  }
}
