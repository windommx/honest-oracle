import { NextResponse } from "next/server"
import { buildDataTrust, type DataTrustResponse } from "@/lib/feed/trust"

export const dynamic = "force-dynamic"

// GET /api/data/trust → provenance/licensing ของแหล่งข้อมูล · freshness เทียบปฏิทิน SET
// · corporate action ล่าสุด · reconciliation จากสายพานรายวัน (อ่านอย่างเดียว ไม่เขียน DB)
export async function GET() {
  try {
    return NextResponse.json<DataTrustResponse>(await buildDataTrust())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
