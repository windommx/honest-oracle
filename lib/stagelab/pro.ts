// ─── Pro Desk engine — Short Selling / Sector Rotation / MTF / Options ──────
// Pure functions shared by API routes (server) and the Pro view (client math
// such as option payoff). Uses only the deterministic market sim.
import type {
  MtfLeg,
  MtfResult,
  OptionLeg,
  OptionPoint,
  OptionStats,
  OptionStrategy,
  RotationPhase,
  RotationResult,
  ShortCandidate,
  Stock,
  StockWithTech,
} from './types'
import { genSeries } from './market-sim'
import { fmt } from './utils'

// ─── 1. Short Selling desk (Stage 4) ────────────────────────────────────────
// Entry logic (จากคู่มือ): short on failed rallies INTO the falling 30W MA,
// stop above the recent 10-week high, cover target at the next prior base.
export function shortCandidates(stocks: StockWithTech[]): ShortCandidate[] {
  const out: ShortCandidate[] = []
  for (const s of stocks) {
    if (s.stage !== 4) continue
    if (s.price >= s.ma30w) continue
    if (s.ma30wSlopePct >= 0) continue
    if (s.mansfieldRs > -1) continue // RS must be clearly weaker than market

    const belowMaPct = ((s.ma30w - s.price) / s.ma30w) * 100
    // Strength score 0-100: weaker RS + steeper MA + extended below MA = stronger
    const rsPart = Math.min(45, Math.max(0, -s.mansfieldRs) * 2.2)
    const slopePart = Math.min(25, Math.abs(s.ma30wSlopePct) * 40)
    const extPart = Math.min(30, belowMaPct * 6)
    const score = Math.round(Math.min(100, rsPart + slopePart + extPart))

    // Trade plan anchored to DB prices (self-consistent):
    //  · entry = midway price↔MA (bounce-to-MA resistance zone)
    //  · stop  = above the MA retest ceiling
    //  · cover = next prior base ≈ 12% below price (never below MA×0.8)
    const shortEntry = Math.round(((s.price + s.ma30w) / 2) * 100) / 100
    const stop = Math.round(Math.max(s.ma30w * 1.04, shortEntry * 1.06) * 100) / 100
    const cover = Math.round(s.price * 0.88 * 100) / 100 // 12% below price — always under entry
    const risk = Math.max(0.01, stop - shortEntry)
    const reward = Math.max(0.01, shortEntry - cover)

    out.push({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      price: s.price,
      ma30w: Math.round(s.ma30w * 100) / 100,
      ma30wSlopePct: s.ma30wSlopePct,
      mansfieldRs: s.mansfieldRs,
      belowMaPct: Math.round(belowMaPct * 10) / 10,
      stage: s.stage,
      pineScore: s.tech.pineScore,
      shortEntry,
      stop,
      cover,
      rr: Math.round((reward / risk) * 100) / 100,
      score,
    })
  }
  return out.sort((a, b) => b.score - a.score)
}

// ─── 2. Sector Rotation radar ───────────────────────────────────────────────
// Heuristic phase detection from the week's sector table + Market Score.
const PHASE_META: Record<RotationPhase, { label: string; playbook: string[]; angle: number }> = {
  EARLY: {
    label: 'Early Cycle — ฟื้นตัวช่วงต้น',
    playbook: ['BANK', 'FIN', 'CONMAT', 'PROPERTY'],
    angle: 0,
  },
  MID: {
    label: 'Mid Cycle — ขาขึ้นเต็มสูบ',
    playbook: ['ETRON', 'ICT', 'COMM', 'TOURISM', 'AUTO'],
    angle: 90,
  },
  LATE: {
    label: 'Late Cycle — ช่วงปลายขาขึ้น',
    playbook: ['ENERG', 'PETROL', 'HELTH', 'GLOBAL'],
    angle: 180,
  },
  RECESSION: {
    label: 'Recession — ถอย / ป้องกันตัว',
    playbook: ['UTIL', 'HELTH', 'FOOD', 'FIRE'],
    angle: 270,
  },
}

