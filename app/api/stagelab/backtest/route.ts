import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, spendCompute } from '@/lib/stagelab/guard'
import { backtestBody, readJson } from '@/lib/stagelab/http'
import { runBacktest } from '@/lib/stagelab/backtest'
import { ensureUniverse } from '@/lib/stagelab/bootstrap'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/stagelab/backtest — run the Stage 2 strategy over the whole
 * universe's deterministic weekly series.
 *
 * Costs 2 compute units: it walks 312 weeks × 61 symbols and is by a wide
 * margin the heaviest thing a customer can ask for.
 */
export const POST = guarded('backtest.POST', async (req: Request) => {
  const g = await gate('backtest', req)
  if (!g.ok) return g.response

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, backtestBody)
  if (!parsed.ok) return parsed.response

  await ensureUniverse()
  const universe = await prisma.stageStock.findMany({
    select: { symbol: true, sector: true },
    orderBy: { symbol: 'asc' },
  })
  if (universe.length === 0) return badRequest('ยังไม่มีข้อมูลหุ้นในระบบ')

  const denied = await spendCompute(g.ctx, 2)
  if (denied) return denied

  return NextResponse.json(runBacktest(universe, parsed.data))
})
