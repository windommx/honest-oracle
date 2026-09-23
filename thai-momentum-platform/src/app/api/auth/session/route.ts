// GET /api/auth/session → สถานะการเข้าสู่ระบบของผู้เรียก (ใช้โดย SessionBadge บน header)
// { mode: "auth" | "local", authenticated, role, via, exp, viewerEnabled }

import { NextResponse, type NextRequest } from "next/server"
import { getSecurityConfig } from "@/lib/security/config"
import { checkApiToken, parseBearer, SESSION_COOKIE, verifySession, type Role } from "@/lib/security/session"

export const dynamic = "force-dynamic"

export interface SessionInfoResponse {
  mode: "auth" | "local"
  authenticated: boolean
  role: Role | null
  via: "session" | "token" | "local" | null
  /** วินาที epoch ที่ session หมดอายุ (null = ไม่ใช่ session cookie) */
  exp: number | null
  viewerEnabled: boolean
}

export async function GET(req: NextRequest) {
  const cfg = getSecurityConfig()
  let info: SessionInfoResponse
  if (cfg.mode === "local") {
    // proxy ปล่อยมาถึงนี่ได้เฉพาะ loopback (หรือ TMP_ALLOW_REMOTE_NOAUTH) → สิทธิ์เต็มแบบเดิม
    info = { mode: "local", authenticated: true, role: "admin", via: "local", exp: null, viewerEnabled: false }
  } else if (checkApiToken(parseBearer(req.headers.get("authorization")), cfg)) {
    info = { mode: "auth", authenticated: true, role: "admin", via: "token", exp: null, viewerEnabled: !!cfg.viewerPassword }
  } else {
    const claims = verifySession(req.cookies.get(SESSION_COOKIE)?.value, cfg)
    info = {
      mode: "auth",
      authenticated: !!claims,
      role: claims?.role ?? null,
      via: claims ? "session" : null,
      exp: claims?.exp ?? null,
      viewerEnabled: !!cfg.viewerPassword,
    }
  }
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } })
}
