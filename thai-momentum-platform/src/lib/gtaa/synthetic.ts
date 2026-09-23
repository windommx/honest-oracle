// สร้างข้อมูลสังเคราะห์แบบ deterministic ต่อ seed — ใช้เป็น default panel เมื่อยังไม่มีข้อมูลจริง
// หลักการ: market factor + regime switching (bull/bear/crash/chop) + sector tilt + idiosyncratic
// ตัวเลขทุกอย่างเป็นของปลอมที่กำหนดด้วย seed — ห้ามใช้ตัดสินใจลงทุน (UI ติดป้าย SYNTHETIC เสมอ)

import { gaussianFrom, mulberry32 } from "./math"
import { ALL_ASSETS, UNIVERSE_TICKERS } from "./defaults"
import type { GtaaPanel } from "./types"

const MONTHS_BACK = 360 // 30 ปี

/** ป้ายเดือน YYYY-MM ย้อนหลัง n เดือน จบที่เดือนปัจจุบัน (UTC) */
export function monthLabels(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-based
  for (let i = n - 1; i >= 0; i--) {
    const total = y * 12 + m - i
    const yy = Math.floor(total / 12)
    const mm = (total % 12) + 1
    out.push(`${yy}-${String(mm).padStart(2, "0")}`)
  }
  return out
}

/** โครงพฤติกรรมสินทรัพย์สังเคราะห์ */
interface SynthSpec {
  alpha: number // drift รายเดือน
  beta: number // ความอ่อนไหว market
  idio: number // vol เฉพาะตัว
  sector?: "bond" | "gold" | "commodity" | "reit" | "em"
}

const SPECS: Record<string, SynthSpec> = {
  VTV: { alpha: 0.0072, beta: 0.95, idio: 0.028 },
  MTUM: { alpha: 0.0075, beta: 1.05, idio: 0.03 },
  VBR: { alpha: 0.0078, beta: 1.1, idio: 0.038 },
  DWAS: { alpha: 0.008, beta: 1.15, idio: 0.04 },
  EFA: { alpha: 0.0058, beta: 0.95, idio: 0.03 },
  EEM: { alpha: 0.006, beta: 1.1, idio: 0.042, sector: "em" },
  TLT: { alpha: 0.0038, beta: -0.18, idio: 0.042, sector: "bond" },
  IEF: { alpha: 0.0032, beta: -0.1, idio: 0.028, sector: "bond" },
  LQD: { alpha: 0.0035, beta: 0.08, idio: 0.024, sector: "bond" },
  IGOV: { alpha: 0.0028, beta: -0.05, idio: 0.024, sector: "bond" },
  DBC: { alpha: 0.0042, beta: 0.3, idio: 0.045, sector: "commodity" },
  GLD: { alpha: 0.005, beta: 0.02, idio: 0.04, sector: "gold" },
  VNQ: { alpha: 0.0062, beta: 1.0, idio: 0.04, sector: "reit" },
  BIL: { alpha: 0.0016, beta: 0, idio: 0.0005 },
  SPY: { alpha: 0.007, beta: 1.0, idio: 0.008 },
}

type Regime = "bull" | "bear" | "crash" | "chop"

const REGIME_MU: Record<Regime, number> = { bull: 0.012, bear: -0.011, crash: -0.06, chop: 0.004 }
const REGIME_SIGMA: Record<Regime, number> = { bull: 0.032, bear: 0.05, crash: 0.1, chop: 0.022 }

/** Markov chain ของ market regime — transition แบบแถว (from → to) */
const TRANSITION: Record<Regime, [Regime, number][]> = {
  bull: [
    ["bull", 0.82],
    ["chop", 0.1],
    ["bear", 0.07],
    ["crash", 0.01],
  ],
  chop: [
    ["bull", 0.45],
    ["chop", 0.4],
    ["bear", 0.12],
    ["crash", 0.03],
  ],
  bear: [
    ["bear", 0.55],
    ["chop", 0.3],
    ["bull", 0.13],
    ["crash", 0.02],
  ],
  crash: [
    ["bear", 0.45],
    ["chop", 0.4],
    ["bull", 0.15],
  ],
}

