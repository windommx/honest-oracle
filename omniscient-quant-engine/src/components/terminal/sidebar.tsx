'use client';

import {
  BrainCircuit,
  ChevronDown,
  Crown,
  FlaskConical,
  Gauge,
  Globe,
  History,
  LayoutDashboard,
  LineChart,
  Layers,
  Monitor,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Target,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { driftColor, fmtDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PulseDot } from '@/components/dashboard/primitives';
import type { RegimeInfo } from '@/lib/quant/api-types';
import { dataKindTag, useAppMeta } from '@/components/providers/app-meta';

// ─── โครงสร้างเมนูนำทาง (คงที่ระดับโมดูล) ───

interface NavItemDef {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroupDef {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItemDef[];
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    key: 'home',
    label: 'ศูนย์ควบคุม',
    icon: Gauge,
    items: [
      { key: 'dashboard', label: 'Command Center', icon: Gauge },
      { key: 'terminal', label: 'ตลาดสด · Terminal', icon: Monitor },
    ],
  },
  {
    key: 'core',
    label: 'จักรวาลหลัก',
    icon: Globe,
    items: [
      { key: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
      { key: 'synthesis', label: 'หลอมรวม', icon: FlaskConical },
      { key: 'decision', label: 'Decision (L6)', icon: Target },
    ],
  },
  {
    key: 'analysis',
    label: 'วิเคราะห์',
    icon: LineChart,
    items: [
      { key: 'multiview', label: 'Multi-View (L3)', icon: Layers },
      { key: 'dependence', label: 'Dependence (L2)', icon: Waypoints },
    ],
  },
  {
    key: 'risk',
    label: 'ความเสี่ยง',
    icon: ShieldAlert,
    items: [
      { key: 'risk', label: 'Risk & Sizing (L5)', icon: ShieldHalf },
      { key: 'metarisk', label: 'Meta-Risk (L∞)', icon: ShieldAlert },
      { key: 'apex', label: 'Apex (L7)', icon: Crown },
    ],
  },
  {
    key: 'lab',
    label: 'MY LAB',
    icon: FlaskConical,
    items: [
      { key: 'backtest', label: 'Backtest & Journal', icon: History },
      { key: 'auditor', label: 'AI Auditor', icon: Sparkles },
    ],
  },
];

const THAI_RE = /[\u0E00-\u0E7F]/;
const isThai = (s: string): boolean => THAI_RE.test(s);

// ─── Sub-components (module-level) ───

function NavItem({ item, active, onNavigate }: { item: NavItemDef; active: boolean; onNavigate: (v: string) => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-all duration-200',
        active
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-[0_0_18px_-6px_rgba(251,191,36,0.5)]'
          : 'border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-200',
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-amber-400"
          aria-hidden="true"
        />
      )}
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function NavGroup({
  group,
  view,
  onNavigate,
}: {
  group: NavGroupDef;
  view: string;
  onNavigate: (v: string) => void;
}) {
  const GroupIcon = group.icon;
  const thai = isThai(group.label);
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger
        className={cn(
          'group flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300',
          thai ? 'tracking-normal' : 'uppercase tracking-[0.14em]',
        )}
      >
        <GroupIcon className="h-3.5 w-3.5" aria-hidden />
        <span className="truncate">{group.label}</span>
        <ChevronDown
          className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 pb-1 pt-0.5">
          {group.items.map((item) => (
            <NavItem key={item.key} item={item} active={view === item.key} onNavigate={onNavigate} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RegimeFooterChip({ regime, drift }: { regime: RegimeInfo; drift?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 font-mono text-[10px] tabular-nums',
        drift ? driftColor(drift) : 'border-white/[0.08] bg-white/[0.04] text-zinc-300',
      )}
      title={`Regime ล่าสุด · ${fmtDate(regime.date)}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current" aria-hidden />
      <span className="truncate">{regime.regime}</span>
      <span className="ml-auto shrink-0">{fmtDate(regime.date)}</span>
    </span>
  );
}

// ─── Sidebar ───

export function TerminalSidebar({
  view,
  onNavigate,
  regime,
  drift,
  className,
}: {
  view: string;
  onNavigate: (v: string) => void;
  regime: RegimeInfo | null;
  drift?: string;
  /** rail = desktop fixed rail (hidden < lg); plain = แสดงเสมอ (ใช้ใน mobile Sheet) */
  className?: string;
}) {
  const { meta } = useAppMeta();
  return (
    <aside
      className={cn(
        'h-full w-64 shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950/80 backdrop-blur',
        className,
      )}
    >
      {/* Brand block */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4 py-4">
        <div
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(251,191,36,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.10) 1px, transparent 1px)',
            backgroundSize: '6px 6px',
          }}
        >
          <BrainCircuit className="h-5 w-5 text-amber-400" aria-hidden />
          <PulseDot tone="warn" className="oqe-live-dot absolute -right-1 -top-1 ring-2 ring-zinc-950" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-zinc-100">Omniscient Quant</p>
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            QUANT COMMAND CENTER
          </p>
        </div>
      </div>

      {/* User card */}
      <div className="shrink-0 p-3">
        <div className="oqe-panel flex items-center gap-2.5 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 font-mono text-sm font-bold text-zinc-950">
            Q
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-semibold text-zinc-200">นักวิเคราะห์เชิงปริมาณ</p>
            <p className="truncate text-[10px] text-zinc-500">Quant Workspace · Pro</p>
          </div>
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold text-amber-300"
          >
            <ShieldCheck aria-hidden />
            PRO
          </Badge>
        </div>
      </div>

      {/* Nav groups (scrollable) */}
      <nav aria-label="เมนูนำทางหลัก" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.key} group={group} view={view} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Bottom: regime chip + version */}
      <div className="mt-auto shrink-0 border-t border-white/[0.06] p-3">
        {regime && <RegimeFooterChip regime={regime} drift={drift} />}
        <p className="mt-2 text-center text-[10px] text-zinc-400">
          OQE v{meta?.app.version ?? '—'}
          {meta ? ` · ${meta.data.kind === 'synthetic' ? 'ข้อมูลจำลองเพื่อสาธิต' : dataKindTag(meta)}` : ''}
        </p>
      </div>
    </aside>
  );
}

export default TerminalSidebar;
