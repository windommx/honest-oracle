import { NextResponse } from "next/server"
import { seedDemoData } from "@/lib/momentum/core"
import { emitEvent } from "@/lib/research/events"
import type { SeedResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/seed  { days?, symbols? } → สร้างข้อมูลตัวอย่าง (wipe ของเดิมทั้งหมด)
export async function POST(req: Request) {
  try {
    const parsed: unknown = await req.json().catch(() => null)
    const body = (parsed && typeof parsed === "object" ? parsed : {}) as { days?: unknown; symbols?: unknown }
    const stats = await seedDemoData({
      days: typeof body.days === "number" ? body.days : undefined,
      symbols: typeof body.symbols === "number" ? body.symbols : undefined,
    })
    await emitEvent("seed", "human", {
      days: stats.dates,
      symbols: stats.symbols,
      rawRows: stats.rawRows,
      snapRows: stats.snapRows,
      sectorRows: stats.sectorRows,
    })
    return NextResponse.json<SeedResponse>({ ok: true, ...stats })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
