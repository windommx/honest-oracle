// ─── Quant Lab engines (Unified Quant-Nightly Engine) ────────────────────────
// Ported from the "Unified Quant-Nightly Engine" spec (SECTION 1-8):
//   · Monte Carlo bootstrap resampling → percentile fan bands + DD/Sharpe/CAGR stats
//   · NOCASH / TRAP rules + Yield Bands + demo calibration on the synthetic universe
//   · Unified Stage Score 360° (A เทคนิค 30 / B พื้นฐาน 25 / C มหภาค 20 / D ความเสี่ยง 15 / E การปฏิบัติ 10)
//   · Nightly SHA-256 hash chain — "ประวัติการเดินคือหลักฐานที่ปลอมไม่ได้"
// SERVER-ONLY: uses node:crypto + Prisma — API routes import this file,
// client components must NOT.

import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { genSeries, simContext } from './market-sim'
import { enrichStock } from './scoring'
import { calcMarketScore } from './utils'
import { StageInputError } from './domain-error'
import { percentileOf, percentileSorted as percentile } from './stats'
import type {
  BootstrapMethod,
  CalibrationRow,
  ChainEntry,
  ChainResponse,
  McBandPoint,
  McStats,
  MonteCarloRequest,
  MonteCarloResult,
  ScoreSection,
  ScoreTier,
  TrapRisk,
  TrapRow,
  TrapsResponse,
  UnifiedGate,
  UnifiedScoreResult,
  YieldBand,
} from './types'

// ─── Shared numeric / PRNG helpers ───────────────────────────────────────────

function r1(x: number): number {
  return Math.round(x * 10) / 10
}

function r2(x: number): number {
  return Math.round(x * 100) / 100
}

// FNV-1a string hash (same approach as market-sim.ts hashStr) — deterministic
function stableHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// A. MONTE CARLO — bootstrap resample per-trade % returns (with replacement)
// ═════════════════════════════════════════════════════════════════════════════

