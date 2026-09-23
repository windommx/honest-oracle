// report.ts — ประกอบรายงาน SET Sniper ทั้งชุด (server-side, cache ตาม sniperKey = dataKey + Trade/Position/CrossAsset/GTAA)
// แหล่งข้อมูล: RawDaily (close/open/high/low/val) · CrossAsset · Trade (paper) · Position · DQ
// ทุกชั้นเอนจิน pure — ที่นี่แค่โหลด/จัดข้อมูลและเรียกใช้

import { stat } from "node:fs/promises"
import { db } from "@/lib/db"
import { loadAll, dataKey, loadSectorOf } from "@/lib/momentum/signals/io"
import { computeRegimeState, runDataQualityChecks } from "@/lib/momentum/core"
import { GTAA_PANEL_PATH, loadPanel } from "@/lib/gtaa/data"
import { computeMacroState } from "@/lib/gtaa/macro"
import { evaluateSymbol } from "./confluence"
import { hasOhlc } from "./structure"
import { sectorRotation } from "./rotation"
import { crossAssetLeadLag } from "./leadlag"
import { computeBreaker } from "./breaker"
import type { OhlcBar, SniperReport, SniperSeries } from "./types"

const WATCHLIST_LIMIT = 24
const BARS_WINDOW = 260
const MIN_PRICE = 1
const MIN_AVG_VAL = 1e6
const MAX_DAILY_MOVE = 0.35 // เท่ากับเกณฑ์ DQ "ราคากระโดด > 35%" ใน core.ts

let _cache: { key: string; report: SniperReport } | null = null

/**
 * cache key ของรายงาน = dataKey (RawDaily/Snapshot) + ทุกแหล่งที่รายงานอ่านเพิ่ม:
 * Trade/Position เปลี่ยนเมื่อ Jev ปิดไม้หรือมนุษย์อนุมัติ gate โดย RawDaily ไม่เปลี่ยน ·
 * CrossAsset อัปเดตแยกจากสคริปต์ · panel GTAA เป็นไฟล์ — ถ้าไม่รวม breaker/lead-lag/GTAA จะค้างค่าเก่า
 */
export async function sniperKey(): Promise<string> {
  // ตารางเสริมอ่านไม่ได้ = ใช้ป้ายคงที่ (รายงานเองจัดการกรณีนี้ด้วย try/catch อยู่แล้ว — key ต้องไม่ทำให้ route ล้ม)
  const [dk, trade, pos, cross, gtaaMtime] = await Promise.all([
    dataKey(),
    db.trade
      .aggregate({ _count: { _all: true }, _max: { id: true } })
      .then((a) => `${a._count._all}:${a._max.id ?? 0}`)
      .catch(() => "?"),
    db.position
      .aggregate({ _count: { _all: true }, _max: { createdAt: true } })
      .then((a) => `${a._count._all}:${a._max.createdAt?.getTime() ?? 0}`)
      .catch(() => "?"),
    db.crossAsset
      .aggregate({ _count: { _all: true }, _max: { date: true } })
      .then((a) => `${a._count._all}:${a._max.date ?? ""}`)
      .catch(() => "?"),
    stat(GTAA_PANEL_PATH)
      .then((s) => s.mtimeMs)
      .catch(() => 0),
  ])
  // เดือนปัจจุบัน (UTC — นาฬิกาเดียวกับ stalenessOf ของ GTAA): ข้ามเดือนแล้ว staleMonths เปลี่ยน รายงานต้องคำนวณใหม่
  const month = new Date().toISOString().slice(0, 7)
  return [dk, `t${trade}`, `p${pos}`, `x${cross}`, `g${gtaaMtime}`, `m${month}`].join("|")
}

