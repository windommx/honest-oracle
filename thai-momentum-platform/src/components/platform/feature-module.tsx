"use client"

/**
 * FeatureModule — หน่วยโมดูลมาตรฐานของ Command Center 3.0
 *
 * สัญญาการออกแบบ (design contract) ที่ทุกโมดูลต้องเหมือนกันเป๊ะ:
 *   ┌ .feature ─────────────────────────────────────────────────┐
 *   │ head   : [icon tile] [CODE · ชื่อ]  [status badge] [acts] │
 *   │ .options: แถบตัวเลือกเฉพาะโมดูล (Segmented/ToggleChip)     │
 *   │ body   : เนื้อหาโมดูล (children)                            │
 *   └───────────────────────────────────────────────────────────┘
 *
 * กติกา:
 * - `.feature`  = กล่องโมดูล (Card โครงเดียวกันทั้งระบบ) — คลาสโครงสร้างจริงใน globals.css
 * - `.options`  = แถบตัวเลือกใต้หัวโมดูล — ควบคุมได้เฉพาะโมดูลตนเอง ไม่งั้นไม่เกิด
 * - hue เป็นสีประจำโมดูล (แท็บไหนสีอะไรมาแล้วตามทะเบียน) — ไม่ใช้สีใหม่ลอย ๆ
 * - ปุ่ม/ตัวเลือกทุกตัวแตะได้ ≥ 44px บนมือถือ (h-11) แล้วค่อยกระชับบนจอใหญ่ (sm:h-8)
 */

import type { CSSProperties, ReactNode } from "react"
import { EyeOff, Maximize2, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type Hue = "cyan" | "magenta" | "green" | "purple" | "amber"

export type Tone = "green" | "amber" | "rose" | "cyan" | "purple" | "magenta" | "neutral"

/** เกณฑ์สถานะโมดูล — ลงทะเบียนไว้ 5 แบบ ไม่มีอื่น */
export type ModuleStatusKind = "ready" | "warn" | "offline" | "loading" | "open"
export interface ModuleStatus {
  kind: ModuleStatusKind
  text: string
}

export const STATUS_CLS: Record<ModuleStatusKind, string> = {
  ready: "border-neon-green/40 bg-neon-green/10 text-neon-green",
  warn: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber",
  offline: "border-neon-rose/40 bg-neon-rose/10 text-neon-rose",
  open: "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan",
  loading: "border-border bg-foreground/[0.04] text-muted-foreground",
}

export const BADGE_SHADOW = "shadow-[0_1px_2px_rgba(16,24,40,0.06)]"

/** icon tile — hue เป็น static class map กัน Tailwind ตัด class หาย */
const HUE_TILE: Record<Hue, string> = {
  cyan: "border-neon-cyan/25 bg-neon-cyan/10 text-neon-cyan",
  magenta: "border-neon-magenta/25 bg-neon-magenta/10 text-neon-magenta",
  green: "border-neon-green/25 bg-neon-green/10 text-neon-green",
  purple: "border-neon-purple/25 bg-neon-purple/10 text-neon-purple",
  amber: "border-neon-amber/25 bg-neon-amber/10 text-neon-amber",
}

/** สีตัวเลข/ข้อความตาม tone — ใช้กับ MiniStat/Meter */
export const TONE_TEXT: Record<Tone, string> = {
  green: "text-neon-green",
  amber: "text-neon-amber",
  rose: "text-neon-rose",
  cyan: "text-neon-cyan",
  purple: "text-neon-purple",
  magenta: "text-neon-magenta",
  neutral: "text-foreground",
}

export const TONE_BG: Record<Tone, string> = {
  green: "bg-neon-green",
  amber: "bg-neon-amber",
  rose: "bg-neon-rose",
  cyan: "bg-neon-cyan",
  purple: "bg-neon-purple",
  magenta: "bg-neon-magenta",
  neutral: "bg-foreground/30",
}

// =====================================================================
// StatusBadge — ป้ายสถานะโมดูล (ข้อความสั้น ≤ 1 คำ กันล้นการ์ด)
// =====================================================================

export function StatusBadge({ s, className }: { s: ModuleStatus; className?: string }) {
  return (
    <Badge
      className={cn(
        "max-w-full shrink whitespace-nowrap",
        STATUS_CLS[s.kind],
        BADGE_SHADOW,
        className,
      )}
    >
      {s.text}
    </Badge>
  )
}

// =====================================================================
// OptionsBar — แถบ .options ของโมดูล (แสดงเฉพาะเมื่อโมดูลมีตัวเลือก)
// =====================================================================

export function OptionsBar({ children, dense }: { children: ReactNode; dense?: boolean }) {
  return (
    <div className="options" role="group" aria-label="ตัวเลือกของโมดูล">
      <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <SlidersHorizontal className="size-3" aria-hidden />
        {dense ? "" : "options"}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

// =====================================================================
// Segmented — ปุ่มกลุ่มเลือกค่าเดียว (มืออาชีพ = ทางเลือกเห็นหมดในคริบตา)
// =====================================================================

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  dense,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string; aria?: string }[]
  ariaLabel: string
  dense?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center rounded-lg border border-border bg-foreground/[0.03] p-0.5"
    >
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={it.aria ?? it.label}
            onClick={() => onChange(it.value)}
            className={cn(
              "min-h-9 rounded-md px-2.5 font-mono text-[11px] font-semibold transition-colors sm:min-h-0 sm:py-1",
              dense && "sm:text-[10px]",
              active
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.08)] ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

// =====================================================================
// ToggleChip — ปุ่มเปิด/ปิดรายการ (สถานะเห็นชัดจากสี)
// =====================================================================

export function ToggleChip({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors sm:min-h-0 sm:py-1.5",
        active
          ? "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan"
          : "border-border bg-foreground/[0.03] text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-neon-cyan" : "bg-foreground/25")}
      />
      {children}
    </button>
  )
}

