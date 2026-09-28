'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { KpiCard, Panel, GateChips, SignalBadge } from './quant-widgets';
import { DriftChip } from './quant-header';
import { fmtPct, fmtNum, chgColor } from '@/lib/format';
import type { BoardResponse } from '@/lib/quant/api-types';

const LAYERS = [
  { id: 'L0', name: 'Data & Provenance', desc: 'ราคา/งบ PIT · matching · QC', color: 'border-zinc-700' },
  { id: 'L1', name: 'Single-View Analytics', desc: 'Regime Volcano · Differential features', color: 'border-zinc-700' },
  { id: 'L2', name: 'Dependence Manifold', desc: 'Kendall→Clayton Θ · LTD · Decouple', color: 'border-teal-500/40' },
  { id: 'L3', name: 'Multi-View Integration', desc: 'PCA Factors · Enrichment · Hubs · Trajectories', color: 'border-amber-500/40' },
  { id: 'L4', name: 'Prediction (ML)', desc: 'Walk-forward logistic → P(up)', color: 'border-zinc-700' },
  { id: 'L5', name: 'Risk & Sizing', desc: 'Copula-CVaR · Hard/Structural Stop', color: 'border-rose-500/30' },
  { id: 'L6', name: 'Execution & Monitoring', desc: '5 Gates · Journal · Drift Monitor', color: 'border-emerald-500/40' },
] as const;

