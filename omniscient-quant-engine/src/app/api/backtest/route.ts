import { NextResponse } from 'next/server';
import { getBacktest } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const bt = await getBacktest();
    return NextResponse.json({
      metrics: bt.metrics,
      equity: bt.equity,
      attribution: bt.attribution,
      calibration: bt.calibration,
      recentSignals: bt.trades
        .filter((t) => t.signal)
        .slice(-40)
        .reverse(),
    });
  } catch (e) {
    console.error('backtest error', e);
    return NextResponse.json({ error: 'backtest failed', detail: String(e) }, { status: 500 });
  }
}
