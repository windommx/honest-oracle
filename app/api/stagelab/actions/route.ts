import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { actionCreate, actionUpdate, idParam, page, pageParams, readJson } from '@/lib/stagelab/http'
import { weekKey } from '@/lib/stagelab/utils'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

export const GET = guarded('actions.GET', async (req: Request) => {
  const g = await gate('weekly', req)
  if (!g.ok) return g.response

  const week = new URL(req.url).searchParams.get('weekOf')
  const where = { userId: g.ctx.user.id, ...(week ? { weekOf: week } : {}) }
  const range = pageParams(req)

  const [actions, total] = await Promise.all([
    prisma.stageActionItem.findMany({
      where,
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
      take: range.take,
      skip: range.skip,
    }),
    prisma.stageActionItem.count({ where }),
  ])
  return NextResponse.json({ actions, ...page(actions, total, range) })
})

export const POST = guarded('actions.POST', async (req: Request) => {
  const g = await gate('weekly', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, actionCreate)
  if (!parsed.ok) return parsed.response

  const count = await prisma.stageActionItem.count({ where: { userId } })
  const capped = overRowCap(g.ctx.plan, 'actions', count)
  if (capped) return capped

  const { weekOf, ...rest } = parsed.data
  const action = await prisma.stageActionItem.create({
    data: { ...rest, userId, weekOf: weekOf ?? weekKey() },
  })
  return NextResponse.json({ action })
})

export const PUT = guarded('actions.PUT', async (req: Request) => {
  const g = await gate('weekly', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, actionUpdate)
  if (!parsed.ok) return parsed.response
  const { id, ...fields } = parsed.data

  const { count } = await prisma.stageActionItem.updateMany({ where: { id, userId }, data: fields })
  if (count === 0) return notFound('ไม่พบรายการในแผน')

  const action = await prisma.stageActionItem.findFirst({ where: { id, userId } })
  return NextResponse.json({ action })
})

export const DELETE = guarded('actions.DELETE', async (req: Request) => {
  const g = await gate('weekly', req)
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageActionItem.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบรายการในแผน')
  return NextResponse.json({ ok: true })
})
