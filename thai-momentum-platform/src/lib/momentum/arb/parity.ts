// ============================================================
// Engine 3: Parity + Dividend Arb — ล็อกกำไรไร้ทิศทาง (event-driven)
//
// parityArb : synthetic long (Ca−Pb+K·df) vs futures — เลือกขาที่ edge บวก
//             actionable เมื่อ edge > 2×ต้นทุนต่อขา
// divArb    : ปันผลที่ forecast เอง vs ที่ฝังในราคา futures — ล็อกได้ >0.5% เท่านั้น
//
// เป็น alert engine: 99% ของเวลาไม่มีสัญญาณ — นั่นคือฟีเจอร์ ไม่ใช่บั๊ก
// เปิดใช้เมื่อ ingest OptionsDaily แล้ว (ราคาต้องเป็น executable bid/ask จริง)
// ============================================================

export const RF_DEFAULT = 0.022

export interface ParityResult {
  longEdge: number // ซื้อ synthetic long + ขาย futures
  shortEdge: number // ขาย synthetic + ซื้อ futures
  best: number
  actionable: boolean
  side: "BUY_SYNTH_SELL_F" | "SELL_SYNTH_BUY_F"
}

export function parityArb(o: {
  Cb: number // call bid
  Ca: number // call ask
  Pb: number // put bid
  Pa: number // put ask
  F: number // futures px
  K: number // strike
  T: number // ปี
  cost: number // ต้นทุนต่อขา (หน่วยเดียวกับราคา)
  RF?: number
}): ParityResult {
  const df = Math.exp(-(o.RF ?? RF_DEFAULT) * o.T)
  const longEdge = o.F - (o.Ca - o.Pb + o.K * df)
  const shortEdge = o.Cb - o.Pa + o.K * df - o.F
  const best = Math.max(longEdge, shortEdge)
  return {
    longEdge,
    shortEdge,
    best,
    actionable: best > 2 * o.cost,
    side: longEdge >= shortEdge ? "BUY_SYNTH_SELL_F" : "SELL_SYNTH_BUY_F",
  }
}

export interface DivArbResult {
  pvEmbedded: number // PV ปันผลที่ฝังในราคา futures
  lockedPct: number // % ที่ล็อกได้หลังหักต้นทุนการเงิน
  actionable: boolean
}

export function divArb(o: {
  S: number
  F: number
  T: number
  divOwn: number // ปันผลที่เรา forecast (บาท)
  fin: number // ต้นทุนการเงิน (decimal ต่อปี)
  cost: number // ต้นทุนเทรด (decimal)
  RF?: number
}): DivArbResult {
  const pvEmbedded = o.S - o.F * Math.exp(-(o.RF ?? RF_DEFAULT) * o.T)
  const locked = (o.divOwn - pvEmbedded) / o.S - o.fin * o.T - o.cost
  return { pvEmbedded, lockedPct: locked, actionable: locked > 0.005 }
}
