// ─── Techno-Fundamental scoring engine ───────────────────────────────────────
// Ported from the Stage Analysis manual:
//  · Pine-style Technical Score (user's Pine Script v5 snippet)
//  · Technical Score 0-17 (Stage Quality, Google Sheets column H)
//  · Fundamental Quality Score 0-20
//  · Combined Mastery Score 0-37 → S/A/B/C/D tiers
//  · Risk Matrix (Stage × Fundamental quality)
//  · Earnings Acceleration Tracker
//  · Institutional Flow × Stage signal

import type { PinePart, Stock, StockTech } from './types'

// ─── 1. Pine-style score (direct port of the user's snippet) ────────────────

export function pineTechScore(input: {
  price: number
  ma: number
  maSlopePct: number
  mr: number // Mansfield RS now
  mrPrev: number
  volRatio: number
  candleUp: boolean
}): { score: number; parts: PinePart[] } {
  const parts: PinePart[] = []

  // score += priceAboveMA ? 2 : -2
  const above = input.price > input.ma
  parts.push({ label: 'ราคา > 30W MA', delta: above ? 2 : -2 })

  // score += maRising ? 2 : maFalling ? -2 : 0
  const rising = input.maSlopePct > 0.05
  const falling = input.maSlopePct < -0.05
  parts.push({ label: 'MA ชันขึ้น/หันลง', delta: rising ? 2 : falling ? -2 : 0 })

  // score += mr > 0 ? 2 : mr > -3 ? 0 : -2
  const mrDelta = input.mr > 0 ? 2 : input.mr > -3 ? 0 : -2
  parts.push({ label: 'Mansfield RS', delta: mrDelta })

  // score += mr > mr[1] ? 1 : -1
  parts.push({ label: 'RS มากขึ้นจากสัปดาห์ก่อน', delta: input.mr > input.mrPrev ? 1 : -1 })

  // score += volRatio > 1.5 and close > open ? 2 : volRatio > 1.5 and close < open ? -2 : 0
  const volDelta = input.volRatio > 1.5 ? (input.candleUp ? 2 : -2) : 0
  parts.push({ label: 'Volume Ratio + แท่งเทียน', delta: volDelta })

  const score = parts.reduce((a, p) => a + p.delta, 0)
  return { score, parts }
}

// ─── 2. Technical Score 0-17 (Stage Quality Score) ───────────────────────────
export interface Tech17Input {
  stage: number
  maSlopePct: number
  mansfieldRs: number
  rsRising: boolean
  volRatio: number
  sectorStage: number // stage of the stock's sector (this week) — 0 if unknown
  marketStage: number // market stage from Market Score — 0 if unknown
  epsGrowthPct: number
  revenueGrowthPct: number
}

export function tech17(i: Tech17Input): { score: number; parts: PinePart[] } {
  const parts: PinePart[] = []
  const add = (label: string, pts: number, max: number) =>
    parts.push({ label: `${label} (${pts}/${max})`, delta: pts })

  add('Stage 2', i.stage === 2 ? 3 : 0, 3)
  add('MA slope แข็ง', i.maSlopePct > 0.5 ? 2 : 0, 2)
  add(
    'Mansfield RS',
    i.mansfieldRs > 5 ? 2 : i.mansfieldRs > 0 ? 1 : 0,
    2,
  )
  add('Volume ยืนยัน', i.volRatio > 1.5 ? 2 : 0, 2)
  add('RS  rising', i.rsRising && i.mansfieldRs > 0 ? 1 : 0, 1)
  add('Sector Stage 2', i.sectorStage === 2 ? 2 : 0, 2)
  add('Market Stage 2', i.marketStage === 2 ? 1 : 0, 1)
  add('EPS Growth', i.epsGrowthPct > 25 ? 2 : i.epsGrowthPct > 15 ? 1 : 0, 2)
  add('Revenue Growth', i.revenueGrowthPct > 15 ? 1 : 0, 1)

  const score = parts.reduce((a, p) => a + p.delta, 0)
  return { score, parts }
}

// ─── 3. Fundamental Quality Score (0-20) ─────────────────────────────────────
export interface FundInput {
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
}

export interface FundBreakdown {
  score: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D'
  parts: { cat: string; label: string; pts: number; max: number }[]
}

