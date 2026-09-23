import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeRegimeState, runDataQualityChecks } from "@/lib/momentum/core"
import { loadPanel } from "@/lib/gtaa/data"
import { computeMacroState, toMacroBrief } from "@/lib/gtaa/macro"
import type { OverviewResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/overview → KPI รวมสำหรับหน้าภาพรวม
export async function GET() {
  try {
    const [rawCount, snapCount, symGroups, dateCount, latestSnap, regime, dq, positions, pending] =
      await Promise.all([
        db.rawDaily.count(),
        db.snapshot.count(),
        db.rawDaily.groupBy({ by: ["symbol"] }),
        db.snapshot.findMany({ select: { date: true }, distinct: ["date"], orderBy: { date: "desc" } }),
        db.snapshot.aggregate({ _max: { date: true } }),
        computeRegimeState(),
        runDataQualityChecks(),
        db.position.count(),
        db.pendingGate.count({ where: { status: "pending" } }),
      ])

    // Global Regime Gate (GTAA) — ระบบไทยไม่พึ่งพาโมดูลนี้: ล้ม = คืน null แล้วจบ (shadow integration)
    let gtaa: OverviewResponse["gtaa"] = null
    try {
      const { panel } = await loadPanel()
      gtaa = toMacroBrief(computeMacroState(panel))
    } catch (e) {
      console.error("[api/overview] gtaa brief failed:", (e as Error).message)
    }

    const latestDate = latestSnap._max.date
    let todayUnique = 0
    let todayRepeat = 0
    let todayMulti3 = 0
    if (latestDate) {
      const snaps = await db.snapshot.findMany({ where: { date: latestDate } })
      const countBy = new Map<string, number>()
      for (const s of snaps) countBy.set(s.symbol, (countBy.get(s.symbol) ?? 0) + 1)
      todayUnique = countBy.size
      todayRepeat = [...countBy.values()].filter((c) => c >= 2).length
      todayMulti3 = [...countBy.values()].filter((c) => c >= 3).length
    }

    return NextResponse.json<OverviewResponse>({
      latestDate,
      totalDates: dateCount.length,
      totalSymbols: symGroups.length,
      rowsRaw: rawCount,
      rowsSnap: snapCount,
      todayUnique,
      todayRepeat,
      todayMulti3,
      regime,
      positions,
      pendingGates: pending,
      dqFlags: dq.flags,
      gtaa,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
