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
    if (!r || typeof r !== "object") {
      dropped++
      continue
    }
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
    // val ที่ "ไม่มี" (null/undefined/"") ต้องไปใช้ volume — Number(null) = 0 เคยทำให้ val เป็น 0 เงียบ ๆ
    // (สคริปต์ Python ส่ง None → null เมื่อแหล่งไม่ให้มูลค่า) → liq5 ตกทั้งตัว หลุดทุกโผ
    const rawVal: unknown = r.val
    let val = rawVal === null || rawVal === undefined || rawVal === "" ? NaN : Number(rawVal)
    if (!Number.isFinite(val) || val < 0) {
      const vol = Number(r.volume)
      val = Number.isFinite(vol) && vol > 0 ? close * vol : 0
    }
    rows.push({ date, symbol, close, open: pos(r.open), high: pos(r.high), low: pos(r.low), val: Math.round(val) })
  }
  return { rows, dropped }
}

