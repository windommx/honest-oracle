import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { idParam, journalCreate, readJson } from '@/lib/stagelab/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await gate('journal')
  if (!g.ok) return g.response

  const entries = await prisma.stageJournalEntry.findMany({
    where: { userId: g.ctx.user.id },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return NextResponse.json({ entries })
}

export async function POST(req: Request) {
  const g = await gate('journal')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const parsed = await readJson(req, journalCreate)
  if (!parsed.ok) return parsed.response

  const count = await prisma.stageJournalEntry.count({ where: { userId } })
  const capped = overRowCap(g.ctx.plan, 'journal', count)
  if (capped) return capped

  // An OPEN trade has no P/L yet; storing a number there would let it into the
  // win-rate maths as a decided outcome.
  const pnlPct = parsed.data.outcome === 'OPEN' ? null : parsed.data.pnlPct
  const entry = await prisma.stageJournalEntry.create({ data: { ...parsed.data, pnlPct, userId } })
  return NextResponse.json({ entry })
}

export async function DELETE(req: Request) {
  const g = await gate('journal')
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageJournalEntry.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบบันทึกนี้')
  return NextResponse.json({ ok: true })
}
