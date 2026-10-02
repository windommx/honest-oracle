import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverError, validate } from '@/lib/http/responses';
import { NEO_BRIDGE_CSV, NEO_BRIDGE_PY } from '@/lib/neotic/bridge';
import { getNeoticFile } from '@/lib/neotic/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Query = z.object({ format: z.enum(['csv', 'py']) });

/**
 * GET /api/neotic/export?format=csv|py — ไฟล์สำหรับทดสอบกติกา Neotic 3D ใน PyBroker
 * csv = แท่งราคา + rs_rank/dist_52wh/vol_ratio/eps_qoq/eps_yoy/ema_20/neo_signal (point-in-time) · py = สคริปต์ lib-pybroker 2.x
 */
export async function GET(req: Request) {
  const q = validate(Query, { format: new URL(req.url).searchParams.get('format') ?? undefined });
  if (!q.ok) return q.res;
  try {
    const body = await getNeoticFile(q.data.format);
    if (body === null) {
      return NextResponse.json({ error: 'insufficient_data', message: 'ข้อมูลย้อนหลังไม่พอสำหรับส่งออก' }, { status: 409 });
    }
    const csv = q.data.format === 'csv';
    return new NextResponse(body, {
      headers: {
        'Content-Type': csv ? 'text/csv; charset=utf-8' : 'text/x-python; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csv ? NEO_BRIDGE_CSV : NEO_BRIDGE_PY}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return serverError('neotic export failed', e);
  }
}
