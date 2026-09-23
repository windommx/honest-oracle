"use client"

/**
 * Glossary UI — <Term> (คำศัพท์ที่แตะดูความหมายได้) + แผงอภิธานศัพท์ค้นหาได้ (Sheet)
 *
 * <Term id="ic">IC</Term>
 * - เป็น <button> จริง: Tab ถึง · Enter/Space เปิด · Esc ปิด (Radix Popover จัดการโฟกัสและ aria-expanded ให้)
 * - แตะได้บนมือถือ (ไม่พึ่ง hover) · ชื่อที่อ่านออกเสียง = คำที่เห็น + “ดูความหมาย” (WCAG 2.5.3 label-in-name)
 * - ห้ามวางใน <button>/<a> อื่น (nested interactive) — ใช้ในหัวตาราง/หัวข้อ/ข้อความได้
 * - id ไม่มีในอภิธานศัพท์ = แสดงข้อความเฉย ๆ (ไม่พัง)
 *
 * GlossaryProvider เก็บสถานะแผงอภิธานศัพท์ — Term กด “ดูทั้งหมด” แล้วเปิดแผงพร้อมเลื่อนไปคำนั้น
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { BookOpen, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  GLOSSARY,
  GLOSSARY_CATEGORY_LABEL,
  findTerm,
  searchGlossary,
  type GlossaryCategory,
  type GlossaryEntry,
} from "@/lib/platform/glossary"
import { cn } from "@/lib/utils"
import ScrollBox from "./scroll-box"

// =====================================================================
// context — เปิดแผงอภิธานศัพท์จากที่ไหนก็ได้
// =====================================================================

interface GlossaryCtx {
  openGlossary: (termId?: string) => void
}

const Ctx = createContext<GlossaryCtx | null>(null)

export function useGlossary(): GlossaryCtx | null {
  return useContext(Ctx)
}

export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const value = useMemo<GlossaryCtx>(
    () => ({
      openGlossary: (termId?: string) => {
        setFocusId(termId ?? null)
        setOpen(true)
      },
    }),
    [],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      <GlossarySheet open={open} onOpenChange={setOpen} focusId={focusId} />
    </Ctx.Provider>
  )
}

// =====================================================================
// เนื้อหาคำศัพท์ (ใช้ร่วมกัน popover + แผง)
// =====================================================================

function EntryBody({ e, compact }: { e: GlossaryEntry; compact?: boolean }) {
  return (
    <div className={cn("space-y-2 text-xs leading-5", compact && "space-y-1.5")}>
      <p className="text-foreground">{e.th}</p>
      <p>
        <span className="font-semibold text-gold-ink">ทำไมสำคัญ · </span>
        <span className="text-muted-foreground">{e.why}</span>
      </p>
      <p>
        <span className="font-semibold text-neon-cyan">ตัวอย่าง · </span>
        <span className="text-muted-foreground">{e.example}</span>
      </p>
    </div>
  )
}

// =====================================================================
// <Term> — คำศัพท์ที่แตะดูความหมาย
// =====================================================================

export function Term({
  id,
  children,
  className,
}: {
  id: string
  /** ข้อความที่แสดง (ค่าเริ่มต้น = term ในอภิธานศัพท์) */
  children?: ReactNode
  className?: string
}) {
  const entry = findTerm(id)
  const glossary = useGlossary()
  const [open, setOpen] = useState(false)
  if (!entry) return <>{children}</>
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn("term-trigger", className)}>
          {children ?? entry.term}
          <span className="sr-only"> — ดูความหมาย</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-[min(22rem,calc(100vw-1.5rem))] space-y-2.5 rounded-xl p-4 text-left font-sans normal-case tracking-normal"
        aria-label={`ความหมายของ ${entry.term}`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <span className="hue-tile hue-tile-amber flex size-7 shrink-0 items-center justify-center rounded-lg">
            <BookOpen className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-5 text-foreground">{entry.term}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">{entry.full}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {GLOSSARY_CATEGORY_LABEL[entry.category]}
          </span>
        </div>
        <EntryBody e={entry} />
        {glossary ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              glossary.openGlossary(entry.id)
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-neon-cyan hover:underline"
          >
            <BookOpen className="size-3.5" aria-hidden />
            เปิดอภิธานศัพท์ทั้งหมด ({GLOSSARY.length} คำ)
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// =====================================================================
// แผงอภิธานศัพท์ — ค้นหา + กรองหมวด
// =====================================================================

const CATS: (GlossaryCategory | "all")[] = ["all", "signal", "market", "research", "risk", "system"]

export function GlossarySheet({
  open,
  onOpenChange,
  focusId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  focusId?: string | null
}) {
  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<GlossaryCategory | "all">("all")
  const list = useMemo(() => searchGlossary(query, cat), [query, cat])

  // เปิดพร้อมคำเป้าหมาย → ล้างตัวกรอง แล้วเลื่อนไปคำนั้น (หลังแผงเลื่อนเข้าเสร็จ)
  useEffect(() => {
    if (!open || !focusId) return
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      setQuery("")
      setCat("all")
    })
    const t = window.setTimeout(() => {
      document.getElementById(`glossary-${focusId}`)?.scrollIntoView({ block: "start", behavior: "smooth" })
    }, 320)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [open, focusId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border/80 px-4 py-3.5">
          <div className="flex items-center gap-2 pr-8">
            <span className="hue-tile hue-tile-amber flex size-8 shrink-0 items-center justify-center rounded-lg">
              <BookOpen className="size-4" aria-hidden />
            </span>
            <SheetTitle className="text-sm font-bold">อภิธานศัพท์ — คำศัพท์ quant ภาษาไทย</SheetTitle>
          </div>
          <SheetDescription className="text-[11px] leading-4">
            {GLOSSARY.length} คำที่พบบ่อยในแพลตฟอร์ม พร้อมความหมาย เหตุผลที่สำคัญ และตัวอย่าง — คำที่มีเส้นประใต้ในหน้าจอแตะดูได้ทันที
          </SheetDescription>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา เช่น IC, drawdown, ความผันผวน…"
              aria-label="ค้นหาคำศัพท์"
              className="h-10 pl-8 text-sm"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="กรองตามหมวด">
            {CATS.map((c) => {
              const active = c === cat
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCat(c)}
                  className={cn(
                    "min-h-8 rounded-full border px-3 text-[11px] font-semibold transition-colors",
                    active
                      ? "border-gold/60 bg-gold-soft text-gold-ink"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "all" ? "ทั้งหมด" : GLOSSARY_CATEGORY_LABEL[c]}
                </button>
              )
            })}
          </div>
        </SheetHeader>

        <ScrollBox className="min-h-0 flex-1 overflow-y-auto px-4 py-3" label="รายการคำศัพท์">
          <p className="sr-only" aria-live="polite">
            พบ {list.length} คำ
          </p>
          {list.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
              ไม่พบคำที่ตรงกับ “{query}” — ลองคำภาษาอังกฤษหรือคำพ้อง เช่น “stop”, “เงินไหล”
            </p>
          ) : (
            <ul className="space-y-2.5">
              {list.map((e) => (
                <li
                  key={e.id}
                  id={`glossary-${e.id}`}
                  className={cn(
                    "scroll-mt-3 rounded-xl border bg-card p-3.5",
                    e.id === focusId ? "border-gold/70 ring-2 ring-gold/25" : "border-border",
                  )}
                >
                  <div className="mb-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="text-sm font-extrabold text-foreground">{e.term}</h3>
                    <span className="min-w-0 text-[11px] text-muted-foreground">{e.full}</span>
                    <span className="ml-auto shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {GLOSSARY_CATEGORY_LABEL[e.category]}
                    </span>
                  </div>
                  <EntryBody e={e} compact />
                </li>
              ))}
            </ul>
          )}
        </ScrollBox>
      </SheetContent>
    </Sheet>
  )
}
