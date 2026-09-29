import { NextResponse } from 'next/server';
import { serverError } from '@/lib/http/responses';
import { logAction } from '@/lib/audit';
import { chatCompletion, extractJsonObject, llmErrorResponse } from '@/lib/llm';
import { db } from '@/lib/db';
import { getFactorModel, getBacktest } from '@/lib/quant/engine/api';
import { loadMarketState, ensureSeeded } from '@/lib/quant/engine/panel';
import { buildSynthesisDossier, renderReport, type SynthesisDossier } from '@/lib/quant/engine/synthesis';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface Narrative {
  headline: string;
  summary: string;
  convergence: string;
  risks: string[];
}

async function loadDossier(symbol: string): Promise<SynthesisDossier | null> {
  await ensureSeeded(false);
  const [state, factors, backtest] = await Promise.all([
    loadMarketState(),
    getFactorModel().catch(() => undefined),
    getBacktest().catch(() => undefined),
  ]);
  return buildSynthesisDossier(state, symbol.toUpperCase(), factors, backtest);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const dossier = await loadDossier(symbol);
    if (!dossier) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    const history = await db.synthesisReport.findMany({
      where: { symbol: symbol.toUpperCase() },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true, createdAt: true, symbol: true, runDate: true, price: true,
        score: true, agreement: true, nLong: true, nShort: true, nNeutral: true,
        verdict: true, regime: true,
      },
    });
    return NextResponse.json({ dossier, history, rules: await rulesStamp() });
  } catch (e) {
    return serverError('synthesis failed', e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const dossier = await loadDossier(symbol);
    if (!dossier) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });

    const evidence = {
      symbol: dossier.symbol,
      regime: `${dossier.regime} (stress ${dossier.regimeStress}, drift ${dossier.drift})`,
      price: dossier.price,
      score: dossier.score,
      agreement: dossier.agreement,
      verdict: dossier.verdict,
      strands: dossier.strands.map((s) => ({
        label: s.label, vote: s.vote, weight: s.effWeight, trusted: s.trusted,
        value: s.value, detail: s.detail,
      })),
      strengthNotes: dossier.strengthNotes,
      weaknessNotes: dossier.weaknessNotes,
      killSwitches: dossier.killSwitches,
      roadmap: dossier.roadmap,
      gateAttribution: dossier.attribution,
    };

    // LLM เรียบเรียงจาก evidence ที่คำนวณแล้วเท่านั้น — ไม่มีผู้ให้บริการ → 503 พร้อมวิธีตั้งค่า (src/lib/llm.ts)
    let content = '';
    try {
      const out = await chatCompletion([
        {
          role: 'system',
          content:
            'คุณคือนักวิเคราะห์หลักทรัพย์อาวุโสของแพลตฟอร์ม Omniscient Quant Engine ทำหน้าที่ "หลอมรวมเรียบเรียง" หลักฐานจากหลายสายของระบบวิเคราะห์หุ้นไทย (SET) ให้กลายเป็นบทวิเคราะห์เดียวที่อ่านรู้เรื่องสำหรับนักลงทุนรายย่อยขั้นสูง ' +
            'หลักการเขียน: (1) ยึดข้อเท็จจริงจาก evidence JSON เท่านั้น ห้ามเดาตัวเลขขึ้นมาเอง (2) ใช้ภาษาไทยละลานตา กระชับ ไม่ใช้ศัพท์วิชาการเกินจำเป็น อธิบายศัพท์เทคนิคสั้น ๆ ตรงๆ (3) สะท้อนทั้งฝั่งบวกและลบอย่างตรงไปตรงมา ห้ามชูโรงฝั่งเดียว (4) ถ้าคะแนนบรรจบอยู่โซน MIXED ต้องพูดตรงว่า "ยังไม่ควรลงมือ" ' +
            'ตอบเป็น JSON ล้วน (ไม่มี markdown/code fence) ตามโครงสร้าง: ' +
            '{"headline": string (พาดหัว 1 ประโยค มีมุมมองชัดเจน), "summary": string (บทสรุปผู้บริหาร 3-5 ประโยค เล่าว่าหลักฐานหลอมรวมแล้วบอกอะไร), "convergence": string (ย่อหน้า 3-6 ประโยค อธิบายว่าสายไหนเห็นต้องกับสายไหน สายไหนสวน พร้อมอ้างตัวเลขสำคัญที่มีใน evidence), "risks": array ของ string 3 รายการ (มุมที่ข้อสรุปนี้อาจผิดพลาด ระบุสัญญาณเฝ้าระวังเป็นรูปธรรม)}.',
        },
        { role: 'user', content: JSON.stringify(evidence).slice(0, 14000) },
      ]);
      content = out.text;
    } catch (e) {
      const r = llmErrorResponse(e);
      if (r) {
        void logAction(req, 'synthesis.run', r.status, { symbol: dossier.symbol, error: r.body.error });
        return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
      }
      throw e;
    }
    let narrative: Narrative;
    try {
      const parsed = extractJsonObject(content);
      narrative = {
        headline: String(parsed.headline ?? ''),
        summary: String(parsed.summary ?? ''),
        convergence: String(parsed.convergence ?? ''),
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 5) : [],
      };
    } catch {
      narrative = {
        headline: `${dossier.symbol}: ${dossier.verdict.label} (score ${dossier.score > 0 ? '+' : ''}${dossier.score})`,
        summary: content.slice(0, 900) || 'LLM response unparseable — ดูบทสรุปจาก evidence ด้านล่าง',
        convergence: '',
        risks: [],
      };
    }

    const saved = await db.synthesisReport.create({
      data: {
        symbol: dossier.symbol,
        runDate: dossier.date,
        price: dossier.price,
        score: dossier.score,
        agreement: dossier.agreement,
        nLong: dossier.nLong,
        nShort: dossier.nShort,
        nNeutral: dossier.nNeutral,
        verdict: dossier.verdict.code,
        regime: dossier.regime,
        strands: dossier.strands as unknown as object,
        dossier: dossier as unknown as object,
        narrative: narrative as unknown as object,
      },
    });

    void logAction(req, 'synthesis.run', 200, { symbol: dossier.symbol, savedId: saved.id, score: dossier.score });
    return NextResponse.json({
      dossier,
      narrative,
      reportText: renderReport(dossier, narrative),
      savedId: saved.id,
    });
  } catch (e) {
    return serverError('synthesis generate failed', e);
  }
}
