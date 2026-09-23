// ============================================================
// ชิ้นส่วน crypto ของชั้นความปลอดภัย — node:crypto ล้วน (ไม่มี dependency เพิ่ม)
// proxy ของ Next 16 รันบน Node.js runtime เป็นค่าเริ่มต้น (ดู node_modules/next/dist/docs/.../proxy.md "Runtime")
// route handler ก็เป็น Node → ใช้โมดูลนี้ร่วมกันได้ทั้งสองฝั่ง
// ============================================================

import { createHash, createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto"

export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest()
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex")
}

export function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest()
}

export function toBase64Url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url")
}

/** ถอด base64url → Buffer · อักขระนอกชุด base64url = null (กัน Buffer.from ที่ข้ามอักขระแปลก ๆ แบบเงียบ) */
export function fromBase64Url(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  return Buffer.from(s, "base64url")
}

/**
 * เทียบสตริงแบบเวลาคงที่ — hash ทั้งสองฝั่งก่อนให้ยาวเท่ากันเสมอ
 * (timingSafeEqual ต้องการความยาวเท่ากัน และการเช็กความยาวก่อนจะรั่วความยาวของความลับ)
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b))
}

/** เทียบ Buffer ที่ยาวเท่ากันแบบเวลาคงที่ (ยาวไม่เท่า = false ทันที — ใช้กับ MAC ที่ความยาวคงที่ ไม่ใช่ความลับ) */
export function safeEqualBytes(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// คีย์ HMAC ที่อนุพันธ์จากรหัสผ่าน (กรณีไม่ได้ตั้ง TMP_AUTH_SECRET) — PBKDF2 ให้การเดารหัสผ่านจาก cookie ที่หลุดช้าลง
// คำนวณครั้งเดียวต่อรหัสผ่าน (≈ 50ms) แล้ว cache — proxy เรียกทุก request
const DERIVE_SALT = "thai-momentum-platform/auth-secret/v1"
const DERIVE_ITERATIONS = 120_000
const deriveCache = new Map<string, string>()

export function deriveSecretFromPassword(password: string): string {
  const key = sha256Hex(password)
  const hit = deriveCache.get(key)
  if (hit) return hit
  const out = pbkdf2Sync(password, DERIVE_SALT, DERIVE_ITERATIONS, 32, "sha256").toString("hex")
  deriveCache.set(key, out)
  return out
}
