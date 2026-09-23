// ============================================================
// โหลดไฟล์วันหยุด SET ของผู้ใช้ (JSON) ทับปฏิทินตั้งต้น — แยกจาก calendar.ts เพื่อให้ calendar.ts เป็น pure
// ลำดับ: path ที่ส่งมา (--holidays) → env SET_HOLIDAYS_FILE → ปฏิทินตั้งต้นในโค้ด
// ============================================================

import { promises as fs } from "node:fs"
import { defaultHolidayCalendar, parseHolidayList, type HolidayCalendar } from "./calendar"

export async function loadHolidayCalendar(
  file: string | null | undefined = process.env.SET_HOLIDAYS_FILE,
): Promise<{ calendar: HolidayCalendar; file: string | null; invalid: string[]; error: string | null }> {
  const f = file?.trim() || null
  if (!f) return { calendar: defaultHolidayCalendar(), file: null, invalid: [], error: null }
  try {
    // turbopackIgnore: path มาจาก env/argument ตอนรัน — ไม่ให้ Turbopack ลากทั้งโปรเจกต์เข้า standalone build
    const { calendar, invalid } = parseHolidayList(JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ f, "utf8")))
    return { calendar, file: f, invalid, error: null }
  } catch (e) {
    return { calendar: defaultHolidayCalendar(), file: f, invalid: [], error: `อ่านไฟล์วันหยุด ${f} ไม่ได้ (${(e as Error).message}) — ใช้ปฏิทินตั้งต้น` }
  }
}
