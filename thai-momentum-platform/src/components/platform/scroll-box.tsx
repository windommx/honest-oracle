"use client"

/**
 * ScrollBox — กล่องเลื่อน (overflow) ที่โฟกัสด้วยคีย์บอร์ดได้เมื่อเลื่อนได้จริง
 * ใช้แทน <div className="overflow-…-auto"> สำหรับเนื้อหาที่ไม่มีปุ่ม/ลิงก์ข้างใน (ตาราง heatmap, รายการยาว, SVG กว้าง)
 * — WCAG 2.1.1: ผู้ใช้คีย์บอร์ดต้อง Tab ถึงแล้วใช้ลูกศรเลื่อนได้ (axe: scrollable-region-focusable)
 */

import type { ComponentProps } from "react"
import { useScrollFocusable } from "@/hooks/use-scroll-focusable"
import { cn } from "@/lib/utils"

export default function ScrollBox({
  label,
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  /** ชื่อกล่องสำหรับ screen reader (ใส่ role="region" ให้เมื่อเลื่อนได้) */
  label?: string
}) {
  const ref = useScrollFocusable<HTMLDivElement>(label)
  return (
    <div
      ref={ref}
      className={cn("rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring/70", className)}
      {...props}
    >
      {children}
    </div>
  )
}
