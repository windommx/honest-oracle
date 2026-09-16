import { prisma } from '@/lib/prisma'
import { ensureUniverse } from './bootstrap'
import { simContext } from './market-sim'
import { enrichStock } from './scoring'
import { calcMarketScore } from './utils'
import type { StockWithTech } from './types'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  The enrichment every analytical surface starts from.                    ║
// ║                                                                          ║
// ║  Enrichment is tenant-specific even though the stock rows are shared: a  ║
// ║  stock's technical score is graded against the caller's OWN sector board ║
// ║  and market review. Two customers looking at the same symbol on the same ║
// ║  day can legitimately score it differently, because they ranked the      ║
// ║  sectors differently. Centralising it here keeps that consistent across  ║
// ║  the screener, the short scanner and the dashboard.                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export interface TenantMarketView {
  stocks: StockWithTech[]
  sectors: { id: number; name: string; stage: number; trend: string; score: number }[]
  marketScore: number
  marketStage: number
  hasReview: boolean
}

export async function tenantMarketView(userId: string): Promise<TenantMarketView> {
  await ensureUniverse()
  const [stocks, sectors, reviews] = await Promise.all([
    prisma.stageStock.findMany({ orderBy: { symbol: 'asc' } }),
    prisma.stageSector.findMany({
      where: { userId },
      orderBy: [{ score: 'desc' }, { id: 'desc' }],
      select: { id: true, name: true, stage: true, trend: true, score: true },
    }),
    prisma.stageMarketReview.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 1 }),
  ])

  const sectorStage = new Map<string, number>()
  for (const s of sectors) if (!sectorStage.has(s.name)) sectorStage.set(s.name, s.stage)

  const review = reviews[0]
  // An unscored row must not feed the rotation model as if it were a reading.
  const scored = review && review.scoredAt !== null ? review : undefined
  const score = scored ? calcMarketScore(scored) : null

  const enriched: StockWithTech[] = stocks.map((s) => {
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
      score ? score.stageNum : 0,
    )
    return { ...s, tech }
  })

  return {
    stocks: enriched,
    sectors,
    // 5 is the neutral midpoint the rotation model expects when a customer has
    // not scored the market yet — not a claim that the market is neutral.
    marketScore: score ? score.score : 5,
    marketStage: score ? score.stageNum : 0,
    hasReview: Boolean(scored),
  }
}