export function rotationPhase(
  sectors: { name: string; stage: number; trend: string; score: number }[],
  marketScore: number,
): RotationResult {
  const total = sectors.length || 1
  const counts = {
    s1: sectors.filter((x) => x.stage === 1).length,
    s2: sectors.filter((x) => x.stage === 2).length,
    s3: sectors.filter((x) => x.stage === 3).length,
    s4: sectors.filter((x) => x.stage === 4).length,
    total: sectors.length,
  }
  const avgStage = sectors.reduce((a, x) => a + x.stage, 0) / total
  const rising = sectors.filter((x) => x.trend === 'RISING').length
  const risingRatio = rising / total
  const s2Ratio = counts.s2 / total

  const reasons: string[] = []
  reasons.push(`Market Score ${marketScore}/10`)
  reasons.push(`กลุ่ม Stage 2 ${counts.s2}/${counts.total} กลุ่ม (avg stage ${fmt(avgStage, 1)})`)
  reasons.push(`กลุ่ม MA ชันขึ้น ${Math.round(risingRatio * 100)}%`)

  // Decision tree (deterministic)
  let phase: RotationPhase
  if (marketScore <= 3 && (counts.s4 >= counts.s2 || avgStage >= 2.9)) {
    phase = 'RECESSION'
    reasons.push('คะแนนตลาดต่ำ + กลุ่มส่วนใหญ่ Stage 4 → วัฏจักรถอย')
  } else if (avgStage >= 2.7 || counts.s3 >= counts.s2) {
    phase = 'LATE'
    reasons.push('เริ่มพบกลุ่ม Stage 3 จำนวนมาก → วัฏจักรช่วงปลาย')
  } else if (marketScore >= 6 && s2Ratio >= 0.35 && risingRatio >= 0.4) {
    phase = 'MID'
    reasons.push('ตลาดแข็ง + กลุ่ม Stage 2 ขยายตัว → ขาขึ้นเต็มสูบ')
  } else {
    phase = 'EARLY'
    reasons.push('กลุ่มยังสะสมฐานเป็นหลัก แต่เริ่มมีผู้นำนำรอบใหม่')
  }

  // Confidence: how many of the phase's dominant signals agree
  let agree = 1 // market score bucket always partially agrees
  if (phase === 'RECESSION') {
    if (counts.s4 >= counts.s2) agree++
    if (avgStage >= 2.9) agree++
    if (risingRatio < 0.35) agree++
  } else if (phase === 'LATE') {
    if (avgStage >= 2.7) agree++
    if (counts.s3 >= 2) agree++
    if (marketScore <= 6) agree++
  } else if (phase === 'MID') {
    if (s2Ratio >= 0.4) agree++
    if (risingRatio >= 0.5) agree++
    if (marketScore >= 7) agree++
  } else {
    if (counts.s1 + counts.s2 >= counts.total * 0.6) agree++
    if (risingRatio >= 0.4) agree++
    if (marketScore >= 4) agree++
  }
  const confidence = Math.min(95, Math.round((agree / 4) * 100))

  const sorted = [...sectors].sort((a, b) => b.score - a.score)
  const toSlim = (x: { name: string; score: number; stage: number; trend: string }) => ({
    name: x.name,
    score: x.score,
    stage: x.stage,
    trend: x.trend,
  })

  return {
    phase,
    label: PHASE_META[phase].label,
    confidence,
    reasons,
    leaders: sorted.slice(0, 3).map(toSlim),
    laggards: sorted.slice(-3).reverse().map(toSlim),
    playbook: PHASE_META[phase].playbook,
    counts,
    marketScore,
  }
}

export function phaseAngle(p: RotationPhase): number {
  return PHASE_META[p].angle
}

