// ============================================================
// Deep Research → Markdown (pure) — ไฟล์ที่ผู้ใช้ดาวน์โหลดไปอ่าน/แชร์ต่อได้ พร้อมข้อจำกัดของรายงานครบทุกครั้ง
// ============================================================

import { thDate } from '@/lib/flows/format';
import { STANCE_LABEL, type DeepResearchReport, type Fact, type ResearchNarrative } from './types';

/** ช่องตาราง Markdown: ห้ามมี | หรือขึ้นบรรทัด */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

function factTable(facts: Fact[]): string[] {
  if (!facts.length) return [];
  return ['| รายการ | ค่า | หมายเหตุ |', '|---|---|---|', ...facts.map((f) => `| ${cell(f.label)} | ${cell(f.value)} | ${cell(f.note ?? '')} |`), ''];
}

const VOTE_TH: Record<string, string> = { LONG: 'หนุน', SHORT: 'ถ่วง', NEUTRAL: 'กลาง' };

export function deepResearchFilename(r: DeepResearchReport): string {
  return `deep-research-${r.symbol}-${r.asOf}.md`;
}

export function renderDeepResearchMarkdown(r: DeepResearchReport, narrative?: ResearchNarrative | null): string {
  const L: string[] = [];
  const chg = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)}%`;
  L.push(`# Deep Research — ${r.symbol} · ${r.name}`, '');
  L.push(`${r.sector} · ${r.theme} · ข้อมูล ณ ${thDate(r.asOf)} · ราคา ${r.price.toFixed(2)} บาท (วันนี้ ${chg(r.change.d1)} · 5 วัน ${chg(r.change.d5)} · 21 วัน ${chg(r.change.d21)})`, '');
  L.push(`> **${r.verdict.headline}**`, '>', `> ${r.verdict.summary}`, '');

  L.push('## ตัวเลขสำคัญ', '', ...factTable(r.kpis));

  if (narrative) {
    L.push('## บทเรียบเรียงจาก AI', '', `### ${narrative.headline}`, '', narrative.summary, '');
    const list = (title: string, xs: string[]) => (xs.length ? [`**${title}**`, '', ...xs.map((x) => `- ${x}`), ''] : []);
    L.push(...list('มุมบวก', narrative.bullCase), ...list('มุมลบ', narrative.bearCase), ...list('สิ่งที่ต้องติดตาม', narrative.watchList));
    if (narrative.conclusion) L.push(`**บทสรุป:** ${narrative.conclusion}`, '');
    L.push('_เรียบเรียงโดย LLM จากตัวเลขในรายงานนี้เท่านั้น — เป็นการเรียบเรียง ไม่ใช่การคำนวณ และอาจผิดได้_', '');
  }

  r.sections.forEach((s, i) => {
    L.push(`## ${i + 1}. ${s.title}`, '', `_${s.layer} · มุมมอง: ${STANCE_LABEL[s.stance]}_`, '', s.summary, '', ...factTable(s.facts));
    if (s.bullets.length) L.push(...s.bullets.map((b) => `- ${b}`), '');
  });

  L.push('## หลักฐาน 13 สาย', '', '| สาย | ชั้น | โหวต | น้ำหนัก | ค่า |', '|---|---|---|---|---|');
  for (const s of r.strands) {
    L.push(`| ${cell(s.label)} | ${cell(s.layer)} | ${s.abstain ? 'งดออกเสียง' : VOTE_TH[s.vote]}${s.trusted ? ' ✓' : ''} | ${s.weight.toFixed(2)} | ${cell(s.value)} |`);
  }
  L.push('', '_✓ = gate ที่ผ่านการตรวจ attribution ใน walk-forward (น้ำหนักเต็ม)_', '');

  const p = r.plan;
  L.push('## แผนเทรด', '');
  L.push(`- สัญญาณ: **${r.verdict.signalLabel}**${p.failingGates.length ? ` (ไม่ผ่าน ${p.failingGates.join(', ')})` : ''}`);
  const px = (x: number) => x.toFixed(2);
  L.push(`- โซนเข้า ${px(p.entryLow)} – ${px(p.entryHigh)} บาท · จุดยืนยัน ${px(p.trigger)} บาท`);
  L.push(`- Stop โครงสร้าง ${px(p.stopStruct)} บาท · Stop แข็ง ${px(p.stopHard)} บาท`);
  L.push(`- ขนาดไม้: ตาม CVaR ${p.cvarSizePct}% → สุดท้าย **${p.finalSizePct}%** ของพอร์ต (เสี่ยง ${p.riskPerTradePct}% ต่อไม้)`);
  if (p.killSwitch) L.push(`- เงื่อนไขยกเลิก: ${p.killSwitch}`);
  L.push(...p.execution.map((x) => `- ${x}`), '');

  if (r.risks.length) L.push('## สิ่งที่อาจทำให้ข้อสรุปผิด', '', ...r.risks.map((x) => `- ${x}`), '');
  if (r.roadmap.length) L.push('## แผนการเดินเกม', '', ...r.roadmap.map((x, i) => `${i + 1}. ${x}`), '');
  if (r.checklist.length) {
    L.push('## เช็กลิสต์ (จากแท็บ Meta-Risk)', '');
    for (const [part, title] of [['IV', 'Part IV — ก่อนกดซื้อทุกครั้ง'], ['V', 'Part V — ตัวระบบและการรับรู้ของผู้เทรด']] as const) {
      const items = r.checklist.filter((c) => c.part === part);
      if (!items.length) continue;
      L.push(`**${title}**`, '');
      for (const c of items) L.push(`- ${c.pass === true ? '✅' : c.pass === false ? '❌' : '❔'} ${c.question} — ${c.answer}`);
      L.push('');
    }
  }
  L.push('## ข้อจำกัดของรายงาน', '', ...r.caveats.map((x) => `- ${x}`), '');
  L.push('---', `สร้างโดย Omniscient Quant Engine (หุ้นไทยเท่านั้น) · กติกา v${r.rules.version} (${r.rules.hashShort}) · ไม่ใช่คำแนะนำการลงทุน`, '');
  return L.join('\n');
}
