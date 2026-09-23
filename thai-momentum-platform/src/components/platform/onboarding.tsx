"use client"

/**
 * Onboarding — คู่มือเริ่มต้นภาษาไทย
 *
 * 2 รูปแบบ เนื้อหาชุดเดียวกัน:
 * - WelcomePanel     : การ์ดต้อนรับครั้งแรก วางบนสุดของหน้าภาพรวม — ไม่ใช่ modal (ไม่บังเมนู/ไม่ขวาง automation)
 *                      ปิดได้ทันที + ช่อง “ไม่ต้องแสดงอีก” (จำใน localStorage แบบ try/catch ผ่าน useOnboardingSeen)
 * - OnboardingDialog : เปิดซ้ำได้ทุกเมื่อจาก ⌘K / ตัวเลือก → “คู่มือเริ่มต้น”
 *
 * เนื้อหา: 5 จุดสำคัญ (Command Center · สัญญาณเรือธง · Momentum Map · Jev + Human Gate · Paper mode)
 * + เลือกมุมมอง ง่าย/Pro + ลิงก์ข้อกำหนดการใช้งาน (/terms)
 */

import { useId, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  BookOpen,
  BrainCircuit,
  FileText,
  LayoutDashboard,
  LineChart,
  Sparkles,
  Trophy,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ALL_TABS, SIMPLE_TAB_VALUES, type UiMode } from "./nav-config"

interface Place {
  tab: string
  icon: LucideIcon
  hue: "cyan" | "green" | "amber" | "purple" | "magenta"
  title: string
  body: string
}

export const ONBOARDING_PLACES: Place[] = [
  {
    tab: "overview",
    icon: LayoutDashboard,
    hue: "cyan",
    title: "ภาพรวม (Command Center)",
    body: "หน้าแรก — โหมดวันนี้ (บุก / คัดเลือก / ป้องกัน) สภาวะตลาด และงานที่รอคุณ ในจอเดียว",
  },
  {
    tab: "flagship",
    icon: Trophy,
    hue: "amber",
    title: "สัญญาณเรือธง",
    body: "หุ้น 10 อันดับที่ผ่านด่านคัดกรองของทุกเอนจิน พร้อมเหตุผลทุกคะแนน — จุดเริ่มหาไอเดียที่ดีที่สุด",
  },
  {
    tab: "map",
    icon: LineChart,
    hue: "green",
    title: "Momentum Map",
    body: "แผนที่หุ้นติดโผข้าม 7 กรอบเวลา (5–300 วัน) — หุ้นที่ติดหลายกรอบพร้อมกัน = เทรนด์แข็งแรง",
  },
  {
    tab: "jev",
    icon: BrainCircuit,
    hue: "purple",
    title: "Jev AI + Human Gate",
    body: "Jev เสนอคำสั่งพร้อมเหตุผล แต่ทุกคำสั่งต้องให้คุณกดอนุมัติก่อน — AI ช่วยคิด คุณเป็นผู้ตัดสินใจ",
  },
  {
    tab: "portfolio",
    icon: Wallet,
    hue: "magenta",
    title: "Paper mode (พอร์ตจำลอง)",
    body: "ทุกอย่างเป็นการจำลอง ไม่มีคำสั่งซื้อขายจริง ไม่ใช้เงินจริง — ตัวเลขทั้งหมดไม่ใช่คำแนะนำการลงทุน",
  },
]

const SIMPLE_COUNT = SIMPLE_TAB_VALUES.length
const PRO_COUNT = ALL_TABS.length

