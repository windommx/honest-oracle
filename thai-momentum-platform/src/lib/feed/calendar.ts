// ============================================================
// ปฏิทินซื้อขาย SET (Asia/Bangkok) — pure ทั้งไฟล์ ไม่ขึ้นกับ timezone ของเครื่อง
//
// ใช้ตอบคำถามของสายพานรายวันและ freshness monitor:
//   - วันนี้เป็นวันซื้อขายไหม (ข้ามเสาร์–อาทิตย์ + วันหยุดตลาด)
//   - "ควร" มีข้อมูลปิดตลาดถึงวันไหนแล้ว ณ ขณะนี้ (expected session)
//   - ข้อมูลล่าสุดตามหลังกี่วันซื้อขาย
//
// ความจริงใจเรื่องวันหยุด: รายการด้านล่างเป็น "ค่าตั้งต้นที่ดีที่สุดที่รู้" ของปี 2025–2026 จากปฏิทิน
// วันหยุดราชการไทย + ธรรมเนียมวันชดเชยของ SET — ยืนยันจากที่นี่ไม่ได้ (sandbox บล็อก set.or.th)
// ต้องตรวจกับประกาศวันหยุดของ SET ทุกปี แล้ววางไฟล์ JSON ทับได้ (--holidays / SET_HOLIDAYS_FILE)
// วันหยุดที่ตกหล่น = สายพานรายงาน STALE (ไม่มีแท่งใหม่) ไม่ใช่เดาข้อมูลเติมให้
// ============================================================

/** เวลาปิดตลาดที่ถือว่าข้อมูล EOD พร้อมแล้ว (นาทีนับจากเที่ยงคืนกรุงเทพ) — SET ปิด ~16:35–16:40 + เผื่อ feed อัปเดต */
export const EOD_READY_MINUTES = 17 * 60 + 30

/** หุ้นที่มีแท่งภายในกี่วันซื้อขายล่าสุดของฐานข้อมูลนับเป็น "ยังซื้อขายอยู่" (universe ที่ควรอัปเดตทุกวัน) */
export const ACTIVE_WINDOW_SESSIONS = 20

/**
 * วันหยุดตลาด SET ตั้งต้น (YYYY-MM-DD → ชื่อ) — best-effort ต้องตรวจกับประกาศของ SET
 * วันพระ (มาฆะ/วิสาขะ/อาสาฬหะ) อิงปฏิทินจันทรคติ — ปีที่มีอธิกมาสเลื่อนเดือน
 */
