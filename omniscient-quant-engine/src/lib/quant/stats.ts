/**
 * stats.ts — คลังเครื่องมือทางสถิติสำหรับ Omniscient Quant Engine
 * (MWU, BH-FDR, Cohen's d, Hypergeometric, Kendall tau, PCA-Jacobi, PSI, KDE)
 * Pure TypeScript — no external dependency, deterministic.
 */

// ───────────────────────── Descriptive ─────────────────────────

export const mean = (a: ArrayLike<number>): number => {
  if (a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
};

export const variance = (a: ArrayLike<number>, ddof = 1): number => {
  const n = a.length;
  if (n <= ddof) return 0;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - m) ** 2;
  return s / (n - ddof);
};

export const std = (a: ArrayLike<number>, ddof = 1): number =>
  Math.sqrt(variance(a, ddof));

export function quantile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((x, y) => x - y);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export const median = (a: number[]): number => quantile(a, 0.5);

export function sum(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** OLS slope of y on x (single regressor) */
export function linregSlope(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ───────────────────────── Normal distribution ─────────────────────────

/** Abramowitz & Stegun 7.1.26 erf approximation |eps| < 1.5e-7 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

/** Survival function with asymptotic continuation สำหรับ |z| ใหญ่ (กัน p ปัดเป็น 0) */
export function normalSf(z: number): number {
  const x = z / Math.SQRT2;
  if (x < -6) {
    // deep left tail → sf ≈ 1
    const t = 1 / (2 * x * x);
    return Math.min(1, Math.exp(-x * x) / (-x * Math.sqrt(Math.PI)) * (1 - t));
  }
  if (x > 6) {
    // deep right tail → asymptotic erfc
    const t = 1 / (2 * x * x);
    return Math.max(0, (Math.exp(-x * x) / (x * Math.sqrt(Math.PI))) * (1 - t));
  }
  return 1 - normalCdf(z);
}

/** Two-sided p-value for a z statistic */
export const normalTwoSideP = (z: number): number => 2 * normalSf(Math.abs(z));

// ───────────────────────── Mann–Whitney U ─────────────────────────

export interface MWUResult {
  u: number;
  z: number;
  p: number;
}

/**
 * Mann–Whitney U with normal approximation + tie correction.
 * Tests whether sample `a` tends to be greater than sample `b`.
 */
export function mannWhitneyU(a: number[], b: number[], alternative: 'greater' | 'two-sided' | 'less' = 'two-sided'): MWUResult {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return { u: 0.5, z: 0, p: 1 };
  const all = [
    ...a.map((v) => ({ v, g: 0 })),
    ...b.map((v) => ({ v, g: 1 })),
  ].sort((x, y) => x.v - y.v);

  const ranks = new Array<number>(all.length);
  let i = 0;
  let tieTerm = 0;
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    const t = j - i + 1;
    if (t > 1) tieTerm += t ** 3 - t;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }

  let R1 = 0;
  for (let k = 0; k < all.length; k++) if (all[k].g === 0) R1 += ranks[k];
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const muU = (n1 * n2) / 2;
  const N = n1 + n2;
  const sdU = Math.sqrt(
    Math.max(1e-12, ((n1 * n2) / 12) * ((N + 1) - tieTerm / (N * (N - 1)))),
  );
  const z = (U1 - muU) / sdU;
  const p =
    alternative === 'greater'
      ? normalSf(z)
      : alternative === 'less'
        ? normalCdf(z)
        : normalTwoSideP(z);
  return { u: U1, z, p: Math.min(1, Math.max(p, 0)) };
}

// ───────────────────────── Multiple testing ─────────────────────────

/** Benjamini–Hochberg FDR correction. Returns q-values aligned to input order. */
export function bhFdr(pvals: number[]): number[] {
  const n = pvals.length;
  if (n === 0) return [];
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(n).fill(1);
  let prev = 1;
  for (let k = n; k >= 1; k--) {
    const { p, i } = order[k - 1];
    const val = Math.min(prev, (p * n) / k);
    q[i] = Math.min(1, Math.max(val, 0));
    prev = q[i];
  }
  return q;
}

// ───────────────────────── Effect size ─────────────────────────

/** Cohen's d: (mean_b − mean_a) / pooled SD */
export function cohensD(a: number[], b: number[]): number {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return 0;
  const pooled = Math.sqrt(((n1 - 1) * variance(a) + (n2 - 1) * variance(b)) / (n1 + n2 - 2));
  if (pooled === 0) return 0;
  return (mean(b) - mean(a)) / pooled;
}

// ───────────────────────── Hypergeometric (enrichment) ─────────────────────────

const LG_COF = [
  76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
];

function logGamma(x: number): number {
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += LG_COF[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

export function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * P(X ≥ k) where X ~ Hypergeometric(N population, K successes, n draws).
 * One-sided over-representation test (พฤติกรรมเดียวกับ scipy.stats.hypergeom.sf).
 */
export function hypergeomSf(k: number, N: number, K: number, n: number): number {
  if (k <= 0) return 1;
  const lo = Math.max(k, n + K - N, 0);
  const hi = Math.min(K, n);
  if (lo > hi) return 0;
  const lps: number[] = [];
  for (let i = lo; i <= hi; i++) {
    lps.push(logChoose(K, i) + logChoose(N - K, n - i) - logChoose(N, n));
  }
  const mx = Math.max(...lps);
  let s = 0;
  for (const lp of lps) s += Math.exp(lp - mx);
  return Math.min(1, s * Math.exp(mx));
}

// ───────────────────────── Kendall tau-b ─────────────────────────

export function kendallTau(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let conc = 0;
  let disc = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s1 = Math.sign(x[i] - x[j]);
      const s2 = Math.sign(y[i] - y[j]);
      const s = s1 * s2;
      if (s > 0) conc++;
      else if (s < 0) disc++;
    }
  }
  const denom = (n * (n - 1)) / 2;
  return denom === 0 ? 0 : (conc - disc) / denom;
}

/** Clayton copula theta from Kendall tau: τ = θ/(θ+2) → θ = 2τ/(1−τ) */
export function claytonThetaFromTau(tau: number, min = 0.02, max = 20): number {
  const t = Math.min(Math.max(tau, 0.02), 0.95);
  const theta = (2 * t) / (1 - t);
  return Math.min(Math.max(theta, min), max);
}

// ───────────────────────── PCA (Jacobi eigen decomposition) ─────────────────────────

export interface PcaResult {
  scores: number[][]; // n × nComp
  loadings: number[][]; // nComp × p (rows = components)
  explained: number[]; // ratio of variance explained (length nComp)
  eigenvalues: number[];
  means: number[];
  sds: number[];
}

function jacobiEigen(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = a.map((row, i) => row[i]);
  return { values, vectors: v };
}

/** PCA on raw matrix (standardized internally). Rows = observations, cols = variables. */
export function pca(X: number[][], nComp: number): PcaResult {
  const n = X.length;
  const p = X[0].length;
  const means = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j])));
  const sds = Array.from({ length: p }, (_, j) =>
    Math.max(1e-9, std(X.map((r) => r[j]))),
  );
  const Z = X.map((r) => r.map((v, j) => (v - means[j]) / sds[j]));
  // covariance (≈ correlation because standardized)
  const C: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += Z[k][i] * Z[k][j];
      C[i][j] = s / (n - 1);
      C[j][i] = C[i][j];
    }
  }
  const { values, vectors } = jacobiEigen(C);
  const order = values
    .map((val, i) => ({ val, i }))
    .sort((a, b) => b.val - a.val)
    .slice(0, nComp);
  const totalVar = values.reduce((s, val) => s + Math.max(val, 0), 0) || 1;
  const loadings = order.map(({ i }) =>
    Array.from({ length: p }, (_, j) => vectors[j][i]),
  );
  const scores = Z.map((row) =>
    loadings.map((l) => row.reduce((s, v, j) => s + v * l[j], 0)),
  );
  return {
    scores,
    loadings,
    explained: order.map(({ val }) => Math.max(val, 0) / totalVar),
    eigenvalues: order.map(({ val }) => val),
    means,
    sds,
  };
}

