import { NextResponse } from 'next/server';
import { getDecision } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const detail = await getDecision(symbol.toUpperCase());
    if (!detail) {
      return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    console.error('decision error', e);
    return NextResponse.json({ error: 'decision failed', detail: String(e) }, { status: 500 });
  }
}