export function OverviewTab({
  board,
  loading,
  onSelectSymbol,
}: {
  board: BoardResponse | null;
  loading: boolean;
  onSelectSymbol: (s: string) => void;
}) {
  if (loading || !board) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const { regime, rows, summary } = board;
  const topSignals = rows.filter((r) => r.signal !== 'NO_TRADE');
  const g1PassPct = Math.round((rows.filter((r) => r.gates.g1).length / rows.length) * 100);

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Market Regime"
          value={regime.regime.split('/')[0].trim()}
          sub={`F_stress ${fmtNum(regime.stress)} · F_mom ${fmtNum(regime.momentum)} · F_flow ${fmtNum(regime.flow)}`}
          tone={regime.regime.includes('CRISIS') ? 'down' : regime.regime.includes('BULL') ? 'up' : 'warn'}
        />
        <KpiCard
          label="Signals วันนี้"
          value={`${summary.nPullback + summary.nMomentum} / ${rows.length}`}
          sub={`Pullback ${summary.nPullback} · Momentum ${summary.nMomentum} · No-Trade ${summary.nNoTrade}`}
          tone={(summary.nPullback + summary.nMomentum) > 0 ? 'up' : 'default'}
        />
        <KpiCard
          label="Decouple Alerts"
          value={`${summary.decoupleAlerts.length}`}
          sub={summary.decoupleAlerts.length ? summary.decoupleAlerts.join(', ') : 'ทุกหุ้น coupled ปกติ'}
          tone={summary.decoupleAlerts.length > 3 ? 'warn' : 'default'}
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Drift Monitor (L6)</p>
          <div className="mt-1.5">
            <DriftChip drift={summary.drift} psi={summary.psiStress} />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
            PSI ของ F_stress 60 วันล่าสุด เทียบฐาน 180 วัน &gt; 0.2 = พิจารณา refit
          </p>
        </div>
      </div>

      {/* Signal of the day */}
      {topSignals.length > 0 && (
        <Panel
          title="Signal of the Day — ผ่าน Convergent Evidence ครบทุก Gate ที่เกี่ยวข้อง"
          subtitle="คลิกแถวเพื่อเปิด Decision Detail (5 Gates + Trade Plan)"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {topSignals.slice(0, 4).map((r) => (
              <button
                key={r.symbol}
                onClick={() => onSelectSymbol(r.symbol)}
                className="group rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-colors hover:border-emerald-500/40 hover:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-base font-bold text-zinc-100">{r.symbol}</span>
                    <span className="text-xs text-zinc-500">{r.name}</span>
                  </div>
                  <SignalBadge signal={r.signal} />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 font-mono text-xs">
                  <div>
                    <p className="text-[10px] uppercase text-zinc-600">ราคา</p>
                    <p className="text-zinc-200">{fmtNum(r.price)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-zinc-600">P(up)</p>
                    <p className={r.probUp >= 0.55 ? 'text-emerald-400' : 'text-zinc-300'}>{fmtNum(r.probUp * 100, 0)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-zinc-600">โซนเข้า</p>
                    <p className="text-zinc-300">{fmtNum(r.entryLow)}–{fmtNum(r.entryHigh)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-zinc-600">ขนาดสูงสุด</p>
                    <p className="text-zinc-300">{fmtNum(r.maxSizePct, 1)}%</p>
                  </div>
                </div>
                <div className="mt-3">
                  <GateChips gates={r.gates} />
                </div>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* 7-Layer architecture */}
      <Panel
        title="Master Architecture — 7 Layers"
        subtitle="หลักปกครอง: ไม่มีสัญญาณจาก layer เดียวที่มีสิทธิ์สั่งเทรด — ทุกการตัดสินใจต้องเป็น convergent evidence ข้าม layer"
      >
        <div className="space-y-1.5">
          {LAYERS.map((layer, idx) => (
            <div key={layer.id}>
              <div className={cn('flex items-center gap-3 rounded-lg border bg-zinc-900/60 px-3 py-2', layer.color)}>
                <span className="font-mono text-xs font-bold text-zinc-500">{layer.id}</span>
                <span className="text-xs font-semibold text-zinc-200">{layer.name}</span>
                <span className="hidden text-[11px] text-zinc-500 sm:inline">— {layer.desc}</span>
                <span className="ml-auto font-mono text-[11px] text-zinc-400">
                  {layer.id === 'L0' && `${rows.length} stocks · QC pass`}
                  {layer.id === 'L1' && `Regime Volcano active`}
                  {layer.id === 'L2' && `${summary.decoupleAlerts.length} decouple alerts`}
                  {layer.id === 'L3' && `G1 ผ่าน ${g1PassPct}% ของหุ้น`}
                  {layer.id === 'L4' && `P(up) model calibrated`}
                  {layer.id === 'L5' && `CVaR budget 1%/day`}
                  {layer.id === 'L6' && `${summary.nPullback + summary.nMomentum} signals`}
                </span>
              </div>
              {idx < LAYERS.length - 1 && (
                <div className="ml-6 h-1.5 w-px bg-zinc-700" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </Panel>

      {/* Decision board table */}
      <Panel title="Decision Board — 22 หุ้น SET (จำลอง)" subtitle="เรียงตามสัญญาณ → P(up) · ทุกแถวประเมินด้วย 5-Gate Engine ณ วันล่าสุด">
        <TooltipProvider delayDuration={150}>
          <div className="max-h-[560px] overflow-y-auto rounded-lg border border-zinc-800/80">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">หุ้น</th>
                  <th className="px-2 py-2 text-right font-medium">ราคา</th>
                  <th className="px-2 py-2 text-right font-medium">1D</th>
                  <th className="px-2 py-2 text-right font-medium">21D</th>
                  <th className="px-2 py-2 text-right font-medium">RSI</th>
                  <th className="px-2 py-2 font-medium">Phase</th>
                  <th className="px-2 py-2 font-medium">Gates</th>
                  <th className="px-2 py-2 font-medium">สัญญาณ</th>
                  <th className="px-2 py-2 text-right font-medium">P(up)</th>
                  <th className="px-2 py-2 text-right font-medium">Size สูงสุด</th>
                  <th className="px-2 py-2 text-right font-medium">CVaR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    onClick={() => onSelectSymbol(r.symbol)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-zinc-800/40',
                      r.signal !== 'NO_TRADE' && 'bg-emerald-500/[0.04]',
                    )}
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono font-semibold text-zinc-100">{r.symbol}</div>
                      <div className="text-[10px] text-zinc-600">{r.theme}</div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-zinc-200">{fmtNum(r.price)}</td>
                    <td className={cn('px-2 py-2 text-right font-mono', chgColor(r.chg1d))}>{fmtPct(r.chg1d, 1)}</td>
                    <td className={cn('px-2 py-2 text-right font-mono', chgColor(r.chg21d))}>{fmtPct(r.chg21d, 1)}</td>
                    <td className={cn('px-2 py-2 text-right font-mono', r.rsi > 70 ? 'text-amber-300' : 'text-zinc-400')}>
                      {fmtNum(r.rsi, 0)}
                    </td>
                    <td className="px-2 py-2 text-[10px] text-zinc-400">{r.phase.replace('Phase ', 'P').split('·')[1]?.trim() ?? r.phase}</td>
                    <td className="px-2 py-2">
                      <GateChips gates={r.gates} />
                    </td>
                    <td className="px-2 py-2">
                      <SignalBadge signal={r.signal} />
                    </td>
                    <td className={cn('px-2 py-2 text-right font-mono', r.probUp >= 0.55 ? 'text-emerald-400' : 'text-zinc-400')}>
                      {fmtNum(r.probUp * 100, 0)}%
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-zinc-300">{fmtNum(r.maxSizePct, 1)}%</td>
                    <td className="px-2 py-2 text-right font-mono text-zinc-400">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="underline decoration-dotted underline-offset-2">{fmtPct(r.cvar * 100, 1)}</span>
                        </TooltipTrigger>
                        <TooltipContent className="bg-zinc-900 border-zinc-700 text-xs">
                          CVaR 1 วัน 97.5% = {fmtPct(r.cvar * 100, 2)} · Size = งบเสี่ยง 1% / CVaR
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      </Panel>
    </div>
  );
}
