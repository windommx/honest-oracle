import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'
import {
  MAX_PAGE_SIZE,
  idParam,
  readJson,
  versionWhere,
  watchlistCreate,
  watchlistUpdate,
} from '@/lib/stagelab/http'

export const dynamic = 'force-dynamic'

const PRIORITY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

/**
 * GET — WATCHING first, then priority A→C, then RS strength.
 *
 * The ordering is a three-key comparison Prisma cannot express (WATCHING must
 * come before BOUGHT and DROPPED, which is not alphabetical), so it is done in
 * JS — but over a set the plan cap already bounds, and with an explicit take so
 * the query cost never depends on how long the account has existed.
 */
export const GET = guarded('watchlist.GET', async (req: Request) => {
  const g = await gate('watchlist', req)
  if (!g.ok) return g.response

  const cap = Math.min(MAX_PAGE_SIZE, g.ctx.plan.limits.watchlist)
  const items = await prisma.stageWatchlistItem.findMany({
    where: { userId: g.ctx.user.id },
    take: cap,
  })
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
})

export const POST = guarded('watchlist.POST', async (req: Request) => {
  const g = await gate('watchlist', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, watchlistCreate)
  if (!parsed.ok) return parsed.response

  const count = await prisma.stageWatchlistItem.count({ where: { userId } })
  const capped = overRowCap(g.ctx.plan, 'watchlist', count)
  if (capped) return capped

  const item = await prisma.stageWatchlistItem.create({ data: { ...parsed.data, userId } })
  return NextResponse.json({ item })
})

export const PUT = guarded('watchlist.PUT', async (req: Request) => {
  const g = await gate('watchlist', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, watchlistUpdate)
  if (!parsed.ok) return parsed.response
  const { id, expectedUpdatedAt, ...fields } = parsed.data

  const { count } = await prisma.stageWatchlistItem.updateMany({
    where: { id, userId, ...versionWhere(expectedUpdatedAt) },
    data: fields,
  })
  if (count === 0) {
    const current = await prisma.stageWatchlistItem.findFirst({
      where: { id, userId },
      select: { updatedAt: true },
    })
    if (!current) return notFound('ไม่พบรายการใน Watchlist')
    return conflict('รายการนี้ถูกแก้ไขจากที่อื่น — โหลดใหม่แล้วลองอีกครั้ง', {
      currentUpdatedAt: current.updatedAt.toISOString(),
    })
  }

  const item = await prisma.stageWatchlistItem.findFirst({ where: { id, userId } })
  return NextResponse.json({ item })
})

export const DELETE = guarded('watchlist.DELETE', async (req: Request) => {
  const g = await gate('watchlist', req)
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageWatchlistItem.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบรายการใน Watchlist')
  return NextResponse.json({ ok: true })
})
