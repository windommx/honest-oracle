import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAction } from '@/lib/audit';
import { SYMBOL_RE } from '@/lib/data/ingest';
import { notFound, serverError, validate } from '@/lib/http/responses';
import { chatCompletion, extractJsonObject, llmErrorResponse } from '@/lib/llm';
import { deepResearchFilename, renderDeepResearchMarkdown } from '@/lib/research/markdown';
import { getDeepResearch, NARRATIVE_SYSTEM_PROMPT, narrativeEvidence, parseNarrative } from '@/lib/research/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Query = z.object({ format: z.enum(['json', 'md']).default('json') });

const badSymbol = (symbol: string) => (SYMBOL_RE.test(symbol.toUpperCase()) ? null : notFound(`ไม่รู้จัก ${symbol.slice(0, 20)}`));

/**
 * GET /api/research/deep/{symbol}?format=json|md — Deep Research รายหุ้น (รวมผลทุกชั้น · ไม่ใช้ LLM)
 * format=md → ไฟล์ Markdown สำหรับดาวน์โหลด/แชร์ต่อ
 */
export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const bad = badSymbol(symbol);
  if (bad) return bad;
  const q = validate(Query, { format: new URL(req.url).searchParams.get('format') ?? undefined });
  if (!q.ok) return q.res;
  try {
    const report = await getDeepResearch(symbol);
    if (!report) return notFound(`ไม่พบหุ้น ${symbol.toUpperCase()} ในชุดข้อมูล`);
    if (q.data.format === 'md') {
      return new NextResponse(renderDeepResearchMarkdown(report), {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${deepResearchFilename(report)}"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return NextResponse.json(report);
  } catch (e) {
    return serverError('deep research failed', e);
  }
}

/**
 * POST /api/research/deep/{symbol} — ให้ LLM เรียบเรียงบทวิเคราะห์จากหลักฐานของรายงาน (ตัวเลขทุกตัวมาจากเอนจิน)
 * ผู้ดูแลเท่านั้น (proxy) · จำกัดความถี่ · ไม่ได้ตั้งค่า LLM → 503 llm_unavailable · บันทึก ActionLog research.deep
 */
export async function POST(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const bad = badSymbol(symbol);
  if (bad) return bad;
  try {
    const report = await getDeepResearch(symbol);
    if (!report) return notFound(`ไม่พบหุ้น ${symbol.toUpperCase()} ในชุดข้อมูล`);
    let content: string;
    try {
      const out = await chatCompletion([
        { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(narrativeEvidence(report)).slice(0, 16000) },
      ]);
      content = out.text;
    } catch (e) {
      const r = llmErrorResponse(e);
      if (r) {
        void logAction(req, 'research.deep', r.status, { symbol: report.symbol, error: r.body.error });
        return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
      }
      throw e;
    }
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = extractJsonObject(content);
    } catch {
      parsed = null;
    }
    const narrative = parseNarrative(parsed, content, report.verdict.headline);
    void logAction(req, 'research.deep', 200, { symbol: report.symbol, verdict: report.verdict.code, parsed: parsed !== null });
    return NextResponse.json(
      { narrative, markdown: renderDeepResearchMarkdown(report, narrative), filename: deepResearchFilename(report) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return serverError('deep research narrative failed', e);
  }
}