export function runMonteCarlo(req: MonteCarloRequest): MonteCarloResult {
  const clean = (Array.isArray(req.returns) ? req.returns : []).filter(
    (x): x is number => typeof x === 'number' && Number.isFinite(x),
  )
  if (clean.length < 5) throw new StageInputError('ต้องมีอย่างน้อย 5 เทรด')

  const trades = clean.slice(0, 400) // cap 400 trades
  const n = trades.length
  const simsRaw = typeof req.sims === 'number' && Number.isFinite(req.sims) ? req.sims : 2000
  const sims = Math.min(10000, Math.max(100, Math.round(simsRaw)))
  const capRaw =
    typeof req.capital === 'number' && Number.isFinite(req.capital) ? req.capital : 1_000_000
  const capital = capRaw > 0 ? capRaw : 1_000_000

  // Block is the default because it is the less flattering of the two and the
  // closer to how trading results actually arrive: strategies win in runs and
  // lose in runs. Shuffling every trade independently is what makes a Monte
  // Carlo report a drawdown the strategy could never have had.
  const method: BootstrapMethod = req.method === 'iid' ? 'iid' : 'block'
  const autoBlock = Math.max(2, Math.round(Math.cbrt(n)))
  const blockSize =
    method === 'iid'
      ? 1
      : typeof req.blockSize === 'number' && Number.isFinite(req.blockSize)
        ? Math.min(n, Math.max(2, Math.round(req.blockSize)))
        : autoBlock
  const avgHoldWeeks =
    typeof req.avgHoldWeeks === 'number' && Number.isFinite(req.avgHoldWeeks) && req.avgHoldWeeks > 0
      ? req.avgHoldWeeks
      : 2

  // Deterministic PRNG — the seed covers the method too, so switching
  // resamplers gives a different but equally reproducible answer.
  const rnd = mulberry32(stableHash(`${trades.join(',')}|${method}|${blockSize}`))

  // Stationary bootstrap (Politis & Romano 1994): continue the current run with
  // probability 1 - 1/L, otherwise jump to a fresh random start. Geometric run
  // lengths keep the resampled series stationary, which a fixed block length
  // does not.
  const continueProb = method === 'block' ? 1 - 1 / blockSize : 0
  let cursor = 0

  const finalEquities: number[] = []
  const maxDds: number[] = []
  const sharpes: number[] = []
  const cagrs: number[] = []

  // Percentile bands need each STEP's distribution across sims, so the curves
  // are stored column-major from the start. Row-major storage meant rebuilding
  // a fresh column array for every one of up to 400 steps.
  const bandSims = sims * (n + 1) > 2_000_000 ? Math.min(sims, 2000) : sims
  const columns: Float64Array[] = []
  for (let t = 0; t <= n; t++) columns.push(new Float64Array(bandSims))
  const samplePaths: number[][] = []

  const years = (n * avgHoldWeeks) / 52
  const sqrt52 = Math.sqrt(52)

  for (let s = 0; s < sims; s++) {
    const keepCurve = s < bandSims
    const curve: number[] | null = s < 8 ? [capital] : null
    if (keepCurve) columns[0][s] = capital
    let equity = capital
    let peak = capital
    let maxDd = 0
    let sum = 0
    let sumSq = 0
    cursor = Math.floor(rnd() * n)

    for (let t = 0; t < n; t++) {
      if (t > 0) {
        // Continue the run, or jump. Wrapping makes it the *circular*
        // stationary bootstrap, so every trade is equally likely to appear
        // regardless of where it sat in the original sequence.
        cursor = rnd() < continueProb ? (cursor + 1) % n : Math.floor(rnd() * n)
      }
      const step = Math.max(-1, trades[cursor] / 100) // clamp ที่ -100%
      equity *= 1 + step
      if (equity < 0) equity = 0
      peak = Math.max(peak, equity)
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0
      if (dd > maxDd) maxDd = dd
      sum += step
      sumSq += step * step
      if (keepCurve) columns[t + 1][s] = equity
      curve?.push(equity)
    }

    const mean = sum / n
    const variance = Math.max(0, sumSq / n - mean * mean)
    const std = Math.sqrt(variance)
    const sharpe = std > 1e-12 ? (mean / std) * sqrt52 : 0
    const cagr =
      equity > 0 && years > 0 ? (Math.pow(equity / capital, 1 / years) - 1) * 100 : -100

    finalEquities.push(equity)
    maxDds.push(maxDd)
    sharpes.push(sharpe)
    cagrs.push(cagr)
    if (curve) samplePaths.push(curve)
  }

  // Percentile fan bands: t = 0..n_trades. selectKth reorders each column in
  // place, which is fine — the column is not read again afterwards.
  const bands: McBandPoint[] = []
  for (let t = 0; t <= n; t++) {
    const col = columns[t]
    bands.push({
      t,
      lo: Math.round(percentileOf(col, 5)),
      med: Math.round(percentileOf(col, 50)),
      hi: Math.round(percentileOf(col, 95)),
    })
  }

  const paths = samplePaths.map((curve) => curve.map((v, t) => ({ t, v: Math.round(v) })))

  const sortedFinal = [...finalEquities].sort((a, b) => a - b)
  const sortedDd = [...maxDds].sort((a, b) => a - b)
  const sortedSharpe = [...sharpes].sort((a, b) => a - b)
  const sortedCagr = [...cagrs].sort((a, b) => a - b)
  const medianFinal = percentile(sortedFinal, 50)

  const stats: McStats = {
    sims,
    trades: n,
    p5: Math.round(percentile(sortedFinal, 5)),
    p25: Math.round(percentile(sortedFinal, 25)),
    median: Math.round(medianFinal),
    p75: Math.round(percentile(sortedFinal, 75)),
    p95: Math.round(percentile(sortedFinal, 95)),
    probProfit: r1((finalEquities.filter((f) => f > capital).length / sims) * 100),
    probDouble: r1((finalEquities.filter((f) => f > capital * 2).length / sims) * 100),
    medianDd: r1(percentile(sortedDd, 50)),
    p95Dd: r1(percentile(sortedDd, 95)),
    worstDd: r1(percentile(sortedDd, 100)),
    medianSharpe: r2(percentile(sortedSharpe, 50)),
    medianCagr: r1(percentile(sortedCagr, 50)),
    medianMultiple: r2(medianFinal / capital),
    method,
    blockSize,
    avgHoldWeeks,
  }

  return { stats, bands, paths }
}

// ═════════════════════════════════════════════════════════════════════════════
// B. TRAP SCANNER — Yield Bands + NOCASH + TRAP + Calibration
// ═════════════════════════════════════════════════════════════════════════════

const YIELD_BANDS: YieldBand[] = ['6-8%', '8-10%', '10-12%', '>12%']

// Weinstein-style yield band — < 6% ไม่สนใจ (null)
function classifyBand(y: number): YieldBand | null {
  if (y < 6) return null
  if (y < 8) return '6-8%'
  if (y < 10) return '8-10%'
  if (y < 12) return '10-12%'
  return '>12%'
}

// ─── Deterministic pseudo dividend data (synthetic universe — reproducible) ──
// ~55% ต่ำกว่า 6% (band null), ~20% อยู่ 6-8%, ~15% อยู่ 8-12%, ~10% สูงกว่า 12%

export function pseudoDividendYield(symbol: string): number {
  const h = stableHash('dy:' + symbol)
  const bucket = h % 100
  const frac = ((h >>> 10) % 1000) / 1000
  let y: number
  if (bucket < 55) y = 0.5 + frac * 5.4 // 0.5–5.9%
  else if (bucket < 75) y = 6 + frac * 1.9 // 6–7.9%
  else if (bucket < 90) y = 8 + frac * 3.9 // 8–11.9%
  else y = 12 + frac * 3 // 12–15% trap zone
  return r1(y)
}

