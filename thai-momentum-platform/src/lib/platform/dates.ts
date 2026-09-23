/**
 * วันที่ปฏิทินแบบ "YYYY-MM-DD" สำหรับ Command Center / ops pulse — pure ไม่ขึ้นกับ timezone ของเครื่อง
 *
 * กติกา: วันที่ของผู้ใช้ = ปฏิทินกรุงเทพ (ICT) เสมอ · นับจำนวนวันด้วยเที่ยงคืน UTC ของสตริงวันที่ทั้งสองฝั่ง
 * (ห้าม new Date("YYYY-MM-DD") แล้วใช้ getDate/setDate ซึ่งเป็นเวลาท้องถิ่น → เพี้ยนวันตาม TZ)
 */

/** วันที่ปฏิทินกรุงเทพของขณะเวลา d เช่น 2026-09-22T20:30Z → "2026-09-23" */
export function ictDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** จำนวนวันจาก a ถึง b (สตริง YYYY-MM-DD) — ติดลบถ้า b ก่อน a · สตริงเสีย = null */
export function daysBetween(a: string, b: string): number | null {
  const t1 = new Date(`${a}T00:00:00Z`).getTime()
  const t2 = new Date(`${b}T00:00:00Z`).getTime()
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null
  return Math.round((t2 - t1) / 86_400_000)
}

/** วันสุดท้ายของเดือน "YYYY-MM" → "YYYY-MM-DD" · รูปแบบเสีย = null */
export function lastDayOfMonth(ym: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)
}
