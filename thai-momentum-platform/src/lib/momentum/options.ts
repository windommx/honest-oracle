// ============================================================
// Options module — Synthetic Long Futures + Covered Call ITM playbook
//
// Synthetic Long = Long Call ATM + Short Put ATM (strike/หมดอายุเดียวกัน)
//   Payoff = max(S−K,0) − max(K−S,0) = S − K → เท่ากับ futures พอดี
//   แก้ maturity mismatch futures vs options โดยไม่ต้องเฝ้าตี 4-5
//
// 4 กับดักที่ระบบเช็คให้:
//   1. Margin × 2 (call วาง margin + put วาง margin)
//   2. Early exercise (TFEX options เป็น American — monitor deep ITM put)
//   3. Pin risk ห้ามทำเมื่อ S ∈ [K−0.5%, K+0.5%] ช่วง 3 วันสุดท้าย
//   4. Friction × 3 ขา (ปิด LF + เปิด call + เปิด put)
// ============================================================

export interface SyntheticCost {
  longCallPremium: number
  shortPutPremium: number
  callCommission: number // % ของ notional
  putCommission: number
  lfCloseCommission: number
  lfUnrealizedPnL: number // กำไร/ขาดทุนคงค้างของสถานะ futures (บาท)
}

export interface SyntheticDecision {
  fairFuture: number
  syntheticNet: number
  directNet: number
  preferred: "synthetic" | "direct"
  edgeBps: number
  pinRiskZone: boolean
  marginWarning: boolean
}

/** Synthetic vs Direct Futures — เลือกอันที่ net cost ถูกกว่า */
export function syntheticVsDirect(o: {
  spot: number
  strike: number
  expiry: number // วัน
  rf: number
  divYield: number
  cost: SyntheticCost
}): SyntheticDecision {
  const T = o.expiry / 365
  const fairFuture = o.spot * Math.exp((o.rf - o.divYield) * T)
  const syntheticNet =
    o.cost.longCallPremium - o.cost.shortPutPremium + o.strike +
    (o.cost.callCommission + o.cost.putCommission) / 100 // normalize per contract
  const directNet = fairFuture + o.cost.lfCloseCommission / 100 - o.cost.lfUnrealizedPnL
  const dteLeft = o.expiry
  return {
    fairFuture,
    syntheticNet,
    directNet,
    preferred: syntheticNet < directNet ? "synthetic" : "direct",
    edgeBps: (Math.abs(syntheticNet - directNet) / o.spot) * 10000,
    pinRiskZone: (Math.abs(o.spot - o.strike) / o.spot < 0.005 && dteLeft < 3) as boolean,
    marginWarning: true, // synthetic ต้องวาง margin สองขาเสมอ — governor ต้องเช็ค
  }
}

export type ItmPlaybook = "ROLL_OR_ASSIGN" | "SYNTHETIC_SWAP" | "ROLL_UP_AND_OUT" | "HOLD_AND_MONITOR"

/** Covered Call ITM resolution playbook — ทางเลือกเมื่อ call ใกล้ถูก exercise */
export function resolveITM(p: {
  callStrike: number
  spot: number
  daysToExpiry: number
  iv30: number
  futuresMaturityDays: number
  hasSyntheticAvailable: boolean
}): ItmPlaybook {
  const itmDepth = (p.spot - p.callStrike) / p.spot
  if (p.daysToExpiry <= 2 && itmDepth > 0.02) return "ROLL_OR_ASSIGN"
  if (p.futuresMaturityDays < p.daysToExpiry - 1 && p.hasSyntheticAvailable) return "SYNTHETIC_SWAP"
  if (p.iv30 > 0.5 && p.daysToExpiry > 7) return "ROLL_UP_AND_OUT"
  return "HOLD_AND_MONITOR"
}

export const ITM_PLAYBOOK_TH: Record<ItmPlaybook, string> = {
  ROLL_OR_ASSIGN: "ใกล้หมดอายุ + ITM ลึก > 2% — ยอมให้ถูก call (roll สถานะเดือนถัดไป)",
  SYNTHETIC_SWAP: "futures หมดอายุก่อน options — ใช้ synthetic long แทนช่วง maturity mismatch",
  ROLL_UP_AND_OUT: "IV สูง (> 0.5) + เวลาเหลือพอ — roll ขึ้น strike สูงขึ้น เดือนถัดไป",
  HOLD_AND_MONITOR: "ยังไม่จำเป็นต้องแก้ — เฝ้าดูต่อ",
}
