'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Panel, KpiCard } from './quant-widgets';
import HeatmapGrid from '@/components/charts/heatmap-grid';
import { fmtNum, fmtDate } from '@/lib/format';
import type { DependenceResponse, DecisionResponse } from '@/lib/quant/api-types';

export function DependenceTab({
  matrix,
  dep,
  matrixLoading,
  decLoading,
}: {
  matrix: DependenceResponse | null;
  dep: DecisionResponse | null;
  matrixLoading: boolean;
  decLoading: boolean;
}) {
  const thetaData = useMemo(
    () => (dep ? dep.depSeries.map((r) => ({ ...r, dateLabel: r.date.slice(5) })) : []),
    [dep],
  );

  if (matrixLoading || decLoading || !matrix || !dep) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const latest = dep.row;
  const decoupledNow = matrix.decouples.filter((d) => d.decoupled);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Clayton Θ (vs SET proxy)"
          value={fmtNum(latest.theta)}
          sub={`θ = 2τ/(1−τ) จาก Kendall τ หน้าต่าง 60 วัน`}
          tone={latest.theta < 2 ? 'warn' : 'default'}
        />
        <KpiCard
          label="Θ z-score (120d)"
          value={fmtNum(latest.thetaZ)}
          sub={latest.decoupled ? 'DECOUPLE SIGNAL = True' : 'coupled ปกติ'}
          tone={latest.decoupled ? 'down' : 'default'}
        />
        <KpiCard
          label="Lower Tail Dependence"
          value={fmtNum(latest.ltd)}
          sub="ผ่าน G2 ได้เมื่อ LTD < 0.35 (หางล่างหลุดจากตลาด)"
          tone={latest.ltd < 0.35 ? 'up' : 'default'}
        />
        <KpiCard
          label="Decouple Alerts (ทั้งตลาด)"
          value={`${decoupledNow.length}/22`}
          sub={decoupledNow.length ? decoupledNow.map((d) => d.symbol).join(', ') : 'ไม่มี'}
          tone={decoupledNow.length > 3 ? 'warn' : 'default'}
        />
      </div>

      {/* Theta + LTD series */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={`Dynamic Copula Θ — ${dep.symbol} vs SET proxy`}
          subtitle="θ ต่ำ = พึ่งพากันอ่อน (idiosyncratic story) · แถบเทา = ช่วง DECOUPLE (z < −1.5)"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={thetaData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="thetaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 9, fill: '#71717a' }} tickLine={false} interval={40} />
                <YAxis
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  width={44}
                  domain={[0, Math.max(4, Math.ceil(Math.max(...thetaData.map((d) => d.theta))) + 2)]}
                  tickFormatter={(v: number) => v.toFixed(0)}
                />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11, borderRadius: 8 }}
                  labelStyle={{ color: '#a1a1aa' }}
                  formatter={(v: number | string, name: string) => [fmtNum(Number(v)), name === 'theta' ? 'Clayton Θ' : 'LTD']}
                />
                <Area type="monotone" dataKey="theta" stroke="#2dd4bf" strokeWidth={1.6} fill="url(#thetaFill)" dot={false} />
                <ReferenceLine y={2} stroke="#52525b" strokeDasharray="4 4" label={{ value: 'baseline', fontSize: 9, fill: '#71717a' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title={`KDE โซนราคา — ${dep.symbol}`}
          subtitle="ความหนาแน่นของราคา 250 วันล่าสุด: ยอดเตี้ย = โซนโล่ง (วิ่งเร็วแต่ไร้ฐานรับ)"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dep.kde.xs.map((x, i) => ({ x, y: dep.kde.ys[i] }))}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="kdeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis
                  dataKey="x"
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  tickFormatter={(v: number) => v.toFixed(2)}
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 9, fill: '#71717a' }} tickLine={false} width={38} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11, borderRadius: 8 }}
                  labelStyle={{ color: '#a1a1aa' }}
                  labelFormatter={(v) => `ราคา ${fmtNum(Number(v), 3)}`}
                  formatter={(v: number | string) => [Number(v).toExponential(2), 'density']}
                />
                <Area type="monotone" dataKey="y" stroke="#fbbf24" strokeWidth={1.6} fill="url(#kdeFill)" dot={false} />
                <ReferenceLine
                  x={dep.row.close}
                  stroke="#34d399"
                  strokeDasharray="4 4"
                  label={{ value: `ราคาปัจจุบัน ${fmtNum(dep.row.close, 2)}`, fontSize: 9, fill: '#34d399', position: 'insideTopRight' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Θ matrix heatmap */}
      <Panel
        title="Cross-Sectional Θ Matrix (22×22)"
        subtitle="Clayton Θ คู่เทียบจาก 120 วันล่าสุด — สีเข้ม = dependence หนาแน่น, เขียว = พึ่งพากันมาก, แดง = หลุดกัน"
      >
        <HeatmapGrid
          matrix={matrix.matrix}
          rowLabels={matrix.symbols}
          colLabels={matrix.symbols}
          showRowLabels
        />
        <p className="mt-3 text-[11px] text-zinc-500">
          Contagion check: หากหุ้นหนึ่งร่วง ดูแถวของมัน — คู่ที่ Θ สูงจะโดนลากไปด้วย (เทียบเท่า gene-gene PPI ในเครือข่ายชีวสารสนเทศ)
        </p>
      </Panel>

      {/* Decouple list */}
      <Panel title="Drift & Decouple Monitor รายหุ้น" subtitle="PSI ของ Θ series (240d ฐาน vs 60d ล่าสุด) — โครงสร้าง dependence เปลี่ยนหรือยัง">
        <div tabIndex={0} role="region" aria-label="ตาราง dependence รายหุ้น" className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800/80">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">หุ้น</th>
                <th className="px-2 py-2 text-right font-medium">Θ</th>
                <th className="px-2 py-2 text-right font-medium">Θ z</th>
                <th className="px-2 py-2 text-right font-medium">LTD</th>
                <th className="px-2 py-2 text-right font-medium">PSI(Θ)</th>
                <th className="px-2 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {[...matrix.decouples]
                .sort((a, b) => a.thetaZ - b.thetaZ)
                .map((d) => (
                  <tr key={d.symbol} className={d.decoupled ? 'bg-amber-500/[0.05]' : ''}>
                    <td className="px-3 py-1.5 font-mono font-semibold text-zinc-200">{d.symbol}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmtNum(d.theta)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${d.thetaZ < -1 ? 'text-rose-400' : 'text-zinc-400'}`}>
                      {fmtNum(d.thetaZ)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmtNum(d.ltd)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmtNum(d.psi)}</td>
                    <td className="px-2 py-1.5">
                      {d.decoupled ? (
                        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                          DECOUPLE
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-600">coupled</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">ข้อมูล ณ {fmtDate(dep.row.date)} · อัปเดตจาก pipeline ล่าสุด</p>
      </Panel>
    </div>
  );
}
