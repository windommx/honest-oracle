import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server/session'
import { gate } from '@/lib/stagelab/guard'
import { fail, guarded } from '@/lib/stagelab/problem'
import { ensureUniverse, invalidateUniverseCache, syncUniverse } from '@/lib/stagelab/bootstrap'
import { tenantMarketView } from '@/lib/stagelab/tenant-data'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stagelab/universe[?enrich=1]
 *
 * The shared SET universe. With `enrich=1` each row also carries the derived
 * technical block — Pine score, the 17-point technical checklist, breakout
 * state — which depends on the *caller's own* sector board and market review,
 * so the enriched shape is tenant-specific even though the stock rows are not.
 */
export const GET = guarded('universe.GET', async (req: Request) => {
  const g = await gate('screener')
  if (!g.ok) return g.response

  const enrich = new URL(req.url).searchParams.get('enrich') === '1'

  if (!enrich) {
    await ensureUniverse()
    const stocks = await prisma.stageStock.findMany({ orderBy: { symbol: 'asc' } })
    return NextResponse.json({ stocks })
  }

  // One enrichment path for the whole module — the screener, the short scanner
  // and the dashboard must not grade the same stock differently.
  const view = await tenantMarketView(g.ctx.user.id)
  return NextResponse.json({ stocks: view.stocks, hasScored: view.hasReview })
})

/** POST — republish the bundled universe. Admin only; it is shared data. */
export const POST = guarded('universe.POST', async () => {
  const admin = await requireAdmin()
  if (!admin) return fail('forbidden', 'ต้องเป็นผู้ดูแลระบบ')
  const count = await syncUniverse()
  invalidateUniverseCache()
  return NextResponse.json({ ok: true, count })
})
