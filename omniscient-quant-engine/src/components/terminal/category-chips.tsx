'use client';

import { cn } from '@/lib/utils';

export interface CategoryChipT {
  key: string;
  label: string;
  sub: string;
  count: number;
}

// ─── Sub-components (module-level) ───

function CategoryChip({
  cat,
  active,
  onSelect,
}: {
  cat: CategoryChipT;
  active: boolean;
  onSelect: (k: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(cat.key)}
      className={cn(
        'min-w-fit rounded-xl border px-4 py-2 text-left transition-colors',
        active
          ? 'border-amber-500/60 bg-amber-500/10'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className={cn('font-mono text-lg font-bold leading-none', active ? 'text-amber-300' : 'text-zinc-100')}>
          {cat.count}
        </span>
        <span className="text-xs font-semibold text-zinc-200">{cat.label}</span>
      </span>
      <span className="mt-1 block max-w-44 truncate text-[10px] text-zinc-500">{cat.sub}</span>
    </button>
  );
}

// ─── Category chips ───

export function CategoryChips({
  cats,
  active,
  onSelect,
  className,
}: {
  cats: CategoryChipT[];
  active: string;
  onSelect: (k: string) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="ตัวกรองหมวดหมู่" className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {cats.map((cat) => (
        <CategoryChip key={cat.key} cat={cat} active={cat.key === active} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default CategoryChips;
