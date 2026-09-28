import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api — ดัชนีเส้นทาง API ของแพลตฟอร์ม (ต้นฉบับเป็น "Hello, world!" ของ template) */
export async function GET() {
  return NextResponse.json({
    name: 'Omniscient Quant Engine',
    docs: '/api/health สำหรับ monitor · README.md หัวข้อ API',
    routes: [
      { method: 'GET', path: '/api/health', what: 'สุขภาพระบบ (DB, ข้อมูล, LLM) — 200 ok/degraded · 503 down' },
      { method: 'GET', path: '/api/system', what: 'สถานะข้อมูล + regime ปัจจุบัน' },
      { method: 'POST', path: '/api/system', what: 'seed ข้อมูลจำลอง ({"force":true} = ล้างแล้วสร้างใหม่)' },
      { method: 'GET', path: '/api/board', what: 'Decision Board ทุกตัว (L6)' },
      { method: 'GET', path: '/api/decision/{symbol}', what: '5-Gate + trade plan + risk + history ของหุ้น' },
      { method: 'GET', path: '/api/analytics/factors', what: 'Multi-View factor model + volcano (L3)' },
      { method: 'GET', path: '/api/analytics/dependence', what: 'Θ matrix + decouple table (L2)' },
      { method: 'GET', path: '/api/backtest', what: 'walk-forward backtest + gate attribution (L4)' },
      { method: 'GET|POST|PATCH|DELETE|PUT', path: '/api/journal', what: 'trade journal (PUT = seed ตัวอย่างจาก board)' },
      { method: 'GET|POST', path: '/api/audit', what: 'รายงาน LLM auditor (POST = รันใหม่, ต้องตั้งค่า LLM)' },
      { method: 'GET|POST', path: '/api/synthesis/{symbol}', what: 'หลอมรวมหลักฐาน 13 สาย (POST = narrative ด้วย LLM)' },
      { method: 'GET', path: '/api/meta-risk/{symbol}', what: 'Meta-Risk L∞: ruin math, defense, MDX 7 มิติ, antifragility' },
      { method: 'GET', path: '/api/apex/{symbol}', what: 'Apex L7: Kelly-Vol sizing, microstructure, crisis MC, registry' },
      { method: 'GET', path: '/api/market/quotes', what: 'quotes ทุกตัวสำหรับ terminal' },
      { method: 'GET', path: '/api/market/series/{symbol}?tf=1D|1W&bars=180', what: 'OHLCV + indicators + S/R' },
      { method: 'GET|POST', path: '/api/analyst/{symbol}', what: 'แผง AI analysis (POST = แชท ต้องตั้งค่า LLM)' },
    ],
  });
}
