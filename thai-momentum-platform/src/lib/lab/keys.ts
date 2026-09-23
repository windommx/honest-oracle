import { createHash } from 'crypto'

// คีย์เดี่ยวต่อ (วัน, สินทรัพย์) — md5(date|asset) 12 ตัวแรก
// double-key log: กฎเดียวกันทั้งแล็บ (rule × Nimble แชร์คีย์เดียวกัน)
export function makeKey(date: string, asset: string): string {
  return createHash('md5').update(`${date}|${asset}`).digest('hex').slice(0, 12)
}

// คีย์ของ state สังเคราะห์ = md5 ของเนื้อ packet ทั้งก้อน (12 ตัวแรก)
// synth ใช้ชื่อหุ้นจริง (PTT/AOT/…) + วันที่สุ่ม → ถ้าใช้ makeKey(date|asset) จะชนและ "เขียนทับ"
// แถว panel จริง/แถวที่มนุษย์ label ไว้แล้วด้วย state คนละตัว — state เดียวกันเท่านั้นที่ได้คีย์เดียวกัน
export function makeSynthKey(packet: unknown): string {
  return createHash('md5').update(`synth|${JSON.stringify(packet)}`).digest('hex').slice(0, 12)
}
