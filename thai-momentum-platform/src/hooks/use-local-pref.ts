"use client"

/**
 * useLocalPref — ค่าตั้งค่าเล็ก ๆ ของผู้ใช้ที่จำใน localStorage (โหมด Simple/Pro, คู่มือเริ่มต้น ฯลฯ)
 *
 * - useSyncExternalStore: server render ใช้ค่า `serverValue` → client สลับเป็นค่าจริงหลัง hydrate
 *   โดยไม่เกิด hydration mismatch และทุกคอมโพเนนต์ที่อ่าน key เดียวกันอัปเดตพร้อมกัน
 * - ทุกการอ่าน/เขียน localStorage ครอบ try/catch (โหมดส่วนตัว / บล็อก storage / quota เต็ม = ใช้ค่าในหน่วยความจำ)
 * - ซิงก์ข้ามแท็บด้วย event "storage"
 */

import { useCallback, useSyncExternalStore } from "react"

type Listener = () => void

const listeners = new Map<string, Set<Listener>>()
/** ค่าสำรองในหน่วยความจำ — ใช้เมื่อ localStorage เขียนไม่ได้ (ยังสลับค่าได้ในรอบการใช้งานนี้) */
const memory = new Map<string, string | null>()

export function readPref(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string | null): void {
  memory.set(key, value)
  if (typeof window !== "undefined") {
    try {
      if (value === null) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, value)
      // เขียนสำเร็จ = ให้ localStorage เป็นความจริงหนึ่งเดียว (แท็บอื่นเปลี่ยนค่าได้)
      memory.delete(key)
    } catch {
      /* เก็บในหน่วยความจำแทน — ไม่บล็อก UI */
    }
  }
  listeners.get(key)?.forEach((l) => l())
}

function subscribe(key: string, cb: Listener): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) cb()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    set?.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

/**
 * @param key       key ใน localStorage
 * @param allowed   ค่าที่ยอมรับ (ค่าเสีย/ไม่รู้จัก = fallback)
 * @param fallback  ค่าเมื่อยังไม่เคยตั้ง
 * @param serverValue ค่าระหว่าง SSR/hydration (ค่าเริ่มต้น = fallback)
 */
export function useLocalPref<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  serverValue: T = fallback,
): [T, (v: T) => void] {
  const sub = useCallback((cb: Listener) => subscribe(key, cb), [key])
  const snap = useCallback(() => {
    const raw = readPref(key)
    return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
  }, [key, allowed, fallback])
  const value = useSyncExternalStore(sub, snap, () => serverValue)
  const set = useCallback((v: T) => writePref(key, v), [key])
  return [value, set]
}
