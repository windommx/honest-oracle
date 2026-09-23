/**
 * ตรรกะตัวเลขของ Command Center ที่แยกออกมาให้ทดสอบได้ (pure — ไม่มี React/DOM)
 */

import { daysBetween, lastDayOfMonth } from "./dates"

/**
 * สัดส่วน drawdown รายสัปดาห์ต่อเพดาน kill-switch (0..1) สำหรับ Risk Radar
 *
 * สัญญาของ /api/portfolio: weeklyDD = ผลตอบแทน 5 วันทำการ (ทศนิยม, ขาดทุน = ติดลบ)
 * และ maxWeeklyDD = เพดานแบบติดลบ (TH_RISK.maxWeeklyDD = -0.05) · kill switch = weeklyDD ≤ maxWeeklyDD
 * → ใช้ขนาดของเพดาน และนับเฉพาะฝั่งขาดทุน (สัปดาห์ที่กำไรไม่มี drawdown) — ratio ≥ 1 ⇔ kill switch
 */
export function weeklyDdRatio(weeklyDD: number | null | undefined, maxWeeklyDD: number | null | undefined): number {
  if (weeklyDD == null || maxWeeklyDD == null) return 0
  if (!Number.isFinite(weeklyDD) || !Number.isFinite(maxWeeklyDD)) return 0
  const cap = Math.abs(maxWeeklyDD)
  if (cap === 0) return 0
  const dd = Math.max(0, -weeklyDD)
  return Math.min(1, dd / cap)
}

export interface GtaaCountdown {
  /** วันปิดรอบ YYYY-MM-DD */
  date: string | null
  daysLeft: number | null
  /** engine = ปิดเดือน nextDecisionMonth ของเอนจิน GTAA · calendar = สิ้นเดือนตามปฏิทินจาก /api/ops/pulse */
  source: "engine" | "calendar" | null
}

/**
 * นับถอยหลังรอบตัดสินใจ GTAA — ปิดเดือน nextDecisionMonth ของเอนจินเป็นความจริงเมื่อยังไม่เลยกำหนด
 * ถ้าเอนจินยังไม่โหลด หรือวันปิดรอบนั้นผ่านไปแล้ว (panel GTAA ค้างหลายเดือน) → ใช้สิ้นเดือนตามปฏิทินจาก pulse
 * กันตัวนับติดลบ เช่น "อีก -45 วัน"
 */
export function resolveGtaaCountdown(
  today: string | null,
  engineNextMonth: string | null | undefined,
  calendar: { date: string; daysLeft: number } | null | undefined,
): GtaaCountdown {
  if (today && engineNextMonth) {
    const date = lastDayOfMonth(engineNextMonth)
    const daysLeft = date ? daysBetween(today, date) : null
    if (date && daysLeft !== null && daysLeft >= 0) return { date, daysLeft, source: "engine" }
  }
  if (calendar) return { date: calendar.date, daysLeft: calendar.daysLeft, source: "calendar" }
  return { date: null, daysLeft: null, source: null }
}
