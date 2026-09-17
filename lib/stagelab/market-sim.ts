// ─── Deterministic synthetic weekly OHLCV series (Stage-based market sim) ───
// Generates stable, reproducible price history per symbol so the Backtester,
// Thesis chart and RS calculations always see the same data.
//
// Every series ends at the symbol's authored price. That is not cosmetic.
// The generator used to start each walk at `12 + rnd()*120` and end wherever
// it ended, while the screener showed the price from STAGE_UNIVERSE — two
// independent inventions of the same stock. Measured across the 61-symbol
// universe, 46 rows had the simulator's 10-week high more than 2x away from
// the price on screen, and the enrichment code compares them directly:
// `breakout = s.price > ctx.highestHigh10`. Symbol A was displayed at 5.20
// with an ATR of 11.60 — 223% of its own price — and a 10-week high of
// 194.94. Anchoring the walk puts every derived figure (ATR, 10-week high,
// Chandelier stop, the chart itself) in the same units as the number the
// customer is reading, so comparing them means something.
import { STAGE_UNIVERSE } from './seed-data'

export interface WeeklyBar {
  i: number // bar index
  t: string // ISO date of week (Friday)
  o: number
  h: number
  l: number
  c: number
  v: number
  ma30: number // 30-week MA
  stage: number // detected stage 1-4
  rs: number // Mansfield RS vs SET index
}

export interface SymbolSeries {
  symbol: string
  bars: WeeklyBar[]
}

// ─── PRNG ────────────────────────────────────────────────────────────────────
function hashStr(s: string): number {
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

function gauss(rnd: () => number): number {
  // Box-Muller, clamped to ±3σ
  let u = 0
  let v = 0
  while (u === 0) u = rnd()
  while (v === 0) v = rnd()
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(-3, Math.min(3, g))
}

// ─── Stage plan generator ────────────────────────────────────────────────────
// Each symbol walks an endless cycle: S1 base → S2 markup → S3 top → S4 decline.
interface StageLeg {
  stage: number
  weeks: number
  driftWk: number // weekly drift
  volWk: number // weekly volatility (σ of return)
}

function nextLeg(stage: number, rnd: () => number, quality: number): StageLeg {
  switch (stage) {
    case 1:
      return {
        stage: 1,
        weeks: 16 + Math.floor(rnd() * 30),
        driftWk: (rnd() - 0.45) * 0.004,
        volWk: 0.018 + rnd() * 0.012,
      }
    case 2:
      // quality 0..1 → a monster Stage 2 still runs long and hard, but this
      // is now the drift ON TOP of the market, not the whole move. The old
      // values (+0.8%..+2.5% a week for up to 86 weeks against a Stage 4 of
      // -0.7%..-1.8% for at most 54) made every cycle net strongly positive,
      // which is why no configuration of the backtest could lose money: 0 of
      // 384 in a full sweep. That is a property of the generator, not of the
      // strategy, and it made the backtest unable to falsify anything.
      return {
        stage: 2,
        weeks: 26 + Math.floor(rnd() * 60 * (0.4 + quality)),
        driftWk: 0.004 + rnd() * 0.010 * (0.5 + quality),
        volWk: 0.028 + rnd() * 0.02,
      }
    case 3:
      return {
        stage: 3,
        weeks: 10 + Math.floor(rnd() * 18),
        driftWk: (rnd() - 0.5) * 0.006,
        volWk: 0.032 + rnd() * 0.018,
      }
    default:
      return {
        stage: 4,
        weeks: 18 + Math.floor(rnd() * 42),
        driftWk: -(0.006 + rnd() * 0.012),
        volWk: 0.03 + rnd() * 0.018,
      }
  }
}

function buildLegs(symbol: string, totalWeeks: number): StageLeg[] {
  const rnd = mulberry32(hashStr(symbol) ^ 0x9e3779b9)
  const quality = rnd() // how strong the Stage 2 legs are
  const legs: StageLeg[] = []
  let acc = 0
  let stage = 1 + Math.floor(rnd() * 4)
  while (acc < totalWeeks) {
    const leg = nextLeg(stage, rnd, quality)
    legs.push(leg)
    acc += leg.weeks
    stage = stage === 4 ? 1 : stage + 1
  }
  return legs
}

// ─── SET index series (market benchmark) ─────────────────────────────────────
let setCache: { closes: number[] } | null = null

export function setIndexCloses(weeks: number): number[] {
  if (setCache && setCache.closes.length >= weeks) return setCache.closes.slice(-weeks)
  const rnd = mulberry32(hashStr('SET-INDEX') ^ 0x1234567)
  const closes: number[] = []
  let price = 1250
  // Market cycles.
  //
  // The old parameters gave bulls of +0.1%..+0.3% a week and bears of
  // -0.4%..-0.7%, which netted to a long-run CAGR of about -1%: an index that
  // went nowhere over six years. It did not matter, because nothing used it —
  // symbols walked independently and the index existed only to compute
  // relative strength. Both facts together meant the universe had no market
  // risk at all: equal-weight buy-and-hold drew down 8.9% in six years, where
  // a real equity market gives you 30% or worse.
  //
  // Bulls now run +0.3%..+0.6% for 60-120 weeks and bears -0.5%..-1.0% for
  // 20-45. That is roughly a 7%/yr long-run drift with genuine 20-30% bear
  // markets inside it — which is what makes "high return, low risk" a
  // question with an answer rather than a property of the generator.
  let drift = 0.004
  let weeksLeft = 80
  for (let i = 0; i < weeks; i++) {
    if (weeksLeft <= 0) {
      if (drift > 0) {
        drift = -(0.005 + rnd() * 0.005)
        weeksLeft = 20 + Math.floor(rnd() * 25)
      } else {
        drift = 0.003 + rnd() * 0.003
        weeksLeft = 60 + Math.floor(rnd() * 60)
      }
    }
    weeksLeft--
    price *= 1 + drift + gauss(rnd) * 0.016
    closes.push(price)
  }
  setCache = { closes }
  return closes
}

// ─── Week date labels (Fridays, ending "now") ────────────────────────────────
function weekDates(weeks: number): string[] {
  const out: string[] = []
  const now = new Date()
  // last Friday
  const d = new Date(now)
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1)
  for (let i = weeks - 1; i >= 0; i--) {
    const x = new Date(d)
    x.setDate(d.getDate() - i * 7)
    out.push(x.toISOString().slice(0, 10))
  }
  return out
}

