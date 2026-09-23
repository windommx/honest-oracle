// ============================================================
// Shared API contracts — single source of truth สำหรับทุก API + UI
// ============================================================

import { TH_TOP_N } from "@/lib/config/thai"

export const TFS = [5, 10, 20, 40, 80, 160, 300] as const
export type Tf = (typeof TFS)[number]
/** จำนวนอันดับต่อโผที่ระบบสร้างจริง (= TH_TOP_N ของ core; เดิมเขียนตายตัว 30 ไม่ตรงกับ Top-25) */
export const TOPN = TH_TOP_N

export type Question = "Q_REGIME" | "Q_ENTRY" | "Q_EXIT" | "Q_ESCALATE" | "Q_SIGNAL" | "Q_PAIRS" | "Q_STOP"
export type RegimeAction = "risk_on" | "neutral" | "risk_off"

// ---------- GET /api/dates ----------
export interface DatesResponse {
  dates: string[] // วันที่มี snapshot เรียงใหม่ → เก่า (สูงสุด 400 วันล่าสุด)
  latest: string | null
  count: number // จำนวนวันที่มี snapshot ทั้งหมดในระบบ (อาจมากกว่า dates.length)
}

// ---------- GET /api/map?date= ----------
export interface MapItem { symbol: string; rank: number; ret: number }
export interface MapColumn { tf: number; items: MapItem[] }
export interface MapResponse {
  date: string
  columns: MapColumn[]
  repeated: string[]
  colors: Record<string, string>
}

// ---------- GET /api/overview ----------
export interface RegimeInfo {
  action: RegimeAction
  conf: number
  repeatZ: number
  mktMom20: number
}
// ย่อสถานะมหภาคจากโมดูล GTAA (Global Regime Gate) — โครงสร้างเดียวกับ GtaaMacroBrief ใน lib/gtaa/types
export interface GtaaBrief {
  stance: "risk_on" | "caution" | "risk_off"
  stanceWhy: string
  cashPct: number
  asOfMonth: string
  source: string
  benchPass: boolean
  failedCount: number
  universeCount: number
  staleMonths: number
}
export interface OverviewResponse {
  latestDate: string | null
  totalDates: number
  totalSymbols: number
  rowsRaw: number
  rowsSnap: number
  todayUnique: number
  todayRepeat: number
  todayMulti3: number
  regime: RegimeInfo | null
  positions: number
  pendingGates: number
  dqFlags: string[]
  /** Global Regime Gate จาก GTAA (shadow — ยังไม่ผูกกับ gross budget) */
  gtaa: GtaaBrief | null
}

// ---------- GET /api/report?date= ----------
export interface ReportRow {
  tf: number
  total: number
  newCount: number
  newSymbols: string[]
  lostCount: number
  lostSymbols: string[]
}
export interface ReportResponse {
  date: string
  prevDate: string | null
  text: string
  rows: ReportRow[]
  multi: { symbol: string; count: number }[]
}

// ---------- GET /api/stats?hold= ----------
export interface StatsBucket { n: number; mean: number; median: number; winRate: number }
export interface TfStat extends StatsBucket { tf: number }
export interface GradRow { from: number; to: number; within: number; rate: number }
export interface StatsResponse {
  hold: number
  control: StatsBucket
  byTf: TfStat[]
  graduation: GradRow[]
}

// ---------- GET /api/regime?days= ----------
export interface RegimePoint {
  date: string
  repeat: number // 0..1 overlap ratio
  repeatZ: number
  mktFwd10: number | null // % mean forward 10d return of liquid universe (null = ยังไม่มีข้อมูลอนาคต)
}
export interface RegimeResponse {
  series: RegimePoint[]
  corr: number
}

