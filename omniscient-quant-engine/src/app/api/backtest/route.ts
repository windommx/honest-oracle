import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getBacktest } from '@/lib/quant/engine/api';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [bt, rules] = await Promise.all([getBacktest(), rulesStamp()]);
    return NextResponse.json({
      rules,
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
    return serverError('backtest failed', e);
  }
}
