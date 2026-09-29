import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverError, validate } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().regex(/^[a-z]+(\.[a-z]+)?$/).optional(),
});

/** GET /api/audit-log?limit=50&action=journal — ประวัติการกระทำที่แก้ข้อมูล/ใช้ LLM (ล่าสุดก่อน) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = validate(Query, {
    limit: url.searchParams.get('limit') ?? undefined,
    action: url.searchParams.get('action') ?? undefined,
  });
  if (!q.ok) return q.res;
  try {
    const { limit, action } = q.data;
    const where = action ? (action.includes('.') ? { action } : { action: { startsWith: `${action}.` } }) : undefined;
    const [rows, total] = await Promise.all([
      db.actionLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit }),
      db.actionLog.count({ where }),
    ]);
    return NextResponse.json({
      total,
      entries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    });
  } catch (e) {
    return serverError('audit-log failed', e);
  }
}
