// Sensitivity grid — Top N (3..9) × SMA (8/10/12) = 21 การรัน
// ตอบคำถาม: "ปุ่มเสี่ยงหลักของกลยุทธ์อยู่ที่ไหน" (คำตอบจากงานเดิม: Top N คือปุ่มเสี่ยงหลัก)

import { backtestReturns } from "./backtest"
import { computeStats } from "./stats"
import { DEFAULT_GTAA_CONFIG, type GtaaConfig, type GtaaPanel, type GridCell } from "./types"

const TOPN_GRID = [3, 4, 5, 6, 7, 8, 9]
const SMA_GRID = [8, 10, 12]

export function runSensitivity(panel: GtaaPanel, base: GtaaConfig): GridCell[] {
  const cells: GridCell[] = []
  for (const topN of TOPN_GRID) {
    for (const sma of SMA_GRID) {
      const cfg: GtaaConfig = { ...base, topN, smaMonths: sma }
      const { strat, turnoverAnnual } = backtestReturns(panel, cfg)
      const stats = computeStats(strat, turnoverAnnual)
      cells.push({ topN, smaMonths: sma, cagr: stats.cagr, sharpe: stats.sharpe, maxDD: stats.maxDD })
    }
  }
  return cells
}

export const SENSITIVITY_TOPN = TOPN_GRID
export const SENSITIVITY_SMA = SMA_GRID
export const SENSITIVITY_DEFAULTS = DEFAULT_GTAA_CONFIG
