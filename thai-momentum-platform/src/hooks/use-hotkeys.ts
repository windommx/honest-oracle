"use client"

/**
 * useHotkeys — คีย์ลัดระดับหน้า (Super Options)
 *
 * กติกา (ลงทะเบียนล่วงหน้า):
 * - ทำงานเฉพาะปุ่มเดี่ยว — กดคู่กับ ⌘/Ctrl/Alt = ปล่อยผ่าน (ให้ ⌘K ของ palette ทำงานสบาย)
 * - โฟกัสอยู่ใน input/textarea/select/contenteditable = ไม่ทำงาน (พิมพ์หาได้ปกติ)
 * - โฟกัสอยู่ใน dialog/sheet/เมนูที่เปิดอยู่ = ไม่ทำงาน (กันคีย์ทะลุ overlay) — ตัดสินใน hotkeyOf
 * - map เก็บใน ref — hook ไม่ผูก listener ใหม่ทุก render
 * - enabled = false (เช่น เปิด Options Center อยู่) = ปิดทั้งชุด กันคีย์ทะลุ overlay
 */

import { useEffect, useRef } from "react"
import { hotkeyOf } from "@/lib/platform/hotkeys"

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>

export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const mapRef = useRef<HotkeyMap>(map)

  // sync map ใน effect เท่านั้น — ห้ามเขียน ref ระหว่าง render (react-hooks/refs)
  useEffect(() => {
    mapRef.current = map
  }, [map])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const key = hotkeyOf(e)
      if (key === null) return
      const fn = mapRef.current[key]
      if (!fn) return
      fn(e)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled])
}
