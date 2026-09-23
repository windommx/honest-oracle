// GET /api/sniper — รายงาน SET Sniper ทั้งชุด
// ประกอบจาก: briefing (regime + GTAA + market) · circuit breaker · sector rotation ·
//            cross-asset lead-lag · confluence 3 ชั้น (Location × Value × Behavior) · structure feed
// ทุกชั้นคำนวณสดจาก RawDaily (OHLC + มูลค่าซื้อขาย) — cache ตาม sniperKey (dataKey ของระบบ + Trade/Position/CrossAsset/GTAA)

import { NextResponse } from "next/server"
import { runSniperReport } from "@/lib/sniper/report"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  try {
    const report = await runSniperReport()
    return NextResponse.json(report)
  } catch (err) {
    console.error("[api/sniper]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}
