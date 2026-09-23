// Tracking Log evaluation — สัญญาณที่ "เขียนไว้ก่อนเกิดผล" ต้องให้ตรวจสอบย้อนหลังได้
//
// หลักการ: snapshot ที่บันทึกลง DB มี decisionMonth (ปิดเดือนที่ตัดสินใจ) และ appliesMonth (เดือนที่ใช้พอร์ต)
// เมื่อ panel มีข้อมูลเดือนถัดไปแล้ว ฟังก์ชันนี้ประเมินผลจริงของพอร์ตที่วางไว้ เทียบ SPY — ทำให้
// "สัญญาณ" กลายเป็น track record ที่โกหกไม่ได้ (ห้ามแก้ประวัติ — แก้ได้แค่ลบพร้อม audit event)
//
// pure — ไม่แตะ DB/fs — import ฝั่ง client ได้

import { currentMonthLabel, monthDiff, nextMonthLabel } from "./macro"
import type { GtaaPanel, GtaaStance, TrackedSignalRow } from "./types"

/** รูปแบบแถวดิบจาก DB (Prisma) ก่อนผ่านการประเมิน */
export interface StoredSignalLike {
  id: number
  decisionMonth: string
  appliesMonth: string
  cashPct: number
  cashTicker: string
  /** JSON string — [{ticker, weight, name?, group?, score?, rank?, trendPass?}] */
  holdings: string
  /** JSON string — string[] ticker ที่สอบตกเทรนด์ */
  failed: string
  stance: string | null
  dataSource: string
  configHash: string
  createdAt: Date | string
}

/** ผลตอบแทนเดือน closes[i] → closes[i+1] (null ถ้าข้อมูลไม่ครบ) */
function fwdReturn(closes: (number | null)[], i: number): number | null {
  const a = closes[i]
  const b = closes[i + 1]
  if (a === null || b === null || a === undefined || b === undefined || a <= 0) return null
  return b / a - 1
}

/**
 * ประเมิน snapshot ทุกแถวเทียบ panel:
 * - เจอ decisionMonth ใน panel + มีข้อมูลเดือนถัดไป → state "scored" (หรือ missing-data ถ้าราคาตัวใดขาด)
 * - ยังไม่มีเดือนถัดไป หรือเดือนที่ใช้ยังไม่ปิดตามปฏิทิน (UTC) → realized = null (รอผล)
 *   (panel จาก Yahoo มีแท่งของเดือนที่กำลังเดิน — ห้ามให้คะแนนจากราคากลางเดือน)
 * - ไม่เจอ decisionMonth เลย / panel เปลี่ยนชุด (จริง↔สังเคราะห์) → state "missing-data"
 * พอร์ตที่ประเมิน = holdings + ส่วนที่เหลือถือตัวเงินสด (cashTicker) — holdings ที่บันทึกเก็บเฉพาะ universe
 */
