// ============================================================
// Logistic regression (pure TS, deterministic) สำหรับ meta-labeling
// - fitLogistic  : full-batch gradient descent + L2, standardize ภายใน
// - predictProba : p(win | x)
// - auc          : Mann-Whitney U (rank-based)
// ============================================================

export interface LogisticModel {
  w: number[]
  b: number
  mu: number[] // ค่าเฉลี่ยต่อคอลัมน์ (จาก train)
  sd: number[] // ส่วนเบี่ยงเบนต่อคอลัมน์ (จาก train)
}

export interface FitOptions {
  epochs?: number // default 300
  lr?: number // default 0.15
  l2?: number // default 1e-4
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z))
  const ez = Math.exp(z)
  return ez / (1 + ez)
}

export function fitLogistic(X: number[][], y: number[], opts: FitOptions = {}): LogisticModel {
  const epochs = opts.epochs ?? 300
  const lr = opts.lr ?? 0.15
  const l2 = opts.l2 ?? 1e-4
  const n = X.length
  const f = n > 0 ? X[0].length : 0

  // standardize
  const mu = new Array<number>(f).fill(0)
  const sd = new Array<number>(f).fill(1)
  for (let j = 0; j < f; j++) {
    let s = 0
    for (let i = 0; i < n; i++) s += X[i][j]
    mu[j] = n > 0 ? s / n : 0
    let v = 0
    for (let i = 0; i < n; i++) v += (X[i][j] - mu[j]) ** 2
    sd[j] = Math.sqrt(n > 0 ? v / n : 0) + 1e-9
  }
  const Z: number[][] = X.map((row) => row.map((v, j) => (v - mu[j]) / sd[j]))

  const w = new Array<number>(f).fill(0)
  let b = 0
  for (let ep = 0; ep < epochs; ep++) {
    const gw = new Array<number>(f).fill(0)
    let gb = 0
    for (let i = 0; i < n; i++) {
      let z = b
      const row = Z[i]
      for (let j = 0; j < f; j++) z += w[j] * row[j]
      const err = sigmoid(z) - y[i]
      for (let j = 0; j < f; j++) gw[j] += err * row[j]
      gb += err
    }
    for (let j = 0; j < f; j++) w[j] -= lr * (gw[j] / n + l2 * w[j])
    b -= lr * (gb / n)
  }
  return { w, b, mu, sd }
}

export function predictProba(m: LogisticModel, x: number[]): number {
  let z = m.b
  for (let j = 0; j < m.w.length; j++) z += m.w[j] * ((x[j] - m.mu[j]) / m.sd[j])
  return sigmoid(z)
}

export function auc(y: number[], p: number[]): number {
  const n = y.length
  let nPos = 0
  let nNeg = 0
  for (let i = 0; i < n; i++) {
    if (y[i] === 1) nPos++
    else nNeg++
  }
  if (nPos === 0 || nNeg === 0) return 0.5
  // rank แบบเฉลี่ย tie
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[a] - p[b])
  const rank = new Array<number>(n)
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && p[idx[j + 1]] === p[idx[i]]) j++
    const avgRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) rank[idx[k]] = avgRank
    i = j + 1
  }
  let sumPos = 0
  for (let r = 0; r < n; r++) if (y[r] === 1) sumPos += rank[r]
  const u = sumPos - (nPos * (nPos + 1)) / 2
  return u / (nPos * nNeg)
}

// deterministic RNG (mulberry32) สำหรับ bootstrap / subsampling
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
