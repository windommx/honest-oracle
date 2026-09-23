import { NextResponse } from "next/server"
import { buildTrackRecord, type TrackRecordWithFreeze } from "@/lib/track/record"

export const dynamic = "force-dynamic"

// GET /api/track-record → track record ของพอร์ตกระดาษ Jev (อ่านอย่างเดียว ไม่เขียน DB)
// NAV รายวัน vs benchmark · สถิติ · ป้ายที่มาข้อมูล (SYNTHETIC/REAL) · ความเชื่อมั่นทางสถิติ · หลักฐานกันแก้ย้อนหลัง
// + freeze: ล็อกกติกาช่วงเก็บผล (frozenAt · drift · การเปลี่ยนกติกาใน EventLog ระหว่าง record)
export async function GET() {
  try {
    return NextResponse.json<TrackRecordWithFreeze>(await buildTrackRecord())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
