// ============================================================
// NAV ของพอร์ตกระดาษ + benchmark + สถิติ (pure)
//
// ธรรมเนียม (เดียวกับ backtest engine src/lib/momentum/engine.ts เพื่อเทียบกันได้):
//   - น้ำหนักต่อไม้ = slots / maxSlots ของ NAV (คงที่รายวัน) · เงินสดไม่มีผลตอบแทน
//   - เข้าที่ราคาปิดของ "วันเติม" (leg.entryDate = วันเติม T+1 หลังวันตัดสินใจ — ledger ใช้แถว fill / Position.entryDate
//     ไม่ใช่วันของสัญญาณ เหมือน runBacktest) · คำสั่งที่ยังรอเติมไม่ใช่ไม้ = ไม่อยู่ใน NAV
//   - ออกที่ราคาปิดของวันตัดสินใจ (T+0 เหมือน stop/time exit ของ backtest) · ต้นทุนต่อขา = commission + slippage หักจาก NAV วันนั้น
//   - ราคา = ราคาปิดใน DB ปัจจุบัน (ชุดเดียวกับ benchmark) · หุ้นพักการซื้อขาย = ผลตอบแทน 0 จนกลับมาเทรด
//     แล้วเทียบกับราคาปิดล่าสุดที่มี (การเคลื่อนไหวช่วงพักไม่หาย)
//   - benchmark = equal-weight รายวันของหุ้นที่ "ผ่านเกณฑ์สภาพคล่อง ณ วันก่อนหน้า" (liq5 + ราคา > ขั้นต่ำ)
//     รู้สมาชิกก่อนเห็นผลตอบแทน (ไม่มี look-ahead) — ไม่ใช่ดัชนี SET (ระบบไม่มีข้อมูลดัชนี)
// ============================================================

import type { Leg } from "./ledger"
import type { NavPoint, TrackStats } from "./types"

export interface PriceMatrix {
  dates: string[]
  px: number[][] // dates × symbols (NaN = ไม่มีแถว)
  symIdx: Map<string, number>
  dateIdx: Map<string, number>
}

export interface PricedLeg {
  leg: Leg
  si: number
  ei: number
  /** index วันออก (ไม้เปิด = วันล่าสุด) */
  xi: number
  entryPx: number
  /** ราคาออก (ไม้ปิด) หรือราคาปิดล่าสุดที่มี (ไม้เปิด) */
  markPx: number
  weight: number
  netRet: number // ทศนิยม: ไม้ปิดหักสองขา · ไม้เปิดหักขาเข้า
  holdSessions: number
  entryDrift: number | null
}

export interface NavResult {
  points: NavPoint[]
  dailyRet: number[]
  benchRet: (number | null)[]
  priced: PricedLeg[]
  /** ไม้ที่ไม่มีราคาใน DB (เช่นหุ้นถูกลบ) — ไม่อยู่ใน NAV */
  unpriced: string[]
  tradedWeight: number
  benchGapDays: number
}

const EMPTY: NavResult = { points: [], dailyRet: [], benchRet: [], priced: [], unpriced: [], tradedWeight: 0, benchGapDays: 0 }

function lastKnown(px: number[][], si: number, i: number, minIdx = 0): number {
  for (let k = Math.min(i, px.length - 1); k >= minIdx; k--) {
    const v = px[k]?.[si]
    if (Number.isFinite(v) && v > 0) return k
  }
  return -1
}

