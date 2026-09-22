"use client"

import { useState, type CSSProperties } from "react"
import { BrainCircuit, ChevronRight, Menu, Search } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useApi } from "@/hooks/use-api"
import type { OverviewResponse } from "@/lib/momentum/contracts"
import { ALL_TABS, NAV_GROUPS, findTab, type NavItem } from "./nav-config"
import CommandPalette from "./command-palette"
import MarketClock from "./market-clock"
import TickerTape from "./ticker-tape"
import OverviewTab from "./tabs/overview-tab"
import MapTab from "./map-tab"
import AnalyticsTab from "./tabs/analytics-tab"
import SignalsTab from "./tabs/signals-tab"
import StopsTab from "./tabs/stops-tab"
import BacktestTab from "./tabs/backtest-tab"
import ResearchTab from "./tabs/research-tab"
import EvidenceTab from "./tabs/evidence-tab"
import AlphaTab from "./tabs/alpha-tab"
import LabTab from "./tabs/lab-tab"
import JevTab from "./tabs/jev-tab"
import PortfolioTab from "./tabs/portfolio-tab"
import GtaaTab from "./tabs/gtaa-tab"
import SniperTab from "./tabs/sniper-tab"
import FlagshipTab from "./tabs/flagship-tab"
import SkillsTab from "./tabs/skills-tab"
import DataTab from "./tabs/data-tab"

/* ปลายทางหลัก 4 อันดับแรกบน bottom dock ของมือถือ (อันที่ 5 = "เมนู" → Command Palette)
 * หา index ด้วย value เสมอ — กัน index เลื่อนเมื่อเพิ่มแท็บใหม่ */
const DOCK_VALUES = ["overview", "map", "signals", "jev"] as const
const DOCK_TABS: NavItem[] = DOCK_VALUES.map(
  (v) => ALL_TABS.find((t) => t.value === v) ?? ALL_TABS[0],
)

const SIDEBAR_VARS = {
  "--sidebar": "#fbfcfe", // ขาวนวล — แถบเมนูสว่าง
  "--sidebar-border": "rgba(148,163,184,0.22)",
  "--sidebar-accent": "rgba(13,148,136,0.08)",
} as CSSProperties