function PlaceButton({ p, onGo, compact }: { p: Place; onGo: (tab: string) => void; compact?: boolean }) {
  const Icon = p.icon
  return (
    <button
      type="button"
      onClick={() => onGo(p.tab)}
      className={cn(
        "group flex h-full min-w-0 items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-gold/60 hover:bg-accent/40",
        compact && "p-2.5",
      )}
    >
      <span className={cn("hue-tile flex size-8 shrink-0 items-center justify-center rounded-lg", `hue-tile-${p.hue}`)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-5 text-foreground group-hover:text-gold-ink">{p.title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{p.body}</span>
      </span>
    </button>
  )
}

/** ตัวเลือกมุมมอง ง่าย / Pro — radio group */
export function ModeChooser({ mode, onModeChange }: { mode: UiMode; onModeChange: (m: UiMode) => void }) {
  const items: { value: UiMode; title: string; body: string }[] = [
    { value: "simple", title: "ง่าย (Simple)", body: `${SIMPLE_COUNT} แท็บหลัก — เหมาะกับผู้เริ่มต้น เห็นเฉพาะสิ่งที่ใช้ตัดสินใจ` },
    { value: "pro", title: "มืออาชีพ (Pro)", body: `ครบ ${PRO_COUNT} แท็บ — รวมห้องวิจัย Backtest Shadow Lab และเอนจินขั้นสูง` },
  ]
  return (
    <div role="radiogroup" aria-label="เลือกมุมมองเมนู" className="grid gap-2 sm:grid-cols-2">
      {items.map((it) => {
        const active = it.value === mode
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onModeChange(it.value)}
            className={cn(
              "flex min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
              active ? "border-gold/70 bg-gold-soft" : "border-border bg-card hover:border-gold/40",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                active ? "border-gold-ink" : "border-muted-foreground/60",
              )}
            >
              {active ? <span className="size-2 rounded-full bg-gold-ink" /> : null}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[13px] font-bold", active ? "text-gold-ink" : "text-foreground")}>{it.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{it.body}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Tips({ onOpenGlossary }: { onOpenGlossary?: () => void }) {
  return (
    <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
      <li>
        • คำศัพท์ที่มี<span className="term-trigger mx-0.5 cursor-default">เส้นประใต้</span>(เช่น IC, Regime) แตะเพื่อดูความหมายภาษาไทย
        {onOpenGlossary ? (
          <>
            {" "}
            หรือ{" "}
            <button type="button" onClick={onOpenGlossary} className="font-semibold text-neon-cyan underline-offset-2 hover:underline">
              เปิดอภิธานศัพท์
            </button>
          </>
        ) : null}
      </li>
      <li>
        • กด <kbd className="rounded border border-chip-border bg-chip px-1 font-mono text-[11px] text-foreground">⌘K</kbd> (หรือปุ่ม
        “เมนู” บนมือถือ) เพื่อค้นหาแท็บ เปลี่ยนธีม หรือเปิดคู่มือนี้อีกครั้ง
      </li>
    </ul>
  )
}

function TermsLink() {
  return (
    <Link
      href="/terms"
      className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-neon-cyan underline-offset-2 hover:underline"
    >
      <FileText className="size-3.5" aria-hidden />
      ข้อกำหนดการใช้งานและคำเตือนความเสี่ยง
    </Link>
  )
}

export interface OnboardingProps {
  onGoTo: (tab: string) => void
  mode: UiMode
  onModeChange: (m: UiMode) => void
  onOpenGlossary?: () => void
}

// =====================================================================
// การ์ดต้อนรับครั้งแรก (inline — ไม่ใช่ modal)
// =====================================================================

export function WelcomePanel({
  onGoTo,
  mode,
  onModeChange,
  onOpenGlossary,
  onDismiss,
}: OnboardingProps & {
  /** remember = ติ๊ก “ไม่ต้องแสดงอีก” */
  onDismiss: (remember: boolean) => void
}) {
  const [remember, setRemember] = useState(true)
  const titleId = useId()
  const checkId = useId()
  return (
    <section aria-labelledby={titleId} className="hero-card mb-5 p-4 sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="brand-coin flex size-10 shrink-0 items-center justify-center rounded-full">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="gold-kicker">คู่มือเริ่มต้น · ใช้เวลา 1 นาที</p>
          <h2 id={titleId} className="mt-1 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
            ยินดีต้อนรับสู่ Thai Momentum Platform
          </h2>
          <p className="mt-1.5 hidden max-w-3xl text-sm leading-6 text-muted-foreground sm:block">
            ระบบช่วยคัดหุ้นไทยตามโมเมนตัม + ผู้ช่วย AI ชื่อ Jev — ทำงานในโหมดจำลอง (Paper) 100% ไม่ใช้เงินจริง เริ่มจาก 5 จุดนี้:
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(remember)}
          aria-label="ปิดคู่มือเริ่มต้น"
          className="-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* มือถือ: คำอธิบายเต็มความกว้าง (ไม่บีบอยู่ระหว่างไอคอนกับปุ่มปิด) */}
      <p className="mt-3 text-sm leading-6 text-muted-foreground sm:hidden">
        ระบบช่วยคัดหุ้นไทยตามโมเมนตัม + ผู้ช่วย AI ชื่อ Jev — ทำงานในโหมดจำลอง (Paper) 100% ไม่ใช้เงินจริง เริ่มจาก 5 จุดนี้:
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {ONBOARDING_PLACES.map((p) => (
          <PlaceButton key={p.tab} p={p} onGo={onGoTo} compact />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-bold text-foreground">เลือกมุมมองที่เหมาะกับคุณ (เปลี่ยนได้ตลอดที่แถบเมนูซ้าย)</p>
          <ModeChooser mode={mode} onModeChange={onModeChange} />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-bold text-foreground">เคล็ดลับ</p>
          <Tips onOpenGlossary={onOpenGlossary} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-3">
        <TermsLink />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkId}
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
              className="size-5"
            />
            <label htmlFor={checkId} className="cursor-pointer text-xs text-muted-foreground">
              ไม่ต้องแสดงอีก
            </label>
          </div>
          <Button size="sm" className="h-10 px-4 sm:h-9" onClick={() => onDismiss(remember)}>
            เริ่มใช้งาน
          </Button>
        </div>
      </div>
    </section>
  )
}

// =====================================================================
// คู่มือแบบ dialog — เปิดซ้ำได้จาก ⌘K / Options
// =====================================================================

export function OnboardingDialog({
  open,
  onOpenChange,
  onGoTo,
  mode,
  onModeChange,
  onOpenGlossary,
}: OnboardingProps & { open: boolean; onOpenChange: (v: boolean) => void }) {
  const go = (tab: string) => {
    onOpenChange(false)
    onGoTo(tab)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92svh,760px)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <BookOpen className="size-5 text-gold-ink" aria-hidden />
            คู่มือเริ่มต้น
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            5 จุดสำคัญของแพลตฟอร์ม — แตะเพื่อไปที่หน้านั้นได้ทันที · ทุกคำสั่งเป็น Paper mode ไม่ใช้เงินจริง
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ONBOARDING_PLACES.map((p) => (
            <PlaceButton key={p.tab} p={p} onGo={go} />
          ))}
        </div>
        <Section title="มุมมองเมนู">
          <ModeChooser mode={mode} onModeChange={onModeChange} />
        </Section>
        <Section title="เคล็ดลับ">
          <Tips
            onOpenGlossary={
              onOpenGlossary
                ? () => {
                    onOpenChange(false)
                    onOpenGlossary()
                  }
                : undefined
            }
          />
        </Section>
        <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-3">
          <TermsLink />
          <Button size="sm" className="ml-auto h-10 px-4 sm:h-9" onClick={() => onOpenChange(false)}>
            เข้าใจแล้ว
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-foreground">{title}</p>
      {children}
    </div>
  )
}
