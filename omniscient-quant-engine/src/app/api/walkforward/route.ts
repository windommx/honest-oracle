import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getWalkforward } from '@/lib/walkforward/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/walkforward — ทดสอบเดินหน้า (แนวคิด walkforward + optimize ของ PyBroker) ของกติกาออก:
 * หน้าต่าง train → test · 4 วิธีเลือก (ล็อกไว้ · กำไรสุทธิสูงสุด · ชนะบ่อยสุด · SL/TP จาก MAE/MFE) · เทียบการสุ่มเข้า
 * · bootstrap · ตารางไม้แบบ PyBroker (MAE/MFE) · กับดัก 9 ข้อ · คำนวณครั้งเดียวต่อเวอร์ชันข้อมูล · 409 = ข้อมูลย้อนหลังไม่พอ
 */
export async function GET() {
  try {
    const w = await getWalkforward();
    if (!w) {
      return NextResponse.json(
        { error: 'insufficient_data', message: 'ข้อมูลย้อนหลังไม่พอสำหรับการทดสอบเดินหน้า (ต้องมีอย่างน้อย 60 วันทำการหลังช่วง warm-up 120 วัน)' },
        { status: 409 },
      );
    }
    return NextResponse.json(w);
  } catch (e) {
    return serverError('walkforward failed', e);
  }
}
