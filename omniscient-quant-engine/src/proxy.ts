// ============================================================
// Proxy (Next 16 — เดิมชื่อ middleware.ts) — ด่านแรกของทุกคำขอ รวม /api/* ทั้ง `next dev` / standalone
// ตรรกะตัดสินทั้งหมดอยู่ใน src/lib/security/policy.ts (pure + มี unit test) — ไฟล์นี้แค่แปลงผลเป็น response
//
// ไม่มี env ใด ๆ (โหมด local): เปิด http://localhost:3000 ได้เหมือนเดิม · เครื่องอื่นได้ 403 พร้อมวิธีตั้งรหัสผ่าน
// ตั้ง OQE_AUTH_PASSWORD: ทุกหน้า/API ต้องส่ง HTTP Basic (browser ถามเอง) หรือ Bearer token (OQE_API_TOKEN)
// ============================================================

import { NextResponse, type NextRequest } from "next/server"
import { BASIC_CHALLENGE } from "@/lib/security/auth"
import { getSecurityConfig } from "@/lib/security/config"
import { localOnlyHtml, unauthorizedHtml } from "@/lib/security/messages"
import { sharedSecurityEvents } from "@/lib/security/events"
import { clientKey, isHttpsRequest } from "@/lib/security/net"
import { decideAccess } from "@/lib/security/policy"
import { sharedLimiter } from "@/lib/security/rate-limit"

export function proxy(request: NextRequest) {
  const sec = getSecurityConfig()
  const { pathname } = request.nextUrl
  const decision = decideAccess({
    method: request.method,
    pathname,
    headers: request.headers,
    config: sec,
    limiter: sharedLimiter(),
  })

  let res: NextResponse
  if (decision.kind === "allow") {
    res = NextResponse.next()
  } else {
    // 401 ครั้งแรกที่ยังไม่ส่งรหัส = ขั้นตอนปกติของ browser (challenge) ไม่ใช่เหตุการณ์ — log เฉพาะที่ส่งค่าผิด/ถูกจำกัด/ถูกกัน
    if (decision.code !== "unauthenticated") {
      sharedSecurityEvents().deny({ code: decision.code, status: decision.status, method: request.method, path: pathname, client: clientKey(request.headers) })
    }
    const headers: Record<string, string> = { "Cache-Control": "no-store" }
    if (decision.retryAfterSec !== undefined) headers["Retry-After"] = String(decision.retryAfterSec)
    if (decision.challenge) headers["WWW-Authenticate"] = BASIC_CHALLENGE
    if (!decision.api && decision.code === "local_only") {
      res = new NextResponse(localOnlyHtml(request.headers.get("host")), {
        status: decision.status,
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      })
    } else if (!decision.api && decision.status === 401) {
      res = new NextResponse(unauthorizedHtml(), {
        status: 401,
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      })
    } else {
      res = NextResponse.json({ error: decision.message, code: decision.code }, { status: decision.status, headers })
    }
  }

  // HSTS: เฉพาะเมื่อเปิด OQE_HSTS=1 และคำขอมาทาง https จริง (browser ไม่สนใจ HSTS ที่ส่งผ่าน http อยู่แล้ว)
  if (sec.hsts && isHttpsRequest(request.headers, request.url)) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000")
  }
  return res
}

export const config = {
  // ข้าม asset ของ Next / ไฟล์ใน public/ — ที่เหลือ (หน้าเว็บ + /api/*) ผ่าน proxy ทั้งหมด
  matcher: ["/((?!_next/|favicon\\.ico$|icon\\.svg$|logo\\.svg$|robots\\.txt$).*)"],
}
