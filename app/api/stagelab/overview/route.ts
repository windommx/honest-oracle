import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { gate } from '@/lib/stagelab/guard'
import { ensureMarketReview, ensureTenant } from '@/lib/stagelab/bootstrap'
import { calcMarketScore, pnlPct, positionValue, weekKey } from '@/lib/stagelab/utils'
import { CHECKLIST_CATEGORIES } from '@/lib/stagelab/seed-data'
import { guarded } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stagelab/overview — everything the dashboard renders, in one call.
 *
 * The dashboard previously fired six parallel fetches and stitched them on the
 * client; on a cold serverless start that was six connection acquisitions for
 * one screen. The aggregation below is the same data, computed where the rows
 * already are.
 */
export const GET = guarded('overview.GET', async () => {
  const g = await gate('dashboard')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  await ensureTenant(userId)
  const week = weekKey()

  const [review, sectors, watchlist, positions, actions, checklist] = await Promise.all([
    prisma.stageMarketReview
      .findFirst({ where: { userId }, orderBy: { id: 'desc' } })
      .then((r) => r ?? ensureMarketReview(userId)),
    prisma.stageSector.findMany({
      where: { userId },
      orderBy: [{ score: 'desc' }, { rsVsSet: 'desc' }],
      take: 20,
    }),
    prisma.stageWatchlistItem.findMany({ where: { userId, status: 'WATCHING' } }),
    prisma.stagePosition.findMany({ where: { userId } }),
    prisma.stageActionItem.findMany({
      where: { userId, weekOf: week },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.stageChecklistItem.findMany({ where: { userId, category: 'DAILY' } }),
  ])

  const open = positions.filter((p) => p.status === 'OPEN')
  const closed = positions.filter((p) => p.status !== 'OPEN')

  const portfolioValue = open.reduce((sum, p) => sum + positionValue(toDto(p)), 0)
  const unrealized = open.reduce((sum, p) => sum + (p.currentPrice - p.entryPrice) * p.quantity, 0)
  const realized = closed.reduce(
    (sum, p) => sum + ((p.closedPrice ?? p.currentPrice) - p.entryPrice) * p.quantity,
    0,
  )
  const wins = closed.filter((p) => (p.closedPrice ?? p.currentPrice) > p.entryPrice).length
  const avgOpenPnl =
    open.length > 0 ? open.reduce((s, p) => s + pnlPct(toDto(p)), 0) / open.length : 0

  return NextResponse.json({
    weekOf: week,
    review,
    // A blank review scores 0/10, which reads as "Stage 4 bear market". On a
    // brand-new account that would be the product asserting something about
    // the market that the customer never told it.
    hasScored: review.scoredAt !== null,
    marketScore: calcMarketScore(review),
    sectors,
    watchlist: watchlist
      .slice()
      .sort((a, b) => a.priority.localeCompare(b.priority) || b.rsScore - a.rsScore),
    positions: open,
    stats: {
      portfolioValue,
      unrealized,
      realized,
      openCount: open.length,
      closedCount: closed.length,
      winRatePct: closed.length > 0 ? (wins / closed.length) * 100 : null,
      avgOpenPnlPct: avgOpenPnl,
    },
    actions,
    checklist: checklist
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((c) => CHECKLIST_CATEGORIES.includes(c.category as 'DAILY')),
  })
})

/** Prisma rows carry Date objects; the shared helpers expect the DTO shape. */
function toDto(p: {
  id: number
  symbol: string
  sector: string
  quantity: number
  entryPrice: number
  currentPrice: number
  entryStage: number
  currentStage: number
  stopLoss: number
  confidence: string
  status: string
  openedAt: Date
  closedPrice: number | null
  closedAt: Date | null
  notes: string | null
  updatedAt: Date
}) {
  return {
    ...p,
    openedAt: p.openedAt.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    updatedAt: p.updatedAt.toISOString(),
  }
}
