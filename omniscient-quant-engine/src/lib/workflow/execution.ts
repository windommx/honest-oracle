// ============================================================
// โบรกเกอร์กระดาษ (pure · point-in-time) — จำลองการส่งคำสั่งตามแผนเทรดของแพลตฟอร์มจากแท่งราคาหลังวันสัญญาณเท่านั้น
//  เข้า: pullback = ตั้งซื้อ (limit) ที่ขอบบนของโซนเข้า · momentum = ซื้อที่ราคาเปิดวันถัดไป · คำสั่งมีอายุ orderDays วันทำการ
//        ราคาตั้งซื้อและ stop ปัดลงตามช่วงราคาของ SET (floorToTick) ก่อนส่ง — ผู้เรียกเป็นผู้ปัด
//        เปิดต่ำกว่า stop = แผนใช้ไม่ได้ ยกเลิกคำสั่ง (ไม่ซื้อของที่หลุด stop แล้ว)
//  ออก: stop (stopHard ของแผน × stopMult) · เป้า +targetR × R · หมดเวลาหลังถือ holdDays วันทำการ (ออกที่ราคาปิด)
//        ผลสุทธิ = หักค่าธรรมเนียมไป-กลับ costPct · ไม้ "ชนะ" = ผลสุทธิ > 0 · ค่าทั้งหมดอยู่ใน RULES.execution (ล็อกได้)
//        แท่งเดียวแตะทั้ง stop และเป้า = นับ stop ก่อน · วันที่ได้ของตรวจเฉพาะ stop (ไม่รู้ลำดับราคาในวัน)
//        แท่งที่หยุดซื้อขาย (ปริมาณ 0) ไม่จับคู่ทั้งซื้อและขาย แต่นับเป็นวันทำการที่ผ่านไป
//  MAE/MFE (ราคาวิ่งสวน/วิ่งตามลึกสุดระหว่างถือ) วัดจากราคาได้ของแบบระมัดระวังเพราะไม่รู้ลำดับราคาในวัน:
//        low ของวันได้ของนับเสมอ (หลังแตะราคาตั้งซื้อ ราคาต้องลงต่อถึง low) · high ของวันได้ของนับเฉพาะเมื่อได้ของที่ราคาเปิด
//        วันออกที่ stop: MAE = ถึงราคาออก ไม่นับ high วันนั้น · วันออกที่เป้า: MFE = ถึงราคาเป้า · ออกเพราะหมดเวลา: นับทั้งแท่ง
// ใช้ทั้งกับไม้ที่บันทึกจริงในรอบประจำวัน และกับการเล่นซ้ำย้อนหลัง (ฐานความคาดหวัง) — กติกาเดียวกันทุกจุด
// ============================================================

import { EXECUTION_RULES } from '@/lib/quant/engine/execution-rules';

/** กติกาการส่งคำสั่ง/ออก = RULES.execution (อยู่ใต้ hash ของการล็อก) */
export const EXEC = EXECUTION_RULES;

export type ExecRule = { orderDays: number; holdDays: number; targetR: number | null; costPct?: number };

/** stop ตามตัวคูณระยะ — วัดจากราคาอ้างอิง (ราคาตั้งซื้อ หรือราคาปิดวันสัญญาณสำหรับ momentum) · ตัวคูณ 1 = stopHard ของแผน */
export function scaledStop(ref: number, stopHard: number, mult: number): number {
  return mult === 1 ? stopHard : ref - (ref - stopHard) * mult;
}

/** ช่วงราคาขั้นต่ำ (tick) ของหุ้นใน SET ตามระดับราคา */
export function setTick(price: number): number {
  return price < 2 ? 0.01 : price < 5 ? 0.02 : price < 10 ? 0.05 : price < 25 ? 0.1 : price < 100 ? 0.25 : price < 200 ? 0.5 : price < 400 ? 1 : 2;
}

