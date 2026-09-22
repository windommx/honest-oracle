// Universe 13 สินทรัพย์ของ Faber GTAA Aggressive + เงินสด + benchmark
// ตามกลุ่ม: หุ้น US 4 / หุ้นโลก 2 / พันธบัตร 4 / สินค้าโภคภัณฑ์+ทอง 2 / REIT 1

import { DEFAULT_GTAA_CONFIG, type AssetDef, type GtaaConfig } from "./types"

export const GTAA_UNIVERSE: AssetDef[] = [
  { ticker: "VTV", name: "US Large Value", group: "หุ้น US", role: "universe" },
  { ticker: "MTUM", name: "US Large Momentum", group: "หุ้น US", role: "universe" },
  { ticker: "VBR", name: "US Small Value", group: "หุ้น US", role: "universe" },
  { ticker: "DWAS", name: "US Small Dividend/Momentum", group: "หุ้น US", role: "universe" },
  { ticker: "EFA", name: "Foreign Developed", group: "หุ้นโลก", role: "universe" },
  { ticker: "EEM", name: "Foreign Emerging", group: "หุ้นโลก", role: "universe" },
  { ticker: "TLT", name: "US Treasury 20y+", group: "พันธบัตร", role: "universe" },
  { ticker: "IEF", name: "US Treasury 7-10y", group: "พันธบัตร", role: "universe" },
  { ticker: "LQD", name: "US Corporate Bond", group: "พันธบัตร", role: "universe" },
  { ticker: "IGOV", name: "Intl Gov Bond", group: "พันธบัตร", role: "universe" },
  { ticker: "DBC", name: "Commodities", group: "Hard Assets", role: "universe" },
  { ticker: "GLD", name: "Gold", group: "Hard Assets", role: "universe" },
  { ticker: "VNQ", name: "US REITs", group: "อสังหาฯ", role: "universe" },
]

export const CASH_ASSET: AssetDef = { ticker: "BIL", name: "T-Bills 1-3m", group: "เงินสด", role: "cash" }
export const BENCH_ASSET: AssetDef = { ticker: "SPY", name: "S&P 500 (ถือตายตัว)", group: "Benchmark", role: "bench" }

export const ALL_ASSETS: AssetDef[] = [...GTAA_UNIVERSE, CASH_ASSET, BENCH_ASSET]

export const UNIVERSE_TICKERS = GTAA_UNIVERSE.map((a) => a.ticker)

/** ค่า config ที่ยอมรับได้ (ใช้กันค่ามั่วจาก client) */
export const ALLOWED = {
  topN: [3, 4, 5, 6, 7, 8, 9],
  smaMonths: [8, 10, 12],
  skipMonths: [0, 1],
  costBps: [0, 5, 10, 20, 30, 50],
  tranches: [1, 2, 3, 4],
} as const

export function sanitizeConfig(partial: Partial<GtaaConfig> | undefined): GtaaConfig {
  const cfg: GtaaConfig = { ...DEFAULT_GTAA_CONFIG }
  if (!partial) return cfg
  if (typeof partial.topN === "number" && (ALLOWED.topN as readonly number[]).includes(partial.topN)) {
    cfg.topN = partial.topN
  }
  if (
    typeof partial.smaMonths === "number" &&
    (ALLOWED.smaMonths as readonly number[]).includes(partial.smaMonths)
  ) {
    cfg.smaMonths = partial.smaMonths
  }
  if (typeof partial.skipMonths === "number" && (ALLOWED.skipMonths as readonly number[]).includes(partial.skipMonths)) {
    cfg.skipMonths = partial.skipMonths
  }
  if (typeof partial.costBps === "number" && (ALLOWED.costBps as readonly number[]).includes(partial.costBps)) {
    cfg.costBps = partial.costBps
  }
  if (typeof partial.tranches === "number" && (ALLOWED.tranches as readonly number[]).includes(partial.tranches)) {
    cfg.tranches = partial.tranches
  }
  if (partial.cashMode === "tbill" || partial.cashMode === "trendedBond") cfg.cashMode = partial.cashMode
  if (partial.filterOrder === "filter-then-rank" || partial.filterOrder === "rank-then-filter") {
    cfg.filterOrder = partial.filterOrder
  }
  return cfg
}
