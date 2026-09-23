// POST /api/feed/ingest — ทางเข้า JSON สำหรับสคริปต์ภายนอก (settfex / Settrade Open API / อื่น ๆ)
// body: FeedIngestRequest { source, rows: [{date,symbol,close,open?,high?,low?,val?|volume?}], sectors?, replaceDemo?, confirm? }
// ส่งเป็นชุดได้ (สคริปต์แบ่ง 20,000 แถว/ครั้ง) — replaceDemo ควรใส่เฉพาะชุดแรก
// replaceDemo ล้างข้อมูลตลาดทั้งหมด (ไม่ใช่เฉพาะ demo) → ถ้ามีข้อมูลอยู่ต้องส่ง confirm:"REPLACE" (ไม่งั้น 409)
// และระบบสำรอง DB (data/backups) ก่อนลบทุกครั้ง

import { NextResponse } from "next/server"
import { normalizeFeedRows } from "@/lib/feed/rows"
import { assessSymbol, flagStale } from "@/lib/feed/quality"
import { CROSS_ASSET_CLEARED_NOTE, ingestFeed } from "@/lib/feed/ingest"
import { guardDestructive, type BackupInfo } from "@/lib/security/destructive-guard"
import type { ParsedCsvRow } from "@/lib/momentum/core"
import type { FeedFetchResponse, FeedIngestRequest } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_ROWS = 600_000
const MAX_BODY_BYTES = 128 * 1024 * 1024 // ~600k แถว JSON ≈ 70 MB — กันคำขอใหญ่ผิดปกติก่อน parse ทั้งก้อนลงหน่วยความจำ

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    const len = Number(req.headers.get("content-length") ?? 0)
    if (len > MAX_BODY_BYTES) {
      return NextResponse.json({ error: `ข้อมูลใหญ่เกิน ${MAX_BODY_BYTES / 1024 / 1024} MB ต่อครั้ง — แบ่งส่งเป็นชุด` }, { status: 413 })
    }
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
    // จัดกลุ่มต่อหุ้นครั้งเดียว (เดิม assessSymbol กรองทั้งชุดต่อหุ้น = O(หุ้น × แถว) — 800 ตัว × 600k แถว)
    const bySym = new Map<string, ParsedCsvRow[]>()
    for (const r of rows) {
      let a = bySym.get(r.symbol)
      if (!a) bySym.set(r.symbol, (a = []))
      a.push(r)
    }
    const symbols = [...bySym.keys()]
    const reports = flagStale(symbols.map((s) => assessSymbol(s, bySym.get(s) ?? [])))
    const replaceDemo = body.replaceDemo === true
    let backup: BackupInfo | null = null
    if (replaceDemo) {
      const guard = await guardDestructive("replaceDemo", body)
      if (!guard.ok) return guard.response
      backup = guard.backup
    }
    const res = await ingestFeed({
      rows,
      source,
      actor: "system",
      replaceDemo,
      sectors: body.sectors && typeof body.sectors === "object" ? body.sectors : undefined,
    })
    const notes: string[] = []
    if (dropped > 0) notes.push(`ทิ้งแถวที่ไม่ถูกต้อง ${dropped.toLocaleString()} แถว`)
    if (res.clearedCrossAsset) notes.push(CROSS_ASSET_CLEARED_NOTE)
    if (backup) notes.push(`สำรองฐานข้อมูลก่อนล้างไว้ที่ ${backup.file}`)
    return NextResponse.json<FeedFetchResponse & { backup?: BackupInfo | null }>({
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
      ...(replaceDemo ? { backup } : {}),
      notes,
      tookMs: Date.now() - t0,
      message: `รับข้อมูลจาก ${source} ${symbols.length} ตัว ${rows.length.toLocaleString()} แถว → สร้างโผ ${res.ingest.snapDates.length} วัน${dropped > 0 ? ` (ทิ้งแถวเสีย ${dropped.toLocaleString()})` : ""}${res.clearedCrossAsset ? " · ล้าง CrossAsset จำลองแล้ว — รัน bun run fetch:cross เพื่อใช้ข้อมูลจริง" : ""}`,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal error" }, { status: 500 })
  }
}
