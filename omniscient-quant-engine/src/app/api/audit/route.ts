import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { logAction } from '@/lib/audit';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';
import { chatCompletion, extractJsonObject, llmErrorResponse } from '@/lib/llm';
import { db } from '@/lib/db';
import { getBoard, getBacktest } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  try {
    const reports = await db.auditReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return NextResponse.json({ reports });
  } catch (e) {
    return serverError('audit fetch failed', e);
  }
}

/** ค่าจาก LLM อาจไม่ใช่ตัวเลข/หลุดช่วง — บังคับให้อยู่ใน [0,1] ก่อนบันทึก */
function unit(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}
const text = (v: unknown, max: number) => String(v ?? '').slice(0, max);

export async function POST(req: Request) {
  try {
    // gather evidence
    const [board, bt, rules] = await Promise.all([getBoard(), getBacktest(), rulesStamp()]);
    const journal = await db.journalEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 40 });
    const journalSummary = journal.map((j) => ({
      symbol: j.symbol,
      signal: j.signal,
      status: j.status,
      pnlPct: j.pnlPct,
      price: j.price,
      sizePct: j.sizePct,
    }));

    const evidence = {
      regime: board.regime,
      boardSummary: board.summary,
      gateAttribution: bt.attribution,
      backtestMetrics: bt.metrics,
      calibration: bt.calibration,
      journalSummary,
    };

    // LLM ทำหน้าที่เรียบเรียงหลักฐานที่ระบบคำนวณแล้วเท่านั้น — ไม่มีผู้ให้บริการ → 503 พร้อมวิธีตั้งค่า (src/lib/llm.ts)
    let content = '';
    try {
      const out = await chatCompletion([
        {
          role: 'system',
          content:
            'You are an autonomous Quantitative Research Auditor reviewing a 5-Gate trading system (G1 Regime, G2 Dependence, G3 Technical, G4 Risk, G5 Execution) for a Thai SET multi-view quant platform. ' +
            'Analyze the evidence JSON: gate attribution (edge = mean forward return when gate passes minus when it fails, in %), backtest metrics, model calibration and the trade journal. ' +
            'Identify the most likely root cause of any performance problem (regime mismatch, gate noise, overfitting, drift, position sizing) and give ONE concrete actionable recommendation for the next cycle. ' +
            'Also assess whether uncertainty justifies reducing position size. ' +
            'Respond STRICTLY in Thai language as valid JSON with these keys: ' +
            '{"summary": string (2-3 sentences executive briefing in Thai), "rootCause": string, "recommendedAction": string, "riskAdjustment": number 0.0-1.0 (fraction of normal size to keep, e.g. 0.5 = halve positions), "confidence": number 0.0-1.0, "gateNotes": array of {gate: string, note: string}}. ' +
            'No markdown, no code fences, JSON only.',
        },
        { role: 'user', content: JSON.stringify(evidence).slice(0, 14000) },
      ]);
      content = out.text;
    } catch (e) {
      const r = llmErrorResponse(e);
      if (r) {
        void logAction(req, 'audit.run', r.status, { error: r.body.error });
        return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
      }
      throw e;
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = extractJsonObject(content);
    } catch {
      parsed = {
        summary: content.slice(0, 800) || 'audit response unparseable',
        rootCause: 'unparseable response',
        recommendedAction: 're-run audit',
        riskAdjustment: 1,
        confidence: 0.3,
      };
    }

    const report = await db.auditReport.create({
      data: {
        summary: text(parsed.summary, 2000),
        rootCause: text(parsed.rootCause, 2000),
        recommendedAction: text(parsed.recommendedAction, 2000),
        riskAdjustment: unit(parsed.riskAdjustment, 1),
        confidence: unit(parsed.confidence, 0.5),
        gateAttributionRef: (Array.isArray(parsed.gateNotes) ? parsed.gateNotes.slice(0, 10) : []) as object,
        raw: { ...parsed, evidenceDigest: { metrics: bt.metrics, regime: board.regime, rulesHash: rules.hash, rulesVersion: rules.version } },
      },
    });
    void logAction(req, 'audit.run', 200, { reportId: report.id, confidence: report.confidence, riskAdjustment: report.riskAdjustment });
    return NextResponse.json({ report });
  } catch (e) {
    return serverError('audit failed', e);
  }
}
