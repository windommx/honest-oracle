"use client"

import { useEffect, useState } from "react"
import { BookOpen, Keyboard, Layers, Library, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { paletteFilter } from "@/lib/platform/palette"
import { ALL_TABS, NAV_GROUPS, hiddenTabCount, isTabVisible, type NavGroup, type NavItem, type UiMode } from "./nav-config"

const GROUP_CLS = "border-t border-border/70 first:border-t-0"

/**
 * CommandPalette — กล่องค้นหา/กระโดดไปแท็บอย่างรวดเร็ว (⌘K / Ctrl+K)
 * รวมทางลัดระบบ: สลับ Sidebar (⌘B) · คู่มือเริ่มต้น · อภิธานศัพท์ · ธีมสี · โหมด ง่าย/Pro
 * โหมดง่ายแสดงเฉพาะแท็บหลัก (groups ที่กรองแล้วจาก app-shell) + คำสั่ง “แสดงแท็บทั้งหมด (Pro)”
 */
export default function CommandPalette({
  open,
  onOpenChange,
  onSelect,
  onToggleSidebar,
  groups = NAV_GROUPS,
  mode = "pro",
  onModeChange,
  onOpenGuide,
  onOpenGlossary,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSelect: (tab: string) => void
  onToggleSidebar: () => void
  /** กลุ่มเมนูตามโหมดปัจจุบัน (ค่าเริ่มต้น = ทุกแท็บ) */
  groups?: NavGroup[]
  mode?: UiMode
  onModeChange?: (m: UiMode) => void
  onOpenGuide?: () => void
  onOpenGlossary?: () => void
}) {
  const { setTheme } = useTheme()
  // ค่าค้นหา (controlled) — โหมดง่ายจะแสดง "แท็บขั้นสูง" เฉพาะตอนพิมพ์ค้นหา (ยังเข้าถึงได้ แต่ไม่รกรายการ)
  const [search, setSearch] = useState("")
  const setOpen = (v: boolean) => {
    if (!v) setSearch("")
    onOpenChange(v)
  }

  // ผูกคีย์ลัด ⌘K / Ctrl+K ระดับเอกสาร
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // e.key อาจไม่มี (keydown สังเคราะห์จาก autofill ของเบราว์เซอร์) — กัน TypeError ใน listener ระดับเอกสาร
      if (typeof e.key === "string" && e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (open) setSearch("")
        onOpenChange(!open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, onOpenChange])

  const pick = (item: NavItem) => {
    onSelect(item.value)
    setOpen(false)
  }
  const run = (fn?: () => void) => () => {
    setOpen(false)
    fn?.()
  }

  // Radix Dialog ฝัง data-* บน <body> ตั้งแต่ mount → SSR/client ไม่ตรงกัน
  // เรนเดอร์ Dialog หลัง mount เท่านั้น (open ยังควบคุมจาก state เดิม)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // เลื่อน set ไป microtask (pattern เดียวกับ market-clock) — กัน cascading render ใน effect body
    let alive = true
    Promise.resolve().then(() => {
      if (alive) setMounted(true)
    })
    return () => {
      alive = false
    }
  }, [])
  if (!mounted) return null

  const hidden = hiddenTabCount(mode)
  const hiddenTabs = mode === "simple" && search.trim() ? ALL_TABS.filter((t) => !isTabVisible(t.value, mode)) : []

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette — ไปที่แท็บอย่างรวดเร็ว"
      description="พิมพ์เพื่อค้นหาแท็บหรือทางลัดของระบบ"
      filter={paletteFilter}
    >
      <CommandInput
        placeholder="ค้นหาแท็บ / ฟังก์ชัน…"
        aria-label="ค้นหาแท็บหรือฟังก์ชัน"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>ไม่พบรายการที่ตรงกัน</CommandEmpty>
        {/* เส้นคั่นกลุ่มใช้ border ของกลุ่มเอง — role="separator" ใน listbox ผิดกติกา ARIA (axe: aria-required-children) */}
        {groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label} className={GROUP_CLS}>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.value}
                  // value = ป้ายแท็บล้วน (ใช้จัดอันดับ "ตรงเป๊ะ" ใน paletteFilter) · รหัส/กลุ่ม/คำอธิบายเป็น keywords
                  value={item.label}
                  keywords={[item.value, group.label, ...(item.desc ? [item.desc] : [])]}
                  onSelect={() => pick(item)}
                  className="gap-2.5 aria-selected:bg-neon-green/10 aria-selected:text-neon-green"
                >
                  <Icon className="size-4 text-neon-cyan" aria-hidden />
                  <span>{item.label}</span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
        {hiddenTabs.length > 0 && onModeChange ? (
          <CommandGroup heading="แท็บขั้นสูง — เปิดแล้วสลับเป็นโหมด Pro" className={GROUP_CLS}>
            {hiddenTabs.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.value}
                  value={`${item.label} (Pro)`}
                  keywords={[item.label, item.value, ...(item.desc ? [item.desc] : [])]}
                  onSelect={() => {
                    onModeChange("pro")
                    pick(item)
                  }}
                  className="gap-2.5"
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  <span>{item.label}</span>
                  <CommandShortcut>Pro</CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="ช่วยเหลือ" className={GROUP_CLS}>
          {onOpenGuide ? (
            <CommandItem
              value="คู่มือเริ่มต้น"
              keywords={["onboarding", "guide", "help", "ช่วยเหลือ", "เริ่มต้น", "ยินดีต้อนรับ"]}
              onSelect={run(onOpenGuide)}
              className="gap-2.5"
            >
              <BookOpen className="size-4 text-gold-ink" aria-hidden />
              <span>คู่มือเริ่มต้น</span>
            </CommandItem>
          ) : null}
          {onOpenGlossary ? (
            <CommandItem
              value="อภิธานศัพท์"
              keywords={["glossary", "คำศัพท์", "ความหมาย", "IC", "ICIR", "CPCV", "Brier", "regime"]}
              onSelect={run(onOpenGlossary)}
              className="gap-2.5"
            >
              <Library className="size-4 text-gold-ink" aria-hidden />
              <span>อภิธานศัพท์ (คำศัพท์ quant ภาษาไทย)</span>
            </CommandItem>
          ) : null}
        </CommandGroup>
        <CommandGroup heading="ทางลัดระบบ" className={GROUP_CLS}>
          {onModeChange ? (
            <CommandItem
              value={mode === "simple" ? "แสดงแท็บทั้งหมด โหมด Pro" : "สลับเป็นโหมดง่าย Simple"}
              keywords={["mode", "โหมด", "simple", "pro", "ง่าย", "มืออาชีพ", "แท็บทั้งหมด"]}
              onSelect={run(() => onModeChange(mode === "simple" ? "pro" : "simple"))}
              className="gap-2.5"
            >
              <Layers className="size-4 text-neon-purple" aria-hidden />
              <span>
                {mode === "simple"
                  ? `แสดงแท็บทั้งหมด — โหมด Pro (+${hidden} แท็บขั้นสูง)`
                  : "สลับเป็นโหมดง่าย (Simple — เฉพาะแท็บหลัก)"}
              </span>
            </CommandItem>
          ) : null}
          <CommandItem
            value="ธีมสว่าง Gold Ivory"
            keywords={["theme", "light", "ธีม", "สว่าง"]}
            onSelect={run(() => setTheme("light"))}
            className="gap-2.5"
          >
            <Sun className="size-4 text-gold-ink" aria-hidden />
            <span>ธีมสว่าง (Gold Ivory)</span>
          </CommandItem>
          <CommandItem
            value="ธีมมืด Gold Night"
            keywords={["theme", "dark", "ธีม", "มืด", "กลางคืน"]}
            onSelect={run(() => setTheme("dark"))}
            className="gap-2.5"
          >
            <Moon className="size-4 text-gold-ink" aria-hidden />
            <span>ธีมมืด (Gold Night)</span>
          </CommandItem>
          <CommandItem
            value="ธีมตามระบบ"
            keywords={["theme", "system", "ธีม", "อัตโนมัติ"]}
            onSelect={run(() => setTheme("system"))}
            className="gap-2.5"
          >
            <Monitor className="size-4 text-gold-ink" aria-hidden />
            <span>ธีมตามระบบ</span>
          </CommandItem>
          <CommandItem
            value="สลับ sidebar toggle แถบเมนู"
            onSelect={() => {
              onToggleSidebar()
              setOpen(false)
            }}
            className="gap-2.5"
          >
            <Keyboard className="size-4 text-neon-purple" aria-hidden />
            <span>สลับแถบเมนูซ้าย (Sidebar)</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
