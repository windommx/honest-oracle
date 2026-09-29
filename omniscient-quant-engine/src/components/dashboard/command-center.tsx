'use client';

/**
 * Command Center — หน้า landing ใหม่ของ Omniscient Quant Engine
 *
 * Layout: TickerTape (sticky) → แถว A (สภาพตลาด + สุขภาพเอนจิน)
 *        → แถว B (Quick-pick + PriceChart + โอกาสที่ดีที่สุด)
 *        → แถว C (เส้นทางความมั่งคั่ง + ภาพความร้อนกลุ่มอุตสาหกรรม)
 *
 * Data: board มาจาก parent (page.tsx) · backtest/series/analyst โหลดเองผ่าน useApi
 * หลักการ: เนียนตา (ขอบ white/[0.06], mono tabular-nums, emerald/rose/amber/zinc เท่านั้น)
 *         แต่ละ panel กัน error ของตัวเอง — ไม่พังทั้งหน้า, skeleton โครงเดียวกับของจริง
 */

import { useMemo, useState, type ReactNode } from 'react';
import PriceChart from '@/components/terminal/price-chart';
import { GateChips, SignalBadge } from '@/components/quant/quant-widgets';
import { DriftChip } from '@/components/quant/quant-header';
import {
  BreadthBar,
  EquityCurve,
  MicroLabel,
  Panel,
  PulseDot,
  RadialGauge,
  SectorHeat,
  StatTile,
  TickerTape,
  type Tone,
} from '@/components/dashboard/primitives';
import { useApi } from '@/hooks/use-api';
import { dataKindTag, useAppMeta } from '@/components/providers/app-meta';
import { chgColor, fmtDate, fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  AnalystBriefT,
  BacktestResponse,
  BoardResponse,
  BoardRowT,
  SeriesResponse,
} from '@/lib/quant/api-types';

// ─── module-level helpers ────────────────────────────────────────────────────

const EMPTY_ROWS: BoardRowT[] = [];
const EMPTY_TICKER: Array<{ symbol: string; price: number; chg1d: number }> = [];

/** Momentum / Flow: บวกชัด = ขาขึ้น, ลบชัด = ขาลง, กลาง = รอ (amber) */
const gaugeTone = (v: number): Tone => (v > 0.3 ? 'up' : v < -0.3 ? 'down' : 'warn');

/** Stress: ค่าสูง = ไม่ดี → กลับ tone */
const stressTone = (v: number): Tone => (v > 0.3 ? 'down' : v < -0.3 ? 'up' : 'warn');

const regimeTone = (label: string): Tone =>
  label.includes('CRISIS') ? 'down' : label.includes('BULL') ? 'up' : 'warn';

// เกณฑ์วินัย Part IV: Sortino > 2 · Calmar > 1 · PF > 1.5 · MaxDD < 15–20%
const sharpeTone = (v: number): Tone => (v >= 1 ? 'up' : v >= 0 ? 'warn' : 'down');
const sortinoTone = (v: number): Tone => (v > 2 ? 'up' : v < 1 ? 'down' : 'warn');
const calmarTone = (v: number): Tone => (v > 1 ? 'up' : v > 0 ? 'warn' : 'down');
const pfTone = (v: number): Tone => (v > 1.5 ? 'up' : v > 1 ? 'warn' : 'down');
const ddTone = (v: number): Tone => (Math.abs(v) < 15 ? 'up' : Math.abs(v) < 20 ? 'warn' : 'down');

/** ชิปตัวเลข mono เล็กสำหรับ header actions */
function MonoBadge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] leading-4 tabular-nums',
        tone === 'up' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'down' && 'border-rose-500/30 bg-rose-500/10 text-rose-300',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'default' && 'border-white/[0.08] bg-white/[0.03] text-zinc-400',
      )}
    >
      {children}
    </span>
  );
}

// ─── skeleton (โครงเลย์เอาต์เดียวกับของจริง — กันกระพริบเมื่อข้อมูลมาถึง) ──────

