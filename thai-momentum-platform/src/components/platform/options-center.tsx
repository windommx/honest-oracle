"use client"

/**
 * OptionsCenter — ศูนย์ควบคุมการจัดวาง Command Center (Super Options)
 *
 * โครง 4 แท็บ (เกณฑ์ลงทะเบียนล่วงหน้า — ไม่มีตัวเลือกลอย ๆ นอกไฟล์นี้):
 *   จัดวาง   — เลย์เอาต์ 1/2 คอลัมน์ · ความหนาแน่น · รีเฟรชอัตโนมัติ · โหมดอ่าน
 *   โมดูล    — ค้นหา + เปิด/ปิดรายโมดูล + สลับลำดับขึ้น/ลง (บันทึกทันที)
 *   พรีเซ็ต  — 4 พรีเซ็ตในตัว + พรีเซ็ตของฉัน (บันทึก/ใช้/ลบ, สูงสุด 8)
 *   คีย์ลัด  — ตารางคีย์ลัดทั้งหมด (O/R/D/L/X/Esc/⌘K)
 *
 * ทุกการเปลี่ยนแปลง save ทันที (savePrefs ใน overview-tab) — ไม่มีปุ่ม "บันทึก" ให้ลืม
 */

import { useMemo, useState, type ReactNode } from "react"
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Library,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Trash2,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Segmented } from "./feature-module"
import {
  FEATURE_IDS,
  FEATURE_LABELS,
  type AutoRefresh,
  type DashboardLayout,
  type DashboardPrefs,
} from "@/lib/platform/dashboard-prefs"
import { BUILTIN_PRESETS, type DashboardPreset } from "@/lib/platform/dashboard-presets"
import { useUiMode } from "@/hooks/use-ui-prefs"
import { hiddenTabCount, type UiMode } from "./nav-config"

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-border bg-foreground/[0.04] px-1.5 font-mono text-[10px] font-bold tracking-wider text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.08)]">
      {children}
    </kbd>
  )
}

