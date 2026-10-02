'use client';

import { RefreshCw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { driftColor, fmtPct, fmtDate } from '@/lib/format';
import type { RegimeInfo } from '@/lib/quant/api-types';

export function QuantHeader({
  regime,
  loading,
  onRefresh,
}: {
  regime: RegimeInfo | null;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/75">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
            <Activity className="h-5 w-5 text-emerald-400" aria-hidden />
          </div>
          <div className="leading-tight">
            <h1 className="font-mono text-sm font-bold tracking-widest text-zinc-100 sm:text-base">
              OMNISCIENT QUANT ENGINE
            </h1>
            <p className="text-[11px] text-zinc-500">
              Full-Cycle Multi-View Platform · L0–L6 · Convergent Evidence 5-Gates
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {regime && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] text-amber-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                {regime.regime}
              </span>
              <span className="hidden rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-400 sm:inline">
                SET proxy {fmtPct(regime.marketChg1d * 100)} · {fmtDate(regime.date)}
              </span>
              <span className="hidden rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-500 md:inline">
                decouple {regime.decoupleCount}/22
              </span>
            </>
          )}
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 border-zinc-700 bg-zinc-900 px-2.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="ml-1 text-xs">รีเฟรช</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function DriftChip({ drift, psi }: { drift: string; psi: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] ${driftColor(drift)}`}>
      PSI {psi.toFixed(2)} · {drift === 'HEAVY' ? 'Drift รุนแรง' : drift === 'MODERATE' ? 'Drift ปานกลาง' : 'เสถียร'}
    </span>
  );
}
