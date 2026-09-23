// ============================================================
// Session token แบบ stateless — HMAC-SHA256 ลงนาม payload {role, iat, exp}
// รูปแบบ: v1.<payload base64url>.<mac base64url>
//
// คีย์ลงนามแยกตามบทบาทและผูกกับรหัสผ่านของบทบาทนั้น:
//   key(role) = HMAC(secret, "tmp-session/v1|" + role + "|" + sha256(รหัสผ่านของ role))
// → เปลี่ยน TMP_AUTH_PASSWORD = session ผู้ดูแลเดิมใช้ไม่ได้ทันที · ลบ TMP_VIEWER_PASSWORD = session ผู้ชมตายทั้งหมด
// → หมุน TMP_AUTH_SECRET = ออกจากระบบทุกคน (วิธีเพิกถอน session ทั้งหมด)
// ============================================================

import type { SecurityConfig } from "./config"
import { fromBase64Url, hmacSha256, safeEqual, safeEqualBytes, sha256Hex, toBase64Url } from "./crypto"

export type Role = "admin" | "viewer"

export const SESSION_COOKIE = "tmp_session"
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60 // 7 วัน
const VERSION = "v1"
const CLOCK_SKEW_SEC = 60

export interface SessionClaims {
  role: Role
  iat: number // วินาที (epoch)
  exp: number
}

type KeyConfig = Pick<SecurityConfig, "secret" | "adminPassword" | "viewerPassword">

function passwordFor(role: Role, cfg: KeyConfig): string | null {
  return role === "admin" ? cfg.adminPassword : cfg.viewerPassword
}

function signingKey(role: Role, cfg: KeyConfig): Buffer | null {
  const pw = passwordFor(role, cfg)
  if (!cfg.secret || !pw) return null
  return hmacSha256(cfg.secret, `tmp-session/${VERSION}|${role}|${sha256Hex(pw)}`)
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

export function signSession(claims: SessionClaims, cfg: KeyConfig): string | null {
  const key = signingKey(claims.role, cfg)
  if (!key) return null
  const body = toBase64Url(JSON.stringify({ r: claims.role, iat: claims.iat, exp: claims.exp }))
  const mac = toBase64Url(hmacSha256(key, `${VERSION}.${body}`))
  return `${VERSION}.${body}.${mac}`
}

export function issueSession(role: Role, cfg: KeyConfig, now = nowSec()): { token: string; claims: SessionClaims } | null {
  const claims: SessionClaims = { role, iat: now, exp: now + SESSION_TTL_SEC }
  const token = signSession(claims, cfg)
  return token ? { token, claims } : null
}

/** ตรวจ token → claims หรือ null (ลายเซ็นผิด/หมดอายุ/รูปแบบผิด/บทบาทถูกปิด) — ไม่ throw */
export function verifySession(token: string | null | undefined, cfg: KeyConfig, now = nowSec()): SessionClaims | null {
  if (!token || token.length > 1024) return null
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  const [, body, mac] = parts
  const raw = fromBase64Url(body)
  const macBytes = fromBase64Url(mac)
  if (!raw || !macBytes) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString("utf8"))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const { r, iat, exp } = parsed as { r?: unknown; iat?: unknown; exp?: unknown }
  if (r !== "admin" && r !== "viewer") return null
  if (typeof iat !== "number" || typeof exp !== "number" || !Number.isInteger(iat) || !Number.isInteger(exp)) return null
  const key = signingKey(r, cfg)
  if (!key) return null // บทบาทนี้ถูกปิด (เช่น ลบรหัสผู้ชม) หรือโหมด local
  const expected = hmacSha256(key, `${VERSION}.${body}`)
  if (!safeEqualBytes(expected, macBytes)) return null
  if (exp <= now) return null // หมดอายุ
  if (iat > now + CLOCK_SKEW_SEC) return null // ออกในอนาคต
  if (exp - iat > SESSION_TTL_SEC) return null // อายุยาวเกินนโยบาย
  return { role: r, iat, exp }
}

/** ตรวจรหัสผ่าน → บทบาท · เทียบทั้งสองรหัสทุกครั้ง (เวลาไม่รั่วว่าตรงบทบาทไหน) */
export function checkPassword(input: unknown, cfg: Pick<SecurityConfig, "adminPassword" | "viewerPassword">): Role | null {
  if (typeof input !== "string" || !cfg.adminPassword) return null
  const pw = input.trim()
  if (!pw || pw.length > 512) return null
  const isAdmin = safeEqual(pw, cfg.adminPassword)
  const isViewer = cfg.viewerPassword ? safeEqual(pw, cfg.viewerPassword) : false
  if (isAdmin) return "admin"
  if (isViewer) return "viewer"
  return null
}

/** Authorization: Bearer <token> → true ถ้าตรง TMP_API_TOKEN (เทียบเวลาคงที่) */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return m ? m[1] : null
}

export function checkApiToken(token: string | null, cfg: Pick<SecurityConfig, "apiToken">): boolean {
  if (!token || !cfg.apiToken) return false
  return safeEqual(token, cfg.apiToken)
}

export interface SessionCookieOptions {
  httpOnly: true
  sameSite: "lax"
  secure: boolean
  path: "/"
  maxAge: number
}

/** ตัวเลือก cookie มาตรฐาน — Secure เฉพาะเมื่อคำขอมาทาง https (localhost แบบ http ต้องใช้ได้) */
export function sessionCookieOptions(secure: boolean, maxAge = SESSION_TTL_SEC): SessionCookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge }
}

export const ROLE_LABEL_TH: Record<Role, string> = {
  admin: "ผู้ดูแลระบบ",
  viewer: "ผู้ชม (อ่านอย่างเดียว)",
}
