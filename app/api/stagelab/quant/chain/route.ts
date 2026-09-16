import { NextResponse } from 'next/server'
import { gate, spendCompute } from '@/lib/stagelab/guard'
import { appendNight, readChain } from '@/lib/stagelab/quant'
import { guarded } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The audit chain.
 *
 * GET verifies and returns it; it does NOT append. An earlier version created
 * night #1 on first read, which meant merely opening the tab wrote a block —
 * and a chain that grows when you look at it is not evidence of anything.
 * Appending is an explicit POST.
 */
export const GET = guarded('quant.chain.GET', async () => {
  const g = await gate('audit')
  if (!g.ok) return g.response
  return NextResponse.json(await readChain(g.ctx.user.id))
})

export const POST = guarded('quant.chain.POST', async () => {
  const g = await gate('audit')
  if (!g.ok) return g.response

  const denied = await spendCompute(g.ctx, 2)
  if (denied) return denied

  const entry = await appendNight(g.ctx.user.id)
  const chain = await readChain(g.ctx.user.id)
  return NextResponse.json({ entry, chain })
})
