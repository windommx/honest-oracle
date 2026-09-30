// ============================================================
// Deep Research — ประกอบรายงานเชิงลึกรายหุ้นจากผลของทุกชั้น (pure — ทดสอบได้ ไม่แตะ DB)
//
// ไม่คำนวณสัญญาณใหม่: ทุกตัวเลขมาจาก dossier ของแท็บเดิม (หลอมรวม, 5 Gates, Risk, Meta-Risk, Apex, เงินไหล, Backtest)
// หน้าที่ของโมดูลนี้คือ "เรียงหลักฐานให้อ่านเป็นเรื่องเดียว" + สรุปด้วยกฎตายตัว + บอกข้อจำกัดของหลักฐานเสมอ
// ============================================================

import { wilsonInterval } from '@/lib/quant/stats';
import type { ApexDossier } from '@/lib/quant/engine/apex';
import type { BacktestResult } from '@/lib/quant/engine/backtest';
import type { GateEval } from '@/lib/quant/engine/gates';
import type { MetaRiskDossier } from '@/lib/quant/engine/meta-risk';
import type { RiskResult } from '@/lib/quant/engine/risk';
import type { RobustnessReport } from '@/lib/quant/engine/robustness';
import type { EvidenceStrand, SynthesisDossier } from '@/lib/quant/engine/synthesis';
import type { MarketState } from '@/lib/quant/engine/types';
import type { FlowDashboard } from '@/lib/flows/types';
import type { RhythmResponse } from '@/lib/rhythm/types';
import type { DeepResearchReport, Fact, ResearchSection, ResearchStrand, Stance } from './types';

export interface DeepResearchInput {
  state: MarketState;
  symbol: string;
  synthesis: SynthesisDossier;
  gate: GateEval;
  risk: RiskResult;
  meta: MetaRiskDossier;
  apex: ApexDossier;
  backtest: BacktestResult | undefined;
  flows: FlowDashboard | null;
  /** จังหวะตลาดของหุ้นนี้ (ฤดูกาล + ด่านที่บล็อก) + บริบทตลาด · null = ข้อมูลย้อนหลังไม่พอ */
  rhythm: RhythmResponse | null;
  robustness: RobustnessReport | null;
  data: { kind: string; label: string };
  rules: { hashShort: string; version: string; matchesRegistered: boolean };
}

// ───────────────────────── รูปแบบตัวเลข ─────────────────────────

const sign = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '');
/** เศษส่วน → % มีเครื่องหมาย เช่น 0.0189 → +1.89% */
const pctS = (x: number, d = 1) => `${sign(x)}${Math.abs(x * 100).toFixed(d)}%`;
/** เศษส่วน → % ไม่มีเครื่องหมาย */
const pctF = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
/** ค่าที่เป็น % อยู่แล้ว */
const pctV = (x: number, d = 1) => `${x.toFixed(d)}%`;
const num = (x: number, d = 2) => x.toFixed(d);
const mb = (x: number) => `${sign(x)}${Math.round(Math.abs(x)).toLocaleString('en-US')} ล้านบาท`;
export const baht = (x: number) => x.toFixed(2);

export const SIGNAL_LABEL: Record<string, string> = {
  ENTRY_PULLBACK: 'เข้าแบบ Pullback',
  ENTRY_MOMENTUM: 'เข้าแบบ Momentum',
  NO_TRADE: 'เฝ้าดู / ยังไม่เข้า',
};

const GATE_NAME: Record<string, string> = {
  g1: 'G1 สภาวะตลาด',
  g2: 'G2 ความอิสระจากตลาด',
  g3: 'G3 เทคนิค',
  g4: 'G4 ความเสี่ยง',
  g5: 'G5 จังหวะเข้า',
};

const voteStance = (v: EvidenceStrand['vote']): Stance => (v === 'LONG' ? 'positive' : v === 'SHORT' ? 'negative' : 'neutral');
const isAbstain = (s: EvidenceStrand) => s.effWeight === 0 && s.value === 'ไม่มีข้อมูล';

/** รวมหลายสาย: ถ่วงด้วยน้ำหนักจริง (สายที่งดออกเสียงไม่นับ) — ทุกสายงด = abstain */
function combinedStance(strands: Array<EvidenceStrand | undefined>): Stance {
  const live = strands.filter((s): s is EvidenceStrand => !!s && !isAbstain(s));
  if (!live.length) return 'abstain';
  const score = live.reduce((a, s) => a + (s.vote === 'LONG' ? 1 : s.vote === 'SHORT' ? -1 : 0) * Math.max(s.effWeight, 1e-6), 0);
  return score > 1e-9 ? 'positive' : score < -1e-9 ? 'negative' : 'neutral';
}

const passText = (ok: boolean) => (ok ? 'ผ่าน' : 'ไม่ผ่าน');

