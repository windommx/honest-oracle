import { NextResponse } from 'next/server'
import { badRequest, gate, spendCompute } from '@/lib/stagelab/guard'
import { monteCarloBody, readJson } from '@/lib/stagelab/http'
import { runMonteCarlo } from '@/lib/stagelab/quant'
import { isStageInputError } from '@/lib/stagelab/domain-error'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST — bootstrap the customer's own trade returns into an equity fan. */
export const POST = guarded('quant.monteCarlo.POST', async (req: Request) => {
  const g = await gate('quant')
  if (!g.ok) return g.response

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, monteCarloBody)
  if (!parsed.ok) return parsed.response

  const returns = parsed.data.returns.filter((n) => Number.isFinite(n))
  if (returns.length < 5) return badRequest('ต้องมีอย่างน้อย 5 เทรดจึงจะจำลองได้')

  const denied = await spendCompute(g.ctx, 1)
  if (denied) return denied

  try {
    return NextResponse.json(
      runMonteCarlo({
        returns,
        sims: parsed.data.sims,
        capital: parsed.data.capital,
        method: parsed.data.method,
        blockSize: parsed.data.blockSize,
        avgHoldWeeks: parsed.data.avgHoldWeeks,
      }),
    )
  } catch (error) {
    // Only a rejection the engine wrote for a user gets shown to one. Anything
    // else is a defect and falls through to guarded(), which logs it.
    if (isStageInputError(error)) return badRequest(error.message)
    throw error
  }
})
