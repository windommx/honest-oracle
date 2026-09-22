// report.ts — ประกอบรายงาน SET Sniper ทั้งชุด (server-side, cache ตาม dataKey)
// แหล่งข้อมูล: RawDaily (close/open/high/low/val) · CrossAsset · Trade (paper) · Position · DQ
// ทุกชั้นเอนจิน pure — ที่นี่แค่โหลด/จัดข้อมูลและเรียกใช้

import { db } from "@/lib/db"
import { loadAll, dataKey, loadSectorOf } from "@/lib/momentum/signals/io"
import { computeRegimeState, runDataQualityChecks } from "@/lib/momentum/core"
import { loadPanel } from "@/lib/gtaa/data"
import { computeMacroState } from "@/lib/gtaa/macro"
import { evaluateSymbol } from "./confluence"
import { sectorRotation } from "./rotation"
import { crossAssetLeadLag } from "./leadlag"
import { computeBreaker } from "./breaker"
import type { OhlcBar, SniperReport, SniperSeries } from "./types"

const WATCHLIST_LIMIT = 24
const BARS_WINDOW = 260
const MIN_PRICE = 1
const MIN_AVG_VAL = 1e6

let _cache: { key: string; report: SniperReport } | null = null

export async function runSniperReport(): Promise<SniperReport> {
  const t0 = Date.now()
  const key = await dataKey()
  if (_cache && _cache.key === key) return _cache.report

  const { rows } = await loadAll()
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const latestDate = dates[dates.length - 1] ?? ""
  const notes: string[] = []

  // ---- market series (equal-weight ของหุ้นที่มีข้อมูล) + breadth20 ----
  const closesBySym = new Map<string, number[]>()
  const valsBySym = new Map<string, number[]>()
  const rowsBySymCount = new Map<string, number>()
  for (const r of rows) {
    let c = closesBySym.get(r.symbol)
    if (!c) {
      c = []
      closesBySym.set(r.symbol, c)
    }
    c.push(r.close)
    let v = valsBySym.get(r.symbol)
    if (!v) {
      v = []
      valsBySym.set(r.symbol, v)
    }
    v.push(r.val)
    rowsBySymCount.set(r.symbol, (rowsBySymCount.get(r.symbol) ?? 0) + 1)
  }
  const nDates = dates.length
  const mktRet: number[] = []
  const breadth20: number[] = []
  for (let i = 0; i < nDates; i++) {
    let s = 0
    let n = 0
    let above = 0
    let aboveN = 0
    for (const [sym, c] of closesBySym) {
      if (c.length !== nDates) continue // ตัดซีรีส์ที่มีรูออกจากเกณฑ์ตลาด (คง behavior เดิมของระบบ)
      const v = valsBySym.get(sym)![i]
      if (v >= MIN_AVG_VAL) {
        if (i > 0 && c[i - 1] > 0) {
          s += c[i] / c[i - 1] - 1
          n++
        }
        if (i >= 20 && c[i - 20] > 0) {
          aboveN++
          if (c[i] > c[i - 20]) above++
        }
      }
    }
    mktRet.push(n > 0 ? s / n : 0)
    breadth20.push(aboveN > 0 ? above / aboveN : 0.5)
  }
  const mkt1d = mktRet[nDates - 1] ?? 0
  const mkt5d = nDates >= 6 ? closes5(mktRet, 5) : 0

  // ---- watchlist: ตัวสภาพคล่องสูงสุด (เฉลี่ย val 20 วันล่าสุด) ----
  interface Cand {
    symbol: string
    avgVal: number
    lastClose: number
  }
  const cands: Cand[] = []
  for (const [sym, c] of closesBySym) {
    if (c.length < 61) continue
    const v = valsBySym.get(sym) ?? []
    const win = v.slice(-20)
    const avgVal = win.reduce((s, x) => s + x, 0) / (win.length || 1)
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
        hasOhlc: bars.length > 0 && bars[bars.length - 1].open > 0 && bars[bars.length - 1].high > 0 && bars[bars.length - 1].low > 0,
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
    const mktSeries = dates.map((d, i) => ({ date: d, ret: mktRet[i] }))
    leadlag = crossAssetLeadLag(cross, mktSeries)
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
    gtaa = { stance: m.stance, cashPct: m.cashPct, asOfMonth: m.asOfMonth, source: m.source }
  } catch {
    /* GTAA ไม่พร้อม */
  }

  // ---- briefing note ----
  const bNote =
    mkt1d <= -0.02
      ? `ตลาดร่วง ${(mkt1d * 100).toFixed(1)}% วันล่าสุด — โหมดระวัง ใช้ Circuit Breaker เป็นตัวตัดสินก่อนเปิดไม้ใหม่`
      : breadth20[nDates - 1] >= 0.6
        ? `Breadth 20 วัน ${(breadth20[nDates - 1] * 100).toFixed(0)}% — ตลาดกว้างเป็นฝั่งซื้อ โฟกัสผู้นำกลุ่ม`
        : `ตลาดไม่มีทิศทางชัด (breadth ${(breadth20[nDates - 1] * 100).toFixed(0)}%) — จำกัดจำนวนไม้ รอ sweep/FVG ยืนยัน`

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
        ret1d: mkt1d,
        ret5d: mkt5d,
        breadth20: breadth20[nDates - 1] ?? 0.5,
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

function closes5(rets: number[], k: number): number {
  const n = rets.length
  let eq = 1
  for (let i = n - k; i < n; i++) eq *= 1 + rets[i]
  return eq - 1
}
