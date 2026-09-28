import { NextResponse } from 'next/server';
import { getThetaMatrix } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getThetaMatrix();
    return NextResponse.json(data);
  } catch (e) {
    console.error('dependence error', e);
    return NextResponse.json({ error: 'dependence failed', detail: String(e) }, { status: 500 });
  }
}
