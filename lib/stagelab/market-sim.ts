// ─── Deterministic synthetic weekly OHLCV series (Stage-based market sim) ───
// Generates stable, reproducible price history per symbol so the Backtester,
// Thesis chart and RS calculations always see the same data.

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
      // quality 0..1 → monster Stage 2 can drift +2.5%/wk for a long time
      return {
        stage: 2,
        weeks: 26 + Math.floor(rnd() * 60 * (0.4 + quality)),
        driftWk: 0.008 + rnd() * 0.017 * (0.5 + quality),
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
        weeks: 18 + Math.floor(rnd() * 36),
        driftWk: -(0.007 + rnd() * 0.011),
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
  // Market cycles: mild bull / bear alternation
  let drift = 0.0015
  let weeksLeft = 60
  for (let i = 0; i < weeks; i++) {
    if (weeksLeft <= 0) {
      if (drift > 0) {
        drift = -(0.004 + rnd() * 0.003)
        weeksLeft = 24 + Math.floor(rnd() * 30)
      } else {
        drift = 0.001 + rnd() * 0.002
        weeksLeft = 48 + Math.floor(rnd() * 60)
      }
    }
    weeksLeft--
    price *= 1 + drift + gauss(rnd) * 0.014
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

  let price = 12 + rnd() * 120 // start price
  let legIdx = 0
  let legLeft = legs[0].weeks

  const baseVol = 5_000_000 + rnd() * 40_000_000 // shares/week

  for (let i = 0; i < totalWeeks; i++) {
    if (legLeft <= 0) {
      legIdx = Math.min(legIdx + 1, legs.length - 1)
      legLeft = legs[legIdx].weeks
    }
    legLeft--

    const leg = legs[legIdx]
    const ret = leg.driftWk + gauss(rnd) * leg.volWk
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

  const bars: WeeklyBar[] = []
  for (let i = 0; i < totalWeeks; i++) {
    bars.push({
      i,
      t: dates[i],
      o: r2(o[i]),
      h: r2(h[i]),
      l: r2(l[i]),
      c: r2(c[i]),
      v: v[i],
      ma30: r2(ma[i]),
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
