'use client';

import { useMemo, useState } from 'react';
import { Activity, Search, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chgColor, fmtDate, fmtNum, fmtPct } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { QuoteRowT } from '@/lib/quant/api-types';

export type WatchTab = 'market' | 'levels' | 'favorites';

// ─── Sorting (module-level) ───

const SIGNAL_RANK: Record<string, number> = { ENTRY_PULLBACK: 0, ENTRY_MOMENTUM: 1, NO_TRADE: 2 };

const sigRank = (s: string): number => SIGNAL_RANK[s] ?? 2;

/** MARKET: สัญญาณก่อน (Pullback → Momentum → No Trade) แล้วเรียง chg1d มาก→น้อย */
const byMarket = (a: QuoteRowT, b: QuoteRowT): number =>
  sigRank(a.signal) - sigRank(b.signal) || b.chg1d - a.chg1d;

/** LEVELS: มีสัญญาณ (ไม่ใช่ NO_TRADE) มาก่อน แล้วตามด้วยที่เหลือ เรียง chg1d มาก→น้อย */
const byLevels = (a: QuoteRowT, b: QuoteRowT): number =>
  (sigRank(a.signal) === 2 ? 1 : 0) - (sigRank(b.signal) === 2 ? 1 : 0) || b.chg1d - a.chg1d;

const TABS: Array<{ key: WatchTab; label: string }> = [
  { key: 'market', label: 'MARKET' },
  { key: 'levels', label: 'LEVELS' },
  { key: 'favorites', label: 'FAVORITES' },
];

// ─── Sub-components (module-level) ───

/** Sparkline เล็ก 56x20 — normalize min-max, สีตามทิศทาง 5 วัน */
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const stroke = up ? '#34d399' : '#fb7185';
  let pts = `1,10 55,10`;
  if (Array.isArray(data) && data.length >= 2) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    pts = data
      .map((v, i) => {
        const x = 1 + (i / (data.length - 1)) * 54;
        const y = 19 - ((v - min) / range) * 18;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
  return (
    <svg width={56} height={20} viewBox="0 0 56 20" aria-hidden className="shrink-0 overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** ไมโครชิปสัญญาณ (ซ่อนเมื่อ NO_TRADE) */
function SignalDot({ signal }: { signal: string }) {
  if (signal === 'NO_TRADE') return null;
  const pb = signal === 'ENTRY_PULLBACK';
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-medium text-zinc-500">
      <span className={cn('h-0.5 w-0.5 rounded-full', pb ? 'bg-emerald-400' : 'bg-amber-400')} aria-hidden />
      {pb ? 'Pullback' : 'Momentum'}
    </span>
  );
}

/** ปุ่มดาว — ปุ่มจริงที่อยู่ "ข้าง" ปุ่มเลือกแถว (ไม่ซ้อนกัน: ปุ่มซ้อนปุ่มใช้คีย์บอร์ด/screen reader ไม่ได้) */
function StarToggle({
  symbol,
  fav,
  onToggleFav,
}: {
  symbol: string;
  fav: boolean;
  onToggleFav: (s: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={fav}
      aria-label={fav ? `เอา ${symbol} ออกจากรายการโปรด` : `เก็บ ${symbol} ไว้ในรายการโปรด`}
      onClick={() => onToggleFav(symbol)}
      className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-zinc-800/80"
    >
      <Star className={cn('h-3.5 w-3.5', fav ? 'fill-amber-400 text-amber-400' : 'text-zinc-400')} aria-hidden />
    </button>
  );
}

function RowShell({
  selected,
  star,
  children,
  onSelect,
}: {
  selected: boolean;
  star: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-[36px_minmax(0,1fr)] items-center gap-2 px-3 py-2 transition-colors',
        selected ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/40',
      )}
    >
      {star}
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        {children}
      </button>
    </div>
  );
}

function IdentityCell({ q, selected }: { q: QuoteRowT; selected: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn('font-mono text-sm font-bold leading-tight', selected ? 'text-amber-300' : 'text-zinc-100')}>
        {q.symbol}
      </p>
      <div className="flex items-center gap-1.5">
        <span className="max-w-24 truncate text-[10px] text-zinc-500">{q.name}</span>
        <SignalDot signal={q.signal} />
      </div>
    </div>
  );
}

function PriceCell({ q }: { q: QuoteRowT }) {
  return (
    <div className="text-right">
      <p className="font-mono text-sm leading-tight text-zinc-100">{fmtNum(q.price, 2)}</p>
      <p className={cn('font-mono text-[11px] leading-tight', chgColor(q.chg1d))}>{fmtPct(q.chg1d)}</p>
    </div>
  );
}

