import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { DecisionRow, DecisionsResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/jev/decisions?limit=120 → audit log ของสมอง Jev (ล่าสุดก่อน)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const raw = Number.parseInt(url.searchParams.get("limit") ?? "", 10)
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 500) : 100

    const rows = await db.decision.findMany({ orderBy: { id: "desc" }, take: limit })
    const decisions: DecisionRow[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      question: r.question,
      target: r.target,
      action: r.action,
      conf: r.conf,
      reason: r.reason,
      executed: r.executed,
      outcome: r.outcome,
      source: r.source,
    }))
    return NextResponse.json<DecisionsResponse>({ decisions })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
