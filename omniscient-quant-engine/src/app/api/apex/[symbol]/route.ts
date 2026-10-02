import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { apexFor, loadRiskContext } from '@/lib/quant/engine/dossiers';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    // Risk MDX (7 มิติ) ของ Meta-Risk ออกคำสั่ง size override — Apex คือขนาดไม้สุดท้ายจึงต้องอ่านคำสั่งนี้ด้วย (apexFor)
    const dossier = apexFor(await loadRiskContext(), symbol.toUpperCase());
    if (!dossier) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    return NextResponse.json({ dossier, rules: await rulesStamp() });
  } catch (e) {
    return serverError('apex failed', e);
  }
}
