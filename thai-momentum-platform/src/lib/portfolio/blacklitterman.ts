// ============================================================
// Black-Litterman with Idzorek confidence mapping
// (Task 7-2-b, backend-allocation)
//
// ตามเอกสาร: "ให้ขนาดของสัญญาณโมเมนตัมกำหนด Q และให้ความมั่นใจกำหนด Ω"
//  - P = identity rows (absolute views บนหุ้นที่เลือก)
//  - Idzorek closed-form: ω_i = τ·(P_i Σ P_i')·(1−c_i)/c_i
//    (c มาก → ω เล็ก → view ถูกเชื่อมากขึ้น; c ถูก clip [0.05, 0.95])
//  - Master formula: μ_BL = Π + τΣP'(PτΣP' + Ω)⁻¹(Q − PΠ)
//  - Weights: w = (1/λ)·Σ⁻¹μ_BL → long-only projection (clamp ≥ 0, normalize)
// ============================================================

import { invert, matmul, matvec, solveLinear, transpose } from "./linalg"

export interface BlView {
  symbolIdx: number
  q: number // view return (annual, decimal)
  confidence: number // 0..1
}

export interface BlArgs {
  sigma: number[][] // covariance (annual)
  pi: number[] // equilibrium excess returns (annual)
  views: BlView[]
  tau?: number
  riskAversion?: number
}

export interface BlResult {
  muBl: number[] // posterior returns
  omega: number[] // view uncertainty (ต่อ view ตามลำดับ input)
  weights: number[] // long-only, ผลรวม = 1
}

const CONF_MIN = 0.05
const CONF_MAX = 0.95

/**
 * รัน BL + Idzorek — คืน null เมื่อ sigma/pi ไม่ถูกต้องหรือ singular
 * (A = PτΣP' + Ω เป็น PD เสมอเมื่อ c < 1 จึงแก้ด้วย solveLinear ได้ปลอดภัย)
 */
export function blackLittermanIdzorek(args: BlArgs): BlResult | null {
  const tau = args.tau ?? 0.05
  const lambda = args.riskAversion ?? 3.0
  const sigma = args.sigma
  const pi = args.pi
  const n = sigma.length
  if (n === 0 || pi.length !== n) return null
  for (const row of sigma) {
    if (row.length !== n) return null
    for (const v of row) if (!isFinite(v)) return null
  }
  for (const v of pi) if (!isFinite(v)) return null

  // กรอง view ที่ไม่สมบูรณ์ออก (index เกิน/NaN)
  const views = args.views.filter(
    (v) =>
      Number.isFinite(v.q) &&
      Number.isFinite(v.confidence) &&
      v.symbolIdx >= 0 &&
      v.symbolIdx < n
  )
  const k = views.length

  // P = identity rows บนหุ้นที่มี view (absolute views)
  const P: number[][] = views.map((v) => {
    const row = new Array<number>(n).fill(0)
    row[v.symbolIdx] = 1
    return row
  })
  const Q: number[] = views.map((v) => v.q)
  // Idzorek: ω_i = τ·(P_i Σ P_i')·(1−c_i)/c_i  (c สูง → ω เล็ก)
  const omega = views.map((v, i) => {
    const c = Math.min(CONF_MAX, Math.max(CONF_MIN, v.confidence))
    const sigmaPi = matvec(sigma, P[i]) // Σ·P_i'
    let psp = 0
    for (let j = 0; j < n; j++) psp += P[i][j] * sigmaPi[j]
    return tau * psp * ((1 - c) / c)
  })

  // ---- μ_BL ----
  let muBl: number[]
  if (k === 0) {
    // ไม่มี view → posterior = equilibrium
    muBl = pi.slice()
  } else {
    const tauSigma = sigma.map((row) => row.map((v) => v * tau))
    const ptsp = matmul(P, matmul(tauSigma, transpose(P))) // PτΣP' (k×k)
    const A = ptsp.map((row, i) => {
      const r = row.slice()
      r[i] += omega[i] // + Ω (diagonal)
      return r
    })
    const qMinusPpi = Q.map((q, i) => q - matvec(P, pi)[i])
    const x = solveLinear(A, qMinusPpi)
    if (x === null) return null
    // μ_BL = Π + τΣP'·x
    const adjustment = matvec(tauSigma, matvec(transpose(P), x))
    muBl = pi.map((v, i) => v + adjustment[i])
  }

  // ---- w = (1/λ)·Σ⁻¹μ_BL → long-only projection ----
  const invSigma = invert(sigma)
  if (invSigma === null) return null
  const raw = matvec(invSigma, muBl).map((v) => v / lambda)
  const clamped = raw.map((v) => Math.max(0, v))
  const sum = clamped.reduce((a, b) => a + b, 0)
  // ถ้า μ_BL ติดลบจนน้ำหนักรวมเป็น 0 → fallback equal weight (ป้องกันพอร์ตว่าง)
  const weights = sum > 0 ? clamped.map((v) => v / sum) : new Array<number>(n).fill(1 / n)

  return { muBl, omega, weights }
}
