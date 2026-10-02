import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getSeries } from '@/lib/quant/engine/terminal';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const url = new URL(req.url);
    const tf = url.searchParams.get('tf') === '1W' ? '1W' : '1D';
    const barsRaw = Number(url.searchParams.get('bars') ?? '180');
    const bars = Math.min(750, Math.max(40, Number.isFinite(barsRaw) ? Math.round(barsRaw) : 180));
    const data = await getSeries(symbol.toUpperCase(), tf, bars);
    if (!data) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return serverError('series failed', e);
  }
}
