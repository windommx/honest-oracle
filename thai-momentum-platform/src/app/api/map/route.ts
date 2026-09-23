import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { TFS } from "@/lib/momentum/contracts"
import { colorForIndex } from "@/lib/palette"
import type { MapColumn, MapItem, MapResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/map?date=YYYY-MM-DD → ข้อมูล Momentum Map ของวันนั้น
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    let date = url.searchParams.get("date")
    if (!date) {
      const latest = await db.snapshot.aggregate({ _max: { date: true } })
      date = latest._max.date
    }
    if (!date) return NextResponse.json({ error: "ยังไม่มีข้อมูล — ลอง Seed ข้อมูลตัวอย่างก่อน" }, { status: 404 })

    const snaps = await db.snapshot.findMany({ where: { date } })
    if (snaps.length === 0)
      return NextResponse.json({ error: `ไม่พบข้อมูลของวันที่ ${date}` }, { status: 404 })

    // นับจำนวน timeframe ที่แต่ละหุ้นติด
    const countBy = new Map<string, number>()
    for (const s of snaps) countBy.set(s.symbol, (countBy.get(s.symbol) ?? 0) + 1)
    const bestRank = new Map<string, number>()
    for (const s of snaps) bestRank.set(s.symbol, Math.min(bestRank.get(s.symbol) ?? 99, s.rank))

    // หุ้นซ้ำ (ติด >= 2 โผ) เรียงตามความถี่ → ได้สีตามลำดับ
    const repeated = [...countBy.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || (bestRank.get(a[0]) ?? 99) - (bestRank.get(b[0]) ?? 99))
      .map(([s]) => s)
    const colors: Record<string, string> = {}
    repeated.forEach((sym, i) => {
      colors[sym] = colorForIndex(i)
    })

    const columns: MapColumn[] = TFS.map((tf) => ({
      tf,
      items: snaps
        .filter((s) => s.timeframe === tf)
        .sort((a, b) => a.rank - b.rank)
        .map<MapItem>((s) => ({ symbol: s.symbol, rank: s.rank, ret: s.ret })),
    }))

    return NextResponse.json<MapResponse>({ date, columns, repeated, colors })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