// ---------- POST /api/backtest | GET /api/backtest ----------
export interface BacktestParams {
  k: number // ติด >= k โผพร้อมกัน
  hold: number
  stopPct: number // 0.10 = -10%
  maxPos: number
  costBps: number
  slipBps: number // slippage ฐานต่อขา (Thai default 40)
}
export interface BacktestStats {
  trades: number
  winRate: number // 0..1
  avgRet: number // % ต่อเทรด
  stopShare: number // 0..1
  timeShare: number // 0..1
  totalRet: number // 0..1
  cagr: number // 0..1
  maxDD: number // negative
  sharpe: number
  exposure: number // 0..1
  benchTotal: number
  benchCagr: number
}
export interface TradeRow {
  symbol: string
  entryDate: string
  exitDate: string
  entryPx: number
  exitPx: number
  ret: number // % หลังต้นทุน
  reason: "stop" | "time"
  /** บังคับปิดเพราะไม่มีราคาครบ NO_PRICE_EXIT_DAYS วันทำการ (reason = "time") — 2026-09-23 */
  delisted?: boolean
  note?: string
}
export interface EquityPoint { date: string; strategy: number; benchmark: number }
export interface BacktestResult {
  id?: number
  params: BacktestParams
  equity: EquityPoint[]
  stats: BacktestStats
  trades: TradeRow[]
}
export interface BacktestRunRow {
  id: number
  params: BacktestParams
  stats: BacktestStats
  createdAt: string
}
export interface BacktestListResponse {
  runs: BacktestRunRow[]
}

// ---------- JEV ----------
export interface JevDecision {
  question: Question
  target: string
  action: string
  conf: number
  reason: string
}
export interface JevRunResponse {
  date: string
  regime: RegimeAction
  message: string
  /** ลงมือแล้วในรอบนี้: เติม T+1 ของคำสั่งค้าง (action "fill") + exit/tighten ที่ราคาปิดวันนี้ */
  executed: JevDecision[]
  gated: (JevDecision & { id: number })[]
  blocked: JevDecision[]
  sectorExposure: SectorExposureRow[] | null
  groupExposure: GroupExposureRow[] | null
  /** คำสั่งซื้อที่รอบนี้ส่งเข้าคิว — ยังไม่ใช่สถานะ เติมที่ราคาปิดวันทำการถัดไป (T+1) */
  queued: PendingFillRow[]
  /** ผลเติมคำสั่งค้าง (ทำก่อนตัดสินใจรอบนี้) */
  fills: FillStepResult
  /** คิวที่ยังรอเติมหลังจบรอบ */
  pendingFills: PendingFillRow[]
}

// ---------- คำสั่งซื้อรอเติม T+1 (pending fill queue) ----------
// Jev ตัดสินหลังตลาดปิด (ข้อมูล EOD) — ราคาปิดของวันตัดสินใจจึงซื้อไม่ได้จริง
// คำสั่งซื้อ (อัตโนมัติ / มนุษย์อนุมัติ / reversal) เข้าคิวก่อน แล้วเติมที่ราคาปิดของวันทำการแรก "หลัง" afterDate
// (ตรงกับ runBacktest ที่ซื้อ pending ที่ราคาปิดแท่งถัดไป) · คิวเก็บใน Setting ไม่ใช่ Position — ไม่นับใน NAV
/** ที่มาของคำสั่ง: auto = Jev ซื้ออัตโนมัติ (risk_on) · human = มนุษย์อนุมัติ gate · reversal = snap-back */
export type PendingFillSource = "auto" | "human" | "reversal"
export interface PendingFillOrder {
  id: string
  symbol: string
  slots: number
  /** stop % ที่ใช้วันตัดสิน (ทศนิยม เช่น 0.09) × ตัวคูณ vol-aware (×0.8 เมื่อผันผวนสูง) — คิดจากราคาเติม */
  stopPct: number
  stopMult: number
  source: PendingFillSource
  /** วันที่ Jev ตัดสินใจ (วันของสัญญาณ / วันของ gate) */
  decisionDate: string
  /** วันข้อมูลล่าสุดที่รู้ตอนส่งคำสั่ง — เติมที่ราคาปิดของวันทำการแรกที่ "หลัง" วันนี้ */
  afterDate: string
  gateId: number | null
  conf: number
  /** เหตุผลเดิมของการตัดสินใจ */
  reason: string
  /** งบ slots ของรอบที่ส่งคำสั่ง — ตรวจ sector/slot ซ้ำตอนเติมด้วยงบนี้ */
  maxSlots: number
  placedAt: string
  /** EventLog id ของจุดเริ่มยุคข้อมูลตอนส่งคำสั่ง (seed/ล้าง demo) — ยุคเปลี่ยนก่อนเติม = ยกเลิก */
  epoch: number | null
}
export interface PendingFillRow extends PendingFillOrder {
  /** วันที่จะเติม (วันทำการแรกหลัง afterDate ที่มีในข้อมูลแล้ว) — null = รอข้อมูลวันทำการถัดไป */
  fillDate: string | null
  /** ราคาปิดวันเติม — null = ยังไม่มีข้อมูล หรือหุ้นไม่มีราคาวันนั้น (จะถูกยกเลิก) */
  fillPx: number | null
}
export interface FilledOrderRow {
  id: string
  symbol: string
  source: PendingFillSource
  decisionDate: string
  afterDate: string
  fillDate: string
  fillPx: number
  slots: number
  stop: number
  /** เช่น ลดขนาดตอนเติมเพราะ sector/งบ slots */
  note: string | null
}
export interface CancelledOrderRow {
  id: string
  symbol: string
  source: PendingFillSource
  decisionDate: string
  afterDate: string
  /** วันที่ควรเติม (null = ยกเลิกก่อนถึงวันเติม เช่นยุคข้อมูลเปลี่ยน) */
  date: string | null
  reason: string
}
export interface FillStepResult {
  filled: FilledOrderRow[]
  cancelled: CancelledOrderRow[]
}

