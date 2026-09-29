// ============================================================
// รูปแบบวันที่ไทยแบบตายตัว (ไม่พึ่ง locale/timezone ของเครื่อง) — ใช้ร่วมกันทั้ง server (สรุปจากตัวเลข) และ UI
// ============================================================

export const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** '2026-09-25' → '25 ก.ย. 69' (ปี พ.ศ. 2 หลัก) */
export function thDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`;
}

/** ช่วงวันที่: เดือนเดียวกัน → '21–25 ก.ย. 69' · ข้ามเดือน → '29 ก.ย. – 3 ต.ค. 69' */
export function thSpan(a: string, b: string): string {
  const [, ma, da] = a.split('-').map(Number);
  const [, mb] = b.split('-').map(Number);
  return ma === mb ? `${da}–${thDate(b)}` : `${da} ${TH_MONTH[ma - 1]} – ${thDate(b)}`;
}

/** ป้ายแกนเวลา: '2026-09-25' → 'ก.ย. 69' */
export function thMonthTick(d: string): string {
  const [y, m] = d.split('-').map(Number);
  return `${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`;
}
