// ============================================================
// Thai signal primitives — PURE functions (ไม่ import db/fs)
// ใช้ได้ทั้งจาก server (jev route) และงานวิจัยอื่น ๆ — ไม่มี side effect
// อ้างสเปก "เน้นการนำระบบไปใช้ลงทุนหุ้นไทยจริง" (thai_fit.py)
// ============================================================

/** น้ำหนัก timeframe เริ่มต้นสำหรับตลาดไทย (สายสั้นเป็นหลัก, tf ยาว = 0 จนกว่า H4 จะบอกอย่างอื่น) */
export const TF_WEIGHTS_TH: Record<number, number> = {
  5: 0.35,
  10: 0.3,
  20: 0.2,
  40: 0.1,
  80: 0.05,
  160: 0,
  300: 0,
}

/** จำนวนวันถือปกติของระบบหุ้นไทย */
export const HOLD_DEFAULT_TH = 5

const DAY_MS = 86_400_000

/** จำนวนวันจันทร์–ศุกร์ในช่วง [fromMs, toMs] — คิดแบบ UTC ล้วน (ไม่ขึ้นกับ TZ ของเครื่อง) */
function weekdaysBetween(fromMs: number, toMs: number): number {
  let n = 0
  for (let t = fromMs; t <= toMs; t += DAY_MS) {
    const wd = new Date(t).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}

/**
 * calendarMult — ตัวคูณขนาดไม้จาก seasonality (calendar overlay +0.15x)
 *   เงื่อนไขบูสต์ (ต้องผ่านอย่างน้อยหนึ่งข้อ):
 *     1) turn-of-month: i อยู่ใน 3 วันทำการแรกหรือ 3 วันทำการท้ายของเดือนเดียวกัน
 *        (เทียบ YYYY-MM ของ dates[i] กับเพื่อนบ้าน — dates ต้องเรียงวันทำการ asc)
 *        ขอบของข้อมูล (ข้อมูลเริ่มกลางเดือน / วันล่าสุดที่เดือนยังไม่จบ — Jev เรียกด้วย i = วันล่าสุดเสมอ)
 *        ไม่รู้วันทำการที่อยู่นอก dates → ประมาณด้วยวันจันทร์–ศุกร์ตามปฏิทิน
 *        (เดิมถือว่าขอบข้อมูล = ขอบเดือน → วันล่าสุดได้ 1.15 ทุกวันแม้อยู่กลางเดือน)
 *     2) เดือนมกราคม (month substring "01" = January) — เอฟเฟกต์เดือนแรกของปี
 *   ทุกเงื่อนไขถูก gate ด้วย regime !== 'risk_off' → ได้ 1.15, ไม่เข้าเงื่อนไข → 1.0
 */
export function calendarMult(dates: string[], i: number, regime: string): number {
  if (regime === "risk_off") return 1.0
  if (i < 0 || i >= dates.length) return 1.0
  const d = dates[i]
  const month = d.slice(5, 7) // "01" = January
  const myMonth = d.slice(0, 7) // YYYY-MM
  // หาขอบเดือน: ไล่ซ้าย/ขวาจนกว่า YYYY-MM จะเปลี่ยน (วันทำการต่อเนื่องใน dates)
  let first = i
  while (first > 0 && dates[first - 1].slice(0, 7) === myMonth) first--
  let last = i
  while (last < dates.length - 1 && dates[last + 1].slice(0, 7) === myMonth) last++
  // ชนขอบข้อมูลโดยเดือนยังไม่เปลี่ยน → นับวันทำการ (จ.–ศ.) ของเดือนที่อยู่นอกข้อมูลเพิ่ม
  const y = Number(d.slice(0, 4))
  const m = Number(month)
  const before =
    first === 0 ? weekdaysBetween(Date.UTC(y, m - 1, 1), Date.parse(`${dates[0]}T00:00:00Z`) - DAY_MS) : 0
  const after =
    last === dates.length - 1
      ? weekdaysBetween(Date.parse(`${dates[last]}T00:00:00Z`) + DAY_MS, Date.UTC(y, m, 0))
      : 0
  const posInMonth = i - first + before // 0-based
  const fromMonthEnd = last - i + after
  const turnOfMonth = posInMonth < 3 || fromMonthEnd < 3
  const january = month === "01"
  return turnOfMonth || january ? 1.15 : 1.0
}

export interface SnapbackInput {
  zRet5: number // z-score ของ ret5 เทียบ rolling 250 วัน (H2)
  turnoverPct: number // pct-rank cross-section ของมูลค่าเฉลี่ย 20 วัน (0..1)
  mfd: number // money-flow delta (sign(ret)·val สะสม) — ติดลบ = เงินไหลออก
  liq: boolean // ผ่านเกณฑ์สภาพคล่อง (liq5 === 1)
}

export interface SnapbackSignal {
  action: "buy"
  conf: number // ความมั่นใจ 0.55 + 0.08·|z| (cap 0.9)
  hold: number // ถือ 5 วัน
  stop: number // stop −8%
  exitWhen: string // เงื่อนไขออกก่อนครบ hold
  source: "reversal"
}

/**
 * snapback — สัญญาณ snap-back reversal ของ H2:
 *   เข้าเงื่อนไขเมื่อ liq && turnoverPct>=0.60 && zRet5<=-2.5 && mfd<=-0.20
 *   (หุ้นสภาพคล่องดี ย่อลึกผิดปกติ คนเทขายหนัก → วัดกลับตัว)
 *   ไม่เข้าเงื่อนไข → null
 */
export function snapback(f: SnapbackInput): SnapbackSignal | null {
  // เขียนเงื่อนไขแบบ "ต้องผ่าน" — input NaN ต้องไม่หลุดเป็นสัญญาณซื้อ (NaN > x เป็น false)
  if (!f.liq) return null
  if (!(f.turnoverPct >= 0.6)) return null
  if (!(f.zRet5 <= -2.5)) return null
  if (!(f.mfd <= -0.2)) return null
  const conf = Math.min(0.9, 0.55 + 0.08 * Math.abs(f.zRet5))
  return {
    action: "buy",
    conf,
    hold: 5,
    stop: 0.08,
    exitWhen: "zRet5 >= -0.5",
    source: "reversal",
  }
}