function regimeBadge(regime: OverviewResponse["regime"]) {
  if (!regime) return null
  if (regime.action === "risk_on")
    return (
      <Badge className="border-neon-green/35 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
        🟢 risk_on · conf {regime.conf}
      </Badge>
    )
  if (regime.action === "neutral")
    return (
      <Badge className="border-neon-amber/35 bg-neon-amber/10 text-neon-amber shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
        🟡 neutral · conf {regime.conf}
      </Badge>
    )
  return (
    <Badge className="border-neon-rose/35 bg-neon-rose/10 text-neon-rose shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
      🔴 risk_off · conf {regime.conf}
    </Badge>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan shadow-[0_2px_8px_-2px_rgba(14,116,144,0.35)] ${compact ? "h-8 w-8" : "h-9 w-9"}`}
      >
        <BrainCircuit className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
      </div>
      <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <p className={`neon-text-cyan truncate font-bold ${compact ? "text-sm" : "text-sm sm:text-[15px]"}`}>
          Thai Momentum Platform
        </p>
        <p className="truncate text-[11px] font-medium text-neon-purple/90">หุ้นไทย × Jev AI</p>
      </div>
    </div>
  )
}

function SidebarNav({ tab, onSelect }: { tab: string; onSelect: (v: string) => void }) {
  const { setOpenMobile } = useSidebar()
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = tab === item.value
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      onClick={() => {
                        onSelect(item.value)
                        setOpenMobile(false)
                      }}
                      tooltip={`${item.label} — ${group.label}`}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "min-h-11 gap-2.5 border border-neon-green/30 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-neon-green/15"
                          : "min-h-11 gap-2.5 text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                      }
                    >
                      <Icon aria-hidden />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}

/* สถานะระบบสด ๆ ท้าย sidebar — LIVE dot + paper mode */
function SidebarStatus() {
  return (
    <div
      title="ระบบออนไลน์ · ทำงานในโหมดจำลอง (Paper mode)"
      className="flex min-w-0 items-center gap-2 rounded-md border border-neon-green/25 bg-neon-green/[0.06] px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0"
    >
      <span className="status-dot status-dot-live" aria-hidden />
      <span className="truncate text-[10px] font-semibold leading-3 tracking-wide text-neon-green group-data-[collapsible=icon]:hidden">
        LIVE · PAPER
      </span>
    </div>
  )
}

/* แถบนำทางล่างสำหรับมือถือ — 5 ปลายทาง + เผื่อ safe area (iOS) */
function MobileDock({
  tab,
  onSelect,
  onOpenPalette,
}: {
  tab: string
  onSelect: (v: string) => void
  onOpenPalette: () => void
}) {
  return (
    <nav
      aria-label="แถบนำทางหลัก (มือถือ)"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid h-14 grid-cols-5">
        {DOCK_TABS.map((item) => {
          const active = tab === item.value
          const Icon = item.icon
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelect(item.value)}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                active ? "text-neon-green" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <span
                  className="absolute top-0 h-0.5 w-7 rounded-full bg-neon-green shadow-[0_1px_4px_rgba(5,150,105,0.45)]"
                  aria-hidden
                />
              )}
              <Icon className="size-[18px]" aria-hidden />
              <span className="truncate text-[10px] leading-none">{item.short}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="เปิดเมนูทั้งหมดและค้นหา (Command Palette)"
          className="relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Menu className="size-[18px]" aria-hidden />
          <span className="truncate text-[10px] leading-none">เมนู</span>
        </button>
      </div>
    </nav>
  )
}

/**
 * เนื้อโครงสร้าง — ต้องอยู่ "ใน" SidebarProvider (useSidebar/toggleSidebar ใช้ได้เฉพาะลูกของ provider)
 */
function ShellInner() {
  const [tab, setTab] = useState("overview")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { data: ov } = useApi<OverviewResponse>("/api/overview")
  const { toggleSidebar } = useSidebar()
  const { item: currentTab, groupLabel: currentGroup } = findTab(tab)

  const CurrentIcon = currentTab.icon

  return (
    <>
      {/* ---------- Sidebar (desktop / Sheet มือถือ) — ยุบเป็น icon rail ได้ ---------- */}
      <Sidebar collapsible="icon" className="border-border/70">
        <SidebarHeader className="border-b border-border/70 p-3 group-data-[collapsible=icon]:p-2">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="px-1 py-2">
          <SidebarNav tab={tab} onSelect={setTab} />
        </SidebarContent>
        <SidebarFooter className="border-t border-border/70 p-3 group-data-[collapsible=icon]:p-2">
          <SidebarStatus />
        </SidebarFooter>
        <SidebarRail aria-label="สลับซ่อน/แสดงแถบเมนู" />
      </Sidebar>

      {/* ---------- เนื้อหาหลัก (SidebarInset = <main> เดียวของหน้า) ---------- */}
      {/* min-w-0 จำเป็น: กัน min-width:auto ของ flex item floor ที่ min-content ของ header → หน้าล้นแนวนอน */}
      <SidebarInset className="min-h-svh min-w-0 bg-transparent">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="flex min-h-14 flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2 sm:px-4">
            <SidebarTrigger className="size-9 shrink-0" aria-label="สลับแถบเมนู (⌘B)" />
            <Separator orientation="vertical" className="hidden !h-5 sm:block" aria-hidden />

            {/* Breadcrumb — กลุ่ม / แท็บปัจจุบัน (flex-1 ให้ย่อ/ตัดข้อความแทนพับ header เป็น 2 แถว) */}
            <div
              className="flex min-w-0 flex-1 items-center gap-1.5 text-sm"
              aria-label="ตำแหน่งปัจจุบัน"
            >
              <CurrentIcon className="size-4 shrink-0 text-neon-cyan" aria-hidden />
              <span className="hidden truncate text-muted-foreground sm:inline">{currentGroup}</span>
              <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/50 sm:inline" aria-hidden />
              <span className="truncate font-semibold">{currentTab.label}</span>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Command Palette trigger (⌘K) — แบบช่องค้นหาบนจอใหญ่ */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="เปิด Command Palette เพื่อไปที่แท็บอื่น (⌘K)"
                className="hidden h-9 w-52 items-center gap-2 rounded-md border border-border bg-foreground/[0.03] px-3 text-xs text-muted-foreground transition-colors hover:border-neon-cyan/50 hover:bg-neon-cyan/[0.06] hover:text-foreground md:flex xl:w-64"
              >
                <Search className="size-3.5 shrink-0" aria-hidden />
                <span>ไปที่แท็บ / ค้นหา…</span>
                <kbd className="ml-auto rounded border border-border bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
                  ⌘K
                </kbd>
              </button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPaletteOpen(true)}
                aria-label="เปิดเมนูค้นหา (Command Palette)"
                className="size-9 shrink-0 border-border bg-foreground/[0.03] hover:border-neon-cyan/50 hover:bg-neon-cyan/10 hover:text-neon-cyan md:hidden"
              >
                <Search aria-hidden />
              </Button>

              <MarketClock />
              <div className="hidden sm:block">{regimeBadge(ov?.regime ?? null)}</div>
              <Badge
                variant="outline"
                className="border-neon-cyan/30 bg-neon-cyan/5 font-mono text-neon-cyan"
              >
                {ov?.latestDate ?? "—"}
              </Badge>
              <Badge
                variant="secondary"
                className="hidden border border-border bg-foreground/[0.04] text-xs text-foreground lg:inline-flex"
              >
                📄 PAPER MODE 100%
              </Badge>
            </div>
          </div>
        </header>

        {/* แถบหุ้นเคลื่อนไหวแบบ terminal — ลากยาวใต้ header */}
        <TickerTape />

        <section
          aria-label="เนื้อหาหลักของแท็บที่เลือก"
          className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4 sm:py-6"
        >
          {/* ทรานซิชันเปลี่ยนแท็บนุ่มนวล — key ต่อแท็บเพื่อ replay animation */}
          <div key={tab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {tab === "overview" && <OverviewTab onGoTo={setTab} />}
            {tab === "map" && <MapTab />}
            {tab === "analytics" && <AnalyticsTab />}
            {tab === "flagship" && <FlagshipTab />}
            {tab === "signals" && <SignalsTab />}
            {tab === "stops" && <StopsTab />}
            {tab === "backtest" && <BacktestTab />}
            {tab === "research" && <ResearchTab />}
            {tab === "evidence" && <EvidenceTab />}
            {tab === "alpha" && <AlphaTab />}
            {tab === "lab" && <LabTab />}
            {tab === "jev" && <JevTab />}
            {tab === "portfolio" && <PortfolioTab />}
            {tab === "gtaa" && <GtaaTab />}
            {tab === "sniper" && <SniperTab />}
            {tab === "skills" && <SkillsTab onGoTo={setTab} />}
            {tab === "data" && <DataTab />}
          </div>
        </section>

        {/* ---------- Terminal status bar (footer ติดล่างเสมอ) ---------- */}
        <footer className="mt-auto border-t border-border/80 bg-white/85 pb-[calc(3.5rem+env(safe-area-inset-bottom))] backdrop-blur md:pb-0">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1.5 px-4 py-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="status-dot status-dot-live" aria-hidden />
                API ONLINE
              </span>
              <span className="hidden items-center gap-1.5 font-medium sm:flex">
                <span className="status-dot status-dot-live" aria-hidden />
                DB READY
              </span>
              <span>
                📄 PAPER MODE — จำลองเท่านั้น<span className="hidden sm:inline"> · ไม่ใช่คำแนะนำการลงทุน</span>
              </span>
            </div>
            <p className="font-mono">
              AmiBroker → Platform → Jev → Human Gate · {ov?.totalDates ?? 0} วันในระบบ ·{" "}
              <span className="text-neon-cyan">v2.0</span>
            </p>
          </div>
        </footer>

        {/* แถบนำทางล่าง (มือถือเท่านั้น) */}
        <MobileDock tab={tab} onSelect={setTab} onOpenPalette={() => setPaletteOpen(true)} />
      </SidebarInset>

      {/* Command Palette (⌘K / Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelect={setTab}
        onToggleSidebar={toggleSidebar}
      />
    </>
  )
}

export default function AppShell() {
  return (
    // layout row ตาม shadcn — sidebar-gap จองคอลัมน์ให้ sidebar, ห้าม flex-col (ทำให้ header ทับ brand)
    <SidebarProvider className="bg-background text-foreground" style={SIDEBAR_VARS}>
      <ShellInner />
    </SidebarProvider>
  )
}
