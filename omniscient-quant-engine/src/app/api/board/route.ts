import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getBoard } from '@/lib/quant/engine/api';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [board, rules] = await Promise.all([getBoard(), rulesStamp()]);
    return NextResponse.json({ ...board, rules });
  } catch (e) {
    return serverError('board failed', e);
  }
}