function MarketRow({
  q,
  selected,
  fav,
  onSelect,
  onToggleFav,
}: {
  q: QuoteRowT;
  selected: boolean;
  fav: boolean;
  onSelect: (s: string) => void;
  onToggleFav: (s: string) => void;
}) {
  return (
    <RowShell selected={selected} onSelect={() => onSelect(q.symbol)} star={<StarToggle symbol={q.symbol} fav={fav} onToggleFav={onToggleFav} />}>
      <IdentityCell q={q} selected={selected} />
      <Sparkline data={q.spark} up={q.chg5d >= 0} />
      <PriceCell q={q} />
    </RowShell>
  );
}

function LevelsRow({
  q,
  selected,
  fav,
  onSelect,
  onToggleFav,
}: {
  q: QuoteRowT;
  selected: boolean;
  fav: boolean;
  onSelect: (s: string) => void;
  onToggleFav: (s: string) => void;
}) {
  return (
    <RowShell selected={selected} onSelect={() => onSelect(q.symbol)} star={<StarToggle symbol={q.symbol} fav={fav} onToggleFav={onToggleFav} />}>
      <IdentityCell q={q} selected={selected} />
      <div className="text-right font-mono text-[10px] leading-tight">
        <p className="text-emerald-300">
          เข้า {q.entryLow}-{q.entryHigh}
        </p>
        <p className="text-rose-300">หยุด {q.stopHard}</p>
        <p className="text-zinc-400">ขนาด {q.maxSizePct}%</p>
      </div>
      <PriceCell q={q} />
    </RowShell>
  );
}

function SkeletonRows() {
  return (
    <div aria-hidden className="divide-y divide-zinc-800/60">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2.5">
          <div className="h-3.5 w-3.5 animate-pulse rounded-full bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-800" />
            <div className="h-2 w-10 animate-pulse rounded bg-zinc-800/70" />
          </div>
          <div className="h-3 w-14 animate-pulse rounded bg-zinc-800" />
          <div className="h-3 w-12 animate-pulse rounded bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab, hasQuery }: { tab: WatchTab; hasQuery: boolean }) {
  const msg =
    tab === 'favorites'
      ? 'ยังไม่มีรายการโปรด — กดดาวเพื่อเก็บหุ้น'
      : hasQuery
        ? 'ไม่พบ symbol ที่ค้นหา'
        : 'ไม่มีข้อมูลในมุมมองนี้';
  return <p className="px-4 py-8 text-center text-xs text-zinc-500">{msg}</p>;
}

// ─── Watchlist ───

export function Watchlist({
  quotes,
  lastDate,
  loading,
  symbol,
  onSelect,
  favorites,
  onToggleFav,
  activeTab,
  onTabChange,
  className,
}: {
  quotes: QuoteRowT[];
  lastDate: string;
  loading: boolean;
  symbol: string;
  onSelect: (s: string) => void;
  favorites: string[];
  onToggleFav: (s: string) => void;
  activeTab: WatchTab;
  onTabChange: (t: WatchTab) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');

  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = quotes;
    if (activeTab === 'favorites') list = list.filter((r) => favSet.has(r.symbol));
    if (q) list = list.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    return [...list].sort(activeTab === 'levels' ? byLevels : byMarket);
  }, [quotes, query, activeTab, favSet]);

  return (
    <section
      aria-label="Live Market Watch"
      className={cn('flex h-full min-h-0 flex-col rounded-xl border border-zinc-800/80 bg-zinc-900/30', className)}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 p-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <h3 className="text-sm font-semibold text-zinc-200">Live Market Watch</h3>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold tracking-wider text-emerald-300"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
            LIVE QUOTE
          </Badge>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          จำนวน {visible.length} symbols · {fmtDate(lastDate)}
        </p>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pt-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาในรายการ..."
            aria-label="ค้นหาในรายการ"
            className="h-9 border-zinc-800 bg-zinc-950/60 pl-8 text-sm text-zinc-200 placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="มุมมองรายการตลาด" className="flex shrink-0 items-center gap-1 border-b border-zinc-800/80 px-3">
        {TABS.map((t) => {
          const on = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onTabChange(t.key)}
              className={cn(
                '-mb-px border-b-2 px-2.5 py-2.5 text-[11px] font-semibold tracking-wide transition-colors',
                on ? 'border-amber-400 text-amber-300' : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="sr-only" aria-live="polite">
          {loading ? 'กำลังโหลดรายการตลาด' : `แสดง ${visible.length} หุ้น`}
        </p>
        {loading ? (
          <SkeletonRows />
        ) : visible.length === 0 ? (
          <EmptyState tab={activeTab} hasQuery={query.trim().length > 0} />
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {visible.map((q) =>
              activeTab === 'levels' ? (
                <LevelsRow
                  key={q.symbol}
                  q={q}
                  selected={q.symbol === symbol}
                  fav={favSet.has(q.symbol)}
                  onSelect={onSelect}
                  onToggleFav={onToggleFav}
                />
              ) : (
                <MarketRow
                  key={q.symbol}
                  q={q}
                  selected={q.symbol === symbol}
                  fav={favSet.has(q.symbol)}
                  onSelect={onSelect}
                  onToggleFav={onToggleFav}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default Watchlist;
