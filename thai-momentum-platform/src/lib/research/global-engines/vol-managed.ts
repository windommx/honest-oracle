// Volatility-Managed Momentum — Barroso & Santa-Clara (2015) "Momentum has its
// moments", JFE 116(1); Daniel & Moskowitz (2016) "Momentum crashes", JFE 122.
// w_t = σ*/σ̂_t  (σ* = target รายวัน, σ̂ = EWMA ของผลตอบแทน strategy)
// ผลตอบแทน strategy = ตะกร้า past-winners (top quintile ret20) ที่ถือ 1 วัน
// ตรวจบนข้อมูลเราว่า overlay เพิ่ม Sharpe + หั่น max drawdown จริงไหม

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { ewmaVol, mean, stdD1 } from "./helpers"
import type { EngineEval, EngineStats } from "./types"

const LOOKBACK = 20 // จัดตะกร้าด้วย ret20
const TARGET_DAILY = 0.0095 // ≈ 15%/ปี (annualized ÷ √252)
const W_MIN = 0.25
const W_MAX = 1.5
const WARMUP = 60

function sharpe(xs: number[]): number {
  const sd = stdD1(xs)
  if (sd <= 1e-12) return 0
  return (mean(xs) * 252) / (sd * Math.sqrt(252))
}

function maxDrawdown(xs: number[]): number {
  let cum = 1
  let peak = 1
  let mdd = 0
  for (const r of xs) {
    cum *= 1 + r
    if (cum > peak) peak = cum
    const dd = peak > 0 ? 1 - cum / peak : 0
    if (dd > mdd) mdd = dd
  }
  return mdd
}

