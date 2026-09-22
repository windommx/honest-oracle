import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { TFS } from "@/lib/momentum/contracts"
import type { ReportResponse, ReportRow } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/report?date= → สรุปรายวันแบบข้อความ (พร้อมส่ง Line / อ่านง่าย)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    let date = url.searchParams.get("date")
    const dates = (
      await db.snapshot.findMany({ select: { date: true }, distinct: ["date"], orderBy: { date: "desc" }, take: 800 })
    ).map((r) => r.date)
    if (!date) date = dates[0] ?? null
    if (!date) return NextResponse.json({ error: "ยังไม่มีข้อมูล snapshot" }, { status: 404 })

    const idx = dates.indexOf(date)
    const prevDate = idx >= 0 && idx + 1 < dates.length ? dates[idx + 1] : null

    const [cur, prv] = await Promise.all([
      db.snapshot.findMany({ where: { date } }),
      prevDate ? db.snapshot.findMany({ where: { date: prevDate } }) : Promise.resolve([]),
    ])

    const curByTf = new Map<number, Set<string>>()
    const prvByTf = new Map<number, Set<string>>()
    for (const s of cur) {
      if (!curByTf.has(s.timeframe)) curByTf.set(s.timeframe, new Set())
      curByTf.get(s.timeframe)!.add(s.symbol)
    }
    for (const s of prv) {
      if (!prvByTf.has(s.timeframe)) prvByTf.set(s.timeframe, new Set())
      prvByTf.get(s.timeframe)!.add(s.symbol)
    }

    const rows: ReportRow[] = TFS.map((tf) => {
      const c = curByTf.get(tf) ?? new Set()
      const p = prvByTf.get(tf) ?? new Set()
      const nw = [...c].filter((s) => !p.has(s)).sort()
      const lost = [...p].filter((s) => !c.has(s)).sort()
      return { tf, total: c.size, newCount: nw.length, newSymbols: nw, lostCount: lost.length, lostSymbols: lost }
    })

    const countBy = new Map<string, number>()
    for (const s of cur) countBy.set(s.symbol, (countBy.get(s.symbol) ?? 0) + 1)
    const multi = [...countBy.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count }))

    const allCur = new Set<string>()
    for (const s of cur) allCur.add(s.symbol)

    const L = [
      `📊 Momentum Map ${date} | ติดโผรวม ${allCur.size} ตัว | ซ้ำข้ามโผ ${multi.length} ตัว`,
      "",
      ...rows.map(
        (r) =>
          `⏱ ${String(r.tf).padStart(3)}วัน  ใหม่ ${String(r.newCount).padStart(2)} [${r.newSymbols.slice(0, 5).join(",")}]  หลุด ${String(r.lostCount).padStart(2)} [${r.lostSymbols.slice(0, 5).join(",")}]`
      ),
      "",
      `🔥 ติดหลายโผพร้อมกัน: ${multi.map((m) => `${m.symbol}(${m.count})`).join(", ") || "—"}`,
    ]

    return NextResponse.json<ReportResponse>({
      date,
      prevDate,
      text: L.join("\n"),
      rows,
      multi,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
