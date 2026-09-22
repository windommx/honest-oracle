"use client"

/**
 * useHotkeys — คีย์ลัดระดับหน้า (Super Options)
 *
 * กติกา (ลงทะเบียนล่วงหน้า):
 * - ทำงานเฉพาะปุ่มเดี่ยว — กดคู่กับ ⌘/Ctrl/Alt = ปล่อยผ่าน (ให้ ⌘K ของ palette ทำงานสบาย)
 * - โฟกัสอยู่ใน input/textarea/select/contenteditable = ไม่ทำงาน (พิมพ์หาได้ปกติ)
 * - map เก็บใน ref — hook ไม่ผูก listener ใหม่ทุก render
 * - enabled = false (เช่น เปิด Options Center อยู่) = ปิดทั้งชุด กันคีย์ทะลุ overlay
 */

import { useEffect, useRef } from "react"

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const mapRef = useRef<HotkeyMap>(map)

  // sync map ใน effect เท่านั้น — ห้ามเขียน ref ระหว่าง render (react-hooks/refs)
  useEffect(() => {
    mapRef.current = map
  }, [map])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      const fn = mapRef.current[e.key.toLowerCase()]
      if (!fn) return
      fn(e)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled])
}
