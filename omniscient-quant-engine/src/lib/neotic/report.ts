// ============================================================
// สแกน Neotic 3D — คำตัดสิน · รายการความพร้อมของข้อมูล · วิธีคิด (pure)
// คำตัดสินใช้กติกาตามสเปก (ไม่ได้จูนบนข้อมูลนี้) เทียบการสุ่มเข้าในหน้าต่างเดียวกันเท่านั้น
// ============================================================

import { thDate } from '@/lib/flows/format';
import { PYBROKER_VERSION } from '@/lib/walkforward/bridge';
import { EXEC } from '@/lib/workflow/execution';
import { NEO, NEO_EMBARGO, NEO_LOOSE, NEO_RULE, thresholdsLabel, type NeoComputed } from './compute';
import type { NeoCheck, NeoLevel, NeoticResponse } from './types';

const ALPHA = 0.05;
const sgn = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;
const pTxt = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
const ci = (c: { mean: number; lo: number; hi: number }, unit = '%') => `${sgn(c.mean)}${unit} [${sgn(c.lo)}, ${sgn(c.hi)}]`;
const n0 = (v: number) => v.toLocaleString('en-US');

const BINDING_LABEL: Record<string, string> = {
  rs: `RS Rank ≥ ${NEO.locked.rsDiv}`,
  zone: `ระยะ ${NEO.locked.knee}–${NEO.locked.distB}% ใต้จุดสูงสุด`,
  growth: 'กำไรโตทั้ง QoQ และ YoY',
  volume: `ปริมาณ ≥ ${NEO.locked.volTrigger}×`,
};

export interface NeoticContext {
  data: { kind: string; label: string };
  bridge: { rows: number; symbols: number; signals: number };
}

