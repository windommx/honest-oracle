import { NextResponse } from "next/server"
import { runDataQualityChecks } from "@/lib/momentum/core"
import type { DqResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/dq → ผลตรวจสุขภาพข้อมูล (flags = รายการปัญหา, checks = รายละเอียดทุกข้อ)
export async function GET() {
  try {
    const { flags, checks } = await runDataQualityChecks()
    return NextResponse.json<DqResponse>({ flags, checks })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
