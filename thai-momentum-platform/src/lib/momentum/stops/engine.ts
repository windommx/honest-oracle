// ============================================================
// Stops engine — data plumbing ของ Bayesian Stop-Loss (Zambelli)
// - loadClosedTrades()      : Trade rows + path JSON + recency weight ตามวันทำการ
// - getBucketPosteriors()   : ถัง pooled | auto | human (แยกต่อผู้ตัดสินใจ) + กันถังบาง (<200 → pool)
// - runStopArms()           : walk-forward 3 arms (fixed10 | bayesT | bayesR) — posterior ใหม่ทุก 60
//                             วันทำการ จากเทรดที่ปิดก่อน window − embargo 10 วัน (กัน look-ahead)
// - evaluateStopPositions() : ตำแหน่งเปิดวันนี้ → dNow, P(L|b), EV_hold, exitNow, beyondOpt
//
// กติกา adoption ที่ pre-register (ล็อกก่อนเห็นผล):
//   รับ bayes arm ก็ต่อเมื่อ Sharpe_arm > Sharpe_fixed + 0.2 และ MaxDD แย่กว่าเกิน 2pp ไม่ได้
//   และ n ≥ 100 — ไม่งั้นคง fixed10 ตามเดิม
// ============================================================

import { db } from "@/lib/db"
import { closePivot } from "@/lib/momentum/core"
import { TH_STRATEGY } from "@/lib/config/thai"
import {
  buildPosterior,
  liveBackstop,
  liveExit,
  type BayesTrade,
  type Posterior,
} from "./bayes"
import type {
  StopArm,
  StopArmRow,
  StopBucket,
  StopPositionRow,
  StopPosteriorDto,
} from "@/lib/momentum/contracts"

export const STOP_POLICY_KEY = "stops_policy"
export const MIN_TRADES_BUCKET = 200
export const EMBARGO_DAYS = 10 // วันทำการ — เทรดต้องปิดก่อน window start − embargo
export const REFIT_DAYS = 60 // สร้าง posterior ใหม่ทุก 60 วันทำการ
export const REFIT_START = 90 // refit ครั้งแรกเมื่อมีประวัติ ≥ 90 วันทำการ
export const MAX_DD = 0.25 // backstop สัมบูรณ์
const BASE_BACKSTOP = 0.15 // กำแพงหลังบ้านของชุดเทรด (สร้าง path ด้วย stop กว้างนี้)
const RECENCY = 0.995 // w = 0.995^Δวันทำการ
const COST_LEG = (TH_STRATEGY.costBps + TH_STRATEGY.slipBpsBase) / 1e4 // 70bps ต่อขา
const COST_RT = 2 * COST_LEG
const ARMS: StopArm[] = ["fixed10", "bayesT", "bayesR"]
const ARM_LABEL: Record<StopArm, string> = {
  fixed10: "fixed −10% (เดิม)",
  bayesT: "Bayes T-method",
  bayesR: "Bayes R-method",
}

export interface StopTradeRec {
  id: number
  symbol: string
  entry: string
  exit: string
  ret: number // % หลังต้นทุน
  mae: number
  regime: string
  src: string
  holdDays: number
  path: { d: string; p: number }[]
  exIdx: number | null // index วัน exit ในปฏิทินทำการ
  eiIdx: number | null
}

export interface StopsPolicy {
  arm: StopArm
  adopted: boolean
  decidedAt: string
  stats?: { sharpeDelta: number; maxDDDelta: number; n: number }
}