function readiness(c: NeoComputed, synthetic: boolean): NeoCheck[] {
  const f = c.facts;
  const v = c.funnel.volume;
  const L = NEO.locked;
  const signalsStep = c.funnel.steps[c.funnel.steps.length - 1].count;
  const checks: NeoCheck[] = [];
  checks.push(
    synthetic
      ? { key: 'kind', title: 'ชนิดข้อมูล', status: 'warn', detail: 'ข้อมูลจำลองเพื่อการสาธิต — ทุกตัวเลขในหน้านี้ใช้ซ้อมวิธีเท่านั้น ไม่ใช่ผลของหุ้นไทยจริง' }
      : { key: 'kind', title: 'ชนิดข้อมูล', status: 'ok', detail: 'ข้อมูลตลาดจริงที่นำเข้า (ดูที่มา/สิทธิ์การใช้ที่หน้าข้อมูล)' },
  );
  checks.push(
    f.sessions >= NEO.sessionsPerYear
      ? { key: 'history', title: 'ประวัติราคา ≥ 252 วัน + ช่วงทดสอบ', status: 'ok', detail: `หลังช่วงคำนวณ ROC 252 วันมีหน้าต่าง ${n0(f.sessions)} วันทำการ (${f.years} ปี) · ${f.stocks} หุ้น` }
      : {
          key: 'history',
          title: 'ประวัติราคา ≥ 252 วัน + ช่วงทดสอบ',
          status: 'warn',
          detail: `หลังช่วงคำนวณ ROC 252 วันเหลือเพียง ${n0(f.sessions)} วันทำการ — ควรมีอย่างน้อย 1 ปี (${NEO.sessionsPerYear} วัน) จึงเห็นหลายสภาวะตลาด`,
        },
  );
  const zeroNote = f.zeroVolPct > 5 ? ` · ${f.zeroVolPct}% ของวัน-หุ้นไม่มีการซื้อขาย (หยุดพัก/ข้อมูลหาย)` : '';
  checks.push(
    v.max === null || v.max < L.volTrigger
      ? {
          key: 'volume',
          title: `วันปริมาณพุ่ง ≥ ${L.volTrigger}×`,
          status: 'block',
          detail:
            `ไม่มีวันไหนที่ปริมาณถึง ${L.volTrigger} เท่าของค่าเฉลี่ย ${NEO.volWindow} วัน (สูงสุด ${v.max ?? '—'}× · 99% ของวันต่ำกว่า ${v.p99 ?? '—'}×)` +
            (synthetic ? ' — ข้อมูลจำลองไม่มีวันข่าว/วันประกาศงบที่ปริมาณพุ่งแบบหุ้นจริง กติกานี้จึงทดสอบด้วยข้อมูลจริงเท่านั้น' : '') +
            zeroNote,
        }
      : signalsStep === 0
        ? {
            key: 'volume',
            title: `วันปริมาณพุ่ง ≥ ${L.volTrigger}×`,
            status: 'warn',
            detail: `มีวันปริมาณถึงเกณฑ์ ${n0(v.aboveTrigger)} วัน-หุ้น (สูงสุด ${v.max}×) แต่ไม่ตรงกับวันที่หุ้นอยู่โซน B และกำไรเขียว${zeroNote}`,
          }
        : { key: 'volume', title: `วันปริมาณพุ่ง ≥ ${L.volTrigger}×`, status: 'ok', detail: `ปริมาณถึงเกณฑ์ ${n0(v.aboveTrigger)} วัน-หุ้น · สูงสุด ${v.max}× · มัธยฐาน ${v.p50}×${zeroNote}` },
  );
  checks.push(
    f.fundStocks === 0
      ? {
          key: 'fundamentals',
          title: 'งบรายไตรมาส (กำไรสุทธิ + งวด)',
          status: 'block',
          detail: 'ไม่มีงบรายไตรมาส → ประเมิน "เขียว" ไม่ได้ จึงไม่มีสัญญาณ · Yahoo ให้แค่ราคา — นำเข้างบผ่าน /api/data/ingest (period เช่น 2025-Q1 · netProfitM · announceDate)',
        }
      : f.growthToday < f.stocks * 0.8
        ? {
            key: 'fundamentals',
            title: 'งบรายไตรมาส (กำไรสุทธิ + งวด)',
            status: 'warn',
            detail: `รู้การเติบโตทั้ง QoQ และ YoY ณ วันล่าสุดเพียง ${f.growthToday}/${f.stocks} หุ้น (ต้องมีงบอย่างน้อย 5 งวดติดกัน) — หุ้นที่เหลือไม่มีวันเป็นสัญญาณ`,
          }
        : {
            key: 'fundamentals',
            title: 'งบรายไตรมาส (กำไรสุทธิ + งวด)',
            status: 'ok',
            detail: `รู้การเติบโตทั้ง QoQ และ YoY ณ วันล่าสุด ${f.growthToday}/${f.stocks} หุ้น${synthetic ? ' (งบจำลอง)' : ''}`,
          },
  );
  checks.push(
    f.early > 0 || f.unparsed > 0
      ? {
          key: 'announce',
          title: 'วันประกาศงบจริง (กัน look-ahead)',
          status: 'warn',
          detail:
            [
              f.early > 0 ? `${f.early} งวดมีวันประกาศเร็วกว่า ${NEO.minAnnounceLag} วันหลังสิ้นงวด (มักเป็นวันสิ้นงวด) → ใช้วันสิ้นงวด + ${NEO.lagDays} วันแทนตามกฎระมัดระวังของต้นแบบ` : '',
              f.unparsed > 0 ? `${f.unparsed} แถวมีป้ายงวดที่อ่านไม่ได้ (ต้องเป็นรูป 2025-Q1) จึงไม่ถูกใช้` : '',
            ]
              .filter(Boolean)
              .join(' · '),
        }
      : f.fundStocks === 0
        ? { key: 'announce', title: 'วันประกาศงบจริง (กัน look-ahead)', status: 'info', detail: 'ยังไม่มีงบให้ตรวจ' }
        : {
            key: 'announce',
            title: 'วันประกาศงบจริง (กัน look-ahead)',
            status: 'ok',
            detail: `ใช้งบตั้งแต่วันประกาศเท่านั้น · ประกาศหลังสิ้นงวดมัธยฐาน ${f.lagMedian ?? '—'} วัน${synthetic ? ' (วันประกาศของงบจำลอง)' : ''}`,
          },
  );
  checks.push(
    synthetic
      ? { key: 'survivorship', title: 'หุ้นที่เลิกซื้อขาย (survivorship)', status: 'info', detail: 'ข้อมูลจำลองไม่มีหุ้นเลิกกิจการ — ข้อมูลจริงต้องรวมหุ้นที่ถูกถอนในช่วงทดสอบด้วย' }
      : f.delisted.length
        ? { key: 'survivorship', title: 'หุ้นที่เลิกซื้อขาย (survivorship)', status: 'ok', detail: `มีหุ้นที่หยุดซื้อขายก่อนวันสุดท้าย ${f.delisted.length} ตัว: ${f.delisted.slice(0, 8).join(', ')}${f.delisted.length > 8 ? ' …' : ''}` }
        : {
            key: 'survivorship',
            title: 'หุ้นที่เลิกซื้อขาย (survivorship)',
            status: 'warn',
            detail: 'ทุกหุ้นยังซื้อขายถึงวันสุดท้าย — ถ้ารายชื่อมาจาก "หุ้นที่ยังอยู่วันนี้" ผลจะดีเกินจริง ควรเพิ่มหุ้นที่ถูกถอน/เลิกกิจการในช่วงนั้น',
          },
  );
  checks.push(
    c.backtest.stats.trades >= NEO.minTrades
      ? { key: 'sample', title: `ไม้ที่ปิดแล้ว ≥ ${NEO.minTrades}`, status: 'ok', detail: `${c.backtest.stats.trades} ไม้ปิดจาก ${c.backtest.stats.signals} สัญญาณ` }
      : {
          key: 'sample',
          title: `ไม้ที่ปิดแล้ว ≥ ${NEO.minTrades}`,
          status: c.backtest.stats.signals === 0 ? 'block' : 'warn',
          detail: `มี ${c.backtest.stats.signals} สัญญาณ · ไม้ปิด ${c.backtest.stats.trades} — น้อยเกินกว่าจะบอกอะไรได้`,
        },
  );
  checks.push({
    key: 'eps',
    title: 'EPS จากกำไรสุทธิ',
    status: 'info',
    detail: 'ใช้อัตราเติบโตของกำไรสุทธิรายไตรมาสแทน EPS (เท่ากันเมื่อจำนวนหุ้นไม่เปลี่ยน) — ช่วงที่มีเพิ่มทุน/แตกพาร์ ค่าจะต่างจาก EPS จริง',
  });
  return checks;
}

