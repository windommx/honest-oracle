// POST /api/feed/ingest — ทางเข้า JSON สำหรับสคริปต์ภายนอก (settfex / Settrade Open API / อื่น ๆ)
// body: FeedIngestRequest { source, rows: [{date,symbol,close,open?,high?,low?,val?|volume?}], sectors?, replaceDemo? }
// ส่งเป็นชุดได้ (สคริปต์แบ่ง 20,000 แถว/ครั้ง) — replaceDemo ควรใส่เฉพาะชุดแรก

import { NextResponse } from "next/server"
import { normalizeFeedRows } from "@/lib/feed/rows"
import { assessSymbol, flagStale } from "@/lib/feed/quality"
import { ingestFeed } from "@/lib/feed/ingest"
import type { FeedFetchResponse, FeedIngestRequest } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_ROWS = 600_000

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    const body = (await req.json().catch(() => null)) as Partial<FeedIngestRequest> | null
    if (!body || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "ต้องส่ง rows เป็น array อย่างน้อย 1 แถว" }, { status: 400 })
    }
    if (body.rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `จำกัด ${MAX_ROWS.toLocaleString()} แถวต่อครั้ง — แบ่งส่งเป็นชุด` }, { status: 400 })
    }
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 40) : "external"
    const { rows, dropped } = normalizeFeedRows(body.rows)
    if (rows.length === 0) {
      return NextResponse.json({ error: "ไม่มีแถวที่ถูกต้อง (ต้องมี date, symbol, close > 0)" }, { status: 400 })
    }
    const symbols = [...new Set(rows.map((r) => r.symbol))]
    const reports = flagStale(symbols.map((s) => assessSymbol(s, rows)))
    const res = await ingestFeed({
      rows,
      source,
      actor: "system",
      replaceDemo: body.replaceDemo === true,
      sectors: body.sectors && typeof body.sectors === "object" ? body.sectors : undefined,
    })
    const notes: string[] = []
    if (dropped > 0) notes.push(`ทิ้งแถวที่ไม่ถูกต้อง ${dropped.toLocaleString()} แถว`)
    return NextResponse.json<FeedFetchResponse>({
      ok: true,
      source,
      requested: symbols.length,
      fetched: symbols.length,
      failed: 0,
      rowsFetched: rows.length,
      reports,
      ingest: {
        insertedRaw: res.ingest.insertedRaw,
        updatedRows: res.ingest.updatedRows,
        snapDates: res.ingest.snapDates.length,
        latestDate: res.latestDate,
      },
      sectorRows: res.sectorRows,
      replacedDemo: res.replacedDemo,
      notes,
      tookMs: Date.now() - t0,
      message: `รับข้อมูลจาก ${source} ${symbols.length} ตัว ${rows.length.toLocaleString()} แถว → สร้างโผ ${res.ingest.snapDates.length} วัน`,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal error" }, { status: 500 })
  }
}
