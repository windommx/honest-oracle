// POST /api/gtaa/run — รันวิเคราะห์ GTAA ด้วย config ที่ส่งมา
// body: { config: Partial<GtaaConfig>, sensitivity?, walkforward?, montecarlo?: { seeds? } }
// ทุกการรัน deterministic — ผลเดิมเสมอที่ config/seed เดิม

import { NextResponse } from "next/server"
import { loadPanel } from "@/lib/gtaa/data"
import { runBacktest } from "@/lib/gtaa/backtest"
import { runSensitivity } from "@/lib/gtaa/sensitivity"
import { runWalkForward } from "@/lib/gtaa/walkforward"
import { blockBootstrap, syntheticSeeds } from "@/lib/gtaa/montecarlo"
import { sanitizeConfig } from "@/lib/gtaa/defaults"
import { persistRun, persistSignalSnapshot } from "@/lib/gtaa/store"
import { type GtaaRunRequest, type GtaaRunResponse } from "@/lib/gtaa/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const t0 = Date.now()
    const body = (await req.json().catch(() => ({}))) as GtaaRunRequest
    const cfg = sanitizeConfig(body.config)
    const { panel, fromFile } = await loadPanel()

    const run = runBacktest(panel, cfg)

    // block bootstrap ต้องใช้ผลตอบแทนรายเดือนของกลยุทธ์จาก equity curve
    const stratReturns: number[] = run.equity.map((e, i) => {
      const prev = i === 0 ? 1 : run.equity[i - 1].strategy
      return e.strategy / prev - 1
    })

    const seedsRaw = body.montecarlo?.seeds
    const seeds =
      typeof seedsRaw === "number" && Number.isFinite(seedsRaw) ? Math.max(0, Math.min(1000, Math.round(seedsRaw))) : 0

    // persist = บันทึกผลรัน + snapshot สัญญาณเดือนล่าสุดลง tracking log (DB + EventLog)
    let runId: number | null = null
    let snapshotId: number | null = null
    if (body.persist === true) {
      try {
        runId = await persistRun(panel, cfg, run.stats, run.benchStats, run.stats.months, run.startMonth, run.endMonth)
        const snap = await persistSignalSnapshot(panel, cfg, { actor: "user" })
        snapshotId = snap.id
      } catch (e) {
        console.error("[api/gtaa/run] persist failed:", (e as Error).message)
      }
    }

    const response: GtaaRunResponse = {
      run,
      sensitivity: body.sensitivity ? runSensitivity(panel, cfg) : [],
      walkforward: body.walkforward
        ? runWalkForward(panel, cfg)
        : null,
      montecarlo:
        body.montecarlo || body.walkforward
          ? {
              bootstrap: blockBootstrap(stratReturns, 500),
              synthetic: syntheticSeeds(cfg, Math.max(1, seeds)),
            }
          : null,
      runtimeMs: Date.now() - t0,
      runId,
      snapshotId,
    }
    void fromFile
    return NextResponse.json(response)
  } catch (err) {
    console.error("[api/gtaa/run]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    )
  }
}