/** แถวตั้งค่ามาตรฐาน — ป้าย + คำอธิบายซ้าย, ควบคุมขวา */
function Field({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold">{label}</p>
        {desc ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{desc}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export interface OptionsCenterProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  prefs: DashboardPrefs
  onPrefsChange: (p: DashboardPrefs) => void
  userPresets: DashboardPreset[]
  onSavePreset: (name: string) => void
  onApplyPreset: (p: DashboardPreset) => void
  onDeletePreset: (id: string) => void
  onResetAll: () => void
  /** เปิดคู่มือเริ่มต้น (first-run guide) อีกครั้ง */
  onOpenGuide?: () => void
  /** เปิดแผงอภิธานศัพท์ */
  onOpenGlossary?: () => void
}

export default function OptionsCenter({
  open,
  onOpenChange,
  prefs,
  onPrefsChange,
  userPresets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onResetAll,
  onOpenGuide,
  onOpenGlossary,
}: OptionsCenterProps) {
  const [query, setQuery] = useState("")
  const [presetName, setPresetName] = useState("")
  // ค่าระดับแอป (ไม่ใช่ของแดชบอร์ด) — ใช้ store เดียวกับ header/sidebar จึงสลับพร้อมกันทุกที่
  const { theme, setTheme } = useTheme()
  const [uiMode, setUiMode] = useUiMode()

  const visibleCount = FEATURE_IDS.filter((id) => prefs.modules[id]).length
  const q = query.trim().toLowerCase()
  const listed = useMemo(
    () =>
      prefs.order.filter(
        (id) => !q || FEATURE_LABELS[id].toLowerCase().includes(q) || id.includes(q),
      ),
    [prefs.order, q],
  )

  function setVisible(id: (typeof FEATURE_IDS)[number], v: boolean) {
    onPrefsChange({ ...prefs, modules: { ...prefs.modules, [id]: v } })
  }
  function move(idx: number, dir: -1 | 1) {
    const order = [...prefs.order]
    const to = idx + dir
    if (to < 0 || to >= order.length) return
    ;[order[idx], order[to]] = [order[to], order[idx]]
    onPrefsChange({ ...prefs, order })
  }
  function setAllVisible(v: boolean) {
    const modules = FEATURE_IDS.reduce(
      (acc, id) => {
        acc[id] = v
        return acc
      },
      {} as Record<(typeof FEATURE_IDS)[number], boolean>,
    )
    onPrefsChange({ ...prefs, modules })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* aria-labelledby/aria-describedby ผูกอัตโนมัติจาก SheetTitle/SheetDescription (id ของ Radix)
          — ห้ามตั้ง id/aria-describedby เอง ไม่งั้น Radix หา Description ไม่เจอแล้วเตือนทุกครั้งที่เปิด */}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]"
      >
        {/* ---- header ---- */}
        <SheetHeader className="border-b border-border/80 px-4 py-3.5">
          <div className="flex items-center gap-2 pr-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neon-cyan/25 bg-neon-cyan/10 text-neon-cyan">
              <Rows3 className="size-4" aria-hidden />
            </span>
            <SheetTitle className="text-sm font-bold">OPTIONS CENTER</SheetTitle>
            <Badge variant="outline" className="ml-auto border-border bg-foreground/[0.03] font-mono text-[10px] text-muted-foreground">
              {visibleCount}/{FEATURE_IDS.length} โมดูล · {prefs.layout === "dual" ? "2 col" : "1 col"}
            </Badge>
          </div>
          <SheetDescription className="text-[11px] leading-4">
            ตัวเลือกการจัดวางระดับมืออาชีพ — ทุกการเปลี่ยนบันทึกทันทีในเครื่องนี้ (localStorage)
          </SheetDescription>
        </SheetHeader>

        {/* ---- tabs ---- */}
        <Tabs defaultValue="layout" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 grid h-9 w-auto grid-cols-4">
            <TabsTrigger value="layout" className="text-[11px]">จัดวาง</TabsTrigger>
            <TabsTrigger value="modules" className="text-[11px]">โมดูล</TabsTrigger>
            <TabsTrigger value="presets" className="text-[11px]">พรีเซ็ต</TabsTrigger>
            <TabsTrigger value="keys" className="text-[11px]">คีย์ลัด</TabsTrigger>
          </TabsList>

          {/* ================= จัดวาง ================= */}
          <TabsContent value="layout" className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-2">
            <div className="divide-y divide-border/70">
              <Field label="ธีมสี" desc="สว่าง = Gold Ivory · มืด = Gold Night · ตามระบบ = สลับเองตามอุปกรณ์">
                <Segmented
                  value={(theme ?? "system") as "light" | "dark" | "system"}
                  onChange={(v) => setTheme(v)}
                  items={[
                    { value: "light", label: "สว่าง", aria: "ธีมสว่าง Gold Ivory" },
                    { value: "dark", label: "มืด", aria: "ธีมมืด Gold Night" },
                    { value: "system", label: "ระบบ", aria: "ธีมตามระบบ" },
                  ]}
                  ariaLabel="ธีมสี"
                />
              </Field>
              <Field
                label="มุมมองเมนู"
                desc={`ง่าย = เฉพาะแท็บหลัก (ซ่อน ${hiddenTabCount("simple")} แท็บวิจัย) · Pro = ครบทุกแท็บ`}
              >
                <Segmented
                  value={uiMode}
                  onChange={(v: UiMode) => setUiMode(v)}
                  items={[
                    { value: "simple", label: "ง่าย", aria: "โหมดง่าย (Simple)" },
                    { value: "pro", label: "Pro", aria: "โหมดมืออาชีพ (Pro)" },
                  ]}
                  ariaLabel="มุมมองเมนู"
                />
              </Field>
              <Field label="เลย์เอาต์" desc="2 คอลัมน์ใช้ได้บนจอกว้าง (xl) — โมดูลกว้างครอบเต็มแถว">
                <Segmented
                  value={prefs.layout}
                  onChange={(v: DashboardLayout) => onPrefsChange({ ...prefs, layout: v })}
                  items={[
                    { value: "single", label: "1 แถว", aria: "คอลัมน์เดียว" },
                    { value: "dual", label: "2 แถว", aria: "สองคอลัมน์" },
                  ]}
                  ariaLabel="เลย์เอาต์แดชบอร์ด"
                />
              </Field>
              <Field label="ความหนาแน่น" desc="กระชับ = เนื้อหาต่อหน้าจอมากขึ้น เหมาะกับจอเล็ก">
                <Segmented
                  value={prefs.density}
                  onChange={(v) => onPrefsChange({ ...prefs, density: v })}
                  items={[
                    { value: "comfortable", label: "ปกติ" },
                    { value: "compact", label: "กระชับ" },
                  ]}
                  ariaLabel="ความหนาแน่นการจัดวาง"
                />
              </Field>
              <Field label="รีเฟรชอัตโนมัติ" desc="ใช้กับ endpoint เบาเท่านั้น — ตัวหนักกดรีเฟรชเอง">
                <Segmented
                  value={prefs.autoRefresh}
                  onChange={(v: AutoRefresh) => onPrefsChange({ ...prefs, autoRefresh: v })}
                  items={[
                    { value: "off", label: "ปิด" },
                    { value: "30", label: "30 วิ" },
                    { value: "60", label: "60 วิ" },
                  ]}
                  ariaLabel="รีเฟรชอัตโนมัติ"
                />
              </Field>
              <Field
                label="โหมดอ่าน"
                desc="ซ่อนแถบ options ของทุกโมดูล — เหลือเนื้อหาอย่างเดียว อ่านลื่นไม่เสียสมาธิ"
              >
                <Switch
                  checked={!prefs.showOptions}
                  onCheckedChange={(v) => onPrefsChange({ ...prefs, showOptions: !v })}
                  aria-label="เปิดโหมดอ่าน (ซ่อนแถบตัวเลือกทุกโมดูล)"
                />
              </Field>
            </div>
            <p className="mt-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-[11px] leading-4 text-muted-foreground">
              ตัวเลือกของแต่ละโมดูล (ช่วงเวลา/จำนวน/มุมมอง) ยังอยู่ครบที่แถบ options ใต้หัวโมดูล
              เมื่อปิดโหมดอ่าน — ระบบไม่ลืมค่าที่เคยเลือกไว้
            </p>
            {onOpenGuide || onOpenGlossary ? (
              <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
                <p className="text-xs font-semibold">ช่วยเหลือ</p>
                <div className="grid grid-cols-2 gap-2">
                  {onOpenGuide ? (
                    <Button variant="outline" size="sm" className="h-10 justify-start gap-2 sm:h-9" onClick={onOpenGuide}>
                      <BookOpen className="size-3.5 text-gold-ink" aria-hidden />
                      คู่มือเริ่มต้น
                    </Button>
                  ) : null}
                  {onOpenGlossary ? (
                    <Button variant="outline" size="sm" className="h-10 justify-start gap-2 sm:h-9" onClick={onOpenGlossary}>
                      <Library className="size-3.5 text-gold-ink" aria-hidden />
                      อภิธานศัพท์
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </TabsContent>

          {/* ================= โมดูล ================= */}
          <TabsContent value="modules" className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาโมดูล…"
                aria-label="ค้นหาโมดูล"
                className="h-9 border-border bg-foreground/[0.03] pl-8 text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                เห็นอยู่ {visibleCount}/{FEATURE_IDS.length} โมดูล · ลากลำดับได้ด้วยปุ่ม ▲▼
              </span>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" className="h-9 px-2 text-[11px] sm:h-7" onClick={() => setAllVisible(true)}>
                  แสดงทั้งหมด
                </Button>
                <Button variant="outline" size="sm" className="h-9 px-2 text-[11px] sm:h-7" onClick={() => setAllVisible(false)}>
                  ซ่อนทั้งหมด
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-1">
              {listed.map((id) => {
                const idx = prefs.order.indexOf(id)
                return (
                  <div
                    key={id}
                    className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-2"
                  >
                    <Switch
                      checked={prefs.modules[id]}
                      onCheckedChange={(v) => setVisible(id, v)}
                      aria-label={`${prefs.modules[id] ? "ซ่อน" : "แสดง"} ${FEATURE_LABELS[id]}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{FEATURE_LABELS[id]}</span>
                    <button
                      type="button"
                      aria-label={`เลื่อน ${FEATURE_LABELS[id]} ขึ้น`}
                      disabled={idx === 0}
                      onClick={() => move(idx, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-30 sm:h-7 sm:w-7"
                    >
                      <ChevronUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`เลื่อน ${FEATURE_LABELS[id]} ลง`}
                      disabled={idx === prefs.order.length - 1}
                      onClick={() => move(idx, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-30 sm:h-7 sm:w-7"
                    >
                      <ChevronDown className="size-3.5" aria-hidden />
                    </button>
                  </div>
                )
              })}
              {listed.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">ไม่พบโมดูลที่ตรงกับ “{query}”</p>
              ) : null}
            </div>
          </TabsContent>

          {/* ================= พรีเซ็ต ================= */}
          <TabsContent value="presets" className="mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <p className="text-[11px] text-muted-foreground">
              พรีเซ็ต = จัดวางทั้งชุดในคลิกเดียว — เกณฑ์ลงทะเบียนล่วงหน้า 4 แบบ สำหรับพิธีการใช้งานจริง
            </p>
            {BUILTIN_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onApplyPreset(p)}
                className="group flex w-full min-w-0 items-start gap-2.5 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-left transition-colors hover:border-neon-cyan/45 hover:bg-neon-cyan/[0.04]"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-foreground/[0.03] text-muted-foreground group-hover:border-neon-cyan/30 group-hover:text-neon-cyan">
                  <LayoutGrid className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{p.name}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{p.desc}</span>
                </span>
                <span className="shrink-0 pt-1 font-mono text-[10px] font-semibold text-neon-cyan opacity-0 transition-opacity group-hover:opacity-100">
                  ใช้ →
                </span>
              </button>
            ))}

            <div className="border-t border-border/70 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                พรีเซ็ตของฉัน ({userPresets.length}/8)
              </p>
              <div className="flex gap-1.5">
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="ตั้งชื่อพรีเซ็ต เช่น เช้าวันจันทร์"
                  aria-label="ชื่อพรีเซ็ตใหม่"
                  maxLength={40}
                  className="h-9 border-border bg-foreground/[0.03] text-xs"
                />
                <Button
                  size="sm"
                  className="h-9 shrink-0 gap-1 px-3"
                  disabled={!presetName.trim()}
                  onClick={() => {
                    onSavePreset(presetName)
                    setPresetName("")
                  }}
                >
                  <Plus className="size-3.5" aria-hidden />
                  บันทึก
                </Button>
              </div>
              <div className="mt-2 space-y-1.5">
                {userPresets.map((p) => (
                  <div
                    key={p.id}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                    </span>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onApplyPreset(p)}>
                      ใช้
                    </Button>
                    <button
                      type="button"
                      aria-label={`ลบพรีเซ็ต ${p.name}`}
                      onClick={() => onDeletePreset(p.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-neon-rose/10 hover:text-neon-rose sm:h-7 sm:w-7"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
                {userPresets.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                    ยังไม่มีพรีเซ็ตที่บันทึกไว้ — ตั้งค่าแดชบอร์ดตามใจแล้วกดบันทึกไว้ใช้รอบหน้า
                  </p>
                ) : null}
              </div>
            </div>
          </TabsContent>

          {/* ================= คีย์ลัด ================= */}
          <TabsContent value="keys" className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-1">
              {[
                { k: "O", d: "เปิด Options Center (หน้าต่างนี้)" },
                { k: "R", d: "รีเฟรชข้อมูลทุกแหล่งพร้อมกัน" },
                { k: "D", d: "สลับปกติ ↔ กระชับ" },
                { k: "L", d: "สลับเลย์เอาต์ 1 ↔ 2 คอลัมน์" },
                { k: "X", d: "โหมดอ่าน — ซ่อน/แสดงแถบ options ทุกโมดูล" },
                { k: "Esc", d: "ออกจากโหมดโฟกัสโมดูลเดี่ยว" },
                { k: "?", d: "เปิด Options Center ด้วย" },
                { k: "⌘K", d: "Command Palette — ไปที่แท็บอื่น" },
              ].map((row) => (
                <div key={row.k} className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 hover:bg-foreground/[0.03]">
                  <Kbd>{row.k}</Kbd>
                  <span className="min-w-0 flex-1 text-xs text-foreground/90">{row.d}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-[11px] leading-4 text-muted-foreground">
              คีย์ลัดจะไม่ทำงานขณะกำลังพิมพ์ในช่องค้นหา หรือขณะเปิดหน้าต่างนี้อยู่ — กันคีย์ชนกันเสมอ
            </p>
          </TabsContent>
        </Tabs>

        {/* ---- footer ---- */}
        <div className="flex items-center gap-2 border-t border-border/80 px-4 py-3">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 sm:h-8" onClick={onResetAll}>
            <RotateCcw className="size-3.5" aria-hidden />
            คืนค่าเริ่มต้นทั้งหมด
          </Button>
          <p className="ml-auto text-right text-[10px] leading-3 text-muted-foreground">
            บันทึกอัตโนมัติในเครื่องนี้<br />ไม่มีข้อมูลออกเซิร์ฟเวอร์
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
