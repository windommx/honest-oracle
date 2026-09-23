// Walk-forward harness — เลือก config บน in-sample แล้ววัดผลเฉพาะ out-of-sample
// คำถามที่ตอบ: "พารามิเตอร์ที่ชนะในอดีตเป็นของจริงหรือแค่ fit อดีต" (ดู OOS degradation)
//
// Indexing แบบ absolute month:
//   backtest บน slice [sliceFrom, sliceTo] จะให้ return-month แรก = เดือน absolute (sliceFrom + warm + 1)
//   ดังนั้นตั้ง sliceFrom = a - warm - 1 เพื่อให้ return-month 0 = a (IS เริ่มเดือน a พอดี)
//   warm คงที่ทั้ง grid = max(12, 12 + skip) + 1 (เพราะ SMA grid สูงสุด 12)

import { backtestReturns, slicePanel, warmupMonths } from "./backtest"
import { median, std } from "./math"
import type { GtaaConfig, GtaaPanel, WalkForwardResult, WalkForwardWindow } from "./types"

const GRID_TOPN = [3, 6, 9] as const
const GRID_SMA = [8, 10, 12] as const

/** Sharpe แบบ annualized จากผลตอบแทนรายเดือนก้อนเดียว */
function sharpeOf(returns: number[]): number {
  if (returns.length < 3) return 0
  let eq = 1
  for (const r of returns) eq *= 1 + r
  const years = returns.length / 12
  const cagr = eq > 0 ? Math.pow(eq, 1 / years) - 1 : -1
  const vol = std(returns) * Math.sqrt(12)
  return vol > 1e-9 ? cagr / vol : 0
}

export function runWalkForward(
  panel: GtaaPanel,
  base: GtaaConfig,
  opts: { isMonths?: number; oosMonths?: number; stepMonths?: number } = {},
): WalkForwardResult {
  const isMonths = opts.isMonths ?? 60
  const oosMonths = opts.oosMonths ?? 12
  const stepMonths = opts.stepMonths ?? 12
  const T = panel.dates.length
  // warm ของ config ที่ "ใช้ข้อมูลมากสุด" ใน grid (SMA 12 + skip ของ base) — grid ทั้งชุด warmup เท่ากัน
  const warm = Math.max(warmupMonths({ ...base, smaMonths: 12, skipMonths: base.skipMonths }), 13)

  const windows: WalkForwardWindow[] = []
  // หน้าต่าง: IS returns = เดือน absolute [a, a+isMonths-1], OOS = [a+isMonths, a+isMonths+oos-1]
  let a = warm + 1
  while (a + isMonths + oosMonths - 1 <= T - 1) {
    const sliceFrom = a - warm - 1
    const sliceTo = a + isMonths + oosMonths - 1
    const sub = slicePanel(panel, sliceFrom, sliceTo)

    let best: { topN: number; sma: number; isSharpe: number; oosSharpe: number } | null = null
    for (const topN of GRID_TOPN) {
      for (const sma of GRID_SMA) {
        const cfg: GtaaConfig = { ...base, topN, smaMonths: sma }
        // warmup ของทุก cfg ใน grid = warm (SMA ≤ 12, skip เดียวกับ base) → strat[0] = เดือน a พอดี
        const { strat } = backtestReturns(sub, cfg)
        if (strat.length < isMonths + oosMonths) continue
        const isRet = strat.slice(0, isMonths)
        const oosRet = strat.slice(isMonths, isMonths + oosMonths)
        const isSharpe = sharpeOf(isRet)
        const oosSharpe = sharpeOf(oosRet)
        if (!best || isSharpe > best.isSharpe) best = { topN, sma, isSharpe, oosSharpe }
      }
    }
    if (best) {
      windows.push({
        isStart: panel.dates[a],
        isEnd: panel.dates[a + isMonths - 1],
        oosStart: panel.dates[a + isMonths],
        oosEnd: panel.dates[a + isMonths + oosMonths - 1],
        chosenTopN: best.topN,
        chosenSma: best.sma,
        isSharpe: best.isSharpe,
        oosSharpe: best.oosSharpe,
      })
    }
    a += stepMonths
  }

  const isList = windows.map((w) => w.isSharpe)
  const oosList = windows.map((w) => w.oosSharpe)
  const isMed = median(isList)
  const oosMed = median(oosList)
  let degradationPct = 0
  if (isMed > 0.05) degradationPct = Math.max(0, Math.min(1, 1 - oosMed / isMed))

  const counts = new Map<string, number>()
  for (const w of windows) {
    const key = `Top ${w.chosenTopN} · SMA ${w.chosenSma}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let mostChosen = "—"
  let mostCount = 0
  for (const [key, c] of counts) {
    if (c > mostCount) {
      mostCount = c
      mostChosen = key
    }
  }
  const stabilityPct = windows.length > 0 ? mostCount / windows.length : 0

  let verdict: string
  if (windows.length === 0) {
    verdict = "ข้อมูลสั้นเกินไปสำหรับ walk-forward (ต้อง ≥ ประมาณ 7 ปี)"
  } else if (degradationPct > 0.5) {
    verdict = `OOS degradation ${Math.round(degradationPct * 100)}% สูงกว่า 50% → หยุดจูนพารามิเตอร์ ใช้ค่าจากเปเปอร์ (Top 6, SMA 10) ไปเลย — นี่คือผลลัพธ์ที่มีค่าที่สุดไม่ว่าจะออกทางไหน`
  } else if (degradationPct > 0.25) {
    verdict = `OOS degradation ${Math.round(degradationPct * 100)}% อยู่ในระดับกลาง — config ที่ชนะ in-sample ยังทำได้ครึ่งหนึ่งขึ้นไป out-of-sample ระวังการ overfit เวลาปรับจูนเพิ่ม`
  } else {
    verdict = `OOS degradation ${Math.round(degradationPct * 100)}% ต่ำ — ผล in-sample ค่อนข้าง robust ต่อการเลื่อนหน้าต่างเวลา`
  }

  return { windows, isYears: isMonths / 12, oosYears: oosMonths / 12, degradationPct, stabilityPct, verdict, mostChosen }
}
