import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getWinrate } from '@/lib/winrate/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/winrate — เป้าหมายชนะ 80% อย่างมีนัยสำคัญ: ห้องทดลองกติกาออก (เป้า × stop × วันถือ × ตัวกรอง)
 * เทียบการสุ่มเข้าแบบเดียวกัน · ช่วงค้นหา/ช่วงทดสอบ · ปรับการทดสอบหลายแบบ · จำนวนไม้ forward ที่ต้องใช้ · แผน 6 ขั้น
 * ห้องทดลองคำนวณครั้งเดียวต่อเวอร์ชันข้อมูล · 409 = ข้อมูลย้อนหลังไม่พอ
 */
export async function GET() {
  try {
    const w = await getWinrate();
    if (!w) {
      return NextResponse.json(
        { error: 'insufficient_data', message: 'ข้อมูลย้อนหลังไม่พอสำหรับห้องทดลองอัตราชนะ (ต้องมีอย่างน้อย 60 วันทำการหลังช่วง warm-up 120 วัน)' },
        { status: 409 },
      );
    }
    return NextResponse.json(w);
  } catch (e) {
    return serverError('winrate failed', e);
  }
}
