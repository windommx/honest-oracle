import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureUniverse } from '@/lib/stagelab/bootstrap'
import { badRequest, gate, notFound } from '@/lib/stagelab/guard'
import { mtfAnalysis, rotationPhase, shortCandidates } from '@/lib/stagelab/pro'
import { tenantMarketView } from '@/lib/stagelab/tenant-data'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stagelab/pro?view=shorts|rotation|mtf&symbol=X
 *
 * One route for the three Pro Desk panels — they share the same enrichment
 * pass, and splitting them across three files meant three copies of it.
 */
export async function GET(req: Request) {
  const g = await gate('pro')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const params = new URL(req.url).searchParams
  const view = params.get('view') ?? 'shorts'

  if (view === 'mtf') {
    const symbol = (params.get('symbol') ?? '').trim().toUpperCase()
    if (!symbol) return badRequest('กรุณาระบุ symbol')
    await ensureUniverse()
    const stock = await prisma.stageStock.findUnique({ where: { symbol } })
    if (!stock) return notFound(`ไม่พบหุ้น ${symbol}`)
    return NextResponse.json({ mtf: mtfAnalysis(stock) })
  }

  const market = await tenantMarketView(userId)

  if (view === 'rotation') {
    return NextResponse.json({
      rotation: rotationPhase(market.sectors, market.marketScore),
      hasReview: market.hasReview,
    })
  }

  if (view === 'shorts') {
    return NextResponse.json({
      shorts: shortCandidates(market.stocks),
      marketScore: market.marketScore,
      hasReview: market.hasReview,
    })
  }

  return badRequest('view ต้องเป็น shorts | rotation | mtf')
}
