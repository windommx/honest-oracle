// ============================================================
// ปฏิทินซื้อขาย SET (Asia/Bangkok) — pure ทั้งไฟล์ ไม่ขึ้นกับ timezone ของเครื่อง
// ใช้ตอบว่า "ควร" มีข้อมูลปิดตลาดถึงวันไหนแล้ว และข้อมูลล่าสุดตามหลังกี่วันซื้อขาย (freshness)
//
// ความจริงใจเรื่องวันหยุด: รายการด้านล่างเป็นค่าตั้งต้นที่ดีที่สุดที่รู้ของปี 2025–2026 (ปฏิทินวันหยุดราชการไทย +
// ธรรมเนียมวันชดเชยของ SET) — ต้องตรวจกับประกาศวันหยุดของ SET ทุกปี · ปีที่ไม่มีรายการถือเฉพาะ จ.–ศ.
// วันหยุดที่ตกหล่น = รายงานว่าข้อมูลตามหลัง (ไม่ใช่เดาข้อมูลเติมให้)
// ============================================================

/** เวลาที่ถือว่าข้อมูล EOD พร้อมแล้ว (นาทีนับจากเที่ยงคืนกรุงเทพ) — SET ปิด ~16:35–16:40 + เผื่อ feed อัปเดต */
export const EOD_READY_MINUTES = 17 * 60 + 30
/** SET เปิดจับคู่ช่วงเช้า 10:00 น. — คำสั่งของรอบถัดไปต้องบันทึกก่อนเวลานี้ */
export const SET_OPEN_MINUTES = 10 * 60

export const SET_HOLIDAYS: Readonly<Record<string, string>> = {
  // ---- 2025 ----
  "2025-01-01": "วันขึ้นปีใหม่",
  "2025-02-12": "วันมาฆบูชา",
  "2025-04-07": "ชดเชยวันจักรี",
  "2025-04-14": "วันสงกรานต์",
  "2025-04-15": "วันสงกรานต์",
  "2025-04-16": "ชดเชยวันสงกรานต์",
  "2025-05-01": "วันแรงงานแห่งชาติ",
  "2025-05-05": "ชดเชยวันฉัตรมงคล",
  "2025-05-12": "ชดเชยวันวิสาขบูชา",
  "2025-06-03": "วันเฉลิมพระชนมพรรษาพระราชินี",
  "2025-07-10": "วันอาสาฬหบูชา",
  "2025-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2025-08-12": "วันแม่แห่งชาติ",
  "2025-10-13": "วันคล้ายวันสวรรคต ร.9",
  "2025-10-23": "วันปิยมหาราช",
  "2025-12-05": "วันพ่อแห่งชาติ",
  "2025-12-10": "วันรัฐธรรมนูญ",
  "2025-12-31": "วันสิ้นปี",
  // ---- 2026 ----
  "2026-01-01": "วันขึ้นปีใหม่",
  "2026-01-02": "วันหยุดพิเศษ (ต่อเนื่องปีใหม่)",
  "2026-03-03": "วันมาฆบูชา",
  "2026-04-06": "วันจักรี",
  "2026-04-13": "วันสงกรานต์",
  "2026-04-14": "วันสงกรานต์",
  "2026-04-15": "วันสงกรานต์",
  "2026-05-01": "วันแรงงานแห่งชาติ",
  "2026-05-04": "วันฉัตรมงคล",
  "2026-06-01": "ชดเชยวันวิสาขบูชา",
  "2026-06-03": "วันเฉลิมพระชนมพรรษาพระราชินี",
  "2026-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2026-07-29": "วันอาสาฬหบูชา",
  "2026-08-12": "วันแม่แห่งชาติ",
  "2026-10-13": "วันคล้ายวันสวรรคต ร.9",
  "2026-10-23": "วันปิยมหาราช",
  "2026-12-07": "ชดเชยวันพ่อแห่งชาติ",
  "2026-12-10": "วันรัฐธรรมนูญ",
  "2026-12-31": "วันสิ้นปี",
}

const HOLIDAY_YEARS = new Set(Object.keys(SET_HOLIDAYS).map((d) => Number(d.slice(0, 4))))
const DAY_MS = 86_400_000
const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isValidYmd(s: string): boolean {
  if (!YMD.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}

export function isWeekend(date: string): boolean {
  const d = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay()
  return d === 0 || d === 6
}

export function isTradingDay(date: string): boolean {
  return isValidYmd(date) && !isWeekend(date) && !(date in SET_HOLIDAYS)
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** วันซื้อขายล่าสุดที่ "ก่อน" date (ไม่รวม date) */
export function prevTradingDay(date: string): string {
  let d = shift(date, -1)
  for (let i = 0; i < 30 && !isTradingDay(d); i++) d = shift(d, -1)
  return d
}

/** วันซื้อขายถัดไปหลัง date (ไม่รวม date) */
export function nextTradingDay(date: string): string {
  let d = shift(date, 1)
  for (let i = 0; i < 30 && !isTradingDay(d); i++) d = shift(d, 1)
  return d
}

/** เวลาเปิดตลาด (UTC) ของวันซื้อขายถัดไปหลัง date — เส้นตายของการบันทึกคำสั่งที่เกิดจากราคาปิดของ date */
export function nextSessionOpen(date: string): Date {
  const d = nextTradingDay(date)
  return new Date(Date.parse(`${d}T00:00:00Z`) + (SET_OPEN_MINUTES - 7 * 60) * 60_000)
}

/** จำนวนวันซื้อขายในช่วง (a, b] — b ≤ a = 0 · ใช้วัดว่า "ตามหลังกี่วันซื้อขาย" */
export function tradingDaysBetween(a: string, b: string): number {
  if (!isValidYmd(a) || !isValidYmd(b) || b <= a) return 0
  let n = 0
  for (let d = shift(a, 1); d <= b; d = shift(d, 1)) if (isTradingDay(d)) n++
  return n
}

/** วันที่ + นาทีของวันตามเวลากรุงเทพ (UTC+7 คงที่ ไม่มี DST) */
export function bangkokClock(now: Date): { date: string; minutes: number; iso: string } {
  const t = new Date(now.getTime() + 7 * 3_600_000)
  return { date: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes(), iso: `${t.toISOString().slice(0, 19)}+07:00` }
}

/** รอบซื้อขายล่าสุดที่ข้อมูลปิดตลาด "ควร" พร้อมแล้ว ณ now: วันนี้ (ถ้าเป็นวันซื้อขายและเลย 17:30) ไม่งั้นวันซื้อขายก่อนหน้า */
export function expectedLatestSession(now: Date, readyMinutes = EOD_READY_MINUTES): string {
  const b = bangkokClock(now)
  if (isTradingDay(b.date) && b.minutes >= readyMinutes) return b.date
  return prevTradingDay(b.date)
}

/** ปฏิทินครอบคลุมปีของ date หรือไม่ (ปีที่ไม่มีรายการ = รู้แค่เสาร์–อาทิตย์) */
export function holidayCoverage(date: string): { covered: boolean; note: string | null } {
  const y = Number(date.slice(0, 4))
  if (HOLIDAY_YEARS.has(y)) return { covered: true, note: null }
  return { covered: false, note: `ไม่มีรายการวันหยุด SET ของปี ${y} — ถือเฉพาะ จ.–ศ. เป็นวันซื้อขาย (อาจนับวันหยุดเป็นวันที่ข้อมูลขาด)` }
}
