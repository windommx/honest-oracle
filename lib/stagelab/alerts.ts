// ─── Risk Radar — proactive alert engine ────────────────────────────────────
// Scans the market review, open positions and watchlist against the
// deterministic market sim (weekly OHLCV) and the Stage Analysis rule book:
//   · Market Score thresholds (ชั้นตลาด)
//   · Stop-loss proximity / breach
//   · Stage transitions (2→3, 3→4)
//   · Chandelier Exit (HH22 − 3×ATR22) breach
//   · Time-based exit (8 สัปดาห์ไม่ทำ High ใหม่ → TIME STOP)
//   · Climax Top detection (volume blow-off + extended price)
//   · Watchlist: breakout approach / confirmed / invalidated
import type {
  AlertItem,
  AlertsResponse,
  AlertSeverity,
} from './types'
import { genSeries } from './market-sim'
import { calcMarketScore, fmt, fmtPct } from './utils'

// ─── Structural inputs (date-agnostic so Prisma rows fit directly) ──────────
export interface AlertReview {
  setIndex: number
  breadthPct: number
  setAboveMa: boolean
  maRising: boolean
  breadthOk: boolean
  adConfirm: boolean
  foreignBuy: boolean
}

export interface AlertPosition {
  id: number
  symbol: string
  quantity: number
  entryPrice: number
  currentPrice: number
  entryStage: number
  currentStage: number
  stopLoss: number
  status: string
  confidence: string
}

export interface AlertWatchlist {
  id: number
  symbol: string
  stage: number
  entryPrice: number
  stopLoss: number
  rsScore: number
  status: string
  priority: string
}

// ─── Series metrics helper ───────────────────────────────────────────────────
interface SeriesMetrics {
  close: number
  ma30: number
  stage: number
  extendedPct: number // % above 30W MA
  atr22: number
  hh22: number
  /**
   * Highest high of the 22 bars BEFORE the current one. `hh22` includes the
   * current bar, which is right for a Chandelier stop and impossible for a
   * breakout test: a bar's high is never below its own close, so
   * `close > hh22` could not fire for any symbol, ever.
   */
  hh22Prior: number
  chandelier: number
  weeksSinceNewHigh10: number // bars since close made a fresh 10-week-high close
  volRatio: number
  candleUp: boolean
  climaxTop: boolean
}

const seriesCache = new Map<string, SeriesMetrics>()

function seriesMetrics(symbol: string): SeriesMetrics {
  const cached = seriesCache.get(symbol)
  if (cached) return cached

  const bars = genSeries(symbol).bars
  const n = bars.length
  const last = bars[n - 1]

  // ATR(22) + Highest High(22) over the last 22 bars (incl. current)
  let trSum = 0
  let hh = 0
  let hhPrior = 0
  for (let i = n - 22; i < n; i++) {
    const b = bars[i]
    const prevC = bars[i - 1].c
    trSum += Math.max(b.h - b.l, Math.abs(b.h - prevC), Math.abs(b.l - prevC))
    hh = Math.max(hh, b.h)
    if (i < n - 1) hhPrior = Math.max(hhPrior, b.h)
  }
  const atr22 = trSum / 22
  const chandelier = hh - 3 * atr22

  // weeks since close made a fresh 10-week closing high
  let weeksSince = 0
  for (let i = n - 1; i >= 10; i--) {
    let priorMax = 0
    for (let j = i - 10; j < i; j++) priorMax = Math.max(priorMax, bars[j].c)
    if (bars[i].c > priorMax) break
    weeksSince++
  }

  // volume ratio vs 10-week average volume
  let vSum = 0
  for (let i = n - 11; i < n - 1; i++) vSum += bars[i].v
  const volRatio = last.v / Math.max(1, vSum / 10)

  const extendedPct = ((last.c - last.ma30) / last.ma30) * 100
  const climaxTop = volRatio > 2.5 && last.c > last.o && extendedPct > 25

  const m: SeriesMetrics = {
    close: last.c,
    ma30: last.ma30,
    stage: last.stage,
    extendedPct,
    atr22,
    hh22: hh,
    hh22Prior: hhPrior,
    chandelier,
    weeksSinceNewHigh10: weeksSince,
    volRatio,
    candleUp: last.c >= last.o,
    climaxTop,
  }
  seriesCache.set(symbol, m)
  return m
}

