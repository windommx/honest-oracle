// ─── Shared types for the Stage Analysis platform ──────────────────────────

export interface Stock {
  id: number
  symbol: string
  name: string
  sector: string
  price: number
  ma30w: number
  ma30wSlopePct: number
  weeklyVolumeM: number
  mansfieldRs: number
  epsGrowthPct: number
  rsScore: number
  fundScore: number
  stage: number
}

export interface MarketReview {
  id: number
  weekOf: string
  setIndex: number
  breadthPct: number
  setAboveMa: boolean
  maRising: boolean
  breadthOk: boolean
  adConfirm: boolean
  foreignBuy: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SectorRanking {
  id: number
  name: string
  stage: number
  rsVsSet: number
  trend: string // RISING | FLAT | FALLING
  volume: string // HEAVY | NORMAL | LIGHT
  score: number // 1-5
  weekOf: string
  createdAt: string
}

export interface WatchlistItem {
  id: number
  symbol: string
  sector: string
  stage: number
  setup: string
  entryPrice: number
  stopLoss: number
  targetPrice: number
  rsScore: number
  fundScore: number
  priority: string // A | B | C
  status: string // WATCHING | BOUGHT | DROPPED
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Position {
  id: number
  symbol: string
  sector: string
  quantity: number
  entryPrice: number
  currentPrice: number
  entryStage: number
  currentStage: number
  stopLoss: number
  confidence: string // A+ | A | B | C | D
  status: string // OPEN | CLOSED
  openedAt: string
  closedPrice: number | null
  closedAt: string | null
  notes: string | null
  /** Optimistic-lock token, echoed back on update. */
  updatedAt: string
}

export interface ActionItem {
  id: number
  weekOf: string
  type: string // BUY | SELL | ADD | ALERT | EVENT
  content: string
  done: boolean
  createdAt: string
}

export interface JournalEntry {
  id: number
  symbol: string
  bias: string // FOMO | LOSS_AVERSION | DISPOSITION | CONFIRMATION | RECENCY | NONE
  outcome: string // WIN | LOSS | OPEN
  pnlPct: number | null
  lesson: string
  createdAt: string
}

export interface ChecklistItem {
  id: number
  category: string // DAILY | WEEKLY | MONTHLY | QUARTERLY
  label: string
  done: boolean
  sortOrder: number
}

// ─── Derived / computed ──────────────────────────────────────────────────────

export interface MarketScoreResult {
  score: number
  max: number
  stageLabel: string
  stageNum: number
  equityPct: string
  recommendation: string
}

export interface StockWithTech extends Stock {
  tech: StockTech
}

// ─── Techno-Fundamental scoring shapes ───────────────────────────────────────
export interface PinePart {
  label: string
  delta: number
}

export interface StockTech {
  pineScore: number
  pineParts: PinePart[]
  tech17: number
  tech17Parts: PinePart[]
  volRatio: number
  rsRising: boolean
  candleUp: boolean
  atr: number
  highestHigh10: number
  breakout: boolean
}

export interface ThesisDTO {
  id: number
  symbol: string
  sector: string
  stockStage: number
  tripleConfirm: boolean
  tech17: number
  epsGrowthPct: number
  epsAccelerating: boolean
  cfoGeNi: boolean
  revenueGrowthPct: number
  recurringRev: boolean
  gmExpanding: boolean
  opMarginAboveInd: boolean
  debtEquity: number
  currentRatio: number
  fcfYieldPct: number
  foreignNetBuy: boolean
  fundIncreasing: boolean
  insiderBuying: boolean
  fundScore: number
  catalyst: string
  earningsDate: string | null
  riskNote: string | null
  entryStrategy: string
  entryPrice: number
  stopLoss: number
  target1: number
  target2: number
  combinedScore: number
  tier: string
  foreignFlow: string
  status: string
  createdAt: string
  updatedAt: string
  quarters: { id: number; label: string; eps: number; sortOrder: number }[]
}

export type ViewKey =
  | 'dashboard'
  | 'alerts'
  | 'weekly'
  | 'screener'
  | 'watchlist'
  | 'portfolio'
  | 'backtest'
  | 'pro'
  | 'quant'
  | 'tools'
  | 'journal'
  | 'thesis'
  | 'learn'

// ─── Alert engine (Risk Radar) ───────────────────────────────────────────────
export type AlertSeverity = 'critical' | 'warning' | 'opportunity' | 'info'
export type AlertCategory = 'market' | 'position' | 'watchlist'

export interface AlertItem {
  id: string
  severity: AlertSeverity
  category: AlertCategory
  symbol?: string
  title: string
  detail: string
  metric?: string
}

export interface AlertsResponse {
  alerts: AlertItem[]
  summary: Record<AlertSeverity, number>
  generatedAt: string
}

// ─── Pro desk: Short candidates (Stage 4) ────────────────────────────────────
export interface ShortCandidate {
  symbol: string
  name: string
  sector: string
  price: number
  ma30w: number
  ma30wSlopePct: number
  mansfieldRs: number
  belowMaPct: number
  stage: number
  pineScore: number
  shortEntry: number // rally toward falling 30W MA = resistance zone
  stop: number // above recent 10-week high
  cover: number // prior base / -12% target
  rr: number
  score: number // 0-100 short strength
}

// ─── Pro desk: Sector rotation ───────────────────────────────────────────────
export type RotationPhase = 'EARLY' | 'MID' | 'LATE' | 'RECESSION'

export interface RotationResult {
  phase: RotationPhase
  label: string
  confidence: number // 0-100
  reasons: string[]
  leaders: { name: string; score: number; stage: number; trend: string }[]
  laggards: { name: string; score: number; stage: number; trend: string }[]
  playbook: string[]
  counts: { s1: number; s2: number; s3: number; s4: number; total: number }
  marketScore: number
}

// ─── Pro desk: Multi-timeframe ───────────────────────────────────────────────
export interface MtfLeg {
  label: string
  timeframe: string
  price: number
  ma: number
  above: boolean
  slopeUp: boolean
}

export interface MtfResult {
  symbol: string
  name: string
  legs: MtfLeg[]
  rs: { now: number; weeksAgo8: number; rising: boolean }
  alignment: 'PERFECT' | 'GOOD' | 'MIXED' | 'WEAK'
  score: number // 0-4 legs+momentum
  action: string
  note: string
}

// ─── Pro desk: Options ───────────────────────────────────────────────────────
export interface OptionLeg {
  type: 'CALL' | 'PUT'
  action: 'BUY' | 'SELL'
  strike: number
  premium: number // per share (บาท/หุ้น)
}

export interface OptionStrategy {
  id: string
  name: string
  th: string
  stages: number[]
  marketScore?: [number, number] // optional score range fit
  legs: OptionLeg[]
  usage: string
  maxProfit: string
  maxLoss: string
}

export interface OptionPoint {
  spot: number
  pnl: number
}

export interface OptionStats {
  netCredit: number // negative = net debit paid
  breakevens: number[]
  maxProfit: number | null
  maxLoss: number | null
}

// ─── Quant Lab: Monte Carlo risk engine ─────────────────────────────────────
/**
 * How the resampler treats the ORDER of your trades.
 *
 *  'iid'   — every draw is independent. Assumes your results have no memory:
 *            that a loss tells you nothing about the next trade. For a trend
 *            strategy that is false, and the falsehood flatters you, because
 *            shuffling losses apart is what removes the deep drawdowns.
 *
 *  'block' — stationary bootstrap (Politis & Romano). Draws runs of
 *            consecutive trades, so streaks survive resampling. Produces
 *            wider, deeper and more honest drawdown estimates. The default.
 */
export type BootstrapMethod = 'iid' | 'block'

export interface MonteCarloRequest {
  returns: number[] // per-trade % returns (e.g. +25, -7)
  sims?: number // number of simulations (default 2000, max 10000)
  capital?: number // initial capital (default 1,000,000)
  method?: BootstrapMethod // default 'block'
  blockSize?: number // expected run length; default ~n^(1/3)
  avgHoldWeeks?: number // for annualising; default 2
}

export interface McBandPoint {
  t: number // step index (0..n_trades)
  lo: number // P5 equity
  med: number // median equity
  hi: number // P95 equity
}

export interface McStats {
  sims: number
  trades: number
  p5: number // final equity percentiles (บาท)
  p25: number
  median: number
  p75: number
  p95: number
  probProfit: number // % of sims ending above initial capital
  probDouble: number // % of sims ending above 2x capital
  medianDd: number // % max drawdown, median across sims
  p95Dd: number
  worstDd: number
  medianSharpe: number // annualized (weekly, ×√52)
  medianCagr: number // %
  medianMultiple: number // median final equity / capital
  /** Which resampler produced these numbers — shown in the UI, not hidden. */
  method: BootstrapMethod
  /** Expected run length used by the block bootstrap (1 when method is iid). */
  blockSize: number
  /** Weeks-per-trade assumed when annualising. CAGR means nothing without it. */
  avgHoldWeeks: number
}

export interface MonteCarloResult {
  stats: McStats
  bands: McBandPoint[] // percentile fan (P5/median/P95)
  paths: { t: number; v: number }[][] // up to 8 sample equity curves
}

// ─── Quant Lab: Dividend trap scanner (NOCASH / TRAP / Yield Bands) ─────────
export type YieldBand = '6-8%' | '8-10%' | '10-12%' | '>12%'
export type TrapRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface TrapRow {
  symbol: string
  name: string
  sector: string
  price: number
  dividendYieldPct: number | null
  band: YieldBand | null
  nocash: boolean
  nocashScore: number // 0-4 conditions met
  nocashNotes: string[]
  trap: boolean
  trapScore: number // 0-5 conditions met
  trapNotes: string[]
  fcfYieldPct: number
  payoutRatioPct: number
  debtEquity: number
  priceDeclinePct: number // decline from 52-week high
  revenueGrowthPct: number
  stage: number
  risk: TrapRisk
  verdict: string // Thai one-liner
}

export interface CalibrationRow {
  band: string
  n: number // sample size
  cutPct12: number // P(price/cut event within 12m) %
  cutPct24: number
  avgReturn12: number // avg total return % over next 12m
}

export interface TrapsResponse {
  rows: TrapRow[]
  summary: {
    scanned: number
    withYield: number
    nocash: number
    trap: number
    both: number
    critical: number
    high: number
  }
  calibration: CalibrationRow[]
  generatedAt: string
}

// ─── Quant Lab: Unified Score 360° (0-100) ──────────────────────────────────
export interface ScorePart {
  label: string
  note: string
  score: number
  max: number
}
export interface ScoreSection {
  id: string // A | B | C | D | E
  label: string
  score: number
  max: number
  parts: ScorePart[]
}
export type ScoreTier = 'S+' | 'A' | 'B' | 'C' | 'D' | 'F'
export interface UnifiedGate {
  regime: 'BULL' | 'CHOPPY' | 'BEAR'
  sectorStage: number
  stockStage: number
  rr: number
  verdict: 'BUY ZONE' | 'HOLD ONLY' | 'WATCH ONLY' | 'NO BUY'
  steps: string[]
}
export interface UnifiedScoreResult {
  symbol: string
  name: string
  sector: string
  stage: number
  sections: ScoreSection[]
  total: number
  tier: { grade: ScoreTier; riskPct: number; action: string; th: string }
  gate: UnifiedGate
}

// ─── Quant Lab: Nightly audit hash chain ────────────────────────────────────
export interface ChainEntry {
  night: number
  timestamp: string
  prevHash: string
  hash: string
  summary: {
    stocksAnalyzed: number
    signals: number
    nocash: number
    trap: number
    marketScore: number | null
    universeSize: number
    breadthPct: number | null
  }
}
export interface ChainResponse {
  entries: ChainEntry[]
  valid: boolean
  error: string | null
  length: number
  lastHash: string
}
