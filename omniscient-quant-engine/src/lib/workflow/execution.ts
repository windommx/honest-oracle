// ============================================================
// โบรกเกอร์กระดาษ (pure · point-in-time) — จำลองการส่งคำสั่งตามแผนเทรดของแพลตฟอร์มจากแท่งราคาหลังวันสัญญาณเท่านั้น
//  เข้า: pullback = ตั้งซื้อ (limit) ที่ขอบบนของโซนเข้า · momentum = ซื้อที่ราคาเปิดวันถัดไป · คำสั่งมีอายุ orderDays วันทำการ
//        ราคาตั้งซื้อและ stop ปัดลงตามช่วงราคาของ SET (floorToTick) ก่อนส่ง — ผู้เรียกเป็นผู้ปัด
//        เปิดต่ำกว่า stop = แผนใช้ไม่ได้ ยกเลิกคำสั่ง (ไม่ซื้อของที่หลุด stop แล้ว)
//  ออก: stop (stopHard ของแผน × stopMult) · เป้า +targetR × R · หมดเวลาหลังถือ holdDays วันทำการ (ออกที่ราคาปิด)
//        ผลสุทธิ = หักค่าธรรมเนียมไป-กลับ costPct · ไม้ "ชนะ" = ผลสุทธิ > 0 · ค่าทั้งหมดอยู่ใน RULES.execution (ล็อกได้)
//        แท่งเดียวแตะทั้ง stop และเป้า = นับ stop ก่อน · วันที่ได้ของตรวจเฉพาะ stop (ไม่รู้ลำดับราคาในวัน)
//        แท่งที่หยุดซื้อขาย (ปริมาณ 0) ไม่จับคู่ทั้งซื้อและขาย แต่นับเป็นวันทำการที่ผ่านไป
//  ทางเลือกของกติกา Neotic 3D: trailEma = ราคาปิดต่ำกว่า EMA ของราคาปิด → ขายที่ราคาเปิดของวันซื้อขายถัดไป
//        (ตัดสินใจหลังรู้ราคาปิด จึงขายได้เร็วสุดวันถัดไป — ไม่มี look-ahead) · stopPct = stop เป็น % ใต้ราคาได้ของ
//        (แบบ stop_loss_pct ของ PyBroker — คำนวณตอนได้ของแล้วปัด tick) · ไม่ใส่ทั้งสองค่า = พฤติกรรมเดิมทุกประการ
//  MAE/MFE (ราคาวิ่งสวน/วิ่งตามลึกสุดระหว่างถือ) วัดจากราคาได้ของแบบระมัดระวังเพราะไม่รู้ลำดับราคาในวัน:
//        low ของวันได้ของนับเสมอ (หลังแตะราคาตั้งซื้อ ราคาต้องลงต่อถึง low) · high ของวันได้ของนับเฉพาะเมื่อได้ของที่ราคาเปิด
//        วันออกที่ stop: MAE = ถึงราคาออก ไม่นับ high วันนั้น · วันออกที่เป้า: MFE = ถึงราคาเป้า · ออกเพราะหมดเวลา: นับทั้งแท่ง
//        ออกตามเส้น EMA ที่ราคาเปิด: นับเฉพาะราคาเปิดของวันนั้น
// ใช้ทั้งกับไม้ที่บันทึกจริงในรอบประจำวัน และกับการเล่นซ้ำย้อนหลัง (ฐานความคาดหวัง) — กติกาเดียวกันทุกจุด
// ============================================================

import { EXECUTION_RULES } from '@/lib/quant/engine/execution-rules';

/** กติกาการส่งคำสั่ง/ออก = RULES.execution (อยู่ใต้ hash ของการล็อก) */
export const EXEC = EXECUTION_RULES;

export type ExecRule = {
  orderDays: number;
  holdDays: number;
  targetR: number | null;
  costPct?: number;
  /** ออกเมื่อราคาปิดต่ำกว่า EMA (จำนวนวันนี้) ของราคาปิด → ขายที่ราคาเปิดของวันซื้อขายถัดไป · ไม่ใส่ = ไม่ใช้ */
  trailEma?: number;
};

