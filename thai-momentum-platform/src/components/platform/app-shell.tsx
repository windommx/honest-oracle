"use client"

import { useState } from "react"
import { BrainCircuit, ChevronRight, Menu, Search } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
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
import { useOnboardingSeen, useUiMode } from "@/hooks/use-ui-prefs"
import type { OverviewResponse } from "@/lib/momentum/contracts"
import { cn } from "@/lib/utils"
import {
  ALL_TABS,
  findTab,
  hiddenTabCount,
  navGroupsFor,
  type NavGroup,
  type NavItem,
  type UiMode,
} from "./nav-config"
import CommandPalette from "./command-palette"
import { ErrorBoundary } from "./error-boundary"
import { GlossaryProvider, useGlossary } from "./glossary"
import MarketClock from "./market-clock"
import { OnboardingDialog, WelcomePanel } from "./onboarding"
import SessionBadge from "./session-badge"
import ThemeToggle from "./theme-toggle"
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
import TrackRecordTab from "./tabs/track-record-tab"

/* ปลายทางหลัก 4 อันดับแรกบน bottom dock ของมือถือ (อันที่ 5 = "เมนู" → Command Palette)
 * หา index ด้วย value เสมอ — กัน index เลื่อนเมื่อเพิ่มแท็บใหม่ (ทั้ง 4 อยู่ในโหมดง่ายด้วย) */
const DOCK_VALUES = ["overview", "map", "signals", "jev"] as const
const DOCK_TABS: NavItem[] = DOCK_VALUES.map(
  (v) => ALL_TABS.find((t) => t.value === v) ?? ALL_TABS[0],
)

/* ป้ายสถานะบน header — ทรงแคปซูล สีตามความหมาย (Gold Ivory / Gold Night) */
const PILL = "rounded-full px-3 py-1 text-xs font-semibold shadow-[0_1px_2px_rgba(120,90,20,0.06)]"

function regimeBadge(regime: OverviewResponse["regime"]) {
  if (!regime) return null
  if (regime.action === "risk_on")
    return (
      <Badge className={`${PILL} border-neon-green/30 bg-neon-green/10 text-neon-green`}>
        🟢 risk_on · conf {regime.conf}
      </Badge>
    )
  if (regime.action === "neutral")
    return (
      <Badge className={`${PILL} border-neon-amber/30 bg-neon-amber/10 text-neon-amber`}>
        🟡 neutral · conf {regime.conf}
      </Badge>
    )
  return (
    <Badge className={`${PILL} border-neon-rose/30 bg-neon-rose/10 text-neon-rose`}>
      🔴 risk_off · conf {regime.conf}
    </Badge>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* เหรียญทอง — โลโก้แบรนด์ (ไอคอนเดียวกับ favicon) */}
      <div className={`brand-coin flex shrink-0 items-center justify-center rounded-full ${compact ? "h-8 w-8" : "h-10 w-10"}`}>
        <BrainCircuit className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
      </div>
      <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <p className={`truncate font-extrabold tracking-tight text-foreground ${compact ? "text-sm" : "text-[15px] sm:text-base"}`}>
          Thai Momentum
        </p>
        <p className="truncate text-[11px] font-medium text-muted-foreground">
          <span className="font-bold text-gold-ink">Platform</span> · หุ้นไทย × Jev AI
        </p>
      </div>
    </div>
  )
}

