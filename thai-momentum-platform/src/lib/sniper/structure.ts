// structure.ts — ICT Location layer บนแท่งรายวัน
// - Key Levels: PDH/PDL · High/Low 20 วัน · 52 สัปดาห์ · เลขสวย (round numbers)
// - Liquidity Sweep: ราคาแทงทะลุ swing low/high เก่าแล้ว "ปิดกลับ" (sweep & reclaim)
//   = ร่องรอยการกวาด stop แบบคลาสสิก (ตามเอกสาร: Sweep → Structure → เข้าเมื่อยืนยันได้)
// - FVG (Fair Value Gap): ช่องว่าง 3 แท่ง — bullish ถ้า low[3] > high[1]; โซนยังไม่ถูกกลับเข้า = POI
// ทั้งหมด closed-form บน OHLC — ไม่เดา ไม่ใช้ข้อมูลอนาคต

import type { FvgEvent, KeyLevel, OhlcBar, SweepEvent } from "./types"

/** 5-แท่ง fractal swing: ต่ำสุดของหน้าต่าง i-2..i+2 */
function swingLows(bars: OhlcBar[]): { i: number; price: number }[] {
  const out: { i: number; price: number }[] = []
  for (let i = 2; i < bars.length - 2; i++) {
    const p = bars[i].low
    if (p <= bars[i - 1].low && p <= bars[i - 2].low && p < bars[i + 1].low && p < bars[i + 2].low) {
      out.push({ i, price: p })
    }
  }
  return out
}

function swingHighs(bars: OhlcBar[]): { i: number; price: number }[] {
  const out: { i: number; price: number }[] = []
  for (let i = 2; i < bars.length - 2; i++) {
    const p = bars[i].high
    if (p >= bars[i - 1].high && p >= bars[i - 2].high && p > bars[i + 1].high && p > bars[i + 2].high) {
      out.push({ i, price: p })
    }
  }
  return out
}

function valZ(vals: number[], i: number): number {
  const win = vals.slice(Math.max(0, i - 20), i) // 20 แท่ง "ก่อน" วันนั้น
  if (win.length < 10) return 0
  const m = win.reduce((s, v) => s + v, 0) / win.length
  const sd = Math.sqrt(win.reduce((s, v) => s + (v - m) * (v - m), 0) / win.length)
  if (sd < 1e-6) return vals[i] > m ? 5 : 0 // หน้าต่างคงที่ (sd≈0) — กระโดดขึ้น = ตื่นตัว แต่ cap ที่ 5
  return Math.max(-9, Math.min(9, (vals[i] - m) / sd))
}