export function evalVolManaged(piv: ThaiPivots, rets: Mat): EngineEval {
  const nD = piv.dates.length
  // 1) ผลตอบแทนรายวันของตะกร้า past-winners (จัดจากข้อมูลวัน i, ถือไปวัน i+1)
  const strat: number[] = [] // index k ↔ วัน i = k + WARMUP + 1
  for (let i = WARMUP; i < nD - 1; i++) {
    const cands: { r: number; m: number }[] = []
    const cur = piv.close[i]
    const base = i >= LOOKBACK ? piv.close[i - LOOKBACK] : null
    if (!cur || !base) continue
    for (let j = 0; j < piv.nSym; j++) {
      const c0 = cur[j]
      const cb = base[j]
      const nxt = rets[i + 1]?.[j]
      if (c0 === undefined || cb === undefined || nxt === undefined) continue
      if (!piv.liq[i][j]) continue
      cands.push({ m: c0 / cb - 1, r: nxt })
    }
    if (cands.length < 20) continue
    cands.sort((a, b) => b.m - a.m)
    const top = cands.slice(0, Math.max(10, Math.floor(cands.length * 0.2)))
    strat.push(mean(top.map((c) => c.r)))
  }

  const vols = ewmaVol(strat) // vols[k] รวม strat[k]² แล้ว = รู้หลังปิดวัน k เท่านั้น
  const weightOf = (sig: number | undefined) =>
    Math.min(W_MAX, Math.max(W_MIN, TARGET_DAILY / (sig || TARGET_DAILY)))
  const managed: number[] = []
  const weights: number[] = []
  for (let k = 0; k < strat.length; k++) {
    // น้ำหนักของวัน k ต้องตั้งก่อนรู้ผลวัน k → ใช้ σ̂ ถึงวัน k−1 (กัน look-ahead; วันแรก w = 1)
    const w = k > 0 ? weightOf(vols[k - 1]) : 1
    weights.push(w)
    managed.push((strat[k] ?? 0) * w)
  }
  // w สำหรับรอบถัดไป (live) = σ̂ ล่าสุดที่รวมวันสุดท้ายแล้ว
  const liveWeight = vols.length > 0 ? weightOf(vols[vols.length - 1]) : 1

  const sRaw = sharpe(strat)
  const sMan = sharpe(managed)
  const ddRaw = maxDrawdown(strat)
  const ddMan = maxDrawdown(managed)
  const worstRaw = Math.min(...(strat.length ? strat : [0]))
  const worstMan = Math.min(...(managed.length ? managed : [0]))

  // เกณฑ์ลงทะเบียน: PASS = Sharpe เพิ่ม ≥ 0.15 และ MDD ดีขึ้น; WEAK = Sharpe ไม่แย่ลง; else FAIL
  let verdict: EngineEval["verdict"] = "FAIL"
  let why = `Sharpe หลังสเกล ${sMan.toFixed(2)} < ก่อนสเกล ${sRaw.toFixed(2)} — overlay ไม่ช่วยบนข้อมูลชุดนี้`
  if (strat.length < 2) {
    // ไม่มีตัวอย่างพอคำนวณ Sharpe (std ต้อง ≥2 จุด) — Sharpe 0 → 0 ไม่ใช่หลักฐานว่า "ไม่แย่ลง"
    verdict = "INFO"
    why = `ข้อมูลไม่พอ — ตะกร้า winners มีผลตอบแทนเพียง ${strat.length} วัน (ต้องมีหุ้น liquid ≥20 ตัวและประวัติ >${WARMUP} วัน) จึงยังตัดสินไม่ได้`
  } else if (sMan >= sRaw + 0.15 && ddMan < ddRaw) {
    verdict = "PASS"
    why = `Sharpe ${sRaw.toFixed(2)} → ${sMan.toFixed(2)} (+${(sMan - sRaw).toFixed(2)} ≥ 0.15) และ MDD ${(ddRaw * 100).toFixed(1)}% → ${(ddMan * 100).toFixed(1)}% (เกณฑ์ลงทะเบียน)`
  } else if (sMan >= sRaw) {
    verdict = "WEAK"
    why = `Sharpe ${sRaw.toFixed(2)} → ${sMan.toFixed(2)} ดีขึ้นเล็กน้อยแต่ไม่ครบ +0.15 — เก็บเป็นทางเลือก overlay`
  }

  const stats: EngineStats = {
    sharpeRaw: Math.round(sRaw * 100) / 100,
    sharpeManaged: Math.round(sMan * 100) / 100,
    mddRaw: Math.round(ddRaw * 1000) / 1000,
    mddManaged: Math.round(ddMan * 1000) / 1000,
    worstDayRaw: Math.round(worstRaw * 10000) / 10000,
    worstDayManaged: Math.round(worstMan * 10000) / 10000,
    avgWeight: Math.round(mean(weights) * 100) / 100,
    lastWeight: Math.round(liveWeight * 100) / 100,
    targetDaily: TARGET_DAILY,
    nDays: strat.length,
  }

  const sparkStart = Math.max(0, weights.length - 120)
  return {
    id: "vol_managed",
    name: "Volatility-Managed Momentum (overlay)",
    source: {
      authors: "Barroso & Santa-Clara (2015); Daniel & Moskowitz (2016)",
      year: 2015,
      title: "Momentum has its moments · Momentum Crashes",
      venue: "Journal of Financial Economics 116(1) / 122(2)",
    },
    thesis:
      "เทียบความเสี่ยง strategy โมเมนตัมให้คงที่ด้วย w = σ*/σ̂ — ตัดหาง crash ที่มาจากการถือตะกร้าชนะหลังตลาดพัง (momentum crash) โดยไม่เสียกำไรเฉลี่ยมาก",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "regime composite + alloc.ts (gross budget)",
      how: "ถ้า PASS → คูณ gross budget ของคอร์โมเมนตัมด้วย w ล่าสุด (คำนวณจาก EWMA ของตะกร้า winners) ทุกเช้าก่อน Jev",
    },
    spark: { label: "w ล่าสุด 120 วัน", values: weights.slice(sparkStart).map((w) => Math.round(w * 100) / 100) },
  }
}
