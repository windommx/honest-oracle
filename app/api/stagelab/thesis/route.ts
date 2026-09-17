import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { idParam, readJson, thesisBody } from '@/lib/stagelab/http'
import { combinedScore, fundScore } from '@/lib/stagelab/scoring'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

type Body = Awaited<ReturnType<typeof thesisBody.parse>>

/**
 * What is recomputed here, and what is not.
 *
 * `fundScore`, `combinedScore` and `tier` are ALWAYS derived server-side from
 * the raw fundamental inputs. A client that could post its own `tier` would
 * mark every idea S+, and the point of the thesis page is that the grade
 * follows the evidence.
 *
 * `tech17` is DIFFERENT and the previous version of this comment was wrong to
 * imply otherwise: it is the customer's own reading of the chart, typed in by
 * hand, because the server has no technical observation of its own to check it
 * against. It is validated to the engine's real range and nothing more. It
 * feeds the tier, so a customer can move their own grade by overstating their
 * own chart read — which is a self-assessment tool working as intended, not a
 * hole, but it is not the same guarantee as the fundamentals and should not be
 * described as one.
 */
function scoresFor(input: Body) {
  const fund = fundScore(input)
  const combined = combinedScore(input.tech17, fund.score)
  return { fundScore: fund.score, combinedScore: combined.score, tier: combined.tier }
}

export const GET = guarded('thesis.GET', async (req: Request) => {
  const g = await gate('thesis', req)
  if (!g.ok) return g.response

  const theses = await prisma.stageThesis.findMany({
    where: { userId: g.ctx.user.id },
    include: { quarters: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { id: 'desc' },
  })
  return NextResponse.json({ theses, limit: g.ctx.plan.limits.theses })
})

export const POST = guarded('thesis.POST', async (req: Request) => {
  const g = await gate('thesis', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, thesisBody)
  if (!parsed.ok) return parsed.response

  const count = await prisma.stageThesis.count({ where: { userId } })
  const capped = overRowCap(g.ctx.plan, 'theses', count)
  if (capped) return capped

  const { quarters, id: _ignored, expectedUpdatedAt: _unused, ...fields } = parsed.data
  const thesis = await prisma.stageThesis.create({
    data: {
      ...fields,
      ...scoresFor(parsed.data),
      userId,
      quarters: { create: quarters.map((q, i) => ({ ...q, sortOrder: i })) },
    },
    include: { quarters: { orderBy: { sortOrder: 'asc' } } },
  })
  return NextResponse.json({ thesis })
})

/** PUT — full replace of one thesis, quarters included. */
export const PUT = guarded('thesis.PUT', async (req: Request) => {
  const g = await gate('thesis', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, thesisBody)
  if (!parsed.ok) return parsed.response
  const { quarters, id, expectedUpdatedAt, ...fields } = parsed.data
  if (!id) return badRequest('ต้องระบุ id')

  const owned = await prisma.stageThesis.findFirst({
    where: { id, userId },
    select: { id: true, updatedAt: true },
  })
  if (!owned) return notFound('ไม่พบ Thesis นี้')
  // A thesis is long-form and slow to write; clobbering someone's other tab
  // loses real work rather than a number.
  if (expectedUpdatedAt && owned.updatedAt.toISOString() !== expectedUpdatedAt) {
    return conflict('Thesis นี้ถูกแก้ไขจากที่อื่น — โหลดใหม่แล้วลองอีกครั้ง', {
      currentUpdatedAt: owned.updatedAt.toISOString(),
    })
  }

  // Quarters are positional, so a replace is the honest update: reconciling by
  // index would silently re-label a customer's EPS history when they delete a
  // row from the middle.
  const thesis = await prisma.$transaction(async (tx) => {
    await tx.stageEarningsQuarter.deleteMany({ where: { thesisId: id } })
    return tx.stageThesis.update({
      where: { id },
      data: {
        ...fields,
        ...scoresFor(parsed.data),
        quarters: { create: quarters.map((q, i) => ({ ...q, sortOrder: i })) },
      },
      include: { quarters: { orderBy: { sortOrder: 'asc' } } },
    })
  })
  return NextResponse.json({ thesis })
})

export const DELETE = guarded('thesis.DELETE', async (req: Request) => {
  const g = await gate('thesis', req)
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageThesis.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบ Thesis นี้')
  return NextResponse.json({ ok: true })
})
