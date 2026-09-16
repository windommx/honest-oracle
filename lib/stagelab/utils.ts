import type {
  MarketScoreResult,
  Position,
  Stock,
} from './types'

// ─── Week key (Monday of current week) ──────────────────────────────────────
export function weekKey(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return m.toISOString().slice(0, 10)
}

// ─── Stage metadata & colors (dark theme) ───────────────────────────────────
export const STAGE_META: Record<
  number,
  { label: string; th: string; badge: string; dot: string; text: string; bar: string }
> = {
  1: {
    label: 'Stage 1 · Basing',
    th: 'Stage 1 – สะสมฐาน',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    bar: 'bg-amber-400',
  },
  2: {
    label: 'Stage 2 · Advancing',
    th: 'Stage 2 – ขาขึ้น',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    bar: 'bg-emerald-400',
  },
  3: {
    label: 'Stage 3 · Topping',
    th: 'Stage 3 – ยอดพีค',
    badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    dot: 'bg-orange-400',
    text: 'text-orange-400',
    bar: 'bg-orange-400',
  },
  4: {
    label: 'Stage 4 · Declining',
    th: 'Stage 4 – ขาลง',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    dot: 'bg-red-400',
    text: 'text-red-400',
    bar: 'bg-red-400',
  },
}

export const PRIORITY_COLORS: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'A+': 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40',
  B: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  C: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  D: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export const ACTION_TYPE_META: Record<string, { label: string; badge: string }> = {
  BUY: { label: 'ซื้อ', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  SELL: { label: 'ขาย', badge: 'bg-red-500/15 text-red-400 border-red-500/30' },
  ADD: { label: 'เพิ่มไม้', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  ALERT: { label: 'Alert', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  EVENT: { label: 'Event', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
}

// ─── Market Score (5 checks × 2 points) ─────────────────────────────────────
export function calcMarketScore(f: {
  setAboveMa: boolean
  maRising: boolean
  breadthOk: boolean
  adConfirm: boolean
  foreignBuy: boolean
}): MarketScoreResult {
  const score =
    (f.setAboveMa ? 2 : 0) +
    (f.maRising ? 2 : 0) +
    (f.breadthOk ? 2 : 0) +
    (f.adConfirm ? 2 : 0) +
    (f.foreignBuy ? 2 : 0)
  if (score >= 8)
    return { score, max: 10, stageNum: 2, stageLabel: 'Stage 2 ชัดเจน', equityPct: '80–100%', recommendation: 'โหลดพอร์ตหุ้นเต็มที่ตามเงื่อนไข — ตลาดขาขึ้นชัดเจน' }
  if (score >= 6)
    return { score, max: 10, stageNum: 2, stageLabel: 'Stage 2 อ่อน', equityPct: '50–70%', recommendation: 'ถือหุ้นระดับกลาง เลือกเฉพาะ Setup A/A+ ยืนยันบางส่วน' }
  if (score >= 4)
    return { score, max: 10, stageNum: 1, stageLabel: 'Stage 1/3 (ก้ำกึ่ง)', equityPct: '20–40%', recommendation: 'ถนอมพอร์ต ลดขนาดไม้ เน้นเงินสดและ Watchlist เตรียมกำลังซื้อ' }
  return { score, max: 10, stageNum: 4, stageLabel: 'Stage 4 (ตลาดหมี)', equityPct: '0–10%', recommendation: 'ถือเงินสดเป็นหลัก พิจารณา Defensive / Short ตามระบบเท่านั้น' }
}

// ─── Portfolio helpers ───────────────────────────────────────────────────────
export function pnlPct(p: Position): number {
  const basis = p.status === 'CLOSED' ? (p.closedPrice ?? p.currentPrice) : p.currentPrice
  return ((basis - p.entryPrice) / p.entryPrice) * 100
}

export function suggestAction(p: Position): {
  action: 'CUT' | 'SELL' | 'HOLD' | 'WATCH'
  label: string
  badge: string
} {
  const cur = p.status === 'CLOSED' ? (p.closedPrice ?? p.currentPrice) : p.currentPrice
  if (cur < p.stopLoss)
    return { action: 'CUT', label: 'ขายทันที (หลุด Stop)', badge: 'bg-red-500/20 text-red-300 border-red-500/40' }
  if (p.currentStage === 4)
    return { action: 'CUT', label: 'ขายทันที (Stage 4)', badge: 'bg-red-500/20 text-red-300 border-red-500/40' }
  if (p.currentStage === 3)
    return { action: 'SELL', label: 'เริ่มขายทยอย (Stage 3)', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40' }
  if (p.currentStage === 2 && cur >= p.stopLoss * 1.1)
    return { action: 'HOLD', label: 'ถือต่อ (Stage 2 แข็ง)', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
  return { action: 'WATCH', label: 'เฝ้าระวัง', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' }
}

export function positionValue(p: Position): number {
  const price = p.status === 'CLOSED' ? (p.closedPrice ?? p.currentPrice) : p.currentPrice
  return price * p.quantity
}

// ─── Tools calculators ───────────────────────────────────────────────────────
export function positionSize(capital: number, riskPct: number, entry: number, stop: number) {
  const riskAmount = capital * (riskPct / 100)
  const perShareRisk = Math.abs(entry - stop)
  if (perShareRisk <= 0) return { shares: 0, riskAmount, positionValue: 0, capitalPct: 0 }
  const shares = Math.floor(riskAmount / perShareRisk)
  const positionValue = shares * entry
  return { shares, riskAmount, positionValue, capitalPct: (positionValue / capital) * 100 }
}

export function kelly(winRatePct: number, avgWin: number, avgLoss: number) {
  if (avgLoss <= 0 || avgWin <= 0) return { f: 0, half: 0, edge: 0 }
  const p = winRatePct / 100
  const q = 1 - p
  const b = avgWin / avgLoss
  const f = (p * b - q) / b
  return { f: f * 100, half: (f / 2) * 100, edge: (p * avgWin - q * avgLoss) * 100 }
}

export function chandelier(highestHigh: number, atr: number, mult = 3) {
  return highestHigh - mult * atr
}

export function rrRatio(entry: number, stop: number, target: number) {
  const risk = Math.abs(entry - stop)
  const reward = Math.abs(target - entry)
  if (risk <= 0) return 0
  return reward / risk
}

// ─── Screening funnel (client-side filter chain) ─────────────────────────────
export interface FunnelFilters {
  minVolume: number
  requireAboveMa: boolean
  minSlope: number
  requireRsPositive: boolean
  strongSectors: string[]
  minEps: number
}

export const DEFAULT_FILTERS: FunnelFilters = {
  minVolume: 10,
  requireAboveMa: true,
  minSlope: 0,
  requireRsPositive: true,
  strongSectors: [],
  minEps: 15,
}

export interface FunnelStep {
  key: string
  label: string
  sub: string
  count: number
}

export function runFunnel<T extends Stock>(stocks: T[], f: FunnelFilters) {
  let s = [...stocks]

  const stepVolume = s.filter((x) => x.weeklyVolumeM > f.minVolume)
  s = stepVolume

  const stepMa = s.filter((x) => !f.requireAboveMa || x.price > x.ma30w)
  s = stepMa

  const stepSlope = s.filter((x) => x.ma30wSlopePct > f.minSlope)
  s = stepSlope

  const stepRs = s.filter((x) => !f.requireRsPositive || x.mansfieldRs > 0)
  s = stepRs

  const stepSector =
    f.strongSectors.length > 0 ? s.filter((x) => f.strongSectors.includes(x.sector)) : s
  s = stepSector

  const stepEps = s.filter((x) => x.epsGrowthPct >= f.minEps)
  s = stepEps

  const steps: FunnelStep[] = [
    { key: 'universe', label: 'Universe', sub: 'หุ้นทั้งหมดในระบบ', count: stocks.length },
    { key: 'volume', label: 'Volume', sub: `ปริมาณซื้อขาย > ${f.minVolume}M/สัปดาห์`, count: stepVolume.length },
    { key: 'ma', label: 'เหนือ 30W MA', sub: 'ราคา > 30-week MA', count: stepMa.length },
    { key: 'slope', label: 'MA ชันขึ้น', sub: `ความชัน > ${f.minSlope}%`, count: stepSlope.length },
    { key: 'rs', label: 'Mansfield RS > 0', sub: 'แรงกว่าตลาด', count: stepRs.length },
    {
      key: 'sector',
      label: 'กลุ่มอุตสาหกรรมแข็ง',
      sub: f.strongSectors.length ? f.strongSectors.join(', ') : 'ไม่กรองกลุ่ม',
      count: stepSector.length,
    },
    { key: 'eps', label: 'EPS Growth', sub: `> ${f.minEps}%`, count: stepEps.length },
  ]

  return { steps, result: stepEps }
}

// ─── Formatting ──────────────────────────────────────────────────────────────
export function fmt(n: number, digits = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtSigned(n: number, digits = 2): string {
  return `${n > 0 ? '+' : ''}${fmt(n, digits)}`
}

export function fmtPct(n: number, digits = 1): string {
  return `${fmtSigned(n, digits)}%`
}

export function fmtBaht(n: number): string {
  return `฿${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