// ---------- Sector risk (แผนที่หุ้น → อุตสาหกรรม) ----------
export interface SectorExposureRow {
  sector: string
  weight: number // 0..1 สัดส่วนน้ำหนัก slots
  names: number // จำนวนหุ้นใน sector
  cap: number // เพดาน (0.30)
  breached: boolean
}
export interface GroupExposureRow {
  group: string // Financials, Tech, ...
  sectors: string[]
  weight: number
  cap: number
  breached: boolean
}
export interface DecisionsResponse {
  decisions: DecisionRow[]
}
export interface PendingResponse {
  pending: PendingRow[]
  /** คำสั่งซื้อที่รอเติมราคาปิดวันทำการถัดไป (T+1) — ยังไม่ใช่สถานะ */
  fills: PendingFillRow[]
}
export interface GateActionResult {
  ok: boolean
  id: number
  status: string
  message: string
  /** อนุมัติ Q_ENTRY buy → คำสั่งที่เข้าคิว T+1 (ยังไม่ใช่สถานะ) */
  order?: PendingFillOrder
}
export interface DecisionRow {
  id: number
  date: string
  question: string
  target: string
  action: string
  conf: number
  reason: string
  executed: boolean
  outcome: number | null
  source: string
}
export interface PendingRow {
  id: number
  date: string
  question: string
  target: string
  action: string
  conf: number
  reason: string
  status: string
  createdAt: string
}
export interface VerifyBucket {
  range: string
  n: number
  winRate: number | null
  avgConf: number
}
export interface VerifyResponse {
  buckets: VerifyBucket[]
  brier: number | null
  total: number
}

// ---------- Portfolio ----------
export interface PositionRow {
  symbol: string
  entryDate: string
  entryPx: number
  slots: number
  stop: number
  lastPx: number
  pnlPct: number
  daysHeld: number
  inAnyList: boolean
  nTfToday: number
  sector: string
}
export interface PortfolioResponse {
  positions: PositionRow[]
  totals: { slots: number; positions: number; avgPnl: number } | null
  risk: { effN: number | null; weeklyDD: number | null; killSwitch: boolean; maxWeeklyDD: number }
  sectorExposure: SectorExposureRow[]
  groupExposure: GroupExposureRow[]
  /** คำสั่งซื้อรอเติม T+1 — แสดงแยก ไม่นับใน positions/totals/risk (ยังไม่ได้ซื้อ) */
  pendingFills: PendingFillRow[]
}

// ---------- DQ ----------
export interface DqCheck { name: string; ok: boolean; detail: string }
export interface DqResponse {
  flags: string[]
  checks: DqCheck[]
}

// ---------- Seed / Ingest ----------
export interface SeedResponse {
  ok: boolean
  rawRows: number
  snapRows: number
  dates: number
  symbols: number
  sectorRows: number
  crossRows?: number
  tradeRows?: number // ประวัติเทรดจำลอง (ฐานข้อมูลของ Bayesian stop engine)
  tookMs: number
}
export interface IngestResponse {
  ok: boolean
  insertedRaw: number
  updatedRows: number
  snapDates: string[]
  tookMs: number
  message: string
}

// ---------- Research: pre-registration ----------
export interface TrialParams {
  k: number
  hold: number
  stopPct: number
  maxPos: number
  costBps: number
  costsGrid: number[]
  bootN: number
  seed: number
  hitGate: number
  nGroups: number
  nTestGroups: number
  purge: number
}
export interface PreregInfo {
  hash: string
  params: TrialParams
  frozenAt: string
}
export interface PreregResponse {
  prereg: PreregInfo | null
}