function SidebarNav({ tab, groups, onSelect }: { tab: string; groups: NavGroup[]; onSelect: (v: string) => void }) {
  const { setOpenMobile } = useSidebar()
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground">
            {group.label}
          </SidebarGroupLabel>
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
                          ? "nav-active min-h-11 gap-2.5 rounded-xl [&>svg]:text-gold-ink"
                          : "min-h-11 gap-2.5 rounded-xl text-foreground/80 hover:bg-sidebar-accent hover:text-foreground"
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

/* สลับโหมด ง่าย / Pro ท้าย sidebar — radiogroup ที่แตะได้ ≥ 36px */
function ModeSwitch({ mode, onChange }: { mode: UiMode; onChange: (m: UiMode) => void }) {
  const hidden = hiddenTabCount("simple")
  return (
    <div className="space-y-1.5 group-data-[collapsible=icon]:hidden">
      <div role="radiogroup" aria-label="มุมมองเมนู" className="grid grid-cols-2 gap-0.5 rounded-xl border border-sidebar-border bg-background/60 p-0.5">
        {(
          [
            { value: "simple", label: "ง่าย", title: `โหมดง่าย — ซ่อน ${hidden} แท็บวิจัยขั้นสูง` },
            { value: "pro", label: "Pro", title: "โหมดมืออาชีพ — แสดงครบทุกแท็บ" },
          ] as const
        ).map((it) => {
          const active = mode === it.value
          return (
            <button
              key={it.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={it.title}
              onClick={() => onChange(it.value)}
              className={cn(
                "min-h-9 rounded-lg text-xs font-semibold transition-colors",
                active ? "bg-card text-gold-ink shadow-[0_1px_2px_rgba(16,24,40,0.1)] ring-1 ring-gold/40" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {it.label}
            </button>
          )
        })}
      </div>
      {mode === "simple" ? (
        <p className="px-1 text-[11px] leading-4 text-muted-foreground">ซ่อน {hidden} แท็บขั้นสูง — กด Pro เพื่อแสดงทั้งหมด</p>
      ) : null}
    </div>
  )
}

/* สถานะระบบสด ๆ ท้าย sidebar — LIVE dot + paper mode */
function SidebarStatus() {
  return (
    <div
      title="ระบบออนไลน์ · ทำงานในโหมดจำลอง (Paper mode)"
      className="flex min-w-0 items-center gap-2 rounded-full border border-neon-green/25 bg-neon-green/[0.06] px-3 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0"
    >
      <span className="status-dot status-dot-live" aria-hidden />
      <span className="truncate text-[11px] font-semibold leading-3 tracking-wide text-neon-green group-data-[collapsible=icon]:hidden">
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-shell/95 backdrop-blur supports-[backdrop-filter]:bg-shell/85 md:hidden"
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
                active ? "font-semibold text-gold-ink" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <span
                  className="absolute top-0 h-1 w-8 rounded-full bg-gold shadow-[0_1px_6px_rgba(201,162,39,0.6)]"
                  aria-hidden
                />
              )}
              <Icon className="size-[18px]" aria-hidden />
              <span className="truncate text-[11px] leading-none">{item.short}</span>
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
          <span className="truncate text-[11px] leading-none">เมนู</span>
        </button>
      </div>
    </nav>
  )
}

/**
 * เนื้อโครงสร้าง — ต้องอยู่ "ใน" SidebarProvider (useSidebar/toggleSidebar ใช้ได้เฉพาะลูกของ provider)
 * และใน GlossaryProvider (เปิดแผงอภิธานศัพท์จาก ⌘K / คู่มือ / <Term>)
 *
 * landmark: <nav เมนูหลัก> · <header> · <aside แถบหุ้น> · <main id="main-content"> · <footer> · <nav dock>
 */
function ShellInner() {
  const [tab, setTab] = useState("overview")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  /** ปิดการ์ดต้อนรับแล้วในรอบนี้ (ไม่ติ๊ก “ไม่ต้องแสดงอีก” = กลับมาแสดงเมื่อเปิดใหม่) */
  const [welcomeClosed, setWelcomeClosed] = useState(false)
  const [mode, setMode] = useUiMode()
  const [onboardingSeen, setOnboardingSeen] = useOnboardingSeen()
  const glossary = useGlossary()
  const { data: ov } = useApi<OverviewResponse>("/api/overview")
  const { toggleSidebar } = useSidebar()
  const { item: currentTab, groupLabel: currentGroup } = findTab(tab)
  const groups = navGroupsFor(mode)
  const openGlossary = () => glossary?.openGlossary()

  const CurrentIcon = currentTab.icon
  const showWelcome = tab === "overview" && !onboardingSeen && !welcomeClosed

  return (
    <>
      <a href="#main-content" className="skip-link">
        ข้ามไปยังเนื้อหาหลัก
      </a>

      {/* ---------- Sidebar (desktop / Sheet มือถือ) — ยุบเป็น icon rail ได้ ---------- */}
      <Sidebar collapsible="icon" className="border-sidebar-border">
        <nav aria-label="เมนูหลัก" className="flex h-full min-h-0 w-full flex-col">
          <SidebarHeader className="border-b border-sidebar-border p-3.5 group-data-[collapsible=icon]:p-2">
            <Brand />
          </SidebarHeader>
          <SidebarContent className="px-1 py-2">
            <SidebarNav tab={tab} groups={groups} onSelect={setTab} />
          </SidebarContent>
          <SidebarFooter className="gap-2 border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
            <ModeSwitch mode={mode} onChange={setMode} />
            <SidebarStatus />
          </SidebarFooter>
        </nav>
        <SidebarRail aria-label="สลับซ่อน/แสดงแถบเมนู" />
      </Sidebar>

      {/* ---------- คอลัมน์เนื้อหา (แทน SidebarInset — ให้ header/footer อยู่นอก <main> ตามโครง landmark) ----------
          min-w-0 จำเป็น: กัน min-width:auto ของ flex item floor ที่ min-content ของ header → หน้าล้นแนวนอน */}
      <div data-slot="sidebar-inset" className="relative flex min-h-svh w-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-sidebar-border bg-shell/85 backdrop-blur supports-[backdrop-filter]:bg-shell/70">
          <div className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 sm:gap-x-2.5 sm:px-4">
            <SidebarTrigger className="size-9 shrink-0" aria-label="สลับแถบเมนู (⌘B)" />
            <Separator orientation="vertical" className="hidden !h-5 sm:block" aria-hidden />

            {/* Breadcrumb — กลุ่ม / แท็บปัจจุบัน (h1 ของหน้า = ชื่อแท็บ · flex-1 ให้ย่อ/ตัดข้อความแทนพับ header) */}
            <div className="flex min-w-[6.5rem] flex-1 items-center gap-1.5 text-sm sm:min-w-[11rem]">
              <CurrentIcon className="size-4 shrink-0 text-gold-ink" aria-hidden />
              <span className="hidden truncate text-muted-foreground sm:inline">{currentGroup}</span>
              <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:inline" aria-hidden />
              <h1 className="min-w-0 truncate text-sm font-bold">{currentTab.label}</h1>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Command Palette trigger (⌘K) — แบบช่องค้นหาบนจอใหญ่ */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="เปิด Command Palette เพื่อไปที่แท็บอื่น (⌘K)"
                className="hidden h-10 w-48 items-center gap-2 rounded-full border border-chip-border bg-chip/90 px-4 text-sm text-muted-foreground shadow-[0_1px_2px_rgba(120,90,20,0.06)] transition-colors hover:border-gold/60 hover:text-foreground md:flex 2xl:w-72"
              >
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="truncate whitespace-nowrap">ค้นหาแท็บ…</span>
                <kbd className="ml-auto rounded-md border border-chip-border bg-background px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
                  ⌘K
                </kbd>
              </button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPaletteOpen(true)}
                aria-label="เปิดเมนูค้นหา (Command Palette)"
                className="size-10 shrink-0 rounded-full border-chip-border bg-chip/90 hover:border-gold/60 hover:bg-accent hover:text-gold-ink md:hidden"
              >
                <Search aria-hidden />
              </Button>

              <MarketClock />
              <div className="hidden sm:block">{regimeBadge(ov?.regime ?? null)}</div>
              <Badge
                variant="outline"
                title="วันที่ข้อมูลล่าสุดในระบบ (snapshot)"
                className={`${PILL} gap-1.5 border-neon-cyan/25 bg-neon-cyan/[0.07] px-2.5 text-neon-cyan sm:px-3`}
              >
                <span className="size-1.5 rounded-full bg-neon-cyan" aria-hidden />
                <span className="hidden 2xl:inline">SNAPSHOT · </span>
                <span className="font-mono">{ov?.latestDate ?? "—"}</span>
              </Badge>
              <Badge
                variant="secondary"
                className={`${PILL} hidden border border-gold/45 bg-gold-soft text-gold-ink 2xl:inline-flex`}
              >
                📄 PAPER MODE 100%
              </Badge>
              {/* ป้ายบทบาท + ออกจากระบบ (โหมด auth เท่านั้น — โหมด local ไม่แสดงอะไร) · ซ่อนบนมือถือให้ header อยู่บรรทัดเดียว */}
              <div className="hidden sm:block">
                <SessionBadge />
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* แถบหุ้นเคลื่อนไหวแบบ terminal — ลากยาวใต้ header */}
        <TickerTape />

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 outline-none sm:px-4 sm:py-6"
        >
          {showWelcome ? (
            <WelcomePanel
              onGoTo={setTab}
              mode={mode}
              onModeChange={setMode}
              onOpenGlossary={openGlossary}
              onDismiss={(remember) => {
                if (remember) setOnboardingSeen(true)
                setWelcomeClosed(true)
              }}
            />
          ) : null}
          {/* ทรานซิชันเปลี่ยนแท็บนุ่มนวล — key ต่อแท็บเพื่อ replay animation
              ErrorBoundary อยู่ใต้ key เดียวกัน → แท็บพังแท็บเดียว shell ยังใช้ได้ และสลับแท็บ = รีเซ็ต */}
          <div key={tab} className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
            <ErrorBoundary label={currentTab.label} variant="tab">
              {tab === "overview" && (
                <OverviewTab
                  onGoTo={setTab}
                  onOpenPalette={() => setPaletteOpen(true)}
                  onOpenGuide={() => setGuideOpen(true)}
                  onOpenGlossary={openGlossary}
                />
              )}
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
              {tab === "track" && <TrackRecordTab />}
            </ErrorBoundary>
          </div>
        </main>

        {/* ---------- Terminal status bar (footer ติดล่างเสมอ) ---------- */}
        <footer className="mt-auto border-t border-sidebar-border bg-shell/80 pb-[calc(3.5rem+env(safe-area-inset-bottom))] backdrop-blur md:pb-0">
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
              <a href="/terms" className="font-semibold text-gold-ink underline-offset-4 hover:underline">
                ข้อกำหนด · ความเสี่ยง · PDPA
              </a>
            </div>
            <p className="font-mono">
              AmiBroker → Platform → Jev → Human Gate · {ov?.totalDates ?? 0} วันในระบบ ·{" "}
              <span className="font-semibold text-gold-ink">v2.0</span>
            </p>
          </div>
        </footer>

        {/* แถบนำทางล่าง (มือถือเท่านั้น) */}
        <MobileDock tab={tab} onSelect={setTab} onOpenPalette={() => setPaletteOpen(true)} />
      </div>

      {/* Command Palette (⌘K / Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelect={setTab}
        onToggleSidebar={toggleSidebar}
        groups={groups}
        mode={mode}
        onModeChange={setMode}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenGlossary={openGlossary}
      />

      {/* คู่มือเริ่มต้น (เปิดซ้ำจาก ⌘K / Options) */}
      <OnboardingDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onGoTo={setTab}
        mode={mode}
        onModeChange={setMode}
        onOpenGlossary={openGlossary}
      />
    </>
  )
}

export default function AppShell() {
  return (
    // layout row ตาม shadcn — sidebar-gap จองคอลัมน์ให้ sidebar, ห้าม flex-col (ทำให้ header ทับ brand)
    <SidebarProvider className="bg-transparent text-foreground">
      <GlossaryProvider>
        <ShellInner />
      </GlossaryProvider>
    </SidebarProvider>
  )
}
