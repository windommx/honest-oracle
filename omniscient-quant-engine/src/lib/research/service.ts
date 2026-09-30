// ============================================================
// Deep Research — โหลดผลทุกชั้นจากเอนจิน (server-only) แล้วประกอบรายงาน
// ใช้ loadRiskContext / metaRiskFor / apexFor ตัวเดียวกับแท็บ Meta-Risk และ Apex → ตัวเลขตรงกันทุกหน้า
// ============================================================

import { getDataProvenance } from '@/lib/data/provenance';
import { buildFlowDashboard } from '@/lib/flows/report';
import { flowSource, flowsFromState } from '@/lib/flows/service';
import { getFactorModel } from '@/lib/quant/engine/api';
import { apexFor, loadRiskContext, metaRiskFor } from '@/lib/quant/engine/dossiers';
import { evaluateGates } from '@/lib/quant/engine/gates';
import { riskAssessment } from '@/lib/quant/engine/risk';
import { peekSeedRobustness } from '@/lib/quant/engine/robustness';
import { RULES } from '@/lib/quant/engine/rules';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';
import { rhythmFromState } from '@/lib/rhythm/service';
import { buildSynthesisDossier } from '@/lib/quant/engine/synthesis';
import { assembleDeepResearch } from './deep';
import type { DeepResearchReport, ResearchNarrative } from './types';

export async function getDeepResearch(symbol: string): Promise<DeepResearchReport | null> {
  const sym = symbol.toUpperCase();
  const ctx = await loadRiskContext();
  const { state } = ctx;
  const si = state.stocks.findIndex((s) => s.symbol === sym);
  if (si < 0) return null;
  const [factors, provenance, rules] = await Promise.all([getFactorModel().catch(() => undefined), getDataProvenance(), rulesStamp()]);
  const synthesis = buildSynthesisDossier(state, sym, factors, ctx.bt);
  const meta = metaRiskFor(ctx, sym);
  const apex = apexFor(ctx, sym, meta);
  if (!synthesis || !meta || !apex) return null;
  const N = state.dates.length;
  // เหมือน getDecision (แท็บ Decision / Risk) ทุกพารามิเตอร์
  const gate = evaluateGates(state, sym, N - 1, { riskBudgetPct: RULES.risk.budgetPct, probUp: ctx.probs[sym] });
  const risk = riskAssessment(state.stocks[si].rows.slice(-100), RULES.risk.budgetPct, RULES.risk.nu, RULES.risk.paths, 777);
  const f = flowsFromState(state, sym);
  const flows = f ? buildFlowDashboard(f.entity, f.days, '1y', 'nvdr', flowSource(f.entity)) : null;
  const data = { kind: provenance.kind, label: provenance.label };
  const rh = rhythmFromState(state, sym, data);
  return assembleDeepResearch({
    state,
    symbol: sym,
    synthesis,
    gate,
    risk,
    meta,
    apex,
    backtest: ctx.bt,
    flows,
    rhythm: rh.ok ? rh.data : null,
    robustness: peekSeedRobustness(),
    data,
    rules: { hashShort: rules.hashShort, version: rules.version, matchesRegistered: rules.matchesRegistered },
  });
}

/** หลักฐานแบบย่อสำหรับ LLM — เฉพาะตัวเลข/ข้อสรุปที่ระบบคำนวณแล้ว (ไม่มีข้อมูลผู้ใช้ รหัสผ่าน หรือไฟล์ DB) */
export function narrativeEvidence(r: DeepResearchReport) {
  return {
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    asOf: r.asOf,
    price: r.price,
    changePct: r.change,
    dataKind: r.data.kind,
    dataLabel: r.data.label,
    verdict: r.verdict,
    kpis: r.kpis,
    sections: r.sections.map((s) => ({ title: s.title, stance: s.stance, summary: s.summary, facts: s.facts, bullets: s.bullets.slice(0, 6) })),
    plan: r.plan,
    risks: r.risks.slice(0, 8),
    caveats: r.caveats,
  };
}

export const NARRATIVE_SYSTEM_PROMPT =
  'คุณคือนักวิเคราะห์หลักทรัพย์อาวุโสของแพลตฟอร์ม Omniscient Quant Engine ซึ่งครอบคลุมเฉพาะหุ้นไทย (SET/mai) ' +
  'หน้าที่: เรียบเรียง Deep Research ของหุ้น 1 ตัวจาก evidence JSON ที่ระบบคำนวณแล้วให้เป็นบทวิเคราะห์ภาษาไทยที่อ่านรู้เรื่องสำหรับนักลงทุนรายย่อยขั้นสูง ' +
  'กติกา: (1) อ้างตัวเลขจาก evidence เท่านั้น ห้ามเดาตัวเลข ข่าว งบ หรือเหตุการณ์ที่ไม่มีใน evidence ' +
  '(2) สะท้อนทั้งมุมบวกและมุมลบอย่างตรงไปตรงมา ถ้าสัญญาณคือ NO_TRADE หรือคะแนนอยู่โซน MIXED ต้องบอกตรง ๆ ว่ายังไม่ควรลงมือ ' +
  '(3) ถ้า dataKind ไม่ใช่ real ต้องบอกในบทสรุปว่าเป็นข้อมูลจำลอง (4) ไม่ใช้ markdown ในข้อความ ' +
  'ตอบเป็น JSON ล้วน (ไม่มี code fence) ตามโครงสร้าง: ' +
  '{"headline": string (1 ประโยค), "summary": string (4-6 ประโยค), "bullCase": string[] (3-5 ข้อ), "bearCase": string[] (3-5 ข้อ), ' +
  '"watchList": string[] (3-5 สัญญาณที่ต้องติดตาม เป็นรูปธรรม), "conclusion": string (2-3 ประโยค)}';

const strList = (x: unknown, max = 6) => (Array.isArray(x) ? x.map(String).map((s) => s.trim()).filter(Boolean).slice(0, max) : []);

/** แปลงคำตอบ LLM เป็นบทเรียบเรียง — อ่าน JSON ไม่ได้ = เก็บข้อความดิบเป็นบทสรุป (ไม่ทิ้งผลที่จ่ายเงินไปแล้ว) */
export function parseNarrative(parsed: Record<string, unknown> | null, raw: string, fallbackHeadline: string): ResearchNarrative {
  if (!parsed) {
    return { headline: fallbackHeadline, summary: raw.slice(0, 1500) || 'อ่านคำตอบของ LLM ไม่ได้ — ใช้บทสรุปจากตัวเลขด้านล่าง', bullCase: [], bearCase: [], watchList: [], conclusion: '' };
  }
  return {
    headline: String(parsed.headline ?? '').trim() || fallbackHeadline,
    summary: String(parsed.summary ?? '').trim(),
    bullCase: strList(parsed.bullCase),
    bearCase: strList(parsed.bearCase),
    watchList: strList(parsed.watchList),
    conclusion: String(parsed.conclusion ?? '').trim(),
  };
}
