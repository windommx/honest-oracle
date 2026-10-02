import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson, serverError } from '@/lib/http/responses';
import { db } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { requestActor } from '@/lib/security/request-actor';
import { RULES, RULES_PROVENANCE } from '@/lib/quant/engine/rules';
import { registerRules, rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';

/** GET /api/rules — กติกาทั้งชุด + hash + สถานะการล็อก + ประวัติการล็อก */
export async function GET() {
  try {
    const stamp = await rulesStamp();
    const history = await db.ruleRegistration
      .findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, createdAt: true, rulesHash: true, rulesVersion: true, note: true, actor: true } })
      .catch(() => []);
    return NextResponse.json({
      ...stamp,
      provenance: RULES_PROVENANCE,
      rules: RULES,
      history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString(), hashShort: h.rulesHash.slice(0, 12) })),
    });
  } catch (e) {
    return serverError('rules failed', e);
  }
}

/** POST /api/rules — ล็อกกติกาชุดปัจจุบัน (pre-registration) · body {"note": "..."} ไม่บังคับ */
const RegisterBody = z.object({ note: z.string().trim().max(500).optional() });

export async function POST(req: Request) {
  const body = await readJson(req, RegisterBody);
  if (!body.ok) return body.res;
  try {
    const note = body.data.note ? body.data.note : null;
    const actor = requestActor(req);
    const reg = await registerRules(note, actor);
    void logAction(req, 'rules.register', 201, { hash: reg.rulesHash.slice(0, 12), note });
    const stamp = await rulesStamp();
    return NextResponse.json({ ok: true, registration: { id: reg.id, hash: reg.rulesHash, at: reg.createdAt.toISOString(), note, actor }, ...stamp }, { status: 201 });
  } catch (e) {
    return serverError('rules register failed', e);
  }
}