export const ROTATION_PHASES: RotationPhase[] = ['EARLY', 'MID', 'LATE', 'RECESSION']

// ─── 3. Multi-timeframe confluence ──────────────────────────────────────────
// Monthly = weekly bars resampled to calendar months (10-month MA)
// Weekly = 30-week MA
// Daily  = 10-week MA used as a 50-day proxy (≈ 50 trading sessions)
export function mtfAnalysis(stock: Stock): MtfResult {
  const bars = genSeries(stock.symbol).bars
  const n = bars.length

  // resample → monthly closes
  const monthly: { key: string; c: number }[] = []
  for (const b of bars) {
    const key = b.t.slice(0, 7) // YYYY-MM
    const lastM = monthly[monthly.length - 1]
    if (lastM && lastM.key === key) lastM.c = b.c
    else monthly.push({ key, c: b.c })
  }
  const mCloses = monthly.map((m) => m.c)
  const mLast = mCloses[mCloses.length - 1]
  const mMa = avg(mCloses.slice(-10))
  const mMaPrev = avg(mCloses.slice(-13, -3))

  // weekly legs
  const wLast = bars[n - 1].c
  const wMa = avg(bars.slice(-30).map((b) => b.c))
  const wMaPrev = avg(bars.slice(-33, -3).map((b) => b.c))

  // daily proxy = 10-week MA
  const dMa = avg(bars.slice(-10).map((b) => b.c))
  const dMaPrev = avg(bars.slice(-13, -3).map((b) => b.c))

  const legs: MtfLeg[] = [
    {
      label: 'Monthly (10M MA)',
      timeframe: 'รายเดือน',
      price: r2(mLast),
      ma: r2(mMa),
      above: mLast > mMa,
      slopeUp: mMa > mMaPrev,
    },
    {
      label: 'Weekly (30W MA)',
      timeframe: 'รายสัปดาห์',
      price: r2(wLast),
      ma: r2(wMa),
      above: wLast > wMa,
      slopeUp: wMa > wMaPrev,
    },
    {
      label: 'Daily ≈50D (10W proxy)',
      timeframe: 'รายวัน',
      price: r2(wLast),
      ma: r2(dMa),
      above: wLast > dMa,
      slopeUp: dMa > dMaPrev,
    },
  ]

  const rs = genSeries(stock.symbol).bars
  const rsNow = rs[n - 1].rs
  const rs8 = rs[n - 9].rs

  let score = 0
  for (const l of legs) if (l.above && l.slopeUp) score += 1
  const rsRising = rsNow > rs8
  if (rsRising && rsNow > 0) score += 1

  let alignment: MtfResult['alignment']
  if (score === 4) alignment = 'PERFECT'
  else if (score === 3) alignment = 'GOOD'
  else if (score >= 1) alignment = 'MIXED'
  else alignment = 'WEAK'

  const actions: Record<MtfResult['alignment'], string> = {
    PERFECT: 'ถือ/เข้าได้เต็มสูตร — ทุกไทม์เฟรมเห็นพ้อง',
    GOOD: 'เข้าได้ขนาดปกติ — รอแท่งยืนยันไทม์เฟรมเล็กเพิ่มเติม',
    MIXED: 'ลดขนาดไม้ / รอให้เส้นหลักเห็นพ้องก่อน',
    WEAK: 'ห้ามเข้า — ไทม์เฟรมใหญ่ยังไม่เอื้อ ถือเงินสดหรือเฝ้าดู',
  }

  return {
    symbol: stock.symbol,
    name: stock.name,
    legs,
    rs: { now: r2(rsNow), weeksAgo8: r2(rs8), rising: rsRising },
    alignment,
    score,
    action: actions[alignment],
    note:
      alignment === 'PERFECT' || alignment === 'GOOD'
        ? 'โครงสร้าง Multi-Timeframe รองรับการถือระยะกลาง–ยาว'
        : 'ไทม์เฟรมใหญ่ (Monthly) คือผู้ตัดสิน — ขัดแย้งเมื่อไหร่ให้ฟังไทม์เฟรมใหญ่เสมอ',
  }
}

