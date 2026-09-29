import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { db } from '@/lib/db';
import { getBacktest, getProbs, getBoard } from '@/lib/quant/engine/api';
import { loadMarketState, ensureSeeded } from '@/lib/quant/engine/panel';
import { buildMetaRiskDossier } from '@/lib/quant/engine/meta-risk';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const sym = symbol.toUpperCase();
    await ensureSeeded(false);
    const [state, bt, probs, board, journal] = await Promise.all([
      loadMarketState(),
      getBacktest(),
      getProbs(),
      getBoard(),
      db.journalEntry.findMany({ orderBy: { runDate: 'desc' }, take: 30 }),
    ]);
    const dossier = buildMetaRiskDossier(
      state,
      sym,
      bt,
      {
        rows: board.rows.map((r) => ({ symbol: r.symbol, theme: r.theme, signal: r.signal, maxSizePct: r.maxSizePct })),
        summary: { psiStress: board.summary.psiStress },
      },
      journal.map((j) => ({ symbol: j.symbol, status: j.status, pnlPct: j.pnlPct })),
      probs[sym] ?? 0.5,
    );
    if (!dossier) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    return NextResponse.json({ dossier, rules: await rulesStamp() });
  } catch (e) {
    return serverError('meta-risk failed', e);
  }
}
