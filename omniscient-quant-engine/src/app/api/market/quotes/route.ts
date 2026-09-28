import { NextResponse } from 'next/server';
import { getQuotes } from '@/lib/quant/engine/terminal';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getQuotes();
    return NextResponse.json(data);
  } catch (e) {
    console.error('quotes error', e);
    return NextResponse.json({ error: 'quotes failed', detail: String(e) }, { status: 500 });
  }
}
