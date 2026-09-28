// ============================================================
// ตัวตัดสินสิทธิ์ของทุกคำขอ (pure) — src/proxy.ts แปลงผลเป็น NextResponse
//
// ลำดับ:
//  1. static asset → ผ่าน
//  2. /api/*: CSRF / cross-site guard (ทุกโหมด) → 403 / 415
//  3. /api/*: Authorization: Bearer <OQE_API_TOKEN> → admin (ผิด = 401 ทันที · เดาซ้ำ = 429)
//  4. โหมด local: loopback หรือ OQE_ALLOW_REMOTE_NOAUTH=1 → admin · อื่น ๆ → 403 พร้อมวิธีตั้งรหัสผ่าน
//     โหมด auth: Basic auth ถูกต้อง → admin · ผิด → 401 (+429 เมื่อเดาซ้ำ) · ไม่มี → public path ผ่าน / อื่น ๆ 401 + challenge
//  5. /api/* ที่หนัก/เรียก LLM: rate limit ต่อ client → 429 + Retry-After
// ============================================================

import { checkApiToken, checkPassword, parseBasic, parseBearer } from "./auth"
import type { SecurityConfig } from "./config"
import { checkCsrf } from "./csrf"
import { MSG } from "./messages"
import { clientKey, isLoopbackRequest, type HeaderGetter } from "./net"
import { isApiPath, isPublicPath, isStaticAssetPath } from "./paths"
import { AUTH_FAIL_GLOBAL_RATE, AUTH_FAIL_RATE, matchRateRule, type TokenBucketLimiter } from "./rate-limit"

export type Principal =
  | { role: "admin"; via: "basic" | "token" | "local" | "open" }
  | { role: null; via: "public" }

export type AccessDecision =
  | { kind: "allow"; principal: Principal }
  | {
      kind: "deny"
      status: 401 | 403 | 415 | 429
      code: string
      message: string
      /** true = ตอบ JSON (API) · false = หน้าเว็บ */
      api: boolean
      /** ใส่ WWW-Authenticate: Basic ให้ browser ถามรหัส */
      challenge?: boolean
      retryAfterSec?: number
    }

export interface AccessInput {
  method: string
  pathname: string
  headers: HeaderGetter
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
  extra: { challenge?: boolean; retryAfterSec?: number } = {},
): AccessDecision {
  return { kind: "deny", status, code, message, api, ...extra }
}

/** เดารหัส/token ซ้ำ ๆ → จำกัดต่อ IP + เพดานรวม (ค่าที่ถูกต้องไม่ผ่านถังนี้ — ผู้ถือรหัสจริงไม่โดนลูกหลง) */
function authFailLimited(input: AccessInput, now: number): number | null {
  if (!input.limiter) return null
  const perIp = input.limiter.take(`auth-fail|${clientKey(input.headers)}`, AUTH_FAIL_RATE, now)
  const global = perIp.ok ? input.limiter.take("auth-fail|*", AUTH_FAIL_GLOBAL_RATE, now) : perIp
  if (!perIp.ok || !global.ok) return Math.max(perIp.retryAfterSec, global.retryAfterSec)
  return null
}

export function decideAccess(input: AccessInput): AccessDecision {
  const method = input.method.toUpperCase()
  const { pathname, headers, config } = input
  const now = input.now ?? Date.now()

  if (isStaticAssetPath(pathname)) return { kind: "allow", principal: PUBLIC }

  const api = isApiPath(pathname)

  // ---------- 1) CSRF / cross-site (ทุกโหมด) ----------
  if (api) {
    const c = checkCsrf({ method, pathname, headers, allowedOrigins: config.allowedOrigins })
    if (!c.ok) return deny(c.status, c.code, c.message, true)
  }

  // ---------- 2) Bearer token ของสคริปต์ (เฉพาะ /api/*) ----------
  let principal: Principal | null = null
  const authorization = headers.get("authorization")
  if (api && config.apiToken) {
    const bearer = parseBearer(authorization)
    if (bearer !== null) {
      if (!checkApiToken(bearer, config.apiToken)) {
        const sec = authFailLimited(input, now)
        if (sec !== null) return deny(429, "rate_limited", MSG.authRateLimited(sec), true, { retryAfterSec: sec })
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
      const basic = parseBasic(authorization)
      if (basic) {
        if (!checkPassword(basic.password, config.password)) {
          const sec = authFailLimited(input, now)
          if (sec !== null) return deny(429, "rate_limited", MSG.authRateLimited(sec), api, { retryAfterSec: sec })
          return deny(401, "bad_password", MSG.badPassword, api, { challenge: true })
        }
        principal = { role: "admin", via: "basic" }
      }
    }
    if (!principal) {
      if (isPublicPath(pathname)) return { kind: "allow", principal: PUBLIC }
      return deny(401, "unauthenticated", MSG.unauthenticated, api, { challenge: true })
    }
  }

  // ---------- 4) rate limit งานหนัก / LLM ----------
  if (api && input.limiter) {
    const rule = matchRateRule(method, pathname)
    if (rule) {
      const r = input.limiter.take(`${rule.name}|${pathname}|${clientKey(headers)}`, rule.spec, now)
      if (!r.ok) return deny(429, "rate_limited", MSG.rateLimited(rule.label, r.retryAfterSec), true, { retryAfterSec: r.retryAfterSec })
    }
  }

  return { kind: "allow", principal }
}
