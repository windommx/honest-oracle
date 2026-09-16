import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'
import {
  MAX_PAGE_SIZE,
  idParam,
  positionCreate,
  positionUpdate,
  readJson,
  versionWhere,
} from '@/lib/stagelab/http'

export const dynamic = 'force-dynamic'

/**
 * GET — open positions newest-first, then the closed ones.
 *
 * Two bounded queries rather than one unbounded fetch-and-sort: the ordering
 * the portfolio wants (open before closed, each by its own date) is not
 * expressible as a single Prisma orderBy, and doing it in JS meant loading a
 * customer's entire trade history to render five open rows.
 */
export const GET = guarded('positions.GET', async () => {
  const g = await gate('portfolio')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id
  const cap = Math.min(MAX_PAGE_SIZE, g.ctx.plan.limits.positions)

  const [open, closed, closedTotal] = await Promise.all([
    prisma.stagePosition.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      take: cap,
    }),
    prisma.stagePosition.findMany({
      where: { userId, status: { not: 'OPEN' } },
      orderBy: { closedAt: 'desc' },
      take: cap,
    }),
    prisma.stagePosition.count({ where: { userId, status: { not: 'OPEN' } } }),
  ])

  return NextResponse.json({
    positions: [...open, ...closed],
    limit: g.ctx.plan.limits.positions,
    closedTotal,
    closedTruncated: closedTotal > closed.length,
  })
})

export const POST = guarded('positions.POST', async (req: Request) => {
  const g = await gate('portfolio')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, positionCreate)
  if (!parsed.ok) return parsed.response

  // Only OPEN positions count against the cap: a closed trade is history, and
  // charging a customer's plan for their own track record would be perverse.
  const count = await prisma.stagePosition.count({ where: { userId, status: 'OPEN' } })
  const capped = overRowCap(g.ctx.plan, 'positions', count)
  if (capped) return capped

  const { currentPrice, ...rest } = parsed.data
  const position = await prisma.stagePosition.create({
    data: { ...rest, userId, currentPrice: currentPrice ?? rest.entryPrice },
  })
  return NextResponse.json({ position })
})

export const PUT = guarded('positions.PUT', async (req: Request) => {
  const g = await gate('portfolio')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, positionUpdate)
  if (!parsed.ok) return parsed.response
  const { id, closedAt, expectedUpdatedAt, ...fields } = parsed.data

  const data: Record<string, unknown> = { ...fields }
  if (fields.status === 'CLOSED') {
    // Close stamps a time even when the client omits one, so a closed row can
    // never sort as if it were still open.
    data.closedAt = closedAt ? new Date(closedAt) : new Date()
  } else if (closedAt !== undefined) {
    data.closedAt = closedAt === null ? null : new Date(closedAt)
  }
  if (fields.status === 'OPEN') {
    data.closedAt = null
    data.closedPrice = null
  }

  const { count } = await prisma.stagePosition.updateMany({
    where: { id, userId, ...versionWhere(expectedUpdatedAt) },
    data,
  })

  if (count === 0) {
    // Zero rows means one of two very different things. Tell them apart, so a
    // stale tab is told to reload rather than told the position vanished.
    const current = await prisma.stagePosition.findFirst({
      where: { id, userId },
      select: { updatedAt: true },
    })
    if (!current) return notFound('ไม่พบสถานะนี้ในพอร์ต')
    return conflict('สถานะนี้ถูกแก้ไขจากที่อื่นหลังจากคุณเปิดหน้านี้ — โหลดใหม่แล้วลองอีกครั้ง', {
      currentUpdatedAt: current.updatedAt.toISOString(),
    })
  }

  const position = await prisma.stagePosition.findFirst({ where: { id, userId } })
  return NextResponse.json({ position })
})

export const DELETE = guarded('positions.DELETE', async (req: Request) => {
  const g = await gate('portfolio')
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stagePosition.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบสถานะนี้ในพอร์ต')
  return NextResponse.json({ ok: true })
})
