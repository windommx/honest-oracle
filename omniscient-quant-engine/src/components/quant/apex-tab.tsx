'use client';

/**
 * apex-tab.tsx — แท็บ "Apex (L7)" — ชั้นสูงสุดของ Omniscient Quant Engine
 *
 * Apex Verdict → Kelly-Vol Sizing → Microstructure → Crisis Stress Test (MC 6 สถานการณ์)
 * → Model Registry (self-repudiating) → Reflexivity → กฎเหล็กของชั้น L7
 * กฎเหล็ก: ขนาดไม้สุดท้ายต้องรอดจากวิกฤตก่อนคุ้ม — exit > entry เสมอ
 */

import { useCallback, useState } from 'react';
import {
  ShieldCheck, ShieldX, ShieldAlert, Skull, AlertTriangle, Ban, CheckCircle2,
  RefreshCw, Loader2, Eye, LogOut, HelpCircle, Gavel,
} from 'lucide-react';
import { Panel, KpiCard } from '@/components/quant/quant-widgets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type {
  ApexResponse, ApexDossierT, KellySizingT, MicroMetricsT, CrisisResultT,
  CrisisScenarioT, RegistryRowT, RegistryResultT, KnightClassT, MirageFlagT,
  ReflexivityStateT2,
} from '@/lib/quant/api-types';

const REFLEX_STYLE: Record<ReflexivityStateT2['phase'], string> = {
  PRE_IGNITION: 'border-zinc-600 bg-zinc-800/60 text-zinc-300',
  IGNITION: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
  RUNNING: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
  EXHAUSTION: 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  COLLAPSE: 'border-rose-500/50 bg-rose-500/15 text-rose-300',
};

