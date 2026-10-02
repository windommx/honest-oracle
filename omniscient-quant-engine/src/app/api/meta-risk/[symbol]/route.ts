import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { loadRiskContext, metaRiskFor } from '@/lib/quant/engine/dossiers';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const dossier = metaRiskFor(await loadRiskContext(), symbol.toUpperCase());
    if (!dossier) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    return NextResponse.json({ dossier, rules: await rulesStamp() });
  } catch (e) {
    return serverError('meta-risk failed', e);
  }
}
