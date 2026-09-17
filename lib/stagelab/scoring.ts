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

/** The checklist's ceiling, computed once from the items themselves. */
export const TECHNICAL_MAX = technicalScore({
  stage: 2,
  maSlopePct: Number.MAX_SAFE_INTEGER,
  mansfieldRs: Number.MAX_SAFE_INTEGER,
  rsRising: true,
  volRatio: Number.MAX_SAFE_INTEGER,
  sectorStage: 2,
  marketStage: 2,
  epsGrowthPct: Number.MAX_SAFE_INTEGER,
  revenueGrowthPct: Number.MAX_SAFE_INTEGER,
}).max

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

/**
 * The technical checklist.
 *
 * It was called `tech17` and every surface rendered "x/17". Adding up the nine
 * items gives 3+2+2+2+1+2+1+2+1 = **16**. The seventeenth point did not exist,
 * so a perfect technical read displayed as 16/17 and a 94%-full progress bar,
 * and the schema accepted a hand-typed 17 that the engine itself could never
 * produce.
 *
 * Rather than inventing a point to justify the name, the ceiling is now
 * COMPUTED from the items and returned. Nothing downstream hardcodes it, so
 * adding or removing a check can no longer put the denominator out of step
 * with the arithmetic.
 */
export function technicalScore(i: Tech17Input): {
  score: number
  max: number
  parts: PinePart[]
} {
  const parts: PinePart[] = []
  let max = 0
  const add = (label: string, pts: number, itemMax: number) => {
    max += itemMax
    parts.push({ label: `${label} (${pts}/${itemMax})`, delta: pts })
  }

  add('Stage 2', i.stage === 2 ? 3 : 0, 3)
  add('MA slope แข็ง', i.maSlopePct > 0.5 ? 2 : 0, 2)
  add(
    'Mansfield RS',
    i.mansfieldRs > 5 ? 2 : i.mansfieldRs > 0 ? 1 : 0,
    2,
  )
  add('Volume ยืนยัน', i.volRatio > 1.5 ? 2 : 0, 2)
  // The label says "RS rising"; the condition also required RS to be positive,
  // which line above already scores. A stock whose RS is rising hard but still
  // negative — the textbook Stage 1→2 accumulation this engine exists to
  // catch — scored zero here and was told its RS was not rising.
  add('RS rising', i.rsRising ? 1 : 0, 1)
  add('Sector Stage 2', i.sectorStage === 2 ? 2 : 0, 2)
  add('Market Stage 2', i.marketStage === 2 ? 1 : 0, 1)
  add('EPS Growth', i.epsGrowthPct > 25 ? 2 : i.epsGrowthPct > 15 ? 1 : 0, 2)
  add('Revenue Growth', i.revenueGrowthPct > 15 ? 1 : 0, 1)

  const score = parts.reduce((a, p) => a + p.delta, 0)
  return { score, max, parts }
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
  /** Computed from the items, never asserted. */
  max: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D'
  parts: {
    cat: string
    label: string
    pts: number
    /** What THIS item is worth. Was previously the whole category's budget,
     *  so a fully-earned 2-point item rendered as "2/6" and the UI's
     *  "complete" colour — which tests pts === max — could never fire for any
     *  row in the table. */
    max: number
    /** The category's total budget, for grouping. */
    categoryMax: number
  }[]
}

