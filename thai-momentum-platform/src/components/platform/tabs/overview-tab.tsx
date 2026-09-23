"use client"

/**
 * Command Center 4.0 — dashboard ชั้นสูงสุดของแพลตฟอร์ม (มาตรฐาน .feature / .options + SUPER OPTIONS)
 *
 * สถาปัตยกรรมข้อมูล 12 โมดูล (บนลงล่าง = สำคัญก่อน):
 *   M0  Posture   — วินิจฉัยระบบวันนี้: รวม 3 ประตู (regime ไทย × GTAA โลก × Circuit Breaker) + คิวงาน
 *   M1  Vitals    — ตัวเลขชี้ขาด 8 การ์ด
 *   M2  Engines   — ทะเบียนโมดูลเอนจินทั้ง 10 โมดูล (สถานะ + metric คอร์ + เด้งเข้าแท็บ)
 *   M3  Regime    — Regime Composite chart (options: ช่วงเวลา 60/120/250 วัน · overlay gross)
 *   M4  Breadth   — Breadth heatmap (options: หน้าต่าง 14/30/60 วัน)
 *   M5  GTAA Ops  — GTAA Monthly Ops: stance + Top-6/ทั้ง universe + readiness + นับถอยหลังรอบรีบาลานซ์
 *   M6  Evidence  — Evidence pipeline: verdict ล่าสุด + รอบรัน/ถังผลลัพธ์ (options: สลับมุมมอง)
 *   M7  Lab       — Shadow Lab: สถิติ + cumR sparkline + gate kills (options: สลับมุมมอง)
 *   M8  Risk      — Risk Radar: breaker + vol + weekly DD + effN + เงินสด GTAA (เกณฑ์ลงทะเบียนล่วงหน้า)
 *   M9  Ops       — เช็กลิสต์พิธีประจำเดือน + นับถอยหลังรอบตัดสินใจ (จาก /api/ops/pulse)
 *   M10 TopStk    — หุ้นคะแนนสูงสุด (options: จำนวน 5/8/12 ตัว)
 *   M11 JevFeed   — การตัดสินใจล่าสุดของ Jev (options: จำนวน 4/6/10 รายการ)
 *
 * SUPER OPTIONS (ระดับมืออาชีพ): Options Center (Sheet 4 แท็บ: จัดวาง/โมดูล/พรีเซ็ต/คีย์ลัด) ·
 * เลย์เอาต์ 1/2 คอลัมน์ · ลำดับโมดูลเรียงเองได้ (CSS order) · โหมดอ่านซ่อนแถบ options · โฟกัสโมดูลเดี่ยว ·
 * พรีเซ็ตพิธี 4 แบบ + พรีเซ็ตของฉัน · คีย์ลัด O/R/D/L/X/Esc — บันทึก localStorage (prefs v3, ย้ายค่า v1/v2 อัตโนมัติ)
 *
 * หลักการเดิมที่รักษาไว้เป๊ะ:
 * - เกณฑ์ Posture และทุกเกณฑ์สี/สถานะ "ลงทะเบียนล่วงหน้า" ในไฟล์นี้ — ไม่มีกล่องดำ
 * - API ตัวใดล่ม = โมดูลนั้นโชว์สถานะออฟไลน์ ตัวอื่นไม่กระทบ (fetch ขนาน + เลื่อนเวลาตัวหนัก)
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Beaker,
  BrainCircuit,
  Briefcase,
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Crosshair,
  Database,
  Gauge,
  Globe2,
  Inbox,
  LineChart,
  Maximize2,
  Minimize2,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useApi } from "@/hooks/use-api"
import type {
  DecisionsResponse,
  GtaaBrief,
  OverviewResponse,
  PendingResponse,
  PortfolioResponse,
  SignalsResponse,
  StopsResponse,
} from "@/lib/momentum/contracts"
import type { SniperReport } from "@/lib/sniper/types"
import type { GtaaOverview, SignalRow } from "@/lib/gtaa/types"
import type { OpsPulseResponse } from "@/app/api/ops/pulse/route"
import {
  DEFAULT_PREFS,
  FEATURE_IDS,
  FEATURE_LABELS,
  loadPrefs,
  normalizeOrder,
  savePrefs,
  type AutoRefresh,
  type DashboardDensity,
  type DashboardLayout,
  type DashboardPrefs,
  type FeatureId,
} from "@/lib/platform/dashboard-prefs"
import {
  BADGE_SHADOW,
  EmptyNote,
  FeatureModule,
  Meter,
  MiniStat,
  OptionsBar,
  Segmented,
  StatusBadge,
  TONE_TEXT,
  ToggleChip,
  type Hue,
  type ModuleStatus,
  type Tone,
} from "@/components/platform/feature-module"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useHotkeys } from "@/hooks/use-hotkeys"
import {
  BUILTIN_PRESETS,
  deleteUserPreset,
  loadUserPresets,
  saveUserPreset,
  type DashboardPreset,
} from "@/lib/platform/dashboard-presets"
import { resolveGtaaCountdown, weeklyDdRatio } from "@/lib/platform/command-center"
import OptionsCenter from "../options-center"
import CommandHero from "../command-hero"

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #ece3cf",
  borderRadius: 12,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 4px 10px rgba(16,24,40,0.08)",
} as const

// =====================================================================
// Posture engine — เกณฑ์ลงทะเบียนล่วงหน้า (pre-registered)
// risk score 0..7 = regime ไทย (0/1/2) + GTAA (0/1/2) + breaker (0..3)
//   ≤1 → โหมดบุก · 2–3 → โหมดคัดเลือก · ≥4 → โหมดป้องกัน
// ข้อมูลชุดใดไม่พร้อม = ตัดออกจากผลรวมและแสดงเหตุผลตรง ๆ (ไม่เดาแทน)
// =====================================================================

type Posture = "attack" | "selective" | "defensive" | null

const THAI_RISK: Record<SignalsResponse["label"], number> = { risk_on: 0, neutral: 1, risk_off: 2 }
const GTAA_RISK: Record<GtaaBrief["stance"], number> = { risk_on: 0, caution: 1, risk_off: 2 }

const POSTURE_META: Record<
  Exclude<Posture, null>,
  { label: string; emoji: string; guide: string; seg: string; text: string; accent: string; meter: string }
> = {
  attack: {
    label: "โหมดบุก (Risk-On)",
    emoji: "🟢",
    guide: "สัญญาณเปิดทางเข้าเต็มรูป — เดินตามแผน ถือชั้นนำตาม gross budget ปกติ",
    seg: "bg-neon-green",
    text: "text-neon-green",
    accent: "border-l-neon-green",
    meter: "bg-neon-green",
  },
  selective: {
    label: "โหมดคัดเลือก (Selective)",
    emoji: "🟡",
    guide: "สัญญาณขัดกันบางส่วน — เลือกเฉพาะชั้นนำ ลดขนาดไม้ และตั้ง stop เข้มขึ้น",
    seg: "bg-neon-amber",
    text: "text-neon-amber",
    accent: "border-l-neon-amber",
    meter: "bg-neon-amber",
  },
  defensive: {
    label: "โหมดป้องกัน (Risk-Off)",
    emoji: "🔴",
    guide: "สัญญาณฝั่งป้องกันครอง — ลด gross / ตัดไม้ตามเกณฑ์ เก็บเงินสดรอจังหวะใหม่",
    seg: "bg-neon-rose",
    text: "text-neon-rose",
    accent: "border-l-neon-rose",
    meter: "bg-neon-rose",
  },
}

function computePosture(
  thai: SignalsResponse["label"] | undefined,
  gtaa: GtaaBrief | null,
  breakerLevel: number | null,
): { posture: Posture; score: number; maxScore: number } {
  let score = 0
  let maxScore = 0
  if (thai != null) {
    score += THAI_RISK[thai]
    maxScore += 2
  }
  if (gtaa != null) {
    score += GTAA_RISK[gtaa.stance]
    maxScore += 2
  }
  if (breakerLevel != null) {
    score += breakerLevel
    maxScore += 3
  }
  if (maxScore === 0) return { posture: null, score: 0, maxScore: 0 }
  // ขั้นตัดสินอิสระจากจำนวนประตูที่พร้อม — เทียบกับสเกลเต็ม 7 เสมอ
  const posture: Posture = score <= 1 ? "attack" : score <= 3 ? "selective" : "defensive"
  return { posture, score, maxScore }
}

// =====================================================================
// เวลา/ความสดข้อมูล (คำนวณหลัง mount เท่านั้น — กัน hydration mismatch)
// =====================================================================

function todayICT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function daysBetween(a: string, b: string): number | null {
  const t1 = new Date(`${a}T00:00:00Z`).getTime()
  const t2 = new Date(`${b}T00:00:00Z`).getTime()
  if (!isFinite(t1) || !isFinite(t2)) return null
  return Math.round((t2 - t1) / 86_400_000)
}

function decisionMonthLabel(): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    month: "long",
    year: "numeric",
  }).format(new Date())
}

function thDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(
      new Date(iso),
    )
  } catch {
    return iso.slice(0, 10)
  }
}

// =====================================================================
// badges
// =====================================================================

function labelBadge(label: SignalsResponse["label"] | undefined) {
  if (label === "risk_on")
    return (
      <Badge className={`border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`}>🟢 risk_on</Badge>
    )
  if (label === "risk_off")
    return <Badge className={`border-neon-rose/40 bg-neon-rose/10 text-neon-rose ${BADGE_SHADOW}`}>🔴 risk_off</Badge>
  if (label === "neutral")
    return (
      <Badge className={`border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW}`}>🟡 neutral</Badge>
    )
  return <Badge variant="outline">—</Badge>
}

function gtaaStanceBadge(stance?: string) {
  if (stance === "risk_on")
    return (
      <Badge className={`border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`}>🟢 risk_on</Badge>
    )
  if (stance === "caution")
    return (
      <Badge className={`border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW}`}>🟡 caution</Badge>
    )
  if (stance === "risk_off")
    return <Badge className={`border-neon-rose/40 bg-neon-rose/10 text-neon-rose ${BADGE_SHADOW}`}>🔴 risk_off</Badge>
  return <Badge variant="outline">—</Badge>
}

function breakerBadge(level: number | null, label?: string) {
  if (level === null) return <Badge variant="outline">ยังไม่โหลด</Badge>
  if (level === 0)
    return <Badge className={`border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`}>🟢 ปกติ</Badge>
  if (level === 1)
    return (
      <Badge className={`border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW}`}>
        🟡 {label || "ระวัง"}
      </Badge>
    )
  return (
    <Badge className={`border-neon-rose/40 bg-neon-rose/10 text-neon-rose ${BADGE_SHADOW}`}>
      🔴 {label || `ระดับ ${level}`}
    </Badge>
  )
}

// =====================================================================
// KPI card (M1 Vitals)
// =====================================================================

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  target,
  onGoTo,
  hue,
  dense,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  sub?: ReactNode
  target: string
  onGoTo: (tab: string) => void
  hue?: Hue
  dense?: boolean
}) {
  // ไทล์แบบ Gold Ivory: ไอคอนในกล่องสีตาม hue · พื้นไล่สีพาสเทลด้านล่าง (.kpi-tile / .kpi-wash-* ใน globals.css)
  const h: Hue = hue ?? "amber"
  return (
    <div className={cn("kpi-tile min-w-0", `kpi-wash-${h}`, dense ? "p-3" : "p-4")}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", HUE_TILE[h])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <button
          type="button"
          onClick={() => onGoTo(target)}
          className="-mr-1.5 -mt-1 h-11 shrink-0 rounded-lg px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-gold-ink sm:h-7 sm:text-xs"
          aria-label={`เปิดแท็บ ${label}`}
        >
          ดู →
        </button>
      </div>
      <div className={cn("min-w-0 truncate text-xs font-semibold text-muted-foreground", dense ? "mt-2" : "mt-3")}>{label}</div>
      <div className="mt-0.5 min-w-0 truncate text-2xl leading-tight font-extrabold tracking-tight tabular-nums">{value}</div>
      {sub ? <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

// =====================================================================
// M2 Engines — ModuleCard
// =====================================================================

interface ModuleRow {
  id: string
  tab: string
  icon: LucideIcon
  hue: Hue
  name: string
  role: string
  metric: string
  metricSub?: string
  status: ModuleStatus
}

const HUE_TILE: Record<Hue, string> = {
  cyan: "border-neon-cyan/20 bg-gradient-to-br from-[#eef3ff] to-[#dfe9ff] text-neon-cyan",
  magenta: "border-neon-magenta/20 bg-gradient-to-br from-[#fdf0f5] to-[#fbe1ec] text-neon-magenta",
  green: "border-neon-green/20 bg-gradient-to-br from-[#effaf2] to-[#dcf3e3] text-neon-green",
  purple: "border-neon-purple/20 bg-gradient-to-br from-[#f4f0fe] to-[#e8e0fc] text-neon-purple",
  amber: "border-[#ecd48f] bg-gradient-to-br from-[#fdf6df] to-[#f8e7b5] text-gold-ink",
}

function ModuleCard({ m, dense, onGoTo }: { m: ModuleRow; dense?: boolean; onGoTo: (tab: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onGoTo(m.tab)}
      aria-label={`${m.name} — ${m.role} (เปิดแท็บ)`}
      className="group block h-full w-full min-w-0 rounded-xl border border-border bg-card text-left text-card-foreground shadow-sm transition-all hover:border-gold/60 hover:shadow-[0_8px_20px_-10px_rgba(154,116,18,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
    >
      <div className={cn("flex h-full min-w-0 flex-col gap-2 p-4", dense && "gap-1.5 p-3")}>
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", HUE_TILE[m.hue])}>
            <m.icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{m.name}</span>
          <StatusBadge s={m.status} />
        </div>
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">{m.role}</p>
        <div className="mt-auto min-w-0 border-t border-border/70 pt-2">
          <p className="truncate font-mono text-xs font-semibold tabular-nums">{m.metric}</p>
          {m.metricSub ? <p className="truncate text-[10px] text-muted-foreground">{m.metricSub}</p> : null}
        </div>
      </div>
    </button>
  )
}

// =====================================================================
// M4 Breadth — heatmap (30 วัน × 4 คอลัมน์)
// =====================================================================

function BreadthHeatmap({ market, window: win }: { market: SignalsResponse["market"]; window: number }) {
  const rows = market.slice(-win)
  return (
    <div>
      <div
        className="grid gap-px overflow-hidden bg-foreground/10"
        style={{ gridTemplateColumns: "56px repeat(4,1fr)" }}
      >
        <div className="bg-card px-2 py-1 text-[10px] text-muted-foreground">วันที่</div>
        {[">MA20", ">MA50", ">MA200", "thrust5"].map((h) => (
          <div key={h} className="bg-card px-2 py-1 text-[10px] text-muted-foreground">
            {h}
          </div>
        ))}
        {rows.map((d) => (
          <Fragment key={d.date}>
            <div className="bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{d.date.slice(5)}</div>
            {[d.b20, d.b50, d.b200, d.thrust == null ? null : 0.5 + d.thrust * 4].map((v, i) =>
              // ค่าที่คำนวณไม่ได้ (null/NaN เช่นประวัติยังไม่ถึงหน้าต่าง MA) = ช่องเทา ไม่ใช่ toFixed บน null
              v != null && Number.isFinite(v) ? (
                <div
                  key={i}
                  title={v.toFixed(2)}
                  className={`h-4 ${v > 0.5 ? "bg-neon-green" : "bg-neon-rose"}`}
                  style={{ opacity: 0.12 + 0.88 * Math.min(1, Math.abs(v - 0.5) * 2) }}
                />
              ) : (
                <div key={i} title="ยังคำนวณไม่ได้" className="h-4 bg-foreground/[0.06]" />
              ),
            )}
          </Fragment>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        เขียวเข้มทั้งแถว = bull regime · ทุกคอลัมน์แดง = cash is king — ดู 60 วันเต็มที่แท็บสัญญาณ
      </p>
    </div>
  )
}

// =====================================================================
// M5 GTAA Monthly Ops — ตารางสัญญาณรายสินทรัพย์
// =====================================================================

function SignalRowLine({ s }: { s: SignalRow }) {
  const tone =
    s.status === "selected"
      ? "green"
      : s.status === "reserve"
        ? "cyan"
        : s.status === "kicked"
          ? "rose"
          : "neutral"
  const statusText =
    s.status === "selected" ? "ถือ" : s.status === "reserve" ? "สำรอง" : s.status === "kicked" ? "ตกเทรนด์" : "เงินสด"
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-foreground/[0.02] px-2 py-1.5">
      <span className="w-12 shrink-0 font-mono text-xs font-bold">{s.ticker}</span>
      <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground sm:block">{s.name}</span>
      <span className={cn("w-14 shrink-0 text-right font-mono text-[10px]", tone === "neutral" ? "text-muted-foreground" : TONE_TEXT[tone as Tone])}>
        {statusText}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
        {s.score != null ? s.score.toFixed(3) : "—"}
      </span>
      <span className="hidden w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground sm:block">
        {(s.weight * 100).toFixed(1)}%
      </span>
      <span
        className={cn(
          "w-11 shrink-0 text-right font-mono text-[10px]",
          s.trendPass ? "text-neon-green" : "text-neon-rose",
        )}
        title={
          // sma ของเอนจินเป็น NaN (→ null ใน JSON) เมื่อประวัติไม่ถึง smaMonths เดือน
          s.sma != null && Number.isFinite(s.sma)
            ? s.trendPass
              ? `ยืนเหนือ SMA ${s.sma.toFixed(2)}`
              : `หลุด SMA ${s.sma.toFixed(2)}`
            : "ประวัติราคาไม่พอคำนวณ SMA"
        }
      >
        {s.trendPass ? "PASS" : "FAIL"}
      </span>
    </div>
  )
}

function GtaaModuleBody({
  gtaa,
  brief,
  daysLeft,
  nextDate,
  view,
  onGoTo,
  offline,
  countdownSource,
}: {
  gtaa: GtaaOverview | null
  brief: GtaaBrief | null
  daysLeft: number | null
  nextDate: string | null
  /** engine = ปิดเดือน nextDecisionMonth ของเอนจิน · calendar = สิ้นเดือนตามปฏิทิน (เอนจินยังไม่โหลด/ข้อมูลค้าง) */
  countdownSource?: "engine" | "calendar" | null
  view: "top6" | "all"
  onGoTo: (tab: string) => void
  /** /api/gtaa/overview ล่ม — ส่วนที่ต้องใช้ข้อมูลเอนจินเต็มโชว์ออฟไลน์ (brief จาก /api/overview ยังแสดงได้) */
  offline?: boolean
}) {
  if (gtaa == null && brief == null) {
    return <EmptyNote minH={120}>โมดูล GTAA ไม่พร้อม — เปิดแท็บ GTAA ตรวจสอบแหล่งข้อมูล</EmptyNote>
  }
  const macro = gtaa?.macro ?? null
  const stance = brief?.stance ?? macro?.stance ?? null
  const cashPct = brief?.cashPct ?? macro?.cashPct ?? 0
  const rows = gtaa?.run.lastSignals ?? []
  const shown = view === "top6" ? rows.filter((r) => r.status === "selected") : rows
  const readiness = gtaa?.readiness ?? null
  const RD_CLS: Record<string, string> = {
    certified: `border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`,
    verified: `border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan ${BADGE_SHADOW}`,
    experimental: `border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW}`,
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* A — stance + เงินสด */}
      <div className="min-w-0 space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">สถานะมหภาค</p>
        <div className="flex flex-wrap items-center gap-2">
          {gtaaStanceBadge(stance ?? undefined)}
          <span className="font-mono text-xs text-muted-foreground">{macro?.asOfMonth ?? brief?.asOfMonth ?? "—"}</span>
        </div>
        <Meter
          value={cashPct}
          tone={stance === "risk_off" ? "rose" : stance === "caution" ? "amber" : "green"}
          ariaLabel="สัดส่วนเงินสดของพอร์ต Top-6"
        />
        <p className="text-[11px] text-muted-foreground">
          เงินสด {(cashPct * 100).toFixed(1)}% ({macro?.cashTicker ?? "BIL"}) · สอบตกเทรนด์{" "}
          {(macro?.failed.length ?? brief?.failedCount ?? 0)}/{macro?.universeCount ?? brief?.universeCount ?? "—"} สินทรัพย์
        </p>
        <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
          {macro?.stanceWhy ?? brief?.stanceWhy ?? "—"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {readiness && RD_CLS[readiness.level] ? (
            <Badge className={RD_CLS[readiness.level]}>{readiness.level}</Badge>
          ) : null}
          <Badge variant="outline" className="font-mono">
            SPY {macro?.benchPass ? "เหนือ" : "หลุด"} SMA10{" "}
            {macro?.benchGapPct != null ? `(${macro.benchGapPct >= 0 ? "+" : ""}${macro.benchGapPct.toFixed(1)}%)` : ""}
          </Badge>
        </div>
      </div>

      {/* B — สัญญาณรายสินทรัพย์ */}
      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {view === "top6" ? "พอร์ต Top-6 (16.66% เท่ากัน)" : `สัญญาณทั้ง universe (${rows.length} สินทรัพย์)`}
          </p>
          <span className="font-mono text-[10px] text-muted-foreground">
            ตัดสินใจ {gtaa?.run.lastDecisionMonth ?? "—"}
          </span>
        </div>
        {shown.length === 0 ? (
          <EmptyNote minH={90}>
            {gtaa == null && offline
              ? "ดึงตารางสัญญาณ GTAA ไม่สำเร็จ — เปิดแท็บ GTAA ตรวจสอบ"
              : "ยังไม่มีตารางสัญญาณ — รอโมดูล GTAA โหลด"}
          </EmptyNote>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {shown.map((s) => (
              <SignalRowLine key={s.ticker} s={s} />
            ))}
          </div>
        )}
      </div>

      {/* C — รอบถัดไป + readiness */}
      <div className="min-w-0 space-y-2.5 lg:border-l lg:border-border/70 lg:pl-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">รอบถัดไป</p>
        <MiniStat
          label="รอบตัดสินใจ (ปิดเดือนถัดไป)"
          value={daysLeft != null ? `${daysLeft} วัน` : "—"}
          sub={
            nextDate && countdownSource === "calendar"
              ? `ปิดรอบ ${nextDate} · สิ้นเดือนตามปฏิทิน${macro ? ` (ข้อมูล GTAA ถึง ${macro.asOfMonth} — ค้าง)` : ""}`
              : nextDate
                ? `ปิดรอบ ${nextDate} · ใช้ผลตั้งแต่ต้น ${macro?.nextAppliesMonth ?? "เดือนถัดไป"}`
                : `ใช้ผลตั้งแต่ต้น ${macro?.nextAppliesMonth ?? "เดือนถัดไป"}`
          }
          tone={daysLeft != null && daysLeft <= 3 ? "amber" : "cyan"}
        />
        <Meter
          value={daysLeft != null ? 1 - Math.min(31, Math.max(0, daysLeft)) / 31 : 0}
          tone="cyan"
          ariaLabel="ความคืบหน้าสู่รอบรีบาลานซ์"
        />
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ระดับความพร้อม</p>
          {readiness ? (
            <ul className="space-y-0.5">
              {readiness.reasons.slice(0, 2).map((r) => (
                <li key={r} className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  • {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {offline ? "ออฟไลน์ — ดึง readiness ไม่สำเร็จ" : "กำลังโหลด readiness…"}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-11 sm:h-8" onClick={() => onGoTo("gtaa")}>
          เปิดโมดูล GTAA →
        </Button>
      </div>
    </div>
  )
}

// =====================================================================
// M6 Evidence Pipeline — body
// =====================================================================

interface EvidenceBrief {
  report: {
    ranAt: string
    mode: string
    h1?: { pass: boolean } | null
    h2?: { pass: boolean } | null
    h3?: { pass: boolean } | null
    h4?: { pass: boolean } | null
  } | null
  buckets: { source: string; n: number; winRate: number | null; avg: number | null }[]
  runs: { id: number; createdAt: string; verdict: string }[]
}

function EvidenceModuleBody({
  ev,
  view,
  error,
}: {
  ev: EvidenceBrief | null
  view: "runs" | "buckets"
  error?: string | null
}) {
  if (ev == null) {
    if (error) return <EmptyNote minH={140}>ดึง evidence pipeline ไม่สำเร็จ — {error}</EmptyNote>
    return <EmptyNote minH={140}>กำลังโหลด evidence pipeline… (โหลดตามหลังเพื่อไม่ให้หน้าหลักช้า)</EmptyNote>
  }
  const latest = ev.runs[0] ?? null
  const gates = [
    { id: "H1", r: ev.report?.h1 },
    { id: "H2", r: ev.report?.h2 },
    { id: "H3", r: ev.report?.h3 },
    { id: "H4", r: ev.report?.h4 },
  ]
  return (
    <div className="space-y-3">
      {/* แถวหัว: verdict ล่าสุด + H1-H4 */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {latest ? (
          <Badge
            className={
              latest.verdict.includes("PASS")
                ? `border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`
                : `border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW}`
            }
          >
            {latest.verdict}
          </Badge>
        ) : (
          <Badge variant="outline">ยังไม่เคยรัน Evidence Night</Badge>
        )}
        {ev.report ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            mode {ev.report.mode} · {thDate(ev.report.ranAt)}
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {gates.map((g) => (
            <span
              key={g.id}
              className={cn(
                "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                g.r == null
                  ? "border-border bg-foreground/[0.03] text-muted-foreground"
                  : g.r.pass
                    ? "border-neon-green/40 bg-neon-green/10 text-neon-green"
                    : "border-neon-rose/40 bg-neon-rose/10 text-neon-rose",
              )}
              title={`ประตู ${g.id}`}
            >
              {g.id} {g.r == null ? "—" : g.r.pass ? "✓" : "✗"}
            </span>
          ))}
        </span>
      </div>

      {view === "runs" ? (
        <div className="space-y-1.5">
          {ev.runs.length === 0 ? (
            <EmptyNote minH={70}>ยังไม่มีรอบรัน — ไปที่แท็บ Evidence Board กดรัน Evidence Night</EmptyNote>
          ) : (
            ev.runs.map((r) => (
              <div
                key={r.id}
                className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-foreground/[0.02] px-2 py-1.5"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    r.verdict.includes("PASS") ? "bg-neon-green" : "bg-neon-amber",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{r.verdict}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{thDate(r.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="max-h-56 min-w-0 overflow-y-auto pr-1">
          {ev.buckets.length === 0 ? (
            <EmptyNote minH={70}>ยังไม่มีผล verify ต่อ source — รอ decisions มี outcome</EmptyNote>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">source</th>
                  <th className="py-1 pr-2 text-right font-medium">n</th>
                  <th className="py-1 pr-2 text-right font-medium">win %</th>
                  <th className="py-1 text-right font-medium">avg outcome</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {ev.buckets.map((b) => (
                  <tr key={b.source} className="border-t border-border/60">
                    <td className="py-1 pr-2">{b.source}</td>
                    <td className="py-1 pr-2 text-right">{b.n}</td>
                    <td
                      className={cn(
                        "py-1 pr-2 text-right",
                        b.winRate == null ? "" : b.winRate >= 0.5 ? "text-neon-green" : "text-neon-rose",
                      )}
                    >
                      {b.winRate != null ? `${(b.winRate * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-1 text-right">{b.avg != null ? b.avg.toFixed(3) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// =====================================================================
// M7 Shadow Lab — body
// =====================================================================

// ผลตอบแทนตลาดจาก briefing ของ Sniper (ทศนิยม) — null = วัดไม่ได้ (DB ว่าง/ข้อมูลไม่พอ) → "—" ไม่ใช่ 0.0% ปลอม
function fmtMktPct(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—"
}

interface LabBrief {
  stats: { total: number; wouldExecute: number; agreementRate: number | null }
  brier: number | null
  brierN?: number | null // จำนวนแถวที่มี outcome — Brier ตัดสินได้เมื่อ ≥ 10 (เกณฑ์เดียวกับ G3 / แท็บ Shadow Lab)
  expectancy: number | null
  executedN: number
  pnl: { date: string; cumR: number }[]
  gateKill: { gate: string; kills: number }[]
  weekly: { n: number; gutRulePct: number | null; labelRulePct: number | null; labelNimblePct: number | null }
}

function LabModuleBody({
  lab,
  view,
  error,
}: {
  lab: LabBrief | null
  view: "stats" | "gates"
  error?: string | null
}) {
  if (lab == null) {
    if (error) return <EmptyNote minH={140}>ดึง Shadow Lab ไม่สำเร็จ — {error}</EmptyNote>
    return <EmptyNote minH={140}>กำลังโหลด Shadow Lab… (โหลดตามหลัง — งาน DB หนัก)</EmptyNote>
  }
  const spark = lab.pnl.slice(-90).map((p, i) => ({ i, cumR: Math.round(p.cumR * 1000) / 1000 }))
  const lastR = spark.length > 0 ? spark[spark.length - 1].cumR : null
  const maxKill = Math.max(1, ...lab.gateKill.map((g) => g.kills))
  const gateDesc: Record<string, string> = {
    regime: "เทรนด์กรอบใหญ่ (regime)",
    selection: "คุณภาพการคัดเลือกตัว",
    level: "ระดับราคา/โครงสร้าง",
    trigger: "ทริกเกอร์เข้าไม้",
    risk: "เงื่อนไขความเสี่ยงรวม",
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        <MiniStat label="logs" value={lab.stats.total.toLocaleString()} sub={`wouldExecute ${lab.stats.wouldExecute}`} />
        <MiniStat
          label="agreement"
          value={lab.stats.agreementRate != null ? `${(lab.stats.agreementRate * 100).toFixed(0)}%` : "—"}
          sub="rule ≡ Nimble"
          tone={(lab.stats.agreementRate ?? 0) >= 0.7 ? "green" : "amber"}
        />
        <MiniStat
          label="Brier"
          value={lab.brier != null && (lab.brierN == null || lab.brierN >= 10) ? lab.brier.toFixed(3) : "—"}
          sub={lab.brier != null && lab.brierN != null && lab.brierN < 10 ? `n=${lab.brierN} (<10) ยังน้อยเกินตัดสิน` : "ยิ่งต่ำยิ่งดี"}
        />
        <MiniStat
          label="expectancy"
          value={lab.expectancy != null ? `${lab.expectancy >= 0 ? "+" : ""}${lab.expectancy.toFixed(2)}R` : "—"}
          sub={`n ${lab.executedN}`}
          tone={(lab.expectancy ?? 0) > 0 ? "green" : (lab.expectancy ?? 0) < 0 ? "rose" : "neutral"}
        />
        <MiniStat
          label="cumR ล่าสุด"
          value={lastR != null ? `${lastR >= 0 ? "+" : ""}${lastR.toFixed(1)}R` : "—"}
          sub="wouldExecute + มีผล"
          tone={(lastR ?? 0) >= 0 ? "green" : "rose"}
        />
      </div>

      {view === "stats" ? (
        spark.length === 0 ? (
          <EmptyNote minH={90}>ยังไม่มีผล R สะสม — รอ log ที่ wouldExecute ได้ผล</EmptyNote>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={spark} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="labCumR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(100,116,139,0.15)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={34} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <ReferenceLine y={0} stroke="rgba(100,116,139,0.35)" />
              <Area
                type="monotone"
                dataKey="cumR"
                name="cumR"
                stroke="#059669"
                strokeWidth={1.8}
                fill="url(#labCumR)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )
      ) : (
        <div className="space-y-1.5">
          {lab.gateKill.length === 0 ? (
            <EmptyNote minH={70}>ยังไม่มีข้อมูล gate kills</EmptyNote>
          ) : (
            lab.gateKill.map((g) => (
              <div key={g.gate} className="flex min-w-0 items-center gap-2">
                <span className="w-16 shrink-0 truncate font-mono text-[11px]">{g.gate}</span>
                <span className="hidden min-w-0 flex-1 truncate text-[10px] text-muted-foreground sm:block">
                  {gateDesc[g.gate] ?? ""}
                </span>
                <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-foreground/[0.06] sm:max-w-52">
                  <div
                    className="h-full rounded bg-neon-rose/80"
                    style={{ width: `${Math.max(2, (g.kills / maxKill) * 100)}%` }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums">{g.kills}</span>
              </div>
            ))
          )}
          <p className="pt-1 text-[10px] leading-4 text-muted-foreground">
            พิธี label ล่าสุด {lab.weekly.n} แถว · gut ≠ rule {lab.weekly.gutRulePct ?? "—"}% · label ≠ Nimble{" "}
            {lab.weekly.labelNimblePct ?? "—"}% — วงจรปิด ไม่แตะเงินจริง
          </p>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// M8 Risk Radar — body (ทุกเกณฑ์ลงทะเบียนล่วงหน้า)
// =====================================================================

function RiskModuleBody({
  breaker,
  volPct,
  risk,
  cashPct,
  riskScore,
  posture,
  onGoTo,
  breakerError,
  riskError,
}: {
  breaker: { level: number; label: string } | null
  volPct: number | null // 0..1 percentile
  risk: PortfolioResponse["risk"] | null
  cashPct: number | null
  riskScore: number
  posture: Posture
  onGoTo: (tab: string) => void
  /** /api/sniper ล่ม (breaker มาไม่ได้) — โชว์ออฟไลน์แทน "กำลังโหลด…" ค้าง */
  breakerError?: boolean
  /** /api/portfolio ล่ม */
  riskError?: boolean
}) {
  const volTone: Tone = volPct == null ? "neutral" : volPct <= 0.4 ? "green" : volPct <= 0.7 ? "amber" : "rose"
  // maxWeeklyDD ของ API ติดลบ (-0.05) — นับเฉพาะสัปดาห์ที่ขาดทุน เทียบขนาดเพดาน (ratio ≥ 1 ⇔ kill switch)
  const ddRatio = weeklyDdRatio(risk?.weeklyDD, risk?.maxWeeklyDD)
  const ddTone: Tone = ddRatio >= 1 ? "rose" : ddRatio >= 0.6 ? "amber" : "green"
  return (
    <div className="space-y-3.5">
      {/* composite meter */}
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            composite risk (posture engine)
          </p>
          <span className={cn("font-mono text-xs font-bold", posture === "defensive" ? "text-neon-rose" : posture === "selective" ? "text-neon-amber" : "text-neon-green")}>
            {riskScore}/7
          </span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 flex-1 rounded-full",
                i < riskScore
                  ? posture === "defensive"
                    ? "bg-neon-rose"
                    : posture === "selective"
                      ? "bg-neon-amber"
                      : "bg-neon-green"
                  : "bg-foreground/[0.08]",
              )}
            />
          ))}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          regime ไทย (0–2) + GTAA (0–2) + breaker (0–3) · ≤1 บุก · 2–3 เลือก · ≥4 ป้องกัน
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Circuit Breaker (0–3)</p>
          {breaker ? (
            <>
              <p className={cn("font-mono text-sm font-bold", breaker.level === 0 ? "text-neon-green" : breaker.level === 1 ? "text-neon-amber" : "text-neon-rose")}>
                L{breaker.level} · {breaker.label}
              </p>
              <Meter value={breaker.level / 3} tone={breaker.level === 0 ? "green" : breaker.level === 1 ? "amber" : "rose"} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{breakerError ? "ออฟไลน์ — ดึง SET Sniper ไม่สำเร็จ" : "กำลังโหลด…"}</p>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">ความผันผวน (percentile)</p>
          <p className={cn("font-mono text-sm font-bold", TONE_TEXT[volTone])}>
            {volPct != null ? `${(volPct * 100).toFixed(0)}%` : "—"}
          </p>
          <Meter value={volPct ?? 0} tone={volTone} ariaLabel="ความผันผวน percentile" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Weekly DD / เพดาน</p>
          <p className={cn("font-mono text-sm font-bold", TONE_TEXT[ddTone])}>
            {risk?.weeklyDD != null ? `${(risk.weeklyDD * 100).toFixed(1)}%` : "—"}
            <span className="text-[10px] font-normal text-muted-foreground">
              {" "}
              / {risk ? `${(risk.maxWeeklyDD * 100).toFixed(0)}%` : "—"}
            </span>
          </p>
          <Meter value={ddRatio} tone={ddTone} ariaLabel="สัดส่วน drawdown สัปดาห์ต่อเพดาน" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Effective N (กระจายตัว)</p>
          <p className="font-mono text-sm font-bold">{risk?.effN != null ? risk.effN.toFixed(1) : "—"}</p>
          <p className="text-[10px] text-muted-foreground">ยิ่งใกล้จำนวนตำแหน่ง = กระจายดี</p>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">เงินสด GTAA (shadow)</p>
          <p className="font-mono text-sm font-bold">{cashPct != null ? `${(cashPct * 100).toFixed(0)}%` : "—"}</p>
          <p className="text-[10px] text-muted-foreground">สูง = ตลาดโลกเข้าโหมดป้องกัน</p>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Kill Switch</p>
          {risk ? (
            <Badge
              className={
                risk.killSwitch
                  ? `border-neon-rose/40 bg-neon-rose/10 text-neon-rose ${BADGE_SHADOW}`
                  : `border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`
              }
            >
              {risk.killSwitch ? "🔴 ทริกเกอร์" : "🟢 ปกติ"}
            </Badge>
          ) : (
            <p className="text-xs text-muted-foreground">{riskError ? "ออฟไลน์ — ดึงพอร์ตไม่สำเร็จ" : "กำลังโหลด…"}</p>
          )}
          <p className="text-[10px] text-muted-foreground">เพดานสัปดาห์ถูกแตะ = หยุดเข้าไม้ใหม่</p>
        </div>
      </div>

      <Button variant="ghost" size="sm" className="h-11 sm:h-8" onClick={() => onGoTo("stops")}>
        เปิด Bayes Stop →
      </Button>
    </div>
  )
}

// =====================================================================
// M9 Ops Checklist — body
// =====================================================================

function OpsModuleBody({
  pulse,
  daysLeft,
  nextDate,
  onGoTo,
  onRefresh,
  refreshing,
  error,
}: {
  pulse: OpsPulseResponse | null
  /** ค่าจากเอนจิน GTAA (nextDecisionMonth) เมื่อโหลดแล้ว — fallback เป็นปฏิทินสิ้นเดือนจาก pulse */
  daysLeft: number | null
  nextDate: string | null
  onGoTo: (tab: string) => void
  onRefresh: () => void
  refreshing?: boolean
  /** ข้อความ error ของ /api/ops/pulse — มีค่า + ไม่มีข้อมูล = โชว์ออฟไลน์ (ไม่ค้าง "กำลังโหลด" ตลอดไป) */
  error?: string | null
}) {
  if (pulse == null) {
    if (error) {
      return (
        <EmptyNote minH={120}>
          <span className="flex flex-col items-center gap-2">
            <span>ดึง operations pulse ไม่สำเร็จ — {error}</span>
            <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden /> ลองใหม่
            </Button>
          </span>
        </EmptyNote>
      )
    }
    return <EmptyNote minH={120}>กำลังโหลด operations pulse…</EmptyNote>
  }
  const done = pulse.doneCount
  const total = pulse.checklist.length
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
      {/* countdown card */}
      <div className="min-w-0 space-y-2.5 rounded-xl border border-border bg-foreground/[0.02] p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">รอบตัดสินใจถัดไป</p>
        <MiniStat
          label="สิ้นเดือน (GTAA รีบาลานซ์)"
          value={daysLeft != null ? (daysLeft === 0 ? "วันนี้!" : `${daysLeft} วัน`) : "—"}
          sub={nextDate ?? pulse.nextRebalance.date}
          tone={daysLeft != null && daysLeft <= 3 ? "amber" : "cyan"}
        />
        <Meter
          value={1 - Math.min(31, Math.max(0, daysLeft ?? 31)) / 31}
          tone={daysLeft != null && daysLeft <= 3 ? "amber" : "cyan"}
          ariaLabel="ความคืบหน้าสู่สิ้นเดือน"
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <MiniStat label="พิธีผ่าน" value={`${done}/${total}`} tone={done === total ? "green" : "amber"} />
          <Button
            variant="outline"
            size="sm"
            className="h-11 gap-1.5 sm:h-8"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="รีเฟรช operations pulse"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
        <p className="text-[10px] leading-4 text-muted-foreground">
          นับตามปฏิทิน — ไม่รวมวันหยุด SET (ตรวจปฏิทินตลาดก่อนส่งคำสั่งจริง)
        </p>
      </div>

      {/* checklist rows */}
      <div className="max-h-72 min-w-0 space-y-1.5 overflow-y-auto pr-1">
        {pulse.checklist.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onGoTo(c.tab)}
            className={cn(
              "flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors sm:min-h-9",
              c.done
                ? "border-neon-green/25 bg-neon-green/[0.04] hover:border-neon-green/45"
                : "border-neon-amber/30 bg-neon-amber/[0.05] hover:border-neon-amber/50",
            )}
            aria-label={`${c.label} — ${c.detail} (เปิดแท็บ ${c.tab})`}
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                c.done ? "bg-neon-green text-white" : "bg-neon-amber/25 text-neon-amber",
              )}
              aria-hidden
            >
              {c.done ? "✓" : "!"}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.label}</span>
            <span className="hidden min-w-0 max-w-52 truncate font-mono text-[10px] text-muted-foreground md:block">
              {c.detail}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// =====================================================================
// ไอคอนต่อคำถามของ Jev
// =====================================================================

const QUESTION_ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  Q_ENTRY: { icon: ArrowUpCircle, cls: "text-neon-green" },
  Q_EXIT: { icon: ArrowDownCircle, cls: "text-neon-amber" },
  Q_ESCALATE: { icon: AlertTriangle, cls: "text-neon-rose" },
  Q_REGIME: { icon: Sparkles, cls: "text-neon-purple" },
  Q_SIGNAL: { icon: Sparkles, cls: "text-neon-purple" },
  Q_PAIRS: { icon: Sparkles, cls: "text-neon-purple" },
  Q_STOP: { icon: ShieldAlert, cls: "text-neon-rose" },
}

// =====================================================================
// main — OverviewTab
// =====================================================================

export default function OverviewTab({
  onGoTo,
  onOpenPalette,
}: {
  onGoTo: (tab: string) => void
  /** เปิด Command Palette (ปุ่ม "ค้นหา" บน hero) */
  onOpenPalette?: () => void
}) {
  // ---------- ตัวเลือกการจัดวาง + เวลา/ความสด (hydrate หลัง mount ผ่าน microtask กัน cascading render) ----------
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS)
  const [mounted, setMounted] = useState(false)
  const [today, setToday] = useState<string | null>(null)
  const [decisionMonth, setDecisionMonth] = useState<string>("—")

  // ---------- super options: Options Center + โฟกัสโมดูลเดี่ยว + พรีเซ็ตของฉัน ----------
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [focusId, setFocusId] = useState<FeatureId | null>(null)
  const [userPresets, setUserPresets] = useState<DashboardPreset[]>([])

  // ---------- options รายโมดูล (ไม่ persist — เลือกดูรอบเดียว) ----------
  const [regimeRange, setRegimeRange] = useState<"60" | "120" | "250">("120")
  const [showGross, setShowGross] = useState(true)
  const [breadthWin, setBreadthWin] = useState<"14" | "30" | "60">("30")
  const [gtaaView, setGtaaView] = useState<"top6" | "all">("top6")
  const [evidView, setEvidView] = useState<"runs" | "buckets">("runs")
  const [labView, setLabView] = useState<"stats" | "gates">("stats")
  const [topN, setTopN] = useState<"5" | "8" | "12">("8")
  const [jevN, setJevN] = useState<"4" | "6" | "10">("6")

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      setPrefs(loadPrefs())
      setMounted(true)
      setToday(todayICT())
      setDecisionMonth(decisionMonthLabel())
      setUserPresets(loadUserPresets())
    })
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (mounted) savePrefs(prefs)
  }, [prefs, mounted])
  const dense = prefs.density === "compact"
  const visibleCount = FEATURE_IDS.filter((id) => prefs.modules[id]).length
  const anyModule = visibleCount > 0

  // ---------- super options: ลำดับ/เลย์เอาต์/โฟกัส ----------
  const dual = prefs.layout === "dual"
  const hiddenCount = FEATURE_IDS.length - visibleCount
  /** ลำดับเรนเดอร์จริงของแต่ละโมดูล — ใช้ CSS order บน flex/grid แทนการย้าย JSX */
  const orderIndex = useMemo(() => {
    const idx = {} as Record<FeatureId, number>
    normalizeOrder(prefs.order).forEach((id, i) => {
      idx[id] = i
    })
    return idx
  }, [prefs.order])
  /** โฟกัสที่มีผลจริง — โมดูลที่โฟกัสอยู่ถูกซ่อน (เช่นปิดจาก Options Center/พรีเซ็ต) = เลิกโฟกัส ไม่ทิ้งกระดานว่าง */
  const activeFocus: FeatureId | null = focusId !== null && prefs.modules[focusId] ? focusId : null
  /** โมดูลแสดงไหม = ไม่ถูกซ่อน และ (ไม่ได้โฟกัสอยู่ หรือเป็นโมดูลที่ถูกโฟกัส) */
  const show = (id: FeatureId) => prefs.modules[id] && (activeFocus === null || activeFocus === id)
  /** props มาตรฐาน super options ของทุกโมดูล — โฟกัส/ซ่อน/โหมดอ่าน/ลำดับ */
  const modFocus = (id: FeatureId) => ({
    onFocus: () => setFocusId(id),
    onHide: () => hideModule(id),
    hideOptions: !prefs.showOptions,
    style: { order: orderIndex[id] },
  })

  // ---------- parallel fetch — ตัวไหนล่มไม่กระทบตัวอื่น ----------
  const ov = useApi<OverviewResponse>("/api/overview")
  const sig = useApi<SignalsResponse>("/api/signals")
  const stops = useApi<StopsResponse>("/api/stops")
  const dec = useApi<DecisionsResponse>("/api/jev/decisions")
  const pend = useApi<PendingResponse>("/api/jev/pending")
  const pulse = useApi<OpsPulseResponse>("/api/ops/pulse")

  // ---------- เลื่อนเวลาตัวหนัก — ให้ hero + vitals ขึ้นก่อน แล้วค่อยเติมทีละโมดูล ----------
  const [deferred, setDeferred] = useState<{
    port: string | null
    sniper: string | null
    gtaa: string | null
    evid: string | null
    lab: string | null
  }>({ port: null, sniper: null, gtaa: null, evid: null, lab: null })
  useEffect(() => {
    const t1 = window.setTimeout(() => setDeferred((d) => ({ ...d, port: "/api/portfolio", evid: "/api/evidence" })), 700)
    const t2 = window.setTimeout(() => setDeferred((d) => ({ ...d, sniper: "/api/sniper" })), 1_300)
    const t3 = window.setTimeout(() => setDeferred((d) => ({ ...d, gtaa: "/api/gtaa/overview" })), 1_700)
    const t4 = window.setTimeout(() => setDeferred((d) => ({ ...d, lab: "/api/lab/dashboard" })), 2_300)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      window.clearTimeout(t4)
    }
  }, [])
  const port = useApi<PortfolioResponse>(deferred.port)
  const sniper = useApi<SniperReport>(deferred.sniper)
  const gtaaOv = useApi<GtaaOverview>(deferred.gtaa)
  const evid = useApi<EvidenceBrief>(deferred.evid)
  const lab = useApi<LabBrief>(deferred.lab)

  // ---------- รีเฟรชอัตโนมัติ — เฉพาะ endpoint เบา (ตัวหนักให้ผู้ใช้กดเอง) ----------
  // deps เป็น refetch (stable useCallback) — กัน interval ถูกรีเซ็ตทุก render
  useEffect(() => {
    if (!mounted || prefs.autoRefresh === "off") return
    const ms = prefs.autoRefresh === "30" ? 30_000 : 60_000
    const id = window.setInterval(() => {
      ov.refetch()
      sig.refetch()
      pend.refetch()
      dec.refetch()
      pulse.refetch()
    }, ms)
    return () => window.clearInterval(id)
  }, [mounted, prefs.autoRefresh, ov.refetch, sig.refetch, pend.refetch, dec.refetch, pulse.refetch])

  const refreshing = ov.loading || sig.loading || stops.loading

  function refreshAll() {
    ov.refetch()
    sig.refetch()
    stops.refetch()
    dec.refetch()
    pend.refetch()
    pulse.refetch()
    port.refetch()
    sniper.refetch()
    gtaaOv.refetch()
    evid.refetch()
    lab.refetch()
  }

  // ---------- super options handlers ----------
  function hideModule(id: FeatureId) {
    setPrefs((p) => ({ ...p, modules: { ...p.modules, [id]: false } }))
    setFocusId((f) => (f === id ? null : f))
  }
  function applyPreset(p: DashboardPreset) {
    setPrefs({
      ...DEFAULT_PREFS,
      density: p.snapshot.density,
      autoRefresh: p.snapshot.autoRefresh,
      layout: p.snapshot.layout,
      showOptions: p.snapshot.showOptions,
      modules: { ...p.snapshot.modules },
      order: normalizeOrder(p.snapshot.order),
    })
    setFocusId(null)
  }
  function handleSavePreset(name: string) {
    setUserPresets(saveUserPreset(name, prefs))
  }
  function handleDeletePreset(id: string) {
    setUserPresets(deleteUserPreset(id))
  }
  function resetAll() {
    setPrefs({ ...DEFAULT_PREFS, modules: { ...DEFAULT_PREFS.modules }, order: [...DEFAULT_PREFS.order] })
    setFocusId(null)
  }

  // ---------- คีย์ลัด (O/R/D/L/X/Esc) — ปิดชั่วคราวขณะเปิด Options Center กันคีย์ชน ----------
  useHotkeys(
    {
      o: () => setOptionsOpen(true),
      "?": () => setOptionsOpen(true),
      r: () => refreshAll(),
      d: () => setPrefs((p) => ({ ...p, density: p.density === "compact" ? "comfortable" : "compact" })),
      l: () => setPrefs((p) => ({ ...p, layout: p.layout === "single" ? "dual" : "single" })),
      x: () => setPrefs((p) => ({ ...p, showOptions: !p.showOptions })),
      escape: () => setFocusId(null),
    },
    mounted && !optionsOpen,
  )

  // ---------- derived ----------
  // API ล่มและไม่มีข้อมูลเก่าค้าง = บอกว่าดึงไม่สำเร็จ (ไม่ใช่ "ยังไม่มีข้อมูล" ที่ชวนเข้าใจผิด)
  const sigFail = !sig.data && sig.error ? `ดึงสัญญาณไม่สำเร็จ — ${sig.error}` : null
  const decFail = !dec.data && dec.error ? `ดึงการตัดสินใจของ Jev ไม่สำเร็จ — ${dec.error}` : null
  const last = sig.data?.market[sig.data.market.length - 1] ?? null
  const breaker = sniper.data?.breaker ?? null
  const { posture, score } = computePosture(sig.data?.label, ov.data?.gtaa ?? null, breaker ? breaker.level : null)

  const regimeData = useMemo(() => {
    const n = Number(regimeRange)
    return (sig.data?.market ?? []).slice(-n).map((d) => ({
      date: d.date.slice(5),
      regimeScore: Math.round(d.regimeScore * 1000) / 1000,
      grossMult: Math.round(d.grossMult * 1000) / 1000,
    }))
  }, [sig.data, regimeRange])

  const topStocks = useMemo(() => {
    const n = Number(topN)
    const arr = [...(sig.data?.stockToday ?? [])].sort((a, b) => b.score - a.score).slice(0, n)
    const max = Math.max(1e-9, ...arr.map((s) => s.score))
    return { arr, max }
  }, [sig.data, topN])

  const recentDecisions = (dec.data?.decisions ?? []).slice(0, Number(jevN))
  const pendingGates = pend.data ? pend.data.pending.length : (ov.data?.pendingGates ?? 0)
  const stopSOpt = stops.data
    ? stops.data.policy.arm === "bayesR"
      ? stops.data.posteriorR.sOpt
      : stops.data.posteriorT.sOpt
    : null
  const promoted = sig.data?.policy?.promoted ?? []

  // นับถอยหลังรอบตัดสินใจ GTAA — ใช้ nextDecisionMonth ของเอนจินเป็นความจริง
  // (เอนจินตัดสินใจเดือนปัจจุบันจากข้อมูลถึงเดือนก่อนหน้าแล้ว → รอบถัดไปคือปิดเดือนถัดไป)
  // ยังโหลดไม่เสร็จ หรือวันปิดรอบของเอนจินผ่านไปแล้ว (panel GTAA ค้าง) = ใช้ปฏิทินสิ้นเดือนจาก pulse — ไม่นับติดลบ
  // วันนี้ = วันที่ ICT ของ pulse (รีเฟรชตาม autoRefresh) ก่อน แล้วจึงใช้ค่าที่อ่านตอน mount
  const gtaaCountdown = resolveGtaaCountdown(
    pulse.data?.today ?? today,
    gtaaOv.data?.macro?.nextDecisionMonth,
    pulse.data?.nextRebalance,
  )
  const gtaaNextDate = gtaaCountdown.date
  const gtaaDaysLeft = gtaaCountdown.daysLeft

  // lab brief normalize (จาก /api/lab/dashboard — shape ตรงตาม route)
  const labBrief = useMemo<LabBrief | null>(() => {
    const d = lab.data
    if (!d) return null
    return {
      stats: {
        total: d.stats?.total ?? 0,
        wouldExecute: d.stats?.wouldExecute ?? 0,
        agreementRate: d.stats?.agreementRate ?? null,
      },
      brier: d.brier ?? null,
      brierN: d.brierN ?? null,
      expectancy: d.expectancy ?? null,
      executedN: d.executedN ?? 0,
      pnl: (d.pnl ?? []).map((p) => ({ date: p.date, cumR: p.cumR })),
      gateKill: d.gateKill ?? [],
      weekly: d.weekly ?? { n: 0, gutRulePct: null, labelRulePct: null, labelNimblePct: null },
    }
  }, [lab.data])

  // ---------- ประตูตัดสิน 3 ชั้น (โชว์แยกทุกตัว — ไม่มีกล่องดำ) ----------
  const gates: { name: string; badge: ReactNode; note: string }[] = [
    {
      name: "Regime ไทย (รายวัน)",
      badge: labelBadge(sig.data?.label),
      note:
        sig.data != null
          ? `regime score ${sig.data.regimeScore.toFixed(2)} · gross ×${sig.data.grossMult.toFixed(2)} · ณ ${sig.data.latest ?? "—"}`
          : sig.error
            ? "ดึงข้อมูลไม่สำเร็จ"
            : "กำลังโหลดสัญญาณ…",
    },
    {
      name: "GTAA โลก (รายเดือน)",
      badge: gtaaStanceBadge(ov.data?.gtaa?.stance),
      note:
        ov.data?.gtaa != null
          ? `${ov.data.gtaa.stanceWhy} · เงินสด ${(ov.data.gtaa.cashPct * 100).toFixed(0)}%`
          : ov.data
            ? "โมดูล GTAA ไม่พร้อม (shadow ไม่กระทบระบบไทย)"
            : "กำลังโหลด…",
    },
    {
      name: "Circuit Breaker (SET Sniper)",
      badge: breakerBadge(breaker ? breaker.level : null, breaker?.label),
      note:
        breaker != null
          ? `${breaker.label} · ตลาด 1 วัน ${fmtMktPct(sniper.data?.briefing.mkt.ret1d)} · 5 วัน ${fmtMktPct(sniper.data?.briefing.mkt.ret5d)}`
          : deferred.sniper === null
            ? "โหลดตามหลัง (งานคำนวณหนัก)"
            : sniper.error
              ? "ดึงข้อมูลไม่สำเร็จ — เปิดแท็บ Sniper ดูได้"
              : "กำลังคำนวณ…",
    },
  ]

  // ---------- ทะเบียนโมดูล (M2) — สถานะ derive จากข้อมูลจริง ----------
  const modules: ModuleRow[] = useMemo(() => {
    const o = ov.data
    const ready = (text = "พร้อม"): ModuleStatus => ({ kind: "ready", text })
    const offline = (text = "ออฟไลน์"): ModuleStatus => ({ kind: "offline", text })
    const open = (text = "เปิดแท็บ"): ModuleStatus => ({ kind: "open", text })
    return [
      {
        id: "signals",
        tab: "signals",
        icon: Activity,
        hue: "cyan",
        name: "สัญญาณ v2",
        role: "meta-score + regime รายวัน",
        metric: sig.data ? `score ${sig.data.regimeScore.toFixed(2)} · ×${sig.data.grossMult.toFixed(2)}` : "—",
        metricSub: sig.data?.latest ?? undefined,
        status: sig.data ? ready("พร้อม") : sig.error ? offline("ออฟไลน์") : { kind: "loading", text: "" },
      },
      {
        id: "gtaa",
        tab: "gtaa",
        icon: Globe2,
        hue: "green",
        name: "GTAA Rotation",
        role: "เอนจินสากล — ตลาดโลก รายเดือน",
        metric: o?.gtaa ? `เงินสด ${(o.gtaa.cashPct * 100).toFixed(0)}% · ${o.gtaa.asOfMonth}` : "—",
        metricSub: gtaaOv.data ? `${gtaaOv.data.readiness.level} · Top ${gtaaOv.data.config.topN}` : o?.gtaa ? `สอบตก ${o.gtaa.failedCount}/${o.gtaa.universeCount}` : undefined,
        status: gtaaOv.data ? ready(gtaaOv.data.readiness.level) : o ? (o.gtaa ? ready("พร้อม") : offline("ล่ม")) : { kind: "loading", text: "" },
      },
      {
        id: "sniper",
        tab: "sniper",
        icon: Crosshair,
        hue: "magenta",
        name: "SET Sniper",
        role: "ICT × Order Flow — รายวัน",
        metric: breaker ? `breaker ระดับ ${breaker.level} · ${breaker.label}` : "แตะเพื่อเปิดแท็บ",
        metricSub: sniper.data ? `watchlist ${sniper.data.meta.watchlistCount} ตัว` : undefined,
        status: sniper.data ? ready("พร้อม") : sniper.error ? offline("ออฟไลน์") : deferred.sniper === null ? open("เปิดแท็บ") : { kind: "loading", text: "" },
      },
      {
        id: "stops",
        tab: "stops",
        icon: ShieldAlert,
        hue: "purple",
        name: "Bayes Stop",
        role: "วงจรตัดขาดทุนแบบ Bayesian",
        metric:
          stops.data != null
            ? `${stops.data.policy.arm} · s* ${stopSOpt !== null ? `${(stopSOpt * 100).toFixed(1)}%` : "—"}`
            : "—",
        metricSub: stops.data ? (stops.data.policy.adopted ? "ใช้งานจริง" : "โหมด shadow") : undefined,
        status: stops.data ? ready(stops.data.policy.adopted ? "ใช้งาน" : "shadow") : stops.error ? offline("ออฟไลน์") : { kind: "loading", text: "" },
      },
      {
        id: "jev",
        tab: "jev",
        icon: BrainCircuit,
        hue: "purple",
        name: "Jev AI",
        role: "ผู้ช่วยตัดสินใจ + Human Gate",
        metric: dec.data ? `${dec.data.decisions.length} การตัดสินใจล่าสุด` : "—",
        metricSub: pend.data ? `รออนุมัติ ${pend.data.pending.length} รายการ` : undefined,
        status: dec.data ? ready("พร้อม") : dec.error ? offline("ออฟไลน์") : { kind: "loading", text: "" },
      },
      {
        id: "portfolio",
        tab: "portfolio",
        icon: Briefcase,
        hue: "green",
        name: "พอร์ตกระดาษ",
        role: "ตำแหน่ง paper ตามแผน + ผลจริง",
        metric: o ? `${o.positions.toLocaleString()} ตำแหน่ง` : "—",
        metricSub: o ? `รออนุมัติ ${pendingGates.toLocaleString()} รายการ` : undefined,
        status: o ? ready("พร้อม") : { kind: "loading", text: "" },
      },
      {
        id: "map",
        tab: "map",
        icon: LineChart,
        hue: "cyan",
        name: "Momentum Map",
        role: "แผนที่โมเมนตัมรายหุ้น",
        metric: sig.data ? `${sig.data.stockToday.length.toLocaleString()} หุ้นวันนี้` : "—",
        status: sig.data ? open("เปิดแท็บ") : sig.error ? offline("ออฟไลน์") : { kind: "loading", text: "" },
      },
      {
        id: "lab",
        tab: "lab",
        icon: Beaker,
        hue: "amber",
        name: "Shadow Lab",
        role: "ทดลองกฎแบบเงาก่อนขึ้นจริง",
        metric: labBrief ? `agree ${((labBrief.stats.agreementRate ?? 0) * 100).toFixed(0)}% · ${labBrief.stats.total} logs` : "A/B + Pre-register",
        metricSub: labBrief && labBrief.expectancy != null ? `expectancy ${labBrief.expectancy >= 0 ? "+" : ""}${labBrief.expectancy.toFixed(2)}R` : "กติกาคงที่ก่อนเห็นผล",
        status: labBrief ? ready("พร้อม") : lab.error ? offline("ออฟไลน์") : deferred.lab === null ? open("เปิดแท็บ") : { kind: "loading", text: "" },
      },
      {
        id: "evidence",
        tab: "evidence",
        icon: ClipboardCheck,
        hue: "amber",
        name: "Evidence Board",
        role: "หลักฐาน + การอนุมัติสัญญาณ",
        metric: evid.data?.runs[0] ? evid.data.runs[0].verdict : promoted.length > 0 ? `PROMOTE ${promoted.length} สัญญาณ` : "ยังไม่มี PROMOTE",
        status: evid.data ? ready("พร้อม") : evid.error ? offline("ออฟไลน์") : deferred.evid === null ? open("เปิดแท็บ") : { kind: "loading", text: "" },
      },
      {
        id: "data",
        tab: "data",
        icon: Database,
        hue: "magenta",
        name: "ข้อมูล & DQ",
        role: "นำเข้า CSV + ตรวจคุณภาพ",
        metric: o ? `${o.totalDates.toLocaleString()} วัน · ${o.totalSymbols.toLocaleString()} ตัว` : "—",
        metricSub: o?.latestDate ? `ถึง ${o.latestDate}` : undefined,
        status: o ? (o.rowsRaw > 0 ? ready("พร้อม") : { kind: "warn", text: "ว่าง" }) : { kind: "loading", text: "" },
      },
    ]
  }, [ov.data, sig.data, sig.error, stops.data, stops.error, dec.data, dec.error, pend.data, sniper.data, sniper.error, deferred, stopSOpt, pendingGates, breaker, promoted, gtaaOv.data, labBrief, evid.data, evid.error, lab.error])

  // ---------- error / empty states ----------
  if (ov.error && !ov.data)
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>โหลดภาพรวมไม่สำเร็จ</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{ov.error}</span>
          <Button variant="outline" size="sm" onClick={() => ov.refetch()}>
            <RefreshCw aria-hidden /> ลองใหม่
          </Button>
        </AlertDescription>
      </Alert>
    )

  if (ov.loading && !ov.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    )

  const ovData = ov.data
  if (!ovData) return null

  if (ovData.rowsRaw === 0)
    return (
      <Alert>
        <Database />
        <AlertTitle>ยังไม่มีข้อมูลในระบบ</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>ไปที่แท็บ ข้อมูล เพื่อ seed ข้อมูลตัวอย่างหรือนำเข้า CSV จาก AmiBroker ก่อน</span>
          <Button size="sm" onClick={() => onGoTo("data")}>
            ไปที่แท็บข้อมูล →
          </Button>
        </AlertDescription>
      </Alert>
    )

  const chartH = dense ? 200 : 280

  return (
    <div className={cn("space-y-5", dense && "space-y-3")}>
      {/* ============================================================
          Hero ต้อนรับ (Gold Ivory) — ทักทาย · ตลาด · breadth · ปุ่มลัด (ซ่อนในโหมดโฟกัสโมดูลเดี่ยว)
      ============================================================ */}
      {activeFocus ? null : (
        <CommandHero
          ov={ovData}
          market={sig.data?.market.at(-1) ?? null}
          pendingCount={pend.data ? pend.data.pending.length : null}
          onGoTo={onGoTo}
          onOpenPalette={onOpenPalette}
        />
      )}

      {/* ============================================================
          แถบควบคุมกลาง (options ของทั้งแดชบอร์ด) — แสดงเสมอ
      ============================================================ */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gold-ink">แผงโมดูล</span>
        <span className="h-px w-6 bg-gold/50" aria-hidden />
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {visibleCount}/{FEATURE_IDS.length} โมดูล{hiddenCount > 0 ? ` · ซ่อน ${hiddenCount}` : ""}
          {activeFocus ? ` · โฟกัส: ${FEATURE_LABELS[activeFocus]}` : ""}
        </span>
        <span className="hidden font-mono text-[10px] tracking-wide text-muted-foreground/70 xl:inline" aria-hidden>
          O ตัวเลือก · R รีเฟรช · D กระชับ · L เลย์เอาต์ · X โหมดอ่าน
        </span>
        {pulse.data ? (
          <Badge
            className={
              pulse.data.doneCount === pulse.data.checklist.length
                ? `border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`
                : `border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW}`
            }
          >
            <CalendarCheck className="mr-1 size-3" aria-hidden />
            พิธีผ่าน {pulse.data.doneCount}/{pulse.data.checklist.length}
          </Badge>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            value={prefs.layout}
            onChange={(v: DashboardLayout) => setPrefs((p) => ({ ...p, layout: v }))}
            items={[
              { value: "single", label: "1×", aria: "เลย์เอาต์คอลัมน์เดียว (คีย์ L สลับ)" },
              { value: "dual", label: "2×", aria: "เลย์เอาต์สองคอลัมน์ (คีย์ L สลับ)" },
            ]}
            ariaLabel="เลย์เอาต์แดชบอร์ด"
            dense={dense}
          />
          <Segmented
            value={prefs.autoRefresh}
            onChange={(v: AutoRefresh) => setPrefs((p) => ({ ...p, autoRefresh: v }))}
            items={[
              { value: "off", label: "auto ∅", aria: "ปิดรีเฟรชอัตโนมัติ" },
              { value: "30", label: "30s", aria: "รีเฟรชอัตโนมัติ 30 วินาที" },
              { value: "60", label: "60s", aria: "รีเฟรชอัตโนมัติ 60 วินาที" },
            ]}
            ariaLabel="รีเฟรชอัตโนมัติ"
            dense={dense}
          />
          <Segmented
            value={prefs.density}
            onChange={(v: DashboardDensity) => setPrefs((p) => ({ ...p, density: v }))}
            items={[
              { value: "comfortable", label: "ปกติ" },
              { value: "compact", label: "กระชับ" },
            ]}
            ariaLabel="ความหนาแน่นการจัดวาง"
            dense={dense}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            className="h-11 gap-1.5 sm:h-8"
            aria-label="รีเฟรชข้อมูลทุกแหล่ง"
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
            <span className="hidden sm:inline">รีเฟรช</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" aria-label="พรีเซ็ตการจัดวางด่วน">
                <Sparkles className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">โหมด</span>
                <ChevronDown className="size-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>พรีเซ็ตด่วน — จัดวางทั้งชุดในคลิกเดียว</DropdownMenuLabel>
              {BUILTIN_PRESETS.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => applyPreset(p)} className="gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                  <span className="hidden max-w-32 truncate text-[10px] text-muted-foreground sm:inline">{p.desc}</span>
                </DropdownMenuItem>
              ))}
              {userPresets.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>พรีเซ็ตของฉัน</DropdownMenuLabel>
                  {userPresets.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => applyPreset(p)}>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setOptionsOpen(true)} className="gap-2">
                <SlidersHorizontal className="size-3.5" aria-hidden />
                <span className="text-xs">เปิด Options Center…</span>
                <kbd className="ml-auto rounded border border-border bg-foreground/[0.04] px-1 font-mono text-[9px]">O</kbd>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            className="h-11 gap-1.5 sm:h-8"
            aria-label="รีเฟรชข้อมูลทุกแหล่ง (คีย์ R)"
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
            <span className="hidden sm:inline">รีเฟรช</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOptionsOpen(true)}
            className="h-11 gap-1.5 border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 sm:h-8"
            aria-label="เปิด Options Center (คีย์ O)"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">ตัวเลือก</span>
            <kbd className="hidden rounded border border-neon-cyan/30 bg-neon-cyan/[0.06] px-1 font-mono text-[9px] lg:inline">O</kbd>
          </Button>
        </div>
      </div>

      {!anyModule ? (
        <Alert>
          <SlidersHorizontal />
          <AlertTitle>ทุกโมดูลถูกซ่อนอยู่</AlertTitle>
          <AlertDescription>
            เปิดกลับได้จากปุ่ม ตัวเลือก (มุมขวาบน) → แท็บ โมดูล → แสดงทั้งหมด หรือกดคีย์ O
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ---- แถบโฟกัสโมดูลเดี่ยว (ออกด้วย Esc หรือปุ่ม) ---- */}
      {activeFocus ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-neon-cyan/30 bg-neon-cyan/[0.05] px-3 py-2">
          <Maximize2 className="size-3.5 shrink-0 text-neon-cyan" aria-hidden />
          <span className="min-w-0 truncate text-xs font-semibold">โหมดโฟกัส — {FEATURE_LABELS[activeFocus]}</span>
          <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">โมดูลเดียว · Esc ออก</span>
          <Button variant="outline" size="sm" className="ml-auto h-9 gap-1.5 sm:h-7" onClick={() => setFocusId(null)}>
            <Minimize2 className="size-3.5" aria-hidden />
            ออกจากโหมดโฟกัส
          </Button>
        </div>
      ) : null}

      {/* ---- พื้นที่โมดูล — flex/grid รองรับ CSS order (ลำดับจาก Options Center) ---- */}
      <div
        className={cn(
          "min-w-0",
          dual ? "grid grid-cols-1 items-start" : "flex flex-col",
          dense ? "gap-3" : "gap-5",
          dual && "xl:grid-cols-2",
        )}
      >

      {/* ============================================================
          M0 — Posture
      ============================================================ */}
      {show("posture") ? (
        <FeatureModule
          code="M0"
          {...modFocus("posture")}
          title="วินิจฉัยระบบวันนี้"
          icon={Compass}
          hue="cyan"
          dense={dense}
          desc="รวม 3 ประตูตัดสินเป็นโหมดเดียวที่อ่านจบในพริบตา — เกณฑ์ลงทะเบียนล่วงหน้าทั้งหมด"
          className={cn(dual && "xl:col-span-2", posture && ["border-l-2", POSTURE_META[posture].accent])}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
            {/* A — คำวินิจฉัย */}
            <div className="min-w-0 space-y-2.5">
              {posture ? (
                <>
                  <p className={cn("text-2xl font-bold leading-tight tracking-tight", POSTURE_META[posture].text)}>
                    {POSTURE_META[posture].emoji} {POSTURE_META[posture].label}
                  </p>
                  <p className="min-w-0 text-xs leading-5 text-muted-foreground">{POSTURE_META[posture].guide}</p>
                  <div>
                    <div className="flex gap-1" aria-hidden>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn("h-1.5 flex-1 rounded-full", i < score ? POSTURE_META[posture].meter : "bg-foreground/[0.08]")}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                      risk score {score}/7 · เกณฑ์ลงทะเบียนล่วงหน้า (≤1 บุก · 2–3 เลือก · ≥4 ป้องกัน)
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-base font-semibold text-muted-foreground">
                  ⏳ ยังประเมินไม่ได้ — รอข้อมูลสัญญาณอย่างน้อย 1 ประตู
                </p>
              )}
            </div>

            {/* B — ประตูตัดสิน 3 ชั้น */}
            <div className="min-w-0 space-y-2 border-border/70 lg:border-l lg:pl-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ประตูตัดสิน 3 ชั้น</p>
              {gates.map((g) => (
                <div key={g.name} className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-xs font-semibold">{g.name}</span>
                    {g.badge}
                  </div>
                  <p className="line-clamp-2 min-w-0 text-[11px] leading-4 text-muted-foreground">{g.note}</p>
                </div>
              ))}
            </div>

            {/* C — คิวงานวันนี้ */}
            <div className="min-w-0 space-y-2 border-border/70 lg:border-l lg:pl-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">คิวงานวันนี้</p>
              {(() => {
                const staleness = pulse.data?.dataFresh ?? null
                const staleDays = staleness?.daysStale ?? (ovData.latestDate && today ? daysBetween(ovData.latestDate, today) : null)
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => onGoTo("portfolio")}
                      className={cn(
                        "flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors sm:min-h-9",
                        pendingGates > 0
                          ? "border-neon-rose/30 bg-neon-rose/[0.05] hover:border-neon-rose/50"
                          : "border-neon-green/25 bg-neon-green/[0.04] hover:border-neon-green/45",
                      )}
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", pendingGates > 0 ? "bg-neon-rose" : "bg-neon-green")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">รออนุมัติ Human Gate {pendingGates} รายการ</span>
                      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {pendingGates > 0 ? "ต้องตัดสินใจ" : "คิวว่าง"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onGoTo("data")}
                      className={cn(
                        "flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors sm:min-h-9",
                        staleDays !== null && staleDays > 5
                          ? "border-neon-amber/30 bg-neon-amber/[0.05] hover:border-neon-amber/50"
                          : "border-neon-green/25 bg-neon-green/[0.04] hover:border-neon-green/45",
                      )}
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", staleDays !== null && staleDays > 5 ? "bg-neon-amber" : "bg-neon-green")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">ข้อมูลถึง {ovData.latestDate ?? "—"}</span>
                      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {staleDays === null ? "—" : staleDays === 0 ? "ล่าสุดวันนี้" : `ห่าง ${staleDays} วัน`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onGoTo("gtaa")}
                      className="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border border-neon-green/25 bg-neon-green/[0.04] px-2.5 py-1.5 text-left transition-colors hover:border-neon-green/45 sm:min-h-9"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-neon-green" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">รอบตัดสินใจ GTAA ถัดไป</span>
                      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {gtaaDaysLeft != null ? `อีก ${gtaaDaysLeft} วัน` : `สิ้นเดือน ${decisionMonth}`}
                      </span>
                    </button>
                  </>
                )
              })()}
            </div>
          </div>
        </FeatureModule>
      ) : null}

      {/* ============================================================
          M1 — Vitals
      ============================================================ */}
      {show("vitals") ? (
        <FeatureModule code="M1" {...modFocus("vitals")} title="ตัวเลขชี้ขาด" icon={Gauge} hue="green" dense={dense} className={dual ? "xl:col-span-2" : undefined} desc="ค่าที่เปลี่ยนการตัดสินใจ — แตะ ดู → เพื่อเปิดแท็บต้นทาง">
          <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-4", dense && "gap-3")}>
            <KpiCard
              icon={Compass}
              label="Regime วันนี้"
              hue="cyan"
              dense={dense}
              value={
                <span className="flex flex-wrap items-center gap-1.5">
                  {labelBadge(sig.data?.label)}
                  {last ? <span className="font-mono">{last.regimeScore.toFixed(2)}</span> : null}
                </span>
              }
              sub={
                last
                  ? `gross ×${last.grossMult.toFixed(2)} · ${sig.data?.latest ?? ""}`
                  : sigFail
                    ? "ดึงสัญญาณไม่สำเร็จ"
                    : sig.data
                      ? "ยังไม่มีข้อมูลสัญญาณ"
                      : "โหลดสัญญาณ…"
              }
              target="signals"
              onGoTo={onGoTo}
            />
            <KpiCard
              icon={Globe2}
              label="Global Regime (GTAA)"
              hue="green"
              dense={dense}
              value={gtaaStanceBadge(ovData.gtaa?.stance)}
              sub={
                ovData.gtaa
                  ? `เงินสด ${(ovData.gtaa.cashPct * 100).toFixed(0)}% · ถึง ${ovData.gtaa.asOfMonth}`
                  : "โมดูล GTAA ไม่พร้อม"
              }
              target="gtaa"
              onGoTo={onGoTo}
            />
            <KpiCard
              icon={Inbox}
              label="รออนุมัติ (Human Gate)"
              hue={pendingGates > 0 ? "amber" : "green"}
              dense={dense}
              value={`${pendingGates.toLocaleString()} รายการ`}
              sub={pendingGates > 0 ? "ต้องตัดสินใจก่อนเข้าพอร์ต" : "คิวอนุมัติว่าง"}
              target="portfolio"
              onGoTo={onGoTo}
            />
            <KpiCard
              icon={ShieldAlert}
              label="Bayes Stop"
              hue="purple"
              dense={dense}
              value={
                stops.data ? (
                  <Badge
                    className={
                      stops.data.policy.adopted
                        ? `border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW}`
                        : `border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW}`
                    }
                  >
                    {stops.data.policy.arm} · {stops.data.policy.adopted ? "ใช้งาน" : "shadow"}
                  </Badge>
                ) : (
                  "—"
                )
              }
              sub={`s* = ${stopSOpt !== null ? `${(stopSOpt * 100).toFixed(1)}%` : "—"}`}
              target="stops"
              onGoTo={onGoTo}
            />
            <KpiCard
              icon={Sparkles}
              label="สัญญาณที่ผ่าน IC"
              hue="cyan"
              dense={dense}
              value={promoted.length > 0 ? promoted.join(", ") : "—"}
              sub={promoted.length > 0 ? "ใช้ออกเสียงใน Jev ได้" : "ยังไม่มีสัญญาณ PROMOTE"}
              target="signals"
              onGoTo={onGoTo}
            />
            <KpiCard
              icon={ShieldCheck}
              label="DQ (Data Quality)"
              hue="amber"
              dense={dense}
              value={
                ovData.dqFlags.length === 0 ? (
                  <span className="text-neon-green">ผ่านทั้งหมด ✓</span>
                ) : (
                  <span className="text-neon-rose">{ovData.dqFlags.length} ข้อ</span>
                )
              }
              sub={ovData.dqFlags.length === 0 ? "ไม่มี flag" : ovData.dqFlags[0]}
              target="data"
              onGoTo={onGoTo}
            />
            <KpiCard
              icon={Database}
              label="ข้อมูล"
              hue="magenta"
              dense={dense}
              value={ovData.latestDate ?? "—"}
              sub={`${ovData.totalDates.toLocaleString()} วัน · ${ovData.totalSymbols.toLocaleString()} ตัว`}
              target="data"
              onGoTo={onGoTo}
            />
            <KpiCard
              icon={Wallet}
              label="พอร์ตกระดาษ"
              hue="green"
              dense={dense}
              value={`${ovData.positions.toLocaleString()} ตำแหน่ง`}
              sub={`รออนุมัติ (Human Gate) ${pendingGates.toLocaleString()} รายการ`}
              target="portfolio"
              onGoTo={onGoTo}
            />
          </div>
        </FeatureModule>
      ) : null}

      {/* ============================================================
          M2 — Engines
      ============================================================ */}
      {show("engines") ? (
        <FeatureModule
          code="M2"
          {...modFocus("engines")}
          title="ทะเบียนเอนจิน"
          icon={Activity}
          hue="magenta"
          dense={dense}
          className={dual ? "xl:col-span-2" : undefined}
          desc="สถานะสดของทุกโมดูลในระบบ — แตะการ์ดเพื่อเปิดแท็บนั้น"
        >
          <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5", dense && "gap-2.5")}>
            {modules.map((m) => (
              <div key={m.id} className="min-w-0">
                <ModuleCard m={{ ...m }} dense={dense} onGoTo={onGoTo} />
              </div>
            ))}
          </div>
        </FeatureModule>
      ) : null}

      {/* ============================================================
          M3 + M4 — Regime chart + Breadth heatmap
      ============================================================ */}
      {(show("regime") || show("breadth")) && (
        <div
          className={cn("grid gap-4 lg:grid-cols-3", dense && "gap-3", dual && "xl:col-span-2")}
          style={{ order: Math.min(orderIndex.regime, orderIndex.breadth) }}
        >
          {show("regime") ? (
            <FeatureModule
              code="M3"
              {...modFocus("regime")}
              title="Regime Composite"
              icon={Activity}
              hue="cyan"
              dense={dense}
              desc="0.35·breadthZ + 0.25·crossZ + 0.20·(1−2·volPct) + 0.20·overlapZ → gross budget (ส้ม, แกนขวา)"
              className="lg:col-span-2"
              options={
                <OptionsBar dense={dense}>
                  <Segmented
                    value={regimeRange}
                    onChange={setRegimeRange}
                    items={[
                      { value: "60", label: "60 วัน" },
                      { value: "120", label: "120 วัน" },
                      { value: "250", label: "250 วัน" },
                    ]}
                    ariaLabel="ช่วงเวลาของกราฟ"
                    dense={dense}
                  />
                  <ToggleChip active={showGross} onClick={() => setShowGross((v) => !v)} ariaLabel="แสดง/ซ่อนเส้น gross multiplier">
                    overlay gross ×
                  </ToggleChip>
                </OptionsBar>
              }
            >
              {sig.loading && !sig.data ? (
                <Skeleton className="w-full" style={{ height: chartH }} />
              ) : regimeData.length === 0 ? (
                <EmptyNote minH={chartH}>{sigFail ?? "ยังไม่มีข้อมูลสัญญาณ"}</EmptyNote>
              ) : (
                <ResponsiveContainer width="100%" height={chartH}>
                  <ComposedChart data={regimeData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="regimeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(100,116,139,0.18)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      interval={Math.max(0, Math.ceil(regimeData.length / 6) - 1)}
                    />
                    <YAxis
                      yAxisId="left"
                      domain={[-2, 2]}
                      ticks={[-2, -1, 0, 1, 2]}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      width={32}
                    />
                    {showGross ? (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 1.5]}
                        ticks={[0, 0.5, 1, 1.5]}
                        tickFormatter={(v: number) => `×${v.toFixed(1)}`}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        width={38}
                      />
                    ) : null}
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine yAxisId="left" y={0} stroke="rgba(100,116,139,0.35)" />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="regimeScore"
                      name="regime score"
                      stroke="#059669"
                      strokeWidth={2}
                      fill="url(#regimeFill)"
                      dot={false}
                      isAnimationActive={false}
                    />
                    {showGross ? (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="grossMult"
                        name="gross ×"
                        stroke="#d97706"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </FeatureModule>
          ) : null}

          {show("breadth") ? (
            <FeatureModule
              code="M4"
              {...modFocus("breadth")}
              title="Market Breadth"
              icon={LineChart}
              hue="magenta"
              dense={dense}
              desc="สัดส่วนหุ้นเหนือ MA20/50/200 + thrust 5 วัน — ชนักของตลาด"
              options={
                <OptionsBar dense={dense}>
                  <Segmented
                    value={breadthWin}
                    onChange={setBreadthWin}
                    items={[
                      { value: "14", label: "14 วัน" },
                      { value: "30", label: "30 วัน" },
                      { value: "60", label: "60 วัน" },
                    ]}
                    ariaLabel="หน้าต่าง heatmap"
                    dense={dense}
                  />
                </OptionsBar>
              }
            >
              {sig.loading && !sig.data ? (
                <Skeleton className="h-[240px] w-full" />
              ) : (sig.data?.market.length ?? 0) === 0 ? (
                <EmptyNote minH={240}>{sigFail ?? "ยังไม่มีข้อมูล"}</EmptyNote>
              ) : (
                <BreadthHeatmap market={sig.data!.market} window={Number(breadthWin)} />
              )}
            </FeatureModule>
          ) : null}
        </div>
      )}

      {/* ============================================================
          M5 — GTAA Monthly Ops
      ============================================================ */}
      {show("gtaa") ? (
        <FeatureModule
          code="M5"
          {...modFocus("gtaa")}
          title="GTAA Monthly Ops (ตลาดโลก — shadow รายเดือน)"
          icon={Globe2}
          hue="green"
          dense={dense}
          className={dual ? "xl:col-span-2" : undefined}
          desc="Faber Top-6: เงินสดสัญญาณ Top-6 ≥ 50% และ SPY หลุด SMA10 ม. → risk_off · สถานะ shadow ยังไม่เขียนทับ gross budget ระบบไทย"
          status={
            gtaaOv.data
              ? { kind: "ready", text: gtaaOv.data.readiness.level }
              : deferred.gtaa === null
                ? { kind: "loading", text: "คิวโหลด" }
                : gtaaOv.error
                  ? { kind: "offline", text: "ออฟไลน์" }
                  : { kind: "loading", text: "…" }
          }
          options={
            <OptionsBar dense={dense}>
              <Segmented
                value={gtaaView}
                onChange={setGtaaView}
                items={[
                  { value: "top6", label: "Top-6 ถือจริง" },
                  { value: "all", label: "ทั้ง universe" },
                ]}
                ariaLabel="มุมมองสัญญาณ GTAA"
                dense={dense}
              />
              {gtaaOv.data ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  self-test {gtaaOv.data.selfTestPass}/{gtaaOv.data.selfTestTotal} · source {gtaaOv.data.source.source}
                </span>
              ) : null}
            </OptionsBar>
          }
        >
          <GtaaModuleBody
            gtaa={gtaaOv.data ?? null}
            brief={ovData.gtaa}
            daysLeft={gtaaDaysLeft}
            nextDate={gtaaNextDate}
            view={gtaaView}
            onGoTo={onGoTo}
            offline={!gtaaOv.data && !!gtaaOv.error}
            countdownSource={gtaaCountdown.source}
          />
        </FeatureModule>
      ) : null}

      {/* ============================================================
          M6 + M7 — Evidence + Shadow Lab
      ============================================================ */}
      {(show("evidence") || show("lab")) && (
        <div
          className={cn("grid gap-4 lg:grid-cols-2", dense && "gap-3", dual && "xl:col-span-2")}
          style={{ order: Math.min(orderIndex.evidence, orderIndex.lab) }}
        >
          {show("evidence") ? (
            <FeatureModule
              code="M6"
              {...modFocus("evidence")}
              title="Evidence Pipeline"
              icon={ClipboardCheck}
              hue="amber"
              dense={dense}
              desc="Evidence Night: H1–H4 → verdict → auto-apply config (มี audit ทุกครั้ง)"
              status={
                evid.data
                  ? { kind: "ready", text: evid.data.runs[0] ? "รันแล้ว" : "ว่าง" }
                  : deferred.evid === null
                    ? { kind: "loading", text: "คิวโหลด" }
                    : evid.error
                      ? { kind: "offline", text: "ออฟไลน์" }
                      : { kind: "loading", text: "…" }
              }
              options={
                <OptionsBar dense={dense}>
                  <Segmented
                    value={evidView}
                    onChange={setEvidView}
                    items={[
                      { value: "runs", label: "รอบรันล่าสุด" },
                      { value: "buckets", label: "ถังผลลัพธ์ตาม source" },
                    ]}
                    ariaLabel="มุมมอง evidence"
                    dense={dense}
                  />
                </OptionsBar>
              }
            >
              <EvidenceModuleBody ev={evid.data} view={evidView} error={evid.error} />
            </FeatureModule>
          ) : null}

          {show("lab") ? (
            <FeatureModule
              code="M7"
              {...modFocus("lab")}
              title="Shadow Lab"
              icon={Beaker}
              hue="amber"
              dense={dense}
              desc="rule engine × Nimble — วงจรปิด (สร้าง state → เสนอไม้ → label โดยมนุษย์) ไม่แตะเงินจริง"
              status={
                labBrief
                  ? { kind: "ready", text: "พร้อม" }
                  : deferred.lab === null
                    ? { kind: "loading", text: "คิวโหลด" }
                    : lab.error
                      ? { kind: "offline", text: "ออฟไลน์" }
                      : { kind: "loading", text: "…" }
              }
              options={
                <OptionsBar dense={dense}>
                  <Segmented
                    value={labView}
                    onChange={setLabView}
                    items={[
                      { value: "stats", label: "สถิติ + cumR" },
                      { value: "gates", label: "Gate kills" },
                    ]}
                    ariaLabel="มุมมอง shadow lab"
                    dense={dense}
                  />
                </OptionsBar>
              }
            >
              <LabModuleBody lab={labBrief} view={labView} error={lab.error} />
            </FeatureModule>
          ) : null}
        </div>
      )}

      {/* ============================================================
          M8 + M9 — Risk Radar + Ops Checklist
      ============================================================ */}
      {(show("risk") || show("ops")) && (
        <div
          className={cn("grid gap-4 lg:grid-cols-2", dense && "gap-3", dual && "xl:col-span-2")}
          style={{ order: Math.min(orderIndex.risk, orderIndex.ops) }}
        >
          {show("risk") ? (
            <FeatureModule
              code="M8"
              {...modFocus("risk")}
              title="Risk Radar"
              icon={Radar}
              hue="magenta"
              dense={dense}
              desc="รวมความเสี่ยงทุกชั้นเป็นจอเดียว — เกณฑ์สีลงทะเบียนล่วงหน้าทุกตัว"
              options={
                <OptionsBar dense={dense}>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    สี: เขียว = ผ่อนคลาย · ส้ม = เฝ้าระวัง · แดง = ต้องลงมือ
                  </span>
                </OptionsBar>
              }
            >
              <RiskModuleBody
                breaker={breaker ? { level: breaker.level, label: breaker.label } : null}
                volPct={last?.volPct ?? null}
                risk={port.data?.risk ?? null}
                cashPct={ovData.gtaa?.cashPct ?? null}
                riskScore={score}
                posture={posture}
                onGoTo={onGoTo}
                breakerError={!sniper.data && !!sniper.error}
                riskError={!port.data && !!port.error}
              />
            </FeatureModule>
          ) : null}

          {show("ops") ? (
            <FeatureModule
              code="M9"
              {...modFocus("ops")}
              title="Ops Checklist (พิธีประจำเดือน)"
              icon={CalendarCheck}
              hue="green"
              dense={dense}
              desc="สิ่งที่ต้องเกิดขึ้นก่อนรอบตัดสินใจ — แตะแถวเพื่อเปิดแท็บที่เกี่ยวข้อง"
              status={
                pulse.data
                  ? {
                      kind: pulse.data.doneCount === pulse.data.checklist.length ? "ready" : "warn",
                      text: `${pulse.data.doneCount}/${pulse.data.checklist.length}`,
                    }
                  : pulse.error
                    ? { kind: "offline", text: "ออฟไลน์" }
                    : { kind: "loading", text: "…" }
              }
            >
              <OpsModuleBody
                pulse={pulse.data}
                daysLeft={gtaaDaysLeft}
                nextDate={gtaaNextDate}
                onGoTo={onGoTo}
                onRefresh={pulse.refetch}
                refreshing={pulse.loading}
                error={pulse.error}
              />
            </FeatureModule>
          ) : null}
        </div>
      )}

      {/* ============================================================
          M10 + M11 — Top stocks + Jev feed
      ============================================================ */}
      {(show("topstocks") || show("jevfeed")) && (
        <div
          className={cn("grid gap-4 lg:grid-cols-2", dense && "gap-3", dual && "xl:col-span-2")}
          style={{ order: Math.min(orderIndex.topstocks, orderIndex.jevfeed) }}
        >
          {show("topstocks") ? (
            <FeatureModule
              code="M10"
              {...modFocus("topstocks")}
              title="หุ้นคะแนนสูงสุดวันนี้"
              icon={Sparkles}
              hue="cyan"
              dense={dense}
              desc={`จาก meta-score ของสัญญาณ v2 — priceRank/flowRank/sectorRank/vol รวมกัน ณ ${sig.data?.latest ?? "—"}`}
              options={
                <OptionsBar dense={dense}>
                  <Segmented
                    value={topN}
                    onChange={setTopN}
                    items={[
                      { value: "5", label: "5 ตัว" },
                      { value: "8", label: "8 ตัว" },
                      { value: "12", label: "12 ตัว" },
                    ]}
                    ariaLabel="จำนวนหุ้นที่แสดง"
                    dense={dense}
                  />
                  <Button variant="ghost" size="sm" className="h-9 sm:h-7" onClick={() => onGoTo("map")}>
                    เปิด Momentum Map →
                  </Button>
                </OptionsBar>
              }
            >
              {sig.loading && !sig.data ? (
                <Skeleton className="h-64 w-full" />
              ) : topStocks.arr.length === 0 ? (
                <EmptyNote minH={120}>{sigFail ?? "ยังไม่มีข้อมูล"}</EmptyNote>
              ) : (
                <div className="space-y-2">
                  {topStocks.arr.map((s, i) => (
                    <div key={s.symbol} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                      <span className="w-11 shrink-0 font-mono text-sm font-bold">{s.symbol}</span>
                      <span className="hidden w-20 shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
                        {s.sector}
                      </span>
                      <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-foreground/[0.06]">
                        <div
                          className="h-full rounded bg-neon-green shadow-[0_0_10px_-2px_rgba(5,150,105,0.35)]"
                          style={{
                            width: `${Math.max(3, (Math.max(0, s.score) / topStocks.max) * 100)}%`,
                            opacity: 0.45 + 0.55 * (1 - i / Math.max(1, topStocks.arr.length)),
                          }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
                        {s.score.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </FeatureModule>
          ) : null}

          {show("jevfeed") ? (
            <FeatureModule
              code="M11"
              {...modFocus("jevfeed")}
              title="การตัดสินใจล่าสุดของ Jev"
              icon={BrainCircuit}
              hue="purple"
              dense={dense}
              desc="จาก audit log — ทุกคำสั่งผ่าน Human Gate ก่อนเข้าพอร์ต (default-deny)"
              options={
                <OptionsBar dense={dense}>
                  <Segmented
                    value={jevN}
                    onChange={setJevN}
                    items={[
                      { value: "4", label: "4 รายการ" },
                      { value: "6", label: "6 รายการ" },
                      { value: "10", label: "10 รายการ" },
                    ]}
                    ariaLabel="จำนวนการตัดสินใจที่แสดง"
                    dense={dense}
                  />
                  <Button variant="ghost" size="sm" className="h-9 sm:h-7" onClick={() => onGoTo("jev")}>
                    ไปที่ Jev AI →
                  </Button>
                </OptionsBar>
              }
            >
              {dec.loading && !dec.data ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : recentDecisions.length === 0 ? (
                <EmptyNote minH={90}>{decFail ?? "ยังไม่มีการตัดสินใจ — กดรัน Jev"}</EmptyNote>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {recentDecisions.map((d) => {
                    const q = QUESTION_ICON[d.question] ?? { icon: Sparkles, cls: "text-neon-purple" }
                    const Icon = q.icon
                    return (
                      <div
                        key={d.id}
                        className="flex gap-2.5 rounded-lg border border-border bg-foreground/[0.03] p-2.5 transition-colors hover:border-neon-purple/30"
                      >
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${q.cls}`} aria-hidden />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="font-mono text-[10px] text-muted-foreground">{d.date}</span>
                            <span className="font-bold">{d.target}</span>
                            <span className="text-muted-foreground">→ {d.action}</span>
                            <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                              conf {d.conf.toFixed(2)}
                            </Badge>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{d.reason}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </FeatureModule>
          ) : null}
        </div>
      )}
      </div>

      {/* ---- Options Center — ศูนย์ควบคุม super options (Sheet) ---- */}
      <OptionsCenter
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        prefs={prefs}
        onPrefsChange={setPrefs}
        userPresets={userPresets}
        onSavePreset={handleSavePreset}
        onApplyPreset={applyPreset}
        onDeletePreset={handleDeletePreset}
        onResetAll={resetAll}
      />
    </div>
  )
}
