import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { runProfitEngine } from "@/lib/research/profit-engine"
import type { BacktestStats, TrialListResponse, TrialResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/research/trial → รัน Profit Engine ครบชุด (ใช้กติกา prereg ถ้ามี)
export async function POST() {
  try {
    const result = await runProfitEngine()
    return NextResponse.json<TrialResponse>(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// GET /api/research/trial → ประวัติการรัน 10 ครั้งล่าสุด
export async function GET() {
  try {
    const runs = await db.researchRun.findMany({
      where: { kind: "trial" },
      orderBy: { createdAt: "desc" },
      take: 10,
    })
    return NextResponse.json<TrialListResponse>({
      runs: runs.map((r) => {
        let summary: {
          passed?: number
          total?: number
          strategy?: BacktestStats
        } = {}
        try {
          summary = JSON.parse(r.result) as typeof summary
        } catch {
          // row เสียหาย — ใช้ค่าว่าง
        }
        return {
          id: r.id,
          verdict: r.verdict,
          paramsHash: r.paramsHash,
          passed: summary.passed ?? 0,
          total: summary.total ?? 7,
          cagr: summary.strategy?.cagr ?? 0,
          maxDD: summary.strategy?.maxDD ?? 0,
          createdAt: r.createdAt.toISOString(),
        }
      }),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