export async function readStopPolicy(): Promise<StopsPolicy | null> {
  const row = await db.setting.findUnique({ where: { key: STOP_POLICY_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as StopsPolicy
  } catch {
    return null
  }
}

// ---------- trades (cached) ----------
let _tradesCache: { key: string; trades: StopTradeRec[] } | null = null

export async function stopsDataKey(): Promise<string> {
  const [count, maxIdAgg, pivot] = await Promise.all([
    db.trade.count(),
    db.trade.aggregate({ _max: { id: true } }),
    closePivot(),
  ])
  return `${count}|${maxIdAgg._max.id ?? 0}|${pivot.dates[pivot.dates.length - 1] ?? ""}`
}

export async function loadClosedTrades(): Promise<{
  trades: StopTradeRec[]
  dates: string[]
  dateIdx: Map<string, number>
}> {
  const key = await stopsDataKey()
  const pivot = await closePivot()
  if (_tradesCache?.key === key) {
    return { trades: _tradesCache.trades, dates: pivot.dates, dateIdx: pivot.dateIdx }
  }
  const rows = await db.trade.findMany({ orderBy: [{ exit: "asc" }, { id: "asc" }] })
  const trades: StopTradeRec[] = []
  for (const r of rows) {
    let path: { d: string; p: number }[] = []
    try {
      const parsed = JSON.parse(r.pathJson) as { d: string; p: number }[]
      if (Array.isArray(parsed)) path = parsed
    } catch {
      path = []
    }
    trades.push({
      id: r.id,
      symbol: r.symbol,
      entry: r.entry,
      exit: r.exit,
      ret: r.ret,
      mae: r.mae,
      regime: r.regime,
      src: r.src,
      holdDays: r.holdDays,
      path,
      exIdx: pivot.dateIdx.get(r.exit) ?? null,
      eiIdx: pivot.dateIdx.get(r.entry) ?? null,
    })
  }
  _tradesCache = { key, trades }
  return { trades, dates: pivot.dates, dateIdx: pivot.dateIdx }
}

// ---------- ถังต่อผู้ตัดสินใจ (auto / human-approved) + กันถังบาง ----------
function bucketFilter(trades: StopTradeRec[], bucket: StopBucket): StopTradeRec[] {
  if (bucket === "auto") return trades.filter((t) => t.src === "auto")
  if (bucket === "human") return trades.filter((t) => t.src === "human-approved")
  return trades
}

function toBayes(trades: StopTradeRec[], asOfIdx: number): BayesTrade[] {
  return trades.map((t) => {
    const ex = t.exIdx ?? asOfIdx
    const dBack = Math.max(0, asOfIdx - ex)
    return { ret: t.ret, mae: t.mae, path: t.path, weight: Math.pow(RECENCY, dBack) }
  })
}

export interface BucketPosteriors {
  bucket: StopBucket
  pooled: boolean
  note: string | null
  nTrades: number
  postT: Posterior
  postR: Posterior
}

export function posteriorDto(p: Posterior): StopPosteriorDto {
  return {
    mode: p.mode,
    bin: p.bin,
    bins: p.bins,
    pL: p.pL,
    evHold: p.evHold,
    pBin: p.pBin,
    histW: p.histW,
    histL: p.histL,
    pW: p.pW,
    nTrades: p.nTrades,
    nObs: p.nObs,
    pooled: false,
    note: null,
    sOpt: p.sOpt,
    evOpt: p.evOpt,
    evNoStop: p.evNoStop,
    evCurve: p.evCurve,
  }
}

export async function getBucketPosteriors(bucket: StopBucket): Promise<BucketPosteriors> {
  const { trades, dates } = await loadClosedTrades()
  const asOfIdx = dates.length - 1
  let selected = bucketFilter(trades, bucket)
  let pooled = false
  let note: string | null = null
  if (selected.length < MIN_TRADES_BUCKET && bucket !== "pooled") {
    pooled = true
    note = `ถัง ${bucket} มี ${selected.length} เทรด (< ${MIN_TRADES_BUCKET}) — ใช้ pooled รวมทั้งหมดกัน posterior บาง`
    selected = trades
  }
  const bayes = toBayes(selected, asOfIdx)
  return {
    bucket,
    pooled,
    note,
    nTrades: selected.length,
    postT: buildPosterior(bayes, { mode: "T" }),
    postR: buildPosterior(bayes, { mode: "R" }),
  }
}

// ---------- walk-forward 3 arms ----------
interface ArmTrade {
  ret: number // % หลังต้นทุนของ arm
  stopped: boolean
  stopIdx: number
  ei: number
  ex: number
  s: number
}

interface ArmFull {
  arm: StopArm
  trades: ArmTrade[]
  equity: number[]
  stopNow: number | null
  sMap: Map<number, number> // refit index → s*
}

function simulateArm(arm: StopArm, trades: StopTradeRec[], N: number): ArmFull {
  // (1) walk-forward refit schedule — posterior สร้าง "จากอดีตเท่านั้น" (exit ≤ R − embargo)
  const sMap = new Map<number, number>()
  if (arm !== "fixed10") {
    for (let R = REFIT_START; R < N; R += REFIT_DAYS) {
      const usable = trades.filter((t) => t.exIdx !== null && t.exIdx <= R - EMBARGO_DAYS)
      const bayes = toBayes(usable, R)
      const p = buildPosterior(bayes, { mode: arm === "bayesT" ? "T" : "R" })
      sMap.set(R, p.sOpt === null ? 0.1 : Math.min(p.sOpt, BASE_BACKSTOP))
    }
  }
  // (2) s ของเทรดที่เข้าวัน ei = s* ของ refit ล่าสุดก่อน ei (ยังไม่ถึง REFIT_START → ใช้ fixed 0.10)
  const stopFor = (ei: number): number => {
    if (arm === "fixed10") return 0.1
    let s = 0.1
    for (let R = REFIT_START; R <= ei; R += REFIT_DAYS) {
      const v = sMap.get(R)
      if (v !== undefined) s = v
    }
    return s
  }

  const armTrades: ArmTrade[] = []
  const dayRet = new Array<number>(N).fill(0)
  const maxPos = TH_STRATEGY.maxPos

  for (const t of trades) {
    const ei = t.eiIdx
    const ex = t.exIdx
    if (ei === null || ex === null || ex <= ei) continue
    const s = stopFor(ei)
    // (3) เดิน path: ถ้า dd ≥ s ก่อนวันออกจริง → ถูก stop ที่ระดับ s
    let stopped = false
    let stopIdx = ex
    for (let j = ei + 1; j <= ex; j++) {
      const pt = t.path[j - ei]
      if (!pt) break
      if (Math.max(0, 1 - pt.p) >= s) {
        stopped = true
        stopIdx = j
        break
      }
    }
    armTrades.push({ ret: stopped ? (-s - COST_RT) * 100 : t.ret, stopped, stopIdx, ei, ex, s })

    // (4) daily accounting — slot เท่ากัน / maxPos, cost ต่อขา (entry + exit)
    dayRet[ei] += -COST_LEG
    const path = t.path
    for (let j = ei + 1; j <= stopIdx; j++) {
      const pj = path[j - ei]?.p
      const pp = path[j - ei - 1]?.p ?? 1
      if (!isFinite(pj) || !isFinite(pp) || pp <= 0) continue
      let r = pj / pp - 1
      if (stopped && j === stopIdx) r = (1 - s) / pp - 1 - COST_LEG
      else if (!stopped && j === ex) r -= COST_LEG
      dayRet[j] += r
    }
  }

  const equity: number[] = []
  let cur = 1
  for (let i = 0; i < N; i++) {
    cur *= 1 + dayRet[i] / maxPos
    equity.push(cur)
  }
  return { arm, trades: armTrades, equity, stopNow: null, sMap }
}

function armStats(a: ArmFull): StopArmRow {
  const n = a.trades.length
  let wins = 0
  let retSum = 0
  let stops = 0
  for (const t of a.trades) {
    if (t.ret > 0) wins++
    if (t.stopped) stops++
    retSum += t.ret
  }
  let cummax = a.equity[0] ?? 1
  let maxDD = 0
  for (const e of a.equity) {
    if (e > cummax) cummax = e
    const dd = e / cummax - 1
    if (dd < maxDD) maxDD = dd
  }
  const daily: number[] = []
  for (let i = 1; i < a.equity.length; i++) daily.push(a.equity[i] / a.equity[i - 1] - 1)
  const m = daily.reduce((s, x) => s + x, 0) / (daily.length || 1)
  const sd = Math.sqrt(daily.reduce((s, x) => s + (x - m) ** 2, 0) / (daily.length || 1))
  const sharpe = sd > 0 ? (m / sd) * Math.sqrt(252) : 0
  const last = a.equity[a.equity.length - 1] ?? 1
  const years = a.equity.length / 252
  const cagr = last > 0 && years > 0 ? Math.pow(last, 1 / years) - 1 : 0
  return {
    arm: a.arm,
    label: ARM_LABEL[a.arm],
    n,
    stopNow: a.stopNow,
    avgRet: Math.round((retSum / (n || 1)) * 100) / 100,
    winRate: Math.round((wins / (n || 1)) * 1000) / 1000,
    maxDD: Math.round(maxDD * 10000) / 10000,
    sharpe: Math.round(sharpe * 100) / 100,
    calmar: maxDD < 0 ? Math.round((cagr / Math.abs(maxDD)) * 100) / 100 : 0,
    cagr: Math.round(cagr * 10000) / 10000,
    stopShare: Math.round((stops / (n || 1)) * 1000) / 1000,
  }
}

export interface ArmsResult {
  rows: StopArmRow[]
  equityCurves: { date: string; fixed10: number; bayesT: number; bayesR: number }[]
  latestStop: { bayesT: number | null; bayesR: number | null }
  nTrades: number
}

export async function runStopArms(): Promise<ArmsResult> {
  const { trades, dates } = await loadClosedTrades()
  const N = dates.length
  const usable = trades.filter((t) => t.eiIdx !== null && t.exIdx !== null && t.exIdx > t.eiIdx)
  const simArms = ARMS.map((a) => simulateArm(a, usable, N))

  // stopNow ของ bayes arm = s* จาก refit ล่าสุดที่มีข้อมูลพอ
  const latestStop: { bayesT: number | null; bayesR: number | null } = { bayesT: null, bayesR: null }
  for (const a of simArms) {
    if (a.arm === "fixed10") {
      a.stopNow = 0.1
      continue
    }
    let s: number | null = null
    for (let R = REFIT_START; R < N; R += REFIT_DAYS) {
      const v = a.sMap.get(R)
      if (v !== undefined) s = v
    }
    a.stopNow = s
    if (a.arm === "bayesT") latestStop.bayesT = s
    else latestStop.bayesR = s
  }

  const rows = simArms.map((a) => armStats(a))

  // downsample equity curves ให้ ≤ 360 จุด
  const step = Math.max(1, Math.ceil(N / 360))
  const byArm = new Map(simArms.map((a) => [a.arm, a.equity]))
  const equityCurves: { date: string; fixed10: number; bayesT: number; bayesR: number }[] = []
  for (let i = 0; i < N; i += step) {
    equityCurves.push({
      date: dates[i],
      fixed10: Math.round((byArm.get("fixed10")?.[i] ?? 1) * 10000) / 10000,
      bayesT: Math.round((byArm.get("bayesT")?.[i] ?? 1) * 10000) / 10000,
      bayesR: Math.round((byArm.get("bayesR")?.[i] ?? 1) * 10000) / 10000,
    })
  }
  const lastIdx = N - 1
  if (N > 0 && equityCurves[equityCurves.length - 1]?.date !== dates[lastIdx]) {
    equityCurves.push({
      date: dates[lastIdx],
      fixed10: Math.round((byArm.get("fixed10")?.[lastIdx] ?? 1) * 10000) / 10000,
      bayesT: Math.round((byArm.get("bayesT")?.[lastIdx] ?? 1) * 10000) / 10000,
      bayesR: Math.round((byArm.get("bayesR")?.[lastIdx] ?? 1) * 10000) / 10000,
    })
  }
  return { rows, equityCurves, latestStop, nTrades: usable.length }
}

// ---------- บันทึกเทรดที่ปิดจริงจากพอร์ต (Jev exit → trade log) ----------
const COST_LEG_PERSIST = (TH_STRATEGY.costBps + TH_STRATEGY.slipBpsBase) / 1e4

/** เมื่อ Jev ปิดสถานะ → บันทึกเข้า Trade log (path รายวันจาก closePivot) เพื่อให้ posterior เรียนรู้ตัวเอง */
export async function persistClosedTrade(
  pos: { symbol: string; entryDate: string; entryPx: number },
  exitDate: string,
  regime: string
): Promise<boolean> {
  const pivot = await closePivot()
  const ei = pivot.dateIdx.get(pos.entryDate)
  const xi = pivot.dateIdx.get(exitDate)
  const si = pivot.symIdx.get(pos.symbol)
  if (ei === undefined || xi === undefined || si === undefined || xi <= ei || pos.entryPx <= 0) return false
  const path: { d: string; p: number }[] = []
  let mae = 0
  for (let j = ei; j <= xi; j++) {
    const px = pivot.px[j][si]
    if (!isFinite(px) || px <= 0) return false // ข้อมูลไม่ครบ — ไม่บันทึก (กัน path ปลอม)
    const p = px / pos.entryPx
    path.push({ d: pivot.dates[j], p: Math.round(p * 10000) / 10000 })
    mae = Math.max(mae, Math.max(0, 1 - p))
  }
  const pLast = path[path.length - 1].p
  const ret = Math.round((pLast - 1 - 2 * COST_LEG_PERSIST) * 100 * 100) / 100
  await db.trade.create({
    data: {
      symbol: pos.symbol,
      entry: pos.entryDate,
      exit: exitDate,
      entryPx: pos.entryPx,
      exitPx: pivot.px[xi][si],
      ret,
      mae: Math.round(mae * 10000) / 10000,
      regime,
      src: "auto",
      holdDays: xi - ei,
      pathJson: JSON.stringify(path),
      stopPolicy: "jev",
    },
  })
  return true
}

// ---------- ตำแหน่งเปิดวันนี้ ----------
export async function evaluateStopPositions(post: Posterior): Promise<StopPositionRow[]> {
  const [positions, pivot] = await Promise.all([db.position.findMany(), closePivot()])
  const pi = pivot.dates.length - 1
  const backstop = liveBackstop(post)
  const rows: StopPositionRow[] = []
  for (const p of positions) {
    const si = pivot.symIdx.get(p.symbol)
    const lastPx = si === undefined || pi < 0 ? NaN : pivot.px[pi][si]
    if (!isFinite(lastPx) || p.entryPx <= 0) continue
    const dNow = Math.max(0, 1 - lastPx / p.entryPx)
    const lv = liveExit(post, dNow)
    rows.push({
      symbol: p.symbol,
      entryDate: p.entryDate,
      entryPx: p.entryPx,
      lastPx,
      pnlPct: Math.round((lastPx / p.entryPx - 1) * 1000) / 10,
      dNow: Math.round(dNow * 10000) / 10000,
      bin: lv.bin,
      pL: lv.pL === null ? null : Math.round(lv.pL * 1000) / 1000,
      evHold: lv.evHold === null ? null : Math.round(lv.evHold * 10000) / 10000,
      exitNow: lv.exit || dNow >= MAX_DD,
      beyondOpt: backstop !== null && dNow >= backstop,
      regime: "-",
    })
  }
  rows.sort((a, b) => b.dNow - a.dNow)
  return rows
}
