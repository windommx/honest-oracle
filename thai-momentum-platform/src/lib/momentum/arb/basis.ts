// ============================================================
// Engine 2: Basis / Calendar Spread (TFEX) — เงินจากโครงสร้าง ไม่ใช่ทิศทาง
//
// fairBasis: S·(e^((RF−q)·T) − 1) — basis ที่ยุติธรรมจากอัตราดอกเบี้ย
// calendarSignal: z ของ (far−near) เทียบ fair แล้วเทียบสถิติย้อนหลัง
//   z>2 → SHORT_SPREAD, z<−2 → LONG_SPREAD, |z|<0.5 → EXIT, |z|>3.5 → STOP
//
// เปิดใช้เมื่อ ingest FuturesDaily แล้ว (ตารางพร้อม — รอ CSV จาก TFEX)
// ============================================================

export const RF_DEFAULT = 0.022 // ThaiBMA 1y โดยประมาณ

export const fairBasis = (S: number, q: number, T: number, RF: number = RF_DEFAULT): number =>
  S * (Math.exp((RF - q) * T) - 1)

export interface CalendarDecision {
  z: number
  fair: number
  observed: number
  action: "SHORT_SPREAD" | "LONG_SPREAD" | "EXIT" | "STOP" | "HOLD"
}

export function calendarSignal(
  near: { px: number; T: number },
  far: { px: number; T: number },
  S: number,
  q: number,
  hist: number[],
  RF: number = RF_DEFAULT
): CalendarDecision {
  const fair = fairBasis(S, q, far.T, RF) - fairBasis(S, q, near.T, RF)
  const observed = far.px - near.px
  const diffs = hist.map((v, i) => (i ? v - hist[i - 1] : 0)).slice(1)
  const mu = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1)
  const sd =
    Math.sqrt(diffs.reduce((a, b) => a + (b - mu) ** 2, 0) / (diffs.length || 1)) || 1e-9
  const z = (observed - fair) / sd
  return {
    z,
    fair,
    observed,
    action:
      z > 2 ? "SHORT_SPREAD" : z < -2 ? "LONG_SPREAD" : Math.abs(z) < 0.5 ? "EXIT" : Math.abs(z) > 3.5 ? "STOP" : "HOLD",
  }
}

/** q buffer: กันสัญญาณปลอมจากประกาศปันผลพิเศษ — ใช้กับ q ก่อนเรียก calendarSignal */
export const qBuffer = (q: number): number => Math.min(0.06, Math.max(0, q + 0.005))
