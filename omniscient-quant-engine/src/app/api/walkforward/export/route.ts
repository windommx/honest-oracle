import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverError, validate } from '@/lib/http/responses';
import { BRIDGE_CSV, BRIDGE_PY } from '@/lib/walkforward/bridge';
import { getBridgeFile } from '@/lib/walkforward/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Query = z.object({ format: z.enum(['csv', 'py']) });

/**
 * GET /api/walkforward/export?format=csv|py — ไฟล์สำหรับตรวจผลซ้ำใน PyBroker
 * csv = แท่งราคา + สัญญาณ/แผนของ OQE ทุกหุ้นทุกวัน · py = สคริปต์ lib-pybroker 2.x (กติกาการส่งคำสั่งชุดเดียวกับโบรกเกอร์กระดาษ)
 */
export async function GET(req: Request) {
  const q = validate(Query, { format: new URL(req.url).searchParams.get('format') ?? undefined });
  if (!q.ok) return q.res;
  try {
    const body = await getBridgeFile(q.data.format);
    if (body === null) {
      return NextResponse.json({ error: 'insufficient_data', message: 'ข้อมูลย้อนหลังไม่พอสำหรับส่งออก' }, { status: 409 });
    }
    const csv = q.data.format === 'csv';
    return new NextResponse(body, {
      headers: {
        'Content-Type': csv ? 'text/csv; charset=utf-8' : 'text/x-python; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csv ? BRIDGE_CSV : BRIDGE_PY}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return serverError('walkforward export failed', e);
  }
}
