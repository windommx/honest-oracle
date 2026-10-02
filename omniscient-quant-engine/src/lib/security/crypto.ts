// ============================================================
// ชิ้นส่วน crypto ของชั้นความปลอดภัย — node:crypto ล้วน (ไม่มี dependency เพิ่ม)
// proxy ของ Next 16 รันบน Node.js runtime เป็นค่าเริ่มต้น → ใช้โมดูลนี้ร่วมกับ route handler ได้
// ============================================================

import { createHash, timingSafeEqual } from "node:crypto"

export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest()
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex")
}

/**
 * เทียบสตริงแบบเวลาคงที่ — hash ทั้งสองฝั่งก่อนให้ยาวเท่ากันเสมอ
 * (timingSafeEqual ต้องการความยาวเท่ากัน และการเช็กความยาวก่อนจะรั่วความยาวของความลับ)
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b))
}
