import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeRemaining, stageContext, unauthorized } from '@/lib/stagelab/guard'
import { ensureTenant } from '@/lib/stagelab/bootstrap'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stagelab/session
 *
 * One call the shell makes on mount: who the customer is, what their plan
 * unlocks, how much of it they have used, and whether their book is empty.
 * The client gates navigation on `features`, but every route re-checks — this
 * payload is for rendering locks, not for authorization.
 */
export async function GET() {
  const ctx = await stageContext()
  if (!ctx) return unauthorized()

  await ensureTenant(ctx.user.id)

  const userId = ctx.user.id
  const [watchlist, positions, theses, journal, remaining] = await Promise.all([
    prisma.stageWatchlistItem.count({ where: { userId } }),
    prisma.stagePosition.count({ where: { userId } }),
    prisma.stageThesis.count({ where: { userId } }),
    prisma.stageJournalEntry.count({ where: { userId } }),
    computeRemaining(ctx),
  ])

  return NextResponse.json({
    user: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name, role: ctx.user.role },
    plan: ctx.plan.key,
    planLabel: ctx.plan.label,
    features: ctx.plan.features,
    limits: ctx.plan.limits,
    usage: { watchlist, positions, theses, journal, computeRemaining: remaining },
    isEmpty: watchlist === 0 && positions === 0 && journal === 0,
  })
}
