// GTAA Rotation Engine (Faber "A Quantitative Approach to Tactical Asset Allocation" 2007 / 2013 update)
// Types กลางของทั้งโมดูล — ใช้ร่วมกันทั้ง engine, API และ UI

export type AssetRole = "universe" | "cash" | "bench"

export interface AssetDef {
  ticker: string
  name: string
  group: string
  role: AssetRole
}

/** ข้อมูลราคาปรับปันผลรายเดือน — closes align กับ dates (null = ยังไม่ IPO / ไม่มีข้อมูล) */
export interface GtaaPanel {
  meta: {
    source: "synthetic" | "yahoo" | "stooq" | "upload"
    seed?: number
    fetchedAt: string
    notes: string[]
  }
  dates: string[] // "YYYY-MM" เรียงขึ้น
  assets: AssetDef[]
  closes: Record<string, (number | null)[]>
}

export type CashMode = "tbill" | "trendedBond"
export type FilterOrder = "filter-then-rank" | "rank-then-filter"

export interface GtaaConfig {
  /** จำนวนสินทรัพย์ที่ถือ (Faber: Top 6 ให้ Sharpe ดีสุด) */
  topN: number
  /** ความยาว SMA เดือน (Faber ใช้ 10 — งานวิจัยชี้ 8/10/12 ต่างกันน้อย) */
  smaMonths: number
  /** 0 = momentum 1/3/6/12 ปกติ, 1 = 12-1 (ตัดเดือนล่าสุดออก ลด short-term reversal) */
  skipMonths: number
  /** เงินสดพักที่ไหน: tbill = BIL ตลอด, trendedBond = IEF ถ้าเหนือ SMA10 ของตัวเอง ไม่งั้น BIL */
  cashMode: CashMode
  /** ต้นทุนต่อ turnover หนึ่งหน่วย (bps, one-way) */
  costBps: number
  /** แบ่งเงินรีบาลานซ์ K งวดเหลื่อมกัน (ลด timing luck ของวันสิ้นเดือน) */
  tranches: number
  /** กรองเทรนด์ก่อนจัดอันดับ (แบบโพสต์) หรือจัดอันดับก่อนแล้วค่อยตัดตัวหลุดเทรนด์ */
  filterOrder: FilterOrder
}

export const DEFAULT_GTAA_CONFIG: GtaaConfig = {
  topN: 6,
  smaMonths: 10,
  skipMonths: 0,
  cashMode: "tbill",
  costBps: 10,
  tranches: 1,
  filterOrder: "filter-then-rank",
}

/** แถวสัญญาณ 1 สินทรัพย์ ณ เดือนล่าสุด */
export interface SignalRow {
  ticker: string
  name: string
  group: string
  close: number
  /** null = ประวัติราคาสั้นกว่า smaMonths (คำนวณ SMA ไม่ได้ — trendPass เป็น false) */
  sma: number | null
  trendPass: boolean
  r1: number | null
  r3: number | null
  r6: number | null
  r12: number | null
  score: number | null
  rank: number | null
  weight: number
  status: "selected" | "reserve" | "kicked" | "cash"
}

export interface BacktestStats {
  cagr: number
  vol: number
  sharpe: number
  maxDD: number
  hitRate: number
  turnoverAnnual: number
  months: number
  finalEquity: number
}

export interface EquityPoint {
  month: string
  strategy: number
  benchmark: number
  ddStrategy: number
  ddBenchmark: number
}

export interface BacktestResult {
  config: GtaaConfig
  startMonth: string
  endMonth: string
  equity: EquityPoint[]
  stats: BacktestStats
  benchStats: BacktestStats
  /** สัญญาณเดือนตัดสินใจล่าสุด (ใช้จัดพอร์ตเดือนหน้า) */
  lastSignals: SignalRow[]
  lastDecisionMonth: string
  notes: string[]
}

export interface GridCell {
  topN: number
  smaMonths: number
  cagr: number
  sharpe: number
  maxDD: number
}

export interface WalkForwardWindow {
  isStart: string
  isEnd: string
  oosStart: string
  oosEnd: string
  chosenTopN: number
  chosenSma: number
  isSharpe: number
  oosSharpe: number
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[]
  isYears: number
  oosYears: number
  /** 1 - median(OOS Sharpe)/median(IS Sharpe) ของ config ที่ถูกเลือก */
  degradationPct: number
  /** % หน้าต่างที่เลือก config ที่ถูกเลือกบ่อยสุด */
  stabilityPct: number
  verdict: string
  mostChosen: string
}

export interface MonteCarloResult {
  method: "synthetic-seeds" | "block-bootstrap"
  draws: number
  cagr: Percentiles
  maxDD: Percentiles
  sharpe: Percentiles
  histogram: { bucket: string; count: number }[]
}

/** Monte Carlo 2 วิธี: block bootstrap บนผลจริง + synthetic seeds (deterministic ต่อ seed) */
export interface MonteCarloBundle {
  bootstrap: MonteCarloResult
  synthetic: MonteCarloResult
}

export interface Percentiles {
  p5: number
  p50: number
  p95: number
}

export interface SelfTestResult {
  id: string
  name: string
  pass: boolean
  detail: string
}

export interface QualityIssue {
  ticker: string
  type: "hole" | "nonpositive" | "jump" | "misaligned" | "short"
  detail: string
}

export interface QualityReport {
  ok: boolean
  months: number
  tickers: number
  lastMonth: string
  issues: QualityIssue[]
  checkedAt: string
}

