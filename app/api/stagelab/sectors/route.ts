import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { idParam, readJson, sectorCreate, sectorUpdate } from '@/lib/stagelab/http'
import { weekKey } from '@/lib/stagelab/utils'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

// Ownership is enforced by putting userId in the WHERE clause of every write,
// never by reading the row first and comparing. updateMany/deleteMany then
// report 0 for "not yours" and "does not exist" alike, which is the answer a
// caller should get in both cases.

export const GET = guarded('sectors.GET', async () => {
  const g = await gate('weekly')
  if (!g.ok) return g.response
  const sectors = await prisma.stageSector.findMany({
    where: { userId: g.ctx.user.id },
    orderBy: [{ score: 'desc' }, { id: 'asc' }],
  })
  return NextResponse.json({ sectors })
})

export const POST = guarded('sectors.POST', async (req: Request) => {
  const g = await gate('weekly')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, sectorCreate)
  if (!parsed.ok) return parsed.response

  const count = await prisma.stageSector.count({ where: { userId } })
  const capped = overRowCap(g.ctx.plan, 'sectors', count)
  if (capped) return capped

  const sector = await prisma.stageSector.create({
    data: { ...parsed.data, userId, weekOf: weekKey() },
  })
  return NextResponse.json({ sector })
})

export const PUT = guarded('sectors.PUT', async (req: Request) => {
  const g = await gate('weekly')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, sectorUpdate)
  if (!parsed.ok) return parsed.response
  const { id, ...fields } = parsed.data

  const { count } = await prisma.stageSector.updateMany({ where: { id, userId }, data: fields })
  if (count === 0) return notFound('ไม่พบกลุ่มอุตสาหกรรมนี้')

  const sector = await prisma.stageSector.findFirst({ where: { id, userId } })
  return NextResponse.json({ sector })
})

export const DELETE = guarded('sectors.DELETE', async (req: Request) => {
  const g = await gate('weekly')
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageSector.deleteMany({ where: { id, userId: g.ctx.user.id } })
  if (count === 0) return notFound('ไม่พบกลุ่มอุตสาหกรรมนี้')
  return NextResponse.json({ ok: true })
})
