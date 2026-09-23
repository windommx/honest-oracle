// /api/gtaa/data — จัดการไฟล์ข้อมูล data/gtaa/panel.json
// GET    → quality gate ของข้อมูลปัจจุบัน + meta
// POST   → อัปโหลด CSV { csv: string } → parse → quality → บันทึกเฉพาะผ่าน gate
// DELETE → ลบไฟล์ กลับไปใช้ synthetic seed 42

import { NextResponse } from "next/server"
import { clearPanel, loadPanel, parseCsvPanel, savePanel } from "@/lib/gtaa/data"
import { checkQuality } from "@/lib/gtaa/quality"

export const dynamic = "force-dynamic"

/** CSV ใหญ่สุดที่รับ (ตัวอักษร) — เท่ากับที่แท็บยอมให้เลือกไฟล์ · รายวัน 15 ตัว × 30 ปี ≈ 3.4 ล้านตัวอักษร */
const MAX_CSV_CHARS = 4_000_000

export async function GET() {
  try {
    const { panel, fromFile } = await loadPanel()
    return NextResponse.json({
      fromFile,
      meta: panel.meta,
      months: panel.dates.length,
      firstMonth: panel.dates[0] ?? null,
      lastMonth: panel.dates[panel.dates.length - 1] ?? null,
      quality: checkQuality(panel),
    })
  } catch (err) {
    console.error("[api/gtaa/data GET]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tooLarge = () =>
      NextResponse.json(
        { error: `ไฟล์ CSV ใหญ่เกินไป (จำกัด ${MAX_CSV_CHARS.toLocaleString()} ตัวอักษร) — ใช้ข้อมูลรายเดือนแทนรายวัน` },
        { status: 413 },
      )
    if (Number(req.headers.get("content-length") ?? 0) > MAX_CSV_CHARS * 2) return tooLarge()
    const raw = (await req.json().catch(() => null)) as unknown
    const body = (raw && typeof raw === "object" ? raw : {}) as { csv?: unknown }
    if (typeof body.csv !== "string" || body.csv.trim().length < 20) {
      return NextResponse.json({ error: "ไม่พบเนื้อหา CSV ที่ส่งมา" }, { status: 400 })
    }
    if (body.csv.length > MAX_CSV_CHARS) return tooLarge()
    const parsed = parseCsvPanel(body.csv)
    if (!parsed.panel) {
      return NextResponse.json(
        { error: parsed.error ?? "parse ไม่สำเร็จ", rows: parsed.rows, tickers: parsed.tickers },
        { status: 400 },
      )
    }
    const quality = checkQuality(parsed.panel)
    if (!quality.ok) {
      // บันทึกไม่ได้ — คืน quality report ให้ผู้ใช้แก้ไฟล์ก่อน (data gate เข้มงวดตามแผน Step 0.2)
      return NextResponse.json(
        {
          error: "ข้อมูลไม่ผ่าน quality gate — ไม่บันทึก",
          quality,
          rows: parsed.rows,
          tickers: parsed.tickers,
        },
        { status: 422 },
      )
    }
    await savePanel(parsed.panel)
    return NextResponse.json({ saved: true, quality, rows: parsed.rows, tickers: parsed.tickers, meta: parsed.panel.meta })
  } catch (err) {
    console.error("[api/gtaa/data POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await clearPanel()
    return NextResponse.json({ cleared: true })
  } catch (err) {
    console.error("[api/gtaa/data DELETE]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}
