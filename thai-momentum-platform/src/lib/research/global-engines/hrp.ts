// HRP + Ledoit-Wolf — López de Prado (2016) "Building Diversified Portfolios
// that Outperform Out-of-Sample", Journal of Risk 18(4); covariance ผ่าน
// Ledoit & Wolf (2004) "A well-conditioned estimator...", JMVA 70.
// ขั้นตอน: ผลตอบแทน 120 วันของ top-30 โมเมนตัมวันล่าสุด → LW shrinkage
// → correlation → distance → single-linkage tree → quasi-diag → recursive
// bisection แบบ inverse-variance → น้ำหนักที่ไม่ต้อง invert covariance เลย

import type { ThaiPivots } from "@/lib/research/thai-fit"
import { mean } from "./helpers"
import type { EngineEval, EngineStats } from "./types"

const WIN = 120 // หน้าต่าง covariance
const TOP_N = 30
const MIN_OBS = 60

// ---------- Ledoit-Wolf shrinkage (เป้าหมาย: μI diagonal) ----------
function ledoitWolf(X: number[][]): { cov: number[][]; delta: number } {
  const T = X.length
  const N = X[0]?.length ?? 0
  if (T < 10 || N < 3) return { cov: sampleCov(X), delta: 0 }
  const means = Array.from({ length: N }, (_, j) => mean(X.map((r) => r[j] ?? 0)))
  const Y = X.map((r) => r.map((v, j) => v - (means[j] ?? 0)))
  const S = sampleCovFromCentered(Y, T)
  const mu = trace(S) / N
  // d² = ||S − μI||²_F / N
  let d2 = 0
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const target = i === j ? mu : 0
      const diff = (S[i]?.[j] ?? 0) - target
      d2 += diff * diff
    }
  }
  d2 /= N
  // b̄² = (1/T²) Σ_t ||y_t y_t' − S||²_F / N
  let b2 = 0
  for (const row of Y) {
    let acc = 0
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const yiyj = (row[i] ?? 0) * (row[j] ?? 0)
        const diff = yiyj - (S[i]?.[j] ?? 0)
        acc += diff * diff
      }
    }
    b2 += acc / N
  }
  b2 /= T * T
  const delta = Math.min(1, Math.max(0, b2 / (d2 || 1e-12)))
  const cov = S.map((r, i) => r.map((v, j) => delta * (i === j ? mu : 0) + (1 - delta) * v))
  return { cov, delta }
}

function trace(S: number[][]): number {
  let s = 0
  for (let i = 0; i < S.length; i++) s += S[i]?.[i] ?? 0
  return s
}

function sampleCov(X: number[][]): number[][] {
  const T = X.length
  const N = X[0]?.length ?? 0
  const means = Array.from({ length: N }, (_, j) => mean(X.map((r) => r[j] ?? 0)))
  const Y = X.map((r) => r.map((v, j) => v - (means[j] ?? 0)))
  return sampleCovFromCentered(Y, T)
}

function sampleCovFromCentered(Y: number[][], T: number): number[][] {
  const N = Y[0]?.length ?? 0
  const S: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  for (const row of Y) {
    for (let i = 0; i < N; i++) {
      const yi = row[i] ?? 0
      for (let j = i; j < N; j++) {
        const v = yi * (row[j] ?? 0)
        const s = S[i]
        if (s) s[j] = (s[j] ?? 0) + v
        if (i !== j) {
          const sj = S[j]
          if (sj) sj[i] = (sj[i] ?? 0) + v
        }
      }
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const s = S[i]
      if (s) s[j] = (s[j] ?? 0) / Math.max(T - 1, 1)
    }
  }
  return S
}

// ---------- HRP (single-linkage + quasi-diag + recursive bisection) ----------
type Linkage = [number, number, number][] // [idLeft, idRight, dist] — id เสถียรตลอด

function corrFromCov(C: number[][]): number[][] {
  const N = C.length
  const R: number[][] = Array.from({ length: N }, () => new Array(N).fill(1))
  for (let i = 0; i < N; i++) {
    const vi = Math.sqrt(Math.max(C[i]?.[i] ?? 0, 1e-18))
    for (let j = i + 1; j < N; j++) {
      const vj = Math.sqrt(Math.max(C[j]?.[j] ?? 0, 1e-18))
      const rho = (C[i]?.[j] ?? 0) / (vi * vj)
      const rc = Math.max(-1, Math.min(1, rho))
      const ri = R[i]
      const rj = R[j]
      if (ri) ri[j] = rc
      if (rj) rj[i] = rc
    }
  }
  return R
}

