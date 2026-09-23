import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeDate } from "@/lib/momentum/core"
import { buildAiInputs, buildAiScoreRadar } from "@/lib/momentum/ai-score"
import type { AiScoreResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// หน้าต่างข้อมูลย้อนหลังที่ใช้คำนวณ (EMA30 + warm-up + HA 10 แท่ง)
const WINDOW = 60
const TOP_N = 30

interface CacheEntry {
  key: string
  data: AiScoreResponse
}
let _cache: CacheEntry | null = null

// GET /api/ai-score?date=YYYY-MM-DD
// เรดาร์ %CMPR — หุ้น Volume พุ่งติดอันดับ + คะแนน AI-Score 4 องค์ประกอบ
export async function GET(req: Request) {
  const t0 = Date.now()
  try {
    const url = new URL(req.url)
    const dateParam = url.searchParams.get("date")
    const date = dateParam ? normalizeDate(dateParam) : null
    if (dateParam && !date) {
      return NextResponse.json({ error: "รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)" }, { status: 400 })
    }

    // 1) วันทำการล่าสุดในระบบ (หรือ ≤ date ที่ระบุ)
    const distinctDates = await db.rawDaily.findMany({
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "desc" },
    })
    let allDates = distinctDates.map((d) => d.date)
    const earliest = allDates[allDates.length - 1] // distinct เรียง desc → ตัวท้าย = วันแรกของข้อมูล
    if (date) allDates = allDates.filter((d) => d <= date)
    if (allDates.length === 0) {
      return NextResponse.json<AiScoreResponse>({
        date: date ?? "",
        generatedAt: new Date().toISOString(),
        rows: [],
        formula: "CmprPct = Vol วันนี้ ÷ เฉลี่ย 5 วัน • AI-Score = Cmpr + PerC12-30 + Trend + Heikin-Score",
        tookMs: Date.now() - t0,
        message:
          earliest === undefined
            ? "ยังไม่มีข้อมูลในระบบ — ไปที่แท็บข้อมูลเพื่อ Seed ข้อมูลก่อน"
            : `ไม่มีข้อมูล ณ หรือก่อนวันที่ ${date} (ข้อมูลในระบบเริ่ม ${earliest})`,
      })
    }
    const target = allDates[0]
    const windowDates = allDates.slice(0, Math.min(WINDOW, allDates.length)).reverse() // เก่า → ใหม่

    // 2) cache ต่อ (target date + จำนวนแถว + ผลรวม close/val ในหน้าต่าง) กันคำนวณซ้ำทุก request
    //    ผลรวมจับการ ingest ทับแถวเดิม (upsert วันเดียวกันหลังตลาดปิด) ที่จำนวนแถวไม่เปลี่ยน
    const agg = await db.rawDaily.aggregate({
      where: { date: { in: windowDates } },
      _count: { _all: true },
      _sum: { close: true, val: true },
    })
    const key = `${target}|${windowDates[0]}|${agg._count._all}|${agg._sum.close ?? 0}|${agg._sum.val ?? 0}`
    if (_cache && _cache.key === key) {
      return NextResponse.json({ ..._cache.data, tookMs: Date.now() - t0 })
    }

    // 3) โหลดแถวในหน้าต่าง → จัดกลุ่มต่อสัญลักษณ์
    const rows = await db.rawDaily.findMany({
      where: { date: { in: windowDates } },
      select: { date: true, symbol: true, close: true, val: true },
      orderBy: [{ date: "asc" }, { symbol: "asc" }],
    })
    // ต้องมีข้อมูลถึงวัน target จึงจะนับ (ตัดหุ้นหยุดซื้อขายก่อนวันล่าสุด) — เทียบวันที่ของแถวจริง
    const inputs = buildAiInputs(rows, target)

    // 4) คำนวณคะแนน + จัดอันดับตาม %CMPR
    const radar = buildAiScoreRadar(inputs, TOP_N)

    const data: AiScoreResponse = {
      date: target,
      generatedAt: new Date().toISOString(),
      rows: radar,
      formula:
        "CmprPct = Vol วันนี้ ÷ เฉลี่ย 5 วัน • AI-Score = Cmpr + PerC12-30 + Trend + Heikin-Score",
      tookMs: Date.now() - t0,
      message:
        radar.length === 0
          ? "ข้อมูลในหน้าต่าง 60 วันไม่พอสำหรับคำนวณ (ต้องมีอย่างน้อย 36 วันทำการต่อหุ้น) — ลอง Seed/Ingest ข้อมูลเพิ่ม"
          : "",
    }
    _cache = { key, data }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