/** หัวข้อจังหวะตลาด: วันล่าสุดคล้ายวันแบบไหน · ความกว้าง · ด่านที่บล็อกหุ้นนี้ · ฤดูกาลของหุ้นนี้ (บอกผลการปรับทดสอบหลายช่องเสมอ) */
function rhythmSection(symbol: string, rh: RhythmResponse | null): ResearchSection {
  const base = { key: 'rhythm', title: 'จังหวะตลาด & จังหวะของหุ้น', layer: 'จังหวะตลาด' };
  if (!rh) {
    return { ...base, stance: 'abstain', summary: 'ข้อมูลย้อนหลังไม่พอสำหรับวิเคราะห์จังหวะตลาด', facts: [], bullets: [] };
  }
  const sgn = (x: number, d = 2) => `${sign(x)}${Math.abs(x).toFixed(d)}`;
  const cl = rh.dayMap.clusters[rh.dayMap.latest.cluster];
  const b = rh.breadth.latest;
  const g = rh.gates;
  const gatesOnly = g.categories.filter((c) => c.key !== 'SIGNAL');
  const top = gatesOnly.reduce((a, c) => (g.overall.shares[c.key] > g.overall.shares[a.key] ? c : a), gatesOnly[0]);
  const last3 = g.months.slice(-3);
  const sig3Total = last3.reduce((a, m) => a + m.total, 0);
  const sig3 = sig3Total ? (last3.reduce((a, m) => a + m.counts.SIGNAL, 0) / sig3Total) * 100 : 0;
  const se = rh.seasonality;
  const ranked = se.byMonth.filter((m) => m.mean !== null && m.n >= 10).sort((x, y) => y.mean! - x.mean!);
  const tested = [...se.byMonth, ...se.byWeekday].filter((m) => m.q !== null);
  const fdr = tested.filter((m) => m.q! < 0.1).map((m) => m.label);
  const raw = tested.filter((m) => m.tStat !== null && Math.abs(m.tStat) >= 2).map((m) => m.label);
  const seasonNote = fdr.length
    ? `ต่างจากศูนย์หลังปรับการทดสอบ ${tested.length} ช่อง: ${fdr.join(', ')}`
    : raw.length
      ? `|t| ≥ 2 ที่ ${raw.join(', ')} แต่ไม่ผ่านการปรับหลายช่อง — อาจเป็นความบังเอิญ`
      : 'ไม่มีเดือนหรือวันใดต่างจากศูนย์อย่างมีนัย';
  const facts: Fact[] = [
    {
      label: 'วันล่าสุดคล้ายวันแบบ',
      value: `กลุ่ม ${cl.id + 1} · ${cl.label}`,
      note: `${cl.share.toFixed(0)}% ของวัน${cl.fwd5 !== null && rh.dayMap.baseline.fwd5 !== null ? ` · SET 5 วันถัดไปเฉลี่ย ${sgn(cl.fwd5)}% (ทั้งช่วง ${sgn(rh.dayMap.baseline.fwd5)}%) · ย้อนหลังในตัวอย่าง` : ''}`,
    },
    { label: 'ความกว้างของตลาด', value: pctV(b.breadth, 0), note: `หุ้นปิดเหนือ MA20 · เฉลี่ย 20 วัน ${pctV(b.breadthMean20, 0)}` },
    { label: 'หุ้นเคลื่อนแรงพร้อมกันวันล่าสุด', value: `${b.extreme} / ${rh.breadth.nStocks} ตัว`, note: '|ผลตอบแทน| > 2σ ของตัวเองใน 60 วัน' },
    { label: `ด่านที่บล็อก ${symbol} บ่อยสุด`, value: `${top.label} ${pctV(g.overall.shares[top.key])}`, note: `ของ ${g.overall.total} วัน · ${top.desc}` },
    { label: `สัญญาณเข้าซื้อของ ${symbol}`, value: `${pctV(g.overall.shares.SIGNAL)} ของวัน (${g.overall.counts.SIGNAL} ครั้ง)`, note: `3 เดือนล่าสุด ${pctV(sig3)} · pullback ${g.overall.pullback} · momentum ${g.overall.momentum}` },
  ];
  if (ranked.length) {
    facts.push({
      label: `ฤดูกาลของ ${symbol}`,
      value: `ดีสุด ${ranked[0].label} ${sgn(ranked[0].mean!)}%/วัน · แย่สุด ${ranked[ranked.length - 1].label} ${sgn(ranked[ranked.length - 1].mean!)}%/วัน`,
      note: seasonNote,
    });
  }
  return {
    ...base,
    stance: 'info',
    summary:
      `ตลาดวันล่าสุดเป็นแบบ “${cl.label}” (${cl.share.toFixed(0)}% ของวันในช่วงเดียวกัน) · breadth ${pctV(b.breadth, 0)} · ` +
      `${symbol} ติดด่าน ${top.label} บ่อยสุด (${pctV(g.overall.shares[top.key])} ของวัน) และมีสัญญาณ ${pctV(g.overall.shares.SIGNAL)} ของวัน`,
    facts,
    bullets: [
      `ฤดูกาล: ${seasonNote}`,
      'สถิติย้อนหลังในตัวอย่างเดียวกัน — ใช้ประกอบบริบท ไม่ได้ร่วมโหวตในหลอมรวม 13 สาย และไม่เปลี่ยนสัญญาณ',
    ],
  };
}