export function fundScore(f: FundInput): FundBreakdown {
  const parts: FundBreakdown['parts'] = []
  const push = (cat: string, label: string, ok: boolean, pts: number, categoryMax: number) =>
    parts.push({ cat, label, pts: ok ? pts : 0, max: pts, categoryMax })

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
  const max = parts.reduce((a, p) => a + p.max, 0)
  const grade: FundBreakdown['grade'] =
    score >= 16 ? 'A+' : score >= 12 ? 'A' : score >= 8 ? 'B' : score >= 4 ? 'C' : 'D'
  return { score, max, grade, parts }
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

/** Highest fundamental score the checklist can produce, derived from its items. */
export const FUNDAMENTAL_MAX = fundScore({
  epsGrowthPct: Number.MAX_SAFE_INTEGER,
  epsAccelerating: true,
  cfoGeNi: true,
  revenueGrowthPct: Number.MAX_SAFE_INTEGER,
  recurringRev: true,
  gmExpanding: true,
  opMarginAboveInd: true,
  debtEquity: 0,
  currentRatio: Number.MAX_SAFE_INTEGER,
  fcfYieldPct: Number.MAX_SAFE_INTEGER,
  foreignNetBuy: true,
  fundIncreasing: true,
  insiderBuying: true,
}).max

/** Highest total the two checklists can actually produce, derived from both. */
export const COMBINED_MAX = TECHNICAL_MAX + FUNDAMENTAL_MAX

/**
 * Combine the two checklists into a tier.
 *
 * The tier `text` used to name specifics this function cannot observe — it
 * receives two integers, and the S-tier line asserted "Stage 2A + Triple
 * Confirm + Earnings Acceleration + FCF แข็ง + สถาบันซื้อ" for ANY pair summing
 * to 30, including a Stage 4 name. It was rendered as the card's subtitle,
 * i.e. as a description of that specific idea. Each line now describes only
 * the two numbers it was given.
 *
 * The ceiling is derived rather than the old hardcoded 37, which was one point
 * above anything the engine could produce.
 */
export function combinedScore(tech: number, fund: number): Combined {
  const score = Math.max(0, Math.min(COMBINED_MAX, tech + fund))
  if (score >= 30)
    return {
      score, tier: 'S', label: 'S-Tier', riskPct: 2, sizeLabel: 'Full Position',
      badge: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40',
      text: 'คะแนนเทคนิคและพื้นฐานสูงทั้งคู่ — เต็มเพดานที่ระบบให้ได้',
      advice: 'เข้าไม้เต็มสูตรตามระบบ — Perfect Storm setup',
    }
  if (score >= 23)
    return {
      score, tier: 'A', label: 'A-Tier', riskPct: 1.5, sizeLabel: 'Standard Position',
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      text: 'เทคนิคและพื้นฐานผ่านเกณฑ์ทั้งสองด้าน',
      advice: 'เข้าไม้ขนาดปกติ ยืนยัน Volume ตอนเข้า',
    }
  if (score >= 16)
    return {
      score, tier: 'B', label: 'B-Tier', riskPct: 1, sizeLabel: 'Half Position',
      badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      text: 'ด้านหนึ่งแข็ง อีกด้านปานกลาง',
      advice: 'ลดขนาดไม้ครึ่งหนึ่ง ตั้ง Stop เข้มงวด',
    }
  if (score >= 10)
    return {
      score, tier: 'C', label: 'C-Tier', riskPct: 0.5, sizeLabel: 'Quarter Position',
      badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      text: 'คะแนนรวมต่ำ — อย่างน้อยหนึ่งด้านอ่อนชัดเจน',
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
// S2B ("late Stage 2") was in this union and in the matrix, and `riskCell`
// could never route to it: reaching that branch required a stage outside 1-4,
// which the schema rejects. Four cells of the published matrix — including the
// one that refuses a weak late-stage-2 name — silently never fired, and such
// stocks were scored on the full S2 row instead. There is no late-stage-2
// signal anywhere in the data, so the row is removed rather than left as a
// feature that exists only in the type.
export type StageBand = 'S2A' | 'S2' | 'S1' | 'S3' | 'S4'

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
  else if (stage === 2) sb = triple ? 'S2A' : 'S2'
  // Anything else — including a stage the schema should have rejected — is
  // treated as Stage 1: not yet a buy. Falling through to a Stage 2 row on an
  // unknown stage was the unsafe direction to guess in.
  else sb = 'S1'
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
    // A percentage change is only a growth rate when the base is a profit.
    // Off a loss the arithmetic still produces a number — -5 to -3 came out as
    // "+40%" — but it describes a shrinking loss, not growth, and the table
    // coloured it green. From a non-positive base there is no honest
    // percentage to show, so the row says "—" instead of inventing one.
    const yoy = prevYear !== null && prevYear > 0 ? ((q.eps - prevYear) / prevYear) * 100 : null
    const qoq = prevQ !== null && prevQ > 0 ? ((q.eps - prevQ) / prevQ) * 100 : null
    const prevQoq =
      i > 1 && quarters[i - 2].eps > 0
        ? ((quarters[i - 1].eps - quarters[i - 2].eps) / quarters[i - 2].eps) * 100
        : null
    const accelerating = qoq !== null && prevQoq !== null ? qoq > prevQoq : null
    return { ...q, yoy, qoq, accelerating }
  })

  const last = rows[rows.length - 1]
  const prev = rows[rows.length - 2]

  // Acceleration needs BOTH derivatives: growth that is itself speeding up.
  //
  // This was previously a second-derivative test alone — `thisQoQ > lastQoQ` —
  // with no sign condition on growth itself. An EPS series of 100 → 10 → 2 →
  // 1.5 satisfies it (the rate of collapse is easing) and the UI duly reported
  // "กำไรกำลังเร่งตัว" for a company losing 90% of its earnings. The second
  // clause of the old condition was also provably identical to the first, so
  // it is gone rather than merely corrected.
  //
  // Requiring `qoq > 0` also disposes of the loss-making case, because a
  // quarter-on-quarter figure now exists only when the base quarter was
  // profitable: 2 → -5 → -3 → -1 has no growth rate to compare.
  const accelerating =
    last?.qoq != null && prev?.qoq != null && last.qoq > 0 && last.qoq > prev.qoq
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
    return { label: 'Best Case', tone: 'low', action: 'Strong Buy', note: 'Foreign ซื้อหนัก + Stage 2 = สถาบันสะสม — เข้าเต็มสูตรได้' }
  if (stage === 2 && flow === 'BUY')
    return { label: 'Good Case', tone: 'low', action: 'Buy', note: 'Foreign ซื้อเล็กน้อย + Stage 2 = ยืนยันแนวโน้ม' }
  // Selling in Stage 2 used to fall through to the FLAT branch below, so a
  // stock institutions were dumping was reported as "flow is flat, you may
  // enter". The function was handed the opposite of what it said. Price rising
  // while institutions leave is the distribution pattern this whole module
  // exists to catch — it cannot be the one case it stays silent about.
  if (stage === 2 && flow === 'SELL_HEAVY')
    return {
      label: 'ขัดแย้ง',
      tone: 'exit',
      action: 'ห้ามเข้าเพิ่ม',
      note: 'ราคายังอยู่ Stage 2 แต่ต่างชาติขายหนัก — รูปแบบการกระจายของ ไม่ใช่การสะสม',
    }
  if (stage === 2 && flow === 'SELL')
    return {
      label: 'ระวัง',
      tone: 'high',
      action: 'Reduce',
      note: 'Stage 2 แต่ต่างชาติขายสุทธิ — ลดขนาดไม้ และรอให้ flow กลับก่อนเพิ่ม',
    }
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
  const t17 = technicalScore({
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
