import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverError, validate } from '@/lib/http/responses';
import { DEFAULT_ROBUSTNESS_SEEDS, getSeedRobustness } from '@/lib/quant/engine/robustness';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** "20250902,11,2024" → [20250902, 11, 2024] · ทุกค่าต้องเป็นจำนวนเต็ม 0 – 2^31−1 · 1–8 ค่า · ค่าซ้ำถูกรวม */
const SeedList = z
  .string()
  .max(120)
  .transform((s) => s.split(',').map((x) => x.trim()))
  .pipe(z.array(z.string().regex(/^\d{1,10}$/, 'seed ต้องเป็นจำนวนเต็มไม่ติดลบ')).min(1).max(8, 'ไม่เกิน 8 seed'))
  .transform((xs) => [...new Set(xs.map(Number))])
  .refine((xs) => xs.every((x) => x < 2 ** 31), 'seed ต้องน้อยกว่า 2^31');

/**
 * GET /api/research/robustness?seeds=20250902,11,2024 — ผลกติกาข้าม seed ของ generator (cache ต่อ process)
 * งานหนัก (~3 วินาที/seed ครั้งแรก) — proxy จำกัดความถี่ให้ · ไม่แตะ DB
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('seeds');
  let seeds = DEFAULT_ROBUSTNESS_SEEDS;
  if (raw !== null) {
    const q = validate(SeedList, raw);
    if (!q.ok) return q.res;
    seeds = q.data;
  }
  try {
    const report = await getSeedRobustness(seeds);
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return serverError('robustness failed', e);
  }
}