let datesCache: { weeks: number; dates: string[] } | null = null
export function weekLabels(weeks: number): string[] {
  if (datesCache && datesCache.weeks >= weeks) return datesCache.dates.slice(-weeks)
  const dates = weekDates(weeks)
  datesCache = { weeks, dates }
  return dates
}

// ─── Rolling helpers ─────────────────────────────────────────────────────────
function smaLast(arr: number[], window: number): number {
  const n = Math.min(window, arr.length)
  let s = 0
  for (let i = arr.length - n; i < arr.length; i++) s += arr[i]
  return s / n
}


// ─── Price anchor ────────────────────────────────────────────────────────────
let anchorCache: Map<string, number> | null = null

/**
 * The authored price for a symbol, or null for one that is not in the
 * universe. A symbol we do not publish has no canonical price to anchor to,
 * so its series keeps the generator's own scale rather than inventing one.
 */
export function priceAnchor(symbol: string): number | null {
  if (!anchorCache) {
    anchorCache = new Map(STAGE_UNIVERSE.map((r) => [r.symbol, r.price]))
  }
  return anchorCache.get(symbol) ?? null
}

// ─── Main generator ──────────────────────────────────────────────────────────
const seriesCache = new Map<string, SymbolSeries>()

export function genSeries(symbol: string, totalWeeks = 312): SymbolSeries {
  const cached = seriesCache.get(symbol)
  if (cached && cached.bars.length === totalWeeks) return cached

  const legs = buildLegs(symbol, totalWeeks)
  const rnd = mulberry32(hashStr('px:' + symbol))
  const idx = setIndexCloses(totalWeeks)
  const dates = weekLabels(totalWeeks)

  const o: number[] = []
  const h: number[] = []
  const l: number[] = []
  const c: number[] = []
  const v: number[] = []

  let price = 12 + rnd() * 120 // start price (rescaled to the anchor at the end)
  let legIdx = 0
  let legLeft = legs[0].weeks

  // Beta to the market. Without this every symbol walked its own cycle
  // independently, so the universe never fell together: a diversified basket
  // of 61 of them had almost no market risk, and any long-only system looked
  // like a genius. Stocks that go down together is most of what risk IS.
  const beta = 0.55 + rnd() * 0.95

  const baseVol = 5_000_000 + rnd() * 40_000_000 // shares/week

  for (let i = 0; i < totalWeeks; i++) {
    if (legLeft <= 0) {
      legIdx = Math.min(legIdx + 1, legs.length - 1)
      legLeft = legs[legIdx].weeks
    }
    legLeft--

    const leg = legs[legIdx]
    const mkt = i > 0 ? idx[i] / idx[i - 1] - 1 : 0
    const ret = leg.driftWk + beta * mkt + gauss(rnd) * leg.volWk
    const open = price * (1 + gauss(rnd) * leg.volWk * 0.35)
    const close = Math.max(0.4, open * (1 + ret))
    const upWick = Math.abs(gauss(rnd)) * leg.volWk * 0.8
    const dnWick = Math.abs(gauss(rnd)) * leg.volWk * 0.8
    const hi = Math.max(open, close) * (1 + upWick)
    const lo = Math.min(open, close) * (1 - dnWick)

    // Volume: higher on strong directional weeks; spike near stage transitions
    const nearTransition = legLeft < 3 || (leg.weeks - legLeft) < 3
    const dir = Math.abs(ret)
    let vol = baseVol * (0.6 + dir * 45) * (0.75 + rnd() * 0.5)
    if (nearTransition) vol *= 1.4 + rnd() * 0.8
    if (leg.stage === 2 && ret > 0.02) vol *= 1.3 + rnd() * 0.7
    if (leg.stage === 4) vol *= 1.1

    o.push(open)
    h.push(hi)
    l.push(lo)
    c.push(close)
    v.push(Math.round(vol))
    price = close
  }

  // 30-week MA + Mansfield RS
  const ma: number[] = []
  for (let i = 0; i < totalWeeks; i++) {
    const win = c.slice(Math.max(0, i - 29), i + 1)
    ma.push(win.reduce((a, b) => a + b, 0) / win.length)
  }

  const rp: number[] = c.map((x, i) => (x / idx[i]) * 100)
  const rs: number[] = []
  for (let i = 0; i < totalWeeks; i++) {
    if (i < 52) {
      rs.push(0)
      continue
    }
    const rpMa = smaLast(rp.slice(0, i + 1), 52)
    rs.push(((rp[i] / rpMa - 1)) * 100)
  }

  // Stage detection from price vs MA + MA slope (same rule as the manual)
  const stage: number[] = []
  for (let i = 0; i < totalWeeks; i++) {
    if (i < 35) {
      stage.push(1)
      continue
    }
    const p = c[i]
    const m = ma[i]
    const slope = (ma[i] - ma[i - 5]) / ma[i - 5]
    if (p > m && slope > 0.005) stage.push(2)
    else if (p < m && slope < -0.005) stage.push(4)
    else if (p > m) stage.push(3)
    else stage.push(1)
  }

  // Put the whole path on the symbol's published scale. A single multiplier
  // leaves every shape — returns, stage detection, relative strength, the
  // 30-week MA's position against price — exactly as generated, because all
  // of those are ratios. What changes is that the numbers now mean the same
  // thing as the price in the screener row. `/api/stagelab/series` used to do
  // this rescale itself, for the chart alone; every other consumer
  // (enrichment, the alert engine, the Chandelier stop) got raw values.
  const anchor = priceAnchor(symbol)
  const lastClose = c[totalWeeks - 1]
  const scale = anchor !== null && lastClose > 0 ? anchor / lastClose : 1

  const bars: WeeklyBar[] = []
  for (let i = 0; i < totalWeeks; i++) {
    bars.push({
      i,
      t: dates[i],
      o: r2(o[i] * scale),
      h: r2(h[i] * scale),
      l: r2(l[i] * scale),
      c: r2(c[i] * scale),
      v: v[i],
      ma30: r2(ma[i] * scale),
      stage: stage[i],
      rs: r2(rs[i]),
    })
  }

  const out: SymbolSeries = { symbol, bars }
  seriesCache.set(symbol, out)
  return out
}

function r2(x: number): number {
  return Math.round(x * 100) / 100
}

// ─── Derived metrics used by the enrichment API ──────────────────────────────
export interface SimContext {
  lastBar: WeeklyBar
  prevBar: WeeklyBar
  volRatio: number // volume / 10-week average volume
  atr: number // average weekly true range over last 10 bars
  highestHigh10: number // highest high of the prior 10 bars (excl. current)
  rsPrev: number
}

export function simContext(symbol: string): SimContext {
  const { bars } = genSeries(symbol)
  const n = bars.length
  const lastBar = bars[n - 1]
  const prevBar = bars[n - 2]
  let vSum = 0
  let trSum = 0
  for (let i = n - 11; i < n - 1; i++) {
    vSum += bars[i].v
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    )
    trSum += tr
  }
  let hh = 0
  for (let i = n - 11; i < n - 1; i++) hh = Math.max(hh, bars[i].h)
  return {
    lastBar,
    prevBar,
    volRatio: lastBar.v / Math.max(1, vSum / 10),
    atr: trSum / 10,
    highestHigh10: hh,
    rsPrev: prevBar.rs,
  }
}