function verdictOf(c: NeoComputed, synthetic: boolean): { level: NeoLevel; title: string; reasons: string[] } {
  const st = c.backtest.stats;
  const fu = c.funnel;
  const steps = fu.steps;
  const funnelLine = `กรวยตามสเปก (${thDate(c.start)} – ${thDate(c.end)}): วัน-หุ้น ${n0(steps[0].count)} → RS ≥ ${NEO.locked.rsDiv} ${n0(steps[1].count)} → โซน B ${n0(steps[2].count)} → เขียว ${n0(steps[3].count)} → ปริมาณ ≥ ${NEO.locked.volTrigger}× ${n0(steps[4].count)}`;
  if (c.facts.fundStocks === 0) {
    return {
      level: 'nodata',
      title: 'ยังประเมินกติกา Neotic 3D ไม่ได้ — ข้อมูลชุดนี้ไม่มีงบรายไตรมาส',
      reasons: [
        'เงื่อนไข "เขียว" ต้องใช้กำไรรายไตรมาสพร้อมวันประกาศ (กัน look-ahead) — ไม่มีงบ = ไม่มีวันไหนผ่าน จึงไม่มีสัญญาณ',
        funnelLine,
        'นำเข้างบผ่าน /api/data/ingest: period (เช่น 2025-Q1) · netProfitM (กำไรสุทธิรายไตรมาส ล้านบาท) · announceDate (ถ้าไม่รู้ ให้ใช้วันสิ้นงวด + 60 วัน)',
      ],
    };
  }
  if (st.trades < NEO.minTrades) {
    const bind = fu.binding ? BINDING_LABEL[fu.binding] : null;
    const reasons = [funnelLine];
    if (fu.binding === 'volume' && fu.volume.max !== null) {
      reasons.push(
        `เงื่อนไขที่หายากที่สุดคือปริมาณ: ทั้งหน้าต่างมีวันที่ปริมาณ ≥ ${NEO.locked.volTrigger}× เพียง ${n0(fu.volume.aboveTrigger)} วัน-หุ้น · 99% ของวันต่ำกว่า ${fu.volume.p99}× · สูงสุด ${fu.volume.max}×` +
          (synthetic ? ' — ข้อมูลจำลองไม่มีวันข่าว/วันประกาศงบที่ปริมาณพุ่งแบบหุ้นจริง' : ''),
      );
    } else if (bind) {
      reasons.push(`เงื่อนไขที่หายากที่สุดคือ ${bind}`);
    }
    reasons.push(`ถ้าเปลี่ยนเกณฑ์ปริมาณ (เงื่อนไขอื่นตามสเปก): ${fu.byTrigger.map((b) => `${b.trigger}× → ${b.signals}`).join(' · ')} สัญญาณ`);
    reasons.push(
      synthetic
        ? 'ขั้นต่อไป: ใช้ข้อมูลจริง (ราคา + ปริมาณ + งบรายไตรมาสพร้อมวันประกาศ) แล้วหน้านี้จะทดสอบให้ครบทั้ง 4 ชั้นโดยอัตโนมัติ'
        : `ต้องมีไม้ปิดอย่างน้อย ${NEO.minTrades} ไม้ก่อนตัดสิน — เพิ่มจำนวนหุ้นในจักรวาลหรือช่วงเวลาที่ยาวขึ้น`,
    );
    return {
      level: 'insufficient',
      title: st.signals === 0 ? `ยังไม่มีสัญญาณให้ทดสอบ — ${bind ?? 'เงื่อนไข'} ไม่เกิดพร้อมเงื่อนไขอื่นในข้อมูลชุดนี้` : `สัญญาณยังน้อยเกินตัดสิน — ไม้ปิด ${st.trades} จาก ${st.signals} สัญญาณ`,
      reasons,
    };
  }
  const exp = st.expectancy;
  const ex = st.excess;
  const level: NeoLevel =
    exp && ex && exp.lo > 0 && ex.lo > 0 && st.pExcess !== null && st.pExcess < ALPHA ? 'evidence' : ex && ex.hi < 0 ? 'worse' : 'none';
  const title =
    level === 'evidence'
      ? 'กติกาตามสเปกทำกำไรสุทธิและเหนือการสุ่มเข้าอย่างมีนัย'
      : level === 'worse'
        ? 'กติกาตามสเปกแย่กว่าการสุ่มเข้าด้วยกติกาออกเดียวกันอย่างมีนัย'
        : 'ยังสรุปไม่ได้ว่ากติกาตามสเปกดีกว่าการสุ่มเข้า';
  const reasons: string[] = [
    `${st.trades} ไม้ปิด · ชนะ ${st.winRate}% [${st.wilson?.lo}–${st.wilson?.hi}] · ผลสุทธิต่อไม้ ${exp ? ci(exp) : '—'} · การสุ่มเข้าด้วยกติกาออกเดียวกัน ${st.random.expectancy === null ? '—' : `${sgn(st.random.expectancy)}%`} (ชนะ ${st.random.winRate ?? '—'}%)`,
    ex && st.pExcess !== null ? `เหนือการสุ่ม ${ci(ex, ' จุด')} · ${pTxt(st.pExcess)} (cluster-robust รายสัปดาห์)` : 'ยังจับคู่กับการสุ่มเข้าได้ไม่พอ',
    `profit factor ${st.profitFactor ?? '—'}${st.pfCI ? ` [${st.pfCI.lo}–${st.pfCI.hi}]` : ''} · drawdown ${st.maxDD ?? '—'} จุด (95% ของลำดับที่สลับได้ ≤ ${st.maxDD95 ?? '—'}) · ถือเฉลี่ย ${st.avgDays ?? '—'} วัน · ออก: เป้า ${st.byExit.target} · stop ${st.byExit.stop} · หลุด EMA ${st.byExit.trail} · ครบ ${NEO.maxHold} วัน ${st.byExit.time}`,
  ];
  const wf = c.walkforward;
  if (wf.ready && wf.tuned && wf.locked) {
    reasons.push(
      `เดินหน้า ${wf.folds.length} หน้าต่าง: จูนเกณฑ์บน train ได้ ${wf.tuned.expectancy ? `${sgn(wf.tuned.expectancy.mean)}%` : '—'} ต่อไม้นอกตัวอย่าง เทียบเกณฑ์ตามสเปก ${wf.locked.expectancy ? `${sgn(wf.locked.expectancy.mean)}%` : '—'}` +
        (wf.wfe !== null ? ` · WFE ${wf.wfe.toFixed(2).replace('-', '−')}` : '') +
        (wf.vsLocked && wf.pVsLocked !== null ? ` · ส่วนต่าง ${ci(wf.vsLocked, ' จุด')} (${pTxt(wf.pVsLocked)})` : ''),
    );
  } else if (wf.reason) {
    reasons.push(`ยังเดินหน้าจูนเกณฑ์ไม่ได้: ${wf.reason}`);
  }
  const e = c.excursion;
  if (e.signal.eRatio !== null && e.random.eRatio !== null) {
    reasons.push(`E-ratio (MFE ÷ MAE ถือ ${e.horizon} วัน) สัญญาณ ${e.signal.eRatio} · วันสุ่ม ${e.random.eRatio} — ${e.signal.eRatio > e.random.eRatio ? 'จังหวะเข้าได้เปรียบกว่าวันสุ่ม' : 'จังหวะเข้าไม่ได้เปรียบกว่าวันสุ่ม'}`);
  }
  return { level, title, reasons };
}