function pick(rng: () => number, rows: [Regime, number][]): Regime {
  let u = rng()
  for (const [state, p] of rows) {
    if (u < p) return state
    u -= p
  }
  return rows[rows.length - 1][0]
}

/**
 * สร้าง panel สังเคราะห์ deterministic ต่อ seed
 * - เริ่มราคา 100 ทุกตัว (เกณฑ์สัญญาณใช้ผลตอบแทน ไม่สนระดับราคา)
 * - มี bull/bear/crash/chop ชัดเจนพอให้เห็นการทำงานของ SMA filter และ momentum
 * - bond มีช่วง "ดอกเบี้ยขาขึ้น" ปีที่ 26-28 (แก้ด้วย index ตรงๆ) เพื่อจำลอง 2022 เห็น FAIL→cash แบบในโพสต์
 */
export function makeSyntheticPanel(seed = 42, months = MONTHS_BACK): GtaaPanel {
  const rng = mulberry32(seed)
  const gauss = gaussianFrom(rng)
  const dates = monthLabels(months)

  const market: number[] = []
  let regime: Regime = "bull"
  for (let t = 0; t < months; t++) {
    regime = pick(rng, TRANSITION[regime])
    const mu = REGIME_MU[regime]
    const sig = REGIME_SIGMA[regime]
    market.push(mu + sig * gauss())
  }

  const closes: Record<string, (number | null)[]> = {}
  for (const asset of ALL_ASSETS) {
    const spec = SPECS[asset.ticker]
    if (!spec) continue
    const series: number[] = []
    let price = 100
    for (let t = 0; t < months; t++) {
      let r = spec.alpha + spec.beta * market[t] + spec.idio * gauss()
      // sector factor เฉพาะกลุ่ม — ให้เกิด period ที่กลุ่มวิ่งต่างทิศ (rotation เห็นผลจริง)
      if (spec.sector === "bond") {
        // วงจรดอกเบี้ย: ปี 2-3 ขาลงแรง (จำลอง 2022) + ช่วงอื่นสลับ
        const yr = t / 12
        if (yr >= 2 && yr < 3.2) r -= 0.018
        if (yr >= 12 && yr < 13) r += 0.008
        if (yr >= 26 && yr < 27.4) r -= 0.012
        if (yr >= 27.4 && yr < 28.6) r += 0.009
      }
      if (spec.sector === "gold") {
        const yr = t / 12
        if (yr >= 4 && yr < 6) r += 0.012 // วงจรทองขาขึ้นช่วงหนึ่ง
        if (yr >= 9 && yr < 10) r -= 0.01
        if (yr >= 28 && yr < 29.5) r += 0.014
      }
      if (spec.sector === "commodity") {
        const yr = t / 12
        if (yr >= 6 && yr < 7.5) r += 0.013
        if (yr >= 15 && yr < 16.5) r -= 0.011
        if (yr >= 25.5 && yr < 26.5) r += 0.016
      }
      if (spec.sector === "em") {
        const yr = t / 12
        if (yr >= 16 && yr < 17.5) r -= 0.009
        if (yr >= 29 && yr < 30) r += 0.008
      }
      if (spec.sector === "reit") {
        const yr = t / 12
        if (yr >= 13.5 && yr < 14.2) r -= 0.015
      }
      price = price * (1 + r)
      series.push(price)
    }
    closes[asset.ticker] = series
  }

  return {
    meta: {
      source: "synthetic",
      seed,
      fetchedAt: new Date().toISOString(),
      notes: [
        "ข้อมูลสังเคราะห์ deterministic ต่อ seed — สร้างให้มีทั้ง bull/bear/crash และ rotation ระหว่างกลุ่ม",
        "พิสูจน์ว่าท่อ engine→signal→backtest→stats ต่อกันถูก ไม่ได้พิสูจน์ว่ามีเอดจ์ — ต้องรันกับข้อมูลจริงผ่านช่องทางอัปโหลด/fetch",
      ],
    },
    dates,
    assets: ALL_ASSETS,
    closes,
  }
}

export const UNIVERSE_LIST = UNIVERSE_TICKERS
