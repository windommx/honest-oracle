import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getQuotes } from '@/lib/quant/engine/terminal';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getQuotes();
    return NextResponse.json(data);
  } catch (e) {
    return serverError('quotes failed', e);
  }
}
