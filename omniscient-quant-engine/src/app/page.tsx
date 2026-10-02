'use client';

/**
 * Omniscient Quant Engine — App Shell
 * Layout แบบ Market Intelligence Terminal (ปรับจากดีไซน์ Nugaom AI Pick):
 *  - Sidebar (rail desktop + Sheet mobile) นำทางทั้ง Terminal และแท็บวิเคราะห์ทั้ง 10 แท็บ
 *  - TopBar: current symbol + ⌘K search + regime
 *  - เนื้อหา: Terminal view (default) หรือแท็บเดิม
 *  - Status bar ล่าสุดติดขอบล่างเสมอ (sticky footer)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TerminalSidebar } from '@/components/terminal/sidebar';
import { TerminalTopbar } from '@/components/terminal/topbar';
import TerminalView from '@/components/terminal/terminal-view';
import { CommandCenter } from '@/components/dashboard/command-center';
import { AppFooter } from '@/components/app-footer';
import { FlowDashboardView } from '@/components/flows/flow-dashboard';
import { DeepResearchView } from '@/components/research/deep-research-view';
import { RhythmView } from '@/components/rhythm/rhythm-view';
import { AtlasView } from '@/components/atlas/atlas-view';
import { WalkforwardView } from '@/components/walkforward/walkforward-view';
import { WinrateView } from '@/components/winrate/winrate-view';
import { WorkflowView } from '@/components/workflow/workflow-view';
import { FirstRunGuide } from '@/components/first-run-guide';
import { AppMetaProvider, dataKindTag, useAppMeta } from '@/components/providers/app-meta';
import { OverviewTab } from '@/components/quant/overview-tab';
import { MultiviewTab } from '@/components/quant/multiview-tab';
import { DependenceTab } from '@/components/quant/dependence-tab';
import { DecisionTab } from '@/components/quant/decision-tab';
import { RiskTab } from '@/components/quant/risk-tab';
import { BacktestJournalTab } from '@/components/quant/backtest-journal-tab';
import { AuditorTab } from '@/components/quant/auditor-tab';
import { SynthesisTab } from '@/components/quant/synthesis-tab';
import { MetaRiskTab } from '@/components/quant/meta-risk-tab';
import { ApexTab } from '@/components/quant/apex-tab';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { useApi, apiCall } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import type {
  BoardResponse,
  FactorsResponse,
  DependenceResponse,
  DecisionResponse,
  BacktestResponse,
  JournalEntryT,
  AuditReportT,
} from '@/lib/quant/api-types';

type ViewKey =
  | 'dashboard'
  | 'terminal'
  | 'overview'
  | 'synthesis'
  | 'multiview'
  | 'dependence'
  | 'decision'
  | 'risk'
  | 'metarisk'
  | 'apex'
  | 'backtest'
  | 'auditor'
  | 'flows'
  | 'rhythm'
  | 'atlas'
  | 'winrate'
  | 'walkforward'
  | 'workflow'
  | 'research';

export default function Home() {
  return (
    <AppMetaProvider>
      <HomeShell />
    </AppMetaProvider>
  );
}

function HomeShell() {
  const { toast } = useToast();
  const { meta } = useAppMeta();
  const [view, setView] = useState<ViewKey>('dashboard');
  const [symbol, setSymbol] = useState('TSE');
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const boardQ = useApi<BoardResponse>('/api/board');
  const board = boardQ.data;

  // lazy per-tab loading (เหมือนเดิม)
  const factorsQ = useApi<FactorsResponse>(view === 'multiview' ? '/api/analytics/factors' : null);
  const dependenceQ = useApi<DependenceResponse>(view === 'dependence' ? '/api/analytics/dependence' : null);
  const decisionQ = useApi<DecisionResponse>(
    view === 'decision' || view === 'risk' || view === 'dependence' ? `/api/decision/${symbol}` : null,
  );
  const btQ = useApi<BacktestResponse>(view === 'backtest' ? '/api/backtest' : null);
  const journalQ = useApi<{ entries: JournalEntryT[] }>(view === 'backtest' ? '/api/journal' : null);
  const auditQ = useApi<{ reports: AuditReportT[] }>(view === 'auditor' ? '/api/audit' : null);

  // refresh ของ useApi เป็น callback คงที่ — ดึงออกมาเป็นตัวแปรเพื่อให้ dependency ของ hook ชัดเจน
  const { refresh: refreshBoard } = boardQ;
  const { refresh: refreshFactors } = factorsQ;
  const { refresh: refreshDependence } = dependenceQ;
  const { refresh: refreshDecision } = decisionQ;
  const { refresh: refreshBacktest } = btQ;
  const { refresh: refreshJournal } = journalQ;

  const refreshAll = useCallback(() => {
    setTick((t) => t + 1);
    refreshBoard();
    refreshFactors();
    refreshDependence();
    refreshDecision();
    refreshBacktest();
  }, [refreshBoard, refreshFactors, refreshDependence, refreshDecision, refreshBacktest]);

  // ⌘K / Ctrl+K เปิด search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSaveToJournal = useCallback(async () => {
    if (!decisionQ.data) return;
    const d = decisionQ.data;
    setSaving(true);
    try {
      await apiCall('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runDate: new Date().toISOString(),
          symbol: d.symbol,
          signal: d.eval.signal,
          gates: d.eval.gates,
          price: d.row.close,
          entryLow: d.eval.plan.entryLow,
          entryHigh: d.eval.plan.entryHigh,
          trigger: d.eval.plan.trigger,
          stopStruct: d.eval.plan.stopStruct,
          stopHard: d.eval.plan.stopHard,
          sizePct: d.eval.plan.sizePct,
          cvar: d.eval.plan.cvar,
          probUp: d.eval.probUp,
          status: d.eval.signal === 'NO_TRADE' ? 'SKIPPED' : 'PLANNED',
          notes: `saved from decision tab · ${d.eval.phase}`,
        }),
      });
      toast({ title: 'บันทึกแล้ว', description: `แผน ${d.symbol} เข้า Journal เรียบร้อย — ดูที่แท็บ Backtest & Journal` });
    } catch (e) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e instanceof Error ? e.message : 'unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [decisionQ.data, toast]);

  const handleSeedDemo = useCallback(async () => {
    setSeeding(true);
    try {
      await apiCall('/api/journal', { method: 'PUT' });
      refreshJournal();
      toast({ title: 'เติมตัวอย่างแล้ว', description: 'Journal มีรายการจาก Decision Board ล่าสุด' });
    } catch (e) {
      toast({ title: 'เติมไม่สำเร็จ', description: e instanceof Error ? e.message : 'unknown error', variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  }, [refreshJournal, toast]);

  const handleUpdateEntry = useCallback(
    async (id: string, patch: { status?: string; pnlPct?: number | null; notes?: string }) => {
      try {
        await apiCall('/api/journal', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        });
        refreshJournal();
      } catch (e) {
        toast({ title: 'อัปเดตไม่สำเร็จ', description: e instanceof Error ? e.message : 'unknown error', variant: 'destructive' });
      }
    },
    [refreshJournal, toast],
  );

  const symbols = useMemo(() => board?.rows.map((r) => r.symbol) ?? [], [board]);
  const selectSymbol = useCallback((s: string) => {
    setSymbol(s);
    setView('decision');
  }, []);

  const currentRow = useMemo(() => board?.rows.find((r) => r.symbol === symbol) ?? null, [board, symbol]);

  const navigate = useCallback((v: string) => {
    setView(v as ViewKey);
    setNavOpen(false);
  }, []);

  const pickFromSearch = useCallback((s: string) => {
    setSymbol(s);
    setView('terminal');
    setSearchOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-200 print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Sidebar rail (desktop) */}
      <TerminalSidebar
        view={view}
        onNavigate={navigate}
        regime={board?.regime ?? null}
        drift={board?.summary.drift}
        className="hidden lg:flex print:hidden"
      />

      {/* Mobile nav sheet */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-64 border-zinc-800 bg-zinc-950 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>เมนูนำทาง</SheetTitle>
            <SheetDescription>เลือกมุมมองของแพลตฟอร์ม Omniscient Quant Engine</SheetDescription>
          </SheetHeader>
          <TerminalSidebar
            view={view}
            onNavigate={navigate}
            regime={board?.regime ?? null}
            drift={board?.summary.drift}
            className="flex"
          />
        </SheetContent>
      </Sheet>

      {/* คอลัมน์หลัก */}
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <TerminalTopbar
          symbol={symbol}
          name={currentRow?.name ?? ''}
          chg1d={currentRow?.chg1d ?? 0}
          regime={board?.regime ?? null}
          loading={boardQ.loading}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenNav={() => setNavOpen(true)}
          onRefresh={refreshAll}
        />

        <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          {view === 'dashboard' && <FirstRunGuide onNavigate={navigate} />}
          {view === 'dashboard' ? (
            <CommandCenter
              board={board}
              boardLoading={boardQ.loading}
              tick={tick}
              onOpenSymbol={(s, v) => {
                setSymbol(s);
                setView(v ?? 'decision');
              }}
              onNavigate={navigate}
            />
          ) : view === 'terminal' ? (
            <TerminalView symbol={symbol} onSymbolChange={setSymbol} tick={tick} />
          ) : view === 'flows' ? (
            // เงินไหลนักลงทุนใช้ความกว้างเต็มจอ — กราฟ + ตารางวางคู่กันต้องการ > 1280px
            <div className="w-full px-3 py-4 sm:px-5">
              <FlowDashboardView />
            </div>
          ) : view === 'rhythm' ? (
            // จังหวะตลาดใช้ความกว้างเต็มจอ — กราฟเวลายาว + แผนที่วันคู่กับตาราง
            <div className="w-full px-3 py-4 sm:px-5">
              <RhythmView />
            </div>
          ) : view === 'workflow' ? (
            // กระบวนการทำงานใช้ความกว้างเต็มจอ — การ์ดขั้นตอน 3 คอลัมน์ + ตารางคำสั่ง/สมุดไม้กระดาษ
            <div className="w-full px-3 py-4 sm:px-5">
              <WorkflowView />
            </div>
          ) : view === 'atlas' ? (
            // Atlas ใช้ความกว้างเต็มจอ — แผนที่คู่ตาราง + forest plot หลายคอลัมน์
            <div className="w-full px-3 py-4 sm:px-5">
              <AtlasView />
            </div>
          ) : view === 'winrate' ? (
            // เป้าหมายชนะ 80% ใช้ความกว้างเต็มจอ — กราฟคู่ + แผนภาพกระจายคู่กรวย + ตาราง config
            <div className="w-full px-3 py-4 sm:px-5">
              <WinrateView />
            </div>
          ) : view === 'walkforward' ? (
            // ทดสอบเดินหน้าใช้ความกว้างเต็มจอ — แผนภาพหน้าต่าง + forest plot คู่ + ตารางไม้กว้าง
            <div className="w-full px-3 py-4 sm:px-5">
              <WalkforwardView />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
              {view === 'overview' && (
                <OverviewTab board={board} loading={boardQ.loading} onSelectSymbol={selectSymbol} />
              )}

              {view === 'synthesis' && (
                <SynthesisTab symbols={symbols.length ? symbols : ['TSE']} initialSymbol={symbol} />
              )}

              {view === 'multiview' &&
                (factorsQ.error ? (
                  <ErrorNote msg={factorsQ.error} onRetry={factorsQ.refresh} />
                ) : (
                  <MultiviewTab data={factorsQ.data} loading={factorsQ.loading} />
                ))}

              {view === 'dependence' &&
                (dependenceQ.error ? (
                  <ErrorNote msg={dependenceQ.error} onRetry={dependenceQ.refresh} />
                ) : (
                  <DependenceTab
                    matrix={dependenceQ.data}
                    dep={decisionQ.data}
                    matrixLoading={dependenceQ.loading}
                    decLoading={(view === 'dependence' && decisionQ.loading) as boolean}
                  />
                ))}

              {view === 'decision' &&
                (decisionQ.error ? (
                  <ErrorNote msg={decisionQ.error} onRetry={decisionQ.refresh} />
                ) : (
                  <DecisionTab
                    symbols={symbols.length ? symbols : ['TSE']}
                    symbol={symbol}
                    onSymbolChange={setSymbol}
                    decision={decisionQ.data}
                    loading={decisionQ.loading}
                    board={board}
                    onSaveToJournal={handleSaveToJournal}
                    saving={saving}
                  />
                ))}

              {view === 'research' && (
                <DeepResearchView symbols={symbols.length ? symbols : ['TSE']} symbol={symbol} onSymbolChange={setSymbol} />
              )}

              {view === 'risk' && <RiskTab board={board} decision={decisionQ.data} />}

              {view === 'metarisk' && <MetaRiskTab symbols={symbols.length ? symbols : ['TSE']} />}

              {view === 'apex' && <ApexTab symbols={symbols.length ? symbols : ['TSE']} />}

              {view === 'backtest' &&
                (btQ.error ? (
                  <ErrorNote msg={btQ.error} onRetry={btQ.refresh} />
                ) : (
                  <BacktestJournalTab
                    bt={btQ.data}
                    btLoading={btQ.loading}
                    entries={journalQ.data?.entries ?? []}
                    journalLoading={journalQ.loading}
                    onSeedDemo={handleSeedDemo}
                    onUpdateEntry={handleUpdateEntry}
                    seeding={seeding}
                  />
                ))}

              {view === 'auditor' && (
                <AuditorTab reports={auditQ.data?.reports ?? null} loading={auditQ.loading} onDone={auditQ.refresh} />
              )}
            </div>
          )}
        </main>

        {/* Status bar — sticky footer เสมอ (ป้ายข้อมูลจาก provenance จริง) */}
        <AppFooter busy={boardQ.loading} />
      </div>

      {/* ⌘K global symbol search */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="ค้นหาหุ้นไทย (สัญลักษณ์ ชื่อ หรือหมวด)..." />
        <CommandList>
          <CommandEmpty>ไม่พบ symbol ที่ค้นหา</CommandEmpty>
          <CommandGroup heading={`หุ้น SET${meta ? ` (${dataKindTag(meta)})` : ''} — ${symbols.length} ตัว`}>
            {(board?.rows ?? []).map((r) => (
              <CommandItem
                key={r.symbol}
                value={`${r.symbol} ${r.name} ${r.sector}`}
                onSelect={() => pickFromSearch(r.symbol)}
                className="gap-3"
              >
                <span className="w-16 font-mono text-sm font-bold text-zinc-100">{r.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{r.name}</span>
                <span className="font-mono text-xs text-zinc-400">{r.price.toFixed(2)}</span>
                <span className={`font-mono text-xs ${r.chg1d >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {r.chg1d >= 0 ? '+' : ''}
                  {r.chg1d.toFixed(2)}%
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function ErrorNote({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
      <p className="text-sm text-rose-300">โหลดข้อมูลไม่สำเร็จ: {msg}</p>
      <button
        onClick={onRetry}
        className="mt-3 rounded-md border border-rose-500/50 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10"
      >
        ลองอีกครั้ง
      </button>
    </div>
  );
}
