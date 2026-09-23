// CSAD Herding — Chang, Cheng & Khorana (2000), J. Banking & Finance 24
// (ต่อยอด Christie & Huang 1995; สายเดียวกับ Hwang-Salmon beta-herding)
// CSAD_t = mean_j |r_j,t − r_m,t| — ถ้าฝูงเดินตามกัน การกระจายตัวหด
// เราทดสอบสิ่งที่ใช้ได้จริงกับ overlay ของเรา: วันที่ CSAD สูงผิดปกติ
// (ตลาดเครียด/แตกพุ่ง) → ตลาดรวม 10 วันข้างหน้าไปไหน?

import { mean, stdD1 } from "./helpers"
import type { EngineEval, EngineStats } from "./types"

export function evalCsad(rets: (number | undefined)[][], mkt: number[]): EngineEval {
  const nD = rets.length
  const csad: number[] = []
  for (let i = 0; i < nD; i++) {
    const row = rets[i]
    let s = 0
    let c = 0
    for (let j = 0; j < row.length; j++) {
      const r = row[j]
      if (r === undefined) continue
      s += Math.abs(r - (mkt[i] ?? 0))
      c++
    }
    csad.push(c > 0 ? s / c : 0)
  }

  // สถานะปัจจุบัน: CSAD ล่าสุดอยู่ percentile เท่าไร
  const valid = csad.filter((v) => v > 0).sort((a, b) => a - b)
  const last = csad[nD - 1] ?? 0
  let pct = 0
  {
    let lo = 0
    let hi = valid.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((valid[mid] ?? 0) < last) lo = mid + 1
      else hi = mid
    }
    pct = valid.length > 0 ? lo / valid.length : 0
  }

  // fwd 10 วันของตลาด: ทบต้น mkt[i+1..i+10] (หลังวันที่รู้ CSAD — ไม่มี look-ahead)
  const fwd10: number[] = []
  for (let i = 0; i < nD - 10; i++) {
    let cum = 1
    let ok = true
    for (let t = i + 1; t <= i + 10; t++) {
      const r = mkt[t]
      if (r === undefined) {
        ok = false
        break
      }
      cum *= 1 + r
    }
    if (ok) fwd10.push(cum - 1)
    else fwd10.push(NaN)
  }

  // เทียบกลุ่ม: CSAD top-20% (ตึงเครียด) vs ที่เหลือ
  const sorted = [...csad].sort((a, b) => a - b)
  const q80 = sorted[Math.floor(sorted.length * 0.8)] ?? 0
  const hiFwd: number[] = []
  const loFwd: number[] = []
  for (let i = 0; i < nD - 10; i++) {
    const f = fwd10[i]
    if (f === undefined || Number.isNaN(f)) continue
    if ((csad[i] ?? 0) >= q80) hiFwd.push(f)
    else loFwd.push(f)
  }
  const mHi = mean(hiFwd)
  const mLo = mean(loFwd)
  // t แบบ two-sample (Welch หยาบ ๆ)
  const se = Math.sqrt(
    Math.pow(stdD1(hiFwd), 2) / Math.max(hiFwd.length, 1) +
      Math.pow(stdD1(loFwd), 2) / Math.max(loFwd.length, 1),
  )
  const tStat = se > 1e-12 ? (mHi - mLo) / se : 0

  // เกณฑ์ลงทะเบียน: PASS = t ≤ −2 (CSAD สูง → ตลาดหน้าอ่อนจริง); WEAK = t ≤ −1.5
  let verdict: EngineEval["verdict"] = "FAIL"
  let why = `t = ${tStat.toFixed(2)} > −1.5 — CSAD สูงไม่ทำนายตลาดอ่อนบนข้อมูลชุดนี้ (honest)`
  if (hiFwd.length < 2 || loFwd.length < 2) {
    // t ต้องมี ≥2 จุดต่อกลุ่ม — t = 0 จากกลุ่มว่างไม่ใช่หลักฐาน
    verdict = "INFO"
    why = `ข้อมูลไม่พอ — กลุ่ม CSAD สูง ${hiFwd.length} วัน / ปกติ ${loFwd.length} วัน (ต้อง ≥2 ต่อกลุ่ม) จึงยังตัดสินไม่ได้`
  } else if (tStat <= -2) {
    verdict = "PASS"
    why = `CSAD top-20% → fwd10 ตลาด ${((mHi - mLo) * 100).toFixed(2)}pp ต่ำกว่ากลุ่มปกติ (t = ${tStat.toFixed(2)} ≤ −2, เกณฑ์ลงทะเบียน)`
  } else if (tStat <= -1.5) {
    verdict = "WEAK"
    why = `ทิศทางถูก (t = ${tStat.toFixed(2)} ≤ −1.5) แต่ไม่ถึง −2 — ใช้เสริมได้ ยังไม่ตั้ง gate เดี่ยว`
  }

  const stats: EngineStats = {
    csadLast: Math.round(last * 10000) / 10000,
    csadPct: Math.round(pct * 1000) / 10,
    q80: Math.round(q80 * 10000) / 10000,
    fwdHi: Math.round(mHi * 10000) / 10000,
    fwdLo: Math.round(mLo * 10000) / 10000,
    spread: Math.round((mHi - mLo) * 10000) / 10000,
    tSpread: Math.round(tStat * 100) / 100,
    nHi: hiFwd.length,
    nLo: loFwd.length,
  }

  const sparkStart = Math.max(0, csad.length - 120)
  return {
    id: "csad_herding",
    name: "CSAD Herding (dispersion)",
    source: {
      authors: "Chang, Cheng & Khorana",
      year: 2000,
      title: "An examination of herd behavior in equity markets",
      venue: "Journal of Banking & Finance 24(3) · สายเดียวกับ Hwang-Salmon 2004",
    },
    thesis:
      "เมื่อฝูงเหมือนวัดกัน การกระจายตัวของผลตอบแทนหด — วันที่ CSAD พุ่งผิดปกติ = ตลาดเครียด/แตกพุ่ง มักนำหน้าตลาดอ่อน ใช้เป็นสัญญาณ 'ออกก่อนกลับทาง' เสริม regime",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "regime composite (breadthZ term)",
      how: "ถ้า PASS → เติมเทอม CSAD-percentile เข้า composite (น้ำหนัก ~0.10) และแสดง live percentile บน overview",
    },
    spark: { label: "CSAD 120 วัน", values: csad.slice(sparkStart).map((v) => Math.round(v * 10000) / 10000) },
  }
}
