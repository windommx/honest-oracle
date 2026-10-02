// ============================================================
// เหตุการณ์ความปลอดภัย (คำขอที่ถูกปฏิเสธ) → JSON line ระดับ warn
// จำกัด 1 บรรทัด/นาที ต่อ (code, client) — ตอนโดนเดารหัสรัว ๆ log ไม่ท่วมดิสก์ แต่ยังบอกได้ว่าถูกกดทิ้งไปกี่ครั้ง
// บันทึกเฉพาะ pathname (ไม่เอา query string — อาจมีค่าลับ) และไม่บันทึก header ใด ๆ
// ============================================================

import { log } from "@/lib/log"

export interface DenyEvent {
  code: string
  status: number
  method: string
  path: string
  client: string
}

const WINDOW_MS = 60_000
const MAX_KEYS = 5000

export class SecurityEventLog {
  private seen = new Map<string, { at: number; suppressed: number }>()

  constructor(private sink: (msg: string, fields: Record<string, unknown>) => void = log.warn) {}

  /** true = เขียน log บรรทัดนี้ · false = อยู่ในหน้าต่างเดียวกัน นับเป็น suppressed */
  deny(ev: DenyEvent, now: number = Date.now()): boolean {
    const key = `${ev.code}|${ev.client}`
    const hit = this.seen.get(key)
    if (hit && now - hit.at < WINDOW_MS) {
      hit.suppressed++
      return false
    }
    this.sink("security.deny", { ...ev, suppressedSinceLast: hit?.suppressed ?? 0 })
    this.seen.delete(key)
    this.seen.set(key, { at: now, suppressed: 0 })
    if (this.seen.size > MAX_KEYS) {
      const oldest = this.seen.keys().next().value
      if (oldest !== undefined) this.seen.delete(oldest)
    }
    return true
  }

  size(): number {
    return this.seen.size
  }
}

const holder = globalThis as unknown as { __oqeSecurityEvents?: SecurityEventLog }
export function sharedSecurityEvents(): SecurityEventLog {
  return (holder.__oqeSecurityEvents ??= new SecurityEventLog())
}
