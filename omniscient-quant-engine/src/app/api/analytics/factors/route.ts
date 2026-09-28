import { NextResponse } from 'next/server';
import { getFactorModel, getVolcano } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [factors, volcano] = await Promise.all([getFactorModel(), getVolcano()]);
    return NextResponse.json({
      factors: factors.factors,
      explainedTotal: factors.explainedTotal,
      exposures: factors.exposures,
      storyStock: factors.storyStock,
      pcaScatter: factors.pcaScatter,
      enrichment: factors.enrichment,
      bipartite: factors.bipartite,
      trajectories: factors.trajectories,
      regimeLabel: factors.regimeLabel,
      volcano: {
        points: volcano.points,
        nRiskOn: volcano.nRiskOn,
        nRiskOff: volcano.nRiskOff,
        nSignificant: volcano.nSignificant,
        upCount: volcano.upCount,
        downCount: volcano.downCount,
        topFeatures: volcano.topFeatures.slice(0, 12),
      },
    });
  } catch (e) {
    console.error('factors error', e);
    return NextResponse.json({ error: 'factors failed', detail: String(e) }, { status: 500 });
  }
}
