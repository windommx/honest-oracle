// POST /api/auth/logout → ลบ session cookie (token แบบ stateless: เพิกถอนทุก session ได้ด้วยการหมุน TMP_AUTH_SECRET)

import { NextResponse, type NextRequest } from "next/server"
import { emitEvent } from "@/lib/research/events"
import { getSecurityConfig } from "@/lib/security/config"
import { isHttpsRequest } from "@/lib/security/net"
import { SESSION_COOKIE, sessionCookieOptions, verifySession } from "@/lib/security/session"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const cfg = getSecurityConfig()
  const claims = cfg.mode === "auth" ? verifySession(req.cookies.get(SESSION_COOKIE)?.value, cfg) : null
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(isHttpsRequest(req.headers, req.url), 0))
  if (claims) await emitEvent("auth", claims.role, { action: "logout", role: claims.role })
  return res
}
