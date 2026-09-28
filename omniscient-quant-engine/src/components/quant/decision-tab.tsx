'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { CheckCircle2, XCircle, Save, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Panel, GateChips, SignalBadge } from './quant-widgets';
import GateRibbon from '@/components/charts/gate-ribbon';
import { fmtNum, fmtPct, fmtBaht, fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BoardResponse, DecisionResponse } from '@/lib/quant/api-types';

const GATE_DETAILS: Array<{ key: 'g1' | 'g2' | 'g3' | 'g4' | 'g5'; label: string; question: string }> = [
  { key: 'g1', label: 'G1 · Regime', question: 'ตลาดอยู่ภาวะที่เอื้อไหม?' },
  { key: 'g2', label: 'G2 · Dependence', question: 'หุ้นวิ่งด้วยเรื่องของตัวเอง + tail risk คุมอยู่ไหม?' },
  { key: 'g3', label: 'G3 · Technical', question: 'โครงสร้างราคาสนับสนุนไหม?' },
  { key: 'g4', label: 'G4 · Risk', question: 'ความเสี่ยงต่อไม้อยู่ในงบไหม?' },
  { key: 'g5', label: 'G5 · Execution', question: 'จะเข้าโดยไม่จ่ายแพงไหม?' },
];

export function DecisionTab({
  symbols,
  symbol,
  onSymbolChange,
  decision,
  loading,
  board,
  onSaveToJournal,
  saving,
}: {
  symbols: string[];
  symbol: string;
  onSymbolChange: (s: string) => void;
  decision: DecisionResponse | null;
  loading: boolean;
  board: BoardResponse | null;
  onSaveToJournal: () => void;
  saving: boolean;
}) {
  const priceData = useMemo(
    () => (decision ? decision.priceSeries.map((r) => ({ ...r, dateLabel: r.date.slice(5) })) : []),
    [decision],
  );

  if (loading || !decision) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  const { eval: ev, risk, row } = decision;
  const boardRow = board?.rows.find((r) => r.symbol === decision.symbol);
  const priceMin = Math.min(...priceData.map((p) => p.close), ev.plan.stopHard, ev.plan.stopStruct);
  const priceMax = Math.max(...priceData.map((p) => p.close));

  return (
    <div className="space-y-4">
      {/* Selector + header */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <Select value={symbol} onValueChange={onSymbolChange}>
          <SelectTrigger className="w-52 border-zinc-700 bg-zinc-900 font-mono text-sm" aria-label="เลือกหุ้น">
            <SelectValue placeholder="เลือกหุ้น" />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900 max-h-72">
            {symbols.map((s) => (
              <SelectItem key={s} value={s} className="font-mono text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <h2 className="font-mono text-lg font-bold text-zinc-100">
            {decision.symbol} <span className="text-sm font-normal text-zinc-500">{decision.name}</span>
          </h2>
          <p className="text-[11px] text-zinc-500">
            {decision.sector} · {decision.theme} · beta {fmtNum(decision.beta)} · ณ {fmtDate(row.date)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SignalBadge signal={ev.signal} />
          <GateChips gates={ev.gates} size="md" />
          <Button
            size="sm"
            onClick={onSaveToJournal}
            disabled={saving}
            className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-500"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกแผน → Journal'}
          </Button>
        </div>
      </div>

      {/* 5 Gates checklist + Trade plan */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="5-Gate Decision Checklist" subtitle="ทุก gate ต้องผ่านพร้อมกันจึงจะได้สัญญาณเข้าแบบ Pullback (convergent evidence)">
          <div className="space-y-2">
            {GATE_DETAILS.map((g) => {
              const pass = ev.gates[g.key];
              return (
                <div
                  key={g.key}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                    pass ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-rose-500/30 bg-rose-500/[0.05]',
                  )}
                >
                  {pass ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-200">
                      {g.label} <span className="font-normal text-zinc-500">— {g.question}</span>
                    </p>
                    <p className="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-zinc-400">
                      {ev.reasons[g.key]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <p className="font-mono text-[11px] leading-relaxed text-amber-200/90">{ev.plan.killSwitch}</p>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Trade Plan" subtitle={`สัญญาณ: ${ev.signal} · กำลังผลิตจาก gate state ปัจจุบัน`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <PlanCell label="โซน Limit (Pullback)" value={`${fmtNum(ev.plan.entryLow)} – ${fmtNum(ev.plan.entryHigh)}`} tone="neutral" />
              <PlanCell label="Trigger (Momentum)" value={fmtNum(ev.plan.trigger)} tone="neutral" sub="ทะลุ + OBV new high" />
              <PlanCell label="ขนาดสูงสุดของพอร์ต" value={`${fmtNum(ev.plan.sizePct, 1)}%`} tone="up" sub="งบเสี่ยง 1%/วัน ÷ CVaR" />
              <PlanCell label="Structural Stop" value={fmtBaht(ev.plan.stopStruct)} tone="down" sub="แนวรับโครงสร้าง 15 วัน" />
              <PlanCell label="Hard Stop (1d 99%)" value={fmtBaht(ev.plan.stopHard)} tone="down" sub={`VaR99 = ${(ev.plan.var99 * 100).toFixed(1)}%`} />
              <PlanCell label="CVaR 1 วัน (97.5%)" value={`${(ev.plan.cvar * 100).toFixed(2)}%`} tone="down" sub={`MC ${risk.paths.toLocaleString()} paths · t(4)`} />
            </div>
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[11px] text-zinc-400">
              P(up) โมเดล walk-forward = <span className={ev.probUp >= 0.55 ? 'text-emerald-400' : 'text-zinc-200'}>{fmtPct(ev.probUp * 100, 0)}</span>
              {' '}· Phase ปัจจุบัน: <span className="text-zinc-200">{ev.phase}</span>
            </div>
          </Panel>

          <Panel title="Fundamental Snapshot (Point-in-Time)" subtitle="ใช้งบฉบับที่เผยแพร่แล้ว ณ วันนั้นเท่านั้น — กัน look-ahead bias">
            <div className="grid grid-cols-3 gap-2 font-mono text-xs sm:grid-cols-6">
              <PlanCell label="P/E" value={fmtNum(row.pe, 1)} tone="neutral" compact />
              <PlanCell label="P/B" value={fmtNum(row.pb, 2)} tone="neutral" compact />
              <PlanCell label="ROE" value={`${fmtNum(row.roe, 1)}%`} tone={row.roe > 8 ? 'up' : 'neutral'} compact />
              <PlanCell label="D/E" value={fmtNum(row.de, 2)} tone="neutral" compact />
              <PlanCell label="Rev Growth" value={`${fmtNum(row.revG, 1)}%`} tone={row.revG > 0 ? 'up' : 'down'} compact />
              <PlanCell label="Flow 5d" value={`${row.flow5.toFixed(0)}M`} tone={row.flow5 > 0 ? 'up' : 'down'} compact />
            </div>
            <div className="mt-3 space-y-1">
              {decision.fundamentals.slice(0, 3).map((f) => (
                <p key={f.period} className="text-[11px] text-zinc-500">
                  <span className="font-mono text-zinc-400">{f.period}</span> ประกาศ {fmtDate(f.announceDate)} · กำไร {f.netProfitM.toLocaleString()} ลบ.
                </p>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* Price chart + gate ribbon */}
      <Panel
        title={`${decision.symbol} — ราคา 250 วัน + เส้น Plan`}
        subtitle="เส้นประ = โซนเข้า / trigger / stop ทั้งสองระดับ"
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 9, fill: '#71717a' }} tickLine={false} interval={40} />
              <YAxis
                tick={{ fontSize: 9, fill: '#71717a' }}
                tickLine={false}
                width={52}
                domain={[Math.floor(priceMin * 0.97 * 100) / 100, Math.ceil(priceMax * 1.03 * 100) / 100]}
                tickFormatter={(v: number) => v.toFixed(decision.row.close < 10 ? 2 : 0)}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11, borderRadius: 8 }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(v: number | string, name: string) => [
                  fmtNum(Number(v), decision.row.close < 10 ? 3 : 2),
                  name === 'close' ? 'ราคาปิด' : name === 'ma20' ? 'MA20' : name,
                ]}
              />
              <Line type="monotone" dataKey="close" stroke="#34d399" strokeWidth={1.6} dot={false} />
              <Line type="monotone" dataKey="ma20" stroke="#a1a1aa" strokeWidth={1} dot={false} strokeDasharray="2 3" />
              <ReferenceLine y={ev.plan.entryHigh} stroke="#fbbf24" strokeDasharray="4 3" label={{ value: 'โซนเข้าบน', fontSize: 9, fill: '#fbbf24' }} />
              <ReferenceLine y={ev.plan.entryLow} stroke="#fbbf24" strokeDasharray="4 3" label={{ value: 'โซนเข้าล่าง', fontSize: 9, fill: '#fbbf24' }} />
              <ReferenceLine y={ev.plan.trigger} stroke="#2dd4bf" strokeDasharray="4 3" label={{ value: 'trigger', fontSize: 9, fill: '#2dd4bf' }} />
              <ReferenceLine y={ev.plan.stopStruct} stroke="#fb7185" strokeDasharray="4 3" label={{ value: 'structural stop', fontSize: 9, fill: '#fb7185' }} />
              <ReferenceLine y={ev.plan.stopHard} stroke="#f43f5e" strokeDasharray="2 3" label={{ value: 'hard stop', fontSize: 9, fill: '#f43f5e' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Gate History 120 วันล่าสุด</p>
          <GateRibbon rows={decision.gateHist} />
        </div>
        {boardRow && (
          <p className="mt-2 text-[11px] text-zinc-500">
            θ={fmtNum(row.theta)} (z {fmtNum(row.thetaZ)}) · LTD {fmtNum(row.ltd)} · vol 21d {fmtPct(row.vol21 * 100, 1)}/ปี · dist from 252d high {fmtPct(row.distHigh * 100, 1)}
          </p>
        )}
      </Panel>
    </div>
  );
}

function PlanCell({
  label,
  value,
  sub,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'up' | 'down' | 'neutral';
  compact?: boolean;
}) {
  const toneCls = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : 'text-zinc-100';
  return (
    <div className={cn('rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5', compact ? 'py-1.5' : 'py-2.5 px-3')}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className={cn('font-mono font-semibold', compact ? 'text-xs' : 'text-sm', toneCls)}>{value}</p>
      {sub && <p className="mt-0.5 text-[9.5px] leading-tight text-zinc-600">{sub}</p>}
    </div>
  );
}
