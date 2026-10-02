// ============================================================
// ประกอบคำตอบของหน้า "ทดสอบเดินหน้า" (pure — ทดสอบได้โดยไม่แตะ DB)
// คำตัดสินจากไม้นอกตัวอย่างเท่านั้น · กับดัก 9 ข้อ (6 ข้อจากข้อความต้นแบบ + 3 ข้อที่ต้นแบบไม่ได้พูดถึง) พร้อมสถานะของ OQE จริง
// ============================================================

import { EXEC } from '@/lib/workflow/execution';
import { LAB } from '@/lib/winrate/lab';
import { PYBROKER_VERSION } from './bridge';
import { exitLabel, holm, WF, type WfComputed } from './compute';
import type { WalkforwardResponse, WfLevel, WfOptimizer, WfTrap } from './types';

export interface WalkforwardContext {
  data: { kind: string; label: string };
  bridge: { rows: number; symbols: number; signals: number };
}

const signed = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
const eq = (name: string, v: number | null) => (v === null ? `${name} = —` : v < 0.001 ? `${name} < 0.001` : `${name} = ${v.toFixed(3)}`);
const ci = (c: { mean: number; lo: number; hi: number }, d = 2) => `${signed(c.mean, d)} [${signed(c.lo, d)}, ${signed(c.hi, d)}]`;
/** ไม้นอกตัวอย่างขั้นต่ำก่อนนับวิธีนั้นในคำตัดสิน */
const MIN_OOS = 10;
const OPTIMIZER_NOTES =
  'ล็อกไว้ (ไม่ปรับ) · จูนหากำไรสุทธิสูงสุด (objective แบบ Optuna ในข้อความต้นแบบ) · จูนหาอัตราชนะสูงสุดโดยกำไรสุทธิ > 0 · SL = MAE p95 / TP = MFE p75 (Layer 4 ของข้อความต้นแบบ วัดบน train เท่านั้น)';

