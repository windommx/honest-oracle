import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { gate } from '@/lib/stagelab/guard'
import { marketReviewBody, readJson } from '@/lib/stagelab/http'
import { ensureMarketReview } from '@/lib/stagelab/bootstrap'
import { weekKey } from '@/lib/stagelab/utils'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

/** GET — the caller's latest weekly market review, created on demand. */
export const GET = guarded('marketReview.GET', async (req: Request) => {
  const g = await gate('weekly', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const latest = await prisma.stageMarketReview.findFirst({
    where: { userId },
    orderBy: { id: 'desc' },
  })
  return NextResponse.json(latest ?? (await ensureMarketReview(userId)))
})

/** POST — upsert on (user, week). Only the fields sent are written. */
export const POST = guarded('marketReview.POST', async (req: Request) => {
  const g = await gate('weekly', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, marketReviewBody)
  if (!parsed.ok) return parsed.response
  const { weekOf, ...fields } = parsed.data
  const week = weekOf ?? weekKey()

  // Saving is what marks the week as scored — see the schema comment.
  const review = await prisma.stageMarketReview.upsert({
    where: { userId_weekOf: { userId, weekOf: week } },
    create: { userId, weekOf: week, ...fields, scoredAt: new Date() },
    update: { ...fields, scoredAt: new Date() },
  })
  return NextResponse.json(review)
})