export async function runSniperReport(): Promise<SniperReport> {
  const t0 = Date.now()
  const key = await sniperKey()
  if (_cache && _cache.key === key) return _cache.report

  const { rows } = await loadAll()
  const mkt = marketSeries(rows)
  const dates = mkt.dates
  const nDates = dates.length
  const latestDate = dates[nDates - 1] ?? ""
  const notes: string[] = []

  const closesBySym = new Map<string, number[]>()
  for (const r of rows) {
    let c = closesBySym.get(r.symbol)
    if (!c) {
      c = []
      closesBySym.set(r.symbol, c)
    }
    c.push(r.close)
  }
  // breaker ใช้ 0 เมื่อวัดไม่ได้ (= ไม่มีหลักฐานว่าตลาดร่วง) — ส่วน Daily Brief แสดง "—" ตามจริง
  const mkt1d = mkt.ret1d ?? 0
  const mkt5d = mkt.ret5d ?? 0

  // ---- watchlist: ตัวสภาพคล่องสูงสุด (เฉลี่ย val 20 วันล่าสุด) ----
  interface Cand {
    symbol: string
    avgVal: number
    lastClose: number
  }
  const cands: Cand[] = []
  for (const [sym, c] of closesBySym) {
    if (c.length < 61) continue
    const avgVal = recentAvgVal(mkt.valAt.get(sym)!)
    const lastClose = c[c.length - 1]
    if (lastClose >= MIN_PRICE && avgVal >= MIN_AVG_VAL) cands.push({ symbol: sym, avgVal, lastClose })
  }
  cands.sort((a, b) => b.avgVal - a.avgVal)
  const watchlist = cands.slice(0, WATCHLIST_LIMIT)
  const watchSet = new Set(watchlist.map((c) => c.symbol))

  // ---- OHLC bars ของ watchlist (แท่งล่าสุด 260 แท่ง) ----
  const series: SniperSeries[] = []
  const sectorOf = await loadSectorOf()
  if (watchSet.size > 0) {
    const raw = await db.rawDaily.findMany({
      where: { symbol: { in: [...watchSet] } },
      select: { date: true, symbol: true, close: true, open: true, high: true, low: true, val: true },
      orderBy: [{ date: "asc" }, { symbol: "asc" }],
    })
    const bySym = new Map<string, OhlcBar[]>()
    for (const r of raw) {
      let arr = bySym.get(r.symbol)
      if (!arr) {
        arr = []
        bySym.set(r.symbol, arr)
      }
      arr.push({
        date: r.date,
        close: r.close,
        open: r.open ?? 0,
        high: r.high ?? 0,
        low: r.low ?? 0,
        val: r.val,
      })
    }
    for (const c of watchlist) {
      const bars = (bySym.get(c.symbol) ?? []).slice(-BARS_WINDOW)
      series.push({
        symbol: c.symbol,
        sector: sectorOf(c.symbol) || "Unknown",
        bars,
        hasOhlc: hasOhlc(bars), // เกณฑ์เดียวกับที่ confluence ใช้เปิด/ปิดชั้น Location/Value
      })
    }
  }
  if (series.length > 0 && series.every((s) => !s.hasOhlc)) {
    notes.push("ข้อมูลทั้งหมดไม่มี open/high/low — อัปโหลด CSV ที่มีคอลัมน์ open,high,low เพื่อเปิดชั้น ICT Location/Value เต็มรูป")
  }

  // ---- confluence + events ----
  const confluence = series.map(evaluateSymbol)
  const sweeps = confluence
    .flatMap((c) => (c.sweep && c.sweep.barsAgo <= 5 ? [{ ...c.sweep, symbol: c.symbol }] : []))
    .sort((a, b) => a.barsAgo - b.barsAgo)
    .slice(0, 20)
  const fvgs = confluence
    .flatMap((c) => c.fvgs.filter((f) => f.barsAgo <= 5).map((f) => ({ ...f, symbol: c.symbol })))
    .sort((a, b) => a.barsAgo - b.barsAgo)
    .slice(0, 20)

  // ---- rotation ----
  const rotation = sectorRotation(rows, sectorOf, latestDate)

  // ---- lead-lag ----
  let leadlag: SniperReport["leadlag"] = []
  try {
    const cross = await db.crossAsset.findMany({ select: { date: true, asset: true, close: true } })
    // เฉพาะวันที่วัดตลาดได้จริง (วันที่ไม่มีหุ้นให้วัดไม่ถูกนับเป็นผลตอบแทน 0)
    const mktSeries = dates.flatMap((d, i) => (Number.isFinite(mkt.mktRet[i]) ? [{ date: d, ret: mkt.mktRet[i] }] : []))
    leadlag = crossAssetLeadLag(cross, mktSeries)
    // ตารางว่าง (ติดตั้งใหม่) ไม่ throw — ต้องบอกเหตุผลเองว่าทำไมชั้นนี้ว่าง
    if (cross.length === 0) notes.push("CrossAsset ยังไม่มีข้อมูล — ชั้น lead-lag ปิดชั่วคราว")
    else if (leadlag.length === 0)
      notes.push("CrossAsset มีข้อมูลแต่สั้นไป หรือช่วงวันที่ทับกับตลาดไทยไม่พอ — ชั้น lead-lag ปิดชั่วคราว")
  } catch {
    notes.push("CrossAsset ยังไม่มีข้อมูล — ชั้น lead-lag ปิดชั่วคราว")
  }

  // ---- circuit breaker ----
  let closedTrades: { exitDate: string; ret: number }[] = []
  let openPositions = 0
  let dqFlags = 0
  try {
    const [trades, positions, dq] = await Promise.all([
      db.trade.findMany({ where: { openTrade: false }, orderBy: { exit: "desc" }, take: 60, select: { exit: true, ret: true } }),
      db.position.count(),
      runDataQualityChecks(),
    ])
    closedTrades = trades.map((t) => ({ exitDate: t.exit, ret: t.ret }))
    openPositions = positions
    dqFlags = dq.flags.length
  } catch {
    notes.push("อ่าน Trade/Position/DQ ไม่ได้ — breaker คำนวณจากฝั่งตลาดเท่านั้น")
  }
  const breaker = computeBreaker({ latestDate, mkt1d, mkt5d, closedTrades, openPositions, dqFlags })

  // ---- regime + GTAA (เชื่อมข้ามโมดูล — ล้มได้ไม่ทำให้โมดูลพัง) ----
  let regime: SniperReport["briefing"]["regime"] = null
  try {
    const r = await computeRegimeState()
    if (r) regime = { label: r.action, score: r.conf }
  } catch {
    /* regime ไม่พร้อม */
  }
  let gtaa: SniperReport["briefing"]["gtaa"] = null
  try {
    const { panel } = await loadPanel()
    const m = computeMacroState(panel)
    gtaa = { stance: m.stance, cashPct: m.cashPct, asOfMonth: m.asOfMonth, source: m.source, staleMonths: m.staleMonths }
  } catch {
    /* GTAA ไม่พร้อม */
  }

  const bNote = marketNote(mkt.ret1d, mkt.breadth, nDates)

  const report: SniperReport = {
    meta: {
      latestDate,
      generatedAt: new Date().toISOString(),
      watchlistCount: series.length,
      hasOhlcCount: series.filter((s) => s.hasOhlc).length,
      runtimeMs: Date.now() - t0,
      proxyNotice: "DAILY PROXY — เอนจินนี้ทำงานบนข้อมูลรายวัน (OHLC + มูลค่าซื้อขาย) ไม่ใช่ tick/footprint/DOM จริง · สิ่งที่ต้องใช้ Level-2 ข้อมูล (Delta แท้, Iceberg, Ghost Wall, Block Trade window) ถูกแทนด้วย proxy ที่ติดป้ายชัดเจน",
      notes,
    },
    briefing: {
      latestDate,
      generatedAt: new Date().toISOString(),
      regime,
      gtaa,
      mkt: {
        ret1d: mkt.ret1d,
        ret5d: mkt.ret5d,
        breadth20: mkt.breadth,
        note: bNote,
      },
      rotation,
      leadlag,
      notes,
    },
    breaker,
    rotation,
    leadlag,
    confluence,
    events: { sweeps, fvgs },
  }
  _cache = { key, report }
  return report
}

