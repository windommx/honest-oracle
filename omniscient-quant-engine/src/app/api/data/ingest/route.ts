import { NextResponse } from 'next/server';
import { logAction } from '@/lib/audit';
import { ingestDataset } from '@/lib/data/service';
import { INGEST_LIMITS } from '@/lib/data/ingest';
import { badRequest, serverError } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;

/**
 * POST /api/data/ingest — นำเข้าข้อมูลตลาดจริงแทนที่ข้อมูลทั้งชุด (JSON)
 * body: { source, license?, note?, volumeUnit?: "shares"|"millionShares", stocks: [{symbol, name?, sector?, theme?, beta?,
 *         prices: [{date, open?, high?, low?, close, volume}], fundamentals?: [...], flows?: [...]}],
 *         dryRun?: true  → ตรวจอย่างเดียว ไม่เขียน
 *         confirm: "REPLACE" → บังคับเมื่อจะเขียนจริง (ลบข้อมูลตลาดเดิมทั้งหมด หลัง backup สำเร็จ) }
 * journal / รายงาน / การล็อกกติกา ไม่ถูกแตะ · สคริปต์: bun scripts/ingest-csv.ts, bun scripts/fetch-yahoo.ts
 */
export async function POST(req: Request) {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BYTES) {
    return NextResponse.json({ error: 'payload_too_large', message: `ขนาดไม่เกิน ${MAX_BYTES / 1024 / 1024} MB — ใช้สคริปต์ bun scripts/ingest-csv.ts สำหรับไฟล์ใหญ่` }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
  } catch {
    return badRequest('body ต้องเป็น JSON object ของชุดข้อมูล');
  }
  const dryRun = body.dryRun === true;
  if (!dryRun && body.confirm !== 'REPLACE') {
    return badRequest('การนำเข้าจะลบข้อมูลตลาดเดิมทั้งหมด (หลัง backup) — ส่ง "confirm": "REPLACE" เพื่อยืนยัน หรือ "dryRun": true เพื่อตรวจอย่างเดียว');
  }
  const { dryRun: _d, confirm: _c, ...dataset } = body;
  void _d;
  void _c;
  try {
    const out = await ingestDataset(dataset, { dryRun });
    if (!out.ok) {
      const status = out.stage === 'backup' ? 500 : 422;
      if (!dryRun) void logAction(req, 'data.ingest', status, { stage: out.stage, errors: out.errors.slice(0, 5) });
      return NextResponse.json({ error: `ingest_${out.stage}_failed`, message: out.errors[0], errors: out.errors, warnings: out.warnings, summary: out.summary, limits: INGEST_LIMITS }, { status });
    }
    if (!out.dryRun) {
      void logAction(req, 'data.ingest', 201, { source: dataset.source, stocks: out.summary.symbols, lastDate: out.summary.lastDate, backup: out.backup?.file ?? null });
    }
    return NextResponse.json(out, { status: out.dryRun ? 200 : 201 });
  } catch (e) {
    void logAction(req, 'data.ingest', 500, { error: e instanceof Error ? e.message : String(e) });
    return serverError('ingest failed', e);
  }
}
