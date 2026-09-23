// Shared helpers ของ Global Engines — คำนวณจาก ThaiPivots (close/val/liq)
// ธรรมเนียมเดียวกับ thai-fit: mask ด้วย liq, fwd แบบ market-demeaned, IC ผ่าน icPerDate

import { icPerDate, type IcSummary, type Mat, type ThaiPivots } from "@/lib/research/thai-fit"

export const NANO = 1e-9

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/** sample std (ddof=1) */
export function stdD1(xs: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return Math.sqrt(s / (n - 1))
}

/** percentile ของค่า x ใน sorted array (0..1) */
export function pctRankSorted(sorted: number[], x: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((sorted[mid] ?? 0) < x) lo = mid + 1
    else hi = mid
  }
  return sorted.length > 0 ? lo / sorted.length : 0
}

/**
 * ผลตอบแทนรายวัน r_t = close[t]/close[t-1] − 1 (undefined ถ้าข้อมูลไม่ครบ)
 * ไม่ mask liq เพื่อให้ใช้ทำ market series ได้กว้าง
 */
export function dailyReturns(piv: ThaiPivots): Mat {
  const { close, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    const prev = i >= 1 ? close[i - 1] : null
    if (prev) {
      const cur = close[i]
      for (let j = 0; j < nSym; j++) {
        const c0 = cur[j]
        const cp = prev[j]
        if (c0 !== undefined && cp !== undefined && cp > NANO) row[j] = c0 / cp - 1
      }
    }
    out.push(row)
  }
  return out
}

/** ผลตอบแทนตลาดแบบ equal-weight ต่อวัน (เฉพาะหุ้นที่มีค่า) */
export function marketReturns(rets: Mat): number[] {
  return rets.map((row) => {
    let s = 0
    let c = 0
    for (const v of row) {
      if (v !== undefined) {
        s += v
        c++
      }
    }
    return c > 0 ? s / c : 0
  })
}

/** EWMA volatility รายวัน (lambda ตามธรรมเนียม RiskMetrics 0.94) */
export function ewmaVol(rets: number[], lambda = 0.94): number[] {
  const out: number[] = []
  let v = 0.01 * 0.01 // เริ่ม 1% ต่อวัน
  for (const r of rets) {
    v = lambda * v + (1 - lambda) * r * r
    out.push(Math.sqrt(Math.max(v, NANO)))
  }
  return out
}

/**
 * fwd hold = close.pct_change(hold) แบบ market-demeaned + mask liq
 * (ก๊อปธรรมเนียม fwdDemeaned ของ thai-fit — นิยามเดียวกันทุกที่)
 */
export function fwdDemeaned(piv: ThaiPivots, hold: number): Mat {
  const { close, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    const fut = i + hold < nD ? close[i + hold] : null
    if (fut) {
      const raw: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
      let s = 0
      let c = 0
      for (let j = 0; j < nSym; j++) {
        const c0 = close[i][j]
        const cf = fut[j]
        if (c0 !== undefined && cf !== undefined) {
          const v = cf / c0 - 1
          raw[j] = v
          s += v
          c++
        }
      }
      const m = c > 0 ? s / c : 0
      for (let j = 0; j < nSym; j++) {
        if (raw[j] !== undefined && liq[i][j]) row[j] = (raw[j] as number) - m
      }
    }
    out.push(row)
  }
  return out
}

/** วัด IC ของ signal matrix กับ fwd หลาย horizon — คืน per-horizon IcSummary */
export function icAcross(
  piv: ThaiPivots,
  sig: Mat,
  holds: readonly number[],
): { hold: number; ic: IcSummary }[] {
  return holds.map((hold) => ({
    hold,
    ic: icPerDate(sig, fwdDemeaned(piv, hold), piv.nSym),
  }))
}

/**
 * เลือก IC ที่ดีที่สุดตาม ICIR (สำหรับ verdict) — เฉพาะ hold ที่วัดได้จริง (n>0)
 * (hold ที่ n=0 มี ICIR 0 ปลอม ห้ามชนะ hold ที่วัดได้แต่ติดลบ) · ไม่มีเลย → null
 */
export function bestIc(rows: { hold: number; ic: IcSummary }[]): {
  hold: number
  ic: IcSummary
} | null {
  let best: { hold: number; ic: IcSummary } | null = null
  for (const r of rows) {
    if (r.ic.n <= 0) continue
    if (!best || r.ic.ICIR > best.ic.ICIR) best = r
  }
  return best
}

/** วันที่ index ล่าสุดที่ signal ยังนับได้ (ค่าต่างกันตาม engine — ใช้แสดง live snapshot) */
export function latestSignalValue(sig: Mat): number | null {
  for (let i = sig.length - 1; i >= 0; i--) {
    const row = sig[i]
    const vals: number[] = []
    for (const v of row) {
      if (v !== undefined) vals.push(v)
    }
    if (vals.length >= 10) return mean(vals)
  }
  return null
}