type MarketRow = { date: string; symbol: string; close: number; val: number }

/**
 * ตลาด equal-weight + breadth20 บน "ปฏิทินตลาด" (pure — ทดสอบได้)
 * จัดราคา/มูลค่าให้ตรงวันที่ (NaN = วันนั้นหุ้นไม่มีแถว: หยุดพัก / IPO ทีหลัง / เลิกซื้อขาย)
 * ผลตอบแทนวัน i นับเฉพาะหุ้นสภาพคล่องผ่านที่มีแถวทั้งวัน i และวันก่อนหน้า · breadth: วัน i และ i−20
 * (เดิมใช้เฉพาะซีรีส์ที่ไม่มีรูเลย — ข้อมูลจริงเกือบทุกตัวมีรู → ตลาด 0% / breadth 50% ตลอด และ breaker ไม่มีวันทำงาน)
 * วันไหนวัดไม่ได้ = NaN ในซีรีส์ และ null ในค่าสรุป — ห้ามเติม 0/0.5 ปลอม
 */
export function marketSeries(rows: MarketRow[]): {
  dates: string[]
  mktRet: number[]
  breadth20: number[]
  valAt: Map<string, Float64Array>
  ret1d: number | null
  ret5d: number | null
  breadth: number | null
} {
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const nDates = dates.length
  const dateIdx = new Map(dates.map((d, i) => [d, i]))
  const closeAt = new Map<string, Float64Array>()
  const valAt = new Map<string, Float64Array>()
  for (const r of rows) {
    let c = closeAt.get(r.symbol)
    let v = valAt.get(r.symbol)
    if (!c || !v) {
      c = new Float64Array(nDates).fill(NaN)
      v = new Float64Array(nDates).fill(NaN)
      closeAt.set(r.symbol, c)
      valAt.set(r.symbol, v)
    }
    const i = dateIdx.get(r.date)!
    c[i] = r.close
    v[i] = r.val
  }
  const mktRet: number[] = []
  const breadth20: number[] = []
  for (let i = 0; i < nDates; i++) {
    let s = 0
    let n = 0
    let above = 0
    let aboveN = 0
    for (const [sym, c] of closeAt) {
      const v = valAt.get(sym)![i]
      if (v >= MIN_AVG_VAL && c[i] > 0) {
        if (i > 0 && c[i - 1] > 0) {
          const r = c[i] / c[i - 1] - 1
          // วันเดียว > 35% = เกินเพดาน ±30% ของ SET (เกณฑ์เดียวกับ DQ "ราคากระโดดผิดปกติ") → corporate action /
          // ข้อมูลผิด ไม่ใช่การเคลื่อนของตลาด — ไม่ให้ split ที่ไม่ได้ปรับราคาดึงตลาดจนทริกเกอร์ breaker ปลอม
          if (Math.abs(r) <= MAX_DAILY_MOVE) {
            s += r
            n++
          }
        }
        if (i >= 20 && c[i - 20] > 0) {
          aboveN++
          if (c[i] > c[i - 20]) above++
        }
      }
    }
    mktRet.push(n > 0 ? s / n : NaN)
    breadth20.push(aboveN > 0 ? above / aboveN : NaN)
  }
  const lastRet = mktRet[nDates - 1]
  const lastBreadth = breadth20[nDates - 1]
  return {
    dates,
    mktRet,
    breadth20,
    valAt,
    ret1d: Number.isFinite(lastRet) ? lastRet : null,
    ret5d: nDates >= 6 ? closes5(mktRet, 5) : null,
    breadth: Number.isFinite(lastBreadth) ? lastBreadth : null,
  }
}

