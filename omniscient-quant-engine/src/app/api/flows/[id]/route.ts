import { NextResponse } from 'next/server';
import { z } from 'zod';
import { notFound, serverError, validate } from '@/lib/http/responses';
import { SYMBOL_RE } from '@/lib/data/ingest';
import { buildFlowDashboard } from '@/lib/flows/report';
import { flowSource, getFlows } from '@/lib/flows/service';
import { FLOW_RANGES, MARKET_GROUPS, STOCK_GROUPS, type FlowGroup } from '@/lib/flows/types';

export const dynamic = 'force-dynamic';

const Query = z.object({
  range: z.enum(FLOW_RANGES).default('1y'),
  index: z.enum([...MARKET_GROUPS, ...STOCK_GROUPS]).optional(),
});

/**
 * GET /api/flows/{SET|สัญลักษณ์}?range=6m|1y|2y|3y&index=foreign|institution|prop|retail|nvdr|others
 * แดชบอร์ดเงินไหล: SET = ประเภทนักลงทุน 4 กลุ่ม · หุ้นรายตัว = NVDR เทียบผู้ลงทุนอื่น + short sale
 * index ที่ไม่ตรงชนิด (เช่น nvdr กับ SET) → ใช้ค่าเริ่มต้นของชนิดนั้น
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SYMBOL_RE.test(id.toUpperCase())) return notFound(`ไม่รู้จัก ${id.slice(0, 20)}`);
  const url = new URL(req.url);
  const q = validate(Query, { range: url.searchParams.get('range') ?? undefined, index: url.searchParams.get('index') ?? undefined });
  if (!q.ok) return q.res;
  try {
    const f = await getFlows(id);
    if (!f) return notFound(`ไม่รู้จักหุ้น ${id.toUpperCase()} ในชุดข้อมูล`);
    const indexGroup: FlowGroup = q.data.index && f.entity.groups.includes(q.data.index) ? q.data.index : f.entity.groups[0];
    return NextResponse.json(buildFlowDashboard(f.entity, f.days, q.data.range, indexGroup, flowSource(f.entity)));
  } catch (e) {
    return serverError('flows failed', e);
  }
}
