"use client"

/**
 * useScrollFocusable — ทำให้กล่องที่ "เลื่อนได้จริง" โฟกัสด้วยคีย์บอร์ดได้ (WCAG 2.1.1 / axe scrollable-region-focusable)
 *
 * - คืน callback ref: ผูกกับกล่อง overflow-auto/scroll · วัดด้วย ResizeObserver (ตัวกล่อง + ลูกตัวแรก)
 * - เลื่อนได้ = ใส่ tabindex="0" (Tab ถึง แล้วใช้ลูกศรเลื่อน) · เลื่อนไม่ได้ = ถอดออก ไม่เพิ่ม tab stop ฟุ่มเฟือย
 * - label (ถ้ามี) = aria-label + role="region" ให้ screen reader บอกว่ากล่องนี้คืออะไร
 */

import { useCallback, useRef } from "react"

export function useScrollFocusable<T extends HTMLElement = HTMLDivElement>(label?: string): (el: T | null) => void {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback(
    (el: T | null) => {
      cleanup.current?.()
      cleanup.current = null
      if (!el || typeof window === "undefined") return
      const update = () => {
        const scrollable = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
        if (scrollable) {
          el.tabIndex = 0
          if (label) {
            el.setAttribute("role", "region")
            el.setAttribute("aria-label", label)
          }
        } else if (el.hasAttribute("tabindex")) {
          el.removeAttribute("tabindex")
          if (label) {
            el.removeAttribute("role")
            el.removeAttribute("aria-label")
          }
        }
      }
      update()
      if (typeof ResizeObserver === "undefined") return
      const ro = new ResizeObserver(update)
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
      cleanup.current = () => ro.disconnect()
    },
    [label],
  )
}