// ---------- Research: Profit Engine trial ----------
export interface Criterion {
  key: string
  label: string
  pass: boolean
  detail: string
}
export interface CpcvSummary {
  paths: number
  panelN: number
  meanHit: number
  stdHit: number
  meanAuc: number
  pctAbove: number
  avgLong: number
  avgShort: number
  avgGap: number
  hitGate: number
  pooledHit: number
  pooledAuc: number
}
export interface TrialResponse {
  id?: number
  paramsHash: string
  params: TrialParams
  frozen: boolean
  strategy: BacktestStats
  naive: BacktestStats
  halves: { first: number; second: number }
  bootstrap: { mean: number; low5: number; high95: number }
  costGrid: { costBps: number; cagr: number; totalRet: number }[]
  meta: CpcvSummary
  criteria: Criterion[]
  passed: number
  total: number
  verdict: "GO" | "WEAK" | "NO-GO"
  tookMs: number
}
export interface TrialRunRow {
  id: number
  verdict: string
  paramsHash: string
  passed: number
  total: number
  cagr: number
  maxDD: number
  createdAt: string
}
export interface TrialListResponse {
  runs: TrialRunRow[]
}

// ---------- Research: CPCV ----------
export interface CpcvPathRow {
  path: number
  n: number
  hit: number
  auc: number
  longRet: number
  shortRet: number
  gap: number
}
export interface MetaModelStatus {
  enabled: boolean
  trainedAt: string | null
  hold: number | null
  panelN: number | null
  auc: number | null
  hitGate: number | null
}
export interface CpcvResponse {
  id?: number
  params: { hold: number; nGroups: number; nTestGroups: number; purge: number; embargo: number; hitGate: number }
  panelN: number
  paths: number
  meanHit: number
  stdHit: number
  meanAuc: number
  pctAbove: number
  avgLong: number
  avgShort: number
  avgGap: number
  pooledHit: number
  pooledAuc: number
  pathRows: CpcvPathRow[]
  skipped: number
  metaPass: boolean
  deployed: boolean
  modelStatus: MetaModelStatus
  tookMs: number
}
export interface CpcvListResponse {
  runs: {
    id: number
    verdict: string
    meanHit: number
    paths: number
    avgGap: number
    createdAt: string
  }[]
  model: MetaModelStatus
}

// ---------- Events (hash-chain audit) ----------
export interface EventRow {
  id: number
  ts: string
  kind: string
  actor: string
  payload: string
}
export interface AuditResponse {
  ok: boolean
  total: number
  brokenAt: number | null
  events: EventRow[]
}

// ---------- Portfolio construction: HRP ± Black-Litterman ----------
export type AllocationMode = "equal" | "invvol" | "hrp" | "hrp_bl"
export interface AllocationRow {
  symbol: string
  sector: string
  weight: number // น้ำหนักสุดท้ายตาม mode (0..1)
  hrpWeight: number | null // น้ำหนัก HRP ล้วน (null เมื่อไม่ได้รัน HRP)
  vol20: number // % ความผันผวนรายวัน 20 วัน
}
export interface BlViewRow {
  symbol: string
  pi: number // equilibrium return (ประจำปี, ทศนิยม)
  q: number // view return จากโมเมนตัม (ประจำปี)
  muBl: number // posterior return (ประจำปี)
  omega: number // Idzorek view uncertainty
  confidence: number // ความมั่นใจ 0..1 (จาก n_tf/meta)
}
export interface AllocationCluster {
  id: number
  symbols: string[]
}
export interface AllocationResponse {
  mode: AllocationMode
  lookback: number
  nAssets: number
  weights: AllocationRow[]
  clusters: AllocationCluster[]
  effN: number
  views: BlViewRow[] | null
  tau: number
  riskAversion: number
  notes: string[]
  tookMs: number
}

// ---------- Research: Purged Permutation Importance ----------
export interface ImportanceRow {
  feature: string
  th: string
  meanAucDrop: number // ยิ่งมาก = ยิ่งสำคัญ
  stdAucDrop: number
  nPaths: number
}
export interface ImportanceResponse {
  rows: ImportanceRow[]
  baseHit: number
  baseAuc: number
  panelN: number
  paths: number
  tookMs: number
}

// ============================================================
// Signals Engine v2 (Regime Composite + IC Harness + A/B shadow)
// ============================================================

