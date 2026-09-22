// ============================================================
// THE CORE — rule engine 5 gates (ตัวตัดสิน deterministic ของแล็บเงา)
//
// ประตูทั้ง 5 ต้องผ่านหมดก่อนพิจารณา ENTER_LONG แล้วจึงเช็ค circuit breaker
// (day_pnl_R > -2) เป็นลำดับสุดท้าย — ทุกเกณฑ์อ่านจาก State Packet เดียวกับ LLM
// ============================================================

import type { Gates, StatePacket } from './state'

export interface RuleDecision {
  action: 'ENTER_LONG' | null // null = NO_TRADE
  gates: Gates
}

export function ruleEngine(s: StatePacket): RuleDecision {
  const gates: Gates = {
    // G1 regime: แนวตลาดผ่านเงื่อนไข composite (200dma + slope + index)
    regime: s.regime.pass ? 1 : 0,
    // G2 selection: RS แข็งแรงพอ + (กำไร EPS โต ≥20% หรือมี catalyst ใน 90 วัน)
    selection:
      s.selection.rs_pct >= 80 &&
      (s.selection.eps_yoy >= 0.2 || (s.selection.catalyst_days != null && s.selection.catalyst_days <= 90))
        ? 1
        : 0,
    // G3 level: โซนยัง active (ไม่ freeze / ไม่พลาดไปแล้ว)
    level: s.level.status === 'active' ? 1 : 0,
    // G4 trigger: มีแท่งแนวโน้มที่นิยามไว้ และราคายังอยู่ในโซน
    trigger: s.trigger.pattern !== null && s.trigger.in_zone ? 1 : 0,
    // G5 risk: stop ไม่กว้างเกิน + RR ถึง supply คุ้ม
    risk: s.risk.tradeable ? 1 : 0,
  }

  const allPass =
    gates.regime === 1 &&
    gates.selection === 1 &&
    gates.level === 1 &&
    gates.trigger === 1 &&
    gates.risk === 1

  // Circuit breaker บริบท: วันนี้เสียไป ≥2R แล้ว → หยุดเทรด (แม้ทุกประตูเปิด)
  const action = allPass && s.context.day_pnl_R > -2 ? 'ENTER_LONG' : null

  return { action, gates }
}