function distMatrix(R: number[][]): number[][] {
  return R.map((r, i) => r.map((v, j) => (i === j ? 0 : Math.sqrt(Math.max(0.5 * (1 - (v ?? 0)), 1e-12)))))
}

/** single linkage ด้วย stable cluster ids: leaf = 0..N−1, merge ใหม่ = N, N+1, … */
function singleLinkage(D: number[][]): Linkage {
  const N = D.length
  const members = new Map<number, number[]>()
  for (let i = 0; i < N; i++) members.set(i, [i])
  let nextId = N
  const link: Linkage = []
  for (let m = 0; m < N - 1; m++) {
    const ids = [...members.keys()]
    let bi = -1
    let bj = -1
    let bd = Infinity
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const ca = members.get(ids[a] ?? -1) ?? []
        const cb = members.get(ids[b] ?? -1) ?? []
        let d = Infinity
        for (const ia of ca) {
          for (const ib of cb) {
            const v = D[ia]?.[ib] ?? Infinity
            if (v < d) d = v
          }
        }
        if (d < bd) {
          bd = d
          bi = ids[a] ?? -1
          bj = ids[b] ?? -1
        }
      }
    }
    if (bi < 0 || bj < 0) break
    const merged = [...(members.get(bi) ?? []), ...(members.get(bj) ?? [])].sort((x, y) => x - y)
    members.delete(bi)
    members.delete(bj)
    const id = nextId++
    members.set(id, merged)
    link.push([bi, bj, bd])
  }
  return link
}

/** quasi-diagonal ordering: เดินจาก root ของ linkage แล้วขยาย leaf ตามลำดับการ merge */
function quasiDiag(link: Linkage, N: number): number[] {
  if (link.length === 0) return Array.from({ length: N }, (_, i) => i)
  const merges = new Map<number, number[]>()
  let rootId = 0
  link.forEach(([i, j], idx) => {
    const left = i < N ? [i] : (merges.get(i) ?? [i])
    const right = j < N ? [j] : (merges.get(j) ?? [j])
    rootId = N + idx
    merges.set(rootId, [...left, ...right])
  })
  const expand = (id: number): number[] => {
    if (id < N) return [id]
    return (merges.get(id) ?? []).flatMap((x) => expand(x))
  }
  return expand(rootId)
}

function clusterVar(C: number[][], ids: number[]): number {
  // inverse-variance portfolio variance (LdP)
  let wSum = 0
  const iv = ids.map((i) => {
    const v = Math.max(C[i]?.[i] ?? 1e-9, 1e-9)
    wSum += 1 / v
    return 1 / v
  })
  const w = iv.map((v) => v / (wSum || 1))
  let out = 0
  for (let a = 0; a < ids.length; a++) {
    for (let b = 0; b < ids.length; b++) {
      out += (w[a] ?? 0) * (w[b] ?? 0) * (C[ids[a] ?? 0]?.[ids[b] ?? 0] ?? 0)
    }
  }
  return out
}

function recursiveBisect(C: number[][], order: number[]): number[] {
  // ตาม LdP: เริ่ม w=1 ทุกตัวใน ordering แล้วคูณ alpha ลงไปตามการแบ่งครึ่งซ้ำ
  const w = new Array(C.length).fill(0)
  for (const i of order) w[i] = 1
  const stack: number[][] = [order]
  while (stack.length) {
    const ids = stack.pop() ?? []
    if (ids.length <= 1) continue // ใบ — คงน้ำหนักที่สะสมไว้
    const half = Math.floor(ids.length / 2)
    const left = ids.slice(0, half)
    const right = ids.slice(half)
    const vl = clusterVar(C, left)
    const vr = clusterVar(C, right)
    const total = vl + vr || 1e-12
    const alpha = 1 - vl / total
    for (const i of left) w[i] = (w[i] ?? 0) * alpha
    for (const i of right) w[i] = (w[i] ?? 0) * (1 - alpha)
    stack.push(left, right)
  }
  return w
}

