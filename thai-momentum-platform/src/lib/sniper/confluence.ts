// confluence.ts — ชั้นตัดสินใจ 3 ชั้นตามเอกสาร (Location × Value × Behavior)
// น้ำหนักลงทะเบียนล่วงหน้า: Location 0.40 · Value 0.30 · Behavior 0.30
// verdict: high ≥ 65 · medium ≥ 45 · low อื่น ๆ — "ครบทั้ง 3 ชั้น = setup ความน่าจะเป็นสูง"
// ทุกคะแนนต้องแนบเหตุผลภาษาไทย — ห้ามเป็นกล่องดำ (หลักเดียวกับ Jev reasons ของระบบ)

import { keyLevels, detectFvgs, detectSweeps, hasOhlc } from "./structure"
import { buildValueProfile } from "./value"
import { flowProxy } from "./flow"
import type { ConfluenceRow, LayerScore, SniperSeries } from "./types"

const W_LOCATION = 0.4
const W_VALUE = 0.3
const W_BEHAVIOR = 0.3

function cap(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)))
}

export function evaluateSymbol(s: SniperSeries): ConfluenceRow {
  const bars = s.bars
  const T = bars.length
  const last = bars[T - 1]
  const closes = bars.map((b) => b.close)
  const ret20 =
    T >= 21 && closes[T - 21] > 0 ? (last.close / closes[T - 21] - 1) * 100 : null

  const flow = flowProxy(bars)

  // ---- Behavior (ทำงานได้แม้ไม่มี OHLC — ใช้ close เทียบวอลุ่ม) ----
  const bReasons: string[] = []
  let bScore = Math.min(100, Math.max(0, (flow.absorptionScore * 0.6 + (Math.min(2, Math.max(0, flow.valZ)) / 2) * 40)))
  if (flow.absorptionSide === "buy") bReasons.push(`Absorption ฝั่งซื้อ (แรง ${flow.valZ.toFixed(1)}σ แต่แท่งสั้น ${Math.round(flow.bodyPct * 100)}% ปิดใกล้ high)`)
  else if (flow.absorptionSide === "sell") bReasons.push(`Absorption ฝั่งขาย (แรง ${flow.valZ.toFixed(1)}σ แต่แท่งสั้น ${Math.round(flow.bodyPct * 100)}% ปิดใกล้ low)`)
  else bReasons.push(`ยังไม่เห็น absorption ชัด (วอลุ่ม ${flow.valZ >= 0 ? "+" : ""}${flow.valZ.toFixed(1)}σ)`)
  if (flow.valZ >= 1.5) bReasons.push("วอลุ่มตื่นตัวผิดปกติ — effort สูง")
  const behavior: LayerScore = { score: cap(bScore), reasons: bReasons }

  // ---- ไม่มี OHLC → Location/Value เป็น null แบบ honest ----
  if (!hasOhlc(bars)) {
    return {
      symbol: s.symbol,
      sector: s.sector,
      close: last.close,
      ret20,
      location: null,
      value: null,
      behavior,
      total: Math.round(behavior.score * W_BEHAVIOR), // ที่เหลือถือว่า 0
      verdict: "low",
      sweep: null,
      fvgs: [],
      levels: [],
      profile: null,
      flow,
    }
  }

  // ---- Location ----
  const levels = keyLevels(bars)
  const sweeps = detectSweeps(bars)
  const sweep = sweeps.find((e) => e.barsAgo <= 8) ?? null
  const fvgs = detectFvgs(bars).filter((f) => !f.mitigated)
  const lReasons: string[] = []
  let loc = 0
  if (sweep) {
    loc += 30
    lReasons.push(
      `${sweep.side === "bullish" ? "Bullish" : "Bearish"} sweep ${sweep.barsAgo === 0 ? "แท่งล่าสุด" : `${sweep.barsAgo} แท่งก่อน`} — แทงทะลุ ${sweep.pierced.toFixed(2)} แล้วปิดกลับ (วอลุ่ม ${sweep.valZ.toFixed(1)}σ)`,
    )
  }
  const nearLevel = levels.find((l) => Math.abs(l.gapPct) <= 2)
  if (nearLevel) {
    loc += 25
    lReasons.push(`ราคาชิด ${nearLevel.kind} ${nearLevel.price.toFixed(2)} (${nearLevel.gapPct >= 0 ? "+" : ""}${nearLevel.gapPct.toFixed(1)}%) — ${nearLevel.note}`)
  }
  const nearFvg = fvgs.find((f) => last.close >= f.bottom * 0.97 && last.close <= f.top * 1.03)
  if (nearFvg) {
    loc += 25
    lReasons.push(`FVG ${nearFvg.kind === "bullish" ? "ขาขึ้น" : "ขาลง"} ${nearFvg.bottom.toFixed(2)}–${nearFvg.top.toFixed(2)} ยังไม่ถูกกลับเข้า (POI)`)
  }
  if (levels.some((l) => l.kind === "ROUND" && Math.abs(l.gapPct) <= 1)) {
    loc += 10
    lReasons.push("ติดแนวเลขสวย — จุดที่รายใหญ่ชอบวางคำสั่ง")
  }
  if (ret20 !== null) lReasons.push(`เทรนด์ 20 วัน ${ret20 >= 0 ? "+" : ""}${ret20.toFixed(1)}%`)
  const location: LayerScore = { score: cap(loc), reasons: lReasons }

  // ---- Value ----
  const profile = buildValueProfile(bars)
  const vReasons: string[] = []
  let val = 0
  if (profile) {
    if (profile.closePos === "inside_va") {
      val += 55
      vReasons.push(`ราคาใน Value Area ${profile.valLow.toFixed(2)}–${profile.valHigh.toFixed(2)} — ตลาดยอมรับราคาโซนนี้`)
    } else if (profile.closePos === "above_va") {
      val += 40
      vReasons.push("ราคาเหนือ Value Area — โมเมนตัมเป็นฝั่งซื้อ ระวังย่อกลับเข้า VA")
    } else {
      val += 20
      vReasons.push("ราคาใต้ Value Area — ยังไม่ได้การยอมรับ หากยืนกลับเข้า VA คือสัญญาณตรงข้าม")
    }
    const pocGap = (last.close / profile.poc - 1) * 100
    if (Math.abs(pocGap) <= 1.5) {
      val += 20
      vReasons.push(`POC ${profile.poc.toFixed(2)} อยู่ใกล้ (${pocGap >= 0 ? "+" : ""}${pocGap.toFixed(1)}%) — แม่เหล็กราคา`)
    }
    const hvnNear = profile.hvn.find((p) => Math.abs(last.close / p - 1) <= 0.02)
    if (hvnNear) {
      val += 15
      vReasons.push(`มี HVN ${hvnNear.toFixed(2)} ใกล้ ๆ — เขตแรงรับ/แรงกด`)
    }
    const lvnNear = profile.lvn.find((p) => Math.abs(last.close / p - 1) <= 0.02)
    if (lvnNear) {
      val += 10
      vReasons.push(`มี LVN ${lvnNear.toFixed(2)} ใกล้ ๆ — สุญญากาศ ราคาพุ่งผ่านได้เร็ว`)
    }
  } else {
    vReasons.push("ข้อมูลสั้นเกินสำหรับ Value Profile")
  }
  const value: LayerScore = { score: cap(val), reasons: vReasons }

  const total = Math.round(location.score * W_LOCATION + value.score * W_VALUE + behavior.score * W_BEHAVIOR)
  return {
    symbol: s.symbol,
    sector: s.sector,
    close: last.close,
    ret20,
    location,
    value,
    behavior,
    total,
    verdict: total >= 65 ? "high" : total >= 45 ? "medium" : "low",
    sweep,
    fvgs,
    levels,
    profile,
    flow,
  }
}
