// ============================================================
// ประกอบคำตอบของหน้า "เป้าหมายชนะ 80%" จากผลห้องทดลอง (pure — ทดสอบได้โดยไม่แตะ DB)
// คำตัดสินไล่ตามขั้นที่ตั้งไว้ก่อนดูผล: ช่วงค้นหา → ช่วงทดสอบ → ล็อกกติกาออก → ไม้ forward ครบจำนวน → ตัดสินครั้งเดียว
// ============================================================

import { wilsonInterval } from '@/lib/quant/stats';
import { configLabel, EMBARGO, FILTER_LABEL, LAB, powerFor, SELECTION_RULE, selectConfig, trapOf, type LabResult } from './lab';
import { binomTailGE } from './stats';
import type { WinCell, WinLevel, WinPlanStep, WinRow, WinrateResponse } from './types';

export interface WinrateContext {
  data: { kind: string; label: string };
  rules: { hashShort: string; locked: boolean; matches: boolean };
  /** กติกาออกที่ล็อกอยู่ (RULES.execution) */
  exec: { orderDays: number; targetR: number | null; stopMult: number; holdDays: number; costPct: number };
  /** ไม้ forward ที่นับเป็นหลักฐานได้ (ปิดแล้ว · ชนะสุทธิ) */
  forward: { closed: number; wins: number };
}

type Exit = { targetR: number | null; stopMult: number; holdDays: number };

const r1 = (v: number) => Math.round(v * 10) / 10;
const rp = (p: number) => (p >= 0.001 ? Math.round(p * 1e4) / 1e4 : Number(p.toPrecision(2)));
const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
/** "p = 0.034" · "p < 0.001" · "p = —" (ไม่เขียน "p = < 0.001") */
const eq = (name: 'p' | 'q', v: number | null) => (v === null ? `${name} = —` : v < 0.001 ? `${name} < 0.001` : `${name} = ${v.toFixed(3)}`);
const sameExit = (a: Exit, b: Exit) => a.targetR === b.targetR && a.stopMult === b.stopMult && a.holdDays === b.holdDays;
export const exitLabel = (e: Exit) => `เป้า ${e.targetR === null ? 'ไม่มี' : `${e.targetR}R`} · stop ${e.stopMult}× · ถือ ${e.holdDays} วัน`;

/** อัตราชนะของการสุ่ม รวมช่วงค้นหา + ช่วงทดสอบ (ถ่วงด้วยไม้ปิด) */
function pooledBaseline(r: WinRow): number | null {
  const parts = [r.discovery, r.holdout].filter((s) => s.baseline !== null && s.closed > 0);
  const n = parts.reduce((a, s) => a + s.closed, 0);
  return n ? r1(parts.reduce((a, s) => a + s.baseline! * s.closed, 0) / n) : null;
}

const cellOf = (r: WinRow): WinCell => ({
  key: r.key,
  targetR: r.targetR,
  stopMult: r.stopMult,
  holdDays: r.holdDays,
  filter: r.filter,
  n: r.discovery.closed,
  win: r.discovery.winRate,
  base: r.discovery.baseline,
  excess: r.discovery.excess?.mean ?? null,
  p: r.discovery.pExcess,
  q: r.q,
  exp: r.discovery.expectancy?.mean ?? null,
});

