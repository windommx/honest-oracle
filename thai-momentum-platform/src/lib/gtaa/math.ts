// คณิตศาสตร์แกนของ GTAA — SMA / k-month return / momentum score / สถิติ
// ทุกฟังก์ชัน pure + closed-form ตรวจสอบได้ (มี self-test จับคู่ใน selftest.ts)

/** SMA ความยาว n ปิดที่ index t (รวมเดือนปัจจุบัน) — ต้องมีข้อมูลครบ ไม่งั้น null */
export function smaAt(closes: (number | null)[], t: number, n: number): number | null {
  if (t < n - 1) return null
  let sum = 0
  for (let i = t - n + 1; i <= t; i++) {
    const c = closes[i]
    if (c === null || c === undefined || !Number.isFinite(c) || c <= 0) return null
    sum += c
  }
  return sum / n
}

/** ผลตอบแทน K เดือน ปิดที่ index t โดยเลือก skip s เดือนล่าสุดทิ้ง (12-1 = K:12, s:1)
 * นิยาม: c[t-s] / c[t-s-K] - 1 */
export function retK(
  closes: (number | null)[],
  t: number,
  k: number,
  skip = 0,
): number | null {
  const end = t - skip
  const start = end - k
  if (start < 0) return null
  const ce = closes[end]
  const cs = closes[start]
  if (ce === null || cs === null || !Number.isFinite(ce) || !Number.isFinite(cs) || cs <= 0) {
    return null
  }
  return ce / cs - 1
}

/** Momentum score = ค่าเฉลี่ยผลตอบแทน 1/3/6/12 เดือน (null ถ้าข้อมูลไม่ครบ) */
export function momentumScore(
  closes: (number | null)[],
  t: number,
  skip = 0,
): { score: number; r1: number; r3: number; r6: number; r12: number } | null {
  const r1 = retK(closes, t, 1, skip)
  const r3 = retK(closes, t, 3, skip)
  const r6 = retK(closes, t, 6, skip)
  const r12 = retK(closes, t, 12, skip)
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null
  return { score: (r1 + r3 + r6 + r12) / 4, r1, r3, r6, r12 }
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)
  return Math.sqrt(v)
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))
  return s[idx]
}

/** mulberry32 — PRNG deterministic ต่อ seed (ใช้ทั้ง synthetic panel และ Monte Carlo) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller gaussian มาตรฐาน สร้างจาก uniform PRNG */
export function gaussianFrom(rng: () => number): () => number {
  let cache: number | null = null
  return () => {
    if (cache !== null) {
      const v = cache
      cache = null
      return v
    }
    let u = 0
    let v = 0
    while (u === 0) u = rng()
    while (v === 0) v = rng()
    const r = Math.sqrt(-2 * Math.log(u))
    const th = 2 * Math.PI * v
    cache = r * Math.sin(th)
    return r * Math.cos(th)
  }
}
