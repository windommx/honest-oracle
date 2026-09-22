// POST /api/gtaa/fetch — พยายามดึงข้อมูลจริง (Yahoo → Stooq fallback)
// บน sandbox ที่บล็อก egress: ตอบ ok=false พร้อมเหตุผลรายแหล่ง + คำแนะนำ (รัน CLI บนเครื่องผู้ใช้ / อัปโหลด CSV)
// บนเครื่องที่เน็ตปกติ: ได้ panel จริง → quality gate → บันทึก data/gtaa/panel.json

import { NextResponse } from "next/server"
import { fetchRealPanel } from "@/lib/gtaa/fetcher"
import { savePanel } from "@/lib/gtaa/data"
import { checkQuality } from "@/lib/gtaa/quality"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST() {
  try {
    const outcome = await fetchRealPanel()
    if (!outcome.ok || !outcome.panel) {
      return NextResponse.json(
        {
          ok: false,
          attempts: outcome.attempts,
          tickersOk: outcome.tickersOk,
          tickersFail: outcome.tickersFail,
          hint: "รัน `bun run gtaa -- fetch` บนเครื่องที่เข้าเน็ตปกติ แล้ว commit ไฟล์ data/gtaa/panel.json เข้า repo หรืออัปโหลด CSV ผ่านการ์ดข้อมูลด้านล่าง",
        },
        { status: 502 },
      )
    }
    const quality = checkQuality(outcome.panel)
    if (!quality.ok) {
      return NextResponse.json(
        { ok: false, attempts: outcome.attempts, quality, error: "ข้อมูลที่ดึงมาไม่ผ่าน quality gate — ไม่บันทึก" },
        { status: 422 },
      )
    }
    await savePanel(outcome.panel)
    return NextResponse.json({ ok: true, quality, tickersOk: outcome.tickersOk, attempts: outcome.attempts })
  } catch (err) {
    console.error("[api/gtaa/fetch]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}
