import { NextResponse } from 'next/server'
import { badRequest, gate, spendCompute } from '@/lib/stagelab/guard'
import { monteCarloBody, readJson } from '@/lib/stagelab/http'
import { runMonteCarlo } from '@/lib/stagelab/quant'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST — bootstrap the customer's own trade returns into an equity fan. */
export async function POST(req: Request) {
  const g = await gate('quant')
  if (!g.ok) return g.response

  const parsed = await readJson(req, monteCarloBody)
  if (!parsed.ok) return parsed.response

  const returns = parsed.data.returns.filter((n) => Number.isFinite(n))
  if (returns.length < 5) return badRequest('ต้องมีอย่างน้อย 5 เทรดจึงจะจำลองได้')

  const denied = await spendCompute(g.ctx, 1)
  if (denied) return denied

  try {
    return NextResponse.json(
      runMonteCarlo({ returns, sims: parsed.data.sims, capital: parsed.data.capital }),
    )
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'จำลองไม่สำเร็จ')
  }
}