function methodNotes(): string[] {
  const w = NEO.weights.map((x) => `${x.weight.toFixed(2)}·ROC${x.days}`).join(' + ');
  return [
    `RS Rank: คะแนนดิบ = ${w} → จัดอันดับตัดขวางทุกวันเฉพาะหุ้นที่มีการซื้อขายวันนั้น (ค่าเท่ากันใช้อันดับเฉลี่ย) ÷ จำนวนหุ้น × 99 แบบ rank(pct=True) × 99 ของโค้ดต้นแบบ — เป็นการเทียบทั้งตลาด ไม่ใช่การทำนายรายตัว`,
    `ระยะจากจุดสูงสุด 52 สัปดาห์ = % ที่ราคาปิดต่ำกว่า high สูงสุด ${NEO.highWindow} วันทำการ (รวมวันนั้น) · โซน B = RS ≥ ${NEO.locked.rsDiv} และระยะ ${NEO.locked.knee}–${NEO.locked.distB}% (ไม่รวม ${NEO.locked.distB}) · ใกล้กว่า ${NEO.locked.knee}% = "ใกล้จุดสูงสุด" · ไกลกว่า = "ไกลจากจุดสูงสุด"`,
    `ปริมาณ = ปริมาณวันนั้น ÷ ค่าเฉลี่ยของ ${NEO.volWindow} วันทำการก่อนหน้า (ไม่รวมวันนั้น · นับเฉพาะวันที่มีการซื้อขาย อย่างน้อย ${NEO.volMinDays} วัน)`,
    `เขียว = กำไรสุทธิไตรมาสล่าสุดที่ประกาศแล้วโตทั้ง QoQ และ YoY (เทียบงวดก่อนหน้าและงวดเดียวกันปีก่อนตามป้ายงวด) · ใช้ได้ตั้งแต่วันประกาศ · ประกาศเร็วกว่า ${NEO.minAnnounceLag} วันหลังสิ้นงวด = ใช้วันสิ้นงวด + ${NEO.lagDays} วัน · สีอื่น (โตด้านเดียว/ไม่โต/ไม่มีงบ) เป็นการแบ่งของ OQE เพื่อแสดงผลเท่านั้น`,
    `เข้า: ซื้อราคาเปิดวันซื้อขายถัดไป (คำสั่งอยู่ ${EXEC.orderDays} วันทำการเมื่อหยุดพัก) · ยกเลิกถ้าเปิดต่ำกว่าราคาปิดวันสัญญาณเกิน ${NEO.stopPct}% · วัดผลเป็น % ต่อไม้ ขนาดเท่ากันทุกไม้ (risk 2% กับ stop ${NEO.stopPct}% คงที่ = ทุกไม้ขนาดเท่ากันอยู่แล้ว · ไม่ได้จำลองเงินสด/จำนวนไม้ที่ถือพร้อมกัน)`,
    `ออก (ค่าชั่วคราวของโค้ดตัวอย่าง): stop ${NEO.stopPct}% และเป้า ${NEO.targetPct}% (${NEO_RULE.targetR}R) จากราคาได้ของ · ราคาปิดต่ำกว่า EMA${NEO.emaPeriod} → ขายราคาเปิดวันถัดไป (ตัดสินใจหลังรู้ราคาปิด) · ไม่บังคับออกตามเวลา แต่ปิดไม้ที่ค้างครบ ${NEO.maxHold} วันทำการ · หักค่าธรรมเนียมไป-กลับ ${EXEC.costPct}% · ชนะ = ผลสุทธิ > 0`,
    `ฐานเทียบ = การสุ่มเข้า ${NEO.randomPerSignal} วันต่อสัญญาณ: หุ้นเดียวกัน · วันใดก็ได้ในหน้าต่างเดียวกัน · แผนและกติกาออกเดียวกัน · ค่าธรรมเนียมเดียวกัน → วัดว่าจังหวะเข้าของสแกนให้อะไรเพิ่มจากการถือหุ้นตัวนั้นในช่วงนั้น`,
    `สถิติ: อัตราชนะ + Wilson CI · ผลต่อไม้และส่วนต่างจากการสุ่มด้วย CI แบบ cluster-robust รายสัปดาห์ (สัญญาณในสัปดาห์เดียวกันไม่อิสระกัน) · profit factor/drawdown จาก bootstrap สุ่มทั้งสัปดาห์ ${NEO.boot} รอบ`,
    `เดินหน้า: ผู้สมัคร = วัน-หุ้นที่ผ่านเกณฑ์หลวมสุดของกริด (${thresholdsLabel(NEO_LOOSE)} + เขียว) · ${NEO.folds} หน้าต่าง test ตัดตามจำนวนผู้สมัคร (train เริ่ม ${Math.round(NEO.initialShare * 100)}% แรก แบบ anchored) · ตัดรอยต่อ ${NEO_EMBARGO} วันทำการ · แต่ละหน้าต่างเลือกจาก ${NEO.grid.rsDiv.length * NEO.grid.knee.length * NEO.grid.distB.length * NEO.grid.volTrigger.length} ชุดเกณฑ์ (ช่วงเดียวกับ Optuna ของต้นแบบ) ตัวที่ผลสุทธิเฉลี่ยใน train สูงสุด (ไม้ปิด ≥ ${NEO.minTrain}) แล้ววัดบน test เทียบเกณฑ์ตามสเปกและการสุ่มเข้า`,
    `MAE/MFE: เดินราคาหลังสัญญาณแบบไม่ถูกตัด (stop กว้าง ${NEO.wideStopPct}% · ไม่มีเป้า · ไม่ออกตาม EMA · ถือ ${NEO.excursionHold} วัน) เทียบวันสุ่ม ${NEO.randomStudy} วันต่อสัญญาณ · SL = MAE เปอร์เซ็นไทล์ ${NEO.maeQ * 100} · TP = MFE เปอร์เซ็นไทล์ ${NEO.mfeQ * 100} ใช้บรรยายเท่านั้น — ใช้ตัวเลขนี้ย้อนทดสอบบนข้อมูลเดิม = จูนติดอดีต`,
    'สิ่งที่ไม่อยู่ใน backtest (ตามกับดักข้อ 5 ของต้นแบบ): ความทึบ/ขนาด/สีของจุดในแผนภาพเป็นชั้นแสดงผลเท่านั้น · ไม่ใช้ ML ก่อนมีฐานที่ผ่านการทดสอบ',
  ];
}