const REG_STATUS: Record<RegistryRowT['status'], { chip: string; bar: string }> = {
  ACTIVE: { chip: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-500/70' },
  PROBATION: { chip: 'border-amber-500/50 bg-amber-500/10 text-amber-300', bar: 'bg-amber-500/70' },
  DEAD: { chip: 'border-rose-500/50 bg-rose-500/15 text-rose-300', bar: 'bg-rose-500/70' },
};

const METER_TONE: Record<'emerald' | 'amber' | 'orange' | 'rose', string> = {
  emerald: 'bg-emerald-500/80',
  amber: 'bg-amber-500/80',
  orange: 'bg-orange-400/80',
  rose: 'bg-rose-500/80',
};

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** มาตรวัดแนวนอน 0–100 (aria meter) — สีเลือกโดยผู้เรียก */
function MeterBar({ value, tone, label }: { value: number; tone: 'emerald' | 'amber' | 'orange' | 'rose'; label: string }) {
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-zinc-800"
    >
      <div
        className={cn('h-full rounded-full', METER_TONE[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** 1 แถวของ waterfall: ป้ายซ้าย + ค่า mono ขวา */
function WfRow({ label, sub, value, valueCls }: { label: string; sub?: string; value: string; valueCls?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/50 py-2 last:border-b-0">
      <div className="min-w-0">
        <span className="text-xs text-zinc-300">{label}</span>
        {sub && <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{sub}</p>}
      </div>
      <span className={cn('shrink-0 font-mono text-xs', valueCls ?? 'text-zinc-100')}>{value}</span>
    </div>
  );
}

/** ชิป volume mirage / volume น่าเชื่อถือ */
function MirageChip({ mirage }: { mirage: MirageFlagT }) {
  return mirage.flagged ? (
    <div className="flex items-start gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <span><span className="font-mono font-semibold">VOLUME MIRAGE</span> — {mirage.reason}</span>
    </div>
  ) : (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-200">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      <span>volume น่าเชื่อถือ — {mirage.reason}</span>
    </div>
  );
}

/** กล่อง Knight classification: RISK (วัดได้) vs UNCERTAINTY (Knightian) */
function KnightChip({ knight }: { knight: KnightClassT }) {
  const risk = knight.cls === 'RISK';
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded border px-2 py-0.5 font-mono text-[11px] font-semibold',
            risk ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-amber-500/50 bg-amber-500/10 text-amber-300',
          )}
        >
          {risk ? 'RISK — วัดได้' : 'UNCERTAINTY — วัดไม่ได้ (Knightian)'}
        </span>
        {knight.haircut < 1 && (
          <span className="font-mono text-[10px] text-zinc-500">haircut ×{knight.haircut.toFixed(2)} ใช้แล้ว</span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{knight.reason}</p>
    </div>
  );
}

/** Panel 2 — Kelly-Vol Sizing waterfall */
function KellyWaterfall({ kelly }: { kelly: KellySizingT }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-4 py-1">
        <WfRow label="P(win) walk-forward" sub={kelly.source} value={`${(kelly.p * 100).toFixed(0)}%`} />
        <WfRow label="Reward:Risk" value={`1:${kelly.r.toFixed(2)}`} />
        <WfRow
          label="Full Kelly f*"
          value={kelly.fullKelly.toFixed(3)}
          valueCls={kelly.edgeGuard ? 'text-rose-400' : undefined}
        />
        <WfRow label="× ครึ่ง Kelly (0.5)" value={kelly.fracKelly.toFixed(3)} />
        <WfRow label="× Vol Targeting (20%/realized)" sub={`vol ${(kelly.volAnn * 100).toFixed(0)}%`} value={`×${kelly.volTargetMult.toFixed(2)}`} />
        <WfRow label="× DD Throttle" value={`×${kelly.ddThrottle.toFixed(2)}`} />
        <WfRow label="× Knight Haircut" value={`×${kelly.uncertaintyHaircut.toFixed(2)}`} />
        <WfRow label="= เสี่ยงต่อไม้" value={`${kelly.riskPerTradePct.toFixed(2)}%`} valueCls="text-amber-300" />
        <WfRow label="÷ ระยะถึง stop" value={`${kelly.lossAtStopPct.toFixed(1)}%`} />
        <WfRow label="= Kelly size" value={`${kelly.kellySizePct.toFixed(1)}%`} valueCls="font-semibold" />
        <WfRow label="min(Kelly, CVaR budget, cap 25%)" value={`${kelly.sizeBeforeMdxPct.toFixed(1)}%`} />
        <WfRow
          label="× Risk MDX override"
          sub={
            kelly.mdxOverride === 'NONE'
              ? 'ยังไม่ได้ประเมิน MDX'
              : `MDX ${kelly.mdxComposite ?? '—'} → ${kelly.mdxOverride === 'ZERO' ? 'ZERO ห้ามเปิดไม้ใหม่' : kelly.mdxOverride === 'HALF' ? 'HALF ลดครึ่ง' : 'OK ไม่ลด'}`
          }
          value={kelly.mdxOverride === 'ZERO' ? '×0' : kelly.mdxOverride === 'HALF' ? '×0.5' : '×1'}
          valueCls={kelly.mdxOverride === 'ZERO' ? 'text-rose-400' : kelly.mdxOverride === 'HALF' ? 'text-amber-300' : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Kelly-Vol</p>
          <p className="mt-1 font-mono text-lg font-semibold text-zinc-200">{kelly.kellySizePct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">CVaR Budget (G4)</p>
          <p className="mt-1 font-mono text-lg font-semibold text-zinc-200">{kelly.cvarSizePct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400/80">Final{kelly.mdxOverride === 'HALF' || kelly.mdxOverride === 'ZERO' ? ` · MDX ${kelly.mdxOverride}` : ''}</p>
          <p className={cn('mt-1 font-mono text-lg font-semibold', kelly.mdxOverride === 'ZERO' && kelly.sizeBeforeMdxPct > 0 ? 'text-rose-300' : 'text-emerald-300')}>{kelly.finalSizePct.toFixed(1)}%</p>
        </div>
      </div>

      {kelly.edgeGuard ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-xs leading-relaxed text-rose-200">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <span>{kelly.note}</span>
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-zinc-500">{kelly.note}</p>
      )}
    </div>
  );
}

/** Panel 3 — Microstructure 5 ข้อ */
function MicroBlock({ micro }: { micro: MicroMetricsT }) {
  const exitTone = micro.exitComplexity <= 25 ? 'emerald' : micro.exitComplexity <= 50 ? 'amber' : micro.exitComplexity <= 75 ? 'orange' : 'rose';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard
          label="CLV 20d"
          value={micro.clv20.toFixed(2)}
          sub="−1…+1 ปิดใกล้ high = สะสม"
          tone={micro.clv20 >= 0 ? 'up' : 'down'}
        />
        <KpiCard label="Spread (Roll)" value={`${micro.spreadBps.toFixed(0)} bps`} sub="bid-ask bounce (Roll estimator)" />
        <KpiCard label="Impact (1% ADV)" value={`${micro.amihudBps.toFixed(1)} bps`} sub="Amihud ต่อคำสั่ง 1% ของ ADV20" />
        <KpiCard
          label="Big-Lot Intensity"
          value={`${micro.bigLotPct.toFixed(2)}%`}
          sub={`flow5 vs turnover · ADV20 ${micro.adv20MB.toFixed(0)} MB`}
        />
      </div>

      <MirageChip mirage={micro.mirage} />

      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-200">Exit Complexity — ออกยากกว่าเข้าเสมอ</p>
          <p className="font-mono text-xs text-zinc-300">{micro.exitComplexity}/100</p>
        </div>
        <div className="mt-2">
          <MeterBar value={micro.exitComplexity} tone={exitTone} label="Exit complexity 0-100" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{micro.exitVerdict}</p>
        <p className="mt-1 font-mono text-[11px] text-zinc-500">
          slippage ประมาณ ±{micro.slippagePct.toFixed(2)}% ต่อฝั่ง (เข้า+ออก {(micro.slippagePct * 2).toFixed(2)}%)
        </p>
      </div>

      <KnightChip knight={micro.knight} />
    </div>
  );
}

/** ตาราง 6 สถานการณ์วิกฤต */
function CrisisTable({ scenarios }: { scenarios: CrisisScenarioT[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-1.5 font-medium">สถานการณ์</th>
            <th className="px-3 py-1.5 font-medium">ความเสียหายต่อพอร์ต</th>
            <th className="px-3 py-1.5 font-medium">ที่แผนวางไว้</th>
            <th className="px-3 py-1.5 font-medium">Stop</th>
            <th className="px-3 py-1.5 font-medium">รอด?</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((sc) => (
            <tr key={sc.key} className={cn('border-t border-zinc-800/60', !sc.survived && 'bg-rose-500/5')}>
              <td className="max-w-[320px] px-3 py-2">
                <p className="font-medium text-zinc-200">{sc.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">{sc.desc}</p>
                <p className="mt-1 text-[10px] leading-snug text-zinc-500">{sc.note}</p>
              </td>
              <td className={cn('px-3 py-2 font-mono', sc.portDamagePct <= 2 ? 'text-emerald-400' : 'text-rose-400')}>
                {sc.portDamagePct.toFixed(2)}%
              </td>
              <td className="px-3 py-2 font-mono text-zinc-300">{sc.plannedLossPct.toFixed(1)}%</td>
              <td className="px-3 py-2">
                {sc.stopExecuted === null ? (
                  <span className="text-zinc-500">—</span>
                ) : sc.stopExecuted ? (
                  <span className="text-emerald-400">ตัดได้</span>
                ) : (
                  <span className="text-rose-400">ไม่ได้ตัด</span>
                )}
              </td>
              <td className="px-3 py-2">
                {sc.survived ? (
                  <span className="inline-flex" title="รอด" aria-label="รอด"><ShieldCheck className="h-4 w-4 text-emerald-400" /></span>
                ) : (
                  <span className="inline-flex" title="ไม่รอด" aria-label="ไม่รอด"><ShieldX className="h-4 w-4 text-rose-400" /></span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Panel 4 — Crisis stress test: survival meter + ตาราง */
function CrisisBlock({ crisis }: { crisis: CrisisResultT }) {
  const tone = crisis.survivalScore >= 85 ? 'emerald' : crisis.survivalScore >= 60 ? 'amber' : 'rose';
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-200">Survival Score — รอดจริง ไม่ใช่รอดบนกระดาษ</p>
          <p className="font-mono text-xs text-zinc-300">{crisis.survivalScore}/100</p>
        </div>
        <div className="mt-2">
          <MeterBar value={crisis.survivalScore} tone={tone} label="Survival score 0-100" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{crisis.verdict}</p>
        <p className="mt-1 font-mono text-[10px] text-zinc-600">{crisis.paths.toLocaleString()} เส้นทางจำลองต่อสถานการณ์</p>
      </div>
      <CrisisTable scenarios={crisis.scenarios} />
    </div>
  );
}

/** Panel 5 — Model Registry table (sticky header, scroll เมื่อยาว) */
function RegistryTable({ registry }: { registry: RegistryResultT }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-zinc-800/60">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-1.5 font-medium">โมเดล</th>
            <th className="px-3 py-1.5 font-medium">ชื่อ / เวอร์ชัน</th>
            <th className="px-3 py-1.5 font-medium">Metric</th>
            <th className="px-3 py-1.5 font-medium">Health</th>
            <th className="px-3 py-1.5 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {registry.rows.map((r) => {
            const st = REG_STATUS[r.status];
            return (
              <tr key={r.id} className={cn('border-t border-zinc-800/60 align-top', r.status === 'DEAD' && 'bg-rose-500/5')}>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{r.id}</span>
                  <span className="ml-1.5 font-mono text-[9px] text-zinc-600">{r.layer}</span>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-zinc-200">{r.name}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-600">{r.version}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{r.note}</p>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{r.metric}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-800">
                      <div className={cn('h-full', st.bar)} style={{ width: `${Math.max(2, r.health)}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-zinc-400">{r.health}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={cn('inline-block rounded border px-1.5 py-0.5 font-mono text-[10px]', st.chip)}>{r.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ApexTab({ symbols }: { symbols: string[] }) {
  const [symbol, setSymbol] = useState(symbols[0] ?? 'TSE');
  const q = useApi<ApexResponse>(`/api/apex/${symbol}`);
  const d: ApexDossierT | null = q.data?.dossier ?? null;

  const changeSymbol = useCallback((s: string) => setSymbol(s), []);

  return (
    <div className="space-y-4">
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
        <Button onClick={q.refresh} variant="ghost" size="icon" className="border border-zinc-800" aria-label="รีเฟรช" title="รีเฟรช">
          <RefreshCw className={cn('h-4 w-4', q.loading && 'animate-spin')} />
        </Button>
        <p className="ml-auto hidden text-[11px] leading-snug text-zinc-500 lg:block">
          L7 Apex: Kelly-Vol sizing · microstructure · crisis MC · model registry — ขนาดไม้สุดท้ายต้องรอดทั้ง 6 สถานการณ์ก่อนคุ้ม
        </p>
      </div>

      {q.error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-300">โหลดข้อมูลไม่สำเร็จ: {q.error}</p>
          <button onClick={q.refresh} className="mt-3 rounded-md border border-rose-500/50 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10">ลองอีกครั้ง</button>
        </div>
      ) : q.loading || !d ? (
        <div className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          {/* Apex Verdict */}
          <Panel
            title={`Apex Verdict — ขนาดไม้สุดท้าย + Execution Adapter (${d.symbol} · ${d.name})`}
            subtitle={`${d.date} · ราคา ${d.price.toFixed(2)} · regime ${d.regime} · beta ${d.beta}`}
            right={
              d.kelly.edgeGuard ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-300">
                  <Ban className="h-3.5 w-3.5" />Kelly ปฏิเสธ
                </span>
              ) : d.verdict.risky ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />มีเงื่อนไข
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />พร้อมลงมือ
                </span>
              )
            }
          >
            <p className="text-sm leading-relaxed text-zinc-300">{d.verdict.headline}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard
                label="ขนาดไม้สุดท้าย"
                value={`${d.verdict.finalSizePct.toFixed(1)}%`}
                sub="ของพอร์ต (min ของ Kelly × CVaR แล้วเคารพคำสั่ง Risk MDX)"
              />
              <KpiCard
                label="ความเสี่ยงต่อไม้"
                value={`${d.verdict.riskPerTradePct.toFixed(2)}%`}
                sub="เพดาน 2% ของพอร์ต"
                tone={d.verdict.riskPerTradePct <= 2 ? 'up' : 'down'}
              />
              <KpiCard
                label="Survival Score"
                value={`${d.crisis.survivalScore}/100`}
                sub={trunc(d.crisis.verdict, 64)}
                tone={d.crisis.survivalScore >= 85 ? 'up' : d.crisis.survivalScore >= 60 ? 'warn' : 'down'}
              />
              <KpiCard
                label="สุขภาพระบบ"
                value={`${d.registry.systemHealth}/100`}
                sub={`ACTIVE ${d.registry.nActive} · PROBATION ${d.registry.nProbation} · DEAD ${d.registry.nDead}`}
                tone={d.registry.nDead === 0 && d.registry.systemHealth >= 60 ? 'up' : d.registry.nDead === 0 ? 'warn' : 'down'}
              />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Execution Adapter (exit &gt; entry)</p>
              <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-zinc-300">
                {d.verdict.execution.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </Panel>

          {/* Kelly-Vol Sizing */}
          <Panel
            title="1 · Kelly-Vol Sizing Engine — ครึ่ง Kelly × Vol Targeting × DD Throttle × Knight Haircut"
            subtitle="ทุกตัวเลขมาจาก walk-forward out-of-sample — ครึ่ง Kelly คือจุดสมดุลระหว่าง overbet กับ underbet"
          >
            <KellyWaterfall kelly={d.kelly} />
          </Panel>

          {/* Microstructure */}
          <Panel
            title="2 · Microstructure — ความจริงของหุ้นเล็ก 5 ข้อ"
            subtitle="spread · volume mirage · big-lot · exit &gt; entry · Knight uncertainty — วัดจาก OHLCV ดิบ"
          >
            <MicroBlock micro={d.micro} />
          </Panel>

          {/* Crisis Stress Test */}
          <Panel
            title="3 · Crisis Stress Test — Monte Carlo 6 สถานการณ์"
            subtitle="จำลองวิกฤตจริง: gap ผ่าน stop · สภาพคล่องแห้ง · ตลาดถล่ม · reflex collapse"
          >
            <CrisisBlock crisis={d.crisis} />
          </Panel>

          {/* Model Registry */}
          <Panel
            title="4 · Model Registry — ระบบที่รู้ว่าตัวเองตายเมื่อไหร่"
            subtitle={d.registry.verdict}
          >
            <RegistryTable registry={d.registry} />
          </Panel>

          {/* Reflexivity + กฎเหล็ก */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="5 · Reflexivity ณ วันนี้"
              subtitle="เทรดตำแหน่งในวงจร ไม่ใช่แค่มูลค่า"
              right={<span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-semibold', REFLEX_STYLE[d.reflex.phase])}>{d.reflex.label}</span>}
            >
              <p className="flex items-start gap-2 text-sm leading-relaxed text-zinc-300">
                <Eye className="mt-1 h-4 w-4 shrink-0 text-amber-400" />{d.reflex.detail}
              </p>
              <div className="mt-3 flex items-center gap-1 text-[10px] text-zinc-500">
                {['ยังไม่เริ่ม', 'จุดติด', 'กำลังไป', 'เหนื่อย', 'พังทลาย'].map((lbl, i) => {
                  const order = ['PRE_IGNITION', 'IGNITION', 'RUNNING', 'EXHAUSTION', 'COLLAPSE'];
                  const active = order.indexOf(d.reflex.phase) === i;
                  return (
                    <span key={lbl} className={cn('flex-1 rounded border px-1 py-1 text-center font-mono', active ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-zinc-800 text-zinc-600')}>
                      {lbl}
                    </span>
                  );
                })}
              </div>
            </Panel>
            <Panel
              title="6 · กฎเหล็กของชั้น L7"
              subtitle="นิ่งและไม่ต่อรอง — อ่านซ้ำก่อนเพิ่มขนาดทุกครั้ง"
              right={<Gavel className="h-4 w-4 text-amber-400" />}
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2.5 rounded border-l-2 border-amber-500/50 bg-amber-500/5 p-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-zinc-300">ขนาดไม้ต้องรอดจากวิกฤตก่อนคุ้ม — survival score &lt; 60 ห้ามเพิ่มขนาด</p>
                </div>
                <div className="flex items-start gap-2.5 rounded border-l-2 border-amber-500/50 bg-amber-500/5 p-3">
                  <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-zinc-300">ออกยากกว่าเข้าเสมอ (exit &gt; entry) — กัน slippage ทั้งสองฝั่งตั้งแต่คิดแผน</p>
                </div>
                <div className="flex items-start gap-2.5 rounded border-l-2 border-amber-500/50 bg-amber-500/5 p-3">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-zinc-300">ถ้าวัดไม่ได้ (Knightian) ให้หั่นขนาดครึ่งหนึ่ง ไม่ใช่เชื่อว่าโมเดลแม่น</p>
                </div>
                <div className="flex items-start gap-2.5 rounded border-l-2 border-amber-500/50 bg-amber-500/5 p-3">
                  <Skull className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-zinc-300">โมเดลที่ไม่ยอมตายเมื่อควรตาย = โมเดลที่จะพาพอร์ตไปอยู่นอกเกม</p>
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
