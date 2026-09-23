import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { TH_STRATEGY } from "@/lib/config/thai"
import { buildMomentumSignals, runBacktest } from "@/lib/momentum/engine"
import { emitEvent } from "@/lib/research/events"
import type {
  BacktestListResponse,
  BacktestParams,
  BacktestResult,
  BacktestStats,
} from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// defaults ตาม config ตลาดไทย (k=3, hold=8, stop -9%, maxPos 7, cost 30bps + slip 40bps)
const DEFAULTS: BacktestParams = {
  k: TH_STRATEGY.k,
  hold: TH_STRATEGY.hold,
  stopPct: TH_STRATEGY.stopPct,
  maxPos: TH_STRATEGY.maxPos,
  costBps: TH_STRATEGY.costBps,
  slipBps: TH_STRATEGY.slipBpsBase,
}
const LIMITS: {
  key: keyof BacktestParams
  min: number
  max: number
  label: string
  integer?: boolean
}[] = [
  // k/hold/maxPos เป็นจำนวนนับ — maxPos เศษ (เช่น 1.5) ให้ถือได้ 2 ตัว ตัวละ 1/1.5 = gross 133% (leverage)
  { key: "k", min: 1, max: 7, label: "k", integer: true },
  { key: "hold", min: 1, max: 60, label: "hold", integer: true },
  { key: "stopPct", min: 0.02, max: 0.5, label: "stopPct" },
  { key: "maxPos", min: 1, max: 30, label: "maxPos", integer: true },
  { key: "costBps", min: 0, max: 500, label: "costBps" },
  { key: "slipBps", min: 0, max: 500, label: "slipBps", integer: true },
]

function parseParams(body: Record<string, unknown>): { params?: BacktestParams; errors: string[] } {
  const params: BacktestParams = { ...DEFAULTS }
  const errors: string[] = []
  for (const { key, min, max, label, integer } of LIMITS) {
    const raw = body[key]
    if (raw === undefined || raw === null || raw === "") continue
    const num = typeof raw === "number" ? raw : Number(raw)
    if (!isFinite(num)) {
      errors.push(`${label} ต้องเป็นตัวเลข`)
      continue
    }
    if (num < min || num > max) {
      errors.push(`${label} ต้องอยู่ระหว่าง ${min}-${max}`)
      continue
    }
    ;(params[key] as number) = integer ? Math.round(num) : num
  }
  return errors.length > 0 ? { errors } : { params, errors }
}

// POST /api/backtest → รัน backtest momentum (T+1 fill, stop/time exit) และบันทึกผล
export async function POST(req: Request) {
  try {
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = await req.json()
      // JSON ที่ไม่ใช่ object (null, ตัวเลข, array) → ถือเป็น body ว่าง แทนที่จะพังเป็น 500
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
    } catch {
      body = {}
    }
    const { params, errors } = parseParams(body)
    if (!params) {
      return NextResponse.json({ error: `พารามิเตอร์ไม่ถูกต้อง: ${errors.join(", ")}` }, { status: 400 })
    }

    const signals = await buildMomentumSignals(params.k)
    if (signals.size < 2) {
      return NextResponse.json({ error: "ข้อมูลราคาไม่พอสำหรับ backtest (ต้องมีอย่างน้อย 2 วัน)" }, { status: 400 })
    }

    const full = await runBacktest(params, signals)

    // ---- บันทึกผลรัน ----
    const run = await db.backtestRun.create({
      data: {
        params: JSON.stringify(params),
        result: JSON.stringify({ stats: full.stats, nPoints: full.equity.length, nTrades: full.stats.trades }),
      },
    })
    await emitEvent("backtest", "system", {
      runId: run.id,
      params,
      cagr: full.stats.cagr,
      maxDD: full.stats.maxDD,
      trades: full.stats.trades,
    })

    return NextResponse.json<BacktestResult>({
      id: run.id,
      params,
      equity: full.equity,
      stats: full.stats,
      trades: full.trades,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// GET /api/backtest → ประวัติการรัน 10 ครั้งล่าสุด
export async function GET() {
  try {
    const runs = await db.backtestRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
    const mapped = runs.map((r) => {
      let params: BacktestParams = { ...DEFAULTS }
      let stats: BacktestStats | undefined
      try {
        // normalize: แถวเก่าที่ไม่มี slipBps ให้เติม default อัตโนมัติ
        params = { ...DEFAULTS, ...(JSON.parse(r.params) as BacktestParams) }
        stats = (JSON.parse(r.result) as { stats?: BacktestStats }).stats
      } catch {
        // row เสียหาย — ส่ง default แทน
      }
      return {
        id: r.id,
        params,
        stats: stats ?? {
          trades: 0, winRate: 0, avgRet: 0, stopShare: 0, timeShare: 0, totalRet: 0,
          cagr: 0, maxDD: 0, sharpe: 0, exposure: 0, benchTotal: 0, benchCagr: 0,
        },
        createdAt: r.createdAt.toISOString(),
      }
    })
    return NextResponse.json<BacktestListResponse>({ runs: mapped })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
