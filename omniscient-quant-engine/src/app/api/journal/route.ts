import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { seedDemoJournal } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? undefined;
    const entries = await db.journalEntry.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ entries });
  } catch (e) {
    console.error('journal GET error', e);
    return NextResponse.json({ error: 'journal failed', detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entry = await db.journalEntry.create({
      data: {
        runDate: body.runDate ? new Date(body.runDate) : new Date(),
        symbol: String(body.symbol ?? '').toUpperCase(),
        signal: String(body.signal ?? 'NO_TRADE'),
        gates: body.gates ?? {},
        price: Number(body.price ?? 0),
        entryLow: body.entryLow != null ? Number(body.entryLow) : null,
        entryHigh: body.entryHigh != null ? Number(body.entryHigh) : null,
        trigger: body.trigger != null ? Number(body.trigger) : null,
        stopStruct: body.stopStruct != null ? Number(body.stopStruct) : null,
        stopHard: body.stopHard != null ? Number(body.stopHard) : null,
        sizePct: body.sizePct != null ? Number(body.sizePct) : null,
        cvar: body.cvar != null ? Number(body.cvar) : null,
        probUp: body.probUp != null ? Number(body.probUp) : null,
        status: String(body.status ?? 'PLANNED'),
        pnlPct: body.pnlPct != null ? Number(body.pnlPct) : null,
        notes: body.notes ?? null,
      },
    });
    return NextResponse.json({ entry });
  } catch (e) {
    console.error('journal POST error', e);
    return NextResponse.json({ error: 'journal create failed', detail: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const allowed: Record<string, unknown> = {};
    for (const k of ['status', 'pnlPct', 'notes'] as const) {
      if (rest[k] !== undefined) allowed[k] = rest[k];
    }
    const entry = await db.journalEntry.update({ where: { id }, data: allowed });
    return NextResponse.json({ entry });
  } catch (e) {
    console.error('journal PATCH error', e);
    return NextResponse.json({ error: 'journal update failed', detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db.journalEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('journal DELETE error', e);
    return NextResponse.json({ error: 'journal delete failed', detail: String(e) }, { status: 500 });
  }
}

export async function PUT() {
  // PUT = seed demo journal entries from decision board
  try {
    const count = await seedDemoJournal();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    console.error('journal seed error', e);
    return NextResponse.json({ error: 'journal seed failed', detail: String(e) }, { status: 500 });
  }
}