function avg(a: number[]): number {
  if (a.length === 0) return 0
  return a.reduce((x, y) => x + y, 0) / a.length
}
function r2(x: number): number {
  return Math.round(x * 100) / 100
}

// ─── 4. Options strategy catalog + payoff math ──────────────────────────────
// Premiums below are demo-scale (บาท/หุ้น) — the UI lets users edit them.
export function optionStrategiesFor(stage: number, marketScore: number): OptionStrategy[] {
  const all = OPTION_STRATEGIES
  const fit = all.filter(
    (s) =>
      s.stages.includes(stage) ||
      (s.marketScore && marketScore >= s.marketScore[0] && marketScore <= s.marketScore[1]),
  )
  return fit.length > 0 ? fit : all.slice(0, 2)
}

export const OPTION_STRATEGIES: OptionStrategy[] = [
  {
    id: 'long-call',
    name: 'Long Call',
    th: 'ซื้อ Call เดี่ยว — ไม้รุกทุนน้อย',
    stages: [2],
    marketScore: [6, 10],
    legs: [{ type: 'CALL', action: 'BUY', strike: 0, premium: 4 }],
    usage: 'Stage 2 ที่ Market Score แข็ง — ใช้แทนการซื้อหุ้นเมื่อทุนจำกัด แต่ต้องยอมรับ Time Decay',
    maxProfit: 'ไม่จำกัด',
    maxLoss: 'เท่ากับ Premium ที่จ่าย',
  },
  {
    id: 'bull-call-spread',
    name: 'Bull Call Spread',
    th: 'ซื้อ Call ต่ำ / ขาย Call สูง — ลดต้นทุน จำกัดกำไร',
    stages: [1, 2],
    legs: [
      { type: 'CALL', action: 'BUY', strike: 0, premium: 4 },
      { type: 'CALL', action: 'SELL', strike: 0, premium: 1.5 },
    ],
    usage: 'มองขาขึ้นแบบมีเพดาน — เหมาะกับ Stage 1 ปลาย/Stage 2 ช่วงต้นที่ยังไม่ยืนยันเต็ม',
    maxProfit: 'Strike สองลบต้นทุนสุทธิ',
    maxLoss: 'ส่วนต่าง Premium ที่จ่าย',
  },
  {
    id: 'covered-call',
    name: 'Covered Call',
    th: 'ถือหุ้น + ขาย Call เก็บพรีเมียม',
    stages: [2, 3],
    legs: [{ type: 'CALL', action: 'SELL', strike: 0, premium: 3.5 }],
    usage: 'Stage 3 เริ่มอ่อนแรง — สร้างรายได้จากพอร์ตที่กำไรแล้ว และกำหนดราคาขายอัตโนมัติ',
    maxProfit: 'ราคาหุ้นถึง Strike + Premium',
    maxLoss: 'ขาดทุนจากหุ้นลบ Premium ที่ได้',
  },
  {
    id: 'protective-put',
    name: 'Protective Put',
    th: 'ถือหุ้น + ซื้อ Put ประกัน',
    stages: [2, 3],
    legs: [{ type: 'PUT', action: 'BUY', strike: 0, premium: 3 }],
    usage: 'ถือไม้ใหญ่ข้ามประกาศงบ/เลือกตั้ง — ประกันขาลงโดยไม่ต้องขายหุ้น (ไม่เสียภาษีกำไร)',
    maxProfit: 'ไม่จำกัด (หุ้นขาขึ้น)',
    maxLoss: 'จำกัดที่ Strike − ราคาซื้อ + Premium',
  },
  {
    id: 'collar',
    name: 'Collar',
    th: 'ซื้อ Put ประกัน + ขาย Call จ่ายค่าประกัน',
    stages: [3],
    legs: [
      { type: 'PUT', action: 'BUY', strike: 0, premium: 3 },
      { type: 'CALL', action: 'SELL', strike: 0, premium: 2.5 },
    ],
    usage: 'Stage 3 คือพิธีกรรม — ล็อกพื้นที่ขายและเพดานขึ้นพร้อมกัน ต้นทุนประกันเกือบศูนย์',
    maxProfit: 'จำกัดที่ Call Strike',
    maxLoss: 'จำกัดที่ Put Strike',
  },
  {
    id: 'bear-put-spread',
    name: 'Bear Put Spread',
    th: 'ซื้อ Put สูง / ขาย Put ต่ำ — ไม้ลงจำกัดความเสี่ยง',
    stages: [4],
    legs: [
      { type: 'PUT', action: 'BUY', strike: 0, premium: 4 },
      { type: 'PUT', action: 'SELL', strike: 0, premium: 1.5 },
    ],
    usage: 'Stage 4 ยืนยันแล้ว — ได้ประโยชน์จากขาลงแทนการ Short หุ้นจริง (ความเสี่ยงจำกัด)',
    maxProfit: 'ส่วนต่าง Strike ลบต้นทุนสุทธิ',
    maxLoss: 'Premium สุทธิที่จ่าย',
  },
  {
    id: 'long-put',
    name: 'Long Put',
    th: 'ซื้อ Put เดี่ยว — เก็งขาลงแรง',
    stages: [4],
    legs: [{ type: 'PUT', action: 'BUY', strike: 0, premium: 4.5 }],
    usage: 'Stage 4 พร้อม Market Score 0–3 — อาวุธป้องกัน/โจมตีช่วงตลาดหมี',
    maxProfit: 'ถึงศูนย์บวก Strike',
    maxLoss: 'Premium ที่จ่าย',
  },
]

