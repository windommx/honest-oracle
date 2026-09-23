// ============================================================
// Corporate-action detector — ราคาปิดเปลี่ยนเกินเพดาน/พื้น ±30% ของ SET ในวันเดียว (pure)
//
// ตามกติกา SET ราคาหุ้นสามัญเปลี่ยนจากราคาปิดวันก่อนได้ไม่เกิน ±30% ต่อวัน → การเปลี่ยนที่เกินนี้
// "เกิดจากการซื้อขายปกติไม่ได้" แทบทั้งหมดคือ:
//   - แตกพาร์/สปลิต/รวมหุ้น ที่ข้อมูลยังไม่ปรับย้อนหลัง (ราคา ÷2, ÷5, ÷10 …)
//   - XD/XR ก้อนใหญ่ที่แหล่งให้ราคาดิบ
//   - วันแรกหลังหยุดพักยาว/ฟื้นฟูกิจการ (บางกรณีไม่มี ceiling/floor) หรือข้อมูลผิด
// ตัวตรวจนี้ "ติดธง" เท่านั้น ไม่ปรับราคาเอง — ทางแก้ที่ถูกคือใช้ราคาปรับแล้วจากแหล่ง หรือดึงประวัติเต็มใหม่
// ============================================================

import { defaultHolidayCalendar, tradingDaysBetween, type HolidayCalendar } from "./calendar"
import type { CloseRow } from "./reconcile"

/** เพดาน/พื้นราคารายวันของ SET */
export const SET_DAILY_LIMIT = 0.3
/** เผื่อปัดเศษของราคาปรับแล้ว (factor 4 ตำแหน่ง) — ขยับจริงชนเพดานพอดี 30% ต้องไม่ถูกติดธง */
export const CA_TOLERANCE = 0.002
/** ตัวคูณสปลิต/รวมหุ้นที่พบบ่อย */
export const SPLIT_FACTORS = [2, 2.5, 3, 4, 5, 8, 10, 20, 25, 50, 100] as const
/** อัตราส่วนห่างจากตัวคูณมาตรฐานได้เท่าไร (วันสปลิตราคายังขยับตามตลาดได้) */
const SPLIT_MATCH = 0.1

export type CorporateActionKind = "split-like" | "reverse-split-like" | "drop" | "jump"

export interface CorporateActionFlag {
  symbol: string
  date: string
  prevDate: string
  prevClose: number
  close: number
  changePct: number
  kind: CorporateActionKind
  /** ตัวคูณที่ใกล้ที่สุด เช่น 5 = ราคา ÷5 (split-like) หรือ ×5 (reverse-split-like) */
  splitFactor: number | null
  /** จำนวนวันซื้อขายที่ไม่มีแท่งระหว่าง prevDate → date (หยุดพักการซื้อขาย) */
  gapSessions: number
  note: string
}

function nearestFactor(f: number): number | null {
  let best: number | null = null
  let err = Infinity
  for (const k of SPLIT_FACTORS) {
    const e = Math.abs(f / k - 1)
    if (e < err) {
      err = e
      best = k
    }
  }
  return err <= SPLIT_MATCH ? best : null
}

export function classifyMove(prevClose: number, close: number): { kind: CorporateActionKind; splitFactor: number | null } {
  const r = close / prevClose
  if (r < 1) {
    const f = nearestFactor(1 / r)
    return f ? { kind: "split-like", splitFactor: f } : { kind: "drop", splitFactor: null }
  }
  const f = nearestFactor(r)
  return f ? { kind: "reverse-split-like", splitFactor: f } : { kind: "jump", splitFactor: null }
}

function noteFor(kind: CorporateActionKind, factor: number | null, gap: number): string {
  const base =
    kind === "split-like"
      ? `น่าจะแตกพาร์/สปลิต (ราคา ÷${factor}) ที่ยังไม่ปรับย้อนหลัง — ใช้ราคาปรับแล้ว (adjusted) หรือดึงประวัติเต็มใหม่`
      : kind === "reverse-split-like"
        ? `น่าจะรวมหุ้น/ลดทุน (ราคา ×${factor}) ที่ยังไม่ปรับย้อนหลัง — ดึงประวัติเต็มใหม่จากแหล่งที่ปรับแล้ว`
        : kind === "drop"
          ? "ราคาลดเกิน floor −30% — XD/XR ก้อนใหญ่ที่ยังไม่ปรับ หรือข้อมูลผิด ตรวจกับประกาศ SET"
          : "ราคาเพิ่มเกิน ceiling +30% — ข้อมูลผิด หรือวันแรกหลังหยุดพัก/ฟื้นฟูกิจการ ตรวจกับประกาศ SET"
  return gap >= 5 ? `${base} · หลังไม่มีแท่ง ${gap} วันซื้อขาย (หยุดพักการซื้อขาย?)` : base
}

/**
 * ตรวจทุกคู่ราคาปิดติดกัน (ข้ามวันที่ไม่มีแท่ง — เทียบราคาปิดล่าสุดที่มี ตามกติกา ceiling/floor ของ SET)
 * since: รายงานเฉพาะธงที่ date ≥ since (ยังใช้แท่งก่อนหน้าเป็นฐานเทียบได้)
 */
export function detectCorporateActions(
  rows: CloseRow[],
  opts: { limit?: number; tolerance?: number; since?: string; calendar?: HolidayCalendar } = {},
): CorporateActionFlag[] {
  const limit = (opts.limit ?? SET_DAILY_LIMIT) + (opts.tolerance ?? CA_TOLERANCE)
  const cal = opts.calendar ?? defaultHolidayCalendar()
  const bySym = new Map<string, CloseRow[]>()
  for (const r of rows) {
    if (!(Number.isFinite(r.close) && r.close > 0)) continue
    let a = bySym.get(r.symbol)
    if (!a) bySym.set(r.symbol, (a = []))
    a.push(r)
  }
  const flags: CorporateActionFlag[] = []
  for (const [symbol, list] of bySym) {
    list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]
      const cur = list[i]
      if (cur.date === prev.date) continue
      const ch = cur.close / prev.close - 1
      if (Math.abs(ch) <= limit) continue
      if (opts.since && cur.date < opts.since) continue
      const { kind, splitFactor } = classifyMove(prev.close, cur.close)
      const gap = Math.max(0, tradingDaysBetween(prev.date, cur.date, cal) - 1)
      flags.push({
        symbol,
        date: cur.date,
        prevDate: prev.date,
        prevClose: prev.close,
        close: cur.close,
        changePct: Math.round(ch * 10000) / 100,
        kind,
        splitFactor,
        gapSessions: gap,
        note: noteFor(kind, splitFactor, gap),
      })
    }
  }
  return flags.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.symbol.localeCompare(y.symbol)))
}
