// ============================================================
// Feed rows — ตัวช่วย pure สำหรับแถวข้อมูลจากสคริปต์ภายนอก (ทดสอบได้โดยไม่แตะ DB)
// ============================================================

import { normalizeDate, type ParsedCsvRow } from "@/lib/momentum/core"
import type { FeedIngestRow } from "@/lib/momentum/contracts"

/** แปลงแถว JSON จากสคริปต์ภายนอก → ParsedCsvRow (validate ทีละแถว ทิ้งแถวเสียพร้อมนับ) */
export function normalizeFeedRows(input: FeedIngestRow[]): { rows: ParsedCsvRow[]; dropped: number } {
  const rows: ParsedCsvRow[] = []
  let dropped = 0
  for (const r of input) {
    const date = typeof r.date === "string" ? normalizeDate(r.date) : null
    const symbol = typeof r.symbol === "string" ? r.symbol.trim().toUpperCase().replace(/\.BK$/, "") : ""
    const close = Number(r.close)
    if (!date || !symbol || !Number.isFinite(close) || close <= 0) {
      dropped++
      continue
    }
    const pos = (v: unknown): number | null => {
      const n = Number(v)
      return v !== null && v !== undefined && Number.isFinite(n) && n > 0 ? n : null
    }
    let val = Number(r.val)
    if (!Number.isFinite(val) || val < 0) {
      const vol = Number(r.volume)
      val = Number.isFinite(vol) && vol > 0 ? close * vol : 0
    }
    rows.push({ date, symbol, close, open: pos(r.open), high: pos(r.high), low: pos(r.low), val: Math.round(val) })
  }
  return { rows, dropped }
}