// ───────────────────────── ประกอบรายงาน ─────────────────────────

export function assembleDeepResearch(input: DeepResearchInput): DeepResearchReport {
  const { state, symbol, synthesis: syn, gate, risk, meta, apex, backtest: bt, flows, robustness } = input;
  const st = state.stocks.find((s) => s.symbol === symbol);
  if (!st) throw new Error(`ไม่พบหุ้น ${symbol} ในชุดข้อมูล`);
  const N = state.dates.length;
  const row = st.rows[N - 1];
  const strand = (key: string) => syn.strands.find((s) => s.key === key);
  const plan = gate.plan;
  const kelly = apex.kelly;
  const mdx = meta.riskMdx;
  const flowsSimulated = true;

  const sections: ResearchSection[] = [];

  // 1) ภาวะตลาด
  const g1s = strand('G1_REGIME');
  sections.push({
    key: 'market',
    title: 'ภาวะตลาด',
    layer: 'L1 · G1',
    stance: g1s ? voteStance(g1s.vote) : 'neutral',
    summary: `ตลาดอยู่ในภาวะ ${syn.regime} — ${g1s?.detail ?? ''}`.trim(),
    facts: [
      { label: 'Regime', value: syn.regime },
      { label: 'ดัชนีความเครียดตลาด (F_stress)', value: num(syn.regimeStress) },
      { label: 'โมเมนตัมตลาด (ความชัน 21 วัน)', value: `${sign(syn.regimeMomentumSlope)}${Math.abs(syn.regimeMomentumSlope).toFixed(3)}/วัน`, note: 'ระยะสั้นกว่าหน้าต่าง 42 วันของ G1' },
      { label: 'Drift ของโมเดล', value: syn.drift },
      { label: GATE_NAME.g1, value: passText(gate.gates.g1), note: plan.reasons.g1 },
    ],
    bullets: [],
  });

  // 2) เทคนิคและจังหวะ
  const g3s = strand('G3_TECHNICAL');
  const g5s = strand('G5_EXECUTION');
  sections.push({
    key: 'technical',
    title: 'เทคนิค โมเมนตัม และจังหวะเข้า',
    layer: 'L1 · G3 · G5',
    stance: combinedStance([g3s, g5s]),
    summary: `${gate.phaseLabel} · RSI ${num(row.rsi14, 1)} · ผลตอบแทน 21 วัน ${pctS(row.ret21)} · ห่างจุดสูงสุด 1 ปี ${pctS(row.distHigh)}`,
    facts: [
      { label: 'เฟสราคา', value: gate.phaseLabel },
      { label: 'RSI 14', value: num(row.rsi14, 1) },
      { label: 'ผลตอบแทน 5 / 21 วัน', value: `${pctS(row.ret5)} / ${pctS(row.ret21)}` },
      { label: 'ห่างจุดสูงสุด 252 วัน', value: pctS(row.distHigh) },
      { label: 'ห่างเส้นเฉลี่ย 20 วัน', value: pctS(row.ma20Gap) },
      { label: 'ปริมาณ 5 วัน / 60 วัน', value: `${num(row.volRatio)} เท่า` },
      { label: GATE_NAME.g3, value: passText(gate.gates.g3), note: plan.reasons.g3 },
      { label: GATE_NAME.g5, value: passText(gate.gates.g5), note: plan.reasons.g5 },
    ],
    bullets: [g3s?.detail, g5s?.detail].filter((x): x is string => !!x),
  });

  // 3) พื้นฐานและมูลค่า
  const vals = strand('VALUATION');
  const funds = strand('FUNDAMENTAL');
  const hasFund = st.coverage?.fundamentals ?? true;
  sections.push({
    key: 'fundamental',
    title: 'ปัจจัยพื้นฐานและมูลค่า',
    layer: 'L0 · L1',
    stance: hasFund ? combinedStance([vals, funds]) : 'abstain',
    summary: hasFund
      ? `งบล่าสุดที่ประกาศแล้ว (point-in-time): P/E ${num(row.pe, 1)} · P/B ${num(row.pb, 2)} · ROE ${pctV(row.roe)} · รายได้โต ${pctV(row.revG)}`
      : 'ชุดข้อมูลปัจจุบันไม่มีงบการเงินของหุ้นนี้ — สายมูลค่าและพื้นฐานงดออกเสียง (ไม่เดาค่า)',
    facts: hasFund
      ? [
          { label: 'P/E', value: row.pe > 0 ? num(row.pe, 1) : 'ขาดทุน' },
          { label: 'P/B', value: num(row.pb, 2) },
          { label: 'ROE', value: pctV(row.roe) },
          { label: 'D/E', value: num(row.de, 2) },
          { label: 'การเติบโตของรายได้', value: pctV(row.revG) },
          ...(vals ? [{ label: vals.label, value: vals.value }] : []),
          ...(funds ? [{ label: funds.label, value: funds.value }] : []),
        ]
      : [],
    bullets: hasFund ? [vals?.detail, funds?.detail].filter((x): x is string => !!x) : [],
  });

  // 4) ความสัมพันธ์กับตลาด
  const g2s = strand('G2_DEPENDENCE');
  sections.push({
    key: 'dependence',
    title: 'ความสัมพันธ์กับตลาด (ร่วงตามตลาดแค่ไหนในวันแย่)',
    layer: 'L2 · G2',
    stance: g2s ? voteStance(g2s.vote) : 'neutral',
    summary: `${row.decoupled ? 'แยกตัวจากตลาด (decoupled)' : 'ยังเคลื่อนตามตลาด'} · Clayton Θ ${num(row.theta)} (z ${num(row.thetaZ)}) · lower-tail dependence ${num(row.ltd)}`,
    facts: [
      { label: 'Clayton Θ / z-score', value: `${num(row.theta)} / ${num(row.thetaZ)}` },
      { label: 'Lower-tail dependence', value: num(row.ltd), note: 'ยิ่งสูง ยิ่งร่วงพร้อมตลาดในวันแย่' },
      { label: 'สถานะ', value: row.decoupled ? 'แยกตัวจากตลาด' : 'ผูกกับตลาด' },
      { label: 'Beta', value: num(st.beta) },
      { label: GATE_NAME.g2, value: passText(gate.gates.g2), note: plan.reasons.g2 },
    ],
    bullets: g2s ? [g2s.detail] : [],
  });

  // 5) ปัจจัยหลายมุมมอง
  const fs = strand('FACTOR');
  const hs = strand('HUB');
  sections.push({
    key: 'factor',
    title: 'ปัจจัยหลายมุมมองและเครือข่าย',
    layer: 'L3',
    stance: combinedStance([fs, hs]),
    summary: fs?.detail ?? 'ไม่มีผลโมเดลปัจจัย',
    facts: [fs, hs].filter((x): x is EvidenceStrand => !!x).map((x) => ({ label: x.label, value: x.value })),
    bullets: hs ? [hs.detail] : [],
  });

  // 6) เงินไหล
  const flowS = strand('FLOW');
  const flowFacts: Fact[] = [];
  const flowBullets: string[] = [];
  if (flowS) flowFacts.push({ label: flowS.label, value: flowS.value });
  if (flows) {
    const col = (k: string) => flows.periods.columns.findIndex((c) => c.key === k);
    const nv = flows.periods.rows.find((r) => r.key === 'nvdr');
    if (nv) {
      for (const [k, label] of [['1W', '5 วัน'], ['1M', '1 เดือน'], ['YTD', 'ตั้งแต่ต้นปี']] as const) {
        const v = nv.values[col(k)];
        if (v !== null && v !== undefined) flowFacts.push({ label: `NVDR สุทธิ ${label}`, value: mb(v), note: 'จำลอง' });
      }
    }
    if (flows.short) flowFacts.push({ label: 'Short sale สัปดาห์ล่าสุด', value: pctV(flows.short.pctValue), note: `เฉลี่ย 13 สัปดาห์ ${pctV(flows.short.avgPct13w)} · จำลอง` });
    flowFacts.push({ label: 'Flow Index NVDR 6 / 36 เดือน', value: `${flows.flowIndex.m6.toFixed(0)} / ${flows.flowIndex.m36.toFixed(0)}`, note: 'จำลอง' });
    flowBullets.push(...flows.insights);
  }
  sections.push({
    key: 'flows',
    title: 'เงินไหล (สถาบัน · NVDR · Short sale)',
    layer: 'L1 · เงินไหล',
    stance: flowS && !isAbstain(flowS) ? voteStance(flowS.vote) : 'abstain',
    summary: flowS && !isAbstain(flowS) ? flowS.detail : 'ชุดข้อมูลไม่มีเงินไหลสถาบันของหุ้นนี้ — สายเงินไหลงดออกเสียง',
    facts: flowFacts,
    bullets: flowBullets,
  });

  // 6b) จังหวะตลาด & จังหวะของหุ้น — สถิติเชิงพรรณนาจากหน้าจังหวะตลาด (ไม่ร่วมโหวต ไม่เปลี่ยนสัญญาณ)
  sections.push(rhythmSection(symbol, input.rhythm));

  // 7) หลอมรวม 13 สาย
  const liveStrands = syn.strands.filter((s) => !isAbstain(s));
  sections.push({
    key: 'synthesis',
    title: 'หลอมรวมหลักฐาน 13 สาย',
    layer: 'L1–L7',
    stance: syn.verdict.code.endsWith('LONG') ? 'positive' : syn.verdict.code.endsWith('SHORT') ? 'negative' : 'neutral',
    summary: `คะแนนบรรจบ ${sign(syn.score)}${Math.abs(syn.score)}/100 · เห็นตรงกัน ${Math.round(syn.agreement * 100)}% · ${syn.verdict.label} — ${syn.verdict.action}`,
    facts: [
      { label: 'คะแนนบรรจบ', value: `${sign(syn.score)}${Math.abs(syn.score)} / 100` },
      { label: 'ความเห็นตรงกัน', value: `${Math.round(syn.agreement * 100)}%` },
      { label: 'โหวต หนุน / ถ่วง / กลาง', value: `${syn.nLong} / ${syn.nShort} / ${syn.nNeutral}` },
      { label: 'สายที่มีข้อมูล', value: `${liveStrands.length} / ${syn.strands.length}` },
    ],
    bullets: [...syn.strengthNotes.map((x) => `+ ${x}`), ...syn.weaknessNotes.map((x) => `− ${x}`)],
  });

  // 8) 5 Gates + แผนเทรด
  const failing = plan.failingGates;
  const nPass = Object.values(gate.gates).filter(Boolean).length;
  sections.push({
    key: 'gates',
    title: '5 Gates และแผนเทรด',
    layer: 'L6',
    stance: plan.signal !== 'NO_TRADE' ? 'positive' : failing.length >= 2 ? 'negative' : 'neutral',
    summary: `ผ่าน ${nPass}/5 ด่าน${failing.length ? ` (ไม่ผ่าน ${failing.join(', ')})` : ''} · สัญญาณ ${SIGNAL_LABEL[plan.signal]} · P(ขึ้น) จากโมเดล walk-forward ${pctF(gate.probUp, 0)}`,
    facts: [
      ...(['g1', 'g2', 'g3', 'g4', 'g5'] as const).map((g) => ({ label: GATE_NAME[g], value: passText(gate.gates[g]), note: plan.reasons[g] })),
      { label: 'โซนเข้า', value: `${baht(plan.entryLow)} – ${baht(plan.entryHigh)} บาท` },
      { label: 'จุดยืนยัน (trigger)', value: `${baht(plan.trigger)} บาท` },
      { label: 'Stop โครงสร้าง / Stop แข็ง', value: `${baht(plan.stopStruct)} / ${baht(plan.stopHard)} บาท` },
    ],
    bullets: plan.killSwitch ? [`เงื่อนไขยกเลิก: ${plan.killSwitch}`] : [],
  });

  // 9) ความเสี่ยง
  const hot = mdx.dims.filter((d) => d.score >= 50).sort((a, b) => b.score - a.score);
  const weakDefense = meta.defense.filter((d) => d.status === 'FAIL' || d.status === 'WARN');
  sections.push({
    key: 'risk',
    title: 'ความเสี่ยง (CVaR · Risk MDX · Risk of Ruin)',
    layer: 'L5 · L∞',
    stance: mdx.band === 'ต่ำ' ? 'positive' : mdx.band === 'กลาง' ? 'neutral' : 'negative',
    summary: `Risk MDX ${mdx.composite.toFixed(0)}/100 (${mdx.band}) → ${mdx.overrideNote} · CVaR 97.5% 1 วัน ${pctF(risk.cvar975, 2)} · โอกาสพอร์ตหลุด −30% ใน 12 เดือน ${pctV(meta.ruinScaled.pRuin30)}`,
    facts: [
      { label: 'ความผันผวนต่อปี', value: pctF(risk.volAnn) },
      { label: 'VaR 95% / 99% (1 วัน)', value: `${pctF(risk.var95)} / ${pctF(risk.var99)}` },
      { label: 'CVaR 97.5% (1 วัน)', value: pctF(risk.cvar975, 2) },
      { label: 'Risk MDX (7 มิติ)', value: `${mdx.composite.toFixed(0)} / 100 · ${mdx.band}`, note: `คำสั่งขนาดไม้: ${mdx.override}` },
      ...(mdx.topRisk ? [{ label: 'ความเสี่ยงสูงสุด', value: `${mdx.topRisk.name} ${mdx.topRisk.score.toFixed(0)}/100`, note: mdx.topRisk.evidence }] : []),
      { label: 'P(พอร์ตหลุด −30% / −50% ใน 12 เดือน)', value: `${pctV(meta.ruinScaled.pRuin30)} / ${pctV(meta.ruinScaled.pRuin50)}` },
      { label: 'ยังอยู่ในเกม (absorbing barrier)', value: meta.absorbingBarrier.inGame ? 'ใช่' : 'ไม่', note: meta.absorbingBarrier.verdict },
      { label: 'ดัชนี Antifragility', value: `${meta.antifragility.index.toFixed(0)} / 100`, note: meta.antifragility.verdict },
    ],
    bullets: [
      ...hot.map((d) => `${d.name} ${d.score.toFixed(0)}/100 (${d.band}) — ${d.evidence}`),
      ...weakDefense.map((d) => `${d.status === 'FAIL' ? 'ด่านป้องกันไม่ผ่าน' : 'ด่านป้องกันเตือน'}: ${d.name} — ${d.evidence}`),
    ],
  });

  // 10) ขนาดไม้
  const micro = apex.micro;
  sections.push({
    key: 'sizing',
    title: 'ขนาดไม้ (Kelly-Vol · CVaR · MDX) และการส่งคำสั่ง',
    layer: 'L7',
    stance: kelly.edgeGuard || kelly.finalSizePct <= 0 ? 'negative' : kelly.mdxOverride === 'HALF' ? 'neutral' : 'positive',
    summary: kelly.edgeGuard
      ? `Kelly ≤ 0 — ข้อมูลย้อนหลังยังไม่ให้ edge ที่เชื่อได้ จึงไม่ควรเปิดไม้ (P(win) ${pctF(kelly.p, 0)} · R ${num(kelly.r)})`
      : `ขนาดไม้สุดท้าย ${pctV(kelly.finalSizePct)} ของพอร์ต = min(Kelly ${pctV(kelly.kellySizePct)}, CVaR ${pctV(kelly.cvarSizePct)}, 25%) × MDX (${kelly.mdxOverride}) · เสี่ยง ${pctV(kelly.riskPerTradeFinalPct, 2)} ต่อไม้`,
    facts: [
      { label: 'P(win) · ช่วงเชื่อมั่น 95%', value: `${pctF(kelly.p, 0)} · ${pctF(kelly.pCI[0], 0)}–${pctF(kelly.pCI[1], 0)}`, note: `จาก ${kelly.nTrades} ไม้` },
      { label: 'R (กำไรเฉลี่ย/ขาดทุนเฉลี่ย) · 95%', value: `${num(kelly.r)} · ${num(kelly.rCI[0])}–${num(kelly.rCI[1])}` },
      { label: 'Full Kelly / ใช้จริง', value: `${pctF(kelly.fullKelly)} / ${pctF(kelly.fracKelly)}` },
      { label: 'ขนาดตาม Kelly-Vol / CVaR', value: `${pctV(kelly.kellySizePct)} / ${pctV(kelly.cvarSizePct)}` },
      { label: 'ขนาดไม้สุดท้าย', value: pctV(kelly.finalSizePct), note: `ก่อน MDX ${pctV(kelly.sizeBeforeMdxPct)} · MDX ${kelly.mdxOverride}` },
      { label: 'คะแนนรอดวิกฤต', value: `${apex.crisis.survivalScore.toFixed(0)} / 100`, note: apex.crisis.verdict },
      { label: 'สภาพคล่อง ADV 20 วัน', value: `${Math.round(micro.adv20MB).toLocaleString('en-US')} ล้านบาท/วัน` },
      { label: 'Slippage โดยประมาณ', value: pctV(micro.slippagePct, 2), note: `spread ${micro.spreadBps.toFixed(0)} bps` },
      { label: 'ความยากในการออก', value: `${micro.exitComplexity.toFixed(0)} / 100`, note: micro.exitVerdict },
      { label: 'ประเภทความไม่แน่นอน (Knight)', value: micro.knight.cls === 'RISK' ? 'Risk (วัดได้)' : 'Uncertainty (วัดไม่ได้)', note: micro.knight.reason },
    ],
    bullets: [...apex.verdict.execution, ...(micro.mirage.flagged ? [`ระวังภาพลวง: ${micro.mirage.reason}`] : [])],
  });

  // 11) หลักฐานย้อนหลัง
  const evFacts: Fact[] = [];
  const evBullets: string[] = [];
  if (bt) {
    const m = bt.metrics;
    evFacts.push({ label: 'ทั้งระบบ: hit rate · 95%', value: `${pctV(m.hitRate)} · ${pctV(m.hitRateCI[0])}–${pctV(m.hitRateCI[1])}`, note: `${m.nSignals.toLocaleString('en-US')} สัญญาณ` });
    evFacts.push({ label: 'ทั้งระบบ: Sharpe / Max DD', value: `${num(m.sharpe)} / ${pctV(m.maxDD)}` });
    evFacts.push({ label: 'ทั้งระบบ: ผลสะสม กลยุทธ์ / ซื้อถือ', value: `${pctV(m.cumStrat)} / ${pctV(m.cumBase)}` });
    const mine = bt.trades.filter((t) => t.symbol === symbol && t.signal);
    if (mine.length) {
      const wins = mine.filter((t) => t.fwdRet > 0).length;
      const ci = wilsonInterval(wins, mine.length);
      const avg = mine.reduce((a, t) => a + t.fwdRet, 0) / mine.length;
      evFacts.push({
        label: `เฉพาะ ${symbol}: hit rate · 95%`,
        value: `${pctF(wins / mine.length)} · ${pctF(ci.lo)}–${pctF(ci.hi)}`,
        note: `${mine.length} สัญญาณ · ผลตอบแทนวันถัดไปเฉลี่ย ${pctS(avg, 2)}`,
      });
    } else {
      evFacts.push({ label: `เฉพาะ ${symbol}`, value: 'ไม่มีสัญญาณในช่วงทดสอบ', note: 'ยังไม่มีหลักฐานย้อนหลังของหุ้นตัวนี้โดยตรง' });
    }
    for (const a of bt.attribution) {
      evBullets.push(`${a.gate}: ${a.verdict === 'SPEAKS_TRUTH' ? 'พูดความจริง' : a.verdict === 'NOISE' ? 'เป็น noise' : 'ข้อมูลไม่พอ'} (edge ${a.edge >= 0 ? '+' : ''}${a.edge.toFixed(3)}, p ${a.p.toFixed(2)})`);
    }
  }
  if (robustness) {
    evFacts.push({ label: 'ความทนทานข้าม seed', value: robustness.summary.verdict, note: robustness.summary.note });
  } else {
    evFacts.push({ label: 'ความทนทานข้าม seed', value: 'ยังไม่ได้รัน', note: 'กด "รันทดสอบ 5 seed" ในแท็บ Backtest แล้วสร้างรายงานใหม่ (ผลเก็บไว้จนกว่าจะรีสตาร์ตเซิร์ฟเวอร์)' });
  }
  sections.push({
    key: 'evidence',
    title: 'หลักฐานย้อนหลัง (walk-forward) และความน่าเชื่อถือ',
    layer: 'L4',
    stance: robustness ? (robustness.summary.verdict === 'STABLE' ? 'positive' : robustness.summary.verdict === 'UNSTABLE' ? 'negative' : 'neutral') : 'info',
    summary: bt
      ? `walk-forward ทั้งระบบ hit rate ${pctV(bt.metrics.hitRate)} (95% ${pctV(bt.metrics.hitRateCI[0])}–${pctV(bt.metrics.hitRateCI[1])}) · ${robustness ? `ความทนทานข้าม seed = ${robustness.summary.verdict}` : 'ยังไม่ได้ตรวจความทนทานข้าม seed'}`
      : 'ยังไม่มีผล backtest',
    facts: evFacts,
    bullets: evBullets,
  });

  // ───────── ภาพรวม ─────────
  const signalLabel = SIGNAL_LABEL[plan.signal];
  const finalSize = kelly.finalSizePct;
  const summaryParts = [
    `หลักฐาน ${liveStrands.length} สายที่มีข้อมูลให้คะแนนบรรจบ ${sign(syn.score)}${Math.abs(syn.score)}/100 (เห็นตรงกัน ${Math.round(syn.agreement * 100)}%) — ${syn.verdict.action}`,
    `ผ่าน ${nPass}/5 ด่าน${failing.length ? ` (ไม่ผ่าน ${failing.join(', ')})` : ''} · สัญญาณ ${signalLabel}`,
    `ความเสี่ยงรวม Risk MDX ${mdx.composite.toFixed(0)} (${mdx.band}) · ขนาดไม้สุดท้าย ${pctV(finalSize)} ของพอร์ต เสี่ยง ${pctV(kelly.riskPerTradeFinalPct, 2)} ต่อไม้`,
  ];
  if (kelly.edgeGuard) summaryParts.push('Kelly ≤ 0 — ข้อมูลย้อนหลังยังไม่ให้ edge ที่เชื่อได้ จึงไม่ควรเปิดไม้');
  if (input.data.kind !== 'real') summaryParts.push('ตัวเลขทั้งหมดคำนวณจากข้อมูลจำลอง — ใช้ศึกษาวิธีคิด ไม่ใช่ราคาจริง');

  const risks = dedupe([
    ...syn.killSwitches,
    ...(mdx.topRisk ? [`ความเสี่ยงสูงสุด: ${mdx.topRisk.name} ${mdx.topRisk.score.toFixed(0)}/100 — ${mdx.topRisk.evidence}`] : []),
    ...meta.deaths.filter((d) => d.triggered).map((d) => `เงื่อนไขโมเดลตายถูกกระตุ้น: ${d.model} — ${d.condition} (ตอนนี้ ${d.live})`),
    ...syn.weaknessNotes,
  ]);

  const caveats = [
    `ข้อมูล: ${input.data.label}`,
    ...(input.data.kind !== 'real' ? ['ราคา งบ และเงินไหลในชุดนี้เป็นข้อมูลจำลอง ไม่ใช่ราคาตลาดจริง แม้ชื่อหุ้นจะตรงกับหุ้นจริง'] : []),
    'ยอด NVDR / short sale / ประเภทนักลงทุนในรายงานนี้เป็นข้อมูลจำลองเสมอ (ยังไม่มีแหล่งข้อมูลจริงเชื่อมต่อ)',
    `กติกา v${input.rules.version} (${input.rules.hashShort}) ${input.rules.matchesRegistered ? 'ตรงกับชุดที่ล็อกไว้ล่าสุด' : 'ยังไม่ได้ล็อก หรือไม่ตรงกับชุดที่ล็อกล่าสุด — ผลอาจถูกปรับหลังเห็นข้อมูล'}`,
    'กติกาถูกจูนบนข้อมูลจำลอง — ยังไม่มีหลักฐานว่ามี edge ในตลาดจริง ต้องทดสอบกับข้อมูลจริงนอกตัวอย่างก่อนเชื่อ',
    'รายงานนี้สร้างด้วยกฎตายตัวจากตัวเลขของระบบ ไม่ใช่คำแนะนำการลงทุน',
  ];

  const strands: ResearchStrand[] = syn.strands.map((s) => ({
    key: s.key,
    label: s.label,
    layer: s.layer,
    vote: s.vote,
    weight: +s.effWeight.toFixed(3),
    trusted: s.trusted,
    abstain: isAbstain(s),
    value: s.value,
    detail: s.detail,
  }));

  const kpis: Fact[] = [
    { label: 'ราคาล่าสุด', value: `${baht(row.close)} บาท`, note: `วันนี้ ${pctS(row.ret1, 2)}` },
    { label: 'คะแนนบรรจบ', value: `${sign(syn.score)}${Math.abs(syn.score)}/100`, note: syn.verdict.label },
    { label: 'P(ขึ้น) จากโมเดล', value: pctF(gate.probUp, 0), note: 'walk-forward' },
    { label: 'ขนาดไม้สุดท้าย', value: pctV(finalSize), note: `MDX ${kelly.mdxOverride}` },
    { label: 'CVaR 97.5% (1 วัน)', value: pctF(risk.cvar975, 2) },
    { label: 'Risk MDX', value: `${mdx.composite.toFixed(0)}/100`, note: mdx.band },
    ...(flows ? [{ label: 'Flow Index NVDR 6 เดือน', value: flows.flowIndex.m6.toFixed(0), note: 'จำลอง' }] : []),
  ];

  return {
    symbol,
    name: st.name,
    sector: st.sector,
    theme: st.theme,
    asOf: state.dates[N - 1].toISOString().slice(0, 10),
    price: +row.close.toFixed(4),
    change: { d1: +(row.ret1 * 100).toFixed(2), d5: +(row.ret5 * 100).toFixed(2), d21: +(row.ret21 * 100).toFixed(2) },
    data: { kind: input.data.kind, label: input.data.label, flowsSimulated },
    rules: input.rules,
    verdict: {
      code: syn.verdict.code,
      label: syn.verdict.label,
      action: syn.verdict.action,
      score: syn.score,
      agreement: syn.agreement,
      signal: plan.signal,
      signalLabel,
      finalSizePct: finalSize,
      headline: `${symbol} — ${syn.verdict.label} · ${plan.signal === 'NO_TRADE' ? 'ยังไม่มีจังหวะเข้า' : signalLabel} · ขนาดไม้สุดท้าย ${pctV(finalSize)}`,
      summary: summaryParts.join(' · '),
    },
    kpis,
    sections,
    strands,
    // ค่าดิบจากเอนจิน (UI/Markdown จัดรูป 2 ตำแหน่งเหมือนแท็บ Decision)
    plan: {
      entryLow: plan.entryLow,
      entryHigh: plan.entryHigh,
      trigger: plan.trigger,
      stopStruct: plan.stopStruct,
      stopHard: plan.stopHard,
      cvarSizePct: plan.sizePct,
      finalSizePct: finalSize,
      riskPerTradePct: kelly.riskPerTradeFinalPct,
      failingGates: failing,
      killSwitch: plan.killSwitch,
      execution: apex.verdict.execution,
    },
    risks,
    roadmap: syn.roadmap,
    checklist: meta.checklist.map((c) => ({ part: c.part, question: c.question, answer: c.answer, pass: c.pass })),
    caveats,
  };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
}
