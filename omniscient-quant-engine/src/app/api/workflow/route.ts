import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getWorkflow } from '@/lib/workflow/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/workflow — สถานะของกระบวนการทำงานประจำวัน: 6 ขั้น (ข้อมูล → กติกา → สัญญาณ → บันทึกก่อนตลาดเปิด → ติดตามผล → เทียบความคาดหวัง)
 * + สัญญาณรอบล่าสุด + สมุดไม้กระดาษจาก Journal + หลักฐาน forward เทียบการเล่นซ้ำย้อนหลัง + สัญญาณเตือน
 */
export async function GET() {
  try {
    return NextResponse.json(await getWorkflow());
  } catch (e) {
    return serverError('workflow failed', e);
  }
}
