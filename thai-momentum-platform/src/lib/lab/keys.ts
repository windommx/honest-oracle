import { createHash } from 'crypto'

// คีย์เดี่ยวต่อ (วัน, สินทรัพย์) — md5(date|asset) 12 ตัวแรก
// double-key log: กฎเดียวกันทั้งแล็บ (rule × Nimble แชร์คีย์เดียวกัน)
export function makeKey(date: string, asset: string): string {
  return createHash('md5').update(`${date}|${asset}`).digest('hex').slice(0, 12)
}
