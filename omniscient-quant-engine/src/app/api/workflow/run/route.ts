import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { requestActor } from '@/lib/security/request-actor';
import { runCycle } from '@/lib/workflow/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/workflow/run — รันรอบประจำวันทันที: บันทึกสัญญาณของรอบล่าสุดลง Journal (ไม่บันทึกจากข้อมูลค้าง)
 * แล้วอัปเดตไม้กระดาษที่ยังไม่จบด้วยราคาล่าสุด · รันซ้ำได้ไม่ซ้ำรายการ · ผู้ดูแลเท่านั้น (ผู้ชมได้ 403 ที่ proxy) · ActionLog workflow.run
 */
export async function POST(req: Request) {
  try {
    const report = await runCycle({ actor: requestActor(req), req });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return serverError('workflow run failed', e);
  }
}