export interface SignalMarketDay {
  date: string
  /** สัดส่วนหุ้นเหนือ MA20/50/200 · null = วัดไม่ได้ (ยังไม่มีหุ้นตัวไหนมี MA ของหน้าต่างนั้น — ประวัติสั้น) */
  b20: number | null
  b50: number | null
  b200: number | null
  /** b20(d) − b20(d−5) · null = วัดไม่ได้ */
  thrust: number | null
  breadthZ: number
  volPct: number
  overlapZ: number
  crossZ: number
  regimeScore: number
  grossMult: number
  label: "risk_on" | "risk_off" | "neutral"
}

export interface SignalStockToday {
  symbol: string
  sector: string
  mfd: number
  priceRank: number
  flowRank: number
  rotZ: number
  sectorRank: number
  symVolPct: number
  mom: number
  score: number
}

export interface SignalSector {
  name: string
  rotZ: number
  rank: number
  share: { date: string; v: number }[]
}

export interface SignalsResponse {
  latest: string | null
  market: SignalMarketDay[]
  stockToday: SignalStockToday[]
  sectors: SignalSector[]
  label: "risk_on" | "risk_off" | "neutral"
  regimeScore: number
  grossMult: number
  policy: { promoted: string[]; weights: Record<string, number>; v2: boolean; updatedAt: string } | null
  tookMs: number
}

export interface SignalIcSummary {
  meanIC: number
  ICIR: number
  t: number
  n: number
  hit: number
}
export interface SignalTiming {
  corr: number
  n: number
  t: number
}
export interface IcResponse {
  hold: number
  ic: Record<string, SignalIcSummary>
  timing: Record<string, SignalTiming>
  verdicts: Record<string, "PROMOTE" | "FLIP-CHECK" | "KILL">
  timingVerdicts: Record<string, "USE" | "KILL">
  promoted: string[]
  weights: Record<string, number>
  policySaved: boolean
  tookMs: number
}

export interface AbBucket {
  n: number
  winRate: number
  meanRet: number // % หลัง cost
}
export interface AbResponse {
  hold: number
  costBps: number
  v1: AbBucket | null
  v2: AbBucket | null
  paired: { n: number; meanDiff: number; winRateDiff: number }
  promotionRule: string
  readyToPromote: boolean
  message: string
}

// ============================================================
// Alpha Stack v3 (Pairs Stat-Arb / Basis / Parity / VRP / HRP allocator)
// ============================================================

export interface PairScanRow {
  a: string
  b: string
  sector: string
  corr: number
  beta: number
  hl: number // half-life (วันทำการ)
  z: number // z ของ spread วันล่าสุด
  mu: number
  sd: number
  action: "ENTER" | "HOLD" | "TAKE" | "TIME_EXIT" | "STOP" | "SKIP"
}

export interface PairBacktestRow {
  a: string
  b: string
  trades: number
  winRate: number
  avgGross: number // % ต่อรอบ
  avgNet: number // % ต่อรอบ หลังต้นทุน 4 ขา
  totalNet: number // % สะสม
}

export interface PairsResponse {
  scanned: number
  tested: number
  pairs: PairScanRow[]
  backtest: PairBacktestRow[]
  costPerLegBps: number
  tookMs: number
  message: string
}

export interface EngineRow {
  key: "momentum" | "pairs" | "basis" | "parity" | "vrp"
  name: string
  status: "ACTIVE" | "SHADOW" | "STANDBY"
  corrVsCore: string
  expected: string
  maxDD: string
  capacity: string
  detail: string
  gates: { label: string; pass: boolean | null }[]
}

export interface EnginesResponse {
  engines: EngineRow[]
  allocator: { status: string; unlock: string; note: string }
  counts: { crossAsset: number; futures: number; options: number }
  tookMs: number
}

// ============================================================
// Bayesian Stop-Loss Engine (Zambelli) — posterior จาก MAE + 3-arm A/B
// ============================================================

/** T method = 1 obs ต่อเทรด (MAE สุดท้าย) · R method = ทุกบาร์ระหว่างถือ (ข้อมูลหนา) */
export type StopMode = "T" | "R"
export type StopArm = "fixed10" | "bayesT" | "bayesR"
export type StopBucket = "pooled" | "auto" | "human"

