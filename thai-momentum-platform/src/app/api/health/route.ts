import { NextResponse } from "next/server"
import { collectHealth } from "./health"

export const dynamic = "force-dynamic"

// GET /api/health — สุขภาพระบบสำหรับ uptime monitor / Docker HEALTHCHECK / load balancer (proxy ยกเว้น auth ให้เส้นนี้)
// 200 = ให้บริการได้ (status ok | degraded — เช่นข้อมูลเก่า/ยังไม่มีข้อมูล) · 503 = DB ใช้งานไม่ได้ (status down)
// รายละเอียดฟิลด์/เกณฑ์: ./health.ts และ docs/ops.md
export async function GET() {
  try {
    const { httpStatus, report } = await collectHealth()
    return NextResponse.json(report, { status: httpStatus, headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (e) {
    // collectHealth ไม่ควร throw — ถ้าหลุดมาถึงนี่ถือว่าระบบใช้งานไม่ได้ (ไม่ส่งข้อความ error ดิบออกไป)
    console.error("[health] unexpected failure:", (e as Error)?.message ?? e)
    return NextResponse.json(
      { ok: false, status: "down", checks: [{ name: "health", ok: false, critical: true, detail: "ตรวจสุขภาพล้มเหลว" }] },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}
