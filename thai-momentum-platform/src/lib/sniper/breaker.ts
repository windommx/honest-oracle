// breaker.ts — Circuit Breaker Protocol 3 ระดับ (ตามเอกสาร "ระบบตัดฉุกเฉินเหมือน ก.ล.ต. ใช้กับตลาด")
// เกณฑ์ลงทะเบียนล่วงหน้า (ค่าจากตารางในเอกสาร ปรับให้ตรวจได้จากข้อมูลที่เรามี):
//   Level 1 Caution  : ตลาดร่วงวันเดียว ≤ −2% · หรือไม้ที่ปิดล่าสุดรวม ≤ −1.5% · หรือ win rate 10 ไม้ล่าสุด < 40% (มี ≥ 8 ไม้)
//   Level 2 Danger   : ตลาดร่วงวันเดียว ≤ −3% · หรือไม้ปิดล่าสุดรวม ≤ −2.5% · หรือ DQ flags ≥ 3 (data feed พัง)
//   Level 3 Emergency: ตลาดร่วงวันเดียว ≤ −5% (SET โดนขายหนัก) — ระบบแนะนำ FLATTEN ALL
// ปรัชญาแพลตฟอร์ม: breaker "แนะนำ" และแจ้งเตือนเท่านั้น — การสั่งขายจริงต้องผ่าน Human Gate เหมือนเดิม

import type { BreakerState } from "./types"

export interface BreakerInputs {
  latestDate: string
  mkt1d: number
  mkt5d: number
  /** ไม้ที่ปิดล่าสุด (เรียงใหม่→เก่า): { exitDate, ret } */
  closedTrades: { exitDate: string; ret: number }[]
  openPositions: number
  dqFlags: number
}

export function computeBreaker(inp: BreakerInputs): BreakerState {
  const recent = inp.closedTrades.slice(0, 10)
  const lastDay = recent.length > 0 ? recent[0].exitDate : null
  const sameDay = lastDay ? recent.filter((t) => t.exitDate === lastDay) : []
  const lastClosedPnlPct = sameDay.length > 0 ? sameDay.reduce((s, t) => s + t.ret, 0) : null
  const winRate10 = recent.length >= 8 ? recent.filter((t) => t.ret > 0).length / recent.length : null

  const reasons: string[] = []
  const actions: string[] = []
  let level: 0 | 1 | 2 | 3 = 0

  const m1 = inp.mkt1d * 100
  if (m1 <= -5) {
    level = 3
    reasons.push(`ตลาดร่วงหนักวันเดียว ${m1.toFixed(1)}% (≤ −5%) — สัญญาณ Emergency ตาม Protocol`)
    actions.push("แนะนำ FLATTEN ALL — ปิดทุกไม้ถือเงินสด 100% โดยไม่สนกำไร/ขาดทุนชั่วคราว (ส่งเข้า Human Gate ยืนยัน)")
  } else if (m1 <= -3) {
    if (level < 2) level = 2
    reasons.push(`ตลาดร่วงวันเดียว ${m1.toFixed(1)}% (≤ −3%)`)
  } else if (m1 <= -2) {
    if (level < 1) level = 1
    reasons.push(`ตลาดร่วงวันเดียว ${m1.toFixed(1)}% (≤ −2%)`)
  }

  if (lastClosedPnlPct !== null) {
    if (lastClosedPnlPct <= -2.5) {
      if (level < 2) level = 2
      reasons.push(`ไม้ที่ปิดวันล่าสุด (${lastDay}) รวม ${lastClosedPnlPct.toFixed(1)}% (≤ −2.5%)`)
    } else if (lastClosedPnlPct <= -1.5) {
      if (level < 1) level = 1
      reasons.push(`ไม้ที่ปิดวันล่าสุด (${lastDay}) รวม ${lastClosedPnlPct.toFixed(1)}% (≤ −1.5%)`)
    }
  }

  if (winRate10 !== null && winRate10 < 0.4) {
    if (level < 1) level = 1
    reasons.push(`win rate 10 ไม้ล่าสุด ${Math.round(winRate10 * 100)}% (< 40%) — ระบบ/ตลาดเข้าข่าย "หลงทาง"`)
  }

  if (inp.dqFlags >= 3) {
    if (level < 2) level = 2
    reasons.push(`Data Quality flags ${inp.dqFlags} รายการ (≥ 3) — feed อาจผิดพลาด อย่าตัดสินใจบนข้อมูลเสีย`)
  }

  if (level >= 3) {
    actions.push("หยุดระบบทั้งหมดจนกว่าจะประเมินสถานการณ์ด้วยตนเอง")
  } else if (level === 2) {
    actions.push("หยุดเปิดไม้ใหม่ทันที — รอสัญญาณใหม่ในวันถัดไป")
    actions.push("ลาก Trailing Stop ของทุกไม้ที่ถืออยู่ให้ใกล้ราคาปัจจุบันที่สุด")
  } else if (level === 1) {
    actions.push("ลดขนาดไม้ใหม่ลง 50% และเปลี่ยนเป็นยืนยันเองทุกคำสั่ง (Manual Confirm)")
  } else {
    actions.push("ระบบปกติ — เดินตาม Checklist รายวันได้ตามปกติ")
  }
  if (inp.mkt5d * 100 <= -7) {
    reasons.push(`เทียบ 5 วันรวม ${(inp.mkt5d * 100).toFixed(1)}% — โหมดขาลงยืนยันแล้ว ระวังการเพิ่มถ่วงฝั่งซื้อ`)
  }

  const label = level === 0 ? "ปกติ" : level === 1 ? "Level 1 · Caution" : level === 2 ? "Level 2 · Danger" : "Level 3 · Emergency"
  return {
    level,
    label,
    reasons,
    actions,
    metrics: {
      latestDate: inp.latestDate,
      mkt1d: inp.mkt1d,
      mkt5d: inp.mkt5d,
      lastClosedPnlPct,
      lastClosedCount: sameDay.length,
      winRate10,
      openPositions: inp.openPositions,
      dqFlags: inp.dqFlags,
    },
  }
}
