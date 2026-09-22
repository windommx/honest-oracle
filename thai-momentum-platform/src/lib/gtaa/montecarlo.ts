// Monte Carlo — 2 วิธีเสริมกัน:
// 1) block bootstrap บนผลตอบแทนจริงของกลยุทธ์ (บล็อก 6 เดือน เก็บ autocorrelation)
// 2) synthetic seeds — สร้างจักรวาลใหม่ทั้งชุดต่อ seed แล้วรับ backtest (deterministic ต่อ seed set)

import { runBacktest } from "./backtest"
import { mulberry32, percentile } from "./math"
import { makeSyntheticPanel } from "./synthetic"
import { DEFAULT_GTAA_CONFIG } from "./types"
import type { GtaaConfig, MonteCarloResult, Percentiles } from "./types"

function drawStats(returns: number[]): { cagr: number; maxDD: number; sharpe: number } {
  let eq = 1
  let peak = 1
  let maxDD = 0
  for (const r of returns) {
    eq *= 1 + r
    if (eq > peak) peak = eq
    const dd = eq / peak - 1
    if (dd < maxDD) maxDD = dd
  }
  const years = returns.length / 12
  const cagr = eq > 0 ? Math.pow(eq, 1 / years) - 1 : -1
  let m = 0
  for (const r of returns) m += r
  m /= returns.length
  let v = 0
  for (const r of returns) v += (r - m) * (r - m)
  v = Math.sqrt(v / Math.max(1, returns.length - 1)) * Math.sqrt(12)
  const sharpe = v > 1e-9 ? cagr / v : 0
  return { cagr, maxDD, sharpe }
}

function pct(cagrList: number[], ddList: number[], sharpeList: number[]): {
  cagr: Percentiles
  maxDD: Percentiles
  sharpe: Percentiles
} {
  return {
    cagr: { p5: percentile(cagrList, 5), p50: percentile(cagrList, 50), p95: percentile(cagrList, 95) },
    maxDD: { p5: percentile(ddList, 5), p50: percentile(ddList, 50), p95: percentile(ddList, 95) },
    sharpe: { p5: percentile(sharpeList, 5), p50: percentile(sharpeList, 50), p95: percentile(sharpeList, 95) },
  }
}

function histogramOf(values: number[], buckets = 14): { bucket: string; count: number }[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max - min < 1e-12) return [{ bucket: `${(min * 100).toFixed(1)}%`, count: values.length }]
  const w = (max - min) / buckets
  const counts = new Array(buckets).fill(0)
  for (const v of values) {
    const idx = Math.min(buckets - 1, Math.floor((v - min) / w))
    counts[idx]++
  }
  return counts.map((count, i) => ({
    bucket: `${((min + i * w) * 100).toFixed(1)}%`,
    count,
  }))
}

/** block bootstrap — สุ่มบล็อก 6 เดือนจากผลจริง มาประกอบซีรีส์ใหม่ยาวเท่าเดิม */
export function blockBootstrap(returns: number[], draws = 500, blockSize = 6, seed = 20240101): MonteCarloResult {
  const rng = mulberry32(seed)
  const cagrList: number[] = []
  const ddList: number[] = []
  const sharpeList: number[] = []
  const n = returns.length
  if (n < 24 || draws < 1) {
    const s = drawStats(returns)
    return {
      method: "block-bootstrap",
      draws: 0,
      ...pct([s.cagr], [s.maxDD], [s.sharpe]),
      histogram: histogramOf([s.cagr]),
    }
  }
  for (let d = 0; d < draws; d++) {
    const sim: number[] = []
    while (sim.length < n) {
      const startIdx = Math.floor(rng() * n)
      for (let b = 0; b < blockSize && sim.length < n; b++) {
        sim.push(returns[(startIdx + b) % n])
      }
    }
    const s = drawStats(sim)
    cagrList.push(s.cagr)
    ddList.push(s.maxDD)
    sharpeList.push(s.sharpe)
  }
  return {
    method: "block-bootstrap",
    draws,
    ...pct(cagrList, ddList, sharpeList),
    histogram: histogramOf(cagrList),
  }
}

/** synthetic seeds — จักรวาลใหม่ทั้งชุดต่อ seed (ค่า default config เสมอ เพื่อเทียบข้าม seed ได้) */
export function syntheticSeeds(
  cfg: GtaaConfig = DEFAULT_GTAA_CONFIG,
  seeds = 300,
  months = 360,
): MonteCarloResult {
  const cagrList: number[] = []
  const ddList: number[] = []
  const sharpeList: number[] = []
  for (let s = 0; s < seeds; s++) {
    const panel = makeSyntheticPanel(1000 + s, months)
    const r = runBacktest(panel, cfg)
    cagrList.push(r.stats.cagr)
    ddList.push(r.stats.maxDD)
    sharpeList.push(r.stats.sharpe)
  }
  return {
    method: "synthetic-seeds",
    draws: seeds,
    ...pct(cagrList, ddList, sharpeList),
    histogram: histogramOf(cagrList),
  }
}