function CommandCenterSkeleton({ loading = false }: { loading?: boolean }) {
  return (
    <div
      className="oqe-bg-scene min-h-full"
      role="status"
      aria-busy={loading}
      aria-label="กำลังโหลด Command Center"
    >
      <p className="sr-only">กำลังโหลดข้อมูล Command Center</p>
      <div className="sticky top-0 z-10 h-10 border-b border-white/[0.06] bg-zinc-950/80" />
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-[300px] animate-pulse rounded-xl bg-white/[0.03] lg:col-span-8" />
          <div className="h-[300px] animate-pulse rounded-xl bg-white/[0.03] lg:col-span-4" />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="flex h-[560px] flex-col gap-3 lg:col-span-8">
            <div className="h-8 w-full max-w-md animate-pulse rounded-lg bg-white/[0.03]" />
            <div className="min-h-0 flex-1 animate-pulse rounded-xl bg-white/[0.03]" />
          </div>
          <div className="h-[560px] animate-pulse rounded-xl bg-white/[0.03] lg:col-span-4" />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-[320px] animate-pulse rounded-xl bg-white/[0.03] lg:col-span-7" />
          <div className="h-[320px] animate-pulse rounded-xl bg-white/[0.03] lg:col-span-5" />
        </div>
      </div>
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

export function CommandCenter({
  board,
  boardLoading,
  tick,
  onOpenSymbol,
}: {
  board: BoardResponse | null;
  boardLoading: boolean;
  tick: number;
  onOpenSymbol: (symbol: string, view?: 'terminal' | 'decision') => void;
}) {
  const [symbol, setSymbol] = useState('TSE');
  const [tf, setTf] = useState<'1D' | '1W'>('1D');
  const { meta } = useAppMeta();

  const btQ = useApi<BacktestResponse>(`/api/backtest?tick=${tick}`);
  const seriesQ = useApi<SeriesResponse>(`/api/market/series/${symbol}?tf=${tf}&bars=180&tick=${tick}`);
  const analystQ = useApi<AnalystBriefT>(`/api/analyst/${symbol}?tick=${tick}`);

  const rows = board?.rows ?? EMPTY_ROWS;
  const bt = btQ.data;
  const m = bt?.metrics ?? null;

  const tickerItems = useMemo(
    () => (board ? board.rows.map((r) => ({ symbol: r.symbol, price: r.price, chg1d: r.chg1d })) : EMPTY_TICKER),
    [board],
  );

  const signals = useMemo(
    () => rows.filter((r) => r.signal !== 'NO_TRADE').sort((a, b) => b.probUp - a.probUp),
    [rows],
  );

  const moversUp = useMemo(() => [...rows].sort((a, b) => b.chg1d - a.chg1d).slice(0, 3), [rows]);
  const moversDown = useMemo(() => [...rows].sort((a, b) => a.chg1d - b.chg1d).slice(0, 3), [rows]);

  const breadth = useMemo(() => {
    let adv = 0;
    let dec = 0;
    let flat = 0;
    for (const r of rows) {
      if (r.chg1d > 0) adv += 1;
      else if (r.chg1d < 0) dec += 1;
      else flat += 1;
    }
    return { adv, dec, flat };
  }, [rows]);

  const sectorCells = useMemo(() => {
    const acc = new Map<string, { sum1d: number; sum21d: number; n: number }>();
    for (const r of rows) {
      const cur = acc.get(r.sector) ?? { sum1d: 0, sum21d: 0, n: 0 };
      cur.sum1d += r.chg1d;
      cur.sum21d += r.chg21d;
      cur.n += 1;
      acc.set(r.sector, cur);
    }
    return Array.from(acc.entries()).map(([sector, v]) => ({
      sector,
      chg1d: v.sum1d / v.n,
      chg21d: v.sum21d / v.n,
      n: v.n,
    }));
  }, [rows]);

  const refreshChart = () => {
    seriesQ.refresh();
    analystQ.refresh();
  };

  // board ยังไม่มา → skeleton เต็มหน้า (โครงเดียวกับของจริง ไม่กระพริบ)
  if (!board || !board.regime || !board.summary) {
    return <CommandCenterSkeleton loading={boardLoading} />;
  }

  const regime = board.regime;
  const summary = board.summary;

  // regime string เช่น "BULL / Risk-On" → แบ่ง 2 บรรทัด
  const slashIdx = regime.regime.indexOf('/');
  const regimeMain = slashIdx === -1 ? regime.regime.trim() : regime.regime.slice(0, slashIdx).trim();
  const regimeSub = slashIdx === -1 ? '' : regime.regime.slice(slashIdx + 1).trim();

  // plan สำหรับ overlay โซนเข้า/จุดตัดขาดทุนบนกราฟ
  const plan = analystQ.data
    ? {
        entryLow: analystQ.data.plan.entryLow,
        entryHigh: analystQ.data.plan.entryHigh,
        stopHard: analystQ.data.plan.stopHard,
      }
    : null;

  return (
    <div className="oqe-bg-scene min-h-full">
      <TickerTape
        items={tickerItems}
        onSelectSymbol={(s) => onOpenSymbol(s, 'terminal')}
        className="sticky top-0 z-10 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-md"
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        {/* ═══ แถว A — Hero ═══ */}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          {/* A1 — สภาพตลาดวันนี้ */}
          <Panel
            className="oqe-fade-up oqe-delay-1 lg:col-span-8"
            title="สภาพตลาดวันนี้"
            subtitle={`${fmtDate(regime.date)} · ตลาดหุ้นไทย${meta ? ` (${dataKindTag(meta)})` : ''}`}
            actions={<DriftChip drift={summary.drift} psi={summary.psiStress} />}
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              {/* ซ้าย — regime + ตลาดวันนี้ + decouple alerts */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <PulseDot tone={regimeTone(regime.regime)} />
                  <h2 className="text-2xl font-bold leading-tight text-zinc-100">{regimeMain}</h2>
                </div>
                {regimeSub && <p className="mt-1 text-sm text-zinc-500">{regimeSub}</p>}

                <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
                  <div>
                    <MicroLabel>ตลาดวันนี้</MicroLabel>
                    <p
                      className={cn(
                        'mt-1 font-mono text-3xl font-bold leading-none tabular-nums',
                        chgColor(regime.marketChg1d),
                      )}
                    >
                      {/* marketChg1d เป็นสัดส่วน (0.0123) → แปลงเป็น % ก่อนแสดง */}
                      {fmtPct(regime.marketChg1d * 100)}
                    </p>
                  </div>

                  {summary.decoupleAlerts.length > 0 && (
                    <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.07] px-3 py-2">
                      <MicroLabel className="text-rose-300/70">DECOUPLE ALERTS</MicroLabel>
                      <p className="mt-1 font-mono text-xl font-bold leading-none text-rose-300 tabular-nums">
                        {summary.decoupleAlerts.length}
                      </p>
                      <p className="mt-1 max-w-[200px] truncate font-mono text-[10px] text-rose-300/70 tabular-nums">
                        {summary.decoupleAlerts.join(' · ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ขวา — 3 RadialGauge */}
              <div className="flex shrink-0 items-start justify-between gap-2 sm:justify-end sm:gap-4">
                <RadialGauge value={regime.stress} label="Stress" size={96} tone={stressTone(regime.stress)} />
                <RadialGauge value={regime.momentum} label="Momentum" size={96} tone={gaugeTone(regime.momentum)} />
                <RadialGauge value={regime.flow} label="Flow" size={96} tone={gaugeTone(regime.flow)} />
              </div>
            </div>

            {/* ล่าง — breadth + PSI */}
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <div className="flex items-center justify-between gap-3">
                <MicroLabel>MARKET BREADTH</MicroLabel>
                <span className="font-mono text-[10px] text-zinc-600 tabular-nums">
                  PSI {fmtNum(summary.psiStress)} · drift {summary.drift}
                </span>
              </div>
              <BreadthBar adv={breadth.adv} dec={breadth.dec} flat={breadth.flat} className="mt-2.5" />
            </div>
          </Panel>

          {/* A2 — สุขภาพเอนจิน (KPI วินัย Part IV) */}
          <Panel
            className="oqe-fade-up oqe-delay-2 lg:col-span-4"
            title="สุขภาพเอนจิน"
            subtitle="เกณฑ์วินัย Part IV — เทียบเป้าหมายรายตัว"
            actions={
              m ? (
                <MonoBadge tone={m.hitRate >= 50 ? 'up' : 'warn'}>HIT {fmtNum(m.hitRate, 1)}%</MonoBadge>
              ) : (
                <MonoBadge>HIT —</MonoBadge>
              )
            }
          >
            {btQ.error ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <p className="text-[11px] leading-relaxed text-rose-300">
                  โหลดผล backtest ไม่สำเร็จ: {btQ.error}
                </p>
                <button
                  type="button"
                  onClick={btQ.refresh}
                  className="mt-2 rounded-md border border-rose-500/40 px-2 py-1 text-[10px] text-rose-200 transition-colors hover:bg-rose-500/10"
                >
                  ลองใหม่
                </button>
              </div>
            ) : m ? (
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Sharpe" value={fmtNum(m.sharpe)} sub="ปรับความผันผวน" tone={sharpeTone(m.sharpe)} />
                <StatTile label="Sortino" value={fmtNum(m.sortino)} sub="เป้า > 2" tone={sortinoTone(m.sortino)} />
                <StatTile label="Calmar" value={fmtNum(m.calmar)} sub="เป้า > 1" tone={calmarTone(m.calmar)} />
                <StatTile label="Profit Factor" value={fmtNum(m.profitFactor)} sub="เป้า > 1.5" tone={pfTone(m.profitFactor)} />
                <StatTile
                  label="Max Drawdown"
                  value={fmtPct(-Math.abs(m.maxDD), 1)}
                  sub="กรอบ < 15–20%"
                  tone={ddTone(m.maxDD)}
                />
                <StatTile
                  label="Expectancy"
                  value={fmtPct(m.expectancy, 2)}
                  sub="ต่อไม้ 1% ความเสี่ยง"
                  tone={m.expectancy >= 0 ? 'up' : 'down'}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-[86px] animate-pulse rounded-xl bg-white/[0.03]" />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ═══ แถว B — กราฟ + โอกาส ═══ */}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          {/* B1 — quick-pick + PriceChart */}
          <section
            className="oqe-fade-up oqe-delay-3 min-w-0 lg:col-span-8"
            aria-label="แผนภูมิราคาและหุ้นที่มีสัญญาณ"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <MicroLabel className="mr-1.5">QUICK PICK</MicroLabel>
              {signals.slice(0, 6).map((r) => {
                const active = r.symbol === symbol;
                return (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => setSymbol(r.symbol)}
                    aria-pressed={active}
                    aria-label={`ดูกราฟ ${r.symbol} P(up) ${(r.probUp * 100).toFixed(0)}%`}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-xs transition-colors',
                      active
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-zinc-200',
                    )}
                  >
                    <span className="font-semibold">{r.symbol}</span>
                    <span className={cn('text-[10px] tabular-nums', active ? 'text-amber-300/70' : 'text-zinc-500')}>
                      {(r.probUp * 100).toFixed(0)}%
                    </span>
                  </button>
                );
              })}
              {signals.length === 0 && (
                <span className="text-[11px] text-zinc-600">ยังไม่มีสัญญาณวันนี้ — เลือกตัวจาก Ticker ด้านบน</span>
              )}
            </div>

            <div className="mt-2.5 h-[480px] min-w-0 sm:h-[520px]">
              <PriceChart
                data={seriesQ.data}
                loading={seriesQ.loading}
                error={seriesQ.error}
                plan={plan}
                tf={tf}
                onTfChange={setTf}
                onRefresh={refreshChart}
              />
            </div>
          </section>

          {/* B2 — โอกาสที่ดีที่สุดวันนี้ */}
          <Panel
            className="oqe-fade-up oqe-delay-4 lg:col-span-4"
            title="โอกาสที่ดีที่สุดวันนี้"
            subtitle="เรียงตาม P(up) · ผ่านการกรองสัญญาณ"
            actions={<MicroLabel>{signals.length} signals</MicroLabel>}
          >
            {signals.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 text-center">
                <p className="text-xs leading-relaxed text-zinc-500">
                  วันนี้ยังไม่มีสัญญาณที่ผ่านทุกเกต — ถือเงินสดรอ
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {signals.slice(0, 5).map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => onOpenSymbol(r.symbol, 'decision')}
                    aria-label={`${r.symbol} ${r.name} — P(up) ${(r.probUp * 100).toFixed(0)}% เข้า ${fmtNum(r.entryLow)} ถึง ${fmtNum(r.entryHigh)} — เปิดใน Decision`}
                    className="block w-full rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-amber-500/30 hover:bg-white/[0.045]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-sm font-bold text-zinc-100">{r.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{r.name}</span>
                      <SignalBadge signal={r.signal} />
                    </div>

                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: `${Math.min(100, Math.max(0, r.probUp * 100))}%` }}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-emerald-300 tabular-nums">
                        {(r.probUp * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500 tabular-nums">
                        เข้า {fmtNum(r.entryLow)}–{fmtNum(r.entryHigh)} · ขนาด {fmtNum(r.maxSizePct, 0)}%
                      </span>
                      <GateChips gates={r.gates} size="sm" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ย้ายแรงวันนี้ */}
            <div className="mt-4 border-t border-white/[0.06] pt-3.5">
              <MicroLabel>ย้ายแรงวันนี้</MicroLabel>
              <div className="mt-1.5 grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  {moversUp.map((r) => (
                    <button
                      key={r.symbol}
                      type="button"
                      onClick={() => onOpenSymbol(r.symbol, 'terminal')}
                      aria-label={`${r.symbol} เปลี่ยนแปลงวันนี้ ${fmtPct(r.chg1d)} — เปิดใน Terminal`}
                      className="flex h-10 w-full items-center justify-between gap-2 rounded-lg px-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="truncate font-mono text-xs font-semibold text-zinc-300">{r.symbol}</span>
                      <span className={cn('shrink-0 font-mono text-xs tabular-nums', chgColor(r.chg1d))}>
                        {fmtPct(r.chg1d, 1)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="space-y-0.5">
                  {moversDown.map((r) => (
                    <button
                      key={r.symbol}
                      type="button"
                      onClick={() => onOpenSymbol(r.symbol, 'terminal')}
                      aria-label={`${r.symbol} เปลี่ยนแปลงวันนี้ ${fmtPct(r.chg1d)} — เปิดใน Terminal`}
                      className="flex h-10 w-full items-center justify-between gap-2 rounded-lg px-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="truncate font-mono text-xs font-semibold text-zinc-300">{r.symbol}</span>
                      <span className={cn('shrink-0 font-mono text-xs tabular-nums', chgColor(r.chg1d))}>
                        {fmtPct(r.chg1d, 1)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* ═══ แถว C — เส้นทางความมั่งคั่ง + ความร้อนกลุ่ม ═══ */}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          {/* C1 — เส้นทางความมั่งคั่ง */}
          <Panel
            className="oqe-fade-up oqe-delay-5 lg:col-span-7"
            title="เส้นทางความมั่งคั่ง"
            subtitle="กลยุทธ์ 5-Gate vs Buy&Hold · walk-forward ย้อนหลัง (ไม่มี look-ahead)"
            actions={
              m ? (
                <div className="flex items-center gap-1.5">
                  <MonoBadge tone={sharpeTone(m.sharpe)}>SHR {fmtNum(m.sharpe)}</MonoBadge>
                  <MonoBadge tone={ddTone(m.maxDD)}>MDD {fmtPct(-Math.abs(m.maxDD), 1)}</MonoBadge>
                </div>
              ) : null
            }
          >
            {bt?.equity && bt.equity.length > 1 ? (
              <EquityCurve data={bt.equity} />
            ) : (
              <div className="h-56 animate-pulse rounded-xl bg-white/[0.03]" aria-hidden="true" />
            )}
          </Panel>

          {/* C2 — ภาพความร้อนกลุ่มอุตสาหกรรม */}
          <Panel
            className="oqe-fade-up oqe-delay-6 lg:col-span-5"
            title="ภาพความร้อนกลุ่มอุตสาหกรรม"
            subtitle="เฉลี่ย % เปลี่ยนแปลงวันนี้"
          >
            <SectorHeat cells={sectorCells} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default CommandCenter;