export function fundScore(f: FundInput): FundBreakdown {
  const parts: FundBreakdown['parts'] = []
  const push = (cat: string, label: string, ok: boolean, pts: number, max: number) =>
    parts.push({ cat, label, pts: ok ? pts : 0, max })

  // A. EARNINGS QUALITY (6)
  push('Earnings', 'EPS Growth YoY > 25%', f.epsGrowthPct > 25, 2, 6)
  push('Earnings', 'EPS เร่งตัว (QoQ)', f.epsAccelerating, 2, 6)
  push('Earnings', 'Operating CF ≥ Net Profit', f.cfoGeNi, 2, 6)

  // B. REVENUE QUALITY (4)
  push('Revenue', 'Revenue Growth > 15%', f.revenueGrowthPct > 15, 2, 4)
  push('Revenue', 'Revenue เร่งตัว', f.revenueGrowthPct > 20 && f.epsAccelerating, 1, 4)
  push('Revenue', 'Recurring Revenue > 50%', f.recurringRev, 1, 4)

  // C. MARGIN QUALITY (4)
  push('Margin', 'Gross Margin ขยายตัว YoY', f.gmExpanding, 2, 4)
  push('Margin', 'Operating Margin > ค่าเฉลี่ยกลุ่ม', f.opMarginAboveInd, 2, 4)

  // D. BALANCE SHEET (3)
  push('Balance', 'Debt/Equity < 1.0', f.debtEquity < 1, 1, 3)
  push('Balance', 'Current Ratio > 1.5', f.currentRatio > 1.5, 1, 3)
  push('Balance', 'FCF Yield > 3%', f.fcfYieldPct > 3, 1, 3)

  // E. INSTITUTIONAL SIGNAL (3)
  push('Institution', 'Foreign/NVDR Net Buy', f.foreignNetBuy, 1, 3)
  push('Institution', 'กองทุนเพิ่มน้ำหนัก', f.fundIncreasing, 1, 3)
  push('Institution', 'Insider Buying', f.insiderBuying, 1, 3)

  const score = parts.reduce((a, p) => a + p.pts, 0)
  const grade: FundBreakdown['grade'] =
    score >= 16 ? 'A+' : score >= 12 ? 'A' : score >= 8 ? 'B' : score >= 4 ? 'C' : 'D'
  return { score, grade, parts }
}

// ─── 4. Combined Mastery Score (0-37) ────────────────────────────────────────
export interface Combined {
  score: number
  tier: 'S' | 'A' | 'B' | 'C' | 'D'
  label: string
  riskPct: number
  sizeLabel: string
  badge: string
  text: string
  advice: string
}

export function combinedScore(tech: number, fund: number): Combined {
  const score = Math.max(0, Math.min(37, tech + fund))
  if (score >= 30)
    return {
      score, tier: 'S', label: 'S-Tier', riskPct: 2, sizeLabel: 'Full Position',
      badge: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40',
      text: 'Stage 2A + Triple Confirm + Earnings Acceleration + FCF แข็ง + สถาบันซื้อ',
      advice: 'เข้าไม้เต็มสูตรตามระบบ — Perfect Storm setup',
    }
  if (score >= 23)
    return {
      score, tier: 'A', label: 'A-Tier', riskPct: 1.5, sizeLabel: 'Standard Position',
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      text: 'Stage 2 + Fundamental ดี',
      advice: 'เข้าไม้ขนาดปกติ ยืนยัน Volume ตอนเข้า',
    }
  if (score >= 16)
    return {
      score, tier: 'B', label: 'B-Tier', riskPct: 1, sizeLabel: 'Half Position',
      badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      text: 'Stage 2 แต่ Fundamental ปานกลาง',
      advice: 'ลดขนาดไม้ครึ่งหนึ่ง ตั้ง Stop เข้มงวด',
    }
  if (score >= 10)
    return {
      score, tier: 'C', label: 'C-Tier', riskPct: 0.5, sizeLabel: 'Quarter Position',
      badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      text: 'Technical ดี แต่ Fundamental อ่อน — อาจเป็น False Breakout',
      advice: 'เข้าเฉพาะไม้ทดสอบขนาดเล็ก หรือเฝ้าดูก่อน',
    }
  return {
    score, tier: 'D', label: 'D-Tier', riskPct: 0, sizeLabel: 'DO NOT BUY',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    text: 'ไม่ว่ากราฟจะสวยแค่ไหน — ห้ามซื้อ',
    advice: 'เก็บไว้ใน Watchlist เพื่อเรียนรู้เท่านั้น',
  }
}

// ─── 5. Risk Matrix (Stage × Fundamental Quality) ────────────────────────────
export type FundBand = 'APLUS' | 'A' | 'B' | 'CD'
export type StageBand = 'S2A' | 'S2' | 'S2B' | 'S1' | 'S3' | 'S4'

export interface RiskCell {
  risk: string
  size: string
  tone: 'low' | 'med' | 'high' | 'exit' | 'no'
}

export function fundBand(fund: number): FundBand {
  if (fund >= 16) return 'APLUS'
  if (fund >= 12) return 'A'
  if (fund >= 8) return 'B'
  return 'CD'
}

