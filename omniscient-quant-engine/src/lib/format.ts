/** Formatting helpers for the quant UI (client-safe) */

export const fmtPct = (v: number | null | undefined, digits = 2): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;

export const fmtNum = (v: number | null | undefined, digits = 2): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits);

export const fmtBaht = (v: number | null | undefined, digits = 2): string =>
  v == null || !Number.isFinite(v) ? '—' : `฿${v.toFixed(digits)}`;

export const fmtSigned = (v: number | null | undefined, digits = 2): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
};

export const signalLabel = (s: string): string =>
  s === 'ENTRY_PULLBACK' ? 'เข้าแบบ Pullback' : s === 'ENTRY_MOMENTUM' ? 'เข้าแบบ Momentum' : 'เฝ้าดู / No Trade';

export const signalColor = (s: string): string =>
  s === 'ENTRY_PULLBACK'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : s === 'ENTRY_MOMENTUM'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
      : 'bg-zinc-800/60 text-zinc-400 border-zinc-700';

export const chgColor = (v: number): string =>
  v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-zinc-400';

export const driftColor = (d: string): string =>
  d === 'HEAVY' ? 'text-rose-400 border-rose-500/40 bg-rose-500/10' : d === 'MODERATE' ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
