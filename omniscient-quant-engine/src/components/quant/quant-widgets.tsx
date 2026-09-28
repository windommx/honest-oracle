'use client';

import { cn } from '@/lib/utils';
import { signalColor, signalLabel } from '@/lib/format';
import type { GateSnapshotT } from '@/lib/quant/api-types';

const GATE_META: Array<{ key: keyof GateSnapshotT; label: string; desc: string }> = [
  { key: 'g1', label: 'G1', desc: 'Regime' },
  { key: 'g2', label: 'G2', desc: 'Dependence' },
  { key: 'g3', label: 'G3', desc: 'Technical' },
  { key: 'g4', label: 'G4', desc: 'Risk' },
  { key: 'g5', label: 'G5', desc: 'Execution' },
];

/** ชิป G1–G5 ขนาดเล็กสำหรับตาราง */
export function GateChips({ gates, size = 'sm' }: { gates: GateSnapshotT; size?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-1" aria-label="สถานะ 5 Gates">
      {GATE_META.map((g) => {
        const pass = gates[g.key];
        return (
          <span
            key={g.key}
            title={`${g.label} ${g.desc}: ${pass ? 'ผ่าน' : 'ตก'}`}
            className={cn(
              'inline-flex items-center justify-center rounded border font-mono',
              size === 'sm' ? 'h-4.5 w-6 text-[9px]' : 'h-6 w-8 text-[11px]',
              pass
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                : 'border-zinc-700 bg-zinc-800/60 text-zinc-500 line-through decoration-zinc-600',
            )}
          >
            {g.label}
          </span>
        );
      })}
    </div>
  );
}

export function SignalBadge({ signal }: { signal: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium', signalColor(signal))}>
      {signalLabel(signal)}
    </span>
  );
}

/** การ์ด KPI เล็ก */
export function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
  mono = true,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'up' | 'down' | 'warn';
  mono?: boolean;
}) {
  const toneCls =
    tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-300' : 'text-zinc-100';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', mono && 'font-mono', toneCls)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{sub}</p>}
    </div>
  );
}

/** Panel หัวข้อมาตรฐาน */
export function Panel({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-zinc-800 bg-zinc-900/40', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
