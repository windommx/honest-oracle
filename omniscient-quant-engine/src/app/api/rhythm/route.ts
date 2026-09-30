import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SYMBOL_RE } from '@/lib/data/ingest';
import { notFound, serverError, validate } from '@/lib/http/responses';
import { getRhythm } from '@/lib/rhythm/service';

export const dynamic = 'force-dynamic';

const Query = z.object({
  symbol: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => SYMBOL_RE.test(s), 'สัญลักษณ์ไม่ถูกต้อง')
    .default('SET'),
});

/**
 * GET /api/rhythm?symbol=SET|สัญลักษณ์ — จังหวะตลาด 5 แผง (ความกว้าง/หุ้นเคลื่อนแรงพร้อมกัน · ฤดูกาลวัน×เดือน ·
 * สัดส่วนมูลค่าซื้อขายรายหมวด + N_eff · แผนที่วันซื้อขาย PCA + k-means · ด่านที่บล็อกสัญญาณรายเดือน)
 * symbol ใช้กับแผงฤดูกาลและด่านที่บล็อก (SET = ทั้งตลาด/ทุกหุ้น) · แผงอื่นเป็นระดับตลาดเสมอ
 */
export async function GET(req: Request) {
  const q = validate(Query, { symbol: new URL(req.url).searchParams.get('symbol') ?? undefined });
  if (!q.ok) return q.res;
  try {
    const r = await getRhythm(q.data.symbol);
    if (r.ok) return NextResponse.json(r.data);
    if (r.reason === 'unknown_symbol') return notFound(`ไม่พบหุ้น ${q.data.symbol} ในชุดข้อมูล`);
    return NextResponse.json(
      { error: 'insufficient_data', message: 'ข้อมูลย้อนหลังไม่พอสำหรับวิเคราะห์จังหวะตลาด (ต้องมีอย่างน้อย 60 วันทำการหลังช่วง warm-up 120 วัน)' },
      { status: 409 },
    );
  } catch (e) {
    return serverError('rhythm failed', e);
  }
}
