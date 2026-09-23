import { NextResponse } from "next/server"
import { auditEvents } from "@/lib/research/events"
import type { AuditResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/events/audit → ตรวจ hash chain ทั้งสาย + เหตุการณ์ล่าสุด
export async function GET() {
  try {
    const result = await auditEvents(50)
    return NextResponse.json<AuditResponse>(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