// ─── Main builder ────────────────────────────────────────────────────────────
export function buildAlerts(input: {
  review: AlertReview | null
  positions: AlertPosition[]
  watchlist: AlertWatchlist[]
}): AlertsResponse {
  const alerts: AlertItem[] = []
  const { review, positions, watchlist } = input

  // ── 1. Market-level alerts ─────────────────────────────────────────────────
  if (review) {
    const ms = calcMarketScore(review)
    if (ms.score <= 3) {
      alerts.push({
        id: 'market-score-low',
        severity: 'critical',
        category: 'market',
        title: `Market Score ต่ำมาก (${ms.score}/10)`,
        detail: `${ms.stageLabel} — ${ms.recommendation}`,
        metric: `ถือหุ้นได้เพียง ${ms.equityPct} ของพอร์ต`,
      })
    } else if (ms.score <= 5) {
      alerts.push({
        id: 'market-score-mid',
        severity: 'warning',
        category: 'market',
        title: `Market Score อ่อนแรง (${ms.score}/10)`,
        detail: `${ms.stageLabel} — ลดขนาดไม้ใหม่ และตรวจ Stop ทุกไม้เป็นพิเศษ`,
        metric: `สัดส่วนหุ้นแนะนำ ${ms.equityPct}`,
      })
    } else if (ms.score >= 8) {
      alerts.push({
        id: 'market-score-high',
        severity: 'opportunity',
        category: 'market',
        title: `Market Score แข็งแกร่ง (${ms.score}/10)`,
        detail: `${ms.stageLabel} — ตลาดเอื้อต่อการถือไม้ใหญ่ หยิบ Setup A/A+ จาก Watchlist`,
        metric: `สัดส่วนหุ้นได้ถึง ${ms.equityPct}`,
      })
    }

    if (!review.setAboveMa) {
      alerts.push({
        id: 'set-below-ma',
        severity: 'warning',
        category: 'market',
        title: 'SET Index อยู่ใต้เส้น 30W MA',
        detail: 'ดัชนีหลักยังไม่ยืนยัน Stage 2 — เน้นความคุ้มครองก่อนการรุก (Defense First)',
      })
    }
    if (review.breadthPct < 40) {
      alerts.push({
        id: 'breadth-weak',
        severity: 'warning',
        category: 'market',
        title: `Breadth อ่อน (${fmt(review.breadthPct, 0)}%)`,
        // The old copy cited "150DMA" and a "> 60%" pass mark. Nothing in the
        // app computes a 150-day moving average, and 60% matched none of the
        // thresholds actually used — the weekly checklist asks for >50%, this
        // alert fires under 40%, the unified score buckets at 70/50/30.
        // breadthPct is a number the customer types in on the weekly review.
        detail: 'ค่า Breadth ที่คุณบันทึกไว้ต่ำกว่า 40% — การพลิกตัวของหุ้นรายตัวมักไร้แรงหนุนตลาด',
        metric: 'เกณฑ์เตือนของระบบ: ต่ำกว่า 40% (ค่าที่คุณกรอกเองในบทวิเคราะห์รายสัปดาห์)',
      })
    }
  }

  // ── 2. Position-level alerts (OPEN only) ───────────────────────────────────
  for (const p of positions) {
    if (p.status !== 'OPEN') continue
    const m = seriesMetrics(p.symbol)
    const pnl = ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
    const tag = `${p.symbol} (${fmt(p.currentPrice)} ฿)`

    // 2a. Stop breached / close
    if (p.stopLoss > 0) {
      const distPct = ((p.currentPrice - p.stopLoss) / p.currentPrice) * 100
      if (p.currentPrice < p.stopLoss) {
        alerts.push({
          id: `pos-stop-breach-${p.id}`,
          severity: 'critical',
          category: 'position',
          symbol: p.symbol,
          title: `หลุด Stop — ${tag}`,
          detail: `ราคาปัจจุบันต่ำกว่า Stop ที่ ${fmt(p.stopLoss)} ฿ — กฎเหล็กของระบบคือขายทันที ไม่มีข้อยกเว้น`,
          metric: `P/L ${fmtPct(pnl)} · ห่าง Stop ${fmtPct(distPct)}`,
        })
      } else if (distPct < 5) {
        alerts.push({
          id: `pos-stop-near-${p.id}`,
          severity: 'warning',
          category: 'position',
          symbol: p.symbol,
          title: `ใกล้ Stop — ${tag}`,
          detail: `ราคาเหลือห่างจาก Stop ${fmt(p.stopLoss)} ฿ ไม่ถึง 5% — เตรียมปฏิบัติตามแผนห้ามเลื่อน Stop ลง`,
          metric: `ห่าง ${fmtPct(distPct)}`,
        })
      }
    }

    // 2b. Stage transitions
    if (m.stage >= 4 && p.currentStage < 4) {
      alerts.push({
        id: `pos-stage4-${p.id}`,
        severity: 'critical',
        category: 'position',
        symbol: p.symbol,
        title: `เข้า Stage 4 — ${tag}`,
        detail: 'ราคาหลุด 30W MA และ MA หันลง — ออกทั้งไม้ตาม Risk Matrix',
        metric: `Sim Stage ${m.stage} (ข้อมูลในระบบ: S${p.currentStage})`,
      })
    } else if (m.stage === 3 && p.currentStage < 3) {
      alerts.push({
        id: `pos-stage3-${p.id}`,
        severity: 'warning',
        category: 'position',
        symbol: p.symbol,
        title: `เริ่ม Stage 3 (Topping) — ${tag}`,
        detail: 'โมเมนตัมอ่อนตัว ขายทยอย 25–75% ตามคุณภาพ Fundamental',
        metric: `Sim Stage ${m.stage}`,
      })
    }

    // 2c. Chandelier Exit breach
    if (p.currentPrice < m.chandelier && m.stage <= 3) {
      alerts.push({
        id: `pos-chandelier-${p.id}`,
        severity: 'critical',
        category: 'position',
        symbol: p.symbol,
        title: `หลุด Chandelier Exit — ${tag}`,
        detail: `ราคาต่ำกว่าเส้น Chandelier (HH22 − 3×ATR22) — แรงขายเกินภูมิคุ้มกันปกติ`,
        metric: `Chandelier ${fmt(m.chandelier)} ฿ · ATR22 ${fmt(m.atr22)}`,
      })
    }

    // 2d. Time stop — 8 weeks without a new 10-week-high close while in Stage 2
    if (m.weeksSinceNewHigh10 >= 8 && m.stage === 2) {
      alerts.push({
        id: `pos-timestop-${p.id}`,
        severity: 'warning',
        category: 'position',
        symbol: p.symbol,
        title: `Time Stop ทำงาน — ${tag}`,
        detail: `${m.weeksSinceNewHigh10} สัปดาห์แล้วที่ยังไม่ทำ Closing High ใหม่ — ขายออกเมื่อเงินหมุนไปหาผู้นำตัวอื่นได้ดีกว่า`,
        metric: `${m.weeksSinceNewHigh10} สัปดาห์ (เกณฑ์: 8)`,
      })
    }

    // 2e. Climax Top blow-off
    if (m.climaxTop && pnl > 15) {
      alerts.push({
        id: `pos-climax-${p.id}`,
        severity: 'warning',
        category: 'position',
        symbol: p.symbol,
        title: `สัญญาณ Climax Top — ${tag}`,
        detail: 'วอลุ่มระเบิด > 2.5× พร้อมราคายืดเกิน 25% เหนือ MA — ขาย 50–75% ล็อกกำไร',
        metric: `Vol×${fmt(m.volRatio, 1)} · ยืดเกิน MA ${fmtPct(m.extendedPct)}`,
      })
    }

    // 2f. Profit protection — trail after +20%
    if (pnl >= 20) {
      alerts.push({
        id: `pos-trail-${p.id}`,
        severity: 'info',
        category: 'position',
        symbol: p.symbol,
        title: `กำไรเกิน +20% — ${tag}`,
        detail: 'ยก Stop ขึ้นที่ราคาทุน (ยอมให้หลุดทุนครึ่งเดียว) แล้วปล่อยให้ Chandelier ลากจนจบเทรนด์',
        metric: `P/L ${fmtPct(pnl)}`,
      })
    }
  }

  // ── 3. Watchlist-level alerts (WATCHING only) ──────────────────────────────
  for (const w of watchlist) {
    if (w.status !== 'WATCHING') continue
    const m = seriesMetrics(w.symbol)
    const distEntry = ((w.entryPrice - m.close) / m.close) * 100

    // 3a. Breakout confirmed
    if (m.close > m.hh22Prior && m.volRatio > 1.5 && m.stage === 2) {
      alerts.push({
        id: `wl-breakout-${w.id}`,
        severity: 'opportunity',
        category: 'watchlist',
        symbol: w.symbol,
        title: `Breakout ยืนยัน — ${w.symbol}`,
        detail: 'ปิดเหนือ High 22 สัปดาห์ด้วยวอลุ่ม > 1.5× และยัง Stage 2 — เงื่อนไขเข้าตามแผนครบ',
        metric: `Vol×${fmt(m.volRatio, 1)} · RS ${fmt(w.rsScore)}/10`,
      })
    } else if (distEntry <= 2 && distEntry >= -1) {
      // 3b. Approaching entry zone
      alerts.push({
        id: `wl-near-entry-${w.id}`,
        severity: 'opportunity',
        category: 'watchlist',
        symbol: w.symbol,
        title: `ใกล้จุดเข้า — ${w.symbol}`,
        detail: `ราคาอยู่ห่าง Entry ${fmt(w.entryPrice)} ฿ เพียง ${fmt(Math.abs(distEntry), 1)}% — เฝ้ารอแท่งยืนยันพร้อมวอลุ่ม`,
        metric: `Entry ${fmt(w.entryPrice)} ฿`,
      })
    }

    // 3c. Thesis invalidated
    if (m.close < w.stopLoss) {
      alerts.push({
        id: `wl-invalid-${w.id}`,
        severity: 'warning',
        category: 'watchlist',
        symbol: w.symbol,
        title: `Setup พัง — ${w.symbol}`,
        detail: `ราคาหลุดโซน Stop ${fmt(w.stopLoss)} ฿ โดยยังไม่ทันเข้า — ตัดออกจาก Watchlist เพื่อคงความสะอาดของระบบ`,
        metric: `Sim close ${fmt(m.close)} ฿`,
      })
    }

    // 3d. Stage drift from plan
    if (m.stage !== w.stage && m.stage >= 3 && w.stage <= 2) {
      alerts.push({
        id: `wl-stagedrift-${w.id}`,
        severity: 'warning',
        category: 'watchlist',
        symbol: w.symbol,
        title: `Stage เปลี่ยน — ${w.symbol}`,
        detail: `จากแผน S${w.stage} → ปัจจุบัน S${m.stage} — ระงับการเข้าไม้จนกว่าจะประเมินใหม่`,
        metric: `Sim Stage ${m.stage}`,
      })
    }
  }

  // ── Sort: severity first, then category ────────────────────────────────────
  const sevRank: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    opportunity: 2,
    info: 3,
  }
  alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity])

  const summary: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 0,
    opportunity: 0,
    info: 0,
  }
  for (const a of alerts) summary[a.severity]++

  return { alerts, summary, generatedAt: new Date().toISOString() }
}
