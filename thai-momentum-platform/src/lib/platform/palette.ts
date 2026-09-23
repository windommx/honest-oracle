/**
 * ตัวกรองของ Command Palette (cmdk) — ค่าเดิมของ cmdk ให้คะแนนเท่ากัน 0.99 กับทุกรายการที่ "ขึ้นต้น" ด้วยคำค้น
 * แล้วคงลำดับตาม DOM → พิมพ์ "สัญญาณ" + Enter ได้ "สัญญาณเรือธง (Flagship 1–10)" ที่อยู่ก่อนแท็บ "สัญญาณ"
 *
 * กติกา: value ของรายการ = ป้ายชื่อแท็บ (keywords = รหัสแท็บ/ชื่อกลุ่ม) · ป้ายตรงคำค้นทั้งคำ = อันดับ 1 เสมอ
 * นอกนั้นใช้คะแนน cmdk เดิม (เพดาน 0.99 ให้ต่ำกว่าป้ายที่ตรงเป๊ะ)
 */

import { defaultFilter } from "cmdk"

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase()

export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const q = norm(search)
  if (q && norm(value) === q) return 1
  return Math.min(0.99, defaultFilter(value, search, keywords))
}
