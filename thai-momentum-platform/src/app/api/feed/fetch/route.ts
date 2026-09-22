// POST /api/feed/fetch — ดึงราคาจริงจาก Yahoo Finance (.BK) ฝั่ง server แล้วเข้าท่อ ingest เดียวกับ CSV
// body: FeedFetchRequest { symbols, range?, adjusted?, replaceDemo?, sectors? }
// - เครื่องที่เข้าเน็ตปกติ: ได้ข้อมูล → รายงานรายตัว → ingest → SymbolMeta → EventLog(ingest, source=yahoo)
// - sandbox ที่บล็อก egress: ตอบ 502 พร้อมเหตุผลรายตัว + วิธีทางเลือก (CLI บนเครื่องผู้ใช้ / สคริปต์ Python)

import { NextResponse } from "next/server"
import { fetchYahooBatch, YAHOO_RANGES } from "@/lib/feed/yahoo"
import { flagStale } from "@/lib/feed/quality"
import { ingestFeed } from "@/lib/feed/ingest"
import { parseSymbolList } from "@/lib/feed/universe"
import { DEFAULT_FEED_RANGE } from "@/lib/feed/sources"
import type { FeedFetchRequest, FeedFetchResponse, FeedRange } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_SYMBOLS = 300

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<FeedFetchRequest> & { symbols?: string[] | string }
    const text = Array.isArray(body.symbols) ? body.symbols.join(",") : typeof body.symbols === "string" ? body.symbols : ""
    const { symbols, invalid } = parseSymbolList(text)
    if (symbols.length === 0) {
      return NextResponse.json({ error: "ต้องระบุรายชื่อหุ้นอย่างน้อย 1 ตัว (เช่น PTT, KBANK หรือ SET50)" }, { status: 400 })
    }
    if (symbols.length > MAX_SYMBOLS) {
      return NextResponse.json({ error: `จำกัด ${MAX_SYMBOLS} ตัวต่อรอบ (ส่งมา ${symbols.length})` }, { status: 400 })
    }
    const range: FeedRange = YAHOO_RANGES.includes(body.range as FeedRange) ? (body.range as FeedRange) : DEFAULT_FEED_RANGE
    const adjusted = body.adjusted !== false
    const replaceDemo = body.replaceDemo === true
    const sectors = body.sectors && typeof body.sectors === "object" ? body.sectors : undefined

    const batch = await fetchYahooBatch(symbols, range, { adjusted })
    const reports = flagStale(batch.reports)
    const failed = reports.filter((r) => !r.ok)
    const notes: string[] = [
      adjusted
        ? "ราคาปรับด้วย adjclose ของ Yahoo (ปันผล + สปลิต) — เหมาะกับโมเมนตัมข้ามวัน XD"
        : "ราคาดิบ (ไม่ปรับปันผล) — วันขึ้น XD จะเห็นราคากระโดดลง",
      "มูลค่าซื้อขาย (val) = close × volume โดยประมาณ — SET นับ Σ ราคา×จำนวนทุก trade ต่างกันไม่กี่ %",
      "แหล่ง Yahoo ไม่เป็นทางการ — ตรวจ DQ และเทียบราคาปิดกับ SET ก่อนใช้ตัดสินใจ",
    ]
    if (invalid.length > 0) notes.push(`ข้ามสัญลักษณ์ที่รูปแบบไม่ถูกต้อง: ${invalid.join(", ")}`)

    if (batch.rows.length === 0) {
      const message = batch.blocked
        ? "เซิร์ฟเวอร์นี้เข้าถึง Yahoo Finance ไม่ได้ (ถูกบล็อกหรือไม่มีอินเทอร์เน็ต) — รัน `bun run fetch:th` บนเครื่องที่เข้าเน็ตได้ หรือใช้สคริปต์ Python lab/fetch_set_feed.py แล้วส่งเข้า /api/feed/ingest"
        : "ไม่ได้ข้อมูลจากสัญลักษณ์ที่ระบุเลย — ตรวจชื่อย่อ (ต้องเป็นชื่อบน SET เช่น PTT ไม่ใช่ PTT.BK)"
      return NextResponse.json<FeedFetchResponse>(
        {
          ok: false,
          source: "yahoo",
          requested: symbols.length,
          fetched: 0,
          failed: failed.length,
          rowsFetched: 0,
          reports,
          ingest: null,
          sectorRows: 0,
          replacedDemo: false,
          notes,
          tookMs: Date.now() - t0,
          message,
        },
        { status: 502 },
      )
    }

    const res = await ingestFeed({ rows: batch.rows, source: "yahoo", actor: "human", replaceDemo, sectors })
    const okCount = reports.filter((r) => r.ok).length
    return NextResponse.json<FeedFetchResponse>({
      ok: true,
      source: "yahoo",
      requested: symbols.length,
      fetched: okCount,
      failed: failed.length,
      rowsFetched: batch.rows.length,
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
      message: `ดึงจาก Yahoo ${okCount}/${symbols.length} ตัว ${batch.rows.length.toLocaleString()} แถว → นำเข้า ${res.ingest.insertedRaw.toLocaleString()} แถว สร้างโผ ${res.ingest.snapDates.length} วัน${failed.length > 0 ? ` (ล้มเหลว ${failed.length} ตัว — ดูรายงาน)` : ""}`,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal error" }, { status: 500 })
  }
}
