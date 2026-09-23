// ============================================================
// Engine 4: Volatility Risk Premium — เครื่องผลิต cash flow (defined-risk เท่านั้น)
//
// กฎเหล็ก: ห้ามขาย strangle เปล่า — iron condor เท่านั้น (tail ถูกตัดโดยโครงสร้าง)
// - เปิดได้เมื่อ ivPct ≥ 0.45 (premium คุ้ม tail risk)
// - risk/trade ≤ riskPct ของ equity (default 1%)
// - ไม่เปิดใหม่เมื่อ regime = risk_off
// - วัด VRP จริงทุกเดือน: IV30 − realized30 ต้องยังเป็นบวกจึงรันต่อ
// ============================================================

/** S50 options multiplier = 200 บาท/จุด */
export const S50_MULTIPLIER = 200

export interface CondorPlan {
  open: boolean
  reason: string
  strikes?: { sP: number; lP: number; sC: number; lC: number }
  maxLoss?: number // บาท (ต่อ 1 ชุด condor)
  maxProfit?: number // บาท (net credit ต่อ 1 ชุด — ประมาณจาก premium ที่เก็บ)
  contracts?: number
}

export function condorPlan(o: {
  S: number
  iv: number // IV ทศนิยมรายปี
  ivPct: number // percentile 0..1 ของ IV
  dte: number // วันถึงหมดอายุ
  riskPct?: number // 0.01 = 1% ของ equity ต่อไม้
  equity: number
}): CondorPlan {
  const riskPct = o.riskPct ?? 0.01
  // input จากเครื่องคิดเลขฝั่ง UI (ช่องว่าง = 0) — S/IV/DTE ≤ 0 ทำให้ maxLoss = 0 → "เปิดได้ Infinity ชุด"
  // หรือ strikes เป็น NaN จึงต้องตอบว่าข้อมูลไม่ครบ แทนการคำนวณเลขปลอม
  if (!(o.S > 0 && o.iv > 0 && o.dte > 0 && o.equity > 0 && riskPct > 0 && Number.isFinite(o.ivPct)))
    return { open: false, reason: "ข้อมูลไม่ครบ — S50 index, IV, DTE, equity และ IV percentile ต้องเป็นตัวเลขมากกว่า 0" }
  if (o.ivPct < 0.45)
    return { open: false, reason: "IV ถูกเกิน: premium ไม่คุ้ม tail risk (ivPct < 0.45)" }
  const em = o.S * o.iv * Math.sqrt(o.dte / 365)
  const strikes = {
    sP: o.S - 1.2 * em,
    lP: o.S - 1.6 * em,
    sC: o.S + 1.2 * em,
    lC: o.S + 1.6 * em,
  }
  const maxLoss = (strikes.lC - strikes.sC) * S50_MULTIPLIER
  const contracts = Math.floor((o.equity * riskPct) / maxLoss)
  return {
    open: true,
    reason:
      contracts >= 1
        ? `เปิดได้ ${contracts} ชุด (risk ${(riskPct * 100).toFixed(1)}% = ${(o.equity * riskPct).toLocaleString()} บาท)`
        : "equity ต่ำเกินสำหรับ 1 ชุดตาม risk budget",
    strikes,
    maxLoss,
    contracts: Math.max(0, contracts),
  }
}

export type VrpExitAction = "TAKE" | "STOP" | "CLOSE_TIME" | "HOLD"

export const vrpExit = (p0: number, p: number, dteLeft: number): VrpExitAction =>
  p <= 0.5 * p0 ? "TAKE" : p >= 2 * p0 ? "STOP" : dteLeft <= 7 ? "CLOSE_TIME" : "HOLD"

/** VRP จริง = IV30 − realized30 — ต้องเป็นบวกจึงมีสิทธิ์ขาย premium */
export const vrpMeasure = (iv30: number, realized30: number): number => iv30 - realized30
