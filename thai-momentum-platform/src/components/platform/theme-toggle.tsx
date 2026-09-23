"use client"

/**
 * ThemeToggle — ปุ่มพระจันทร์/พระอาทิตย์บน header: สว่าง (Gold Ivory) · มืด (Gold Night) · ตามระบบ
 *
 * - ไอคอนสลับด้วยคลาส dark: ของ CSS ล้วน (ไม่ต้องรู้ธีมตอน SSR → ไม่มี hydration mismatch)
 * - ค่าที่เลือกจำโดย next-themes (localStorage "theme")
 * - Popover (non-modal) + radiogroup: ลูกศรขึ้น/ลงเลือกได้ · Esc ปิด · ไม่ซ่อนส่วนอื่นของหน้าจาก screen reader
 *   (DropdownMenu แบบ modal ใส่ aria-hidden ทั้งหน้า → axe: aria-hidden-focus / region)
 */

import { useId, useRef, useState, type KeyboardEvent } from "react"
import { Check, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export const THEME_OPTIONS = [
  { value: "light", label: "สว่าง", sub: "Gold Ivory", icon: Sun },
  { value: "dark", label: "มืด", sub: "Gold Night", icon: Moon },
  { value: "system", label: "ตามระบบ", sub: "สลับเองตามอุปกรณ์", icon: Monitor },
] as const

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const labelId = useId()
  const current = theme ?? "system"
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  // radiogroup: ลูกศรเลื่อนโฟกัส + เลือกทันที (ตามแบบ WAI-ARIA radio group)
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = THEME_OPTIONS.findIndex((o) => o.value === current)
    let next = -1
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % THEME_OPTIONS.length
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length
    if (next < 0) return
    e.preventDefault()
    setTheme(THEME_OPTIONS[next].value)
    refs.current[next]?.focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="เปลี่ยนธีมสี (สว่าง / มืด / ตามระบบ)"
          title="ธีมสี"
          className={cn(
            "size-10 shrink-0 rounded-full border-chip-border bg-chip/90 text-foreground hover:border-gold/60 hover:bg-accent hover:text-gold-ink sm:size-9",
            className,
          )}
        >
          <Sun className="size-4 dark:hidden" aria-hidden />
          <Moon className="hidden size-4 dark:block" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 rounded-xl p-1.5" aria-labelledby={labelId}>
        <p id={labelId} className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">
          ธีมสี
        </p>
        <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className="space-y-0.5">
          {THEME_OPTIONS.map((o, i) => {
            const Icon = o.icon
            const active = current === o.value
            return (
              <button
                key={o.value}
                ref={(el) => {
                  refs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => {
                  setTheme(o.value)
                  setOpen(false)
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="size-4 shrink-0 text-gold-ink" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-sm font-medium">{o.label}</span>
                  <span className="text-[11px] text-muted-foreground">{o.sub}</span>
                </span>
                {active ? <Check className="size-4 shrink-0 text-gold-ink" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
