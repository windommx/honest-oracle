// ============================================================
// Shadow Lab — outcome filler math (R multiple จาก close-series)
//
// สเปก: 2R → เลื่อน stop มาเท่าทุน (breakeven) → trail ด้วย 3-bar low
// สเปกเดิมเดินด้วย low/high ของแท่งเทียน: แตะ trail ด้วย low, แตะ 2R ด้วย high
// เรามีแค่ close → ใช้ close<=trail เป็น "โดน stop/trail" และ close>=r2
// เป็น "แตะ 2R" (approximation — document ไว้ชัด ๆ ทั้งแล็บใช้นิยามเดียวกัน)
// ============================================================

interface OutcomeWalk {
  r: number
  exited: boolean // true = โดน stop/trail ภายในบาร์ที่มี (ผลสรุปแล้ว)
}

function walkOutcome(closes: number[], entry: number, stop: number, horizon: number): OutcomeWalk {
  const r2 = entry + 2 * (entry - stop) // ระดับราคา 2R — จุดขายครึ่งแรก
  let trail = stop
  let halfBooked = false
  let r = -1 // ยังไม่ถึง 2R → ถ้าโดน stop ก่อน = แพ้เต็ม 1R

  const bars = Math.min(closes.length, horizon)
  for (let i = 0; i < bars; i++) {
    const c = closes[i]

    // โดน stop / trailing stop (close-proxy ของ low<=trail)
    if (c <= trail) return { r: halfBooked ? r : -1, exited: true }

    // แตะ 2R ครั้งแรก → จองกำไรครึ่งแรกที่ 2.0R แล้วเลื่อน stop มาเท่าทุนทันที
    if (!halfBooked && c >= r2) {
      halfBooked = true
      r = 2.0
      trail = Math.max(trail, entry)
    }

    if (halfBooked) {
      // trail 3-bar low ฉบับ close-proxy = min(close[t-2], close[t-1], close[t]) — เริ่มเมื่อมีบาร์หลังวันเข้าครบ 3 แท่ง
      if (i >= 2) trail = Math.max(trail, Math.min(closes[i - 2], closes[i - 1], c))
      // ครึ่งหลังปล่อยวิ่ง: r = 1.0 + (ครึ่งหลังวิ่งได้ R เท่าไร × 0.5)
      if (c > entry) {
        const openHalfR = 1.0 + ((c - entry) / (entry - stop)) * 0.5
        r = Math.max(r, openHalfR)
      }
    }
  }

  return { r, exited: false }
}

// closes = บาร์ที่มา "หลัง" วันเข้า (เก่า → ใหม่), horizon = จำกัดจำนวนบาร์ (default 20)
export function outcomeRFromCloses(closes: number[], entry: number, stop: number, horizon = 20): number {
  // guard สุขภาพ: ต้องมีระยะ stop เป็นบวกเสมอ (ไม่งั้น R คำนวณไม่ได้)
  if (!(entry > 0) || !(entry - stop > 0)) return -1
  return walkOutcome(closes, entry, stop, horizon).r
}

// ผลที่ "สรุปแล้ว" เท่านั้น — null = ยังตัดสินไม่ได้ (ไม่ต้องบันทึก ให้รอบหน้าคำนวณใหม่)
// สรุปได้เมื่อ (ก) โดน stop/trail ภายในบาร์ที่มี หรือ (ข) มีบาร์หลังวันเข้าครบ horizon แล้ว
// กันบั๊กให้คะแนนไม้ที่ยังเปิดอยู่ (เช่น มีอนาคตแค่ 2 บาร์ → เคยถูกบันทึก -1R ถาวร)
export function outcomeRIfResolved(closes: number[], entry: number, stop: number, horizon = 20): number | null {
  if (!(entry > 0) || !(entry - stop > 0)) return null
  const w = walkOutcome(closes, entry, stop, horizon)
  if (w.exited || closes.length >= horizon) return w.r
  return null
}