/** สแกน sweep ทั้งสองฝั่ง — คืนเฉพาะ event ที่ barsAgo ≤ maxBarsAgo (ใหม่ ๆ ที่ยังมีความหมาย) */
export function detectSweeps(bars: OhlcBar[], maxBarsAgo = 15): SweepEvent[] {
  if (!hasOhlc(bars) || bars.length < 12) return []
  const lows = swingLows(bars)
  const highs = swingHighs(bars)
  const vals = bars.map((b) => b.val)
  const out: SweepEvent[] = []
  const T = bars.length

  for (let i = 2; i < T; i++) {
    const barsAgo = T - 1 - i
    if (barsAgo > maxBarsAgo) continue
    const bar = bars[i]
    // bullish sweep: แทงหลุด swing low ที่เกิดก่อนหน้า (ย้อนหลังสุด 60 แท่ง) แล้วปิดกลับมาเหนือระดับ
    const candidates = lows.filter((s) => s.i < i - 1 && s.i >= i - 60)
    if (candidates.length > 0) {
      // เอา swing ล่าสุดก่อนแท่ง i ที่ถูกทะลุ
      const hit = [...candidates].reverse().find((s) => bar.low < s.price && bar.close > s.price)
      if (hit) {
        out.push({
          date: bar.date,
          side: "bullish",
          pierced: hit.price,
          close: bar.close,
          depthPct: ((hit.price - bar.low) / hit.price) * 100,
          valZ: valZ(vals, i),
          barsAgo,
        })
      }
    }
    // bearish sweep: แทงขึ้นเหนือ swing high แล้วปิดกลับลงมาใต้ระดับ
    const candsH = highs.filter((s) => s.i < i - 1 && s.i >= i - 60)
    if (candsH.length > 0) {
      const hit = [...candsH].reverse().find((s) => bar.high > s.price && bar.close < s.price)
      if (hit) {
        out.push({
          date: bar.date,
          side: "bearish",
          pierced: hit.price,
          close: bar.close,
          depthPct: ((bar.high - hit.price) / hit.price) * 100,
          valZ: valZ(vals, i),
          barsAgo,
        })
      }
    }
  }

  // กันซ้ำ (แท่งติดกันชนเดียวกัน) — เก็บ event ล่าสุดต่อ (side, pierced ปัด 2 ตำแหน่ง)
  const seen = new Set<string>()
  const dedup: SweepEvent[] = []
  for (const e of out.sort((a, b) => a.barsAgo - b.barsAgo)) {
    const key = `${e.side}:${e.pierced.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(e)
  }
  return dedup.sort((a, b) => a.barsAgo - b.barsAgo)
}

/** FVG 3 แท่งที่ยังไม่ถูก mitigate (โซน POI) — สแกนย้อนหลัง maxBarsAgo แท่ง */
export function detectFvgs(bars: OhlcBar[], maxBarsAgo = 15): FvgEvent[] {
  if (!hasOhlc(bars) || bars.length < 5) return []
  const out: FvgEvent[] = []
  const T = bars.length
  for (let i = 2; i < T; i++) {
    const barsAgo = T - 1 - i
    if (barsAgo > maxBarsAgo) continue
    const b1 = bars[i - 2]
    const b3 = bars[i]
    // bullish FVG: ช่องว่างระหว่าง high ของแท่งแรก กับ low ของแท่งสุดท้าย
    if (b3.low > b1.high) {
      const bottom = b1.high
      const top = b3.low
      const sizePct = ((top - bottom) / bottom) * 100
      if (sizePct < 0.25) continue // เล็กเกิน = noise
      // mitigate = แท่งหลังจากนี้ลงมาแตะโซน (low ≤ top)
      let mitigated = false
      for (let k = i + 1; k < T; k++) {
        if (bars[k].low <= top) {
          mitigated = true
          break
        }
      }
      out.push({ kind: "bullish", from: b1.date, to: b3.date, bottom, top, sizePct, mitigated, barsAgo })
    }
    // bearish FVG
    if (b3.high < b1.low) {
      const top = b1.low
      const bottom = b3.high
      const sizePct = ((top - bottom) / bottom) * 100
      if (sizePct < 0.25) continue
      let mitigated = false
      for (let k = i + 1; k < T; k++) {
        if (bars[k].high >= bottom) {
          mitigated = true
          break
        }
      }
      out.push({ kind: "bearish", from: b1.date, to: b3.date, bottom, top, sizePct, mitigated, barsAgo })
    }
  }
  return out
}

const roundStep = (px: number): number => (px < 5 ? 0.1 : px < 20 ? 0.5 : px < 100 ? 1 : 5)

/** Key Levels — ระดับสำคัญที่อยู่ใกล้ราคา (±8%) เรียงตามระยะ */
export function keyLevels(bars: OhlcBar[]): KeyLevel[] {
  if (bars.length < 2) return []
  const last = bars[bars.length - 1]
  const c = last.close
  const prev = bars[bars.length - 2]
  const win20 = bars.slice(-21, -1) // 20 แท่งก่อนแท่งล่าสุด
  const win250 = bars.slice(-251, -1)
  const raw: KeyLevel[] = []
  const push = (kind: KeyLevel["kind"], price: number, note: string) => {
    if (!Number.isFinite(price) || price <= 0) return
    raw.push({ kind, price, gapPct: (c / price - 1) * 100, note })
  }
  push("PDH", prev.high, "High เมื่อวาน")
  push("PDL", prev.low, "Low เมื่อวาน")
  if (win20.length >= 10) {
    push("H20", Math.max(...win20.map((b) => b.high)), "High 20 วัน")
    push("L20", Math.min(...win20.map((b) => b.low)), "Low 20 วัน")
  }
  if (win250.length >= 60) {
    push("H52W", Math.max(...win250.map((b) => b.high)), "High ~52 สัปดาห์")
    push("L52W", Math.min(...win250.map((b) => b.low)), "Low ~52 สัปดาห์")
  }
  // เลขสวยใกล้สุด 2 ระดับ (บน/ล่าง)
  const step = roundStep(c)
  const lo = Math.floor(c / step) * step
  push("ROUND", lo, `เลขสวย (ทีละ ${step})`)
  push("ROUND", lo + step, `เลขสวย (ทีละ ${step})`)
  // จำกัดเฉพาะระดับใกล้ ±8% แล้วเรียงตาม |gap|
  return raw
    .filter((l) => Math.abs(l.gapPct) <= 8)
    .sort((a, b) => Math.abs(a.gapPct) - Math.abs(b.gapPct))
    .slice(0, 6)
}

export function hasOhlc(bars: OhlcBar[]): boolean {
  const b = bars[bars.length - 1]
  return !!b && b.open > 0 && b.high > 0 && b.low > 0
}
