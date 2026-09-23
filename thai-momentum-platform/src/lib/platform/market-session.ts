/**
 * ช่วงเวลาซื้อขาย SET (หุ้นสามัญ) ตามเวลา Asia/Bangkok — pure ใช้ได้ทั้ง client/server
 *
 * ตารางเวลาทางการของ SET (มีผลตั้งแต่ 25 มี.ค. 2567 — เลื่อนรอบบ่ายเร็วขึ้น 30 นาที):
 *   09:30–10:00  Pre-open I   (จับคู่แบบ auction · เปิดสุ่ม 09:55–10:00)
 *   10:00–12:30  ช่วงเช้า      (จับคู่ต่อเนื่อง)
 *   12:30–13:30  พักกลางวัน
 *   13:30–14:00  Pre-open II  (เปิดสุ่ม 13:55–14:00)
 *   14:00–16:30  ช่วงบ่าย
 *   16:30–16:40  Pre-close    (ATC · ปิดสุ่ม 16:35–16:40)
 *   นอกนั้น / เสาร์–อาทิตย์ = ปิด (วันหยุดนักขัตฤกษ์ของตลาดไม่ได้อยู่ในตารางนี้)
 */

export type SetPhase = "pre" | "open" | "break" | "preclose" | "closed"

const hm = (h: number, m: number) => h * 60 + m

/** ช่วง [start, end) เป็นนาทีของวัน — เรียงตามเวลา */
export const SET_SESSIONS: { phase: Exclude<SetPhase, "closed">; start: number; end: number }[] = [
  { phase: "pre", start: hm(9, 30), end: hm(10, 0) },
  { phase: "open", start: hm(10, 0), end: hm(12, 30) },
  { phase: "break", start: hm(12, 30), end: hm(13, 30) },
  { phase: "pre", start: hm(13, 30), end: hm(14, 0) },
  { phase: "open", start: hm(14, 0), end: hm(16, 30) },
  { phase: "preclose", start: hm(16, 30), end: hm(16, 40) },
]

/** สถานะตลาดจากวันในสัปดาห์ ("Mon".."Sun") + นาทีของวัน (0..1439) ตามเวลากรุงเทพ */
export function setPhaseAt(weekday: string, minuteOfDay: number): SetPhase {
  if (weekday === "Sat" || weekday === "Sun") return "closed"
  for (const s of SET_SESSIONS) {
    if (minuteOfDay >= s.start && minuteOfDay < s.end) return s.phase
  }
  return "closed"
}

export interface BangkokClock {
  /** HH:MM:SS แบบ 24 ชม. */
  clock: string
  weekday: string
  minuteOfDay: number
  phase: SetPhase
}

/** อ่านเวลากรุงเทพจาก Date (ไม่ขึ้นกับ timezone ของเครื่อง) + สถานะ SET */
export function readBangkokClock(now: Date = new Date()): BangkokClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hourCycle: "h23",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  // บาง engine ยังคืน "24" ตอนเที่ยงคืน — ปรับเป็น "00" ทั้งตัวเลขและข้อความที่แสดง
  const hh = get("hour") === "24" ? "00" : get("hour")
  const minuteOfDay = Number(hh) * 60 + Number(get("minute"))
  const weekday = get("weekday")
  return {
    clock: `${hh}:${get("minute")}:${get("second")}`,
    weekday,
    minuteOfDay,
    phase: setPhaseAt(weekday, minuteOfDay),
  }
}
