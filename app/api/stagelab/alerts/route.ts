import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { gate } from '@/lib/stagelab/guard'
import { buildAlerts } from '@/lib/stagelab/alerts'
import { ensureMarketReview } from '@/lib/stagelab/bootstrap'
import { guarded } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stagelab/alerts — the Risk Radar.
 *
 * Stateless: nothing is stored. It re-derives every warning from the customer's
 * current review, open positions and watchlist each time, so a stale alert can
 * never outlive the condition that produced it.
 */
export const GET = guarded('alerts.GET', async (req: Request) => {
  const g = await gate('alerts', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const [review, positions, watchlist] = await Promise.all([
    prisma.stageMarketReview
      .findFirst({ where: { userId }, orderBy: { id: 'desc' } })
      .then((r) => r ?? ensureMarketReview(userId)),
    prisma.stagePosition.findMany({ where: { userId } }),
    prisma.stageWatchlistItem.findMany({ where: { userId } }),
  ])

  // A review row exists from first visit but scores 0/10 until it is filled
  // in. Passing that through would open every new account with a critical
  // "the market is in Stage 4" alert the customer never said.
  return NextResponse.json(
    buildAlerts({ review: review.scoredAt === null ? null : review, positions, watchlist }),
  )
})
