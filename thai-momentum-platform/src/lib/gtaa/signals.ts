// สร้างสัญญาณ 1 เดือน: trend filter (SMA) → momentum rank → Top-N equal weight + เงินสด
// รองรับ nuance 2 แบบ: กรองก่อนจัดอันดับ (แบบโพสต์) vs จัดอันดับก่อนแล้วตัดตัวหลุดเทรนด์

import { momentumScore, smaAt } from "./math"
import { GTAA_UNIVERSE } from "./defaults"
import type { GtaaConfig, GtaaPanel, SignalRow } from "./types"

export interface MonthSignals {
  rows: SignalRow[]
  /** น้ำหนักเป้าหมาย ณ ปิดเดือน t — key = ticker (รวมตัวเงินสดที่เลือกใช้), ผลรวม = 1 */
  weights: Record<string, number>
  cashTicker: string
}

/** หาตัวเงินสดที่ใช้พักตาม cashMode — trendedBond = IEF ถ้าเหนือ SMA10 ของตัวเอง ไม่งั้น BIL */
function pickCashTicker(panel: GtaaPanel, t: number, cfg: GtaaConfig): string {
  if (cfg.cashMode === "tbill") return "BIL"
  const ief = panel.closes["IEF"]
  if (!ief) return "BIL"
  const sma = smaAt(ief, t, Math.min(10, cfg.smaMonths))
  const price = ief[t]
  if (sma === null || price === null || price === undefined) return "BIL"
  return price > sma ? "IEF" : "BIL"
}

/** สัญญาณทั้งเดือน ณ ปิดเดือน index t (ข้อมูล ≤ t เท่านั้น — ไม่มี look-ahead) */
export function computeMonthSignals(panel: GtaaPanel, t: number, cfg: GtaaConfig): MonthSignals {
  const rows: SignalRow[] = []
  interface Cand {
    ticker: string
    score: number
    trendPass: boolean
  }
  const scoreable: Cand[] = []

  for (const asset of GTAA_UNIVERSE) {
    const closes = panel.closes[asset.ticker]
    const close = closes?.[t] ?? null
    if (close === null || close === undefined) continue
    const sma = smaAt(closes, t, cfg.smaMonths)
    const trendPass = sma !== null && close > sma
    const ms = momentumScore(closes, t, cfg.skipMonths)
    rows.push({
      ticker: asset.ticker,
      name: asset.name,
      group: asset.group,
      close,
      sma: sma ?? NaN,
      trendPass,
      r1: ms?.r1 ?? null,
      r3: ms?.r3 ?? null,
      r6: ms?.r6 ?? null,
      r12: ms?.r12 ?? null,
      score: ms?.score ?? null,
      rank: null,
      weight: 0,
      status: "kicked",
    })
    if (ms && trendPass) scoreable.push({ ticker: asset.ticker, score: ms.score, trendPass: true })
    else if (ms) scoreable.push({ ticker: asset.ticker, score: ms.score, trendPass: false })
  }

  // จัดอันดับ: filter-then-rank = คัดผ่านเทรนด์ก่อนแล้วเรียง | rank-then-filter = เรียงก่อนแล้วค่อยตัด
  const pool =
    cfg.filterOrder === "filter-then-rank"
      ? scoreable.filter((c) => c.trendPass).sort((a, b) => b.score - a.score)
      : [...scoreable].sort((a, b) => b.score - a.score)

  const picked = pool.slice(0, cfg.topN).filter((c) => c.trendPass)
  const pickedSet = new Set(picked.map((c) => c.ticker))
  const wEach = 1 / cfg.topN

  const weights: Record<string, number> = {}
  for (const c of picked) weights[c.ticker] = wEach

  const cashTicker = pickCashTicker(panel, t, cfg)
  const cashWeight = 1 - picked.reduce((a, c) => a + wEach, 0)
  if (cashWeight > 1e-9) weights[cashTicker] = (weights[cashTicker] ?? 0) + cashWeight

  // ประกอบแถวสำหรับ UI — rank เฉพาะใน pool ที่ใช้จัด
  const rankOf = new Map<string, number>()
  pool.forEach((c, i) => rankOf.set(c.ticker, i + 1))
  for (const r of rows) {
    r.rank = rankOf.get(r.ticker) ?? null
    r.weight = weights[r.ticker] ?? 0
    if (pickedSet.has(r.ticker)) r.status = "selected"
    else if (r.trendPass && r.score !== null) r.status = "reserve"
    else r.status = "kicked"
  }
  rows.sort((a, b) => {
    const order = { selected: 0, reserve: 1, kicked: 2 } as const
    const oa = order[a.status]
    const ob = order[b.status]
    if (oa !== ob) return oa - ob
    return (a.rank ?? 99) - (b.rank ?? 99)
  })

  return { rows, weights, cashTicker }
}
