// GTAA store — ชั้น persist ลง tracking log (Prisma + EventLog hash chain)
// หลักการ: snapshot สัญญาณ = หลักฐานที่เขียนก่อนเกิดผล (upsert ต่อเดือน×config แก้ซ้ำได้แต่ไม่สะสมขยะ)
// ทุกการบันทึกยิง EventLog (kind "gtaa") เข้า hash chain เดียวกับระบบหลัก — แอบแก้ย้อนหลังไม่ได้

import { createHash } from "crypto"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/research/events"
import { computeMacroState, nextMonthLabel } from "./macro"
import { computeMonthSignals } from "./signals"
import { checkQuality } from "./quality"
import type { BacktestStats, GtaaConfig, GtaaMacroState, GtaaPanel, SignalRow } from "./types"

/** ลายเงื่อนไขกฎ — sha256(config JSON) 10 ตัวแรก (deterministic ต่อ config) */
export function configHash(cfg: GtaaConfig): string {
  return createHash("sha256").update(JSON.stringify(cfg)).digest("hex").slice(0, 10)
}

export interface PersistResult {
  id: number
  decisionMonth: string
  configHash: string
  updated: boolean
}

/** บันทึก snapshot สัญญาณเดือนล่าสุดของ panel ตาม config (upsert ต่อ decisionMonth × configHash) */
export async function persistSignalSnapshot(
  panel: GtaaPanel,
  cfg: GtaaConfig,
  opts: { actor?: string; macro?: GtaaMacroState } = {},
): Promise<PersistResult> {
  const T = panel.dates.length
  const decisionMonth = panel.dates[T - 1] ?? "—"
  const hash = configHash(cfg)

  const sig = computeMonthSignals(panel, T - 1, cfg)
  const holdingsRows: SignalRow[] = sig.rows.filter((r) => r.weight > 0)
  const holdings = holdingsRows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    group: r.group,
    weight: r.weight,
    score: r.score,
    rank: r.rank,
    trendPass: r.trendPass,
  }))
  const failed = sig.rows.filter((r) => r.status === "kicked").map((r) => r.ticker)
  const macro = opts.macro ?? computeMacroState(panel, cfg)

  const data = {
    decisionMonth,
    appliesMonth: nextMonthLabel(decisionMonth),
    cashPct: macro.cashPct,
    cashTicker: sig.cashTicker,
    holdings: JSON.stringify(holdings),
    failed: JSON.stringify(failed),
    benchPass: macro.benchPass,
    stance: macro.stance,
    dataSource: panel.meta.source,
    configHash: hash,
  }

  const saved = await db.gtaaSignal.upsert({
    where: { decisionMonth_configHash: { decisionMonth, configHash: hash } },
    create: data,
    update: data,
  })

  await emitEvent("gtaa", opts.actor ?? "user", {
    type: "signal_snapshot",
    decisionMonth,
    appliesMonth: data.appliesMonth,
    configHash: hash,
    cashPct: data.cashPct,
    stance: data.stance,
    holdingsCount: holdings.length,
    failedCount: failed.length,
  })

  return { id: saved.id, decisionMonth, configHash: hash, updated: true }
}

/** บันทึกผลรัน backtest เข้า tracking log (config เดิม = ผลเดิม → ตรวจย้อนหลังได้) */
export async function persistRun(
  panel: GtaaPanel,
  cfg: GtaaConfig,
  stats: BacktestStats,
  bench: BacktestStats,
  months: number,
  startMonth: string,
  endMonth: string,
): Promise<number> {
  const hash = configHash(cfg)
  const quality = checkQuality(panel)
  const row = await db.gtaaRun.create({
    data: {
      configHash: hash,
      config: JSON.stringify(cfg),
      months,
      cagr: stats.cagr,
      maxDD: stats.maxDD,
      sharpe: stats.sharpe,
      benchCagr: bench.cagr,
      benchMaxDD: bench.maxDD,
      benchSharpe: bench.sharpe,
      dataSource: panel.meta.source,
      qualityOk: quality.ok,
      metrics: JSON.stringify({ startMonth, endMonth, vol: stats.vol, hitRate: stats.hitRate, turnoverAnnual: stats.turnoverAnnual }),
    },
  })
  await emitEvent("gtaa", "user", {
    type: "run_persist",
    configHash: hash,
    months,
    cagr: stats.cagr,
    sharpe: stats.sharpe,
    maxDD: stats.maxDD,
    dataSource: panel.meta.source,
  })
  return row.id
}
