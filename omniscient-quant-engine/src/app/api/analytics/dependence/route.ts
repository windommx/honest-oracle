import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getThetaMatrix } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getThetaMatrix();
    return NextResponse.json(data);
  } catch (e) {
    return serverError('dependence failed', e);
  }
}
