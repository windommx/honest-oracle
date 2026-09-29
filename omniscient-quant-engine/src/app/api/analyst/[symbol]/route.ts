import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAction } from '@/lib/audit';
import { readJson, serverError } from '@/lib/http/responses';
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
    return serverError('analyst failed', e);
  }
}

const ChatBody = z.object({ question: z.string().trim().min(1, 'ต้องมีคำถาม').max(600) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const body = await readJson(req, ChatBody);
  if (!body.ok) return body.res;
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  try {
    const answer = await askAnalyst(sym, body.data.question);
    void logAction(req, 'analyst.chat', 200, { symbol: sym, chars: body.data.question.length });
    return NextResponse.json({ answer });
  } catch (e) {
    const r = llmErrorResponse(e);
    if (r) {
      void logAction(req, 'analyst.chat', r.status, { symbol: sym, error: r.body.error });
      return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
    }
    return serverError('chat failed', e);
  }
}