export function evalHrp(piv: ThaiPivots): EngineEval {
  const nD = piv.dates.length
  const iLast = nD - 1
  // จัด top-N ด้วย ret20 ณ วันล่าสุด
  const cur = piv.close[iLast]
  const base = iLast >= 20 ? piv.close[iLast - 20] : null
  if (!cur || !base) {
    return infoFail("ข้อมูลวันล่าสุดไม่พอ")
  }
  const cands: { j: number; m: number }[] = []
  for (let j = 0; j < piv.nSym; j++) {
    const c0 = cur[j]
    const cb = base[j]
    if (c0 === undefined || cb === undefined || cb <= 1e-9 || !piv.liq[iLast][j]) continue
    cands.push({ j, m: c0 / cb - 1 })
  }
  if (cands.length < 10) return infoFail("หุ้น liquid ไม่ถึง 10 ตัว")
  cands.sort((a, b) => b.m - a.m)
  const sel = cands.slice(0, TOP_N)
  const syms = sel.map((c) => piv.symbols[c.j] ?? "?")

  // ผลตอบแทน 120 วัน (เฉพาะวันที่ทุกตัวมีค่า — ใช้ intersection)
  const rows: number[][] = []
  for (let i = nD - WIN; i < iLast; i++) {
    if (i < 1) continue
    const row: number[] = []
    let ok = true
    for (const c of sel) {
      const cp = piv.close[i]?.[c.j]
      const cc = piv.close[i + 1]?.[c.j]
      if (cp === undefined || cc === undefined) {
        ok = false
        break
      }
      row.push(cc / cp - 1)
    }
    if (ok && row.length === sel.length) rows.push(row)
  }
  if (rows.length < MIN_OBS) return infoFail(`วันที่ครบชุดมีเพียง ${rows.length} วัน (<${MIN_OBS})`)

  const { cov, delta } = ledoitWolf(rows)
  const R = corrFromCov(cov)
  const R0 = corrFromCov(sampleCov(rows)) // corr ดิบก่อน shrink — ใช้รายงาน avgCorr ให้เห็นภาพจริง
  const D = distMatrix(R)
  const link = singleLinkage(D)
  const order = quasiDiag(link, sel.length)
  const w = recursiveBisect(cov, order)

  // สถิติ
  let eff = 0
  let wSum = 0
  let topW = 0
  for (const x of w) {
    eff += x * x
    wSum += x
    if (x > topW) topW = x
  }
  const effN = eff > 0 ? 1 / eff : 0
  let corrSum = 0
  let corrN = 0
  for (let i = 0; i < sel.length; i++) {
    for (let j = i + 1; j < sel.length; j++) {
      corrSum += R0[i]?.[j] ?? 0
      corrN++
    }
  }

  const top10 = order
    .map((i) => ({ sym: syms[i] ?? "?", w: w[i] ?? 0 }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 10)

  const stats: EngineStats = {
    nAssets: sel.length,
    obsDays: rows.length,
    shrinkDelta: Math.round(delta * 1000) / 10,
    effectiveN: Math.round(effN * 10) / 10,
    topWeight: Math.round(topW * 1000) / 10,
    avgCorr: corrN > 0 ? Math.round((corrSum / corrN) * 1000) / 10 : 0,
    topSymbols: top10.map((t) => `${t.sym} ${(t.w * 100).toFixed(1)}%`).join(", "),
  }

  return {
    id: "hrp",
    name: "HRP Sizing + Ledoit-Wolf",
    source: {
      authors: "López de Prado (2016); Ledoit & Wolf (2004)",
      year: 2016,
      title: "Building Diversified Portfolios that Outperform Out-of-Sample",
      venue: "Journal of Risk 18(4) · covariance shrinkage JMVA 70",
    },
    thesis:
      "จัดน้ำหนักด้วยโครงสร้าง cluster ของ correlation (ไม่ invert covariance จึงไม่พังเมื่อ N≈T) และใช้ covariance แบบ shrinkage ให้เสถียร — เครื่องขนาดไม้ที่พร้อมต่อยอดจาก P(win)",
    verdict: "INFO",
    verdictWhy: `คำนวณสำเร็จบน ${syms.length} ตัว × ${rows.length} วัน (shrinkage ${(delta * 100).toFixed(0)}%, effective-N ${effN.toFixed(1)}) — INFO: ขนาดไม้ไม่ตัดสินผ่าน/ตกด้วย IC`,
    stats,
    integration: {
      target: "portfolio + alloc.ts",
      how: "นำน้ำหนัก HRP ไปคูณกับ signal score ต่อตัวแทนการเท่ากัน — เริ่มจาก shadow เท่านั้นตามกติกาเดิม",
    },
    spark: { label: "Top-10 weight %", values: top10.map((t) => Math.round(t.w * 1000) / 10) },
  }

  function infoFail(reason: string): EngineEval {
    return {
      id: "hrp",
      name: "HRP Sizing + Ledoit-Wolf",
      source: { authors: "López de Prado (2016); Ledoit & Wolf (2004)", year: 2016, title: "HRP", venue: "Journal of Risk 18(4)" },
      thesis: "—",
      verdict: "INFO",
      verdictWhy: `คำนวณไม่ได้: ${reason}`,
      stats: { nAssets: 0 },
      integration: { target: "portfolio", how: "—" },
    }
  }
}