export interface StopPosteriorDto {
  mode: StopMode
  bin: number // ความกว้าง bin (T=1%, R=1.5% — R มี obs ซ้ำในเทรด จึงใช้ bin กว้างกัน correlation)
  bins: number[] // ขอบล่างของแต่ละ bin (ทศนิยม drawdown)
  pL: number[] // P(Loser | bin)
  evHold: number[] // EV ของการถือต่อเมื่ออยู่ bin นี้ (ทศนิยม ต่อเทรด หลังต้นทุน)
  pBin: number[] // P(bin) จาก MAE จริงของเทรด (weighted)
  histW: number[] // density ของ Winners ต่อ bin (normalize รวม = 1)
  histL: number[] // density ของ Losers ต่อ bin (normalize รวม = 1)
  pW: number // P(win) ถ่วงน้ำหนัก recency
  nTrades: number // จำนวนเทรดที่ใช้ (หลัง filter bucket)
  nObs: number // จำนวน observation (R mode > nTrades)
  pooled: boolean // true = ถังนี้เทรด < 200 → ใช้ pooled แทน (กัน posterior บาง)
  note: string | null
  sOpt: number | null // s* = argmax E[R|s] (ทศนิยม) — null เมื่อไม่มีเทรด
  evOpt: number | null
  evNoStop: number // baseline ไม่มี stop
  evCurve: { s: number; ev: number }[] // E[R|s] ทุกระดับ (สำหรับกราฟ)
  /** ราคาขายเมื่อหลุด stop: close = ราคาปิดวันแรกที่ทะลุ (ตรง live) · level = ราคา stop พอดี (ใช้เทียบเท่านั้น) */
  fill?: "close" | "level"
  /** เทรดที่ไม่มี path รายวันพอ → ไม่ให้เครดิต stop (ใช้ EV ของการถือ) */
  nNoPathEvidence?: number
}

export interface StopArmRow {
  arm: StopArm
  label: string
  n: number // เทรดที่จำลอง
  stopNow: number | null // ระดับ stop ปัจจุบันของ arm (bayes = s* ล่าสุด, fixed = 0.10)
  avgRet: number // % ต่อเทรด (หลังต้นทุน)
  winRate: number
  maxDD: number // ลบ
  sharpe: number
  calmar: number
  cagr: number
  stopShare: number
}

export interface StopPositionRow {
  symbol: string
  entryDate: string
  entryPx: number
  lastPx: number
  pnlPct: number // % จากราคา (gross)
  dNow: number // drawdown ปัจจุบันจากจุดเข้า (≥0, close-based)
  bin: number | null
  pL: number | null // P(Loser | bin ปัจจุบัน)
  evHold: number | null // EV ถือต่อ (ทศนิยม)
  exitNow: boolean // EV_hold ≤ 0 หรือ dd เกิน maxDD
  beyondOpt: boolean // dd ≥ s_live = 0.85·s*
  regime: string
}

export interface StopsResponse {
  latest: string
  bucket: StopBucket
  policy: { arm: StopArm; adopted: boolean; decidedAt: string | null }
  posteriorT: StopPosteriorDto
  posteriorR: StopPosteriorDto
  arms: StopArmRow[]
  equityCurves: { date: string; fixed10: number; bayesT: number; bayesR: number }[]
  adoption: {
    winner: StopArm // arm ที่ชนะตามกติกา (fixed10 หากไม่ผ่าน)
    bestBayes: StopArm
    passed: boolean
    rule: string
    sharpeDelta: number
    maxDDDelta: number
    saved: boolean
  }
  positions: StopPositionRow[]
  costRT: number // ต้นทุน round-trip (ทศนิยม)
  embargoDays: number
  refitDays: number
  tookMs: number
  message: string
}

// ---------- GET /api/ai-score ----------
// เรดาร์ %CMPR — หุ้น Volume พุ่งติดอันดับ + คะแนน AI-Score 4 องค์ประกอบ
// AI-Score = Cmpr + PerC12-30 + Trend + Heikin-Score (คาลิเบรตจากระบบอ้างอิง)
export type AiTrendLabel =
  | "แนวโน้มขึ้นแรง"
  | "แนวโน้มขึ้น"
  | "Sideway UP"
  | "Sideway DOWN"
  | "แนวโน้มลง"
  | "แนวโน้มลงแรง"

