// ============================================================
// Proxy (Next 16 — เดิมชื่อ middleware.ts) — ด่านแรกของทุกคำขอ รวม /api/* ทั้ง `next dev` / `next start` / standalone
// ตรรกะตัดสินทั้งหมดอยู่ใน src/lib/security/policy.ts (pure + มี unit test) — ไฟล์นี้แค่แปลงผลเป็น response
//
// ไม่มี env ใด ๆ (โหมด local): เปิด http://localhost:3000 ได้เหมือนเดิม · เครื่องอื่นได้ 403 พร้อมวิธีตั้งรหัสผ่าน
// ตั้ง TMP_AUTH_PASSWORD: ทุกหน้า/API ต้องมี session (เข้าสู่ระบบที่ /login) หรือ Bearer token (TMP_API_TOKEN)
// ============================================================

import { NextResponse, type NextRequest } from "next/server"
import { getSecurityConfig } from "@/lib/security/config"
import { localOnlyHtml } from "@/lib/security/messages"
import { isHttpsRequest } from "@/lib/security/net"
import { decideAccess } from "@/lib/security/policy"
import { sharedLimiter } from "@/lib/security/rate-limit"
import { SESSION_COOKIE } from "@/lib/security/session"

export function proxy(request: NextRequest) {
  const sec = getSecurityConfig()
  const { pathname, search } = request.nextUrl
  const decision = decideAccess({
    method: request.method,
    pathname,
    search,
    headers: request.headers,
    sessionToken: request.cookies.get(SESSION_COOKIE)?.value ?? null,
    config: sec,
    limiter: sharedLimiter(),
  })

  let res: NextResponse
  if (decision.kind === "allow") {
    res = NextResponse.next()
  } else if (decision.kind === "redirect") {
    // Next แปลง Location เป็น path สัมพัทธ์เอง → ใช้ได้ทั้งผ่าน IP ใน LAN / โดเมนหลัง reverse proxy
    res = NextResponse.redirect(new URL(decision.location, request.url), 307)
  } else {
    const headers: Record<string, string> = { "Cache-Control": "no-store" }
    if (decision.retryAfterSec !== undefined) headers["Retry-After"] = String(decision.retryAfterSec)
    if (decision.status === 401 && decision.api) headers["WWW-Authenticate"] = 'Bearer realm="thai-momentum-platform"'
    if (!decision.api && decision.code === "local_only") {
      res = new NextResponse(localOnlyHtml(request.headers.get("host")), {
        status: decision.status,
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      })
    } else {
      res = NextResponse.json({ error: decision.message, code: decision.code }, { status: decision.status, headers })
    }
  }

  // HSTS: เฉพาะเมื่อเปิด TMP_HSTS=1 และคำขอมาทาง https จริง (browser ไม่สนใจ HSTS ที่ส่งผ่าน http อยู่แล้ว)
  if (sec.hsts && isHttpsRequest(request.headers, request.url)) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000")
  }
  return res
}

export const config = {
  // ข้าม asset ของ Next / ไฟล์ใน public/ / ไอคอน — ที่เหลือ (หน้าเว็บ + /api/*) ผ่าน proxy ทั้งหมด
  matcher: ["/((?!_next/|favicon\\.ico$|icon\\.svg$|logo\\.svg$|robots\\.txt$).*)"],
}