export function buildWalkforward(c: WfComputed, ctx: WalkforwardContext): WalkforwardResponse {
  const synthetic = ctx.data.kind !== 'real';
  const enough = (o: WfOptimizer) => o.trades >= MIN_OOS && o.excess !== null && o.expectancy !== null;
  const pAdj = holm(c.optimizers.map((o) => (enough(o) ? o.pExcess : null)));
  const judged = c.optimizers.map((o, i) => ({ o, pAdj: pAdj[i] })).filter((x) => enough(x.o));
  const winners = judged.filter((x) => x.o.expectancy!.lo > 0 && x.o.excess!.lo > 0 && (x.pAdj ?? 1) < WF.alpha);
  const allWorse = judged.length > 0 && judged.every((x) => x.o.excess!.hi < 0);
  const level: WfLevel = winners.length ? 'evidence' : allWorse ? 'worse' : 'none';
  const best = winners.sort((a, b) => b.o.expectancy!.mean - a.o.expectancy!.mean)[0]?.o;
  const title: Record<WfLevel, string> = {
    evidence: best ? `มีหลักฐานนอกตัวอย่าง: “${best.label}” ทำกำไรสุทธิและเหนือการสุ่มเข้าในหน้าต่างเดียวกัน` : '',
    worse: 'นอกตัวอย่าง ทุกวิธีแย่กว่าการสุ่มเข้าในสัปดาห์เดียวกัน — จังหวะเข้ายังไม่มี edge จูนกติกาออกแบบไหนก็ช่วยไม่ได้',
    none: 'ยังสรุปไม่ได้ — ไม่มีวิธีไหนดีกว่าการสุ่มเข้าอย่างมีนัยนอกตัวอย่าง',
  };

  const byKey = Object.fromEntries(c.optimizers.map((o) => [o.key, o])) as Record<WfOptimizer['key'], WfOptimizer>;
  const reasons: string[] = [];
  if (synthetic) reasons.push(`ข้อมูลตอนนี้คือ "${ctx.data.label}" — ทุกตัวเลขในหน้านี้เป็นการซ้อมวิธี ใช้ตัดสินตลาดจริงไม่ได้`);
  const tuned = c.optimizers.filter((o) => o.key !== 'locked' && o.isExpectancy !== null && o.expectancy !== null);
  if (tuned.length) {
    reasons.push(
      `ผลต่อไม้ในตัวอย่าง → นอกตัวอย่าง: ${tuned.map((o) => `${o.label} ${signed(o.isExpectancy!)}% → ${signed(o.expectancy!.mean)}%${o.wfe !== null ? ` (WFE ${o.wfe < 0 ? '−' : ''}${Math.abs(o.wfe).toFixed(2)})` : ''}`).join(' · ')} — ค่าที่ดีที่สุดในอดีตอ่อนลงเมื่อเดินไปข้างหน้า`,
    );
  }
  const vs = c.optimizers.filter((o) => o.key !== 'locked' && o.pVsLockedAdj !== null && o.vsLocked !== null);
  if (vs.length) {
    const sig = vs.filter((o) => o.pVsLockedAdj! < WF.alpha && o.vsLocked!.lo > 0);
    reasons.push(
      sig.length
        ? `ดีกว่ากติกาที่ล็อกอย่างมีนัยหลังปรับ Holm: ${sig.map((o) => `${o.label} ${ci(o.vsLocked!)} จุด/สัญญาณ (${eq('p', o.pVsLockedAdj)})`).join(' · ')}`
        : `ไม่มีวิธีจูนไหนดีกว่ากติกาที่ล็อกอย่างมีนัยหลังปรับ Holm (${eq('p ต่ำสุด', Math.min(...vs.map((o) => o.pVsLockedAdj!)))})`,
    );
  }
  if (judged.length) {
    reasons.push(
      `เทียบการสุ่มเข้าด้วยกติกาออกเดียวกัน (จุด %/ไม้): ${judged.map((x) => `${x.o.label} ${ci(x.o.excess!)}`).join(' · ')}`,
    );
  }
  const mw = byKey.maxWin;
  if (mw && mw.winRate !== null && mw.random.winRate !== null && mw.winRate >= 70) {
    reasons.push(
      `“${mw.label}” ชนะ ${mw.winRate}% นอกตัวอย่าง แต่การสุ่มเข้าด้วยกติกาออกเดียวกันชนะ ${mw.random.winRate}% — ` +
        (mw.random.winRate >= mw.winRate ? 'ชนะบ่อยเพราะรูปทรงของกติกาออกและสภาวะตลาด ไม่ใช่ฝีมือ (ดูหน้าเป้าหมายชนะ 80%)' : 'ส่วนที่ชนะเกินการสุ่มเท่านั้นที่เป็นฝีมือ'),
    );
  }
  const er = c.maeMfe;
  if (er.signal.eRatio !== null && er.random.eRatio !== null) {
    reasons.push(
      `E-ratio (MFE ÷ MAE เฉลี่ย ถือ ${er.horizon} วัน) ของสัญญาณ ${er.signal.eRatio.toFixed(2)} เทียบการสุ่ม ${er.random.eRatio.toFixed(2)} — ` +
        (er.signal.eRatio > er.random.eRatio
          ? 'ราคาหลังสัญญาณวิ่งตามมากกว่าวิ่งสวนเมื่อเทียบวันสุ่ม'
          : 'ราคาหลังสัญญาณไม่ได้วิ่งตามมากกว่าวันสุ่ม: ตั้ง SL/TP จาก MAE/MFE จึงแค่ปรับให้เข้ากับความผันผวนทั่วไป ไม่ได้สร้าง edge'),
    );
  }
  if (c.folds.length) {
    const first = c.folds[0].testStart;
    const last = c.folds[c.folds.length - 1].testEnd;
    reasons.push(`หน้าต่าง test ทั้ง ${c.folds.length} ช่วงอยู่ใน ${first} → ${last} (สัญญาณกระจุกตามสภาวะตลาด) — ครอบคลุมสภาวะตลาดช่วงเดียว ผลจึงอาจไม่ทั่วไป`);
  }

  const traps: WfTrap[] = [
    {
      key: 'pit',
      title: 'งบการเงินต้องใช้ตามวันประกาศจริง (lookahead)',
      status: 'ok',
      detail:
        'panel ใช้งบล่าสุดที่วันประกาศ ≤ วันนั้น (asofFundamentals) · การนำเข้าบังคับมี announceDate · ข้อมูลจำลองประกาศ 45 วันหลังสิ้นไตรมาสจริง (v1.9.0 แก้กรณีป้ายงวดเป็นไตรมาสที่ยังไม่จบแล้ว) · ข้อมูลจริงที่ไม่มีงบ = สายพื้นฐานงดออกเสียง ไม่อ่านเป็นศูนย์',
    },
    synthetic
      ? {
          key: 'survivorship',
          title: 'รายชื่อหุ้นต้องรวมตัวที่ถูกถอน (survivorship)',
          status: 'info',
          detail: 'ข้อมูลจำลองไม่มีการถอนหุ้นโดยออกแบบ — เมื่อใช้ข้อมูลจริงต้องรวมหุ้นที่ถูกถอนในช่วงทดสอบ ไม่อย่างนั้นผลย้อนหลังจะดีเกินจริง',
        }
      : c.delisted.length
        ? {
            key: 'survivorship',
            title: 'รายชื่อหุ้นต้องรวมตัวที่ถูกถอน (survivorship)',
            status: 'info',
            detail: `มีหุ้นที่หยุดซื้อขายก่อนวันล่าสุด ${c.delisted.length} ตัว (${c.delisted.slice(0, 8).join(', ')}) · ระบบยังไม่จำลองการถอนหุ้น: ราคาถูกเติมด้วยราคาปิดล่าสุด ปริมาณ 0 และไม้ที่ถืออยู่ตอนนั้นจะค้าง`,
          }
        : {
            key: 'survivorship',
            title: 'รายชื่อหุ้นต้องรวมตัวที่ถูกถอน (survivorship)',
            status: 'warn',
            detail: 'ทุกหุ้นยังซื้อขายถึงวันล่าสุด — ถ้ารายชื่อมาจากรายชื่อปัจจุบัน ผลย้อนหลังจะดีเกินจริง · ใส่หุ้นที่ถูกถอนใน CSV ได้ แต่ระบบยังไม่จำลองการถอน (เติมราคาปิดล่าสุด ปริมาณ 0)',
          },
    {
      key: 'crossSection',
      title: 'อันดับข้ามหุ้น (เช่น RS Rank) ไม่ใช่การทำนายรายตัว',
      status: 'ok',
      detail: 'สัญญาณมาจากกติกา 5 ด่านต่อหุ้น-วัน ไม่มี ML ทำนายราคาในจังหวะเข้า · P(ขึ้น) ใช้เป็นตัวกรอง/ขนาดไม้ และหน้า Atlas วัด AUC นอกตัวอย่างไว้แล้ว (ใกล้ 0.5)',
    },
    {
      key: 'exits',
      title: 'ทดสอบด้วยกติกาออกจริง ไม่ใช่บังคับออกตามจำนวนแท่ง',
      status: 'ok',
      detail: `โบรกเกอร์กระดาษใช้ stop / เป้า ${EXEC.targetR ?? '—'}R / ถือ ${EXEC.holdDays} วันจาก RULES.execution (ล็อกได้) ชุดเดียวกับรอบประจำวัน — notebook ตัวอย่างใช้ hold_bars อย่างเดียว`,
    },
    { key: 'visual', title: 'สี/โซนบนหน้าจอเป็นแค่การแสดงผล', status: 'ok', detail: 'สัญญาณที่ทดสอบมาจากตารางด่านเท่านั้น ไม่มีเงื่อนไขจากสีหรือความทึบ' },
    {
      key: 'connector',
      title: 'ต้องมีตัวเชื่อมข้อมูลหุ้นไทย',
      status: synthetic ? 'warn' : 'ok',
      detail: `นำเข้า CSV และ Yahoo (.BK สกุลบาท) ได้ · ${synthetic ? 'ตอนนี้ยังเป็นข้อมูลจำลอง' : `ใช้ ${ctx.data.label}`} · ส่งออกไป PyBroker ได้จากปุ่มด้านล่าง`,
    },
    {
      key: 'selection',
      title: 'การจูนพารามิเตอร์ (เช่น Optuna) คือการทดสอบหลายแบบ',
      status: 'ok',
      detail: `หน้านี้เลือกบน train แล้ววัดบน test ที่ไม่เคยเห็นเท่านั้น · เทียบหลายวิธีปรับด้วย Holm · หน้าเป้าหมายชนะ 80% ปรับ FDR ข้าม ${c.configs} แบบ`,
    },
    {
      key: 'censored',
      title: 'MAE ของไม้ที่มี stop อยู่แล้วถูกตัดที่ stop',
      status: 'ok',
      detail: `กติกา SL/TP จาก MAE/MFE วัดจากการเดินราคาแบบไม่มีเป้า stop กว้าง ${WF.wideStop}× — ถ้าใช้ MAE ของไม้ที่มี stop 1× อยู่แล้ว เปอร์เซ็นไทล์ 95 จะชนเพดาน stop เดิมเสมอ`,
    },
    {
      key: 'costs',
      title: 'ค่าธรรมเนียม · ช่วงราคา · การได้ของ',
      status: 'warn',
      detail: `หักค่าธรรมเนียมไป-กลับ ${EXEC.costPct}% · ปัดราคาตาม tick ของ SET · limit ได้ของเมื่อ low แตะ · ยังไม่มี slippage และผลกระทบราคาจากขนาดไม้`,
    },
  ];

  return {
    data: ctx.data,
    window: {
      start: c.start,
      end: c.end,
      signals: c.signals,
      folds: c.folds.length,
      initialShare: WF.initialShare,
      embargo: WF.embargo,
      minTrain: WF.minTrain,
      randomPerSignal: WF.randomPerSignal,
      configs: c.configs,
    },
    costPct: EXEC.costPct,
    locked: { targetR: EXEC.targetR, stopMult: EXEC.stopMult, holdDays: EXEC.holdDays, filter: 'all', label: exitLabel({ targetR: EXEC.targetR, stopMult: EXEC.stopMult, holdDays: EXEC.holdDays, filter: 'all' }) },
    folds: c.folds,
    optimizers: c.optimizers,
    curves: c.curves,
    trades: c.trades,
    maeMfe: c.maeMfe,
    verdict: { level, title: title[level], reasons },
    traps,
    bridge: { ...ctx.bridge, pybroker: PYBROKER_VERSION },
    method: [
      `หน้าต่าง (แบบ walkforward ของ PyBroker): ${Math.round(WF.initialShare * 100)}% แรกของสัญญาณเป็น train เริ่มต้น แล้วแบ่งที่เหลือเป็น test ${WF.folds} ช่วงเท่ากันตามจำนวนสัญญาณ (ชิดขอบวัน) · train = สัญญาณทั้งหมดก่อน test (anchored) ลบช่วงตัดรอยต่อ ${WF.embargo} วันทำการ ให้ไม้ของ train ปิดก่อน test เริ่ม`,
      'ตัดหน้าต่างตามจำนวนสัญญาณ ไม่ใช่ตามเวลา: สัญญาณกระจุกตามสภาวะตลาด — ตัดตามเวลาแล้วบาง train ไม่มีไม้เลย (สคริปต์ PyBroker จะแสดงกรณีนี้ให้เห็น)',
      `วิธีเลือกกติกาออก (ตั้งไว้ก่อนดูผล): ${OPTIMIZER_NOTES}`,
      `กริดที่ค้นหา: เป้า ${LAB.targetsR.join('/')}R × stop ${LAB.stopMults.join('/')}× × ถือ ${LAB.holds.join('/')} วัน × ตัวกรอง ${LAB.filters.length} แบบ = ${c.configs} แบบ (ชุดเดียวกับหน้าเป้าหมายชนะ 80%) · ไม้ปิดใน train ต้อง ≥ ${WF.minTrain} · ไม่มีตัวผ่าน = ใช้กติกาที่ล็อก`,
      `ฐานเทียบ = สุ่มเข้า ${WF.randomPerSignal} วันต่อสัญญาณในหน้าต่าง test เดียวกัน (หุ้นเดียวกัน แผน ณ วันนั้น กติกาออกเดียวกัน ค่าธรรมเนียมเดียวกัน) — ใช้วันสุ่มชุดเดียวกันทุกวิธี`,
      'ความไม่แน่นอน: ผลต่อไม้และส่วนต่างแบบ cluster-robust รายสัปดาห์ (t) · profit factor และ drawdown จาก bootstrap ที่สุ่มทั้งสัปดาห์ 1,000 รอบ (แนวเดียวกับ bootstrap metrics ของ PyBroker) · เทียบกับกติกาที่ล็อกแบบจับคู่ต่อสัญญาณ (ไม่ได้ของ/ไม่ปิด/ถูกกรอง = 0) ปรับ Holm',
      'WFE (walk-forward efficiency) = ผลต่อไม้นอกตัวอย่าง ÷ ผลต่อไม้ในตัวอย่างของ config ที่ถูกเลือก (ถ่วงด้วยไม้) — ใกล้ 1 = ส่งต่อได้ · ต่ำหรือติดลบ = จูนติดอดีต',
      `MAE/MFE ของไม้ = ราคาวิ่งสวน/วิ่งตามลึกสุดระหว่างถือ (ไม่รู้ลำดับราคาในวันจึงนับแบบระมัดระวัง) · การศึกษา MAE/MFE ใช้การเดินราคาแบบไม่มีเป้า stop ${WF.wideStop}× หน่วยเป็น R ของ stop ในแผน · E-ratio = MFE เฉลี่ย ÷ MAE เฉลี่ย เทียบวันสุ่ม`,
      'ผลรวมต่อไม้ = ไม้ละหน่วยเท่ากัน ไม่ใช่ % ของพอร์ต (ไม่จำลองเงินสดจำกัดหรือการถือซ้อน) — สคริปต์ PyBroker มีโหมดพอร์ตจริงให้ลอง',
    ],
  };
}
