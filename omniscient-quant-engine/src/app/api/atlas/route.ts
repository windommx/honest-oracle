import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getAtlas } from '@/lib/atlas/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/atlas — Atlas พฤติกรรมระบบ: ส่องเอนจิน 5 ด่านผ่าน 6 มุม
 * (แผนที่สถานะตลาด · จังหวะเวลา · สัญญาณพร้อมกัน · ส่วนผสมกำไร/ขาดทุน · ไม้เริ่ม/จบอย่างไร · ทดสอบความฉลาดแบบ walk-forward)
 * คำนวณครั้งเดียวต่อเวอร์ชันข้อมูล · 409 = ข้อมูลย้อนหลังไม่พอ
 */
export async function GET() {
  try {
    const a = await getAtlas();
    if (!a) {
      return NextResponse.json(
        { error: 'insufficient_data', message: 'ข้อมูลย้อนหลังไม่พอสำหรับ Atlas (ต้องมีอย่างน้อย 60 วันทำการหลังช่วง warm-up 120 วัน)' },
        { status: 409 },
      );
    }
    return NextResponse.json(a);
  } catch (e) {
    return serverError('atlas failed', e);
  }
}
