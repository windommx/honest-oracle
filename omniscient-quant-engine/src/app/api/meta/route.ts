import { NextResponse } from 'next/server';
import { getDataProvenance } from '@/lib/data/provenance';
import { serverError } from '@/lib/http/responses';
import { describeLlmProvider } from '@/lib/llm';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';
import { getSecurityConfig } from '@/lib/security/config';
import { requestActor } from '@/lib/security/request-actor';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meta — ข้อมูลกำกับของแอปสำหรับ UI (เบา — ไม่คำนวณเอนจิน)
 * เวอร์ชัน · ข้อมูลในระบบคืออะไร (จำลอง/จริง + ความสด) · กติกาที่ใช้ + สถานะการล็อก · ผู้ให้บริการ LLM · สิทธิ์ของผู้เรียก
 * UI ใช้ค่านี้แทนป้ายที่เขียนตายตัว (เช่น "ข้อมูลจำลอง") และซ่อนปุ่มแก้ไขเมื่อเป็นผู้ชม (อ่านอย่างเดียว)
 */
export async function GET(req: Request) {
  try {
    const [prov, rules] = await Promise.all([getDataProvenance(), rulesStamp()]);
    const sec = getSecurityConfig();
    const actor = requestActor(req, sec);
    return NextResponse.json(
      {
        app: { name: 'Omniscient Quant Engine', version: pkg.version, commit: process.env.OQE_GIT_SHA?.trim().slice(0, 12) || null },
        data: {
          kind: prov.kind,
          label: prov.label,
          source: prov.source,
          license: prov.license,
          stocks: prov.stocks,
          firstDate: prov.firstDate,
          lastDate: prov.lastDate,
          freshness: { status: prov.freshness.status, lagSessions: prov.freshness.lagSessions, expectedSession: prov.freshness.expectedSession, notes: prov.freshness.notes },
          coverage: prov.coverage,
        },
        rules,
        llm: describeLlmProvider(),
        access: { mode: sec.mode, actor, canWrite: actor !== 'viewer' },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return serverError('meta failed', e);
  }
}
