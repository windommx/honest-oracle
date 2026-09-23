import { NextResponse } from "next/server"
import { parseSnapshotCsv, ingestRows } from "@/lib/momentum/core"
import { emitEvent } from "@/lib/research/events"
import type { IngestResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_CSV_CHARS = 64 * 1024 * 1024 // ~600k แถว — เท่ากับเพดานของ /api/feed/ingest โดยประมาณ

// POST /api/ingest  { csv: string } → ingest CSV จาก AmiBroker (snapshot รายวัน หรือ history backfill)
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null)
    const raw = body && typeof body === "object" ? (body as { csv?: unknown }).csv : undefined
    const csv = typeof raw === "string" ? raw : ""
    if (!csv.trim()) return NextResponse.json({ error: "ไม่พบข้อมูล CSV ที่ส่งมา" }, { status: 400 })
    if (csv.length > MAX_CSV_CHARS)
      return NextResponse.json({ error: "ไฟล์ CSV ใหญ่เกินไป — แบ่งนำเข้าเป็นช่วงปี" }, { status: 413 })

    const t0 = Date.now()
    let parsed: ReturnType<typeof parseSnapshotCsv>
    try {
      parsed = parseSnapshotCsv(csv)
    } catch (e) {
      // รูปแบบไฟล์ผิด = ความผิดพลาดฝั่งผู้ส่ง (400) ไม่ใช่ 500
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
    const sum = await ingestRows(parsed.rows)
    // ที่มาข้อมูล (provenance) — ให้โมดูล FLAGSHIP แยกข้อมูลจริงออกจากข้อมูล demo seed ได้
    await emitEvent("ingest", "human", {
      kind: parsed.kind,
      insertedRaw: sum.insertedRaw,
      updatedRows: sum.updatedRows,
      snapDates: sum.snapDates.length,
    })
    return NextResponse.json<IngestResponse>({
      ok: true,
      insertedRaw: sum.insertedRaw,
      updatedRows: sum.updatedRows,
      snapDates: sum.snapDates,
      tookMs: Date.now() - t0,
      message: `รับข้อมูล ${parsed.kind === "history" ? "แบบประวัติย้อนหลัง" : "แบบ snapshot รายวัน"} ${sum.insertedRaw} แถว / ปรับปรุง indicator ${sum.updatedRows} แถว / สร้างโผใหม่ ${sum.snapDates.length} วัน`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
