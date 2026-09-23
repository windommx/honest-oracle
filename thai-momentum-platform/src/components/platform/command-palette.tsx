"use client"

import { Fragment, useEffect, useState } from "react"
import { Keyboard } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { paletteFilter } from "@/lib/platform/palette"
import { NAV_GROUPS, type NavItem } from "./nav-config"

/**
 * CommandPalette — กล่องค้นหา/กระโดดไปแท็บอย่างรวดเร็ว (⌘K / Ctrl+K)
 * รวมทางลัดระบบ เช่น สลับ Sidebar (⌘B) เพื่อความครบเครื่องแบบ pro terminal
 */
export default function CommandPalette({
  open,
  onOpenChange,
  onSelect,
  onToggleSidebar,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSelect: (tab: string) => void
  onToggleSidebar: () => void
}) {
  // ผูกคีย์ลัด ⌘K / Ctrl+K ระดับเอกสาร
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // e.key อาจไม่มี (keydown สังเคราะห์จาก autofill ของเบราว์เซอร์) — กัน TypeError ใน listener ระดับเอกสาร
      if (typeof e.key === "string" && e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, onOpenChange])

  const pick = (item: NavItem) => {
    onSelect(item.value)
    onOpenChange(false)
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

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette — ไปที่แท็บอย่างรวดเร็ว"
      description="พิมพ์เพื่อค้นหาแท็บหรือทางลัดของระบบ"
      filter={paletteFilter}
    >
      <CommandInput placeholder="ค้นหาแท็บ / ฟังก์ชัน…" aria-label="ค้นหาแท็บหรือฟังก์ชัน" />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>ไม่พบรายการที่ตรงกัน</CommandEmpty>
        {NAV_GROUPS.map((group, gi) => (
          <Fragment key={group.label}>
            <CommandGroup heading={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.value}
                    // value = ป้ายแท็บล้วน (ใช้จัดอันดับ "ตรงเป๊ะ" ใน paletteFilter) · รหัส/กลุ่มเป็น keywords ให้ค้นเจอเหมือนเดิม
                    value={item.label}
                    keywords={[item.value, group.label]}
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
            {gi < NAV_GROUPS.length - 1 && <CommandSeparator />}
          </Fragment>
        ))}
        <CommandSeparator />
        <CommandGroup heading="ทางลัดระบบ">
          <CommandItem
            value="สลับ sidebar toggle แถบเมนู"
            onSelect={() => {
              onToggleSidebar()
              onOpenChange(false)
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
