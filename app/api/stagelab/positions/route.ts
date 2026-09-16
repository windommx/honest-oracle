import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { idParam, positionCreate, positionUpdate, readJson } from '@/lib/stagelab/http'

export const dynamic = 'force-dynamic'

/** GET — open positions newest-first, then the closed ones. */
export async function GET() {
  const g = await gate('portfolio')
  if (!g.ok) return g.response

  const rows = await prisma.stagePosition.findMany({ where: { userId: g.ctx.user.id } })
  const open = rows
    .filter((p) => p.status === 'OPEN')
    .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
  const closed = rows
    .filter((p) => p.status !== 'OPEN')
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))

  return NextResponse.json({
    positions: [...open, ...closed],
    limit: g.ctx.plan.limits.positions,
  })
}

export async function POST(req: Request) {
  const g = await gate('portfolio')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

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
}

export async function PUT(req: Request) {
  const g = await gate('portfolio')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const parsed = await readJson(req, positionUpdate)
  if (!parsed.ok) return parsed.response
  const { id, closedAt, ...fields } = parsed.data

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

  const { count } = await prisma.stagePosition.updateMany({ where: { id, userId }, data })
  if (count === 0) return notFound('ไม่พบสถานะนี้ในพอร์ต')

  const position = await prisma.stagePosition.findFirst({ where: { id, userId } })
  return NextResponse.json({ position })
}

export async function DELETE(req: Request) {
  const g = await gate('portfolio')
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stagePosition.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบสถานะนี้ในพอร์ต')
  return NextResponse.json({ ok: true })
}
