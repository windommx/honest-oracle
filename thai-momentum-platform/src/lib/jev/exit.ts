// ============================================================
// Q_EXIT แบบ legacy ของสมอง Jev — pure (ไม่แตะ db) ใช้โดย /api/jev/run
// ใช้เมื่อ Bayesian stop ไม่ได้ adopt หรือสถานะยังไม่ติดลบ (dd ≤ 0.5%)
// ลำดับกฎ:
//   ไม่มีราคาวันล่าสุด → hold (ขายไม่ได้ — รายงานราคาล่าสุดที่มีจริง ไม่ใช่ ret=0.0% ปลอม)
//   ราคา ≤ stop ที่บันทึกไว้ → exit (stop ตั้งตอนเข้า หรือเลื่อนเป็น +2% ตอน tighten — ตรง backtest engine)
//   ret > 25% → exit (กำไรใหญ่) · หลุดโผ & ret > 0 → tighten · ret ≤ −6% → exit · อื่น ๆ → hold
// ============================================================

import type { JevDecision } from "@/lib/momentum/contracts"

export interface ExitPosition {
  symbol: string
  entryPx: number
  stop: number
}

export function legacyExitDecision(
  p: ExitPosition,
  lp: number, // ราคาปิดวันล่าสุด (NaN = ไม่มีแถววันล่าสุด)
  inList: boolean, // ติดโผ snapshot วันล่าสุดอยู่หรือไม่
  lastKnown: { px: number; date: string } | null // ราคาล่าสุดที่มีจริง (ใช้เมื่อ lp ไม่มี)
): JevDecision {
  const base = { question: "Q_EXIT" as const, target: p.symbol }
  if (!Number.isFinite(lp)) {
    const lkPart = lastKnown
      ? ` · ราคาล่าสุดที่มี ${lastKnown.date} ret=${((lastKnown.px / p.entryPx - 1) * 100).toFixed(1)}%`
      : ""
    return {
      ...base,
      action: "hold",
      conf: 0.6,
      reason: `ไม่มีราคาวันล่าสุด (พัก/หยุดซื้อขาย) — ถือไว้ก่อน${lkPart}`,
    }
  }
  const r = lp / p.entryPx - 1
  const fmt = `${(r * 100).toFixed(1)}%`
  if (lp <= p.stop) {
    return {
      ...base,
      action: "exit",
      conf: 0.85,
      reason: `หลุด stop ${p.stop.toFixed(2)} (ราคา ${lp.toFixed(2)}) ret=${fmt}`,
    }
  }
  if (r > 0.25) return { ...base, action: "exit", conf: 0.85, reason: `กำไรใหญ่ ret=${fmt}` }
  if (!inList && r > 0) return { ...base, action: "tighten", conf: 0.8, reason: `ret=${fmt}` }
  if (r <= -0.06) return { ...base, action: "exit", conf: 0.85, reason: `ret=${fmt}` }
  return { ...base, action: "hold", conf: 0.6, reason: `ret=${fmt}` }
}