// ───────────────────────── Drift: PSI ─────────────────────────

/** Population Stability Index between expected & actual distributions (>0.2 = heavy drift) */
export function psi(expected: number[], actual: number[], bins = 10): number {
  if (expected.length < 10 || actual.length < 5) return 0;
  const edges = Array.from({ length: bins + 1 }, (_, i) => quantile(expected, i / bins));
  edges[0] = -Infinity;
  edges[bins] = Infinity;
  const eCounts = new Array(bins).fill(0);
  const aCounts = new Array(bins).fill(0);
  for (const v of expected) {
    let b = 0;
    while (b < bins - 1 && v > edges[b + 1]) b++;
    eCounts[b]++;
  }
  for (const v of actual) {
    let b = 0;
    while (b < bins - 1 && v > edges[b + 1]) b++;
    aCounts[b]++;
  }
  let val = 0;
  for (let b = 0; b < bins; b++) {
    const e = eCounts[b] / expected.length + 1e-6;
    const a = aCounts[b] / actual.length + 1e-6;
    val += (a - e) * Math.log(a / e);
  }
  return Math.max(0, val);
}

// ───────────────────────── 1-D KDE (price density zones) ─────────────────────────

export interface KdeCurve {
  xs: number[];
  ys: number[];
  bandwidth: number;
}

