import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAction } from '@/lib/audit';
import { readJson, serverError } from '@/lib/http/responses';
import { getSystemStatus, seedIfNeeded } from '@/lib/quant/engine/api';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [status, rules] = await Promise.all([getSystemStatus(), rulesStamp()]);
    return NextResponse.json({ ...status, rules });
  } catch (e) {
    return serverError('status failed', e);
  }
}

const SeedBody = z.object({ force: z.boolean().default(false) });

/** POST /api/system — seed ข้อมูลจำลองถ้า DB ว่าง · {"force": true} = ล้างแล้ว seed ใหม่ */
export async function POST(req: Request) {
  const body = await readJson(req, SeedBody);
  if (!body.ok) return body.res;
  try {
    const res = await seedIfNeeded(body.data.force);
    void logAction(req, 'data.seed', 200, { force: body.data.force, count: res.count });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return serverError('seed failed', e);
  }
}
