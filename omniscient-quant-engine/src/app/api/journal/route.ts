import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { isNotFoundError, notFound, readJson, serverError, validate } from '@/lib/http/responses';
import { seedDemoJournal } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

const SIGNALS = ['ENTRY_PULLBACK', 'ENTRY_MOMENTUM', 'NO_TRADE'] as const;
const STATUSES = ['PLANNED', 'EXECUTED', 'CLOSED', 'SKIPPED'] as const;

const optNum = z.number().nullable().optional();
const notes = z.string().max(2000).nullable().optional();

const CreateSchema = z.object({
  runDate: z.iso.datetime({ offset: true }).optional(),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.&-]{0,14}$/, 'สัญลักษณ์หุ้น A–Z/0–9 ไม่เกิน 15 ตัว'),
  signal: z.enum(SIGNALS).default('NO_TRADE'),
  gates: z
    .record(z.string().max(40), z.unknown())
    .default({})
    .refine((g) => Object.keys(g).length <= 40 && JSON.stringify(g).length <= 4000, 'gates ใหญ่เกินไป'),
  price: z.number().nonnegative(),
  entryLow: optNum,
  entryHigh: optNum,
  trigger: optNum,
  stopStruct: optNum,
  stopHard: optNum,
  sizePct: z.number().min(0).max(100).nullable().optional(),
  cvar: optNum,
  probUp: z.number().min(0).max(1).nullable().optional(),
  status: z.enum(STATUSES).default('PLANNED'),
  pnlPct: optNum,
  notes,
});

const PatchSchema = z
  .object({
    id: z.string().min(1).max(64),
    status: z.enum(STATUSES).optional(),
    pnlPct: optNum,
    notes,
  })
  .strict();

const ListQuery = z.object({ status: z.enum(STATUSES).optional() });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = validate(ListQuery, { status: url.searchParams.get('status') ?? undefined });
  if (!q.ok) return q.res;
  try {
    const entries = await db.journalEntry.findMany({
      where: q.data.status ? { status: q.data.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ entries });
  } catch (e) {
    return serverError('journal failed', e);
  }
}

export async function POST(req: Request) {
  const body = await readJson(req, CreateSchema);
  if (!body.ok) return body.res;
  const b = body.data;
  try {
    const entry = await db.journalEntry.create({
      data: {
        runDate: b.runDate ? new Date(b.runDate) : new Date(),
        symbol: b.symbol,
        signal: b.signal,
        gates: b.gates as object,
        price: b.price,
        entryLow: b.entryLow ?? null,
        entryHigh: b.entryHigh ?? null,
        trigger: b.trigger ?? null,
        stopStruct: b.stopStruct ?? null,
        stopHard: b.stopHard ?? null,
        sizePct: b.sizePct ?? null,
        cvar: b.cvar ?? null,
        probUp: b.probUp ?? null,
        status: b.status,
        pnlPct: b.pnlPct ?? null,
        notes: b.notes ?? null,
      },
    });
    void logAction(req, 'journal.create', 201, { id: entry.id, symbol: entry.symbol, signal: entry.signal, status: entry.status });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    return serverError('journal create failed', e);
  }
}

export async function PATCH(req: Request) {
  const body = await readJson(req, PatchSchema);
  if (!body.ok) return body.res;
  const { id, ...rest } = body.data;
  const data: { status?: string; pnlPct?: number | null; notes?: string | null } = {};
  if (rest.status !== undefined) data.status = rest.status;
  if (rest.pnlPct !== undefined) data.pnlPct = rest.pnlPct;
  if (rest.notes !== undefined) data.notes = rest.notes;
  try {
    const entry = await db.journalEntry.update({ where: { id }, data });
    void logAction(req, 'journal.update', 200, { id, fields: Object.keys(data) });
    return NextResponse.json({ entry });
  } catch (e) {
    if (isNotFoundError(e)) return notFound(`ไม่พบรายการ journal id=${id}`);
    return serverError('journal update failed', e);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  const q = validate(z.string().min(1).max(64), id);
  if (!q.ok) return q.res;
  try {
    await db.journalEntry.delete({ where: { id: q.data } });
    void logAction(req, 'journal.delete', 200, { id: q.data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isNotFoundError(e)) return notFound(`ไม่พบรายการ journal id=${q.data}`);
    return serverError('journal delete failed', e);
  }
}

export async function PUT(req: Request) {
  // PUT = seed demo journal entries from decision board
  try {
    const count = await seedDemoJournal();
    void logAction(req, 'journal.seed', 200, { count });
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return serverError('journal seed failed', e);
  }
}