export function buildWinrate(lab: LabResult, ctx: WinrateContext): WinrateResponse {
  const T = LAB.target * 100;
  const synthetic = ctx.data.kind !== 'real';
  const sel = selectConfig(lab.rows);
  const tested = lab.rows.filter((r) => r.q !== null);
  const positive = sel.reach.filter((r) => (r.discovery.expectancy?.mean ?? -1) > 0);
  const significant = tested.filter((r) => r.q! < LAB.fdr);
  const ref = sel.selected ?? sel.closest;
  const power = powerFor(ref, lab.years);
  const trap = trapOf(lab.rows);
  const curRow = lab.rows.find((r) => r.filter === 'all' && sameExit(r, ctx.exec)) ?? null;
  const curLabel = exitLabel(ctx.exec);

  // ไม้ forward ของกติกาที่ล็อกอยู่ เทียบการสุ่มด้วยกติกาออกเดียวกัน
  const fw = ctx.forward;
  const fBase = curRow ? pooledBaseline(curRow) : null;
  const fWin = fw.closed ? r1((100 * fw.wins) / fw.closed) : null;
  const fWil = fw.closed ? wilsonInterval(fw.wins, fw.closed) : null;
  const fP = fw.closed && fBase !== null ? rp(binomTailGE(fw.wins, fw.closed, fBase / 100)) : null;
  const matchesReference = !!ref && ref.filter === 'all' && sameExit(ctx.exec, ref);
  const lockedOk = ctx.rules.locked && ctx.rules.matches;
  const passedHoldout = !!sel.selected && sel.holdoutPass === true;
  const tracking = passedHoldout && matchesReference && lockedOk;
  const forwardDone = tracking && power.nNeeded !== null && fw.closed >= power.nNeeded;
  const forwardPass = forwardDone && (fWin ?? 0) >= T && (fP ?? 1) < LAB.alpha;

  // ไม้ forward นับเฉพาะข้อมูลจริงอยู่แล้ว (เกณฑ์ของรอบประจำวัน) — ข้อมูลจำลองจึงไปไม่ถึง confirmed เอง
  const level: WinLevel = !sel.selected ? 'none' : !passedHoldout ? 'discovery' : !forwardDone ? 'holdout' : forwardPass ? 'confirmed' : 'rejected';
  const title: Record<WinLevel, string> = {
    none: `ยังไม่มีหลักฐานว่าชนะ ${T}% อย่างมีนัยสำคัญ`,
    discovery: 'พบ config ที่ผ่านช่วงค้นหา แต่ตกช่วงทดสอบ — ยังไม่ใช่ edge',
    holdout: 'ผ่านช่วงค้นหาและช่วงทดสอบ — รอไม้ forward ยืนยัน',
    rejected: 'ไม้ forward ครบแล้วแต่ไม่ยืนยัน — config นี้ไม่ใช่ edge',
    confirmed: `ยืนยันแล้ว: ชนะ ≥ ${T}% เหนือการสุ่มอย่างมีนัยบนไม้ forward จริง`,
  };

  // ─── เหตุผล (เรียงจากเรื่องที่สำคัญที่สุด) ───
  const reasons: string[] = [];
  if (synthetic) reasons.push(`ข้อมูลตอนนี้คือ "${ctx.data.label}" — ทุกตัวเลขในหน้านี้เป็นการซ้อมกระบวนการ ใช้ตัดสินตลาดจริงไม่ได้`);
  if (sel.reach.length) {
    const bases = sel.reach.map((r) => r.discovery.baseline).filter((v): v is number => v !== null);
    reasons.push(
      `${sel.reach.length} จาก ${tested.length} config ชนะ ≥ ${T}% ในช่วงค้นหา แต่การสุ่มเข้าด้วยกติกาออกเดียวกันก็ชนะ ${bases.length ? `${Math.min(...bases).toFixed(1)}–${Math.max(...bases).toFixed(1)}%` : 'ใกล้เคียงกัน'} — อัตราชนะส่วนใหญ่มาจากรูปทรงของกติกาออก (เป้าใกล้ · stop กว้าง · ถือนาน) ไม่ใช่จังหวะเข้า`,
    );
  } else {
    const best = Math.max(0, ...tested.map((r) => r.discovery.winRate ?? 0));
    reasons.push(`ไม่มี config ไหนชนะถึง ${T}% ในช่วงค้นหา (สูงสุด ${best.toFixed(1)}% จาก ${tested.length} แบบที่มีไม้พอ)`);
  }
  if (sel.selected) {
    const d = sel.selected.discovery;
    reasons.push(
      `${configLabel(sel.selected)} ผ่านช่วงค้นหา: ชนะ ${d.winRate}% เทียบการสุ่ม ${d.baseline}% (${eq('q', sel.selected.q)}) · ผลสุทธิ ${signed(d.expectancy!.mean, 2)}%/ไม้`,
    );
    const h = sel.selected.holdout;
    reasons.push(
      `ช่วงทดสอบ (${lab.split} → ${lab.end}): ชนะ ${h.winRate ?? '—'}% เทียบการสุ่ม ${h.baseline ?? '—'}% (${eq('p', h.pExcess)}) · ผลสุทธิ ${h.expectancy ? `${signed(h.expectancy.mean, 2)}%/ไม้` : '—'} · ไม้ปิด ${h.closed} → ${passedHoldout ? 'ผ่าน' : 'ไม่ผ่าน'}`,
    );
  } else if (sel.closest && sel.closest.discovery.excess) {
    const d = sel.closest.discovery;
    reasons.push(
      `ตัวที่ใกล้ที่สุด (${configLabel(sel.closest)}) ชนะ ${d.winRate}% เหนือการสุ่ม ${signed(d.excess!.mean)} จุด (${eq('p', d.pExcess)} ถ้าทดสอบแบบเดียว) แต่ลองไปทั้งหมด ${tested.length} แบบ — หลังปรับ ${eq('q', sel.closest.q)} (ต้อง < ${LAB.fdr}) จึงยังแยกจากโชคไม่ได้`,
    );
  }
  if (curRow?.discovery.winRate != null) {
    const d = curRow.discovery;
    reasons.push(
      `กติกาที่ล็อกอยู่ (${curLabel}) ชนะ ${d.winRate}% เทียบการสุ่ม ${d.baseline ?? '—'}% · ผลสุทธิ ${d.expectancy ? `${signed(d.expectancy.mean, 2)}%/ไม้` : '—'} ในช่วงค้นหา` +
        ((ctx.exec.targetR ?? 0) >= 1 ? ' — เป้าไกลแบบนี้ออกแบบให้กำไรต่อไม้ใหญ่ ไม่ได้ออกแบบให้ชนะบ่อย' : ''),
    );
  }
  reasons.push(power.note);
  if (level === 'holdout') reasons.push(`ไม้ forward ที่นับได้ ${fw.closed}/${power.nNeeded ?? '—'} ไม้`);
  if (level === 'rejected' || level === 'confirmed') {
    reasons.push(`ไม้ forward ${fw.closed} ไม้: ชนะ ${fWin}% เทียบการสุ่ม ${fBase ?? '—'}% (${eq('p', fP)})`);
  }

  // ─── แผน 6 ขั้น ───
  const plan: WinPlanStep[] = [];
  plan.push(
    synthetic
      ? {
          key: 'data',
          title: 'ใช้ข้อมูลจริง',
          status: 'block',
          detail: `ตอนนี้คือ "${ctx.data.label}" — นำเข้าข้อมูลจริงก่อน (bun scripts/fetch-yahoo.ts --universe demo --yes ซึ่งต้องเข้าถึง query1.finance.yahoo.com หรือนำเข้า CSV) แล้วกลับมาดูหน้านี้ใหม่ ผลบนข้อมูลจำลองใช้เลือก config ไม่ได้`,
        }
      : { key: 'data', title: 'ใช้ข้อมูลจริง', status: 'ok', detail: `ข้อมูลจริง: ${ctx.data.label} · หน้าต่าง ${lab.start} → ${lab.end} (${lab.years} ปี · ${lab.signals} สัญญาณ)` },
  );
  plan.push(
    sel.selected
      ? {
          key: 'search',
          title: 'ค้นหาในช่วงค้นหาเท่านั้น',
          status: 'ok',
          detail: `เลือก ${configLabel(sel.selected)} ตามเกณฑ์ที่ตั้งไว้ก่อนดูผล (${eq('q', sel.selected.q)} · ผู้ผ่าน ${sel.candidates} แบบ)`,
        }
      : {
          key: 'search',
          title: 'ค้นหาในช่วงค้นหาเท่านั้น',
          status: 'block',
          detail:
            `ไม่มี config ผ่านเกณฑ์ (ชนะ ≥ ${T}% · ผลสุทธิ > 0 · เหนือการสุ่ม q < ${LAB.fdr}) จาก ${tested.length} แบบ · ทางที่ถูกต้องมี 2 ทาง: ` +
            `(ก) เก็บข้อมูลเพิ่มแล้วค้นหาใหม่ด้วยเกณฑ์เดิม (ข) ประกาศ config เดียวล่วงหน้า${sel.closest ? ` เช่น ${configLabel(sel.closest)}` : ''} แล้วพิสูจน์ด้วยไม้ forward อย่างเดียว — ไม่ต้องปรับการทดสอบหลายแบบ แต่ต้องคาดว่าอัตราชนะจริงจะต่ำกว่าที่เห็นในอดีต (winner's curse) · ห้ามลดเกณฑ์หลังเห็นผล`,
        },
  );
  plan.push(
    !sel.selected
      ? { key: 'holdout', title: 'ทดสอบช่วงทดสอบครั้งเดียว', status: 'wait', detail: `รอผู้ผ่านขั้นค้นหา — ช่วงทดสอบ ${lab.split} → ${lab.end} (${lab.holdoutSignals} สัญญาณ) ยังไม่ถูกใช้ตัดสิน` }
      : passedHoldout
        ? { key: 'holdout', title: 'ทดสอบช่วงทดสอบครั้งเดียว', status: 'ok', detail: `ผ่าน: ชนะ ${sel.selected.holdout.winRate}% เทียบการสุ่ม ${sel.selected.holdout.baseline}% (${eq('p', sel.selected.holdout.pExcess)})` }
        : {
            key: 'holdout',
            title: 'ทดสอบช่วงทดสอบครั้งเดียว',
            status: 'block',
            detail: `ไม่ผ่าน (ต้องชนะ ≥ ${T}% · เหนือการสุ่ม p < ${LAB.alpha} · ผลสุทธิ > 0 · ไม้ปิด ≥ ${LAB.minTrades}) — ห้ามเลือกตัวอื่นจากผลช่วงทดสอบ ต้องกลับไปขั้นค้นหาด้วยข้อมูลใหม่`,
          },
  );
  const sTarget = sel.selected;
  plan.push(
    !sTarget || !passedHoldout
      ? {
          key: 'lock',
          title: 'ล็อกกติกาออกใน RULES.execution',
          status: 'wait',
          detail: `ล็อกได้หลังผ่านช่วงทดสอบ · กติกาออกตอนนี้ ${curLabel} (${ctx.rules.hashShort} · ${!ctx.rules.locked ? 'ยังไม่ล็อก' : ctx.rules.matches ? 'ล็อกแล้ว' : 'แก้หลังล็อก'})`,
        }
      : sTarget.filter !== 'all'
        ? {
            key: 'lock',
            title: 'ล็อกกติกาออกใน RULES.execution',
            status: 'block',
            detail: `ตัวกรอง "${FILTER_LABEL[sTarget.filter]}" ยังไม่อยู่ในกติกาที่รอบประจำวันใช้ — ต้องเพิ่มตัวกรองในรอบประจำวันก่อนล็อก`,
          }
        : matchesReference && lockedOk
          ? { key: 'lock', title: 'ล็อกกติกาออกใน RULES.execution', status: 'ok', detail: `ล็อก ${curLabel} แล้ว (${ctx.rules.hashShort})` }
          : {
              key: 'lock',
              title: 'ล็อกกติกาออกใน RULES.execution',
              status: 'block',
              detail: `ตั้ง RULES.execution = { targetR: ${sTarget.targetR}, stopMult: ${sTarget.stopMult}, holdDays: ${sTarget.holdDays} } แล้วล็อกกติกาใหม่ที่หน้า "กระบวนการทำงาน" — ไม้ forward เริ่มนับหลังล็อก`,
            },
  );
  plan.push(
    !tracking
      ? {
          key: 'forward',
          title: 'เก็บไม้ forward ให้ครบจำนวน',
          status: 'wait',
          detail: `เริ่มนับหลังล็อก config ที่ผ่าน · ต้องใช้ ${power.nNeeded ?? '—'} ไม้ปิด${power.years !== null ? ` (≈ ${power.years} ปีที่ความถี่ในอดีต)` : ''} · รอบประจำวันบันทึกคำสั่งก่อนตลาดเปิดให้อัตโนมัติ`,
        }
      : forwardDone
        ? { key: 'forward', title: 'เก็บไม้ forward ให้ครบจำนวน', status: 'ok', detail: `ครบ ${fw.closed}/${power.nNeeded} ไม้` }
        : { key: 'forward', title: 'เก็บไม้ forward ให้ครบจำนวน', status: 'wait', detail: `${fw.closed}/${power.nNeeded} ไม้ปิด · ชนะตอนนี้ ${fWin ?? '—'}% (ยังห้ามใช้ตัดสิน)` },
  );
  plan.push(
    !forwardDone
      ? {
          key: 'decide',
          title: 'ตัดสินครั้งเดียวเมื่อครบ',
          status: 'wait',
          detail: `เมื่อครบ ${power.nNeeded ?? '—'} ไม้: ผ่านถ้าชนะ ≥ ${T}% และเหนือการสุ่ม p < ${LAB.alpha} — ห้ามแอบดูแล้วหยุดก่อนครบ (การหยุดเมื่อผลดูดีทำให้ผลบวกปลอมเพิ่มขึ้นมาก)`,
        }
      : forwardPass
        ? { key: 'decide', title: 'ตัดสินครั้งเดียวเมื่อครบ', status: 'ok', detail: `ยืนยัน: ชนะ ${fWin}% เทียบการสุ่ม ${fBase}% (${eq('p', fP)})` }
        : { key: 'decide', title: 'ตัดสินครั้งเดียวเมื่อครบ', status: 'block', detail: `ไม่ยืนยัน: ชนะ ${fWin}% เทียบการสุ่ม ${fBase ?? '—'}% (${eq('p', fP)}) — เลิกใช้ config นี้ แล้วเริ่มขั้นค้นหาใหม่ด้วยข้อมูลที่ไม่เคยใช้` },
  );

  const reach = [...sel.reach].sort((a, b) => (b.discovery.excess?.mean ?? -1e9) - (a.discovery.excess?.mean ?? -1e9));
  return {
    target: T,
    costPct: ctx.exec.costPct,
    data: ctx.data,
    window: {
      start: lab.start,
      end: lab.end,
      split: lab.split,
      signals: lab.signals,
      discoverySignals: lab.discoverySignals,
      holdoutSignals: lab.holdoutSignals,
      embargoSignals: lab.embargoSignals,
      embargo: EMBARGO,
      randomPerSignal: LAB.randomPerSignal,
      years: lab.years,
    },
    grid: {
      targetsR: LAB.targetsR,
      stopMults: LAB.stopMults,
      holds: LAB.holds,
      filters: LAB.filters.map((key) => ({ key, label: FILTER_LABEL[key] })),
      configs: lab.rows.length,
    },
    current: {
      targetR: ctx.exec.targetR,
      stopMult: ctx.exec.stopMult,
      holdDays: ctx.exec.holdDays,
      rulesHashShort: ctx.rules.hashShort,
      locked: ctx.rules.locked,
      matches: ctx.rules.matches,
      label: curLabel,
      row: curRow,
    },
    curves: lab.curves,
    cells: lab.rows.map(cellOf),
    funnel: {
      configs: lab.rows.length,
      tested: tested.length,
      reach: sel.reach.length,
      positive: positive.length,
      candidates: sel.candidates,
      significant: significant.length,
      selected: !!sel.selected,
      holdoutPass: sel.holdoutPass,
    },
    reach,
    selection: { rule: SELECTION_RULE, candidates: sel.candidates, selected: sel.selected, closest: sel.closest, holdoutPass: sel.holdoutPass },
    verdict: { level, title: title[level], reasons },
    power,
    trap,
    plan,
    forward: {
      config: curLabel,
      matchesReference,
      closed: fw.closed,
      wins: fw.wins,
      winRate: fWin,
      wilson: fWil ? { lo: r1(100 * fWil.lo), hi: r1(100 * fWil.hi) } : null,
      baseline: fBase,
      pVsBaseline: fP,
      needed: matchesReference ? power.nNeeded : null,
    },
    method: [
      `"ชนะ" = ไม้ที่ปิดแล้วได้ผลสุทธิ > 0 หลังค่าธรรมเนียมไป-กลับ ${ctx.exec.costPct}% · ใช้โบรกเกอร์กระดาษชุดเดียวกับรอบประจำวัน (pullback = limit ที่ขอบบนโซนเข้า · momentum = ซื้อราคาเปิดวันถัดไป · ราคาปัดตามช่วงราคา SET · คำสั่งมีอายุ ${ctx.exec.orderDays} วัน · แท่งที่แตะทั้ง stop และเป้านับเป็น stop)`,
      `ฐานเทียบ = การสุ่มเข้า ${LAB.randomPerSignal} วันต่อสัญญาณ: หุ้นเดียวกัน ช่วงเวลาเดียวกัน แผน ณ วันนั้นคำนวณแบบเดียวกัน กติกาออกและค่าธรรมเนียมเดียวกัน — ส่วนที่ชนะเกินฐานนี้เท่านั้นที่นับเป็นฝีมือ`,
      `แบ่งตามเวลา: ${LAB.discoveryShare * 100}% แรกของสัญญาณ = ช่วงค้นหา · ที่เหลือ = ช่วงทดสอบ (เริ่ม ${lab.split}) · ตัดสัญญาณรอยต่อ ${EMBARGO} วันทำการ (${lab.embargoSignals} สัญญาณ) ไม่ให้ไม้ของช่วงค้นหาคร่อมเข้าช่วงทดสอบ`,
      'ความไม่แน่นอนแบบ cluster-robust รายสัปดาห์ (t, df = จำนวนสัปดาห์ − 1) — สัญญาณในสัปดาห์เดียวกันมักไปทางเดียวกัน จึงนับเป็นหลักฐานอิสระเต็มจำนวนไม่ได้ (design effect)',
      `ปรับการทดสอบหลายแบบด้วย Benjamini–Hochberg ข้าม ${tested.length} config ที่มีไม้ปิด ≥ ${LAB.minTrades} (FDR ${LAB.fdr})`,
      `เกณฑ์เลือก: ${SELECTION_RULE}`,
      `จำนวนไม้ forward: ทดสอบสัดส่วนทางเดียว α ${LAB.alpha} กำลัง ${LAB.power * 100}% ระหว่างอัตราชนะของการสุ่ม (p0) กับ ${T}% แล้วคูณ design effect · p0 ประมาณจากช่วงค้นหาและถือว่ารู้ค่าแน่นอน`,
      `ตัวกรองตั้งไว้ก่อนดูผล: ${LAB.filters.map((f) => FILTER_LABEL[f]).join(' · ')} — "P(ขึ้น)" คือค่าประมาณของระบบ ณ วันสัญญาณ (แบบเร็ว)`,
      "ข้อจำกัด: ผลในอดีตของ config ที่ถูกเลือกจากหลายแบบสูงเกินจริงเสมอ (winner's curse) · อัตราชนะสูงไม่ได้แปลว่ากำไร ต้องดูผลสุทธิต่อไม้ควบคู่เสมอ",
    ],
  };
}
