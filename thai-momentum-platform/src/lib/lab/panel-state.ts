// ============================================================
// Shadow Lab — real-panel state builder (จาก RawDaily)
//
// OHLC proxy — แล็บเงาใช้ close-series เท่านั้น เพื่อนิยามเดียวกันทุกที่
// (กัน train/serve skew): โซน/ทริกเกอร์/stop ต่างประมาณจาก close ล้วน ๆ
// แท่งเทียนจริง (high/low) ยังไม่ ingest — เมื่อ ingest แล้วให้แทนที่
// สูตร wick/close_pos ตรงนี้จุดเดียว แล้วทั้ง rule และ Nimble เห็นเหมือนกันทันที
// ============================================================

import { db } from '@/lib/db'
import type { StatePacket } from './state'

export interface PanelStateRow {
  asset: string
  packet: StatePacket
  entryPx: number
  stopPx: number
}

export interface PanelStates {
  date: string
  states: PanelStateRow[]
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const r2 = (x: number) => Math.round(x * 100) / 100
const r4 = (x: number) => Math.round(x * 10000) / 10000

export interface PanelRow {
  date: string
  symbol: string
  close: number
  val: number
  liq5: number
}

export async function buildPanelStates(limit?: number): Promise<PanelStates> {
  // โหลด RawDaily ครั้งเดียวต่อ request (เรียง date, symbol) — ตามสเปก
  const rows = await db.rawDaily.findMany({
    select: { date: true, symbol: true, close: true, val: true, liq5: true },
    orderBy: [{ date: 'asc' }, { symbol: 'asc' }],
  })
  return panelStatesFromRows(rows, limit)
}

// ส่วนคำนวณล้วน (ไม่แตะ DB) — rows ต้องเรียง (date, symbol) จากเก่าไปใหม่
export function panelStatesFromRows(rows: PanelRow[], limit?: number): PanelStates {
  if (rows.length === 0) return { date: '', states: [] }

  // ---------------- สร้าง matrix: close / val / liq ----------------
  const dates: string[] = []
  const dateIdx = new Map<string, number>()
  const symbols: string[] = []
  const symIdx = new Map<string, number>()
  for (const row of rows) {
    if (!dateIdx.has(row.date)) {
      dateIdx.set(row.date, dates.length)
      dates.push(row.date)
    }
    if (!symIdx.has(row.symbol)) {
      symIdx.set(row.symbol, symbols.length)
      symbols.push(row.symbol)
    }
  }
  const D = dates.length
  const N = symbols.length
  const closeM: number[][] = Array.from({ length: D }, () => new Array<number>(N).fill(NaN))
  const valM: number[][] = Array.from({ length: D }, () => new Array<number>(N).fill(NaN))
  const liqM: number[][] = Array.from({ length: D }, () => new Array<number>(N).fill(0))
  for (const row of rows) {
    const i = dateIdx.get(row.date)!
    const j = symIdx.get(row.symbol)!
    closeM[i][j] = row.close
    valM[i][j] = row.val
    liqM[i][j] = row.liq5
  }

  const T = D - 1 // แถววันล่าสุด
  const date = dates[T]

  // ---------------- ดัชนีตลาด: ค่าเฉลี่ยราคาเฉพาะหุ้นสภาพคล่อง (liq-filtered) ต่อวัน ----------------
  const marketMean: number[] = []
  for (let i = 0; i < D; i++) {
    let sum = 0
    let n = 0
    for (let j = 0; j < N; j++) {
      if (liqM[i][j] === 1 && Number.isFinite(closeM[i][j])) {
        sum += closeM[i][j]
        n++
      }
    }
    marketMean.push(n > 0 ? sum / n : NaN)
  }
  const dmaMean = (series: number[], at: number, win: number): number => {
    if (at - win + 1 < 0) return NaN
    let s = 0
    for (let k = at - win + 1; k <= at; k++) {
      if (!Number.isFinite(series[k])) return NaN
      s += series[k]
    }
    return s / win
  }
  const mktDmaToday = dmaMean(marketMean, T, 200)
  const indexOk = Number.isFinite(mktDmaToday) && marketMean[T] > mktDmaToday

  // ---------------- ผู้สมัคร: liq=1 + close>1.5 + บาร์ก่อนหน้า ≥260 ----------------
  type Cand = {
    j: number
    symbol: string
    close: number
    prev: number
    prev2: number
    bars: number
    series: number[]
  }
  const cands: Cand[] = []
  for (let j = 0; j < N; j++) {
    if (liqM[T][j] !== 1) continue
    const close = closeM[T][j]
    if (!(close > 1.5)) continue
    // นับบาร์ก่อนหน้าของหุ้นนี้ (นอกวันล่าสุด)
    let bars = 0
    for (let i = 0; i < T; i++) if (Number.isFinite(closeM[i][j])) bars++
    if (bars < 260) continue
    // ซีรีส์ของหุ้น (เก่า → ใหม่) — ใช้ซีรีส์ตัวเองคำนวณ dma กันข้อมูลหลุดวัน
    const series: number[] = []
    for (let i = 0; i <= T; i++) if (Number.isFinite(closeM[i][j])) series.push(closeM[i][j])
    const K = series.length
    if (K < 3) continue
    cands.push({
      j,
      symbol: symbols[j],
      close,
      prev: series[K - 2],
      prev2: series[K - 3],
      bars,
      series,
    })
  }
  if (cands.length === 0) return { date, states: [] }

  // ---------------- selection: rs_pct = percentile ขวางตลาดของผลตอบแทน 120 วัน ----------------
  const ret120 = cands.map((c) => {
    const K = c.series.length
    if (K < 121) return NaN
    const base = c.series[K - 121]
    return base > 0 ? c.close / base - 1 : NaN
  })
  const valid = cands.map((_, i) => Number.isFinite(ret120[i]))
  const nValid = valid.filter(Boolean).length

  // ---------------- ประกอบ State Packet ต่อหุ้น ----------------
  const built: PanelStateRow[] = []
  for (let ci = 0; ci < cands.length; ci++) {
    const c = cands[ci]
    if (!valid[ci]) continue
    const close = c.close
    const ret1 = c.prev > 0 ? close / c.prev - 1 : 0
    const ret2 = c.prev2 > 0 ? c.prev / c.prev2 - 1 : 0

    // G1 regime — 200dma + slope 21 วัน + ดัชนีตลาด
    const dma = dmaMean(c.series, c.series.length - 1, 200)
    const dmaPrev = dmaMean(c.series, c.series.length - 22, 200)
    if (!Number.isFinite(dma) || dma <= 0) continue
    const ratio = close / dma
    const slope = Number.isFinite(dmaPrev) && dmaPrev > 0 ? dma / dmaPrev - 1 : 0
    const pass = ratio > 1 && slope > 0 && indexOk
    const freshCross = pass && ratio < 1.02

    // G2 selection — cross-sectional percentile rank (share ของหุ้นที่ ret120 ต่ำกว่า)
    let less = 0
    for (let k = 0; k < cands.length; k++) {
      if (k === ci || !valid[k]) continue
      if (ret120[k] < ret120[ci]) less++
    }
    const rsPct = nValid > 1 ? (less / (nValid - 1)) * 100 : 0

    // G3 level — pivot = จุดต่ำสุด 20 วัน (ประมาณจาก close ล้วน)
    let minClose20 = Infinity
    for (let k = Math.max(0, c.series.length - 20); k < c.series.length; k++) {
      minClose20 = Math.min(minClose20, c.series[k])
    }
    const zoneLo = r2(minClose20 * 0.99)
    const zoneHi = r2(minClose20 * 1.01)
    const zoneMid = (zoneLo + zoneHi) / 2
    const distPct = Math.abs(close - zoneMid) / zoneMid * 100
    const levelType = close <= minClose20 * 1.02 ? 'pullback' : 'breakout'

    // G4 trigger — proxy จาก 2 แท่งล่าสุด (ไม่มี OHLC: daily range proxy = |ret1|·close)
    const wickRatio = ret1 <= -0.02 && close > c.prev * 0.995 ? 2.5 : 1.2
    const closePos = clamp(0.5 + ret1 * 4, 0, 1)
    let pattern: StatePacket['trigger']['pattern'] = null
    if (wickRatio >= 2 && closePos >= 0.67) pattern = 'T1'
    else if (ret1 > 0.03 && ret2 < 0) pattern = 'T2'
    const inZone = close >= zoneLo * 0.98 && close <= zoneHi * 1.05

    // G5 risk — entry/stop/RR ถึง supply แบบประมาณ
    // stop = ใต้โซน (zoneLo) แต่ "ไม่กว้างเกิน" 6% จาก close (เอาตัวที่แคบกว่า)
    // เดิม Math.min บังคับ stop ≥6.2% เสมอ → RR ถึง supply(+10%) ≤ 1.62 < 2 → tradeable=false ทุกตัว (G5 ไม่มีวันผ่าน)
    const entry = r2(close * 1.002)
    const stop = r2(Math.max(zoneLo, close * 0.94))
    const stopDistPct = ((entry - stop) / entry) * 100
    const supply = entry * 1.1
    const rrv = entry - stop > 0 ? (supply - entry) / (entry - stop) : 0
    const sizeR = freshCross ? 0.5 : 1.0
    const tradeable = stopDistPct <= 8 && rrv >= 2

    const packet: StatePacket = {
      asset: c.symbol,
      tf: '1D',
      date,
      regime: {
        pass,
        fresh_cross: freshCross,
        close_vs_200dma: r4(ratio),
        slope_20d: r4(slope),
        index_ok: indexOk,
      },
      selection: {
        rs_pct: r2(rsPct),
        eps_yoy: 0.3, // default — ยังไม่มี ingest งบการเงิน
        catalyst_days: 60, // default — ยังไม่มีปฏิทินข่าว
      },
      level: {
        type: levelType,
        zone: [zoneLo, zoneHi],
        status: 'active',
        dist_pct: r2(distPct),
      },
      trigger: {
        candle_closed: true,
        pattern,
        in_zone: inZone,
        wick_ratio: r2(wickRatio),
        close_pos_in_range: r4(closePos),
      },
      risk: {
        entry,
        stop,
        stop_dist_pct: r2(stopDistPct),
        rr_to_next_supply: r2(rrv),
        size_R: sizeR,
        tradeable,
      },
      // context จริง = 0 (paper) — แล็บเงายังไม่ผูกพอร์ต
      context: { day_pnl_R: 0, week_pnl_R: 0, loss_streak: 0 },
    }

    built.push({ asset: c.symbol, packet, entryPx: entry, stopPx: stop })
  }

  // เรียงตาม rs_pct ดีสุดก่อน (แล้วค่อยตัดตาม limit ที่เรียกใช้)
  built.sort((a, b) => b.packet.selection.rs_pct - a.packet.selection.rs_pct)

  return { date, states: limit != null ? built.slice(0, limit) : built }
}
