import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { DatesResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/dates → รายการวันที่ที่มี snapshot
export async function GET() {
  try {
    const rows = await db.snapshot.findMany({
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "desc" },
      take: 400,
    })
    const dates = rows.map((r) => r.date)
    return NextResponse.json<DatesResponse>({ dates, latest: dates[0] ?? null, count: dates.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