export interface AiScoreRow {
  rank: number
  symbol: string
  last: number // ราคาล่าสุด
  volToday: number // volume วันนี้ (หุ้น) — ประมาณจาก มูลค่า ÷ ราคา
  avgVol5D: number // เฉลี่ย volume 5 วันก่อนหน้า
  cmprPct: number // %CMPR = volToday ÷ avgVol5D × 100
  ema12: number
  ema30: number
  perc: number // %Diff EMA12-30 = (EMA12 − EMA30) ÷ EMA30 × 100
  trend: { label: AiTrendLabel; score: number }
  heikin: {
    score: number
    streak: number // จำนวนแท่งต่อเนื่องล่าสุด (ทิศตาม dir)
    dir: "up" | "down" | "flat"
    bullCount: number // แท่งขาขึ้นใน 10 แท่งล่าสุด
    desc: string
  }
  parts: { cmpr: number; perc: number; trend: number; heikin: number }
  aiScore: number // ผลรวม 4 องค์ประกอบ
  note: string // บรรทัดตีความภาษาไทย (แนวเทียบ/EMA)
}

export interface AiScoreResponse {
  date: string // วันที่ข้อมูลล่าสุด
  generatedAt: string // เวลาคำนวณล่าสุด (ISO)
  rows: AiScoreRow[] // เรียงตาม cmprPct มาก → น้อย (top 30)
  formula: string
  tookMs: number
  message: string // แจ้งเตือนเมื่อข้อมูลไม่พอ เป็นต้น
}

// ---------- Market feed (แหล่งข้อมูลจริง) ----------
// แหล่งที่ระบบรู้จัก: yahoo = ดึงจาก server ได้ทันที · set = ผ่านสคริปต์ Python (settfex) บนเครื่องผู้ใช้
// · settrade = Settrade Open API (ทางการ ต้องมีบัญชี) · csv = นำเข้าเอง — ทุกทางเข้าท่อ ingest เดียวกัน
export type FeedSource = "yahoo" | "set" | "settrade" | "csv"
export type FeedRange = "6mo" | "1y" | "2y" | "3y" | "5y" | "max"

export interface FeedPreset {
  id: string
  label: string
  description: string
  symbols: string[]
}
export interface FeedSourceInfo {
  id: FeedSource
  label: string
  /** เรียกจาก server ของแพลตฟอร์มได้เลย (true) หรือต้องรันสคริปต์ภายนอก (false) */
  serverSide: boolean
  /** ความจริงของข้อมูลที่ได้ — แสดงบนการ์ดเสมอ */
  dataNote: string
  howTo: string
}
export interface FeedInfoResponse {
  presets: FeedPreset[]
  sources: FeedSourceInfo[]
  defaultRange: FeedRange
  /** symbol → sector (TH_SECTORS) ของ universe ตั้งต้น */
  sectorMap: Record<string, string>
}

export interface FeedSymbolReport {
  symbol: string
  ok: boolean
  bars: number
  firstDate: string | null
  lastDate: string | null
  warnings: string[]
  error?: string
}

export interface FeedFetchRequest {
  source?: "yahoo"
  symbols: string[]
  range?: FeedRange
  /** ปรับราคาด้วยปันผล/สปลิต (adjclose) — ค่าเริ่มต้น true (โมเมนตัมข้ามวัน XD ไม่กระโดด) */
  adjusted?: boolean
  /** ล้างข้อมูล demo (seed) ก่อนนำเข้า เพื่อไม่ให้หุ้นจำลองปนกับหุ้นจริง */
  replaceDemo?: boolean
  /** symbol → sector (ทับค่าตั้งต้นได้) */
  sectors?: Record<string, string>
}

export interface FeedIngestRow {
  date: string
  symbol: string
  close: number
  open?: number | null
  high?: number | null
  low?: number | null
  /** มูลค่าซื้อขาย (บาท) — ถ้าไม่มีให้ส่ง volume แทน ระบบจะประมาณ close×volume */
  val?: number | null
  volume?: number | null
}
export interface FeedIngestRequest {
  source: FeedSource | string
  rows: FeedIngestRow[]
  sectors?: Record<string, string>
  replaceDemo?: boolean
}

export interface FeedFetchResponse {
  ok: boolean
  source: string
  requested: number
  fetched: number
  failed: number
  rowsFetched: number
  reports: FeedSymbolReport[]
  ingest: { insertedRaw: number; updatedRows: number; snapDates: number; latestDate: string | null } | null
  sectorRows: number
  replacedDemo: boolean
  notes: string[]
  tookMs: number
  message: string
}
