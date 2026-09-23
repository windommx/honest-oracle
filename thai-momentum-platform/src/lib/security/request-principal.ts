// ============================================================
// ผู้เรียกของ route handler — ใช้ตัดสินว่า GET ที่คำนวณแล้ว "บันทึกผล" ลง DB ได้หรือไม่
//
// src/proxy.ts ตัดสินสิทธิ์เข้าถึงแล้วแต่ไม่ส่ง principal ต่อให้ route → อ่านซ้ำจาก Bearer / session cookie ที่นี่
// GET บางตัวบันทึก policy/ผลตรวจเมื่อเปิดแท็บ (/api/stops · /api/signals/ic · /api/verify) — ถ้าไม่กัน:
//  - ผู้ชม (อ่านอย่างเดียว) เปลี่ยน policy ที่ Jev ใช้ได้ เช่น GET /api/signals/ic?hold=60
//  - เว็บอื่นพา browser ของผู้ดูแลมาเปิดลิงก์ตรง (top-level navigation ผ่าน CSRF guard ได้) แล้วเขียน DB แทน
// → GET ยังคำนวณและตอบผลได้ตามสิทธิ์อ่าน แต่บันทึกเฉพาะผู้ดูแลที่เรียกจากหน้าเว็บนี้ (หรือสคริปต์) เท่านั้น
// ============================================================

import { randomBytes } from "node:crypto"
import { getSecurityConfig, type SecurityConfig } from "./config"
import { safeEqual } from "./crypto"
import { checkApiToken, parseBearer, SESSION_COOKIE, verifySession, type Role } from "./session"

// ---------- คำขอภายใน process (สคริปต์ CLI ที่ import route มาเรียกตรง ไม่ผ่าน HTTP/proxy) ----------
// token สุ่มต่อ process เก็บบน globalThis (bundle ของ route หลายตัวใช้ค่าเดียวกัน) — ไม่เคยส่งออกใน response
// ผู้เรียกผ่าน HTTP จึงเดาไม่ได้ ส่วนสคริปต์ใน process เดียวกันได้สิทธิ์ผู้ดูแลแม้เครื่องตั้ง TMP_AUTH_PASSWORD ไว้
export const INTERNAL_HEADER = "x-tmp-internal"
const holder = globalThis as unknown as { __tmpInternalToken?: string }
function internalToken(): string {
  return (holder.__tmpInternalToken ??= randomBytes(32).toString("hex"))
}

/** สร้าง Request สำหรับเรียก route handler ภายใน process (เช่น scripts/daily.ts) — ได้สิทธิ์ผู้ดูแล */
export function internalRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set(INTERNAL_HEADER, internalToken())
  return new Request(url, { ...init, headers })
}

function isInternal(req: Request): boolean {
  const v = req.headers.get(INTERNAL_HEADER)
  return v !== null && safeEqual(v, internalToken())
}

/** ค่า cookie ตามชื่อจาก header Cookie (ไม่ถอดรหัส % — token ของเราเป็น base64url) */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

/**
 * บทบาทของผู้เรียก: โหมด local = ผู้ดูแลเสมอ (proxy ปล่อยมาถึงได้เฉพาะ loopback / TMP_ALLOW_REMOTE_NOAUTH)
 * คำขอภายใน process (internalRequest) = ผู้ดูแล
 * โหมด auth = Bearer TMP_API_TOKEN → ผู้ดูแล · session cookie → ตามบทบาทใน token · อื่น ๆ → null
 */
export function requestRole(req: Request, config: SecurityConfig = getSecurityConfig()): Role | null {
  if (config.mode === "local" || isInternal(req)) return "admin"
  if (checkApiToken(parseBearer(req.headers.get("authorization")), config)) return "admin"
  return verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE), config)?.role ?? null
}

/**
 * GET ที่มีผลข้างเคียง (บันทึก policy / เติมผลตรวจ) ทำได้เมื่อ
 *  1. ไม่ได้มาจากเว็บอื่น: Sec-Fetch-Site ว่าง (สคริปต์/curl) · same-origin · none (พิมพ์ URL เอง)
 *  2. ผู้เรียกเป็นผู้ดูแล
 */
export function mayPersistOnGet(req: Request, config: SecurityConfig = getSecurityConfig()): boolean {
  const site = (req.headers.get("sec-fetch-site") ?? "").toLowerCase()
  if (site && site !== "same-origin" && site !== "none") return false
  return requestRole(req, config) === "admin"
}