const emaCache = new WeakMap<object, Map<number, Float64Array>>();

/** EMA ของราคาปิด (เริ่มด้วยค่าเฉลี่ย period วันแรก · ก่อนนั้น = NaN) — cache ต่ออาร์เรย์ราคา */
export function emaOf(close: ArrayLike<number>, period: number): Float64Array {
  let byPeriod = emaCache.get(close as object);
  if (!byPeriod) {
    byPeriod = new Map();
    emaCache.set(close as object, byPeriod);
  }
  const hit = byPeriod.get(period);
  if (hit) return hit;
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  if (period >= 1 && n >= period) {
    let s = 0;
    for (let i = 0; i < period; i++) s += close[i];
    out[period - 1] = s / period;
    const a = 2 / (period + 1);
    for (let i = period; i < n; i++) out[i] = a * close[i] + (1 - a) * out[i - 1];
  }
  byPeriod.set(period, out);
  return out;
}

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
  /** stop ของแผน (ราคาตายตัว) — ใช้ตรวจความถูกต้องของแผนและตรวจเปิดต่ำกว่า stop ก่อนได้ของ · ถ้ามี stopPct ระหว่างถือใช้ stop จาก % แทน */
  stop: number;
  /** stop เป็น % ใต้ราคาได้ของ (แบบ stop_loss_pct ของ PyBroker) คำนวณตอนได้ของแล้วปัด tick ลง */
  stopPct?: number;
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
/** trail = ราคาปิดต่ำกว่าเส้น EMA แล้วขายที่ราคาเปิดวันถัดไป (เฉพาะกติกาที่ตั้ง trailEma) */
export type ExitKind = 'target' | 'stop' | 'time' | 'trail';

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
  const pctOk = plan.stopPct === undefined || (plan.stopPct > 0 && plan.stopPct < 100);
  if (!(plan.stop > 0) || !(plan.close > plan.stop) || !limitOk || !pctOk || t < 0 || t > last) {
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
  const stop = plan.stopPct === undefined ? plan.stop : floorToTick(fillPrice * (1 - plan.stopPct / 100));
  const R = fillPrice - stop;
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
  if (bars.low[fillIdx] <= stop) {
    lo = stop; // ออกที่ stop แล้ว — low ที่ต่ำกว่านั้นเกิดหลังออก
    hi = fillPrice; // ไม่รู้ว่าขึ้นก่อนหรือหลังโดน stop ในวันเดียวกัน
    return done(fillIdx, stop, 'stop');
  }
  // เส้น EMA สำหรับออกตามแนวโน้ม: ปิดต่ำกว่าเส้น = ขายที่ราคาเปิดของวันซื้อขายถัดไป
  const ema = rule.trailEma ? emaOf(bars.close, rule.trailEma) : null;
  const below = (u: number) => ema !== null && Number.isFinite(ema[u]) && bars.close[u] < ema[u];
  let trailPending = below(fillIdx);
  const holdEnd = fillIdx + rule.holdDays;
  for (let u = fillIdx + 1; u <= Math.min(holdEnd, last); u++) {
    if (!(bars.volume[u] > 0)) continue;
    const o = bars.open[u];
    if (trailPending) {
      lo = Math.min(lo, o);
      hi = Math.max(hi, o);
      return done(u, o, o <= stop ? 'stop' : target !== null && o >= target ? 'target' : 'trail');
    }
    if (bars.low[u] <= stop) return done(u, o <= stop ? o : stop, 'stop');
    lo = Math.min(lo, bars.low[u]);
    if (target !== null && bars.high[u] >= target) return done(u, o >= target ? o : target, 'target');
    hi = Math.max(hi, bars.high[u]);
    if (below(u)) trailPending = true;
  }
  if (last >= holdEnd) return done(holdEnd, bars.close[holdEnd], 'time');
  return { ...base, state: 'open', fill, target: target === null ? null : round(target, 4), eventDate: fill.date, ...excursion() };
}
