// ============================================================
// CSRF / cross-site guard ของ /api/* — ใช้ทั้งโหมด auth และ local
//
// ปัญหาเดิม: route เรียก req.json() โดยไม่ดู Content-Type → หน้าเว็บใดก็ได้ส่ง "simple request"
// (form POST / fetch no-cors แบบ text/plain) มาที่ http://localhost:3000/api/seed ของผู้ใช้แล้วล้างข้อมูลได้
//
// กติกา (คำขอแก้ไขข้อมูล POST/PUT/PATCH/DELETE):
//  1. Sec-Fetch-Site มีค่าและไม่ใช่ same-origin/none → ปฏิเสธ
//  2. Origin มีค่า (รวม "null") และไม่ตรง Host / X-Forwarded-Host / TMP_ALLOWED_ORIGINS → ปฏิเสธ
//     ไม่มี Origin แต่มี Referer ที่ต่าง origin → ปฏิเสธ
//  3. มี body แต่ Content-Type ไม่ใช่ application/json → 415 (ไม่มี route ไหนรับ multipart)
//     คำขอไม่มี body และไม่มี Content-Type (เช่น DELETE /api/gtaa/data จาก UI) → ผ่าน
//  client ที่ไม่ใช่ browser (curl/สคริปต์) ไม่มี Origin → ผ่านข้อ 2 ได้ (browser ถูกหลอกให้ส่งแบบนั้นไม่ได้)
// คำขออ่าน (GET/HEAD) ของ /api/*: ปฏิเสธ sub-resource ข้ามไซต์ (<img>/<script> จากเว็บอื่น) — กันการยิง
//  endpoint หนัก ๆ ข้ามไซต์ · การเปิดลิงก์ตรง (navigate) ยังผ่าน
// ============================================================

import type { HeaderGetter } from "./net"
import { splitHostPort } from "./net"

export type CsrfResult =
  | { ok: true }
  | { ok: false; status: 403 | 415; code: "cross_site" | "bad_origin" | "bad_content_type"; message: string }

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

export function isMutationMethod(method: string): boolean {
  return MUTATING.has(method.toUpperCase())
}

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : "80"
}

/** origin (scheme://host:port) ตรงกับค่า Host header หรือไม่ — Host ไม่มี port = รับ 80/443 */
export function originMatchesHost(origin: URL, hostHeader: string | null | undefined): boolean {
  const h = splitHostPort(hostHeader)
  if (!h) return false
  const oHost = origin.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (oHost !== h.hostname) return false
  const oPort = origin.port || defaultPort(origin.protocol)
  if (h.port) return oPort === h.port
  return oPort === "80" || oPort === "443"
}

/** origin ที่ยอมรับ: Host, X-Forwarded-Host (ทุกค่า), หรืออยู่ใน allowlist (TMP_ALLOWED_ORIGINS) */
export function isAllowedOrigin(value: string, headers: HeaderGetter, allowedOrigins: readonly string[] = []): boolean {
  let u: URL
  try {
    u = new URL(value)
  } catch {
    return false // รวม "null" (sandboxed iframe / data: URL)
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false
  if (allowedOrigins.includes(u.origin)) return true
  if (originMatchesHost(u, headers.get("host"))) return true
  const xfh = headers.get("x-forwarded-host")
  if (xfh) return xfh.split(",").some((part) => originMatchesHost(u, part.trim()))
  return false
}

const MSG_CROSS_SITE =
  "ปฏิเสธคำขอข้ามไซต์ — การแก้ไขข้อมูลต้องมาจากหน้าเว็บของแพลตฟอร์มนี้เท่านั้น (ป้องกัน CSRF)"
const MSG_CONTENT_TYPE =
  'ต้องส่งข้อมูลเป็น JSON พร้อม header "Content-Type: application/json" (เช่น curl -H "Content-Type: application/json" -d @body.json)'

export function checkCsrf(input: {
  method: string
  pathname: string
  headers: HeaderGetter
  allowedOrigins?: readonly string[]
}): CsrfResult {
  const { headers } = input
  const method = input.method.toUpperCase()
  const site = (headers.get("sec-fetch-site") ?? "").toLowerCase()

  if (!isMutationMethod(method)) {
    const mode = (headers.get("sec-fetch-mode") ?? "").toLowerCase()
    if (site === "cross-site" && mode !== "navigate") {
      return { ok: false, status: 403, code: "cross_site", message: MSG_CROSS_SITE }
    }
    return { ok: true }
  }

  // 1) Fetch Metadata — browser สมัยใหม่ส่งเสมอ (ปลอมจากหน้าเว็บไม่ได้)
  if (site && site !== "same-origin" && site !== "none") {
    return { ok: false, status: 403, code: "cross_site", message: MSG_CROSS_SITE }
  }

  // 2) Origin / Referer
  const origin = headers.get("origin")
  if (origin !== null) {
    if (!isAllowedOrigin(origin, headers, input.allowedOrigins)) {
      return { ok: false, status: 403, code: "bad_origin", message: MSG_CROSS_SITE }
    }
  } else {
    const referer = headers.get("referer")
    if (referer) {
      let refOrigin: string | null = null
      try {
        refOrigin = new URL(referer).origin
      } catch {
        refOrigin = null
      }
      if (!refOrigin || !isAllowedOrigin(refOrigin, headers, input.allowedOrigins)) {
        return { ok: false, status: 403, code: "bad_origin", message: MSG_CROSS_SITE }
      }
    }
  }

  // 3) Content-Type — simple request จากหน้าเว็บอื่นส่งได้แค่ text/plain, form-urlencoded, multipart
  const ct = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  const len = headers.get("content-length")
  const hasBody = (len !== null && len.trim() !== "" && len.trim() !== "0") || headers.get("transfer-encoding") !== null
  if (ct === "") {
    if (hasBody) return { ok: false, status: 415, code: "bad_content_type", message: MSG_CONTENT_TYPE }
  } else if (ct !== "application/json") {
    return { ok: false, status: 415, code: "bad_content_type", message: MSG_CONTENT_TYPE }
  }
  return { ok: true }
}
