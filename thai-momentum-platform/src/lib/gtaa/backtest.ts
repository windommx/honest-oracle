// Backtester รายเดือน — ตัดสินใจที่ปิดเดือน t, ผลตอบแทนเกิดเดือน t→t+1 (ไม่มี look-ahead)
// รองรับ tranching (รีบาลานซ์ K งวดเหลื่อมกัน ลด timing luck) และต้นทุนต่อ turnover

import { computeMonthSignals } from "./signals"
import { computeStats, drawdownSeries, equityCurve } from "./stats"
import { mean } from "./math"
import { BENCH_ASSET, GTAA_UNIVERSE } from "./defaults"
import type { BacktestResult, BacktestStats, GtaaConfig, GtaaPanel } from "./types"

/** เดือนแรกที่สัญญาณคำนวณได้ครบ (ต้องมี SMA + momentum 12 เดือนย้อนหลัง) */
export function warmupMonths(cfg: GtaaConfig): number {
  return Math.max(cfg.smaMonths, 12 + cfg.skipMonths) + 1
}

/** ผลตอบแทนเดือน t→t+1 ของสินทรัพย์ (null ถ้าข้อมูลไม่ครบ) */
function monthReturn(closes: (number | null)[], t: number): number | null {
  const a = closes[t]
  const b = closes[t + 1]
  if (a === null || b === null || a === undefined || b === undefined || a <= 0) return null
  return b / a - 1
}

/** slice panel ช่วงเดือน [from, to] (inclusive) — ใช้ใน walk-forward */
export function slicePanel(panel: GtaaPanel, from: number, to: number): GtaaPanel {
  const dates = panel.dates.slice(from, to + 1)
  const closes: Record<string, (number | null)[]> = {}
  for (const [ticker, series] of Object.entries(panel.closes)) {
    closes[ticker] = series.slice(from, to + 1)
  }
  return { ...panel, dates, closes }
}