export function evaluateTracking(panel: GtaaPanel, rows: StoredSignalLike[], now: Date = new Date()): TrackedSignalRow[] {
  const out: TrackedSignalRow[] = []
  const T = panel.dates.length
  const lastMonth = panel.dates[T - 1] ?? ""
  const nowMonth = currentMonthLabel(now)
  // แท่งเดือนใน panel สมบูรณ์เมื่อดึง/อัปโหลดหลังเดือนนั้นปิด — fetchedAt อ่านไม่ได้ = อิงนาฬิกาอย่างเดียว
  const fetchedAt = new Date(panel.meta.fetchedAt)
  const fetchedMonth = Number.isNaN(fetchedAt.getTime()) ? null : currentMonthLabel(fetchedAt)
  const panelSynthetic = panel.meta.source === "synthetic"
  const indexOfMonth = new Map<string, number>()
  for (let i = 0; i < T; i++) indexOfMonth.set(panel.dates[i], i)

  for (const row of rows) {
    let holdings: { ticker: string; weight: number }[] = []
    let holdingsOk = false
    try {
      const parsed = JSON.parse(row.holdings) as unknown
      if (Array.isArray(parsed)) {
        holdingsOk = true
        holdings = parsed
          .map((h) => h as { ticker?: unknown; weight?: unknown })
          .filter((h) => typeof h.ticker === "string" && typeof h.weight === "number" && h.weight > 0)
          .map((h) => ({ ticker: h.ticker as string, weight: h.weight as number }))
      }
    } catch {
      holdings = []
    }
    let failedCount = 0
    try {
      const parsed = JSON.parse(row.failed) as unknown
      if (Array.isArray(parsed)) failedCount = parsed.length
    } catch {
      failedCount = 0
    }

    const base: TrackedSignalRow = {
      id: row.id,
      decisionMonth: row.decisionMonth,
      appliesMonth: row.appliesMonth,
      cashPct: row.cashPct,
      cashTicker: row.cashTicker,
      holdings,
      failedCount,
      stance: (row.stance as GtaaStance | null) ?? null,
      dataSource: row.dataSource,
      configHash: row.configHash,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
      realized: null,
    }

    const appliesMonth = nextMonthLabel(row.decisionMonth)
    if (monthDiff(appliesMonth, nowMonth) < 1 || (fetchedMonth !== null && monthDiff(appliesMonth, fetchedMonth) < 1)) {
      // เดือนที่ใช้สัญญาณยังไม่ปิด (ปฏิทิน UTC — นาฬิกาเดียวกับ staleness) หรือ panel ถูกดึงก่อนเดือนนั้นปิด
      // (แท่งเดือนนั้นยังเป็นราคากลางเดือน) → รอผล จนกว่าจะอัปเดตข้อมูลหลังปิดเดือน
      out.push(base)
      continue
    }
    const i = indexOfMonth.get(row.decisionMonth)
    const dataSetChanged = panelSynthetic !== (row.dataSource === "synthetic")
    if (!dataSetChanged && (i === undefined ? row.decisionMonth > lastMonth : i >= T - 1)) {
      // ข้อมูลเดือนที่ใช้ยังมาไม่ถึง panel → รอผล
      out.push(base)
      continue
    }
    if (dataSetChanged || i === undefined || panel.dates[i + 1] !== appliesMonth) {
      // panel เปลี่ยนชุด (สัญญาณจริงห้ามตรวจกับราคาสังเคราะห์) / ไม่เจอเดือนตัดสินใจ / กริดเดือนขาด → ตรวจผลไม่ได้
      base.realized = { state: "missing-data", portfolioRet: null, spyRet: null, delta: null, hit: null, missing: [] }
      out.push(base)
      continue
    }

    // ประเมิน: พอร์ต = Σ w·r ของตัวถือ (รวมตัวเงินสด) เดือน i → i+1
    // holdings ที่บันทึกมีเฉพาะ universe — ส่วนที่เหลือคือเงินสดของสัญญาณ (เช่น BIL) ต้องนับรวม ไม่งั้น exposure พองเกินจริง
    const legs = [...holdings]
    const heldW = holdings.reduce((a, h) => a + h.weight, 0)
    if (holdingsOk && heldW < 1 - 1e-6 && row.cashTicker) legs.push({ ticker: row.cashTicker, weight: 1 - heldW })
    const missing: string[] = []
    let portfolioRet = 0
    let wSum = 0
    for (const h of legs) {
      const r = fwdReturn(panel.closes[h.ticker] ?? [], i)
      if (r === null) {
        missing.push(h.ticker)
        continue
      }
      portfolioRet += h.weight * r
      wSum += h.weight
    }
    const spyRet = fwdReturn(panel.closes["SPY"] ?? [], i)

    let state: "scored" | "missing-data"
    let portfolioOut: number | null
    let delta: number | null = null
    let hit: boolean | null = null
    if (wSum <= 1e-9 || spyRet === null) {
      state = "missing-data"
      portfolioOut = null
    } else {
      // ตัวที่ขาดข้อมูลปรับน้ำหนักเหลือให้ผลรวมน้ำหนักที่วัดได้ = จริง (พอร์ตสัมผัสเฉพาะส่วนที่มีราคา)
      state = missing.length > 0 ? "missing-data" : "scored"
      portfolioOut = portfolioRet / wSum
      delta = portfolioOut - spyRet
      hit = portfolioOut >= spyRet
    }

    base.realized = {
      state,
      portfolioRet: portfolioOut,
      spyRet,
      delta,
      hit,
      missing,
    }
    out.push(base)
  }

  // เรียงใหม่ล่าสุดก่อน (DB ส่งมา desc อยู่แล้ว แต่กันพลาด)
  out.sort((a, b) => (a.decisionMonth < b.decisionMonth ? 1 : a.decisionMonth > b.decisionMonth ? -1 : b.id - a.id))
  return out
}

/** สรุป track record จากแถวที่ประเมินแล้ว (เฉพาะ state "scored") */
export function trackingSummary(signals: TrackedSignalRow[]): {
  saved: number
  scored: number
  wins: number
  hitRate: number | null
  avgDelta: number | null
} {
  const scored = signals.filter((s) => s.realized?.state === "scored" && s.realized.delta !== null)
  const wins = scored.filter((s) => s.realized?.hit).length
  const deltas = scored.map((s) => s.realized?.delta ?? 0)
  return {
    // "บันทึกกี่เดือน" (docs §8.2 / การ์ดแสดงหน่วย "เดือน") — หลาย config ในเดือนเดียวกันนับเป็น 1 เดือน
    saved: new Set(signals.map((s) => s.decisionMonth)).size,
    scored: scored.length,
    wins,
    hitRate: scored.length > 0 ? wins / scored.length : null,
    avgDelta: deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
  }
}
