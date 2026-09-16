import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { gate, notFound } from '@/lib/stagelab/guard'
import { checklistPatch, checklistReset, readJson } from '@/lib/stagelab/http'
import { ensureTenant } from '@/lib/stagelab/bootstrap'
import { CHECKLIST_CATEGORIES } from '@/lib/stagelab/seed-data'

export const dynamic = 'force-dynamic'

type Row = { category: string; sortOrder: number }

function byRoutineOrder(a: Row, b: Row) {
  const ca = CHECKLIST_CATEGORIES.indexOf(a.category as (typeof CHECKLIST_CATEGORIES)[number])
  const cb = CHECKLIST_CATEGORIES.indexOf(b.category as (typeof CHECKLIST_CATEGORIES)[number])
  if (ca !== cb) return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb)
  return a.sortOrder - b.sortOrder
}

export async function GET() {
  const g = await gate('tools')
  if (!g.ok) return g.response

  await ensureTenant(g.ctx.user.id)
  const items = await prisma.stageChecklistItem.findMany({ where: { userId: g.ctx.user.id } })
  items.sort(byRoutineOrder)
  return NextResponse.json({ items })
}

export async function PATCH(req: Request) {
  const g = await gate('tools')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const parsed = await readJson(req, checklistPatch)
  if (!parsed.ok) return parsed.response

  const { count } = await prisma.stageChecklistItem.updateMany({
    where: { id: parsed.data.id, userId },
    data: { done: parsed.data.done },
  })
  if (count === 0) return notFound('ไม่พบรายการเช็คลิสต์')

  const item = await prisma.stageChecklistItem.findFirst({ where: { id: parsed.data.id, userId } })
  return NextResponse.json({ item })
}

/** POST — start the next cycle: clear every tick in one category. */
export async function POST(req: Request) {
  const g = await gate('tools')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const parsed = await readJson(req, checklistReset)
  if (!parsed.ok) return parsed.response

  await prisma.stageChecklistItem.updateMany({
    where: { userId, category: parsed.data.category },
    data: { done: false },
  })

  const items = await prisma.stageChecklistItem.findMany({ where: { userId } })
  items.sort(byRoutineOrder)
  return NextResponse.json({ ok: true, items })
}
