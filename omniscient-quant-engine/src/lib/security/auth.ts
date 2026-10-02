// ============================================================
// การยืนยันตัวตน 2 ทางของโหมด auth (ตั้ง OQE_AUTH_PASSWORD)
//   - HTTP Basic (browser ถามรหัสเองเมื่อได้ 401 + WWW-Authenticate) — ชื่อผู้ใช้ใส่อะไรก็ได้ ตรวจเฉพาะรหัสผ่าน
//   - Bearer <OQE_API_TOKEN> สำหรับสคริปต์/cron/monitor (เฉพาะ /api/*)
// ทุกการเทียบเป็นเวลาคงที่ (safeEqual) · ไม่มี session/cookie → ไม่มี state ฝั่ง server ให้หลุด
// ============================================================

import { safeEqual } from "./crypto"

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return m ? m[1] : null
}

/** Authorization: Basic base64(user:password) → { user, password } · รูปแบบเสีย = null */
export function parseBasic(header: string | null | undefined): { user: string; password: string } | null {
  if (!header) return null
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header)
  if (!m) return null
  let decoded: string
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8")
  } catch {
    return null
  }
  const sep = decoded.indexOf(":")
  if (sep < 0) return null
  return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
}

export function checkPassword(candidate: string | null | undefined, expected: string | null): boolean {
  if (!candidate || !expected) return false
  return safeEqual(candidate, expected)
}

export function checkApiToken(token: string | null | undefined, expected: string | null): boolean {
  if (!token || !expected) return false
  return safeEqual(token, expected)
}

export const BASIC_CHALLENGE = 'Basic realm="Omniscient Quant Engine", charset="UTF-8"'