/** ปัดราคาลงให้ตรง tick ของ SET — ราคาตั้งซื้อ/stop ที่ส่งเข้าระบบซื้อขายได้จริง (ปัดลง = ไม่ซื้อแพงกว่าแผน · stop กว้างขึ้นเล็กน้อย) */
export function floorToTick(price: number): number {
  if (!(price > 0)) return price;
  const t = setTick(price);
  return Math.round(Math.floor(price / t + 1e-9) * t * 100) / 100;
}

export interface PlanInput {
  kind: 'pullback' | 'momentum';
  /** ราคาปิดวันสัญญาณ */
  close: number;
  /** ราคาตั้งซื้อ · null = ซื้อที่ราคาเปิดวันถัดไป */
  limit: number | null;
  stop: number;
}

export interface Bars {
  dates: readonly string[];
  open: ArrayLike<number>;
  high: ArrayLike<number>;
  low: ArrayLike<number>;
  close: ArrayLike<number>;
  volume: ArrayLike<number>;
}

/** order = คำสั่งยังรอ · open = ถืออยู่ · closed = ปิดแล้ว · expired = ไม่ได้ราคาในอายุคำสั่ง · gap = เปิดต่ำกว่า stop (ยกเลิก) · invalid = แผนผิดรูป */
export type PaperState = 'order' | 'open' | 'closed' | 'expired' | 'gap' | 'invalid';
export type ExitKind = 'target' | 'stop' | 'time';

