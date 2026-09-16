import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, notFound } from '@/lib/stagelab/guard'
import { genSeries } from '@/lib/stagelab/market-sim'
import { ensureUniverse } from '@/lib/stagelab/bootstrap'
import { guarded } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stagelab/series?symbol=DELTA → last 156 weekly bars.
 *
 * The synthetic series is rescaled so its final close equals the stock's
 * stored price; without that the chart and the price tag beside it disagree by
 * whatever the generator happened to drift to.
 */
export const GET = guarded('series.GET', async (req: Request) => {
  const g = await gate('screener', req)
  if (!g.ok) return g.response

  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (!symbol) return badRequest('กรุณาระบุ symbol')

  await ensureUniverse()
  const stock = await prisma.stageStock.findUnique({ where: { symbol } })
  if (!stock) return notFound('ไม่พบหุ้นนี้ในจักรวาลข้อมูล')

  const { bars } = genSeries(symbol)
  const last = bars[bars.length - 1]
  const scale = last && last.c > 0 && stock.price > 0 ? stock.price / last.c : 1

  return NextResponse.json({
    symbol,
    name: stock.name,
    sector: stock.sector,
    stage: stock.stage,
    bars: bars.slice(-156).map((b) => ({
      ...b,
      o: b.o * scale,
      h: b.h * scale,
      l: b.l * scale,
      c: b.c * scale,
      ma30: b.ma30 * scale,
    })),
  })
})
