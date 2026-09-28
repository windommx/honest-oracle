import { NextResponse } from 'next/server';
import { getSystemStatus, seedIfNeeded } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getSystemStatus();
    return NextResponse.json(status);
  } catch (e) {
    console.error('system status error', e);
    return NextResponse.json({ error: 'status failed', detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { force } = await req.json().catch(() => ({ force: false }));
    const res = await seedIfNeeded(Boolean(force));
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error('seed error', e);
    return NextResponse.json({ error: 'seed failed', detail: String(e) }, { status: 500 });
  }
}
