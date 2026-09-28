import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { describeLlmProvider } from '@/lib/llm';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

/** เพดานเวลาของแต่ละ query — เกินนี้ถือว่า DB ใช้งานไม่ได้ (monitor ส่วนใหญ่ timeout ที่ 5–10 วินาที) */
const DB_TIMEOUT_MS = 2500;

interface HealthCheck {
  name: 'db' | 'data' | 'llm';
  ok: boolean;
  /** critical = ล้มแล้วตอบ 503 · ไม่ critical = แค่ status "degraded" */
  critical: boolean;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  status: 'ok' | 'degraded' | 'down';
  version: string;
  commit: string | null;
  uptimeSec: number;
  time: string;
  db: { ok: boolean; latencyMs: number | null };
  data: { stocks: number | null; prices: number | null; lastDate: string | null; seeded: boolean };
  llm: { provider: string | null; configured: boolean };
  checks: HealthCheck[];
  tookMs: number;
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} เกิน ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * GET /api/health — สำหรับ uptime monitor / Docker HEALTHCHECK (proxy ยกเว้น auth ให้เส้นนี้)
 * 200 = ให้บริการได้ (ok | degraded เช่นยังไม่ seed / ไม่ได้ตั้ง LLM) · 503 = DB ใช้งานไม่ได้ (down)
 * ไม่มีความลับในคำตอบ: ไม่มี path ของ DB, env, token หรือข้อความ error ดิบ
 */
export async function GET() {
  const t0 = performance.now();
  const checks: HealthCheck[] = [];
  let dbOk = false;
  let latencyMs: number | null = null;
  let stocks: number | null = null;
  let prices: number | null = null;
  let lastDate: string | null = null;
  try {
    const q0 = performance.now();
    await withTimeout(db.$queryRaw`SELECT 1`, 'ping DB');
    latencyMs = Math.round(performance.now() - q0);
    dbOk = true;
    checks.push({ name: 'db', ok: true, critical: true, detail: `SQLite ตอบใน ${latencyMs} ms` });
    const [nStocks, nPrices, last] = await withTimeout(
      Promise.all([db.stock.count(), db.price.count(), db.price.findFirst({ orderBy: { date: 'desc' }, select: { date: true } })]),
      'นับข้อมูล',
    );
    stocks = nStocks;
    prices = nPrices;
    lastDate = last?.date?.toISOString().slice(0, 10) ?? null;
    const seeded = nStocks > 0 && nPrices > 0;
    checks.push({
      name: 'data',
      ok: seeded,
      critical: false,
      detail: seeded ? `${nStocks} หุ้น · ${nPrices} แถวราคา · ข้อมูลถึง ${lastDate}` : 'ยังไม่มีข้อมูล — จะ seed อัตโนมัติเมื่อเรียก API ครั้งแรก หรือ POST /api/system',
    });
  } catch (e) {
    console.error('[health] DB check failed:', (e as Error)?.message ?? e);
    checks.push({ name: 'db', ok: false, critical: true, detail: 'เปิดฐานข้อมูลไม่ได้หรือช้าเกินกำหนด' });
  }

  const llm = describeLlmProvider();
  checks.push({
    name: 'llm',
    ok: llm.configured,
    critical: false,
    detail: llm.configured ? `ผู้ให้บริการ LLM: ${llm.provider}` : 'ยังไม่ได้ตั้งค่า LLM — หลอมรวมด้วย AI / Auditor / แชทจะตอบ 503 (เอนจินอื่นทำงานปกติ)',
  });

  const criticalFail = checks.some((c) => c.critical && !c.ok);
  const degraded = checks.some((c) => !c.ok);
  const report: HealthReport = {
    ok: !criticalFail,
    status: criticalFail ? 'down' : degraded ? 'degraded' : 'ok',
    version: pkg.version,
    commit: process.env.OQE_GIT_SHA?.trim() || null,
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
    db: { ok: dbOk, latencyMs },
    data: { stocks, prices, lastDate, seeded: (stocks ?? 0) > 0 && (prices ?? 0) > 0 },
    llm: { provider: llm.provider, configured: llm.configured },
    checks,
    tookMs: Math.round(performance.now() - t0),
  };
  return NextResponse.json(report, { status: criticalFail ? 503 : 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