/** index ของวันแรกที่ ≥ date */
function firstIndexOnOrAfter(dates: string[], date: string): number {
  let lo = 0
  let hi = dates.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid] < date) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function simulateNav(input: {
  legs: Leg[]
  prices: PriceMatrix
  /** [dateIdx][symIdx] ผ่านเกณฑ์สภาพคล่อง ณ วันนั้น — ไม่ส่ง = ทุกหุ้นที่มีราคา */
  liquid?: boolean[][]
  startDate: string
  maxSlots: number
  costLeg: number
}): NavResult {
  const { prices, maxSlots, costLeg } = input
  const { dates, px } = prices
  const N = dates.length
  const s0 = firstIndexOnOrAfter(dates, input.startDate)
  if (N === 0 || s0 >= N) return { ...EMPTY }

  const priced: PricedLeg[] = []
  const unpriced: string[] = []
  for (const leg of input.legs) {
    if (leg.status === "orphan") continue
    const si = prices.symIdx.get(leg.symbol)
    const ei = prices.dateIdx.get(leg.entryDate)
    if (si === undefined || ei === undefined || ei < s0) {
      unpriced.push(leg.symbol)
      continue
    }
    const ek = lastKnown(px, si, ei)
    const entryPx = ek >= 0 ? px[ek][si] : leg.recordedEntryPx ?? NaN
    let xi = N - 1
    if (leg.status === "closed" && leg.exitDate) {
      const x = prices.dateIdx.get(leg.exitDate)
      if (x === undefined) {
        unpriced.push(leg.symbol)
        continue
      }
      xi = x
    }
    const mk = lastKnown(px, si, xi, ei)
    const markPx = mk >= 0 ? px[mk][si] : NaN
    if (!(entryPx > 0) || !(markPx > 0) || xi < ei) {
      unpriced.push(leg.symbol)
      continue
    }
    const weight = Math.max(0, leg.slots) / maxSlots
    const closed = leg.status === "closed"
    const netRet = markPx / entryPx - 1 - (closed ? 2 : 1) * costLeg
    const entryDrift = leg.recordedEntryPx && leg.recordedEntryPx > 0 ? entryPx / leg.recordedEntryPx - 1 : null
    priced.push({ leg, si, ei, xi, entryPx, markPx, weight, netRet, holdSessions: xi - ei, entryDrift })
  }

  // ---- จำลองรายวัน ----
  const prev = priced.map((p) => p.entryPx)
  const points: NavPoint[] = []
  const dailyRet: number[] = []
  const benchRet: (number | null)[] = []
  let nav = 1
  let bench = 1
  let benchGapDays = 0
  let tradedWeight = 0
  for (let i = s0; i < N; i++) {
    let dayR = 0
    for (let k = 0; k < priced.length; k++) {
      const p = priced[k]
      if (i > p.ei && i <= p.xi) {
        const v = px[i][p.si]
        if (Number.isFinite(v) && v > 0) {
          dayR += p.weight * (v / prev[k] - 1)
          prev[k] = v
        }
      }
      if (i === p.ei) {
        dayR -= p.weight * costLeg
        tradedWeight += p.weight
      }
      if (i === p.xi && p.leg.status === "closed") {
        dayR -= p.weight * costLeg
        tradedWeight += p.weight
      }
    }
    // benchmark: สมาชิกตามสภาพคล่องของวันก่อนหน้า
    let br: number | null = null
    if (i > s0) {
      let sum = 0
      let n = 0
      const rowPrev = px[i - 1]
      const rowNow = px[i]
      for (let s = 0; s < rowNow.length; s++) {
        if (input.liquid && !input.liquid[i - 1]?.[s]) continue
        const a = rowPrev[s]
        const b = rowNow[s]
        if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
          sum += b / a - 1
          n++
        }
      }
      if (n > 0) br = sum / n
      else benchGapDays++
      bench *= 1 + (br ?? 0)
    }
    // วันแรก (s0) มีแต่ต้นทุนขาเข้า — นับเป็นผลตอบแทนของพอร์ต แต่ benchmark = null (ยังไม่มีสถานะในตลาด)
    dailyRet.push(dayR)
    benchRet.push(br)
    nav *= 1 + dayR
    let exposure = 0
    for (const p of priced) if (p.ei <= i && (i < p.xi || (i === p.xi && p.leg.status !== "closed"))) exposure += p.weight
    points.push({
      date: dates[i],
      nav: Math.round(nav * 1e6) / 1e6,
      bench: i === s0 ? 1 : Math.round(bench * 1e6) / 1e6,
      exposure: Math.round(exposure * 1e4) / 1e4,
    })
  }
  return { points, dailyRet, benchRet, priced, unpriced, tradedWeight, benchGapDays }
}

// ---------------- สถิติ ----------------

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)
function sdSample(a: number[]): number {
  if (a.length < 2) return NaN
  const m = mean(a)
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1))
}
const round = (x: number | null, d = 2): number | null => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
const pct = (x: number | null, d = 2) => (x === null || !Number.isFinite(x) ? null : round(x * 100, d))

function maxDrawdown(series: number[]): number | null {
  if (series.length === 0) return null
  let peak = series[0]
  let dd = 0
  for (const v of series) {
    if (v > peak) peak = v
    const d = v / peak - 1
    if (d < dd) dd = d
  }
  return dd
}

