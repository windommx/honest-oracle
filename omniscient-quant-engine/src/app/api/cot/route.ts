import { NextResponse } from 'next/server';
import { COT_GROUPS, COT_MARKETS } from '@/lib/cot/markets';
import { latestReportDate } from '@/lib/cot/generate';

export const dynamic = 'force-dynamic';

/** GET /api/cot — รายชื่อตลาดที่มีรายงาน COT แยกตามกลุ่ม + วันที่รายงานล่าสุด */
export async function GET() {
  return NextResponse.json({
    reportDate: latestReportDate(),
    groups: COT_GROUPS.map((g) => ({
      group: g,
      markets: COT_MARKETS.filter((m) => m.group === g).map(({ id, name, exchange, unit, financial }) => ({ id, name, exchange, unit, financial })),
    })),
  });
}
