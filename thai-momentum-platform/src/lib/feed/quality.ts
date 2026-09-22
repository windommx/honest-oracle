// ============================================================
// Feed quality — ประเมินข้อมูลรายหุ้น "ก่อน" เข้าฐาน (ธรรมเนียมเดียวกับ quality gate ของ GTAA)
// ไม่บล็อกทั้งชุดเพราะหุ้นตัวเดียว: ตัวที่ไม่มีข้อมูลถูกคัดออกพร้อมเหตุผล ตัวที่น่าสงสัยติดคำเตือน
// แล้ว DQ checks ของระบบ (/api/dq) ตรวจซ้ำอีกชั้นหลัง ingest
// ============================================================

import type { ParsedCsvRow } from "@/lib/momentum/core"
import type { FeedSymbolReport } from "@/lib/momentum/contracts"

export const MIN_BARS_WARN = 60 // สั้นกว่านี้คำนวณ ret40/ret80 ไม่ได้ครบ
export const JUMP_WARN = 0.35 // เกินเพดาน ±30% ของ SET → corporate action ที่ไม่ถูกปรับ หรือข้อมูลเพี้ยน

export function assessSymbol(symbol: string, rows: ParsedCsvRow[]): FeedSymbolReport {
  const own = rows.filter((r) => r.symbol === symbol).sort((a, b) => (a.date < b.date ? -1 : 1))
  const warnings: string[] = []
  if (own.length === 0) {
    return { symbol, ok: false, bars: 0, firstDate: null, lastDate: null, warnings, error: "ไม่มีแถวข้อมูล" }
  }
  if (own.length < MIN_BARS_WARN) warnings.push(`ประวัติสั้น ${own.length} แท่ง (< ${MIN_BARS_WARN})`)

  let jumps = 0
  let zeroVal = 0
  let dup = 0
  const seen = new Set<string>()
  for (let i = 0; i < own.length; i++) {
    const r = own[i]
    if (seen.has(r.date)) dup++
    seen.add(r.date)
    if (!(r.val > 0)) zeroVal++
    if (i > 0) {
      const prev = own[i - 1].close
      if (prev > 0 && Math.abs(r.close / prev - 1) > JUMP_WARN) jumps++
    }
  }
  if (jumps > 0) warnings.push(`ราคากระโดด > ${Math.round(JUMP_WARN * 100)}% ${jumps} จุด — ตรวจ corporate action`)
  if (zeroVal / own.length > 0.5) warnings.push(`มูลค่าซื้อขายเป็น 0 ใน ${Math.round((zeroVal / own.length) * 100)}% ของวัน`)
  if (dup > 0) warnings.push(`วันที่ซ้ำ ${dup} แถว`)

  return {
    symbol,
    ok: true,
    bars: own.length,
    firstDate: own[0].date,
    lastDate: own[own.length - 1].date,
    warnings,
  }
}

/** เตือนหุ้นที่วันล่าสุดตามหลังชุด (อาจถูกพักซื้อขาย/ข้อมูลไม่ครบ) */
export function flagStale(reports: FeedSymbolReport[]): FeedSymbolReport[] {
  const latest = reports.reduce<string | null>((m, r) => (r.lastDate && (!m || r.lastDate > m) ? r.lastDate : m), null)
  if (!latest) return reports
  return reports.map((r) =>
    r.ok && r.lastDate && r.lastDate < latest
      ? { ...r, warnings: [...r.warnings, `วันล่าสุด ${r.lastDate} ตามหลังชุด (${latest})`] }
      : r,
  )
}
