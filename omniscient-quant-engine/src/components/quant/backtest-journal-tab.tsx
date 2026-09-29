'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Panel, KpiCard } from './quant-widgets';
import { RobustnessPanel, RulesPanel, RulesStatusBadge } from './research-integrity';
import { useState } from 'react';
import { READ_ONLY_HINT, useCanWrite } from '@/components/providers/app-meta';
import { fmtPct, fmtNum, fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BacktestResponse, JournalEntryT } from '@/lib/quant/api-types';

export function BacktestJournalTab({
  bt,
  btLoading,
  entries,
  journalLoading,
  onSeedDemo,
  onUpdateEntry,
  seeding,
}: {
  bt: BacktestResponse | null;
  btLoading: boolean;
  entries: JournalEntryT[];
  journalLoading: boolean;
  onSeedDemo: () => void;
  onUpdateEntry: (id: string, patch: { status?: string; pnlPct?: number | null; notes?: string }) => void;
  seeding: boolean;
}) {
  const canWrite = useCanWrite();
  if (btLoading || !bt) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const equityData = bt.equity.map((e) => ({ ...e, dateLabel: e.date.slice(2, 7) }));
  const closed = entries.filter((e) => e.status === 'CLOSED');

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Hit Rate (สัญญาณ)"
          value={`${fmtNum(bt.metrics.hitRate, 1)}%`}
          sub={`${bt.metrics.hitRateCI ? `95% CI ${fmtNum(bt.metrics.hitRateCI[0], 1)}–${fmtNum(bt.metrics.hitRateCI[1], 1)}% · ` : ''}${bt.metrics.nSignals} สัญญาณ จาก ${bt.metrics.nDays} วันทดสอบ`}
          tone={bt.metrics.hitRateCI ? (bt.metrics.hitRateCI[0] > 50 ? 'up' : bt.metrics.hitRateCI[1] < 50 ? 'down' : 'warn') : bt.metrics.hitRate >= 50 ? 'up' : 'down'}
        />
        <KpiCard
          label="Cumulative (Strat vs Buy&Hold)"
          value={`${fmtPct(bt.metrics.cumStrat)} / ${fmtPct(bt.metrics.cumBase)}`}
          sub="กลยุทธ์ลงทุนเฉพาะวันที่ผ่านทุก gate + P(up) เกิน threshold"
          mono
        />
        <KpiCard
          label="Sharpe (annualized)"
          value={fmtNum(bt.metrics.sharpe)}
          sub={`Max DD ${fmtNum(bt.metrics.maxDD, 1)}%`}
          tone={bt.metrics.sharpe >= 0.5 ? 'up' : 'warn'}
        />
        <KpiCard
          label="Avg Edge ต่อสัญญาณ"
          value={fmtPct(bt.metrics.avgEdge, 3)}
          sub="ผลตอบแทนถัดไปเมื่อมีสัญญาณ เทียบค่าเฉลี่ยตลาด"
          tone={bt.metrics.avgEdge > 0 ? 'up' : 'down'}
        />
      </div>

      {/* Equity curve */}
      <Panel
        title="Walk-Forward Equity Curve"
        subtitle="Purged split: train 252 วัน → embargo 5 วัน → test 21 วัน · refit ทุก 21 วัน (ไม่มี future leak)"
        right={
          bt.rules ? (
            <span className="flex items-center gap-2 text-[11px] text-zinc-400">
              กติกา <span className="font-mono text-zinc-200">{bt.rules.hashShort}</span>
              <RulesStatusBadge rules={bt.rules} />
            </span>
          ) : null
        }
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="bhFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#71717a" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#71717a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 9, fill: '#71717a' }} tickLine={false} interval={30} />
              <YAxis tick={{ fontSize: 9, fill: '#71717a' }} tickLine={false} width={52} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11, borderRadius: 8 }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(v: number | string, name: string) => [fmtNum(Number(v)), name === 'equity' ? 'กลยุทธ์' : 'Buy & Hold']}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
              <Area type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={1.6} fill="url(#eqFill)" name="equity" dot={false} />
              <Area type="monotone" dataKey="buyHold" stroke="#a1a1aa" strokeWidth={1.2} fill="url(#bhFill)" name="buyHold" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Gate attribution */}
      <Panel
        title="Gate Attribution — Gate ไหน 'พูดจริง'"
        subtitle="Mann-Whitney U ของ forward return เมื่อ gate ผ่าน vs ตก · edge > 0 + p ต่ำ = คงไว้/เพิ่มน้ำหนัก · edge ≈ 0 = ตัดหรือปรับ threshold รายเดือน"
      >
        <div tabIndex={0} role="region" aria-label="ตาราง gate attribution" className="overflow-x-auto rounded-lg border border-zinc-800/80">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Gate</th>
                <th className="px-2 py-2 text-right font-medium">Mean ตอนผ่าน</th>
                <th className="px-2 py-2 text-right font-medium">Mean ตอนตก</th>
                <th className="px-2 py-2 text-right font-medium">Edge (bp)</th>
                <th className="px-2 py-2 text-right font-medium">p (MWU)</th>
                <th className="px-2 py-2 text-right font-medium">n ผ่าน</th>
                <th className="px-2 py-2 font-medium">คำตัดสิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {bt.attribution.map((a) => (
                <tr key={a.gate}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-zinc-200">{a.gate}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmtPct(a.meanWhenPass * 100, 3)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-500">{fmtPct(a.meanWhenFail * 100, 3)}</td>
                  <td className={cn('px-2 py-1.5 text-right font-mono', a.edge > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {fmtNum(a.edge * 100, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{a.p < 0.0001 ? '<0.0001' : fmtNum(a.p, 4)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-500">{a.nPass.toLocaleString()}</td>
                  <td className="px-2 py-1.5">
                    {a.verdict === 'SPEAKS_TRUTH' && (
                      <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        พูดจริง
                      </span>
                    )}
                    {a.verdict === 'NOISE' && (
                      <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        เสียงดัง
                      </span>
                    )}
                    {a.verdict === 'INSUFFICIENT' && (
                      <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                        ตัวอย่างน้อย
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ความซื่อตรงของผล: กติกาที่ล็อก + ความทนทานข้าม seed */}
      <div className="grid gap-4 xl:grid-cols-2">
        <RulesPanel />
        <RobustnessPanel />
      </div>

      {/* Calibration + recent signals */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Model Calibration" subtitle="P(up) ที่ทำนาย vs ผลจริง แยกตาม bucket — ต้องไล่เฉลียวใกล้เส้นทแยง">
          <div className="space-y-2">
            {bt.calibration.map((c) => (
              <div key={c.bucket} className="flex items-center gap-3">
                <span className="w-20 font-mono text-[11px] text-zinc-400">{c.bucket}</span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div className="absolute inset-y-0 left-0 bg-zinc-600/70" style={{ width: `${c.predicted}%` }} />
                  <div className="absolute inset-y-0 w-1 bg-emerald-400" style={{ left: `${c.actual}%` }} />
                </div>
                <span className="w-28 text-right font-mono text-[10px] text-zinc-500">
                  pred {fmtNum(c.predicted, 0)}% · act {fmtNum(c.actual, 0)}%
                </span>
              </div>
            ))}
            {bt.calibration.length === 0 && <p className="text-xs text-zinc-600">ข้อมูลไม่พอสำหรับ calibration</p>}
          </div>
        </Panel>

        <Panel title="Recent Signals" subtitle="สัญญาณล่าสุดจาก backtest engine (จริง ณ วันนั้น ไม่มี look-ahead)">
          <div tabIndex={0} role="region" aria-label="สัญญาณล่าสุด" className="max-h-64 overflow-y-auto rounded-lg border border-zinc-800/80">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  <th className="px-2 py-2 font-medium">หุ้น</th>
                  <th className="px-2 py-2 text-right font-medium">P(up)</th>
                  <th className="px-2 py-2 text-right font-medium">ผลจริง 1d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {bt.recentSignals.map((s, i) => (
                  <tr key={`${s.date}-${s.symbol}-${i}`}>
                    <td className="px-3 py-1.5 font-mono text-zinc-400">{fmtDate(s.date)}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold text-zinc-200">{s.symbol}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmtNum(s.prob * 100, 0)}%</td>
                    <td className={cn('px-2 py-1.5 text-right font-mono', s.fwdRet >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {fmtPct(s.fwdRet * 100, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Journal */}
      <Panel
        title="Trade Journal — Ground Truth ของระบบ"
        subtitle="ทุกไม้บันทึก gate state ครบ 5 ประตู → รายเดือนวิเคราะห์ว่า gate ใดพูดจริง/พูดเหลว (วงจรเรียนรู้ปิดสมบูรณ์)"
        right={
          <Button
            variant="outline"
            size="sm"
            onClick={onSeedDemo}
            disabled={seeding || !canWrite}
            title={canWrite ? undefined : READ_ONLY_HINT}
            className="h-8 border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {seeding ? 'กำลังเติม...' : 'เติมตัวอย่างจาก Decision Board'}
          </Button>
        }
      >
        {journalLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : entries.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-zinc-500">ยังไม่มีรายการใน journal</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              กด &quot;เติมตัวอย่างจาก Decision Board&quot; หรือบันทึกแผนจากแท็บ Decision Engine
            </p>
          </div>
        ) : (
          <div tabIndex={0} role="region" aria-label="ตาราง journal" className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800/80">
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">วันที่บันทึก</th>
                  <th className="px-2 py-2 font-medium">หุ้น</th>
                  <th className="px-2 py-2 font-medium">สัญญาณ</th>
                  <th className="px-2 py-2 text-right font-medium">ราคา</th>
                  <th className="px-2 py-2 text-right font-medium">โซนเข้า</th>
                  <th className="px-2 py-2 text-right font-medium">Size</th>
                  <th className="px-2 py-2 font-medium">สถานะ</th>
                  <th className="px-2 py-2 text-right font-medium">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {entries.map((e) => (
                  <tr key={e.id} className={e.status === 'CLOSED' && (e.pnlPct ?? 0) >= 0 ? 'bg-emerald-500/[0.04]' : ''}>
                    <td className="px-3 py-1.5 font-mono text-zinc-500">{fmtDate(e.createdAt)}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold text-zinc-200">{e.symbol}</td>
                    <td className="px-2 py-1.5 text-[10px] text-zinc-400">
                      {e.signal === 'ENTRY_PULLBACK' ? 'Pullback' : e.signal === 'ENTRY_MOMENTUM' ? 'Momentum' : 'No-Trade'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmtNum(e.price)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-500">
                      {e.entryLow != null ? `${fmtNum(e.entryLow)}–${fmtNum(e.entryHigh ?? 0)}` : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{e.sizePct != null ? `${fmtNum(e.sizePct, 1)}%` : '—'}</td>
                    <td className="px-2 py-1.5">
                      <JournalStatusSelect
                        value={e.status}
                        symbol={e.symbol}
                        disabled={!canWrite}
                        onChange={(s) => onUpdateEntry(e.id, { status: s })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <PnlInput
                        key={`${e.id}:${e.pnlPct ?? ''}`}
                        initial={e.pnlPct}
                        symbol={e.symbol}
                        disabled={!canWrite}
                        onCommit={(v) => onUpdateEntry(e.id, { pnlPct: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {closed.length > 0 && (
          <p className="mt-2 font-mono text-[11px] text-zinc-500">
            ปิดแล้ว {closed.length} ไม้ · P&amp;L เฉลี่ย {fmtPct(closed.reduce((s, e) => s + (e.pnlPct ?? 0), 0) / closed.length)} — ข้อมูลนี้คือ input ของ AI Auditor
          </p>
        )}
      </Panel>
    </div>
  );
}

/** P&L % — แก้ในช่องได้อิสระ บันทึกเมื่อออกจากช่องหรือกด Enter (ไม่ยิง PATCH ทุกตัวอักษร) · ว่าง = ล้างค่า */
export function PnlInput({ initial, symbol, disabled, onCommit }: { initial: number | null; symbol: string; disabled: boolean; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(initial == null ? '' : String(initial));
  const commit = () => {
    const t = text.trim();
    const next = t === '' ? null : Number(t);
    if (next !== null && !Number.isFinite(next)) {
      setText(initial == null ? '' : String(initial)); // ค่าที่อ่านไม่ออก — คืนค่าเดิม
      return;
    }
    if (next !== initial) onCommit(next);
  };
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      value={text}
      placeholder="—"
      disabled={disabled}
      title={disabled ? READ_ONLY_HINT : undefined}
      onChange={(ev) => setText(ev.target.value)}
      onBlur={commit}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
      }}
      className="h-7 w-20 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-right font-mono text-[11px] text-zinc-200 focus:border-emerald-500/50 focus:outline-none disabled:opacity-60"
      aria-label={`P&L % ของ ${symbol}`}
    />
  );
}

function JournalStatusSelect({ value, symbol, disabled, onChange }: { value: string; symbol: string; disabled: boolean; onChange: (s: string) => void }) {
  return (
    <select
      value={value}
      disabled={disabled}
      title={disabled ? READ_ONLY_HINT : undefined}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-[11px] text-zinc-200 focus:border-emerald-500/50 focus:outline-none disabled:opacity-60"
      aria-label={`สถานะไม้ของ ${symbol}`}
    >
      <option value="PLANNED">PLANNED</option>
      <option value="EXECUTED">EXECUTED</option>
      <option value="CLOSED">CLOSED</option>
      <option value="SKIPPED">SKIPPED</option>
    </select>
  );
}
