// /api/gtaa/history — tracking log ของโมดูล GTAA
// GET → ประวัติรัน (GtaaRun ล่าสุด 20) + snapshot สัญญาณ (ล่าสุด 36 พร้อมผลประเมินย้อนหลัง)
//       + สรุป track record (ชนะ SPY กี่ครั้ง, delta เฉลี่ย) + สถานะมหภาคปัจจุบัน
// DB ล่ม/ว่าง = คืนค่าว่าง ไม่ทำให้โมดูลพัง (panel ยังเป็นแหล่งความจริงหลัก)

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { loadPanel } from "@/lib/gtaa/data"
import { computeMacroState } from "@/lib/gtaa/macro"
import { evaluateTracking, trackingSummary, type StoredSignalLike } from "@/lib/gtaa/tracking"
import type { GtaaConfig, GtaaHistoryResponse, GtaaRunRow, TrackedSignalRow } from "@/lib/gtaa/types"
import type { GtaaRun, GtaaSignal } from "@prisma/client"

export const dynamic = "force-dynamic"

function toRunRow(r: GtaaRun): GtaaRunRow {
  let cfg: GtaaConfig | null = null
  try {
    cfg = JSON.parse(r.config) as GtaaConfig
  } catch {
    cfg = null
  }
  return {
    id: r.id,
    configHash: r.configHash,
    config: cfg ?? ({} as GtaaConfig),
    months: r.months,
    cagr: r.cagr,
    maxDD: r.maxDD,
    sharpe: r.sharpe,
    benchCagr: r.benchCagr,
    benchMaxDD: r.benchMaxDD,
    benchSharpe: r.benchSharpe,
    dataSource: r.dataSource,
    qualityOk: r.qualityOk,
    createdAt: r.createdAt.toISOString(),
  }
}

function toStored(s: GtaaSignal): StoredSignalLike {
  return {
    id: s.id,
    decisionMonth: s.decisionMonth,
    appliesMonth: s.appliesMonth,
    cashPct: s.cashPct,
    cashTicker: s.cashTicker,
    holdings: s.holdings,
    failed: s.failed,
    stance: s.stance,
    dataSource: s.dataSource,
    configHash: s.configHash,
    createdAt: s.createdAt,
  }
}

export async function GET() {
  try {
    const { panel } = await loadPanel()
    const macro = computeMacroState(panel)

    let runs: GtaaRunRow[] = []
    let signals: TrackedSignalRow[] = []
    try {
      const [runRows, signalRows] = await Promise.all([
        db.gtaaRun.findMany({ orderBy: { id: "desc" }, take: 20 }),
        db.gtaaSignal.findMany({ orderBy: { decisionMonth: "desc" }, take: 36 }),
      ])
      runs = runRows.map(toRunRow)
      signals = evaluateTracking(panel, signalRows.map(toStored))
    } catch (e) {
      console.error("[api/gtaa/history] db unavailable:", (e as Error).message)
    }

    const response: GtaaHistoryResponse = {
      runs,
      signals,
      tracking: trackingSummary(signals),
      macro,
    }
    return NextResponse.json(response)
  } catch (err) {
    console.error("[api/gtaa/history]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}
