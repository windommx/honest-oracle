'use client';

/**
 * meta-risk-tab.tsx — แท็บ "Meta-Risk" (หลอมรวม Part IV + Part V)
 *
 * Ruin Math → Risk of Ruin (Monte Carlo) → Defense in Depth 5 ชั้น
 * → Reflexivity → Death Conditions (โมเดลรู้ว่าตัวเองตายเมื่อไหร่) → Meta-Checklist 12 ข้อ
 * กฎเหล็ก: Absorbing Barrier มาก่อนทุกตัวเลข
 */

import { useCallback, useState } from 'react';
import {
  ShieldCheck, Skull, Flame, Scale, RefreshCw, Loader2,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, Layers, Eye, RotateCcw,
  Radar, TrendingUp,
} from 'lucide-react';
import { Panel, KpiCard } from '@/components/quant/quant-widgets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type {
  MetaRiskResponse, MetaRiskDossierT, RuinRowT, DefenseLayerT,
  DeathConditionT, ChecklistItemT, ReflexivityStateT,
  MdxDimT, RiskMdxT, AntifragilityIndexT,
} from '@/lib/quant/api-types';

const DIFF_CLS: Record<string, string> = {
  'ง่าย': 'text-emerald-400',
  'ปานกลาง': 'text-amber-300',
  'ยาก': 'text-orange-400',
  'ยากมาก': 'text-rose-400',
  'แทบเป็นไปไม่ได้': 'text-rose-400 font-semibold',
  'จบเกม': 'text-rose-500 font-bold',
};

