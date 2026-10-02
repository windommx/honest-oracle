// ============================================================
// สถิติของห้องทดลองอัตราชนะ (pure · deterministic)
// หางทวินามแบบแม่นตรง · ขนาดตัวอย่างของการทดสอบสัดส่วนทางเดียว
// ค่าเฉลี่ยแบบ cluster-robust (กลุ่ม = สัปดาห์) — สัญญาณในสัปดาห์เดียวกันมักไปทางเดียวกัน จึงนับเป็นหลักฐานอิสระเต็มจำนวนไม่ได้
// ใช้สูตรวิเคราะห์ (ไม่ใช่ bootstrap) เพราะ p ต้องละเอียดพอสำหรับการปรับการทดสอบหลายร้อยแบบ
// ============================================================

import { mean, variance } from '@/lib/quant/stats';

/** P(X ≥ k) ของ Binomial(n, p) แบบแม่นตรง (รวมเทอมในสเกล log) */
export function binomTailGE(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const lp = Math.log(p);
  const lq = Math.log(1 - p);
  let lc = 0;
  for (let i = 1; i <= k; i++) lc += Math.log((n - i + 1) / i);
  let sum = 0;
  for (let i = k; i <= n; i++) {
    sum += Math.exp(lc + i * lp + (n - i) * lq);
    if (i < n) lc += Math.log((n - i) / (i + 1));
  }
  return Math.min(1, sum);
}

/** ควอนไทล์ของ normal มาตรฐาน (Acklam · ความคลาดเคลื่อน < 1e-9) */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * จำนวนไม้ (สมมติอิสระกัน) ที่ต้องใช้พิสูจน์ว่าอัตราชนะจริง = p1 สูงกว่า p0 (ทดสอบทางเดียวที่ α, กำลัง power)
 * null = p1 ไม่สูงกว่า p0 (เป้านั้นไม่ต่างจากการสุ่ม จึงพิสูจน์ว่า "เก่ง" ไม่ได้)
 */
export function sampleSize(p0: number, p1: number, alpha = 0.05, power = 0.8): number | null {
  if (!(p1 > p0) || !(p0 > 0) || !(p1 < 1)) return null;
  const za = normInv(1 - alpha);
  const zb = normInv(power);
  return Math.ceil(((za * Math.sqrt(p0 * (1 - p0)) + zb * Math.sqrt(p1 * (1 - p1))) / (p1 - p0)) ** 2);
}

// ─────────────────────────── Student-t ───────────────────────────

/** ln Γ(x) (Lanczos g = 7) */
function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** continued fraction ของ incomplete beta (Lentz) */
function betaCf(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** regularized incomplete beta I_x(a, b) */
export function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaCf(a, b, x)) / a : 1 - (front * betaCf(b, a, 1 - x)) / b;
}

/** P(T > t) ของ Student-t ที่ df องศาอิสระ */
export function tSf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 0 : 1;
  const tail = 0.5 * betaInc(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? tail : 1 - tail;
}

const tInvCache = new Map<string, number>();

/** ควอนไทล์ของ Student-t (แบ่งครึ่งบน tSf · cache ต่อ p/df) */
export function tInv(p: number, df: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const key = `${p}|${df}`;
  const hit = tInvCache.get(key);
  if (hit !== undefined) return hit;
  let lo = -1e4;
  let hi = 1e4;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (1 - tSf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  const v = (lo + hi) / 2;
  tInvCache.set(key, v);
  return v;
}

// ─────────────────────────── ค่าเฉลี่ยแบบ cluster-robust ───────────────────────────

export interface ClusterMean {
  mean: number;
  se: number;
  /** CI 95% (t, df = จำนวนกลุ่ม − 1) */
  lo: number;
  hi: number;
  /** p ทางเดียวของสมมติฐาน "ค่าเฉลี่ย > 0" */
  p: number;
  /** design effect = ความแปรปรวนจริง (คิดการกระจุกตัว) ÷ ความแปรปรวนถ้าทุกไม้อิสระกัน · ขั้นต่ำ 1 (ไม่ประเมินหลักฐานเกินจริง) */
  deff: number;
  clusters: number;
}

/**
 * ค่าเฉลี่ย + standard error แบบ cluster-robust (CR1): Var = G/(G−1) · Σ_g (Σ_{i∈g} (x_i − x̄))² / n²
 * null = ไม้น้อยกว่า 3 หรือกลุ่มน้อยกว่า 3 (ประมาณความแปรปรวนไม่ได้)
 */
export function clusterMean(values: number[], clusters: string[]): ClusterMean | null {
  const n = values.length;
  if (n < 3) return null;
  const m = mean(values);
  const resid = new Map<string, number>();
  values.forEach((v, i) => resid.set(clusters[i], (resid.get(clusters[i]) ?? 0) + (v - m)));
  const G = resid.size;
  if (G < 3) return null;
  let ss = 0;
  for (const s of resid.values()) ss += s * s;
  const varCr = ((G / (G - 1)) * ss) / (n * n);
  const varIid = variance(values) / n;
  const se = Math.sqrt(varCr);
  const df = G - 1;
  const tc = tInv(0.975, df);
  return {
    mean: m,
    se,
    lo: m - tc * se,
    hi: m + tc * se,
    p: se > 0 ? tSf(m / se, df) : m > 0 ? 0 : 1,
    deff: varIid > 0 ? Math.max(1, varCr / varIid) : 1,
    clusters: G,
  };
}