// payoff per share at spot
export function optionPayoff(legs: OptionLeg[], spot: number): number {
  let pnl = 0
  for (const l of legs) {
    const intrinsic = l.type === 'CALL' ? Math.max(0, spot - l.strike) : Math.max(0, l.strike - spot)
    pnl += l.action === 'BUY' ? intrinsic - l.premium : l.premium - intrinsic
  }
  return pnl
}

export function payoffSeries(
  legs: OptionLeg[],
  spot: number,
  span = 40,
  steps = 80,
): OptionPoint[] {
  const base = legs[0]?.strike || spot
  const lo = Math.max(1, Math.min(base, spot) - span)
  const hi = Math.max(base, spot) + span
  const out: OptionPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const s = lo + ((hi - lo) * i) / steps
    out.push({ spot: Math.round(s * 100) / 100, pnl: Math.round(optionPayoff(legs, s) * 100) / 100 })
  }
  return out
}

export function optionStats(legs: OptionLeg[]): OptionStats {
  const net = legs.reduce((a, l) => a + (l.action === 'BUY' ? -l.premium : l.premium), 0)
  const breakevens: number[] = []
  if (legs.length === 1) {
    const l = legs[0]
    breakevens.push(l.type === 'CALL' ? l.strike + l.premium : l.strike - l.premium)
  }
  // verticals: breakeven between the two strikes = |net| adjusted
  if (legs.length === 2) {
    const strikes = legs.map((l) => l.strike).sort((a, b) => a - b)
    const lo = strikes[0]
    const hi = strikes[1]
    if (legs.every((l) => l.type === 'CALL')) breakevens.push(lo + Math.abs(net))
    else if (legs.every((l) => l.type === 'PUT')) breakevens.push(hi - Math.abs(net))
  }
  return {
    netCredit: Math.round(net * 100) / 100,
    breakevens: breakevens.map((x) => Math.round(x * 100) / 100),
    maxProfit: null,
    maxLoss: null,
  }
}