/** Response ของ GET /api/gtaa/overview */
export interface GtaaOverview {
  source: GtaaPanel["meta"]
  config: GtaaConfig
  universe: AssetDef[]
  run: BacktestResult
  selfTests: SelfTestResult[]
  selfTestPass: number
  selfTestTotal: number
  quality: QualityReport | null
  /** sandbox นี้ดึงข้อมูลจริงได้หรือไม่ (จากการลองล่าสุด) */
  fetchNote: string
  /** สถานะมหภาคล่าสุดจาก engine (อิง config default) — ใช้เชื่อมโยงข้ามระบบ */
  macro: GtaaMacroState
  /** ระดับความพร้อมของโมดูล (ข้อมูลจริง + quality + self-test + tracking log) */
  readiness: GtaaReadiness
}

// ============================================================
// Macro Gate + Tracking Log — การเชื่อมโยงข้ามระบบ + ความรับผิดชอบต่อสัญญาณ
// ============================================================

export type GtaaStance = "risk_on" | "caution" | "risk_off"

/** สถานะมหภาคจาก GTAA ณ เดือนปิดข้อมูลล่าสุด (คำนวณจาก panel โดยตรง ไม่แตะ DB) */
export interface GtaaMacroState {
  asOfMonth: string
  source: GtaaPanel["meta"]["source"]
  stance: GtaaStance
  stanceWhy: string
  cashPct: number
  cashTicker: string
  benchPass: boolean
  benchClose: number | null
  benchSma: number | null
  /** (close/sma − 1) × 100 — บวก = อยู่เหนือเส้น */
  benchGapPct: number | null
  holdings: { ticker: string; name: string; group: string; weight: number; score: number | null; trendPass: boolean }[]
  failed: string[]
  universeCount: number
  /** เดือนถัดไปที่มีรอบตัดสินใจ (ปิดเดือน nextDecisionMonth) */
  nextDecisionMonth: string
  /** เดือนที่ผลการตัดสินใจรอบถัดไปจะถูกใช้ */
  nextAppliesMonth: string
  /** 0 = ข้อมูลทันรอบ (ถึงเดือนก่อนเดือนปัจจุบัน) — >0 = เลยรอบรีบาลานซ์มาแล้ว N รอบ */
  staleMonths: number
}

/** ย่อของ macro state สำหรับฝังใน /api/overview (Command Center ระบบหุ้นไทย) */
export interface GtaaMacroBrief {
  stance: GtaaStance
  stanceWhy: string
  cashPct: number
  asOfMonth: string
  source: GtaaPanel["meta"]["source"]
  benchPass: boolean
  failedCount: number
  universeCount: number
  staleMonths: number
}

/** ระดับความพร้อมของโมดูล — certified = ข้อมูลจริง + engine ผ่านทุกเกณฑ์ + มี tracking log ล่าสุด */
export type GtaaReadinessLevel = "certified" | "verified" | "experimental"
export interface GtaaReadiness {
  level: GtaaReadinessLevel
  reasons: string[]
}

/** Body ของ POST /api/gtaa/snapshot — บันทึกสัญญาณเดือนนี้ลง tracking log (DB) */
export interface GtaaSnapshotRequest {
  config?: Partial<GtaaConfig>
}
export interface GtaaSnapshotResponse {
  saved: boolean
  id: number
  decisionMonth: string
  configHash: string
  updated: boolean
  macro: GtaaMacroState
}

/** แถวสัญญาณที่บันทึกลง tracking log แล้วประเมินผลย้อนหลัง (ทันทีที่มีข้อมูลเดือนถัดไป) */
export interface TrackedSignalRow {
  id: number
  decisionMonth: string
  appliesMonth: string
  cashPct: number
  cashTicker: string
  holdings: { ticker: string; weight: number }[]
  failedCount: number
  stance: GtaaStance | null
  dataSource: string
  configHash: string
  createdAt: string
  /** null = ยังรอผล (เดือนที่ใช้สัญญาณยังไม่ปิด) */
  realized: {
    state: "scored" | "missing-data"
    portfolioRet: number | null
    spyRet: number | null
    delta: number | null
    hit: boolean | null
    missing: string[]
  } | null
}

/** แถวประวัติการรันที่บันทึกลง DB — พิสูจน์ "config เดิม = ผลเดิม" ย้อนหลังได้ */
export interface GtaaRunRow {
  id: number
  configHash: string
  config: GtaaConfig
  months: number
  cagr: number
  maxDD: number
  sharpe: number
  benchCagr: number
  benchMaxDD: number
  benchSharpe: number
  dataSource: string
  qualityOk: boolean
  createdAt: string
}

export interface GtaaTrackingSummary {
  saved: number
  scored: number
  wins: number
  hitRate: number | null
  avgDelta: number | null
}

/** Response ของ GET /api/gtaa/history */
export interface GtaaHistoryResponse {
  runs: GtaaRunRow[]
  signals: TrackedSignalRow[]
  tracking: GtaaTrackingSummary
  macro: GtaaMacroState
}

/** Body ของ POST /api/gtaa/run */
export interface GtaaRunRequest {
  config: Partial<GtaaConfig>
  sensitivity?: boolean
  walkforward?: boolean
  montecarlo?: { seeds?: number }
  /** true = บันทึกผลรัน + snapshot สัญญาณลง tracking log (DB) */
  persist?: boolean
}

export interface GtaaRunResponse {
  run: BacktestResult
  sensitivity: GridCell[]
  walkforward: WalkForwardResult | null
  montecarlo: MonteCarloBundle | null
  runtimeMs: number
  /** id แถว GtaaRun ใน DB (เมื่อ persist = true) */
  runId?: number | null
  /** id snapshot สัญญาณที่บันทึกร่วมด้วย (เมื่อ persist = true) */
  snapshotId?: number | null
}
