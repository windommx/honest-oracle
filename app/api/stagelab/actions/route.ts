import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { actionCreate, actionUpdate, idParam, readJson } from '@/lib/stagelab/http'
import { weekKey } from '@/lib/stagelab/utils'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await gate('weekly')
  if (!g.ok) return g.response

  const week = new URL(req.url).searchParams.get('weekOf')
  const actions = await prisma.stageActionItem.findMany({
    where: { userId: g.ctx.user.id, ...(week ? { weekOf: week } : {}) },
    orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ actions })
}

export async function POST(req: Request) {
  const g = await gate('weekly')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

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
}

export async function PUT(req: Request) {
  const g = await gate('weekly')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const parsed = await readJson(req, actionUpdate)
  if (!parsed.ok) return parsed.response
  const { id, ...fields } = parsed.data

  const { count } = await prisma.stageActionItem.updateMany({ where: { id, userId }, data: fields })
  if (count === 0) return notFound('ไม่พบรายการในแผน')

  const action = await prisma.stageActionItem.findFirst({ where: { id, userId } })
  return NextResponse.json({ action })
}

export async function DELETE(req: Request) {
  const g = await gate('weekly')
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageActionItem.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบรายการในแผน')
  return NextResponse.json({ ok: true })
}
