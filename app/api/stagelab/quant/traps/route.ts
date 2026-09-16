import { NextResponse } from 'next/server'
import { ensureUniverse } from '@/lib/stagelab/bootstrap'
import { gate, spendCompute } from '@/lib/stagelab/guard'
import { scanTraps } from '@/lib/stagelab/quant'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET — dividend-trap scan across the universe, graded against the caller's theses. */
export async function GET() {
  const g = await gate('quant')
  if (!g.ok) return g.response

  await ensureUniverse()

  const denied = await spendCompute(g.ctx, 1)
  if (denied) return denied

  return NextResponse.json(await scanTraps(g.ctx.user.id))
}
