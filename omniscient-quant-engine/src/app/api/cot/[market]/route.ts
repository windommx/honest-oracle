import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverError, validate } from '@/lib/http/responses';
import { cotHistory, latestReportDate } from '@/lib/cot/generate';
import { findMarket } from '@/lib/cot/markets';
import { buildCotDashboard } from '@/lib/cot/report';
import { COT_RANGES } from '@/lib/cot/types';

export const dynamic = 'force-dynamic';

const Query = z.object({
  range: z.enum(COT_RANGES as [string, ...string[]]).default('1y'),
  index: z.enum(['commercials', 'largeSpecs', 'smallTraders', 'producer', 'swap', 'managed', 'other', 'nonrept']).default('commercials'),
});

const SOURCE = {
  kind: 'synthetic' as const,
  label: 'ข้อมูล COT จำลอง',
  note: 'สร้างด้วย generator ที่รักษาเอกลักษณ์ของรายงาน CFTC (OI = Σlong + Σspread = Σshort + Σspread, Legacy = ผลรวมของ Disaggregated) — ไม่ใช่รายงาน CFTC จริง',
};

/** GET /api/cot/{market}?range=6m|1y|2y|3y&index=commercials — แดชบอร์ด COT ของตลาด */
export async function GET(req: Request, { params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  const spec = findMarket(market);
  if (!spec) return NextResponse.json({ error: 'not_found', message: `ไม่รู้จักตลาด ${market}` }, { status: 404 });
  const url = new URL(req.url);
  const q = validate(Query, { range: url.searchParams.get('range') ?? undefined, index: url.searchParams.get('index') ?? undefined });
  if (!q.ok) return q.res;
  try {
    const history = cotHistory(spec, latestReportDate());
    return NextResponse.json(buildCotDashboard(spec, history, q.data.range as never, q.data.index, SOURCE));
  } catch (e) {
    return serverError('cot failed', e);
  }
}