// =====================================================================
// MiniStat — ตัวเลขย่อในโมดูล (label บน · ค่ากลาง · sub ล่าง)
// =====================================================================

export function MiniStat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("truncate font-mono text-base font-bold tabular-nums", TONE_TEXT[tone])}>{value}</p>
      {sub ? <p className="truncate text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

// =====================================================================
// Meter — แถบวัดแนวนอน (0..1) พร้อมเกณฑ์อ้างอิง
// =====================================================================

export function Meter({
  value,
  tone = "cyan",
  ariaLabel,
}: {
  value: number // 0..1
  tone?: Tone
  ariaLabel?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.07]"
    >
      <div className={cn("h-full rounded-full", TONE_BG[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

// =====================================================================
// EmptyNote — สถานะว่างแบบสุภาพ (ไม่ทิ้งช่องโหว่)
// =====================================================================

export function EmptyNote({ children, minH = 80 }: { children: ReactNode; minH?: number }) {
  return (
    <div
      className="flex items-center justify-center px-4 text-center text-xs text-muted-foreground"
      style={{ minHeight: minH }}
    >
      {children}
    </div>
  )
}

// =====================================================================
// FeatureModule — กล่อง .feature หลัก
// =====================================================================

/** ปุ่มไอคอนเล็กในหัวโมดูล (โฟกัส/ซ่อน) — จอใหญ่กระชับ จอมือถือแตะ 44px ได้เต็มฝ่ามือ */
export function HeadIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground sm:h-7 sm:w-7"
    >
      {children}
    </button>
  )
}

export function FeatureModule({
  code,
  title,
  desc,
  icon: Icon,
  hue,
  status,
  actions,
  options,
  dense,
  /** ให้โมดูลนี้โฟกัสได้ — แสดงปุ่มขยายเดี่ยวในหัวโมดูล */
  onFocus,
  /** ให้ซ่อนโมดูลนี้ได้จากหัวโมดูลเลย — แสดงปุ่มตาดำ */
  onHide,
  /** true = โหมดอ่าน — ไม่เรนเดอร์แถบ .options (ตัวเลือกระดับ dashboard จัดการ) */
  hideOptions,
  style,
  children,
  className,
  bodyClassName,
}: {
  code: string
  title: string
  desc?: string
  icon: LucideIcon
  hue: Hue
  status?: ModuleStatus | null
  /** ปุ่มมุมขวาบน (เช่น เปิดแท็บ, รีเฟรช) */
  actions?: ReactNode
  /** เนื้อหาแถบ .options — undefined = ไม่มีแถบตัวเลือก */
  options?: ReactNode
  dense?: boolean
  onFocus?: () => void
  onHide?: () => void
  hideOptions?: boolean
  /** CSS order บน flex/grid ของพื้นที่โมดูล — ใช้เรียงลำดับจาก Options Center โดยไม่ย้าย JSX */
  style?: CSSProperties
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  const headActions = (onFocus || onHide || actions) ? (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      {onFocus ? (
        <HeadIconButton label={`โฟกัสโมดูล ${code} เดี่ยว`} onClick={onFocus}>
          <Maximize2 className="size-3.5" aria-hidden />
        </HeadIconButton>
      ) : null}
      {onHide ? (
        <HeadIconButton label={`ซ่อนโมดูล ${code}`} onClick={onHide}>
          <EyeOff className="size-3.5" aria-hidden />
        </HeadIconButton>
      ) : null}
      {actions}
    </div>
  ) : null
  return (
    <section style={style} className={cn("feature min-w-0", className)} aria-label={`${code} · ${title}`}>
      {/* ---- head ---- */}
      <div className={cn("flex min-w-0 items-center gap-2 px-4 pt-3.5", dense && "px-3 pt-2.5")}>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            HUE_TILE[hue],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {code}
            </span>
            <h2 className="min-w-0 truncate text-sm font-bold">{title}</h2>
            {status ? <StatusBadge s={status} /> : null}
          </div>
          {desc && !dense ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{desc}</p>
          ) : null}
        </div>
        {headActions}
      </div>

      {/* ---- .options strip ---- */}
      {options && !hideOptions ? <div className={cn(dense && "[&>.options]:py-1.5")}>{options}</div> : null}

      {/* ---- body ---- */}
      <div className={cn("min-w-0 p-4 pt-3", dense && "p-3 pt-2.5", bodyClassName)}>{children}</div>
    </section>
  )
}
