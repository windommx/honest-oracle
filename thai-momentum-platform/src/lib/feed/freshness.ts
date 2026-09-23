// ============================================================
// Freshness monitor — ข้อมูลล่าสุด "สด" แค่ไหนเทียบปฏิทินซื้อขาย SET (pure)
//   - วันล่าสุดของฐานข้อมูล vs รอบซื้อขายที่ควรมีข้อมูลแล้ว (expected session)
//   - ความค้างรายหุ้น (ตามหลังกี่วันซื้อขาย) — แยก พักการซื้อขาย/เลิกเทรด ออกจากข้อมูลหาย
//   - % ของ universe ที่อัปเดตถึงรอบล่าสุด
// ============================================================

import {
  ACTIVE_WINDOW_SESSIONS,
  defaultHolidayCalendar,
  expectedLatestSession,
  holidayCoverage,
  tradingDaysBetween,
  bangkokClock,
  type HolidayCalendar,
} from "./calendar"

export type SymbolFreshness = "fresh" | "lagging" | "stale" | "missing"

export interface SymbolFreshnessRow {
  symbol: string
  lastDate: string | null
  lagSessions: number | null
  status: SymbolFreshness
}

export interface FreshnessReport {
  now: string // ISO +07:00
  expectedSession: string
  dbLatest: string | null
  /** ฐานข้อมูลตามหลังรอบที่ควรมีกี่วันซื้อขาย (null = DB ว่าง) */
  lagSessions: number | null
  status: "fresh" | "lagging" | "stale" | "empty"
  universeSize: number
  universeSource: "given" | "active"
  updated: number
  /** % ของ universe ที่มีแท่งของ expected session (null = universe ว่าง) */
  pctUpdated: number | null
  counts: Record<SymbolFreshness, number>
  /** หุ้นที่ไม่สด (ตามหลัง ≥ 1 วัน) เรียงจากค้างมากไปน้อย */
  laggards: SymbolFreshnessRow[]
  holidayCovered: boolean
  notes: string[]
}

/** ตามหลังกี่วันซื้อขายถึงนับว่าค้างจริง (พักการซื้อขาย/เลิกเทรด) ไม่ใช่แค่ feed ช้า */
export const STALE_AFTER_SESSIONS = 5

export function classifyLag(lag: number | null): SymbolFreshness {
  if (lag === null) return "missing"
  if (lag <= 0) return "fresh"
  if (lag < STALE_AFTER_SESSIONS) return "lagging"
  return "stale"
}

/**
 * universe ที่ "ควร" อัปเดตทุกวัน = หุ้นที่มีแท่งภายใน ACTIVE_WINDOW_SESSIONS วันซื้อขายล่าสุดของฐานข้อมูล
 * (หุ้นเลิกเทรด/พักยาวหลุดออกเอง ไม่ทำให้ % อัปเดตต่ำปลอม)
 */
export function activeUniverse(
  lastDateBySymbol: Map<string, string>,
  dbLatest: string | null,
  cal: HolidayCalendar = defaultHolidayCalendar(),
  window = ACTIVE_WINDOW_SESSIONS,
): string[] {
  if (!dbLatest) return []
  const out: string[] = []
  for (const [sym, last] of lastDateBySymbol) if (tradingDaysBetween(last, dbLatest, cal) < window) out.push(sym)
  return out.sort()
}

export function computeFreshness(input: {
  now: Date
  lastDateBySymbol: Map<string, string>
  /** universe ที่กำหนดเอง (เช่น รายชื่อที่สายพานดึง) — ไม่ส่ง = active universe จากฐานข้อมูล */
  universe?: string[]
  /** บังคับรอบที่ต้องมี (เช่น --date ของสายพาน) — ไม่ส่ง = คำนวณจาก now */
  expectedSession?: string
  calendar?: HolidayCalendar
}): FreshnessReport {
  const cal = input.calendar ?? defaultHolidayCalendar()
  const expected = input.expectedSession ?? expectedLatestSession(input.now, cal)
  let dbLatest: string | null = null
  for (const d of input.lastDateBySymbol.values()) if (!dbLatest || d > dbLatest) dbLatest = d
  const universeSource: FreshnessReport["universeSource"] = input.universe && input.universe.length > 0 ? "given" : "active"
  const universe = universeSource === "given" ? [...new Set(input.universe)] : activeUniverse(input.lastDateBySymbol, dbLatest, cal)

  const rows: SymbolFreshnessRow[] = universe.map((symbol) => {
    const lastDate = input.lastDateBySymbol.get(symbol) ?? null
    // แท่งที่ลงวันหลัง expected (เช่น --date ย้อนหลัง) นับว่าสด ไม่ติดลบ
    const lag = lastDate === null ? null : lastDate >= expected ? 0 : tradingDaysBetween(lastDate, expected, cal)
    return { symbol, lastDate, lagSessions: lag, status: classifyLag(lag) }
  })
  const counts: Record<SymbolFreshness, number> = { fresh: 0, lagging: 0, stale: 0, missing: 0 }
  for (const r of rows) counts[r.status]++
  const updated = counts.fresh

  const lag = dbLatest === null ? null : dbLatest >= expected ? 0 : tradingDaysBetween(dbLatest, expected, cal)
  const status: FreshnessReport["status"] = lag === null ? "empty" : lag === 0 ? "fresh" : lag < 2 ? "lagging" : "stale"

  const notes: string[] = []
  const cov = holidayCoverage(expected, cal)
  if (!cov.covered && cov.note) notes.push(cov.note)
  if (status === "lagging")
    notes.push(`ข้อมูลล่าสุด ${dbLatest} ตามหลังรอบ ${expected} อยู่ 1 วันซื้อขาย — feed ยังไม่อัปเดต หรือเป็นวันหยุดที่ไม่อยู่ในปฏิทิน`)
  if (status === "stale") notes.push(`ข้อมูลล่าสุด ${dbLatest} ตามหลังรอบ ${expected} อยู่ ${lag} วันซื้อขาย — ข้อมูลค้าง`)
  if (status === "empty") notes.push("ยังไม่มีข้อมูลตลาดในฐานข้อมูล")
  if (counts.stale > 0)
    notes.push(`${counts.stale} ตัวค้าง ≥ ${STALE_AFTER_SESSIONS} วันซื้อขาย (พักการซื้อขาย/เลิกเทรด/ข้อมูลหาย) — ตรวจก่อนใช้สัญญาณ`)

  return {
    now: bangkokClock(input.now).iso,
    expectedSession: expected,
    dbLatest,
    lagSessions: lag,
    status,
    universeSize: universe.length,
    universeSource,
    updated,
    pctUpdated: universe.length > 0 ? Math.round((updated / universe.length) * 1000) / 10 : null,
    counts,
    laggards: rows
      .filter((r) => r.status !== "fresh")
      .sort((a, b) => (b.lagSessions ?? 1e9) - (a.lagSessions ?? 1e9) || a.symbol.localeCompare(b.symbol))
      .slice(0, 50),
    holidayCovered: cov.covered,
    notes,
  }
}
