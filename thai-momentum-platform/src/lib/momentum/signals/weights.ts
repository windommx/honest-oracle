// ============================================================
// Weight learner — normalize น้ำหนักจาก |ICIR| ของสัญญาณที่ผ่านเกณฑ์เท่านั้น
// (ตัวที่ KILL ได้น้ำหนัก 0 = ไม่มีสิทธิ์ออกเสียงตาม pre-registered policy)
// ============================================================

import { promote, type IcSummary } from "./engine"

export type SignalKey = "mom" | "mfd" | "sec" | "vol"
export type SignalWeights = Record<SignalKey, number>

/** น้ำหนักสมมติฐานเริ่มต้น — ใช้จนกว่า IC จริงจะเป็นตัวกำหนด */
export const DEFAULT_W: SignalWeights = { mom: 0.45, mfd: 0.25, sec: 0.2, vol: 0.1 }

export function learnWeights(
  ic: Record<string, IcSummary>,
  signs: Record<string, 1 | -1>
): SignalWeights {
  const ok = Object.entries(ic).filter(([k, v]) => promote(v, signs[k]))
  const tot = ok.reduce((s, [, v]) => s + Math.abs(v.ICIR), 0) || 1
  const w: SignalWeights = { mom: 0, mfd: 0, sec: 0, vol: 0 }
  for (const [k, v] of ok) if (k in w) w[k as SignalKey] = Math.abs(v.ICIR) / tot
  // fallback: ถ้ายังไม่มีตัวใดผ่านเลย คงน้ำหนักสมมติฐานเดิม (แต่ alpha ยังไม่เปิด
  // เพราะ policy ต้องการ promoted.length > 0 ก่อนเสมอ)
  return Object.values(w).some((v) => v > 0) ? w : { ...DEFAULT_W }
}
