import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { DatesResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/dates → รายการวันที่ที่มี snapshot (ใหม่ → เก่า, สูงสุด 400 วันล่าสุด) · count = จำนวนวันทั้งหมดในระบบ
export async function GET() {
  try {
    const [rows, all] = await Promise.all([
      db.snapshot.findMany({
        select: { date: true },
        distinct: ["date"],
        orderBy: { date: "desc" },
        take: 400,
      }),
      db.snapshot.groupBy({ by: ["date"] }),
    ])
    const dates = rows.map((r) => r.date)
    return NextResponse.json<DatesResponse>({ dates, latest: dates[0] ?? null, count: all.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