/** รัน backtest บน panel — คืนผลตอบแทนรายเดือนของกลยุทธ์ + benchmark (SPY ถือตายตัว) */
export function backtestReturns(
  panel: GtaaPanel,
  cfg: GtaaConfig,
): { strat: number[]; bench: number[]; turnoverAnnual: number; startIdx: number } {
  const T = panel.dates.length
  const start = warmupMonths(cfg)
  const K = Math.max(1, Math.round(cfg.tranches))
  const cost = cfg.costBps / 10_000

  // แคชสัญญาณรายเดือน (หลาย tranche อาจรีบาลานซ์เดือนเดียวกัน)
  const sigCache = new Map<number, ReturnType<typeof computeMonthSignals>>()
  const signalsAt = (t: number) => {
    let s = sigCache.get(t)
    if (!s) {
      s = computeMonthSignals(panel, t, cfg)
      sigCache.set(t, s)
    }
    return s
  }

  // weights ที่ลอยตามราคาของแต่ละ tranche (capital share = 1/K)
  const trancheW: Record<string, number>[] = Array.from({ length: K }, () => ({}))
  const strat: number[] = []
  const turnoverUnits: number[] = []

  for (let t = start; t < T - 1; t++) {
    const trancheReturns: number[] = []
    let monthTurnover = 0

    for (let k = 0; k < K; k++) {
      const W = trancheW[k]
      // ทุก tranche ลงทุนตั้งแต่เดือนแรก (ไม่งั้น tranche ที่ยังไม่ถึงรอบถือเงินเปล่า 0% — ไม่ใช่แม้แต่ BIL)
      // จากนั้นรีบาลานซ์เหลื่อมกันทุก K เดือน
      const isRebalance = t === start || (t - start - k) % K === 0
      let rK = 0

      if (isRebalance) {
        const target = signalsAt(t).weights
        let traded = 0
        const keys = new Set([...Object.keys(W), ...Object.keys(target)])
        for (const key of keys) {
          const from = W[key] ?? 0
          const to = target[key] ?? 0
          traded += Math.abs(to - from)
        }
        monthTurnover += traded / K // แต่ละ tranche ถือเงิน 1/K ของพอร์ต
        const costK = traded * cost
        // ผลตอบแทนเดือนนี้ของ tranche = target portfolio return - cost
        let gross = 0
        let valid = false
        for (const [ticker, w] of Object.entries(target)) {
          if (w <= 0) continue
          const r = monthReturn(panel.closes[ticker] ?? [], t)
          if (r === null) continue
          gross += w * r
          valid = true
        }
        rK = (valid ? gross : 0) - costK
        // เริ่มจาก target แล้ว drift — แทนที่ทั้ง tranche: ตัวที่ขายออกต้องหายไป (ไม่งั้นน้ำหนักเก่าค้าง ถูกนับ "ขาย"
        // ซ้ำทุกรอบ + ยังได้ผลตอบแทนในเดือนที่ไม่รีบาลานซ์) · หารด้วย 1+gross ให้น้ำหนักหลัง drift รวม = 1 พอดี
        const drifted: Record<string, number> = {}
        for (const [ticker, w] of Object.entries(target)) {
          const r = monthReturn(panel.closes[ticker] ?? [], t) ?? 0
          drifted[ticker] = (w * (1 + r)) / (1 + gross)
        }
        trancheW[k] = drifted
      } else {
        // เดือนไม่รีบาลานซ์ — ถือน้ำหนักเดิมที่ลอยแล้ว
        let gross = 0
        let wSum = 0
        for (const [ticker, w] of Object.entries(W)) {
          const r = monthReturn(panel.closes[ticker] ?? [], t)
          if (r === null) {
            wSum += w
            continue
          }
          gross += w * r
          wSum += w
        }
        rK = wSum > 0 ? gross / wSum : 0
        for (const [ticker, w] of Object.entries(W)) {
          const r = monthReturn(panel.closes[ticker] ?? [], t)
          W[ticker] = (w * (1 + (r ?? 0))) / (1 + rK)
        }
      }
      trancheReturns.push(rK)
    }

    const rP = mean(trancheReturns)
    strat.push(rP)
    if (monthTurnover > 0) turnoverUnits.push(monthTurnover)
  }

  // benchmark SPY ถือตายตัว ช่วงเดียวกัน
  const bench: number[] = []
  const spy = panel.closes[BENCH_ASSET.ticker] ?? []
  for (let t = start; t < T - 1; t++) {
    const r = monthReturn(spy, t)
    bench.push(r ?? 0)
  }

  const months = strat.length
  const turnoverAnnual = months > 0 ? (turnoverUnits.reduce((a, b) => a + b, 0) * 12) / months : 0
  return { strat, bench, turnoverAnnual, startIdx: start }
}

/** รัน backtest แบบเต็ม — คืน equity curve + stats + สัญญาณเดือนล่าสุด */
export function runBacktest(panel: GtaaPanel, cfg: GtaaConfig): BacktestResult {
  const { strat, bench, turnoverAnnual, startIdx } = backtestReturns(panel, cfg)
  const stats = computeStats(strat, turnoverAnnual)
  const benchStats: BacktestStats = computeStats(bench, 0)

  const stratEq = equityCurve(strat)
  const benchCurve: number[] = []
  let bEq = 1
  for (const r of bench) {
    bEq *= 1 + r
    benchCurve.push(bEq)
  }
  const ddS = drawdownSeries(stratEq)
  const ddB = drawdownSeries(benchCurve)

  const equity = stratEq.map((s, i) => ({
    month: panel.dates[startIdx + 1 + i],
    strategy: s,
    benchmark: benchCurve[i] ?? 1,
    ddStrategy: ddS[i],
    ddBenchmark: ddB[i] ?? 0,
  }))

  const T = panel.dates.length
  const last = computeMonthSignals(panel, T - 1, cfg)
  const notes = [...panel.meta.notes]

  return {
    config: cfg,
    startMonth: panel.dates[startIdx] ?? "—",
    endMonth: panel.dates[T - 1] ?? "—",
    equity,
    stats,
    benchStats,
    lastSignals: last.rows,
    lastDecisionMonth: panel.dates[T - 1] ?? "—",
    notes,
  }
}

/** รายชื่อสินทรัพย์ที่ engine ใช้ได้ใน panel (มีข้อมูล) */
export function availableUniverse(panel: GtaaPanel): string[] {
  return GTAA_UNIVERSE.filter((a) => (panel.closes[a.ticker]?.length ?? 0) > 0).map((a) => a.ticker)
}
