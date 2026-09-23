// flow.ts — Behavior layer แบบ effort-vs-result (DAILY PROXY)
// เอกสารต้นทางใช้ Delta/footprint จาก tick — ข้อมูลเราเป็นรายวันจึงประมาณด้วยหลักเดียวกัน:
//   "แรงเยอะ (val สูง z-score) แต่ผลลัพธ์เล็ก (body สั้น) และปิดท้ายแข็งแรงฝั่งใดฝั่งหนึ่ง
//    หลังสัมผัสระดับสำคัญ" = มีแรงรองรับ/ดูดซับ (absorption) อยู่เบื้องหลัง
// ป้ายความจริงใจ: นี่คือ proxy รายวัน — เทียบเท่า Delta จริงไม่ได้ เชื่อได้เฉพาะทิศทางหยาบ

import type { OhlcBar, FlowProxy } from "./types"
import { isOhlcBar } from "./structure"

export function flowProxy(bars: OhlcBar[]): FlowProxy {
  const T = bars.length
  const last = bars[T - 1]
  const win = bars.slice(Math.max(0, T - 21), T) // รวมแท่งล่าสุด
  const vals = win.map((b) => b.val)
  const m = vals.reduce((s, v) => s + v, 0) / (vals.length || 1)
  const varSum = vals.reduce((s, v) => s + (v - m) * (v - m), 0) / (vals.length || 1)
  const sd = Math.sqrt(varSum)
  // clamp ±9 กันหน้าต่างคงที่ (sd≈0) ทำ z ระเบิด
  const valZ = sd < 1e-6 ? 0 : Math.max(-9, Math.min(9, (last.val - m) / sd))

  // แท่งต้องมี OHLC จริงและมีช่วงราคา (high > low) จึงอ่าน body/ตำแหน่งปิดได้ —
  // แท่งไม่มี OHLC (เติม 0) หรือแท่งแบน (high = low เช่นติดซิลลิ่ง/ฟลอร์ทั้งวัน) "ไม่ได้ปิดแข็งฝั่งใด":
  // body 0 · ตำแหน่งปิดกลาง 0.5 · ไม่นับ absorption (เดิม range 1e-9 ทำให้แท่งแบนกลายเป็น "ฝั่งขาย")
  const hasRange = isOhlcBar(last) && last.high > last.low
  const range = hasRange ? last.high - last.low : 0
  const bodyPct = hasRange ? Math.abs(last.close - last.open) / range : 0
  const closePosBar = hasRange ? (last.close - last.low) / range : 0.5

  // absorption: effort สูง (valZ ≥ 1) + ผลลัพธ์เล็ก (body < 35% ของ range)
  let side: "buy" | "sell" | null = null
  let score = 0
  if (hasRange && valZ >= 1 && bodyPct < 0.35) {
    // ปิดใกล้ high = ฝั่งซื้อดูดซับการขาย · ปิดใกล้ low = ฝั่งขายดูดซับการซื้อ
    side = closePosBar >= 0.6 ? "buy" : closePosBar <= 0.4 ? "sell" : null
    if (side) {
      const effort = Math.min(2, valZ) / 2 // 0..1
      const tightness = 1 - bodyPct / 0.35 // ยิ่ง body สั้นยิ่งดูดซับชัด
      const finish = side === "buy" ? (closePosBar - 0.6) / 0.4 : (0.4 - closePosBar) / 0.4
      score = Math.round(100 * (0.4 * effort + 0.35 * tightness + 0.25 * Math.max(0, Math.min(1, finish))))
    }
  }
  return { valZ, bodyPct, closePosBar, absorptionSide: side, absorptionScore: score }
}
