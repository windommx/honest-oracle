// ============================================================
// Price-series helpers ที่ทนรูข้อมูลจริง (หุ้นพักการซื้อขาย / หยุดซื้อขาย / IPO ใหม่)
// px = Pivot.px จาก closePivot() (dates × symbols, NaN = ไม่มีแถววันนั้น)
// pure — ไม่แตะ db (ใช้ร่วมกันโดย /api/portfolio, /api/portfolio/allocation, /api/verify, /api/jev/run)
// ============================================================

/** index ของราคาปิดล่าสุดที่มีจริง (finite > 0) ณ หรือก่อนวัน i (ไม่ต่ำกว่า minIdx) — ไม่มีเลย = -1 */
export function lastKnownIndex(px: number[][], si: number, i: number, minIdx = 0): number {
  for (let k = Math.min(i, px.length - 1); k >= Math.max(0, minIdx); k--) {
    const v = px[k]?.[si]
    if (Number.isFinite(v) && v > 0) return k
  }
  return -1
}

/**
 * ผลตอบแทนรายวันของหุ้น si ตั้งแต่วัน from ถึง to (รวมปลาย) แบบ "เทียบราคาปิดล่าสุดที่มี":
 *  - วันที่ไม่มีราคา (พักการซื้อขาย / ก่อนเข้าตลาด) = NaN
 *  - วันที่กลับมาเทรด = ราคาวันนั้น / ราคาปิดล่าสุดก่อนหน้า − 1
 *    (การเคลื่อนไหวช่วงพักการซื้อขายไม่หายไป — เดิมคู่ (NaN, ราคา) ถูกทิ้งทั้งก้อน)
 */
export function observedReturns(px: number[][], si: number, from: number, to: number): number[] {
  const out: number[] = []
  let prev = from > 0 ? lastKnownIndex(px, si, from - 1) : -1
  for (let i = from; i <= to; i++) {
    const v = px[i]?.[si]
    if (Number.isFinite(v) && v > 0) {
      out.push(prev >= 0 ? v / px[prev][si] - 1 : NaN)
      prev = i
    } else {
      out.push(NaN)
    }
  }
  return out
}

/**
 * ผลตอบแทน forward (%) จากราคาปิดวัน i ถึงราคาปิดล่าสุดที่มีจริงภายใน (i, i+hold]
 * (หุ้นพักการซื้อขายวันครบกำหนด / หยุดซื้อขายกลางทาง ยังวัดผลได้ด้วยราคาซื้อขายสุดท้าย)
 * null = หน้าต่างยังไม่ครบ (i+hold เกินข้อมูล) / ไม่มีราคาวัน i / ไม่มีการซื้อขายเลยหลังวัน i
 */
export function forwardReturnPct(px: number[][], i: number, si: number, hold: number): number | null {
  if (i < 0 || hold < 1 || i + hold >= px.length) return null
  const p0 = px[i]?.[si]
  if (!Number.isFinite(p0) || p0 <= 0) return null
  const k = lastKnownIndex(px, si, i + hold, i + 1)
  if (k < 0) return null
  return (px[k][si] / p0 - 1) * 100
}

export interface HeldPosition {
  symbol: string
  entryDate: string // YYYY-MM-DD
  entryPx: number
  slots: number
}

/**
 * ผลตอบแทน `days` วันทำการล่าสุดของพอร์ต (ถ่วง slots, ทศนิยม) ณ วัน pi — นับเฉพาะช่วงที่ถือจริง:
 *  - สถานะที่เข้าหลังวันฐาน (pi − days) ใช้ราคาเข้าเป็นฐาน (ไม่เอาการร่วงก่อนซื้อมาทริกเกอร์ kill switch)
 *  - หุ้นพัก/หยุดซื้อขายใช้ราคาปิดล่าสุดที่มีทั้งปลายและฐาน (ไม่หลุดจากการคำนวณ)
 * null = ประวัติไม่ถึง days วัน หรือไม่มีสถานะที่คำนวณได้
 */
export function heldPeriodReturn(
  positions: HeldPosition[],
  pivot: { dates: string[]; px: number[][]; symIdx: Map<string, number> },
  pi: number,
  days = 5
): number | null {
  if (!(pi >= days) || pi >= pivot.dates.length) return null
  const weekStart = pivot.dates[pi - days]
  let portRet = 0
  let wSum = 0
  for (const p of positions) {
    const si = pivot.symIdx.get(p.symbol)
    if (si === undefined || !(p.slots > 0)) continue
    const nowIdx = lastKnownIndex(pivot.px, si, pi)
    if (nowIdx < 0) continue
    const now = pivot.px[nowIdx][si]
    let ref: number
    if (p.entryDate > weekStart) {
      ref = p.entryPx
    } else {
      const refIdx = lastKnownIndex(pivot.px, si, pi - days)
      if (refIdx < 0) continue
      ref = pivot.px[refIdx][si]
    }
    if (!Number.isFinite(ref) || ref <= 0) continue
    portRet += p.slots * (now / ref - 1)
    wSum += p.slots
  }
  return wSum > 0 ? portRet / wSum : null
}
