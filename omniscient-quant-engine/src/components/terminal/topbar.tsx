'use client';

import { Menu, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chgColor, fmtPct } from '@/lib/format';
import { MicroLabel, PulseDot } from '@/components/dashboard/primitives';
import type { RegimeInfo } from '@/lib/quant/api-types';

// ─── Sub-components (module-level) ───

function ChgBadge({ chg1d }: { chg1d: number }) {
  const up = chg1d >= 0;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums', chgColor(chg1d))}
      aria-label={`เปลี่ยนแปลง 1 วัน ${fmtPct(chg1d)}`}
    >
      {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
      {fmtPct(chg1d)}
    </span>
  );
}

function RegimeMiniPill({ regime }: { regime: RegimeInfo }) {
  return (
    <span className="oqe-panel hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 tabular-nums md:inline-flex">
      <PulseDot tone="warn" />
      <span className="max-w-28 truncate">{regime.regime}</span>
      {/* marketChg1d จากเอนจินเป็นสัดส่วน (เช่น 0.0158) → ×100 ก่อนแสดงเป็น % */}
      <span className={chgColor(regime.marketChg1d)}>{fmtPct(regime.marketChg1d * 100)}</span>
    </span>
  );
}

// ─── Topbar ───

export function TerminalTopbar({
  symbol,
  name,
  chg1d,
  regime,
  loading = false,
  onOpenSearch,
  onOpenNav,
  onRefresh,
}: {
  symbol: string;
  name: string;
  chg1d: number;
  regime: RegimeInfo | null;
  loading?: boolean;
  onOpenSearch: () => void;
  onOpenNav: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-zinc-950/70 px-3 backdrop-blur-md">
      {/* Left: current symbol */}
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <MicroLabel className="hidden sm:block">กำลังดู</MicroLabel>
        <span className="font-mono text-lg font-bold leading-none text-zinc-100 tabular-nums">{symbol}</span>
        <span className="hidden max-w-40 truncate text-xs text-zinc-500 lg:inline">{name}</span>
        <ChgBadge chg1d={chg1d} />
      </div>

      {/* Center: search trigger */}
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="ค้นหาหุ้นไทย (SET)"
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-sm text-zinc-500 transition-colors duration-200 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-zinc-400"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">ค้นหาหุ้นไทย (SET)...</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-white/[0.1] bg-zinc-950 px-1 font-mono text-[10px] text-zinc-500 sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {/* Right: regime + refresh + mobile nav */}
      <div className="flex shrink-0 items-center gap-1.5">
        {regime && <RegimeMiniPill regime={regime} />}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="รีเฟรชข้อมูล"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-zinc-300 transition-colors duration-200 hover:bg-white/[0.08] hover:text-zinc-100 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="เปิดเมนูนำทาง"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-zinc-300 transition-colors duration-200 hover:bg-white/[0.08] hover:text-zinc-100 lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}

export default TerminalTopbar;