/**
 * มูลค่าซื้อขายเฉลี่ย "20 วันตลาดล่าสุด" (ตามเกณฑ์ watchlist) — วันที่หุ้นไม่มีแถว (หยุดพัก/เลิกซื้อขาย) = 0
 * เดิมใช้ 20 แถวสุดท้ายของหุ้นเอง → หุ้นที่หยุดซื้อขายไปนานยังติด watchlist ด้วยสภาพคล่องเก่า
 */
export function recentAvgVal(valsOnCalendar: Float64Array, win = 20): number {
  const n = valsOnCalendar.length
  const from = Math.max(0, n - win)
  let sum = 0
  for (let i = from; i < n; i++) if (Number.isFinite(valsOnCalendar[i])) sum += valsOnCalendar[i]
  return sum / (n - from || 1)
}

/** โน้ตตลาดของ Daily Brief — ค่าที่วัดไม่ได้บอกตรง ๆ (เดิมพิมพ์ "breadth NaN%" เมื่อ DB ว่าง) */
export function marketNote(ret1d: number | null, breadth: number | null, nDates: number): string {
  if (ret1d !== null && ret1d <= -0.02)
    return `ตลาดร่วง ${(ret1d * 100).toFixed(1)}% วันล่าสุด — โหมดระวัง ใช้ Circuit Breaker เป็นตัวตัดสินก่อนเปิดไม้ใหม่`
  if (breadth === null)
    return nDates === 0
      ? "ยังไม่มีข้อมูลตลาด — ingest ข้อมูลรายวันก่อน แล้ว Daily Brief จะสรุปตลาดให้"
      : "ข้อมูลตลาดยังไม่พอคำนวณ breadth 20 วัน — จำกัดจำนวนไม้ รอ sweep/FVG ยืนยัน"
  if (breadth >= 0.6) return `Breadth 20 วัน ${(breadth * 100).toFixed(0)}% — ตลาดกว้างเป็นฝั่งซื้อ โฟกัสผู้นำกลุ่ม`
  return `ตลาดไม่มีทิศทางชัด (breadth ${(breadth * 100).toFixed(0)}%) — จำกัดจำนวนไม้ รอ sweep/FVG ยืนยัน`
}

/** ผลตอบแทนทบต้น k วันล่าสุด — null ถ้าวันใดวัดไม่ได้ (ไม่เดา) */
function closes5(rets: number[], k: number): number | null {
  const n = rets.length
  let eq = 1
  for (let i = n - k; i < n; i++) {
    if (!Number.isFinite(rets[i])) return null
    eq *= 1 + rets[i]
  }
  return eq - 1
}
