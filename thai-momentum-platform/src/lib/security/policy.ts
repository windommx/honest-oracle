// ============================================================
// ตัวตัดสินสิทธิ์ของทุกคำขอ (pure) — src/proxy.ts แปลงผลเป็น NextResponse
//
// ลำดับ:
//  1. static asset → ผ่าน
//  2. /api/*: CSRF / cross-site guard (ทุกโหมด) → 403 / 415
//  3. /api/*: Authorization: Bearer <TMP_API_TOKEN> → admin (ผิด = 401 ทันที ไม่ตกไปใช้ cookie · เดาซ้ำ = 429)
//  4. โหมด local: loopback หรือ TMP_ALLOW_REMOTE_NOAUTH=1 → admin · อื่น ๆ → 403 พร้อมวิธีตั้งรหัสผ่าน
//     โหมด auth: session cookie → admin/viewer · ไม่มี → public path ผ่าน / หน้าเว็บ redirect /login / API 401
//     viewer + POST/PUT/PATCH/DELETE → 403 (ยกเว้น /api/auth/* เช่น logout)
//  5. /api/* ที่หนัก: rate limit ต่อ client → 429 + Retry-After
// ============================================================

import type { SecurityConfig } from "./config"
import { checkCsrf, isMutationMethod } from "./csrf"
import { MSG } from "./messages"
import { clientKey, isLoopbackRequest, type HeaderGetter } from "./net"
import { isApiPath, isPublicPath, isStaticAssetPath } from "./paths"
import { LOGIN_GLOBAL_RATE, LOGIN_RATE, matchRateRule, type TokenBucketLimiter } from "./rate-limit"
import { checkApiToken, parseBearer, verifySession, type Role } from "./session"

export type Principal =
  | { role: Role; via: "session" }
  | { role: "admin"; via: "token" | "local" | "open" }
  | { role: null; via: "public" }

export type AccessDecision =
  | { kind: "allow"; principal: Principal }
  | { kind: "redirect"; location: string }
  | {
      kind: "deny"
      status: 401 | 403 | 415 | 429
      code: string
      message: string
      /** true = ตอบ JSON (API) · false = หน้าเว็บ */
      api: boolean
      retryAfterSec?: number
    }

export interface AccessInput {
  method: string
  pathname: string
  /** query string รวม "?" (ใช้สร้าง ?next= ตอน redirect ไป /login) */
  search?: string
  headers: HeaderGetter
  sessionToken?: string | null
  config: SecurityConfig
  /** เวลาปัจจุบัน (ms) — test ส่งเองได้ */
  now?: number
  limiter?: TokenBucketLimiter | null
}

const PUBLIC: Principal = { role: null, via: "public" }

function deny(
  status: 401 | 403 | 415 | 429,
  code: string,
  message: string,
  api: boolean,
  retryAfterSec?: number,
): AccessDecision {
  return retryAfterSec === undefined
    ? { kind: "deny", status, code, message, api }
    : { kind: "deny", status, code, message, api, retryAfterSec }
}

/** ?next= สำหรับหน้า login — ตัดพารามิเตอร์ภายในของ RSC (_rsc) ออก */
function nextParam(pathname: string, search: string | undefined): string {
  const qs = new URLSearchParams(search ?? "")
  qs.delete("_rsc")
  const q = qs.toString()
  return pathname + (q ? `?${q}` : "")
}

export function decideAccess(input: AccessInput): AccessDecision {
  const method = input.method.toUpperCase()
  const { pathname, headers, config } = input
  const now = input.now ?? Date.now()

  if (isStaticAssetPath(pathname)) return { kind: "allow", principal: PUBLIC }

  const api = isApiPath(pathname)
  const mutation = isMutationMethod(method)

  // ---------- 1) CSRF / cross-site (ทุกโหมด) ----------
  if (api) {
    const c = checkCsrf({ method, pathname, headers, allowedOrigins: config.allowedOrigins })
    if (!c.ok) return deny(c.status, c.code, c.message, true)
  }

  // ---------- 2) Bearer token ของสคริปต์ (เฉพาะ /api/*) ----------
  let principal: Principal | null = null
  if (api && config.apiToken) {
    const bearer = parseBearer(headers.get("authorization"))
    if (bearer !== null) {
      if (!checkApiToken(bearer, config)) {
        // เดา token ซ้ำ ๆ = จำกัดเหมือนการเดารหัสผ่าน (token ที่ถูกต้องไม่ผ่านถังนี้ — ผู้ถือ token จริงไม่โดนลูกหลง)
        if (input.limiter) {
          const perIp = input.limiter.take(`bad-token|${clientKey(headers)}`, LOGIN_RATE, now)
          const global = perIp.ok ? input.limiter.take("bad-token|*", LOGIN_GLOBAL_RATE, now) : perIp
          if (!perIp.ok || !global.ok) {
            const sec = Math.max(perIp.retryAfterSec, global.retryAfterSec)
            return deny(429, "rate_limited", MSG.loginRateLimited(sec), true, sec)
          }
        }
        return deny(401, "bad_token", MSG.badToken, true)
      }
      principal = { role: "admin", via: "token" }
    }
  }

  // ---------- 3) โหมด ----------
  if (config.mode === "local") {
    if (!principal) {
      if (config.allowRemoteNoAuth) principal = { role: "admin", via: "open" }
      else if (isLoopbackRequest(headers)) principal = { role: "admin", via: "local" }
      else return deny(403, "local_only", MSG.localOnly, api)
    }
  } else {
    if (!principal) {
      const claims = verifySession(input.sessionToken, config, Math.floor(now / 1000))
      if (claims) principal = { role: claims.role, via: "session" }
    }
    if (!principal) {
      if (isPublicPath(pathname)) return { kind: "allow", principal: PUBLIC }
      if (api || (method !== "GET" && method !== "HEAD")) return deny(401, "unauthenticated", MSG.unauthenticated, api)
      return { kind: "redirect", location: `/login?next=${encodeURIComponent(nextParam(pathname, input.search))}` }
    }
    if (principal.role === "viewer" && mutation && !isPublicPath(pathname)) {
      return deny(403, "read_only", MSG.viewerReadOnly, api)
    }
  }

  // ---------- 4) rate limit งานหนัก ----------
  if (api && input.limiter) {
    const rule = matchRateRule(method, pathname)
    if (rule) {
      const r = input.limiter.take(`${rule.name}|${pathname}|${clientKey(headers)}`, rule.spec, now)
      if (!r.ok) return deny(429, "rate_limited", MSG.rateLimited(rule.label, r.retryAfterSec), true, r.retryAfterSec)
    }
  }

  return { kind: "allow", principal }
}
