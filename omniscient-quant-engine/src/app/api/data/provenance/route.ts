import { NextResponse } from 'next/server';
import { getDataProvenance } from '@/lib/data/provenance';
import { serverError } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/data/provenance — ข้อมูลในระบบคืออะไร มาจากไหน สดแค่ไหน (ปฏิทิน SET) ครอบคลุมงบ/เงินไหลกี่ตัว */
export async function GET() {
  try {
    return NextResponse.json(await getDataProvenance(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return serverError('provenance failed', e);
  }
}