export function buildNeotic(c: NeoComputed, ctx: NeoticContext): NeoticResponse {
  const synthetic = ctx.data.kind !== 'real';
  return {
    data: ctx.data,
    asOf: c.asOf,
    spec: {
      thresholds: NEO.locked,
      weights: NEO.weights,
      highWindow: NEO.highWindow,
      volWindow: NEO.volWindow,
      exits: {
        stopPct: NEO.stopPct,
        targetPct: NEO.targetPct,
        targetR: NEO_RULE.targetR!,
        trailEma: NEO.emaPeriod,
        maxHold: NEO.maxHold,
        orderDays: EXEC.orderDays,
        costPct: EXEC.costPct,
      },
      lagDays: NEO.lagDays,
      minAnnounceLag: NEO.minAnnounceLag,
      grid: NEO.grid,
    },
    window: { start: c.start, end: c.end, sessions: c.facts.sessions, years: c.facts.years, stocks: c.facts.stocks },
    scan: c.scan,
    zones: c.zones,
    recent: c.recent,
    funnel: c.funnel,
    readiness: readiness(c, synthetic),
    backtest: c.backtest,
    walkforward: c.walkforward,
    excursion: c.excursion,
    verdict: verdictOf(c, synthetic),
    bridge: { ...ctx.bridge, pybroker: PYBROKER_VERSION },
    method: methodNotes(),
  };
}