function pseudoPayout(symbol: string): number {
  const h = stableHash('po:' + symbol)
  return 20 + (h % 141) // 20–160%
}

// per-bar jitter ของ yield สำหรับ calibration (±20% รอบค่า base)
function jitterYield(symbol: string, i: number, base: number): number {
  const h = stableHash(`jy:${symbol}:${i}`)
  const f = 0.8 + (((h >>> 6) % 1000) / 1000) * 0.4
  return base * f
}

// ─── Risk classification ─────────────────────────────────────────────────────

function classifyRisk(
  band: YieldBand | null,
  nocash: boolean,
  trap: boolean,
  yieldPct: number,
): TrapRisk {
  if (nocash && trap && band !== null) return 'CRITICAL'
  if (trap || (nocash && yieldPct >= 8)) return 'HIGH'
  if (nocash || band === '>12%' || band === '10-12%') return 'MEDIUM'
  return 'LOW'
}

const TRAP_VERDICTS: Record<TrapRisk, string> = {
  CRITICAL: 'กับดักปันผลระดับวิกฤต — เงินสดไม่รองรับและราคากำลังพัง ห้ามเก็งกำไรปันผลเด็ดขาด',
  HIGH: 'ความเสี่ยงสูง — ปันผลมีโอกาสถูกตัดพร้อมราคาลง หลีกเลี่ยงหรือใช้ขนาดไม้เล็กมาก',
  MEDIUM: 'เฝ้าระวัง — ตรวจกระแสเงินสด หนี้ และ Stage ก่อนเข้าเก็งปันผล',
  LOW: 'ยังไม่พบสัญญาณกับดัก — ติดตามงบและ Yield ต่อเนื่อง',
}

// ─── Demo calibration จากซีรีส์ synthetic (deterministic) ────────────────────
// ย้อนหลังทุกสัปดาห์: ถ้า jitter-yield ร่วงเข้า band → วัดผล 52/104 แท่งข้างหน้า
// "cut" = ราคาลง > 12% ภายในหน้าต่าง หรือ Stage เปลี่ยนเป็น 4

function buildCalibration(symbols: string[]): CalibrationRow[] {
  interface Acc {
    n12: number
    n24: number
    cut12: number
    cut24: number
    ret: number
  }
  const acc = new Map<YieldBand, Acc>()
  for (const b of YIELD_BANDS) acc.set(b, { n12: 0, n24: 0, cut12: 0, cut24: 0, ret: 0 })

  for (const symbol of symbols) {
    const base = pseudoDividendYield(symbol)
    const band = classifyBand(base)
    if (!band) continue
    const bars = genSeries(symbol).bars
    const len = bars.length
    const a = acc.get(band)!

    for (let i = 0; i + 52 < len; i++) {
      const jy = jitterYield(symbol, i, base)
      if (classifyBand(jy) !== band) continue

      const baseC = bars[i].c
      let fell12 = false
      let fell24 = false
      const maxJ = Math.min(i + 104, len - 1)
      for (let j = i + 1; j <= maxJ; j++) {
        if (bars[j].c < baseC * 0.88) {
          if (j <= i + 52) fell12 = true
          fell24 = true
          break
        }
      }

      a.n12++
      if (fell12 || bars[i + 52].stage === 4) a.cut12++
      a.ret += (bars[i + 52].c / baseC - 1) * 100 + jy // price return + ปันผลที่เก็บได้

      if (i + 104 < len) {
        a.n24++
        if (fell24 || bars[i + 104].stage === 4) a.cut24++
      }
    }
  }

  return YIELD_BANDS.map((b) => {
    const a = acc.get(b)!
    return {
      band: b,
      n: a.n12,
      cutPct12: a.n12 > 0 ? r1((a.cut12 / a.n12) * 100) : 0,
      cutPct24: a.n24 > 0 ? r1((a.cut24 / a.n24) * 100) : 0,
      avgReturn12: a.n12 > 0 ? r1(a.ret / a.n12) : 0,
    }
  })
}

// ─── Main scan ───────────────────────────────────────────────────────────────