export const SET_HOLIDAYS_DEFAULT: Readonly<Record<string, string>> = {
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

export interface HolidayCalendar {
  dates: Set<string>
  names: Map<string, string>
  /** ปีที่มีรายการวันหยุด (ปีอื่นใช้เฉพาะ จ.–ศ.) */
  years: number[]
  source: "builtin" | "file"
}

const DAY_MS = 86_400_000
const YMD = /^\d{4}-\d{2}-\d{2}$/

function validYmd(s: string): boolean {
  if (!YMD.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}

function yearsOf(dates: Iterable<string>): number[] {
  return [...new Set([...dates].map((d) => Number(d.slice(0, 4))))].sort((a, b) => a - b)
}

export function defaultHolidayCalendar(): HolidayCalendar {
  const names = new Map(Object.entries(SET_HOLIDAYS_DEFAULT))
  return { dates: new Set(names.keys()), names, years: yearsOf(names.keys()), source: "builtin" }
}

/**
 * อ่านไฟล์วันหยุดของผู้ใช้ — รับได้ 3 รูปแบบ: ["2026-01-01", …] · [{date, name}] · {holidays: …}
 * replace=true (ค่าเริ่มต้น): ปีที่ไฟล์ระบุ "แทนที่" รายการตั้งต้นของปีนั้นทั้งปี · ปีอื่นยังใช้ค่าตั้งต้น
 * วันที่ที่รูปแบบผิดถูกคืนใน invalid (ไม่ทิ้งเงียบ ๆ)
 */
export function parseHolidayList(
  input: unknown,
  base: HolidayCalendar = defaultHolidayCalendar(),
): { calendar: HolidayCalendar; invalid: string[] } {
  const list: unknown = input && typeof input === "object" && !Array.isArray(input) ? (input as { holidays?: unknown }).holidays : input
  const invalid: string[] = []
  const add = new Map<string, string>()
  if (Array.isArray(list)) {
    for (const it of list) {
      const date = typeof it === "string" ? it.trim() : it && typeof it === "object" ? String((it as { date?: unknown }).date ?? "").trim() : ""
      const name = it && typeof it === "object" && typeof (it as { name?: unknown }).name === "string" ? (it as { name: string }).name : "วันหยุด (ไฟล์ผู้ใช้)"
      if (validYmd(date)) add.set(date, name)
      else invalid.push(String(typeof it === "string" ? it : JSON.stringify(it)))
    }
  }
  const fileYears = new Set(yearsOf(add.keys()))
  const names = new Map<string, string>()
  for (const [d, n] of base.names) if (!fileYears.has(Number(d.slice(0, 4)))) names.set(d, n)
  for (const [d, n] of add) names.set(d, n)
  return {
    calendar: { dates: new Set(names.keys()), names, years: yearsOf(names.keys()), source: add.size > 0 ? "file" : base.source },
    invalid,
  }
}

/** วันในสัปดาห์ของสตริงวันที่ (0 = อาทิตย์) — คิดแบบ UTC ล้วน */
export function dayOfWeek(date: string): number {
  return new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay()
}

export function isWeekend(date: string): boolean {
  const d = dayOfWeek(date)
  return d === 0 || d === 6
}

export function isTradingDay(date: string, cal: HolidayCalendar = defaultHolidayCalendar()): boolean {
  return validYmd(date) && !isWeekend(date) && !cal.dates.has(date)
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** วันซื้อขายล่าสุดที่ "ก่อน" date (ไม่รวม date) */
export function prevTradingDay(date: string, cal: HolidayCalendar = defaultHolidayCalendar()): string {
  let d = shift(date, -1)
  for (let i = 0; i < 30 && !isTradingDay(d, cal); i++) d = shift(d, -1)
  return d
}

/** วันซื้อขายถัดไปที่ "หลัง" date (ไม่รวม date) */
export function nextTradingDay(date: string, cal: HolidayCalendar = defaultHolidayCalendar()): string {
  let d = shift(date, 1)
  for (let i = 0; i < 30 && !isTradingDay(d, cal); i++) d = shift(d, 1)
  return d
}

/** จำนวนวันซื้อขายในช่วง (a, b] — b ≤ a = 0 · ใช้วัดว่า "ตามหลังกี่วันซื้อขาย" */
export function tradingDaysBetween(a: string, b: string, cal: HolidayCalendar = defaultHolidayCalendar()): number {
  if (!validYmd(a) || !validYmd(b) || b <= a) return 0
  let n = 0
  for (let d = shift(a, 1); d <= b; d = shift(d, 1)) if (isTradingDay(d, cal)) n++
  return n
}

/** วันที่ + นาทีของวันตามเวลากรุงเทพ (UTC+7 คงที่ ไม่มี DST) */
export function bangkokClock(now: Date): { date: string; minutes: number; iso: string } {
  const t = new Date(now.getTime() + 7 * 3_600_000)
  return {
    date: t.toISOString().slice(0, 10),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
    iso: `${t.toISOString().slice(0, 19)}+07:00`,
  }
}

/**
 * รอบซื้อขายล่าสุดที่ข้อมูลปิดตลาด "ควร" พร้อมแล้ว ณ ขณะ now:
 * วันนี้เป็นวันซื้อขายและเลยเวลา EOD_READY แล้ว → วันนี้ · ไม่งั้น → วันซื้อขายก่อนหน้า
 */
export function expectedLatestSession(
  now: Date,
  cal: HolidayCalendar = defaultHolidayCalendar(),
  readyMinutes = EOD_READY_MINUTES,
): string {
  const b = bangkokClock(now)
  if (isTradingDay(b.date, cal) && b.minutes >= readyMinutes) return b.date
  return prevTradingDay(b.date, cal)
}

/** ปฏิทินครอบคลุมปีของ date หรือไม่ (ปีที่ไม่มีรายการ = รู้แค่เสาร์–อาทิตย์) */
export function holidayCoverage(date: string, cal: HolidayCalendar = defaultHolidayCalendar()): { covered: boolean; note: string | null } {
  const y = Number(date.slice(0, 4))
  if (cal.years.includes(y)) return { covered: true, note: null }
  return {
    covered: false,
    note: `ไม่มีรายการวันหยุด SET ของปี ${y} — ถือเฉพาะ จ.–ศ. เป็นวันซื้อขาย (วางไฟล์วันหยุดผ่าน --holidays หรือ SET_HOLIDAYS_FILE)`,
  }
}
