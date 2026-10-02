import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getFlowEntities } from '@/lib/flows/service';

export const dynamic = 'force-dynamic';

/** GET /api/flows — ตลาดรวม (SET) + หุ้นไทยรายตัวแยกหมวดที่ดูเงินไหลได้ + วันที่ข้อมูลล่าสุด */
export async function GET() {
  try {
    return NextResponse.json(await getFlowEntities());
  } catch (e) {
    return serverError('flows list failed', e);
  }
}