const STATUS_STYLE: Record<DefenseLayerT['status'], { chip: string; label: string }> = {
  PASS: { chip: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300', label: 'ผ่าน' },
  WARN: { chip: 'border-amber-500/50 bg-amber-500/10 text-amber-300', label: 'ระวัง' },
  FAIL: { chip: 'border-rose-500/50 bg-rose-500/15 text-rose-300', label: 'รั่ว' },
  'N/A': { chip: 'border-zinc-700 bg-zinc-800 text-zinc-500', label: 'n/a' },
};

const REFLEX_STYLE: Record<ReflexivityStateT['phase'], string> = {
  PRE_IGNITION: 'border-zinc-600 bg-zinc-800/60 text-zinc-300',
  IGNITION: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
  RUNNING: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
  EXHAUSTION: 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  COLLAPSE: 'border-rose-500/50 bg-rose-500/15 text-rose-300',
};

const BAND_CHIP: Record<MdxDimT['band'], string> = {
  'ต่ำ': 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
  'กลาง': 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  'สูง': 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  'วิกฤต': 'border-rose-500/50 bg-rose-500/15 text-rose-300',
};

const BAND_BAR: Record<MdxDimT['band'], string> = {
  'ต่ำ': 'bg-emerald-500/80',
  'กลาง': 'bg-amber-500/80',
  'สูง': 'bg-orange-400/80',
  'วิกฤต': 'bg-rose-500/80',
};

function RuinTable({ rows, planLoss, entry }: { rows: RuinRowT[]; planLoss: MetaRiskDossierT['planLoss']; entry: MetaRiskDossierT['entry'] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">เส้นโค้งอสมมาตร — ขาลง 1 ก้าว ต้องขาขึ้นกี่ก้าว</p>
        <div className="overflow-hidden rounded-lg border border-zinc-800/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 font-medium">ขาดทุน</th>
                <th className="px-3 py-1.5 font-medium">ต้องกำไรเพื่อคืนทุน</th>
                <th className="px-3 py-1.5 font-medium">ความยาก</th>
              </tr>
            </thead>
            <tbody className="font-mono text-zinc-300">
              {rows.map((r) => (
                <tr key={r.lossPct} className={cn('border-t border-zinc-800/60', r.lossPct <= -50 && 'bg-rose-500/5')}>
                  <td className="px-3 py-1.5 text-rose-400">−{Math.abs(r.lossPct)}%</td>
                  <td className="px-3 py-1.5 text-zinc-100">+{r.recoveryPct}%</td>
                  <td className={cn('px-3 py-1.5', DIFF_CLS[r.difficulty] ?? 'text-zinc-400')}>{r.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          ใส่กับหุ้นนี้: entry {entry.low.toFixed(2)}–{entry.high.toFixed(2)} · stop แข็ง {entry.stopHard.toFixed(2)}
        </p>
        <div className="space-y-2">
          {planLoss.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
              <span className="text-xs text-zinc-300">{r.label}</span>
              <span className="font-mono text-xs">
                <span className="text-rose-400">{r.lossPct.toFixed(1)}%</span>
                <span className="mx-2 text-zinc-600">→</span>
                <span className="text-amber-300">ต้อง +{r.recoveryPct}%</span>
                <span className="ml-2 text-[10px] text-zinc-500">คืนทุน</span>
              </span>
            </div>
          ))}
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Stop loss ไม่ใช่ความกลัว — มันคือ &quot;คณิตศาสตร์บังคับ&quot;: ยิ่งยอมให้ขาดทุนลึก ยิ่งต้องการกำไรแบบทบต้นหลายเท่าเพื่อแค่กลับมาเท่าทุน ก่อนคิดค่าคอมและเวลาที่หายไป
          </p>
        </div>
      </div>
    </div>
  );
}

function RuinStatLine({ label, st }: { label: string; st: MetaRiskDossierT['ruinFixed'] }) {
  const good = label.includes('antifragile');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2.5">
      <span className={cn('w-40 shrink-0 text-xs font-medium', good ? 'text-emerald-300' : 'text-amber-300')}>{label}</span>
      <div className="grid flex-1 grid-cols-4 gap-2 text-center font-mono text-[11px]">
        <div><p className="text-[9px] uppercase text-zinc-500">P(−30%)</p><p className={st.pRuin30 <= 5 ? 'text-emerald-400' : st.pRuin30 <= 15 ? 'text-amber-300' : 'text-rose-400'}>{st.pRuin30}%</p></div>
        <div><p className="text-[9px] uppercase text-zinc-500">P(−50%)</p><p className={st.pRuin50 <= 2 ? 'text-emerald-400' : st.pRuin50 <= 8 ? 'text-amber-300' : 'text-rose-400'}>{st.pRuin50}%</p></div>
        <div><p className="text-[9px] uppercase text-zinc-500">median MDD</p><p className="text-zinc-300">{st.medianMaxDD}%</p></div>
        <div><p className="text-[9px] uppercase text-zinc-500">median ปลายทาง</p><p className="text-zinc-300">×{st.medianFinal.toFixed(2)}</p></div>
      </div>
    </div>
  );
}

function RuinGauge({ fixed, scaled, inputs }: { fixed: MetaRiskDossierT['ruinFixed']; scaled: MetaRiskDossierT['ruinScaled']; inputs: MetaRiskDossierT['ruinInputs'] }) {
  return (
    <div className="space-y-2">
      <RuinStatLine label="Sizing คงที่ (retail default)" st={fixed} />
      <RuinStatLine label="Drawdown-Scaled (antifragile)" st={scaled} />
      <p className="text-[11px] leading-relaxed text-zinc-500">
        จำลอง {fixed.paths.toLocaleString()} เส้นทาง × 48 ไม้/ปี · ใช้ P(win) = {(inputs.p * 100).toFixed(0)}%, ชนะเฉลี่ย +{inputs.avgWinPct.toFixed(2)}%, แพ้เฉลี่ย −{inputs.avgLossPct.toFixed(2)}%, เสี่ยง {inputs.riskPerTrade.toFixed(2)}% ต่อไม้ ({inputs.source}) ·
        แบบ scaled จะ<b className="text-zinc-400">ลดขนาดอัตโนมัติเมื่อพอร์ตติด DD</b> (scale = 1 − DD/20%, พื้น 0.25×) — ตลาดเป็นคนบอกว่าคุณควรกล้าแค่ไหน
      </p>
    </div>
  );
}

function DefenseStack({ layers }: { layers: DefenseLayerT[] }) {
  return (
    <div className="space-y-2">
      {layers.map((l, i) => {
        const st = STATUS_STYLE[l.status];
        return (
          <div key={l.layer} className="relative overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3 pl-4">
            <span className={cn('absolute inset-y-0 left-0 w-1', l.status === 'PASS' ? 'bg-emerald-500/70' : l.status === 'WARN' ? 'bg-amber-500/70' : 'bg-rose-500/70')} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">{l.layer}</span>
              <span className="text-xs font-semibold text-zinc-200">{l.name}</span>
              <span className={cn('ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px]', st.chip)}>{st.label}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{l.evidence}</p>
            {i < layers.length - 1 && null}
          </div>
        );
      })}
      <p className="pt-1 text-[11px] leading-relaxed text-zinc-500">
        <Layers className="mr-1 inline h-3 w-3" />เรือรอดเพราะ bulkhead หลายห้อง ไม่ใช่แผ่นเดียวหนา — ชั้น 3–5 ต้องทำงานอัตโนมัติแม้ตอนคุณหลับหรืออารมณ์เสีย เพราะมันคือเบรกที่กันคุณจากตัวคุณเอง
      </p>
    </div>
  );
}

function DeathTable({ deaths }: { deaths: DeathConditionT[] }) {
  const nTrig = deaths.filter((d) => d.triggered).length;
  return (
    <div className="space-y-2">
      <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs', nTrig === 0 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200')}>
        {nTrig === 0 ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        โมเดลที่ยิงเงื่อนไขตายแล้ว: {nTrig}/5 — &quot;ระบบสมบูรณ์แบบคือระบบที่หยุดเรียนรู้แล้ว&quot;
      </div>
      {deaths.map((d) => (
        <div key={d.model} className="flex items-start gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2.5">
          {d.triggered ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-200">{d.model}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{d.condition}</p>
            <p className={cn('mt-0.5 font-mono text-[11px]', d.triggered ? 'text-rose-300' : 'text-zinc-400')}>ตอนนี้: {d.live}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** การ์ด 1 มิติของ Risk MDX: ชื่อ + น้ำหนัก + คะแนน + แถบ meter + หลักฐานสด */
function MdxDimCard({ d }: { d: MdxDimT }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-200">{d.name}</span>
        <span className="font-mono text-[10px] text-zinc-600">w {d.weight.toFixed(2)}</span>
        <span className={cn('ml-auto shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]', BAND_CHIP[d.band])}>
          {d.band} {d.score}
        </span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={d.score}
        aria-label={`ความเสี่ยงมิติ${d.name}`}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
      >
        <div className={cn('h-full rounded-full', BAND_BAR[d.band])} style={{ width: `${Math.max(2, Math.min(100, d.score))}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{d.evidence}</p>
    </div>
  );
}

const OVR_STYLE: Record<RiskMdxT['override'], { chip: string; label: string }> = {
  OK: { chip: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300', label: 'ใช้ขนาดตามแผน' },
  HALF: { chip: 'border-amber-500/50 bg-amber-500/10 text-amber-300', label: 'ลดขนาดครึ่งหนึ่ง' },
  ZERO: { chip: 'border-rose-500/50 bg-rose-500/15 text-rose-300', label: 'ห้ามเปิดไม้ใหม่' },
};

function RiskMdxBlock({ mdx }: { mdx: RiskMdxT }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold', BAND_CHIP[mdx.band])}>
          MDX รวม {mdx.composite}/100 · {mdx.band}
        </span>
        <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold', OVR_STYLE[mdx.override].chip)}>
          SIZE OVERRIDE: {OVR_STYLE[mdx.override].label}
        </span>
        {mdx.topRisk && (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-400" />
            มิติเสี่ยงสุด: {mdx.topRisk.name} ({mdx.topRisk.score})
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {mdx.dims.map((d) => <MdxDimCard key={d.key} d={d} />)}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">{mdx.overrideNote}</p>
    </div>
  );
}

function AntifragilityBlock({ af }: { af: AntifragilityIndexT }) {
  const label = af.index >= 75 ? 'ANTIFRAGILE' : af.index >= 55 ? 'ROBUST' : af.index >= 35 ? 'FRAGILE' : 'บอบช้ำ';
  const chip = af.index >= 75 ? BAND_CHIP['ต่ำ'] : af.index >= 55 ? BAND_CHIP['กลาง'] : BAND_CHIP['วิกฤต'];
  const bar = af.index >= 75 ? 'bg-emerald-500/80' : af.index >= 55 ? 'bg-amber-500/80' : 'bg-rose-500/80';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold', chip)}>
          ดัชนี {af.index}/100 · {label}
        </span>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-300">{af.verdict}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {af.components.map((c) => (
          <div key={c.key} className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">{c.name}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-zinc-300">{c.score}</span>
            </div>
            <div
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={c.score}
              aria-label={c.name}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
            >
              <div className={cn('h-full rounded-full', bar)} style={{ width: `${Math.max(2, Math.min(100, c.score))}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{c.evidence}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        <TrendingUp className="mr-1 inline h-3 w-3" />Antifragile ไม่ได้แปลว่า “ชอบความเสี่ยง” — แปลว่าโครงสร้างถูกออกแบบให้ความผันผวนเป็นตัวช่วย: ลดขนาดเมื่อตลาดบอกว่าผิด และมีเงินสดพร้อมซื้อเมื่อราคาถูก
      </p>
    </div>
  );
}

function Checklist({ items }: { items: ChecklistItemT[] }) {
  const partIV = items.filter((i) => i.part === 'IV');
  const partV = items.filter((i) => i.part === 'V');
  const Item = ({ it }: { it: ChecklistItemT }) => (
    <div className="flex items-start gap-2.5 border-b border-zinc-800/60 px-3 py-2.5 last:border-0">
      {it.pass === true ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      ) : it.pass === false ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      ) : (
        <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
      )}
      <div>
        <p className="text-xs font-medium leading-snug text-zinc-200">{it.question}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">{it.answer}</p>
      </div>
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/40">
        <p className="border-b border-zinc-800/60 bg-zinc-900/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Part IV — ก่อนกดซื้อทุกครั้ง</p>
        {partIV.map((it) => <Item key={it.question} it={it} />)}
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/40">
        <p className="border-b border-zinc-800/60 bg-zinc-900/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Part V — ตัวระบบและการรับรู้ของคุณ</p>
        {partV.map((it) => <Item key={it.question} it={it} />)}
      </div>
    </div>
  );
}

export function MetaRiskTab({ symbols }: { symbols: string[] }) {
  const [symbol, setSymbol] = useState(symbols[0] ?? 'TSE');
  const q = useApi<MetaRiskResponse>(`/api/meta-risk/${symbol}`);
  const d = q.data?.dossier ?? null;

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
          Part IV + V หลอมเป็นตัวเลขสด: คณิตศาสตร์แห่งความพินาศ · Risk of Ruin · เกราะ 5 ชั้น · เงื่อนไขตายของโมเดล · Risk MDX 7 มิติ · Antifragility · กฎเหล็ก = อยู่รอดมาก่อน
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
          {/* Absorbing Barrier — บัญชีแรกเสมอ */}
          <Panel
            title={`Absorbing Barrier — ยังอยู่ในเกมไหมถ้าผิด? (${d.symbol} · ${d.name})`}
            subtitle={`${d.date} · ราคา ${d.price.toFixed(2)} · regime ${d.regime} · R/R 1:${d.entry.rr} · เสี่ยง ${d.ruinInputs.riskPerTrade.toFixed(2)}%/ไม้`}
            right={
              <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold', d.absorbingBarrier.inGame ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-rose-500/50 bg-rose-500/15 text-rose-300')}>
                {d.absorbingBarrier.inGame ? <ShieldCheck className="h-3.5 w-3.5" /> : <Skull className="h-3.5 w-3.5" />}
                {d.absorbingBarrier.inGame ? 'อยู่ในเกม' : 'เสี่ยงเกินขอบ'}
              </span>
            }
          >
            <p className="text-sm leading-relaxed text-zinc-300">{d.absorbingBarrier.verdict}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard label="P(Ruin −50%) scaled" value={`${d.ruinScaled.pRuin50}%`} sub="เป้า ≤ 2%" tone={d.ruinScaled.pRuin50 <= 2 ? 'up' : d.ruinScaled.pRuin50 <= 8 ? 'warn' : 'down'} />
              <KpiCard label="ความเสียหายต่อไม้" value={`${(d.ruinInputs.riskPerTrade).toFixed(2)}%`} sub="ของพอร์ต (≤ 2%)" tone={d.ruinInputs.riskPerTrade <= 2 ? 'up' : 'down'} />
              <KpiCard label="เงินสดโดยนัย" value={`${d.cashImpliedPct.toFixed(0)}%`} sub={`จากแผนรวมทุกสัญญาณ ${d.totalPlannedPct.toFixed(0)}%`} tone={d.cashImpliedPct >= 20 ? 'up' : 'warn'} />
              <KpiCard label="เงื่อนไขตายที่ยิงแล้ว" value={`${d.deaths.filter((x) => x.triggered).length}/5`} sub="โมเดลรู้ทันตัวเอง" tone={d.deaths.filter((x) => x.triggered).length === 0 ? 'up' : 'warn'} />
            </div>
          </Panel>

          {/* Ruin Math */}
          <Panel title="1 · คณิตศาสตร์แห่งความพินาศ" subtitle="ความเสี่ยงไม่สมมาตร — หลุดยิ่งลึก ยิ่งต้องใช้กำไรหลายเท่าเพื่อแค่คืนทุน" right={<Scale className="h-4 w-4 text-zinc-600" />}>
            <RuinTable rows={d.ruinRows} planLoss={d.planLoss} entry={d.entry} />
          </Panel>

          {/* Risk of Ruin MC */}
          <Panel title="2 · Risk of Ruin — วัดก่อนวัดผลตอบแทนเสมอ" subtitle="ถ้า ruin = 0 ทุกอย่างอื่นไม่มีความหมาย (คุณไม่มีพรุ่งนี้ให้เก็บเกี่ยว)">
            <RuinGauge fixed={d.ruinFixed} scaled={d.ruinScaled} inputs={d.ruinInputs} />
          </Panel>

          {/* Defense in depth */}
          <Panel title="3 · Defense in Depth — เกราะ 5 ชั้น" subtitle="ตรวจสดจากแผนเทรด + พอร์ต + Journal ของระบบ">
            <DefenseStack layers={d.defense} />
          </Panel>

          {/* Advanced metrics */}
          <Panel title="4 · มาตรวัดความเสี่ยงเชิงลึก (walk-forward out-of-sample)" subtitle="เก็บเป็นตัวเลขรายเดือนได้ เหมือนนักบัญชีดูงบ">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Sortino" value={d.advanced.sortino.toFixed(2)} sub="เป้า > 2" tone={d.advanced.sortino >= 2 ? 'up' : d.advanced.sortino >= 1 ? 'warn' : 'down'} />
              <KpiCard label="Calmar" value={d.advanced.calmar.toFixed(2)} sub="ต่อความเจ็บ 1 หน่วย ได้กี่หน่วย" tone={d.advanced.calmar >= 1 ? 'up' : d.advanced.calmar > 0 ? 'warn' : 'down'} />
              <KpiCard label="Profit Factor" value={d.advanced.profitFactor.toFixed(2)} sub="เป้า > 1.5" tone={d.advanced.profitFactor >= 1.5 ? 'up' : d.advanced.profitFactor >= 1 ? 'warn' : 'down'} />
              <KpiCard label="Expectancy/ไม้" value={`${d.advanced.expectancy > 0 ? '+' : ''}${d.advanced.expectancy.toFixed(2)}%`} sub="ต้องเป็นบวกสม่ำเสมอ" tone={d.advanced.expectancy > 0 ? 'up' : 'down'} />
              <KpiCard label="Max Drawdown" value={`${d.advanced.maxDD.toFixed(1)}%`} sub="เจ็บสุดที่เคยเจอ" tone={d.advanced.maxDD <= 15 ? 'up' : d.advanced.maxDD <= 20 ? 'warn' : 'down'} />
              <KpiCard label="Hit Rate" value={`${d.advanced.hitRate.toFixed(1)}%`} sub="ไม่ใช่ทุกอย่าง แต่ต้องไม่พัง" />
            </div>
          </Panel>

          {/* Reflexivity + Death conditions */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="5 · ตำแหน่งในวงจร Reflexivity"
              subtitle="เทรดตำแหน่งในวงจร ไม่ใช่แค่มูลค่า"
              right={<span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-semibold', REFLEX_STYLE[d.reflexivity.phase])}>{d.reflexivity.label}</span>}
            >
              <p className="flex items-start gap-2 text-sm leading-relaxed text-zinc-300">
                <Eye className="mt-1 h-4 w-4 shrink-0 text-amber-400" />{d.reflexivity.detail}
              </p>
              <div className="mt-3 flex items-center gap-1 text-[10px] text-zinc-500">
                {['ยังไม่เริ่ม', 'จุดติด', 'กำลังไป', 'เหนื่อย', 'พังทลาย'].map((lbl, i) => {
                  const order = ['PRE_IGNITION', 'IGNITION', 'RUNNING', 'EXHAUSTION', 'COLLAPSE'];
                  const active = order.indexOf(d.reflexivity.phase) === i;
                  return (
                    <span key={lbl} className={cn('flex-1 rounded border px-1 py-1 text-center font-mono', active ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-zinc-800 text-zinc-600')}>
                      {lbl}
                    </span>
                  );
                })}
              </div>
            </Panel>
            <Panel
              title="6 · เงื่อนไขการตายของโมเดล (Self-Repudiating)"
              subtitle="ความฉลาด = สร้างโมเดลที่รู้ว่าตัวเองผิดเมื่อไหร่"
              right={<RotateCcw className="h-4 w-4 text-zinc-600" />}
            >
              <DeathTable deaths={d.deaths} />
            </Panel>
          </div>

          {/* Meta checklist */}
          <Panel
            title="7 · Meta-Checklist 12 ข้อ — คำนวณจากข้อมูลสด"
            subtitle="ข้อไหนตอบ 'ไม่' ให้แก้โครงสร้างก่อน ไม่ใช่ฝืนใจเข้าไม้"
            right={<Flame className="h-4 w-4 text-rose-400" />}
          >
            <Checklist items={d.checklist} />
          </Panel>

          {/* Risk MDX — 7 มิติความเสี่ยง (Part IV ชิ้นสุดท้าย) */}
          <Panel
            title="8 · Risk MDX — ภาพรวมความเสี่ยง 7 มิติ"
            subtitle="ถอดความเสี่ยงของไม้นี้ออกเป็นมิติ (0–100 ยิ่งสูงยิ่งเสี่ยง) — เน้น Liquidity + Behavioral แล้วสรุปเป็นคำสั่งขนาดไม้"
            right={<Radar className="h-4 w-4 text-zinc-600" />}
          >
            <RiskMdxBlock mdx={d.riskMdx} />
          </Panel>

          {/* Antifragility Index (Part V) */}
          <Panel
            title="9 · ดัชนี Antifragility — อยู่รอดแล้วได้ประโยชน์จากความโกลาหลแค่ไหน"
            subtitle="คะแนนยิ่งสูงยิ่งดี: ระบบแข็งแรงไม่ได้แค่ “ทน” แต่หดขนาดก่อนเจ็บหนักและมีกระสุนซื้อของถูกตอนคนอื่น panic"
            right={<TrendingUp className="h-4 w-4 text-zinc-600" />}
          >
            <AntifragilityBlock af={d.antifragility} />
          </Panel>
        </>
      )}
    </div>
  );
}
