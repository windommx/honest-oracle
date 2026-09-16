import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound, overRowCap } from '@/lib/stagelab/guard'
import { idParam, journalCreate, page, pageParams, readJson } from '@/lib/stagelab/http'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

/**
 * GET — newest first, paged.
 *
 * The journal is the one table with no natural ceiling: the plan cap runs to
 * ten thousand entries on Team, and a trader who writes one a day hits four
 * figures in three years. `take: 500` was a bound, but a silent one — the
 * client had no way to know it was looking at a truncated record.
 */
export const GET = guarded('journal.GET', async (req: Request) => {
  const g = await gate('journal')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id
  const range = pageParams(req)

  const [entries, total] = await Promise.all([
    prisma.stageJournalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: range.take,
      skip: range.skip,
    }),
    prisma.stageJournalEntry.count({ where: { userId } }),
  ])

  // `entries` is kept alongside the page envelope so the existing client keeps
  // working while it learns to page.
  return NextResponse.json({ entries, ...page(entries, total, range) })
})

export const POST = guarded('journal.POST', async (req: Request) => {
  const g = await gate('journal')
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

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
})

export const DELETE = guarded('journal.DELETE', async (req: Request) => {
  const g = await gate('journal')
  if (!g.ok) return g.response

  const id = idParam(req)
  if (id === null) return badRequest('ต้องระบุ id')

  const { count } = await prisma.stageJournalEntry.deleteMany({
    where: { id, userId: g.ctx.user.id },
  })
  if (count === 0) return notFound('ไม่พบบันทึกนี้')
  return NextResponse.json({ ok: true })
})
