// ============================================================
// ความสดของข้อมูล (pure) — วันล่าสุดในฐานข้อมูลเทียบรอบซื้อขายที่ "ควร" มีข้อมูลแล้วตามปฏิทิน SET
// ข้อมูลจำลอง: วันที่เป็นแค่ป้ายกำกับ (generator วางชุดข้อมูลไว้ถึงวันที่ seed) — ไม่ประเมินความสด ไม่เตือนว่าค้าง
// ============================================================

import { bangkokClock, expectedLatestSession, holidayCoverage, tradingDaysBetween } from "./calendar"

export type FreshnessStatus = "fresh" | "lagging" | "stale" | "empty" | "synthetic"

export interface FreshnessReport {
  now: string
  expectedSession: string
  dbLatest: string | null
  /** ตามหลังรอบที่ควรมีกี่วันซื้อขาย (null = ไม่มีข้อมูล หรือเป็นข้อมูลจำลอง) */
  lagSessions: number | null
  status: FreshnessStatus
  /** หุ้นที่ราคาจริงล่าสุดเก่ากว่าวันล่าสุดของ panel (พักการซื้อขาย/ข้อมูลหาย — panel เติมด้วยราคาล่าสุด) */
  staleSymbols: Array<{ symbol: string; lastDate: string; lagSessions: number }>
  notes: string[]
}

/** ตามหลัง ≥ 2 วันซื้อขาย = ค้าง (1 วัน = feed ยังไม่อัปเดต หรือวันหยุดที่ไม่อยู่ในปฏิทิน) */
export const STALE_AFTER_SESSIONS = 2

export function computeFreshness(input: {
  now: Date
  kind: "synthetic" | "real" | null
  dbLatest: string | null
  lastDateBySymbol?: Map<string, string>
}): FreshnessReport {
  const expected = expectedLatestSession(input.now)
  const base = { now: bangkokClock(input.now).iso, expectedSession: expected, dbLatest: input.dbLatest }
  if (!input.dbLatest) {
    return { ...base, lagSessions: null, status: "empty", staleSymbols: [], notes: ["ยังไม่มีข้อมูลตลาดในฐานข้อมูล"] }
  }
  const staleSymbols: FreshnessReport["staleSymbols"] = []
  for (const [symbol, lastDate] of input.lastDateBySymbol ?? []) {
    const lag = tradingDaysBetween(lastDate, input.dbLatest)
    if (lag > 0) staleSymbols.push({ symbol, lastDate, lagSessions: lag })
  }
  staleSymbols.sort((a, b) => b.lagSessions - a.lagSessions || a.symbol.localeCompare(b.symbol))

  if (input.kind === "synthetic") {
    return {
      ...base,
      lagSessions: null,
      status: "synthetic",
      staleSymbols,
      notes: [`ข้อมูลจำลอง — วันที่ ${input.dbLatest} เป็นแค่ป้ายกำกับของชุดสาธิต ไม่ใช่ราคาตลาดของวันนั้น`],
    }
  }
  const lag = input.dbLatest >= expected ? 0 : tradingDaysBetween(input.dbLatest, expected)
  const status: FreshnessStatus = lag === 0 ? "fresh" : lag < STALE_AFTER_SESSIONS ? "lagging" : "stale"
  const notes: string[] = []
  const cov = holidayCoverage(expected)
  if (!cov.covered && cov.note) notes.push(cov.note)
  if (status === "lagging") notes.push(`ข้อมูลล่าสุด ${input.dbLatest} ตามหลังรอบ ${expected} อยู่ 1 วันซื้อขาย — feed ยังไม่อัปเดต หรือเป็นวันหยุดที่ไม่อยู่ในปฏิทิน`)
  if (status === "stale") notes.push(`ข้อมูลค้าง — ล่าสุด ${input.dbLatest} ตามหลังรอบ ${expected} อยู่ ${lag} วันซื้อขาย · สัญญาณทั้งหมดอิงราคาเก่า นำเข้าข้อมูลใหม่ก่อนใช้`)
  if (staleSymbols.length) notes.push(`${staleSymbols.length} ตัวไม่มีราคาจริงถึงวันล่าสุด (พักการซื้อขาย/ข้อมูลหาย) — ระบบเติมด้วยราคาปิดล่าสุด`)
  return { ...base, lagSessions: lag, status, staleSymbols: staleSymbols.slice(0, 50), notes }
}
