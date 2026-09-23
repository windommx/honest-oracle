/**
 * ตัดสินว่า keydown หนึ่งครั้งเป็นคีย์ลัดของหน้าหรือไม่ — pure/duck-typed (ทดสอบได้โดยไม่ต้องมี DOM)
 *
 * กติกา (ลงทะเบียนล่วงหน้า — ตรงกับ useHotkeys):
 * - กดคู่ ⌘/Ctrl/Alt = ปล่อยผ่าน (⌘K ของ palette, ⌘B ของ sidebar)
 * - โฟกัสอยู่ใน input/textarea/select/contenteditable = ไม่ทำงาน (กำลังพิมพ์)
 * - โฟกัสอยู่ใน overlay ที่เปิดอยู่ (dialog/sheet/เมนู dropdown) = ไม่ทำงาน — กันคีย์ทะลุ overlay
 *   (Radix ย้ายโฟกัสเข้า overlay เสมอ เช่น Command Palette, เมนูพรีเซ็ตด่วน, Sheet เมนูมือถือ)
 */

export interface HotkeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  target: EventTarget | null
}

export const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"]'

interface ElementLike {
  tagName?: unknown
  isContentEditable?: unknown
  closest?: (selector: string) => unknown
}

/** คืนชื่อคีย์ตัวพิมพ์เล็กที่ควรส่งให้ map คีย์ลัด · null = ไม่ใช่คีย์ลัด (ปล่อยผ่าน) */
export function hotkeyOf(e: HotkeyEventLike): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (typeof e.key !== "string" || e.key === "") return null
  const t = e.target as ElementLike | null
  if (t && typeof t.tagName === "string") {
    const tag = t.tagName.toUpperCase()
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable === true) return null
    if (typeof t.closest === "function" && t.closest(OVERLAY_SELECTOR)) return null
  }
  return e.key.toLowerCase()
}