export const RISK_MATRIX: Record<StageBand, Record<FundBand, RiskCell>> = {
  S2A: {
    APLUS: { risk: '2%', size: 'Full', tone: 'low' },
    A: { risk: '1.5%', size: 'Standard', tone: 'low' },
    B: { risk: '1%', size: 'Half', tone: 'med' },
    CD: { risk: '0.5%', size: 'Quarter', tone: 'high' },
  },
  S2: {
    APLUS: { risk: '1.5%', size: 'Standard', tone: 'low' },
    A: { risk: '1%', size: 'Half', tone: 'med' },
    B: { risk: '0.75%', size: 'Quarter', tone: 'med' },
    CD: { risk: '0.5%', size: 'Minimal', tone: 'high' },
  },
  S2B: {
    APLUS: { risk: '1%', size: 'Half', tone: 'med' },
    A: { risk: '0.75%', size: 'Quarter', tone: 'med' },
    B: { risk: '0.5%', size: 'Minimal', tone: 'high' },
    CD: { risk: '0%', size: 'DO NOT BUY', tone: 'no' },
  },
  S1: {
    APLUS: { risk: '0.5%', size: 'Speculative', tone: 'med' },
    A: { risk: '0.25%', size: 'Minimal', tone: 'high' },
    B: { risk: '0%', size: 'DO NOT BUY', tone: 'no' },
    CD: { risk: '0%', size: 'DO NOT BUY', tone: 'no' },
  },
  S3: {
    APLUS: { risk: '—', size: 'REDUCE 25%', tone: 'med' },
    A: { risk: '—', size: 'SELL 50%', tone: 'high' },
    B: { risk: '—', size: 'EXIT 75%', tone: 'high' },
    CD: { risk: '—', size: 'EXIT 100%', tone: 'exit' },
  },
  S4: {
    APLUS: { risk: '—', size: 'EXIT ALL', tone: 'exit' },
    A: { risk: '—', size: 'EXIT ALL', tone: 'exit' },
    B: { risk: '—', size: 'EXIT ALL', tone: 'exit' },
    CD: { risk: '—', size: 'EXIT ALL', tone: 'exit' },
  },
}

export function riskCell(stage: number, fund: number, triple = false): RiskCell {
  const band = fundBand(fund)
  let sb: StageBand
  if (stage === 4) sb = 'S4'
  else if (stage === 3) sb = 'S3'
  else if (stage === 1) sb = 'S1'
  else sb = triple ? 'S2A' : stage === 2 ? 'S2' : 'S2B'
  return RISK_MATRIX[sb][band]
}

// ─── 6. Earnings Acceleration Tracker ────────────────────────────────────────
export interface EarningsQ {
  label: string
  eps: number
}

export interface EarningsRow extends EarningsQ {
  yoy: number | null
  qoq: number | null
  accelerating: boolean | null
}

export function earningsAnalysis(quarters: EarningsQ[]): {
  rows: EarningsRow[]
  accelerating: boolean
  decelerating: boolean
  latestYoY: number | null
} {
  const rows: EarningsRow[] = quarters.map((q, i) => {
    const prevYear = i >= 4 ? quarters[i - 4].eps : null
    const prevQ = i > 0 ? quarters[i - 1].eps : null
    const yoy = prevYear !== null && prevYear !== 0 ? ((q.eps - prevYear) / Math.abs(prevYear)) * 100 : null
    const qoq = prevQ !== null && prevQ !== 0 ? ((q.eps - prevQ) / Math.abs(prevQ)) * 100 : null
    const prevQoq =
      i > 1 && quarters[i - 1].eps !== 0 && quarters[i - 2].eps !== 0
        ? ((quarters[i - 1].eps - quarters[i - 2].eps) / Math.abs(quarters[i - 2].eps)) * 100
        : null
    const accelerating = qoq !== null && prevQoq !== null ? qoq > prevQoq : null
    return { ...q, yoy, qoq, accelerating }
  })

  const last = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const accelerating =
    last?.accelerating === true ||
    (last?.qoq !== null && prev?.qoq !== null && last?.qoq !== undefined && prev?.qoq !== undefined && (last?.qoq ?? 0) > (prev?.qoq ?? 0))
  const decelerating =
    last?.qoq != null && prev?.qoq != null && last.qoq < prev.qoq

  return { rows, accelerating: !!accelerating, decelerating: !!decelerating, latestYoY: last?.yoy ?? null }
}

// ─── 7. Institutional Flow × Stage ───────────────────────────────────────────
export type FlowLevel = 'BUY_HEAVY' | 'BUY' | 'FLAT' | 'SELL' | 'SELL_HEAVY'

