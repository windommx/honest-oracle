/**
 * chart-theme — สีและสไตล์กราฟ Recharts ชุดเดียวของทั้งแพลตฟอร์ม (สลับตามธีมอัตโนมัติ)
 *
 * ทุกค่าเป็น CSS variable (นิยามใน globals.css ทั้ง :root และ .dark) — SVG presentation attribute
 * และ inline style รับ var() ได้ จึงไม่ต้อง re-render เมื่อผู้ใช้สลับธีม
 *
 * สีซีรีส์คงความหมายเดิม (เขียว = ขึ้น/ชนะ · แดง = ลง/แพ้ · ส้ม = เฝ้าระวัง/เส้นรอง · เทา = baseline)
 * ธีมมืดใช้เฉดสว่างของ hue เดียวกัน (emerald-400, rose-400 …) ให้ contrast ≥ 3:1 บนการ์ดมืด
 */

import type { CSSProperties } from "react"

export const CHART = {
  /** ตัวเลขแกน / ป้ายแกน (ตัวอักษร ≥ 4.5:1 ทั้ง 2 ธีม) */
  axis: "var(--chart-axis)",
  grid: "var(--chart-grid)",
  /** เส้นอ้างอิง (y = 0, เกณฑ์) */
  ref: "var(--chart-ref)",
  /** พื้นไฮไลต์ใต้เมาส์ของกราฟแท่ง */
  cursor: "var(--chart-cursor)",
  /** ขอบจุดบนกราฟ (ให้จุดแยกจากกันเมื่อซ้อน) */
  dotRing: "var(--chart-dot-ring)",
  green: "var(--series-green)",
  rose: "var(--series-rose)",
  amber: "var(--series-amber)",
  blue: "var(--series-blue)",
  purple: "var(--series-purple)",
  magenta: "var(--series-magenta)",
  slate: "var(--series-slate)",
  muted: "var(--series-muted)",
  gold: "var(--series-gold)",
} as const

/** กล่อง tooltip ของ Recharts — พื้น popover + ขอบ border ตามธีม */
export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
  boxShadow: "var(--tooltip-shadow)",
}

export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: "var(--muted-foreground)" }

/** ตัวเลขแกนมาตรฐาน (ขนาด 10 / 11) */
export const AXIS_TICK = { fontSize: 10, fill: CHART.axis } as const
export const AXIS_TICK_11 = { fontSize: 11, fill: CHART.axis } as const