export interface PaperResult {
  state: PaperState;
  fill: { index: number; date: string; price: number } | null;
  exit: { index: number; date: string; price: number; kind: ExitKind } | null;
  target: number | null;
  /** ผลเป็นหน่วย R · null = ยังไม่ปิด */
  r: number | null;
  /** ผลตอบแทน % จากราคาได้ของ · null = ยังไม่ปิด */
  retPct: number | null;
  /** ผลเป็น R หลังหักค่าธรรมเนียมไป-กลับ (ไม้ชนะ = rNet > 0) */
  rNet: number | null;
  /** ผลตอบแทน % หลังหักค่าธรรมเนียมไป-กลับ */
  retNetPct: number | null;
  /** วันทำการที่ถือ (ได้ของ → ออก) */
  days: number | null;
  /** จำนวนแท่งหลังวันสัญญาณที่มีข้อมูลแล้ว */
  barsSeen: number;
  /** แท่งที่เกิดเหตุการณ์ล่าสุด (ยกเลิก/หมดอายุ/ได้ของ/ออก) */
  eventDate: string | null;
  /** ราคาวิ่งสวนลึกสุดระหว่างถือ (% ของราคาได้ของ · ≥ 0) · ไม้ที่ยังถือ = ถึงวันล่าสุด · null = ไม่ได้ของ */
  maePct: number | null;
  /** ราคาวิ่งตามลึกสุดระหว่างถือ (% ของราคาได้ของ · ≥ 0) */
  mfePct: number | null;
  /** MAE เป็นหน่วย R (ระยะ stop ที่ใช้จริง) */
  maeR: number | null;
  /** MFE เป็นหน่วย R */
  mfeR: number | null;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function simulatePlan(bars: Bars, t: number, plan: PlanInput, rule: ExecRule = EXEC): PaperResult {
  const last = bars.dates.length - 1;
  const barsSeen = Math.max(0, last - t);
  const base = { fill: null, exit: null, target: null, r: null, retPct: null, rNet: null, retNetPct: null, days: null, barsSeen, maePct: null, mfePct: null, maeR: null, mfeR: null };
  const cost = rule.costPct ?? 0;
  const limitOk = plan.limit === null || (plan.limit > plan.stop && plan.limit > 0);
  if (!(plan.stop > 0) || !(plan.close > plan.stop) || !limitOk || t < 0 || t > last) {
    return { ...base, state: 'invalid', eventDate: null };
  }

  // ── ช่วงส่งคำสั่ง ──
  const orderEnd = t + rule.orderDays;
  let fillIdx = -1;
  let fillPrice = 0;
  let atOpen = false;
  for (let u = t + 1; u <= Math.min(orderEnd, last); u++) {
    if (!(bars.volume[u] > 0)) continue;
    const o = bars.open[u];
    if (o <= plan.stop) return { ...base, state: 'gap', eventDate: bars.dates[u] };
    if (plan.limit === null) {
      fillIdx = u;
      fillPrice = o;
      atOpen = true;
      break;
    }
    if (bars.low[u] <= plan.limit) {
      fillIdx = u;
      fillPrice = Math.min(o, plan.limit);
      atOpen = o <= plan.limit;
      break;
    }
  }
  if (fillIdx < 0) {
    return last >= orderEnd ? { ...base, state: 'expired', eventDate: bars.dates[orderEnd] } : { ...base, state: 'order', eventDate: null };
  }

  // ── ถือ ──
  const R = fillPrice - plan.stop;
  const target = rule.targetR === null ? null : fillPrice + rule.targetR * R;
  const fill = { index: fillIdx, date: bars.dates[fillIdx], price: round(fillPrice, 4) };
  // ราคาต่ำสุด/สูงสุดระหว่างถือ (ดูกติกาในหัวไฟล์) — เริ่มที่ราคาได้ของ
  let lo = Math.min(fillPrice, bars.low[fillIdx]);
  let hi = atOpen ? Math.max(fillPrice, bars.high[fillIdx]) : fillPrice;
  const excursion = () => {
    const mae = Math.max(0, fillPrice - lo);
    const mfe = Math.max(0, hi - fillPrice);
    return {
      maePct: round((mae / fillPrice) * 100, 3),
      mfePct: round((mfe / fillPrice) * 100, 3),
      maeR: round(mae / R, 3),
      mfeR: round(mfe / R, 3),
    };
  };
  const done = (index: number, price: number, kind: ExitKind): PaperResult => {
    if (kind === 'stop') lo = Math.min(lo, price);
    if (kind === 'target') hi = Math.max(hi, price);
    return {
      state: 'closed',
      fill,
      exit: { index, date: bars.dates[index], price: round(price, 4), kind },
      target: target === null ? null : round(target, 4),
      r: round((price - fillPrice) / R, 3),
      retPct: round((price / fillPrice - 1) * 100, 3),
      rNet: round((price - fillPrice - (fillPrice * cost) / 100) / R, 3),
      retNetPct: round((price / fillPrice - 1) * 100 - cost, 3),
      days: index - fillIdx,
      barsSeen,
      eventDate: bars.dates[index],
      ...excursion(),
    };
  };
  if (bars.low[fillIdx] <= plan.stop) {
    lo = plan.stop; // ออกที่ stop แล้ว — low ที่ต่ำกว่านั้นเกิดหลังออก
    hi = fillPrice; // ไม่รู้ว่าขึ้นก่อนหรือหลังโดน stop ในวันเดียวกัน
    return done(fillIdx, plan.stop, 'stop');
  }
  const holdEnd = fillIdx + rule.holdDays;
  for (let u = fillIdx + 1; u <= Math.min(holdEnd, last); u++) {
    if (!(bars.volume[u] > 0)) continue;
    const o = bars.open[u];
    if (bars.low[u] <= plan.stop) return done(u, o <= plan.stop ? o : plan.stop, 'stop');
    lo = Math.min(lo, bars.low[u]);
    if (target !== null && bars.high[u] >= target) return done(u, o >= target ? o : target, 'target');
    hi = Math.max(hi, bars.high[u]);
  }
  if (last >= holdEnd) return done(holdEnd, bars.close[holdEnd], 'time');
  return { ...base, state: 'open', fill, target: target === null ? null : round(target, 4), eventDate: fill.date, ...excursion() };
}
