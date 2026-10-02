import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { getNeotic } from '@/lib/neotic/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/neotic — สแกน Neotic 3D (RS Rank · โซน B · กำไรโตตามวันประกาศ · ปริมาณ ≥ 2.5×) ของหุ้นไทยทุกตัว ณ วันล่าสุด
 * + กรวยเงื่อนไข · ความพร้อมของข้อมูล · ผลย้อนหลังเทียบการสุ่มเข้า · เดินหน้าจูน 4 เกณฑ์ · MAE/MFE
 * คำนวณครั้งเดียวต่อเวอร์ชันข้อมูล · 409 = ประวัติราคาไม่พอคำนวณ ROC 252 วัน
 */
export async function GET() {
  try {
    const r = await getNeotic();
    if (!r) {
      return NextResponse.json(
        { error: 'insufficient_data', message: 'ข้อมูลย้อนหลังไม่พอสำหรับสแกน Neotic 3D (ต้องมีราคาอย่างน้อย 253 วันทำการเพื่อคำนวณ ROC 252 วัน)' },
        { status: 409 },
      );
    }
    return NextResponse.json(r);
  } catch (e) {
    return serverError('neotic failed', e);
  }
}
