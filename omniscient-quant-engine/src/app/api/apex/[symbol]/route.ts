import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { db } from '@/lib/db';
import { ensureSeeded, loadMarketState } from '@/lib/quant/engine/panel';
import { getBacktest, getBoard, getProbs } from '@/lib/quant/engine/api';
import { buildApexDossier } from '@/lib/quant/engine/apex';
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
    // Risk MDX (7 มิติ) ของ Meta-Risk ออกคำสั่ง size override — Apex คือขนาดไม้สุดท้ายจึงต้องอ่านคำสั่งนี้ด้วย
    const meta = buildMetaRiskDossier(
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
    const dossier = buildApexDossier(state, sym, bt, probs[sym] ?? 0.5, { riskMdx: meta?.riskMdx ?? null });
    if (!dossier) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    return NextResponse.json({ dossier, rules: await rulesStamp() });
  } catch (e) {
    return serverError('apex failed', e);
  }
}
