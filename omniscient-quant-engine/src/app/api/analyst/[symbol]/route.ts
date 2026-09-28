import { NextResponse } from 'next/server';
import { getAnalyst, askAnalyst } from '@/lib/quant/engine/terminal';
import { llmErrorResponse } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const data = await getAnalyst(symbol.toUpperCase());
    if (!data) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('analyst GET error', e);
    return NextResponse.json({ error: 'analyst failed', detail: String(e) }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const body = (await req.json().catch(() => ({}))) as { question?: string };
    const question = (body.question ?? '').trim();
    if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });
    const answer = await askAnalyst(symbol.toUpperCase(), question.slice(0, 600));
    return NextResponse.json({ answer });
  } catch (e) {
    const r = llmErrorResponse(e);
    if (r) return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
    console.error('analyst POST error', e);
    return NextResponse.json({ error: 'chat failed', detail: String(e) }, { status: 500 });
  }
}