export async function scanTraps(userId: string): Promise<TrapsResponse> {
  const [stocks, theses] = await Promise.all([
    prisma.stageStock.findMany({ orderBy: { symbol: 'asc' } }),
    prisma.stageThesis.findMany({ where: { userId }, orderBy: { id: 'desc' } }),
  ])
  const thesisBySymbol = new Map<string, (typeof theses)[number]>()
  for (const t of theses) if (!thesisBySymbol.has(t.symbol)) thesisBySymbol.set(t.symbol, t)

  const rows: TrapRow[] = stocks.map((s) => {
    const thesis = thesisBySymbol.get(s.symbol)
    const ctx = simContext(s.symbol)
    const bars = genSeries(s.symbol).bars

    // 52-week-ish high จากซีรีส์ + decline + volatility (ใช้สเกลเดียวกับซีรีส์)
    let high52 = 0
    for (let i = Math.max(0, bars.length - 52); i < bars.length; i++) {
      high52 = Math.max(high52, bars[i].h)
    }
    const price = ctx.lastBar.c
    const priceDeclinePct = high52 > 0 ? r1((price / high52 - 1) * 100) : 0
    const volatilityPct = price > 0 ? (ctx.atr / price) * 100 : 0

    const dividendYieldPct = pseudoDividendYield(s.symbol)
    const band = classifyBand(dividendYieldPct)
    const payoutRatioPct = pseudoPayout(s.symbol)
    const fcfYieldPct = thesis ? thesis.fcfYieldPct : 0
    const debtEquity = thesis ? thesis.debtEquity : 1.0
    const revenueGrowthPct = thesis ? thesis.revenueGrowthPct : s.epsGrowthPct - 2

    // NOCASH — บริษัทจ่ายปันผลแต่ไม่มีเงินสดจริง (flag เมื่อเข้า ≥ 2 เงื่อนไข)
    const nocashNotes: string[] = []
    if (fcfYieldPct < 0) nocashNotes.push('FCF ติดลบ')
    if (payoutRatioPct > 100) nocashNotes.push('จ่ายปันผลเกินกำไร (Payout > 100%)')
    if (debtEquity > 1.5) nocashNotes.push('หนี้สูง D/E > 1.5')
    if (dividendYieldPct >= 8 && revenueGrowthPct < 0) nocashNotes.push('ยอดขายหดขณะปันผลสูง')
    const nocashScore = nocashNotes.length
    const nocash = nocashScore >= 2

    // TRAP — หุ้นปันผลสูงที่เป็นกับดัก (flag เมื่อเข้า ≥ 2 เงื่อนไข)
    const trapNotes: string[] = []
    if (dividendYieldPct >= 12) trapNotes.push('Yield > 12% Trap Zone')
    if (priceDeclinePct <= -20) trapNotes.push('ราคาลง > 20% จากจุดสูง')
    if (volatilityPct > 9) trapNotes.push('ความผันผวนสูงผิดปกติ')
    if (payoutRatioPct > 130) trapNotes.push('ปันผลมีแนวโน้มถูกตัด')
    if (revenueGrowthPct < -5) trapNotes.push('รายได้หด -5%+')
    const trapScore = trapNotes.length
    const trap = trapScore >= 2

    const risk = classifyRisk(band, nocash, trap, dividendYieldPct)

    return {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      price: s.price,
      dividendYieldPct,
      band,
      nocash,
      nocashScore,
      nocashNotes,
      trap,
      trapScore,
      trapNotes,
      fcfYieldPct: r2(fcfYieldPct),
      payoutRatioPct,
      debtEquity: r2(debtEquity),
      priceDeclinePct,
      revenueGrowthPct: r1(revenueGrowthPct),
      stage: s.stage,
      risk,
      verdict: TRAP_VERDICTS[risk],
    }
  })

  const order: Record<TrapRisk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  rows.sort(
    (a, b) =>
      order[a.risk] - order[b.risk] ||
      (b.dividendYieldPct ?? -1) - (a.dividendYieldPct ?? -1),
  )

  const summary = {
    scanned: rows.length,
    withYield: rows.filter((x) => x.band !== null).length,
    nocash: rows.filter((x) => x.nocash).length,
    trap: rows.filter((x) => x.trap).length,
    both: rows.filter((x) => x.nocash && x.trap).length,
    critical: rows.filter((x) => x.risk === 'CRITICAL').length,
    high: rows.filter((x) => x.risk === 'HIGH').length,
  }

  return {
    rows,
    summary,
    calibration: buildCalibration(stocks.map((s) => s.symbol)),
    generatedAt: new Date().toISOString(),
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. UNIFIED SCORE 360° — 0-100 (Grand Unified Framework)
// ═════════════════════════════════════════════════════════════════════════════

// D1 Geopolitical exposure ตามกลุ่มอุตสาหกรรม (5 = ปลอดภัย, 0 = เสี่ยงสุด)
const GEO_RISK: Record<string, number> = {
  ENERGY: 2,
  PETROCHEM: 2,
  TOUR: 3,
  TECH: 3,
  ICT: 2,
  ETRON: 2,
  BANK: 5,
  FIN: 5,
  FINANCE: 5,
}

// D2 Supply chain exposure
const SUPPLY_RISK: Record<string, number> = {
  TECH: 2,
  ICT: 2,
  ETRON: 2,
  INDUS: 3,
  IND: 3,
  PROPERTY: 3,
  PROP: 3,
  TOUR: 3,
  BANK: 5,
  FIN: 5,
  FINANCE: 5,
  HELTH: 5,
  HEALTH: 5,
  FOOD: 5,
  STAPLE: 5,
}

interface TierInfo {
  grade: ScoreTier
  riskPct: number
  action: string
  th: string
}

function pickTier(total: number): TierInfo {
  if (total >= 85)
    return {
      grade: 'S+',
      riskPct: 2.0,
      action: 'Full Position + Pyramiding',
      th: 'สถานะแข็งแกร่งครบทุกมิติ — โหลดพอร์ตเต็มสูตรและพีระมิดเมื่อกำไรตามแผน',
    }
  if (total >= 70)
    return {
      grade: 'A',
      riskPct: 1.5,
      action: 'Standard Position',
      th: 'คุณภาพสูงเกือบเต็มรูปแบบ — เข้าไม้ขนาดมาตรฐาน ยืนยัน Volume ตอนเข้า',
    }
  if (total >= 55)
    return {
      grade: 'B',
      riskPct: 1.0,
      action: 'Half Position',
      th: 'ผ่านเกณฑ์แบบก้ำกึ่ง — ใช้ครึ่งไม้และตั้ง Stop เข้มงวด',
    }
  if (total >= 40)
    return {
      grade: 'C',
      riskPct: 0.5,
      action: 'Quarter Position',
      th: 'อ่อนแรงหลายมิติ — ทดสอบด้วยไม้ขนาดจิ๋วเท่านั้น',
    }
  if (total >= 25)
    return {
      grade: 'D',
      riskPct: 0.25,
      action: 'Speculative Only',
      th: 'ไม่ครบระบบ — เก็งกำไรขนาดเล็กมากหรือเฝ้าดูอย่างเดียว',
    }
  return {
    grade: 'F',
    riskPct: 0,
    action: 'DO NOT TRADE',
    th: 'ไม่ผ่านเกณฑ์ — ห้ามเทรด กลับไปรอ Setup ใหม่ที่ครบเงื่อนไข',
  }
}

export async function unifiedScore(
  userId: string,
  symbol: string,
): Promise<UnifiedScoreResult | null> {
  const [stock, sectors, reviews, thesis, watch] = await Promise.all([
    prisma.stageStock.findUnique({ where: { symbol } }),
    prisma.stageSector.findMany({ where: { userId }, orderBy: [{ score: 'desc' }, { id: 'desc' }] }),
    prisma.stageMarketReview.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 1 }),
    prisma.stageThesis.findFirst({ where: { userId, symbol }, orderBy: { id: 'desc' } }),
    prisma.stageWatchlistItem.findFirst({ where: { userId, symbol }, orderBy: { id: 'desc' } }),
  ])
  if (!stock) return null

  const ctx = simContext(stock.symbol)
  // An unscored review is not a reading of a weak market — it is no reading.
  const review = reviews[0]?.scoredAt ? reviews[0] : undefined
  const market = review ? calcMarketScore(review) : null
  const marketScore = market ? market.score : null

  // Sector map (rank by score desc)
  const sectorMap = new Map<string, { stage: number; score: number; rank: number }>()
  sectors.forEach((sec, idx) => {
    if (!sectorMap.has(sec.name)) {
      sectorMap.set(sec.name, { stage: sec.stage, score: sec.score, rank: idx + 1 })
    }
  })
  const sector = sectorMap.get(stock.sector) ?? { stage: 0, score: 0, rank: 0 }

  const tech = enrichStock(
    stock,
    {
      rsPrev: ctx.rsPrev,
      volRatio: ctx.volRatio,
      candleUp: ctx.lastBar.c >= ctx.lastBar.o,
      atr: ctx.atr,
      highestHigh10: ctx.highestHigh10,
      lastClose: ctx.lastBar.c,
    },
    sector.stage,
    market ? market.stageNum : 0,
  )

  const stage = stock.stage
  const vr = tech.volRatio
  const rs = stock.mansfieldRs

  // ─── ข้อมูลพื้นฐานจาก Thesis (หรือค่า default) ───
  const epsGrowthPct = thesis ? thesis.epsGrowthPct : stock.epsGrowthPct
  const epsAccelerating = thesis ? thesis.epsAccelerating : false
  const revenueGrowthPct = thesis ? thesis.revenueGrowthPct : r2(stock.epsGrowthPct * 0.8)
  const gmExpanding = thesis ? thesis.gmExpanding : false
  const fcfYieldPct = thesis ? thesis.fcfYieldPct : 0
  const debtEquity = thesis ? thesis.debtEquity : 1.0
  const payoutRatioPct = pseudoPayout(stock.symbol)
  const instFund = thesis ? thesis.fundIncreasing : false
  const instForeign = thesis ? thesis.foreignNetBuy : false
  const instInsider = thesis ? thesis.insiderBuying : false

  // ─── Section A: เทคนิค (0-30) ───
  let a1: number
  if (stage === 2) a1 = tech.breakout && rs > 5 ? 10 : vr > 1.5 ? 8 : 7
  else if (stage === 1) a1 = 4
  else if (stage === 3) a1 = 3
  else a1 = 0

  let a2: number
  if (vr > 2 && !tech.candleUp) a2 = 0
  else if (vr > 3) a2 = 10
  else if (vr > 2) a2 = 8
  else if (vr > 1.5) a2 = 6
  else if (vr >= 1.0) a2 = 3
  else if (vr < 0.7 && stage === 1) a2 = 2
  else a2 = 0

  let a3: number
  if (rs > 10 && tech.rsRising) a3 = 10
  else if (rs > 5 && tech.rsRising) a3 = 8
  else if (rs > 0) a3 = 6
  else if (rs > -2) a3 = 3
  else a3 = 0

  const secA: ScoreSection = {
    id: 'A',
    label: 'เทคนิค',
    score: a1 + a2 + a3,
    max: 30,
    parts: [
      { label: 'A1 Stage Quality', note: 'Stage + Breakout + RS', score: a1, max: 10 },
      { label: 'A2 Volume Z', note: 'Volume Ratio × แท่งเทียน', score: a2, max: 10 },
      { label: 'A3 RS Strength', note: 'Mansfield RS + ทิศทาง', score: a3, max: 10 },
    ],
  }

  // ─── Section B: พื้นฐาน (0-25) ───
  let b1: number
  if (epsAccelerating && epsGrowthPct > 20) b1 = 8
  else if (epsAccelerating) b1 = 6
  else if (epsGrowthPct > 20) b1 = 4
  else if (epsGrowthPct > 10) b1 = 2
  else b1 = 0

  let b2: number
  if (revenueGrowthPct > 20 && gmExpanding) b2 = 7
  else if (revenueGrowthPct > 15) b2 = 5
  else if (revenueGrowthPct > 10) b2 = 3
  else if (revenueGrowthPct > 0) b2 = 1
  else b2 = 0

  let b3: number
  if (fcfYieldPct < 0) b3 = 0
  else if (debtEquity >= 1.5) b3 = 1
  else if (fcfYieldPct > 5 && debtEquity < 0.5) b3 = 5
  else if (fcfYieldPct > 3 && debtEquity < 1) b3 = 4
  else if (fcfYieldPct > 0) b3 = 3
  else b3 = 0

  const instCount = (instFund ? 1 : 0) + (instForeign ? 1 : 0) + (instInsider ? 1 : 0)
  let b4: number
  if (fcfYieldPct < 0 && payoutRatioPct > 130) b4 = 0
  else if (instCount === 3) b4 = 5
  else if (instFund && instForeign) b4 = 4
  else if (instCount >= 1) b4 = 3
  else if (fcfYieldPct < 0 || payoutRatioPct > 130) b4 = 1
  else b4 = 2

  const secB: ScoreSection = {
    id: 'B',
    label: 'พื้นฐาน',
    score: b1 + b2 + b3 + b4,
    max: 25,
    parts: [
      { label: 'B1 Earnings', note: 'EPS Growth + Acceleration', score: b1, max: 8 },
      { label: 'B2 Revenue & Margin', note: 'Revenue Growth + GM', score: b2, max: 7 },
      { label: 'B3 Cash & BS', note: 'FCF Yield + D/E', score: b3, max: 5 },
      { label: 'B4 Institutional', note: 'Fund + Foreign + Insider', score: b4, max: 5 },
    ],
  }

  // ─── Section C: มหภาค (0-20) ───
  const ms = marketScore ?? 0
  const c1 = ms >= 8 ? 8 : ms >= 6 ? 6 : ms >= 4 ? 3 : 0

  let c2: number
  if (sector.stage === 2 && sector.rank > 0 && sector.rank <= 2) c2 = 6
  else if (sector.stage === 2) c2 = 4
  else if (sector.stage === 1) c2 = 2
  else c2 = 0

  const breadth = review ? review.breadthPct : 0
  const foreignBuy = review ? review.foreignBuy : false
  let c3: number
  if (breadth > 70 && foreignBuy) c3 = 6
  else if (breadth > 50) c3 = 4
  else if (breadth > 30) c3 = 2
  else c3 = 0

  const secC: ScoreSection = {
    id: 'C',
    label: 'มหภาค',
    score: c1 + c2 + c3,
    max: 20,
    parts: [
      { label: 'C1 Regime', note: 'HMM Regime (Market Score)', score: c1, max: 8 },
      { label: 'C2 Sector Momentum', note: 'Sector Stage + Rank', score: c2, max: 6 },
      { label: 'C3 Breadth & Flow', note: 'Breadth + Foreign Flow', score: c3, max: 6 },
    ],
  }

  // ─── Section D: ความเสี่ยง (0-15) ───
  const d1 = GEO_RISK[stock.sector] ?? 4
  const d2 = SUPPLY_RISK[stock.sector] ?? 4
  let d3: number
  if (tech.pineScore >= 8 && stock.fundScore >= 7) d3 = 5
  else if (tech.pineScore >= 6) d3 = 4
  else if (tech.pineScore >= 4) d3 = 2
  else d3 = 0

  const secD: ScoreSection = {
    id: 'D',
    label: 'ความเสี่ยง',
    score: d1 + d2 + d3,
    max: 15,
    parts: [
      { label: 'D1 Geopolitical', note: 'ความเสี่ยงภูมิรัฐศาสตร์ตามกลุ่ม', score: d1, max: 5 },
      { label: 'D2 Supply Chain', note: 'ความเสี่ยงห่วงโซ่อุปทานตามกลุ่ม', score: d2, max: 5 },
      { label: 'D3 AI Confidence', note: 'Model confidence proxy (XGBoost)', score: d3, max: 5 },
    ],
  }

  // ─── Section E: การปฏิบัติ (0-10) ───
  const confirms = (tech.breakout ? 1 : 0) + (vr > 1.5 ? 1 : 0) + (tech.rsRising ? 1 : 0)
  let e1: number
  if (confirms === 3) e1 = 5
  else if (confirms === 2) e1 = 4
  else if (confirms === 1) e1 = 1
  else e1 = 0

  // R:R — ใช้ Watchlist ก่อน ถ้าไม่มีใช้ price/(2×ATR) vs target +12%
  let rr: number
  if (
    watch &&
    watch.entryPrice > 0 &&
    watch.entryPrice > watch.stopLoss &&
    watch.targetPrice > watch.entryPrice
  ) {
    rr = (watch.targetPrice - watch.entryPrice) / (watch.entryPrice - watch.stopLoss)
  } else {
    const riskPerShare = 2 * ctx.atr
    rr = riskPerShare > 0 ? (ctx.lastBar.c * 0.12) / riskPerShare : 0
  }
  rr = r2(rr)

  let e2: number
  if (rr >= 5) e2 = 5
  else if (rr >= 3) e2 = 4
  else if (rr >= 2) e2 = 3
  else if (rr >= 1) e2 = 1
  else e2 = 0

  const secE: ScoreSection = {
    id: 'E',
    label: 'การปฏิบัติ',
    score: e1 + e2,
    max: 10,
    parts: [
      { label: 'E1 Entry Setup', note: 'Triple Confirm (Breakout+Vol+RS)', score: e1, max: 5 },
      { label: 'E2 Risk:Reward', note: 'Watchlist หรือ 2×ATR vs +12%', score: e2, max: 5 },
    ],
  }

  const sections = [secA, secB, secC, secD, secE]
  const total = sections.reduce((acc, s) => acc + s.score, 0)
  const tier = pickTier(total)

  // ─── Gate (flowchart ตัดสินใจ) ───
  const regime: UnifiedGate['regime'] = ms >= 8 ? 'BULL' : ms >= 4 ? 'CHOPPY' : 'BEAR'
  let verdict: UnifiedGate['verdict']
  if (regime === 'BEAR' || stage === 4 || sector.stage >= 3) verdict = 'NO BUY'
  else if (stage === 1) verdict = 'WATCH ONLY'
  else if (stage === 3) verdict = 'HOLD ONLY'
  else verdict = 'BUY ZONE'

  const steps: string[] = [
    `GATE 1 · Regime: ${regime} → ${regime === 'BEAR' ? 'ตลาดหมี — งดซื้อ' : 'ผ่าน'}`,
    `GATE 2 · Sector Stage ${sector.stage || '—'} → ${
      sector.stage >= 3 ? 'กลุ่มกำลังกระจาย/ลง — งดซื้อ' : 'ผ่าน'
    }`,
    `GATE 3 · Stock Stage ${stage} → ${
      stage === 4 ? 'ขาลง — งดซื้อ' : stage === 3 ? 'ถือเท่านั้น' : stage === 1 ? 'เฝ้าดู' : 'ผ่าน'
    }`,
    `GATE 4 · R:R ${rr.toFixed(2)} → ${
      rr >= 2 ? 'คุ้มค่า เข้าได้' : rr >= 1 ? 'ก้ำกึ่ง — ลดขนาดไม้' : 'ไม่คุ้มความเสี่ยง'
    }`,
    `VERDICT: ${verdict}`,
  ]

  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    stage,
    sections,
    total,
    tier: { grade: tier.grade, riskPct: tier.riskPct, action: tier.action, th: tier.th },
    gate: {
      regime,
      sectorStage: sector.stage,
      stockStage: stage,
      rr,
      verdict,
      steps,
    },
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. NIGHTLY HASH CHAIN — หลักฐานที่ปลอมไม่ได้ (SHA-256 chained snapshots)
// ═════════════════════════════════════════════════════════════════════════════

// JSON.stringify แบบ sort keys แบบ recursive (เพื่อ hash ที่เสถียร)
function sortedKeysStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(sortedKeysStringify).join(',')}]`
  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${sortedKeysStringify(obj[k])}`).join(',')}}`
}

export function hashPayload(prevHash: string, payload: unknown, timestamp: string): string {
  return createHash('sha256')
    .update(`${prevHash}|${sortedKeysStringify(payload)}|${timestamp}`)
    .digest('hex')
}

// ─── สรุปข้อมูลคืนนี้จาก DB (universe + signals + trap counts + market state) ──

export async function collectNightlySummary(userId: string): Promise<ChainEntry['summary']> {
  const [stocks, reviews] = await Promise.all([
    prisma.stageStock.findMany({ orderBy: { symbol: 'asc' } }),
    prisma.stageMarketReview.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 1 }),
  ])

  // signals = หุ้น Stage 2 ที่ breakout ยืนยัน (สูตรเดียวกับ enrichStock)
  let signals = 0
  for (const s of stocks) {
    if (s.stage !== 2) continue
    const ctx = simContext(s.symbol)
    const breakout = s.price > ctx.highestHigh10 && ctx.volRatio > 1.5 && s.mansfieldRs > 0
    if (breakout) signals++
  }

  const traps = await scanTraps(userId)
  const review = reviews[0]?.scoredAt ? reviews[0] : undefined

  return {
    stocksAnalyzed: stocks.length,
    signals,
    nocash: traps.summary.nocash,
    trap: traps.summary.trap,
    marketScore: review ? calcMarketScore(review).score : null,
    universeSize: stocks.length,
    breadthPct: review ? review.breadthPct : null,
  }
}

// ─── บันทึก snapshot คืนใหม่ ต่อท้าย chain ────────────────────────────────────

/**
 * Append tonight's block.
 *
 * ONE PER UTC DAY. The chain calls itself a nightly record and the UI presents
 * it as evidence; accepting five hundred "nights" in an afternoon would make
 * both claims false, and would let the chain grow without bound — which in
 * turn makes verification, which must walk every block, grow without bound
 * too. A second call on the same day returns the block already written rather
 * than failing, because "today is already recorded" is the correct answer to
 * "record today", not an error.
 */
export async function appendNight(userId: string): Promise<ChainEntry> {
  const prev = await prisma.stageNightlySnapshot.findFirst({
    where: { userId },
    orderBy: { night: 'desc' },
  })

  if (prev && sameUtcDay(prev.timestamp, new Date())) {
    return {
      night: prev.night,
      timestamp: prev.timestamp.toISOString(),
      prevHash: prev.prevHash,
      hash: prev.hash,
      summary: JSON.parse(prev.summary) as ChainEntry['summary'],
    }
  }

  const night = prev ? prev.night + 1 : 1
  const prevHash = prev ? prev.hash : 'GENESIS'
  const timestamp = new Date().toISOString()
  const summary = await collectNightlySummary(userId)
  const hash = hashPayload(prevHash, summary, timestamp)

  await prisma.stageNightlySnapshot.create({
    // store the exact same timestamp that was hashed (ไม่ใช่ default(now()) ของ Prisma)
    data: {
      userId,
      night,
      prevHash,
      hash,
      summary: JSON.stringify(summary),
      timestamp: new Date(timestamp),
    },
  })

  return { night, timestamp, prevHash, hash, summary }
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * The most nights a chain is ever read back over.
 *
 * Verification has to recompute every block — that is what makes the chain
 * evidence rather than a list — so the work is linear in chain length. Capped
 * at roughly a decade of daily entries, which at one block per day is a bound
 * a real account reaches in 2036 and an abusive one cannot reach at all.
 */
export const MAX_CHAIN_READ = 4000

// ─── อ่าน chain ทั้งหมด + ตรวจสอบความถูกต้อง (recompute hash ทุก block) ───────

export async function readChain(userId: string): Promise<ChainResponse> {
  const rows = await prisma.stageNightlySnapshot.findMany({
    where: { userId },
    orderBy: { night: 'asc' },
    take: MAX_CHAIN_READ,
  })
  const entries: ChainEntry[] = rows.map((row) => ({
    night: row.night,
    timestamp: row.timestamp.toISOString(),
    prevHash: row.prevHash,
    hash: row.hash,
    summary: JSON.parse(row.summary) as unknown as ChainEntry['summary'],
  }))

  let valid = true
  let error: string | null = null
  let expectedPrev = 'GENESIS'
  for (const e of entries) {
    if (e.prevHash !== expectedPrev) {
      valid = false
      error = `Chain broken at night ${e.night}`
      break
    }
    const recomputed = hashPayload(e.prevHash, e.summary, e.timestamp)
    if (recomputed !== e.hash) {
      valid = false
      error = `Hash mismatch at night ${e.night}`
      break
    }
    expectedPrev = e.hash
  }

  return {
    entries,
    valid,
    error,
    length: entries.length,
    lastHash: entries.length > 0 ? entries[entries.length - 1].hash : 'GENESIS',
  }
}
