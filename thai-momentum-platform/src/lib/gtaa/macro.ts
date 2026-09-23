// Macro Gate — สะพานเชื่อม GTAA (ตลาดโลก) เข้ากับ Command Center ของระบบหุ้นไทย
//
// เกณฑ์ตัดสิน stance ลงทะเบียนล่วงหน้า (preregistered) — ง่าย ตรวจสอบได้ ไม่มีพารามิเตอร์แอบแฝง:
//   risk_off : เงินสดของสัญญาณ ≥ 50%  "และ" SPY หลุด SMA(smaMonths) — ตลาดโลกเตือนรอบเดียวกันทั้งสองช่องทาง
//   caution  : เงินสด ≥ 50% "หรือ" SPY หลุดเส้น — ตัวใดตัวหนึ่งเตือน
//   risk_on  : ทั้งสองปกติ
// นี่เป็นชั้น "เฝ้าดู" (shadow) ต่อระบบหุ้นไทย — ไม่เขียนทับ gross budget ของ regime composite จนกว่าจะมีหลักฐานพอ
//
// ฟังก์ชันทั้งหมด pure (อ่าน panel เท่านั้น ไม่แตะ fs/DB) — import ฝั่ง client ได้ปลอดภัย

import { computeMonthSignals } from "./signals"
import { smaAt } from "./math"
import { GTAA_UNIVERSE } from "./defaults"
import { DEFAULT_GTAA_CONFIG, type GtaaConfig, type GtaaMacroBrief, type GtaaMacroState, type GtaaPanel, type GtaaStance } from "./types"

/** เดือนถัดไป "2024-12" → "2025-01" (รูปแบบเดียวกับ panel.dates) */
export function nextMonthLabel(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})$/)
  if (!m) return month
  const y = Number(m[1])
  const mo = Number(m[2])
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`
}

/** จำนวนเดือนจาก a ถึง b — ติดลบถ้า b ก่อน a (เช่น monthDiff("2024-01","2025-03") = 14) */
export function monthDiff(a: string, b: string): number {
  const ma = a.match(/^(\d{4})-(\d{2})$/)
  const mb = b.match(/^(\d{4})-(\d{2})$/)
  if (!ma || !mb) return 0
  return (Number(mb[1]) - Number(ma[1])) * 12 + (Number(mb[2]) - Number(ma[2]))
}

/** เดือนปัจจุบัน (UTC) รูปแบบ "YYYY-MM" */
export function currentMonthLabel(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * ข้อมูล "ทันรอบ" แปลว่าถึงเดือนก่อนเดือนปัจจุบัน (สัญญาณปิดเดือนก่อน ใช้จัดพอร์ตเดือนนี้)
 * staleMonths > 0 = เลยรอบรีบาลานซ์มาแล้ว N รอบโดยไม่มีข้อมูลใหม่
 */
export function stalenessOf(lastMonth: string, now = new Date()): number {
  const behind = monthDiff(lastMonth, currentMonthLabel(now)) - 1
  return Math.max(0, behind)
}

/** คำนวณสถานะมหภาคเต็มรูปแบบ ณ เดือนปิดข้อมูลล่าสุดของ panel */
export function computeMacroState(panel: GtaaPanel, cfg: GtaaConfig = DEFAULT_GTAA_CONFIG, now = new Date()): GtaaMacroState {
  const T = panel.dates.length
  const asOfMonth = panel.dates[T - 1] ?? "—"

  // สัญญาณของเดือนปิดล่าสุด (ไม่มี look-ahead — อ่านข้อมูล ≤ T-1 เท่านั้น)
  const sig = computeMonthSignals(panel, T - 1, cfg)
  // เงินสดของสัญญาณ — ไม่ใช้ weights[cashTicker] เพราะ trendedBond ที่ IEF ถูกเลือกด้วยจะรวม slot ของ IEF เข้าไป
  const cashPct = sig.cashWeight

  // SPY — เส้นเทรนด์ตลาดหุ้นหลัก (absolute momentum ของ benchmark เอง)
  const benchCloses = panel.closes["SPY"] ?? []
  const benchClose = benchCloses[T - 1] ?? null
  const benchSma = smaAt(benchCloses, T - 1, cfg.smaMonths)
  const benchPass = benchSma !== null && benchClose !== null && benchClose > benchSma
  const benchGapPct = benchSma !== null && benchClose !== null && benchSma > 0 ? (benchClose / benchSma - 1) * 100 : null

  const failed = sig.rows.filter((r) => r.status === "kicked").map((r) => r.ticker)
  // ตัวที่ถือ (Top-N) ด้วยน้ำหนัก slot ของตัวเอง — ถ้าเป็นตัวเงินสดด้วย (IEF) หักส่วนเงินสดออก
  const holdings = sig.rows
    .filter((r) => r.status === "selected")
    .map((r) => ({
      ticker: r.ticker,
      name: r.name,
      group: r.group,
      weight: r.ticker === sig.cashTicker ? r.weight - sig.cashWeight : r.weight,
      score: r.score,
      trendPass: r.trendPass,
    }))

  // เกณฑ์ stance ตามที่ลงทะเบียนไว้ด้านบน
  const cashHeavy = cashPct >= 0.5
  let stance: GtaaStance
  if (cashHeavy && !benchPass) stance = "risk_off"
  else if (cashHeavy || !benchPass) stance = "caution"
  else stance = "risk_on"

  const cashPctStr = `${(cashPct * 100).toFixed(1)}%`
  const smaTxt = `SMA ${cfg.smaMonths} เดือน`
  const stanceWhy =
    stance === "risk_off"
      ? `เงินสด ${cashPctStr} ≥ 50% และ SPY หลุด ${smaTxt} — สองช่องทางเตือนพร้อมกัน`
      : stance === "caution"
        ? cashHeavy
          ? `เงินสด ${cashPctStr} ≥ 50% (SPY ยังยืนเหนือ ${smaTxt}) — เตือนช่องทางเดียว`
          : `SPY หลุด ${smaTxt} (สัดส่วนถือยังไม่หนัก) — เตือนช่องทางเดียว`
        : `เงินสดเพียง ${cashPctStr} และ SPY ยืนเหนือ ${smaTxt} — ไม่มีสัญญาณเตือน`

  const staleMonths = stalenessOf(asOfMonth, now)

  return {
    asOfMonth,
    source: panel.meta.source,
    stance,
    stanceWhy,
    cashPct,
    cashTicker: sig.cashTicker,
    benchPass,
    benchClose,
    benchSma,
    benchGapPct,
    holdings,
    failed,
    universeCount: GTAA_UNIVERSE.length,
    nextDecisionMonth: nextMonthLabel(asOfMonth),
    nextAppliesMonth: nextMonthLabel(nextMonthLabel(asOfMonth)),
    staleMonths,
  }
}

/** ย่อ macro state สำหรับฝังใน response ของ /api/overview (Command Center) */
export function toMacroBrief(m: GtaaMacroState): GtaaMacroBrief {
  return {
    stance: m.stance,
    stanceWhy: m.stanceWhy,
    cashPct: m.cashPct,
    asOfMonth: m.asOfMonth,
    source: m.source,
    benchPass: m.benchPass,
    failedCount: m.failed.length,
    universeCount: m.universeCount,
    staleMonths: m.staleMonths,
  }
}
