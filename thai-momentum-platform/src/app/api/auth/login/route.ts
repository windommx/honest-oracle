// POST /api/auth/login  { password, next? } → ตั้ง session cookie (HttpOnly · SameSite=Lax · Secure เมื่อ https · 7 วัน)
// ข้อความผิดพลาดกลาง ๆ ("รหัสผ่านไม่ถูกต้อง") ไม่บอกว่าผิดบทบาทไหน · จำกัด 5 ครั้ง/นาที/IP + 30 ครั้ง/นาทีรวม

import { NextResponse } from "next/server"
import { emitEvent } from "@/lib/research/events"
import { getSecurityConfig } from "@/lib/security/config"
import { MSG } from "@/lib/security/messages"
import { clientKey, isHttpsRequest } from "@/lib/security/net"
import { safeNextPath } from "@/lib/security/paths"
import { LOGIN_GLOBAL_RATE, LOGIN_RATE, sharedLimiter } from "@/lib/security/rate-limit"
import { checkPassword, issueSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/security/session"

export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(req: Request) {
  const cfg = getSecurityConfig()
  if (cfg.mode !== "auth") {
    return NextResponse.json({ error: MSG.localModeLogin, mode: "local" }, { status: 400, headers: NO_STORE })
  }

  const limiter = sharedLimiter()
  const ip = clientKey(req.headers)
  const perIp = limiter.take(`login|${ip}`, LOGIN_RATE)
  const global = perIp.ok ? limiter.take("login|*", LOGIN_GLOBAL_RATE) : perIp
  if (!perIp.ok || !global.ok) {
    const sec = Math.max(perIp.retryAfterSec, global.retryAfterSec)
    return NextResponse.json(
      { error: MSG.loginRateLimited(sec), code: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(sec) } },
    )
  }

  const parsed: unknown = await req.json().catch(() => null)
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as { password?: unknown; next?: unknown }
  const role = checkPassword(body.password, cfg)
  if (!role) {
    console.warn(`[auth] เข้าสู่ระบบไม่สำเร็จ ip=${ip}`)
    return NextResponse.json({ error: MSG.badPassword, code: "bad_password" }, { status: 401, headers: NO_STORE })
  }
  const issued = issueSession(role, cfg)
  if (!issued) return NextResponse.json({ error: "ออก session ไม่สำเร็จ", code: "session_error" }, { status: 500, headers: NO_STORE })

  const res = NextResponse.json(
    { ok: true, role, exp: issued.claims.exp, next: safeNextPath(body.next) },
    { headers: NO_STORE },
  )
  res.cookies.set(SESSION_COOKIE, issued.token, sessionCookieOptions(isHttpsRequest(req.headers, req.url)))
  console.info(`[auth] เข้าสู่ระบบ role=${role} ip=${ip}`)
  // audit trail (hash chain) — ไม่เก็บ IP ลง log ถาวร (PDPA: เก็บเท่าที่จำเป็น)
  await emitEvent("auth", role, { action: "login", role })
  return res
}
