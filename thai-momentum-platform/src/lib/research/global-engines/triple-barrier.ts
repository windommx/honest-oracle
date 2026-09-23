// Triple-Barrier Labeling — López de Prado (2018), "Advances in Financial
// Machine Learning", Wiley (บทที่ 3) + meta-labeling (บทที่ 3.6)
// ติดป้ายแต่ละ signal ด้วย 3 กำแพง: บน +2σ · ล่าง −1.5σ · เวลา H=10 แท่ง
// ผลลัพธ์: การกระจายป้าย (TP/SL/timeout), EV หลังต้นทุน, ขนาดตัวอย่างสำหรับ
// โมเดล meta-label ตัวถัดไป (P(win) → ขนาดไม้) ที่จะเสียบเข้า Shadow Lab

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { COST_RT } from "@/lib/research/thai-fit"
import { stdD1 } from "./helpers"
import type { EngineEval, EngineStats } from "./types"

const TOP_N = 20
const LOOKBACK = 20
const H = 10 // กำแพงเวลา (แท่ง)
const UP_K = 2.0 // กำแพงบน = 2σ
const DN_K = 1.5 // กำแพงล่าง = 1.5σ (stop บางกว่า take-profit ตามปรัชญา R:R ของเรา)
const SAMPLE_DAYS = 300

export function evalTripleBarrier(piv: ThaiPivots, rets: Mat): EngineEval {
  const nD = piv.dates.length
  let tp = 0
  let sl = 0
  let to = 0
  let sumRet = 0
  let n = 0
  let holdSum = 0

  const iStart = Math.max(LOOKBACK, nD - SAMPLE_DAYS)
  for (let i = iStart; i < nD - 1; i++) {
    // จัด top-N ด้วย ret20 (liquid) ณ วัน i
    const cur = piv.close[i]
    const base = piv.close[i - LOOKBACK]
    if (!cur || !base) continue
    const cands: { j: number; m: number }[] = []
    for (let j = 0; j < piv.nSym; j++) {
      const c0 = cur[j]
      const cb = base[j]
      if (c0 === undefined || cb === undefined || cb <= 1e-9 || !piv.liq[i][j]) continue
      cands.push({ j, m: c0 / cb - 1 })
    }
    if (cands.length < TOP_N) continue
    cands.sort((a, b) => b.m - a.m)

    for (const cand of cands.slice(0, TOP_N)) {
      const j = cand.j
      // σ รายวัน 20 จุดล่าสุด
      const hist: number[] = []
      for (let t = i - LOOKBACK + 1; t <= i; t++) {
        const r = rets[t]?.[j]
        if (r !== undefined) hist.push(r)
      }
      if (hist.length < 15) continue
      const sd = stdD1(hist)
      if (sd <= 1e-9) continue
      const entry = cur[j] as number
      const up = UP_K * sd
      const dn = -DN_K * sd
      // เดินหากำแพงที่โดนก่อน
      let label: 1 | -1 | 0 = 0
      let ret = 0
      let hold = H
      let seen = 0 // จำนวนแท่งถัดไปที่มีราคาจริง
      const maxK = Math.min(H, nD - 1 - i)
      for (let k = 1; k <= maxK; k++) {
        const cp = piv.close[i + k]?.[j]
        if (cp === undefined) continue
        seen++
        const r = cp / entry - 1
        hold = k
        if (r >= up) {
          label = 1
          ret = r
          break
        }
        if (r <= dn) {
          label = -1
          ret = r
          break
        }
        ret = r // ล่าสุดก่อนหมดเวลา
      }
      // ไม่มีราคาหลังเข้าเลย (พักการซื้อขาย/เพิกถอน) หรือกำแพงเวลาเกินปลายข้อมูลโดยยังไม่ชนกำแพงราคา
      // → ไม่รู้ผลจริง: ไม่นับเป็น timeout ผลตอบแทน 0/บางส่วน (กันป้ายปลอม)
      if (seen === 0 || (label === 0 && maxK < H)) continue
      n++
      holdSum += hold
      if (label === 1) tp++
      else if (label === -1) sl++
      else to++
      sumRet += ret
    }
  }

  const avgRet = n > 0 ? sumRet / n : 0
  const ev = avgRet - COST_RT // ต้นทุนเที่ยวกลับตามธรรมเนียม thai-fit
  const pctTp = n > 0 ? tp / n : 0
  const pctSl = n > 0 ? sl / n : 0

  // เกณฑ์ลงทะเบียน: PASS = EV หลังต้นทุน > 0 และ %TP > %SL; WEAK = EV > 0
  let verdict: EngineEval["verdict"] = "FAIL"
  let why = `EV หลังต้นทุน ${(ev * 100).toFixed(2)}% ≤ 0 — barrier ชุดนี้ยังไม่คุ้ม (honest)`
  if (n === 0) {
    // ไม่มีไม้ให้ติดป้าย — EV = −ต้นทุน ไม่ใช่ผลวัด
    verdict = "INFO"
    why = `ข้อมูลไม่พอ — ไม่มีไม้ที่ติดป้ายได้ (ต้องมีหุ้น liquid ≥${TOP_N} ตัวที่มีประวัติ ${LOOKBACK} วันและราคาถัดไปครบกำแพงเวลา) จึงยังตัดสินไม่ได้`
  } else if (ev > 0 && pctTp > pctSl) {
    verdict = "PASS"
    why = `EV หลังต้นทุน ${(ev * 100).toFixed(2)}% > 0 และ %TP ${(pctTp * 100).toFixed(1)}% > %SL ${(pctSl * 100).toFixed(1)}% (เกณฑ์ลงทะเบียน)`
  } else if (ev > 0) {
    verdict = "WEAK"
    why = `EV หลังต้นทุนเป็นบวก ${(ev * 100).toFixed(2)}% แต่ %TP ไม่ชนะ %SL — ปรับกำแพงก่อนใช้`
  }

  const stats: EngineStats = {
    nSamples: n,
    pctTp: Math.round(pctTp * 1000) / 10,
    pctSl: Math.round(pctSl * 1000) / 10,
    pctTimeout: n > 0 ? Math.round((to / n) * 1000) / 10 : 0,
    avgRet: Math.round(avgRet * 10000) / 10000,
    evAfterCost: Math.round(ev * 10000) / 10000,
    avgHoldBars: n > 0 ? Math.round((holdSum / n) * 10) / 10 : 0,
    barrierUp: UP_K,
    barrierDn: -DN_K,
    horizon: H,
  }

  return {
    id: "triple_barrier",
    name: "Triple-Barrier Meta-Labeling",
    source: {
      authors: "López de Prado",
      year: 2018,
      title: "Advances in Financial Machine Learning (Triple-barrier + meta-labeling)",
      venue: "Wiley · ยืนยันประสิทธิผลโดย Hudson & Thames",
    },
    thesis:
      "เปลี่ยน 'ควรซื้อไหม' เป็น 'ถ้าซื้อแล้วโดนกำแพงไหนก่อน' — ป้ายแบบมี stop/แรง/เวลาทำให้โมเดลตัวถัดไปเรียนรู้ P(win) เพื่อขยาย-หดขนาดไม้ (meta-labeling) แทนการเดาทิศ",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "src/lib/lab (outcome.ts) + ShadowLog",
      how: "ถ้า PASS → ใช้ barrier distribution เป็น ground-truth ติดป้าย ShadowLog เพิ่มชั้น แล้วให้ Nimble/โมเดลทาย P(win) → ขนาดไม้ ตาม conf",
    },
  }
}
