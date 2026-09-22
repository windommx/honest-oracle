// ============================================================
// Thai snap-back panel (Task 9-c) — db-backed helper สำหรับ /api/jev/run
// คำนวณ input ของ snapback() (src/lib/momentum/signals/thai.ts)
// ให้ตรงนิยามเดียวกับ reversal() ของ src/lib/research/thai-fit.ts:
//   ret5        = close.pct_change(5)
//   zRet5       = (ret5 − rolling250 mean) / rolling250 std (ddof=1, valid ≥ 100)
//   turnoverPct = pct-rank cross-section ของ val เฉลี่ย 20 วัน (เทียบ "ทุกหุ้น"
//                 ที่มี valMa ของวันนั้น, 0..1)
//   mfd         = Σ(sign(ret1)·val) 20 วัน / Σ(val) 20 วัน (valid ≥ 15)
//   liq         = liq5 === 1 ของวันสัญญาณ
// ใช้ closePivot() (cache กลาง) + RawDaily query เดียว (val/liq5 ของ ~270
// วันทำการท้าย) เพื่อจำกัดหน่วยความจำ — ไม่แตะ libs เดิม
// ============================================================

import { db } from "@/lib/db"
import { closePivot } from "@/lib/momentum/core"

export interface SnapbackInputs {
  zRet5: number
  turnoverPct: number
  mfd: number
  liq: boolean
}

const VAL_WINDOW = 270 // จำนวนวันทำการที่ query val/liq5 (ครอบหน้าต่าง 20 วัน + เผื่อรูข้อมูล)
const Z_WIN = 250 // หน้าต่าง rolling z ของ ret5 ตามสเปก H2
const Z_MIN_VALID = 100 // valid ขั้นต่ำในหน้าต่าง z (ตาม thai-fit rollingZ)
const MA20_MIN_VALID = 10 // valid ขั้นต่ำของ val เฉลี่ย 20 วัน (ตาม thai-fit)
const FLOW_MIN_VALID = 15 // valid ขั้นต่ำของหน้าต่าง flow (ตาม thai-fit)

/**
 * คำนวณ snapback inputs ของทุกหุ้นที่มีข้อมูลในวันที่ `date` (มัก = วันล่าสุดของ snapshot)
 * — turnoverPct เป็น cross-sectional rank ต้องเทียบทุกหุ้นของวันนั้น จึงไม่กรอง universe
 * คืน Map symbol → inputs เฉพาะตัวที่คำนวณครบทุกค่า (ตัวไหนข้อมูลไม่พอ = ไม่อยู่ในผล)
 */
export async function snapbackInputsForDate(date: string): Promise<Map<string, SnapbackInputs>> {
  const out = new Map<string, SnapbackInputs>()
  const pivot = await closePivot()
  const pi = pivot.dateIdx.get(date)
  // ประวัติสั้นกว่าที่ rolling z (หน้าต่าง 250, valid ≥ 100) จะเป็นไปได้ → ไม่มีสัญญาณ
  if (pi === undefined || pi < Z_MIN_VALID + 6) return out

  // --- RawDaily query เดียว: val + liq5 ของ ~270 วันทำการท้าย (ทุกหุ้น) ---
  const winDates = pivot.dates.slice(Math.max(0, pi - VAL_WINDOW + 1), pi + 1)
  const raws = await db.rawDaily.findMany({
    where: { date: { in: winDates } },
    select: { date: true, symbol: true, val: true, liq5: true },
  })
  const valByDate = new Map<string, Map<string, { val: number; liq: boolean }>>()
  for (const r of raws) {
    let m = valByDate.get(r.date)
    if (!m) {
      m = new Map()
      valByDate.set(r.date, m)
    }
    m.set(r.symbol, { val: r.val, liq: r.liq5 === 1 })
  }

  // --- valMa20 (20 วันทำการท้าย, valid ≥ 10) → turnoverPct = pct-rank cross-section ---
  const maDates = winDates.slice(-20)
  const valMa = new Map<string, number>()
  for (const sym of pivot.symbols) {
    let s = 0
    let c = 0
    for (const d of maDates) {
      const v = valByDate.get(d)?.get(sym)
      if (v && Number.isFinite(v.val)) {
        s += v.val
        c++
      }
    }
    if (c >= MA20_MIN_VALID) valMa.set(sym, s / c)
  }
  const ranked = [...valMa.entries()].sort((a, b) => a[1] - b[1])
  const turnPct = new Map<string, number>()
  ranked.forEach(([sym], r) => turnPct.set(sym, (r + 1) / ranked.length))

  // --- ต่อหุ้น: zRet5 (rolling 250 ของ ret5) + mfd (20 วัน) ---
  for (const sym of pivot.symbols) {
    const si = pivot.symIdx.get(sym)
    if (si === undefined) continue
    // ret5 บนหน้าต่าง z: หนึ่งช่องต่อวัน (undefined เมื่อ close ขาด) — เทียบเท่า buf ของ thai-fit
    const r5: (number | undefined)[] = []
    for (let i = Math.max(5, pi - Z_WIN + 1); i <= pi; i++) {
      const c0 = pivot.px[i][si]
      const cf = pivot.px[i - 5][si]
      r5.push(Number.isFinite(c0) && Number.isFinite(cf) ? c0 / cf - 1 : undefined)
    }
    const cur = r5[r5.length - 1]
    if (cur === undefined) continue
    const valid = r5.filter((v): v is number => v !== undefined)
    if (valid.length < Z_MIN_VALID) continue
    const m = valid.reduce((s, v) => s + v, 0) / valid.length
    // two-pass variance (ddof=1) เหมือน thai-fit rollingZ
    let ss = 0
    for (const v of valid) ss += (v - m) * (v - m)
    const sd = Math.sqrt(ss / (valid.length - 1))
    if (sd <= 1e-12) continue

    // mfd = Σ(sign(ret1)·val) / Σ(val) ใน 20 วัน (val ขาด = ข้ามแถวนั้นตาม pandas)
    let num = 0
    let den = 0
    let c = 0
    for (const d of maDates) {
      const v = valByDate.get(d)?.get(sym)
      if (!v || !Number.isFinite(v.val)) continue
      den += v.val
      c++
      const di = pivot.dateIdx.get(d)
      if (di !== undefined && di >= 1) {
        const c0 = pivot.px[di][si]
        const cp = pivot.px[di - 1][si]
        if (Number.isFinite(c0) && Number.isFinite(cp)) num += Math.sign(c0 / cp - 1) * v.val
      }
    }
    if (c < FLOW_MIN_VALID || den <= 0) continue
    const liqNow = valByDate.get(date)?.get(sym)?.liq ?? false
    out.set(sym, {
      zRet5: (cur - m) / sd,
      turnoverPct: turnPct.get(sym) ?? 0,
      mfd: num / den,
      liq: liqNow,
    })
  }
  return out
}
