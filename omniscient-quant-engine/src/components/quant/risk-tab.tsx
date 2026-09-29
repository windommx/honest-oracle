'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Panel, KpiCard } from './quant-widgets';
import { Slider } from '@/components/ui/slider';
import { fmtPct, fmtNum, fmtBaht } from '@/lib/format';
import type { BoardResponse, DecisionResponse } from '@/lib/quant/api-types';

export function RiskTab({
  board,
  decision,
}: {
  board: BoardResponse | null;
  decision: DecisionResponse | null;
}) {
  const [riskBudget, setRiskBudget] = useState<number>(1);
  const [capital, setCapital] = useState<number>(1_000_000);

  const sizing = useMemo(() => {
    if (!decision) return null;
    const cvar = decision.risk.cvar975;
    const maxSizePct = Math.min(100, riskBudget / Math.max(0.001, cvar));
    const notional = (maxSizePct / 100) * capital;
    const shares = decision.row.close > 0 ? Math.floor(notional / decision.row.close) : 0;
    const expectedLossAtStop = shares * Math.max(0, decision.row.close - decision.eval.plan.stopHard);
    return { cvar, maxSizePct, notional, shares, expectedLossAtStop };
  }, [decision, riskBudget, capital]);

  const hist = decision?.risk.lossHistogram ?? [];
  const cvarLine = decision?.risk.cvar975 ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="CVaR 1 วัน (97.5%)"
          value={decision ? `${(decision.risk.cvar975 * 100).toFixed(2)}%` : '—'}
          sub={`Monte Carlo ${decision?.risk.paths.toLocaleString() ?? '—'} paths · Student-t(4) fat tails`}
          tone="down"
        />
        <KpiCard
          label="VaR 95% / 99%"
          value={decision ? `${(decision.risk.var95 * 100).toFixed(1)}% / ${(decision.risk.var99 * 100).toFixed(1)}%` : '—'}
          sub="ต่อวัน ของหุ้นที่เลือกในแท็บ Decision"
          mono
        />
        <KpiCard
          label="Volatility (21d, annualized)"
          value={decision ? fmtPct(decision.risk.volAnn * 100, 1) : '—'}
          sub="จากผันผวนย้อนหลัง 21 วันของหุ้นที่เลือก"
        />
        <KpiCard
          label="หลักการ Sizing"
          value="Size = งบ ÷ CVaR"
          sub="ตัวอย่าง: งบเสี่ยง 1%/วัน, CVaR 3.8% → เพดาน 26% ของพอร์ต"
          mono={false}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sizing calculator */}
        <Panel title="Position Sizing Calculator (Copula-CVaR)" subtitle="ปรับงบความเสี่ยงและทุน — ระบบคำนวณเพดานน้ำหนักและจำนวนหุ้นสูงสุด">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="budget-slider" className="text-xs font-medium text-zinc-300">
                  งบเสี่ยงต่อไม้ (ต่อวัน)
                </label>
                <span className="font-mono text-sm text-emerald-400">{fmtNum(riskBudget, 2)}% ของพอร์ต</span>
              </div>
              <Slider
                id="budget-slider"
                thumbLabel="งบเสี่ยงต่อไม้ (ต่อวัน)"
                thumbValueText={`${fmtNum(riskBudget, 2)}% ของพอร์ต`}
                value={[riskBudget]}
                min={0.25}
                max={3}
                step={0.25}
                onValueChange={(v: number[]) => setRiskBudget(v[0])}
                className="[&_[data-slot=slider-range]]:bg-emerald-500"
                aria-label="งบเสี่ยงต่อวัน เปอร์เซ็นต์"
              />
              <p className="mt-1 text-[11px] text-zinc-600">0.25% = อนุรักษ์นิยม · 3% = aggressive (G4 อาจตกถ้าไซซ์เล็กเกิน)</p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="capital-slider" className="text-xs font-medium text-zinc-300">
                  ขนาดพอร์ต
                </label>
                <span className="font-mono text-sm text-zinc-100">฿{capital.toLocaleString()}</span>
              </div>
              <Slider
                id="capital-slider"
                thumbLabel="ขนาดพอร์ต"
                thumbValueText={`${capital.toLocaleString()} บาท`}
                value={[capital]}
                min={100_000}
                max={10_000_000}
                step={100_000}
                onValueChange={(v: number[]) => setCapital(v[0])}
                className="[&_[data-slot=slider-range]]:bg-amber-400"
                aria-label="ขนาดพอร์ตบาท"
              />
            </div>

            {sizing && decision && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">เพดานน้ำหนัก</p>
                  <p className="font-mono text-lg font-bold text-emerald-400">{fmtNum(sizing.maxSizePct, 1)}%</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">มูลค่าไม้สูงสุด</p>
                  <p className="font-mono text-sm font-semibold text-zinc-100">฿{sizing.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">จำนวนหุ้น (approx)</p>
                  <p className="font-mono text-sm font-semibold text-zinc-100">{sizing.shares.toLocaleString()} หุ้น</p>
                  <p className="text-[9.5px] text-zinc-600">@ {fmtBaht(decision.row.close)}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-[10px] uppercase text-zinc-600">ขาดทุนที่ hard stop</p>
                  <p className="font-mono text-sm font-semibold text-rose-400">฿{sizing.expectedLossAtStop.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-[9.5px] text-zinc-600">≈ {fmtNum((sizing.expectedLossAtStop / capital) * 100, 2)}% ของพอร์ต</p>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Loss distribution */}
        <Panel
          title="Loss Distribution (Monte Carlo)"
          subtitle={decision ? `การกระจายขาดทุนรายวันของ ${decision.symbol} — เส้นแดง = CVaR 97.5%` : 'เลือกหุ้นในแท็บ Decision ก่อน'}
        >
          {hist.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hist} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="x"
                    tick={{ fontSize: 9, fill: '#71717a' }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#71717a' }} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11, borderRadius: 8 }}
                    labelStyle={{ color: '#a1a1aa' }}
                    labelFormatter={(v) => `loss ${fmtNum(Number(v) * 100, 2)}%`}
                    formatter={(v: number | string) => [Number(v).toLocaleString(), 'paths']}
                  />
                  <Bar dataKey="n" fill="#3f3f46" radius={[2, 2, 0, 0]} />
                  <ReferenceLine
                    x={cvarLine}
                    stroke="#f43f5e"
                    strokeDasharray="4 3"
                    label={{ value: `CVaR ${fmtNum(cvarLine * 100, 1)}%`, fontSize: 9, fill: '#f43f5e', position: 'insideTopRight' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-zinc-600">ยังไม่มีข้อมูล — เปิดแท็บ Decision เพื่อโหลดหุ้น</p>
          )}
        </Panel>
      </div>

      {/* L-VaR table */}
      <Panel title="L-VaR Board — ความเสี่ยงรายหุ้น" subtitle="VaR 1 วัน 99% (จาก volatility ล่าสุด) เทียบกับ hard stop ที่ระบบคำนวณ">
        <div tabIndex={0} role="region" aria-label="ตารางความเสี่ยงรายหุ้น" className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800/80">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">หุ้น</th>
                <th className="px-2 py-2 text-right font-medium">ราคา</th>
                <th className="px-2 py-2 text-right font-medium">CVaR 1d</th>
                <th className="px-2 py-2 text-right font-medium">Hard Stop</th>
                <th className="px-2 py-2 text-right font-medium">Struct Stop</th>
                <th className="px-2 py-2 text-right font-medium">Size สูงสุด (งบ 1%)</th>
                <th className="px-2 py-2 font-medium">G4</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {(board?.rows ?? []).map((r) => (
                <tr key={r.symbol}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-zinc-200">{r.symbol}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmtNum(r.price)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-rose-300">{fmtPct(r.cvar * 100, 1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmtNum(r.stopHard)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmtNum(r.stopStruct)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-emerald-300">{fmtNum(r.maxSizePct, 1)}%</td>
                  <td className="px-2 py-1.5">
                    {r.gates.g4 ? (
                      <span className="text-[10px] text-emerald-400">ผ่าน</span>
                    ) : (
                      <span className="text-[10px] text-rose-400">ตก (ไซซ์ &lt; 8%)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Circuit breaker rules */}
      <Panel title="Circuit Breaker & Kill Switch (Governance)" subtitle="กติกาเหล็กที่ทำให้ระบบไม่โกหกตัวเอง">
        <div className="grid gap-2 md:grid-cols-3">
          {[
            { lv: 'Level 1 · Warning', txt: 'Drawdown เกินงบใน Y วัน → ลดขนาดไม้ 50% ทันที', tone: 'border-amber-500/30 bg-amber-500/[0.05]' },
            { lv: 'Level 2 · Halt', txt: 'F_stress > 0.8 หรือ PSI(Θ) > 0.2 → ห้ามเปิดไม้ใหม่ รอ refit', tone: 'border-orange-500/30 bg-orange-500/[0.05]' },
            { lv: 'Level 3 · Nuclear', txt: 'Θ re-couple + OBV divergence + F_stress ไหลขึ้น → ปิดทุกไม้ ไม่สนกำไร/ขาดทุน', tone: 'border-rose-500/30 bg-rose-500/[0.05]' },
          ].map((c) => (
            <div key={c.lv} className={`rounded-lg border px-3 py-3 ${c.tone}`}>
              <p className="text-xs font-bold text-zinc-100">{c.lv}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{c.txt}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
