import { NextResponse } from 'next/server'
import { ensureUniverse } from '@/lib/stagelab/bootstrap'
import { badRequest, gate, notFound, spendCompute } from '@/lib/stagelab/guard'
import { unifiedScore } from '@/lib/stagelab/quant'
import { guarded } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

/** GET ?symbol= — the 360° score: technical, fundamental, macro, risk, execution. */
export const GET = guarded('quant.unified.GET', async (req: Request) => {
  const g = await gate('quant')
  if (!g.ok) return g.response

  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (!symbol) return badRequest('กรุณาระบุ symbol')

  await ensureUniverse()

  const denied = await spendCompute(g.ctx, 1)
  if (denied) return denied

  const result = await unifiedScore(g.ctx.user.id, symbol)
  if (!result) return notFound(`ไม่พบหุ้น ${symbol}`)
  return NextResponse.json(result)
})