export interface FlowSignal {
  label: string
  tone: 'low' | 'med' | 'high' | 'exit' | 'trap'
  action: string
  note: string
}

export function flowSignal(flow: FlowLevel, stage: number): FlowSignal {
  if (stage === 4 && (flow === 'BUY_HEAVY' || flow === 'BUY'))
    return {
      label: 'กับดัก!',
      tone: 'trap',
      action: 'ห้ามซื้อ',
      note: 'ต่างชาติซื้อแต่ราคาอยู่ใน Stage 4 — มักเป็นการกระจายหุ้น (Distribution) ก่อนลงต่อ',
    }
  if (stage === 4)
    return { label: 'อันตราย', tone: 'exit', action: 'EXIT', note: 'Foreign ขายสุทธิ + Stage 4 = Markdown ยืนยัน ห้ามซื้อ' }
  if (stage === 3)
    return flow === 'SELL_HEAVY' || flow === 'SELL'
      ? { label: 'เตือน', tone: 'exit', action: 'EXIT', note: 'Distribution ชัดเจน — สถาบันเริ่มขาย' }
      : { label: 'เตือน', tone: 'high', action: 'REDUCE', note: 'Stage 3 เริ่มกระจาย — ลดพอร์ตทยอย' }
  if (stage === 2 && flow === 'BUY_HEAVY')
    return { label: 'Best Case', tone: 'low', action: 'Strong Buy', note: 'Foreign ซื้อหนัก + Stage 2A = สถาบันสะสม — เข้าเต็มสูตรได้' }
  if (stage === 2 && flow === 'BUY')
    return { label: 'Good Case', tone: 'low', action: 'Buy', note: 'Foreign ซื้อเล็กน้อย + Stage 2 = ยืนยันแนวโน้ม' }
  if (stage === 2)
    return { label: 'Neutral', tone: 'med', action: 'Cautious Buy', note: 'Flow ทรงตัว — เข้าได้แต่ลดขนาด' }
  // Stage 1
  return flow === 'BUY_HEAVY' || flow === 'BUY'
    ? { label: 'สะสมต้นทาง', tone: 'med', action: 'Watch', note: 'Foreign เริ่มซื้อใน Stage 1 = อาจใกล้ Breakout — เฝ้าดูจนยืนยัน' }
    : { label: 'รอ', tone: 'high', action: 'Wait', note: 'ยังไม่มีสัญญาณสถาบัน — รอ Stage เปลี่ยน' }
}

export const FLOW_OPTIONS: { value: FlowLevel; label: string }[] = [
  { value: 'BUY_HEAVY', label: 'ซื้อหนัก (Net Buy ใหญ่)' },
  { value: 'BUY', label: 'ซื้อเล็กน้อย' },
  { value: 'FLAT', label: 'ทรงตัว' },
  { value: 'SELL', label: 'ขายเล็กน้อย' },
  { value: 'SELL_HEAVY', label: 'ขายหนัก' },
]

// ─── 8. Stock snapshot enrichment ────────────────────────────────────────────
export function enrichStock(
  s: Stock,
  ctx: {
    rsPrev: number
    volRatio: number
    candleUp: boolean
    atr: number
    highestHigh10: number
    lastClose: number
  },
  sectorStage: number,
  marketStage: number,
): StockTech {
  const pine = pineTechScore({
    price: s.price,
    ma: s.ma30w,
    maSlopePct: s.ma30wSlopePct,
    mr: s.mansfieldRs,
    mrPrev: ctx.rsPrev,
    volRatio: ctx.volRatio,
    candleUp: ctx.candleUp,
  })
  const t17 = tech17({
    stage: s.stage,
    maSlopePct: s.ma30wSlopePct,
    mansfieldRs: s.mansfieldRs,
    rsRising: s.mansfieldRs > ctx.rsPrev,
    volRatio: ctx.volRatio,
    sectorStage,
    marketStage,
    epsGrowthPct: s.epsGrowthPct,
    revenueGrowthPct: s.epsGrowthPct * 0.8, // proxy — revenue track eps direction
  })
  const breakout = s.price > ctx.highestHigh10 && ctx.volRatio > 1.5 && s.mansfieldRs > 0
  return {
    pineScore: pine.score,
    pineParts: pine.parts,
    tech17: t17.score,
    tech17Parts: t17.parts,
    volRatio: r(ctx.volRatio),
    rsRising: s.mansfieldRs > ctx.rsPrev,
    candleUp: ctx.candleUp,
    atr: r(ctx.atr),
    highestHigh10: r(ctx.highestHigh10),
    breakout,
  }
}

function r(x: number): number {
  return Math.round(x * 100) / 100
}
