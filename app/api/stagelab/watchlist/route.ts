import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { idParam, readJson, watchlistCreate, watchlistUpdate } from '@/lib/stagelab/http'

export const dynamic = 'force-dynamic'

const PRIORITY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

/** GET — WATCHING first, then priority A→C, then RS strength. */
export async function GET() {
  const g = await gate('watchlist')
  if (!g.ok) return g.response

  const items = await prisma.stageWatchlistItem.findMany({ where: { userId: g.ctx.user.id } })
  items.sort((a, b) => {
    const aw = a.status === 'WATCHING' ? 0 : 1
    const bw = b.status === 'WATCHING' ? 0 : 1
    if (aw !== bw) return aw - bw
    const pa = PRIORITY_ORDER[a.priority] ?? 3
    const pb = PRIORITY_ORDER[b.priority] ?? 3
    if (pa !== pb) return pa - pb
    return b.rsScore - a.rsScore
  })
  return NextResponse.json({ items, limit: g.ctx.plan.limits.watchlist })
}

export async function POST(req: Request) {
  const g = await gate('watchlist')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const parsed = await readJson(req, watchlistCreate)
  if (!parsed.ok) return parsed.response

  const count = await prisma.stageWatchlistItem.count({ where: { userId } })
  const capped = overRowCap(g.ctx.plan, 'watchlist', count)
  if (capped) return capped

  const item = await prisma.stageWatchlistItem.create({ data: { ...parsed.data, userId } })
  return NextResponse.json({ item })
}

export async function PUT(req: Request) {
  const g = await gate('watchlist')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const parsed = await readJson(req, watchlistUpdate)
  if (!parsed.ok) return parsed.response
  const { id, ...fields } = parsed.data

  const { count } = await prisma.stageWatchlistItem.updateMany({
    where: { id, userId },
    data: fields,
  })
  if (count === 0) return notFound('ไม่พบรายการใน Watchlist')

  const item = await prisma.stageWatchlistItem.findFirst({ where: { id, userId } })
  return NextResponse.json({ item })
}

export async function DELETE(req: Request) {
  const g = await gate('watchlist')
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageWatchlistItem.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบรายการใน Watchlist')
  return NextResponse.json({ ok: true })
}