/** Gaussian KDE with Silverman bandwidth */
export function kde1d(data: number[], points = 80): KdeCurve {
  const n = data.length;
  if (n < 5) return { xs: [], ys: [], bandwidth: 0 };
  const sd = std(data);
  const q75 = quantile(data, 0.75);
  const q25 = quantile(data, 0.25);
  const iqr = q75 - q25;
  const sigma = Math.min(sd, iqr > 0 ? iqr / 1.349 : sd) || 1e-6;
  const bandwidth = 0.9 * sigma * Math.pow(n, -1 / 5);
  const lo = Math.min(...data) - 2.5 * bandwidth;
  const hi = Math.max(...data) + 2.5 * bandwidth;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points; i++) {
    const x = lo + ((hi - lo) * i) / (points - 1);
    let s = 0;
    for (const d of data) {
      const u = (x - d) / bandwidth;
      s += Math.exp(-0.5 * u * u);
    }
    xs.push(x);
    ys.push(s / (n * bandwidth * Math.sqrt(2 * Math.PI)));
  }
  return { xs, ys, bandwidth };
}

// ───────────────────────── Misc ─────────────────────────

export function zscoreSeries(x: number[], window: number): number[] {
  const out = new Array<number>(x.length).fill(0);
  for (let i = 0; i < x.length; i++) {
    const lo = Math.max(0, i - window + 1);
    const w = x.slice(lo, i + 1);
    if (w.length < 10) {
      out[i] = 0;
      continue;
    }
    const m = mean(w);
    const s = std(w) || 1e-9;
    out[i] = (x[i] - m) / s;
  }
  return out;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

export const logistic = (z: number): number => 1 / (1 + Math.exp(-z));

// ───────────────────────── Confidence intervals ─────────────────────────

/** Wilson score interval ของสัดส่วน k/n (z=1.96 → 95%) — ใช้กับ hit rate / P(win) ที่ n เล็ก */
export function wilsonInterval(k: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * Bootstrap percentile CI ของสถิติใด ๆ จากตัวอย่าง (seed ตายตัว → deterministic)
 * rand = generator ใน [0,1) เช่น mulberry32(seed) — ส่งเข้ามาเพื่อไม่ผูกโมดูลนี้กับ rng
 */
export function bootstrapInterval<T>(
  sample: T[],
  stat: (xs: T[]) => number,
  rand: () => number,
  reps = 400,
  alpha = 0.05,
): { lo: number; hi: number } {
  const n = sample.length;
  if (n === 0) return { lo: 0, hi: 0 };
  const stats: number[] = new Array(reps);
  const draw: T[] = new Array(n);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < n; i++) draw[i] = sample[Math.floor(rand() * n)];
    stats[r] = stat(draw);
  }
  const finite = stats.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return { lo: 0, hi: 0 };
  return { lo: quantile(finite, alpha / 2), hi: quantile(finite, 1 - alpha / 2) };
}