/** จำนวนผลตอบแทนรายวันขั้นต่ำก่อนคำนวณ vol/Sharpe/t-stat · ขั้นต่ำก่อน annualize เป็น CAGR */
export const MIN_RET_DAYS = 20
export const MIN_CAGR_DAYS = 60
const SD_EPS = 1e-12

export function computeTrackStats(nav: NavResult): TrackStats {
  // จำนวนวันซื้อขายที่ผ่านไปนับจากวันเริ่ม (dailyRet รวมวันแรกที่มีแต่ต้นทุนขาเข้า)
  const n = Math.max(0, nav.points.length - 1)
  const last = nav.points[nav.points.length - 1]
  const navEnd = last?.nav ?? null
  const benchEnd = last?.bench ?? null
  const closed = nav.priced.filter((p) => p.leg.status === "closed")
  const open = nav.priced.filter((p) => p.leg.status === "open")
  const wins = closed.filter((p) => p.netRet > 0)
  const losses = closed.filter((p) => p.netRet <= 0)
  const sumWin = wins.reduce((s, p) => s + p.netRet, 0)
  const sumLoss = losses.reduce((s, p) => s + p.netRet, 0)

  const sd = sdSample(nav.dailyRet)
  const m = mean(nav.dailyRet)
  const excess: number[] = []
  nav.dailyRet.forEach((r, i) => {
    const b = nav.benchRet[i]
    if (b !== null && b !== undefined) excess.push(r - b)
  })
  const exM = mean(excess)
  const exSd = sdSample(excess)
  // sd ต้องมากกว่าเศษทศนิยม (ผลตอบแทนคงที่ = sd ~1e-18 → t/Sharpe ระดับ 1e16 ปลอม)
  const tStat = excess.length >= MIN_RET_DAYS && exSd > SD_EPS ? (exM / exSd) * Math.sqrt(excess.length) : null
  const annual = (end: number | null) => (end !== null && n >= MIN_CAGR_DAYS && end > 0 ? Math.pow(end, 252 / n) - 1 : null)

  return {
    totalReturnPct: navEnd === null ? null : pct(navEnd - 1),
    benchReturnPct: benchEnd === null ? null : pct(benchEnd - 1),
    excessReturnPct: navEnd === null || benchEnd === null ? null : pct(navEnd - benchEnd),
    cagrPct: pct(annual(navEnd)),
    benchCagrPct: pct(annual(benchEnd)),
    volPct: n >= MIN_RET_DAYS && Number.isFinite(sd) ? pct(sd * Math.sqrt(252)) : null,
    sharpe: n >= MIN_RET_DAYS && sd > SD_EPS ? round((m / sd) * Math.sqrt(252)) : null,
    maxDrawdownPct: pct(maxDrawdown(nav.points.map((p) => p.nav))),
    benchMaxDrawdownPct: pct(maxDrawdown(nav.points.map((p) => p.bench ?? NaN).filter(Number.isFinite))),
    closedTrades: closed.length,
    openTrades: open.length,
    hitRatePct: closed.length > 0 ? pct(wins.length / closed.length, 1) : null,
    avgWinPct: wins.length > 0 ? pct(sumWin / wins.length) : null,
    avgLossPct: losses.length > 0 ? pct(sumLoss / losses.length) : null,
    payoff: wins.length > 0 && losses.length > 0 && sumLoss < 0 ? round(sumWin / wins.length / Math.abs(sumLoss / losses.length)) : null,
    profitFactor: wins.length > 0 && sumLoss < 0 ? round(sumWin / Math.abs(sumLoss)) : null,
    realizedPct: closed.length > 0 ? pct(closed.reduce((s, p) => s + p.weight * p.netRet, 0)) : null,
    unrealizedPct: open.length > 0 ? pct(open.reduce((s, p) => s + p.weight * p.netRet, 0)) : null,
    avgExposurePct: nav.points.length > 0 ? pct(mean(nav.points.map((p) => p.exposure)), 1) : null,
    turnoverAnnual: n >= MIN_RET_DAYS ? round(nav.tradedWeight / 2 / (n / 252)) : null,
    avgHoldSessions: closed.length > 0 ? round(mean(closed.map((p) => p.holdSessions)), 1) : null,
    tStatExcess: round(tStat),
    sessionsForSignificance: excess.length >= MIN_RET_DAYS && exM > 0 && exSd > SD_EPS ? Math.ceil((2 * exSd / exM) ** 2) : null,
  }
}
