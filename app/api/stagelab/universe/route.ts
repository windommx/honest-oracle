import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server/session'
import { gate, serverError } from '@/lib/stagelab/guard'
import { ensureUniverse, syncUniverse } from '@/lib/stagelab/bootstrap'
import { simContext } from '@/lib/stagelab/market-sim'
import { enrichStock } from '@/lib/stagelab/scoring'
import { calcMarketScore } from '@/lib/stagelab/utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stagelab/universe[?enrich=1]
 *
 * The shared SET universe. With `enrich=1` each row also carries the derived
 * technical block — Pine score, the 17-point technical checklist, breakout
 * state — which depends on the *caller's own* sector board and market review,
 * so the enriched shape is tenant-specific even though the stock rows are not.
 */
export async function GET(req: Request) {
  const g = await gate('screener')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  try {
    const enrich = new URL(req.url).searchParams.get('enrich') === '1'
    await ensureUniverse()
    const stocks = await prisma.stageStock.findMany({ orderBy: { symbol: 'asc' } })
    if (!enrich) return NextResponse.json({ stocks })

    const [sectors, reviews] = await Promise.all([
      prisma.stageSector.findMany({ where: { userId }, orderBy: { id: 'desc' } }),
      prisma.stageMarketReview.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 1 }),
    ])

    const sectorStage = new Map<string, number>()
    for (const s of sectors) if (!sectorStage.has(s.name)) sectorStage.set(s.name, s.stage)

    const review = reviews[0]
    const marketStage = review ? calcMarketScore(review).stageNum : 0

    const enriched = stocks.map((s) => {
      const ctx = simContext(s.symbol)
      const tech = enrichStock(
        s,
        {
          rsPrev: ctx.rsPrev,
          volRatio: ctx.volRatio,
          candleUp: ctx.lastBar.c >= ctx.lastBar.o,
          atr: ctx.atr,
          highestHigh10: ctx.highestHigh10,
          lastClose: ctx.lastBar.c,
        },
        sectorStage.get(s.sector) ?? 0,
        marketStage,
      )
      return { ...s, tech }
    })

    return NextResponse.json({ stocks: enriched })
  } catch (error) {
    return serverError(error instanceof Error ? error.message : undefined)
  }
}

/** POST — republish the bundled universe. Admin only; it is shared data. */
export async function POST() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 })
  const count = await syncUniverse()
  return NextResponse.json({ ok: true, count })
}
