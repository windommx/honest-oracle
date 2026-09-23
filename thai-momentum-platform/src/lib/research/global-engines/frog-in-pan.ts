// Frog-in-the-Pan: Information Discreteness — Da, Gurun & Warachka (2014), RFS 27(7)
// ID = sign(PRET) × (%วันลง − %วันขึ้น) ในหน้าต่าง formation (PRET = ผลตอบแทนสะสมของหน้าต่าง)
//   ID ต่ำ (ติดลบ) = ข่าวไหล "ต่อเนื่องทีละนิด" ทั้งฝั่งขึ้นและลง · ID สูง = ข่าวมาเป็นก้อน (discrete)
//   นักลงทุนสนใจน้อย (limited attention) กับข่าวต่อเนื่อง → ราคาปรับช้า → โมเมนตัมต่อเนื่องแรงกว่า
//   ผลของ DGW: ผู้ชนะแบบต่อเนื่องไปต่อดีที่สุด · ผู้แพ้แบบต่อเนื่องไปต่อแย่ที่สุด · แบบ discrete โมเมนตัมอ่อน
//
// สัญญาณที่วัด IC (ตัดสินเมื่อ 2026-09-23 — docs/research/methodology.md):
//   continuity c = (1 − ID)/2 ∈ [0, 1]  (= การแปลงเชิงเส้นของ −ID: 1 = ต่อเนื่องสุด, 0 = discrete สุด)
//   signal = sign(PRET) × c
//   → ผู้ชนะต่อเนื่องสูงสุด (+1) > ผู้ชนะ discrete (+) > 0 > ผู้แพ้ discrete (−) > ผู้แพ้ต่อเนื่องต่ำสุด (−1)
//   ภายในฝั่งผู้ชนะ อันดับ = อันดับตาม −ID ตรงตามต้นฉบับ · ฝั่งผู้แพ้กลับทิศ (ต่อเนื่อง = แย่สุด)
//   เดิมใช้ −ID ตรง ๆ → ผู้แพ้ต่อเนื่องได้คะแนนสูงเท่าผู้ชนะต่อเนื่อง (สัญญาณ "ไม่แยกทิศ") ทำให้ IC ปนสองฝั่ง

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { icAcross, bestIc, latestSignalValue } from "./helpers"
import { alphaVerdict, type EngineEval, type EngineStats } from "./types"

const FORM = 20 // หน้าต่าง formation — ชนกับคอร์สั้นของเรา (H1 sweet spot)

/** Information Discreteness ตามต้นฉบับ DGW (2014): sign(PRET) × (%วันลง − %วันขึ้น) — cnt = จำนวนวันที่นับได้ */
export function informationDiscreteness(sgnPret: number, pos: number, neg: number, cnt: number): number {
  return cnt > 0 ? (sgnPret * (neg - pos)) / cnt : 0
}

/** สัญญาณ FIP แบบแยกทิศ = sign(PRET) × (1 − ID)/2 (PRET = 0 → 0 = เป็นกลาง) */
export function fipScore(sgnPret: number, pos: number, neg: number, cnt: number): number {
  if (sgnPret === 0 || cnt <= 0) return 0
  const id = informationDiscreteness(sgnPret, pos, neg, cnt)
  return sgnPret * ((1 - id) / 2)
}

/**
 * สัญญาณ FIP + ฐานเทียบโมเมนตัมดิบ (PRET ของหน้าต่างเดียวกัน, mask เดียวกัน) ในรอบเดียว
 * ฐานเทียบใช้วัด "ส่วนเพิ่ม" ของ continuity เหนือโมเมนตัมธรรมดา (DGW อ้างว่า ID ทำให้โมเมนตัมดีขึ้น
 * — ถ้า FIP ชนะเพราะเครื่องหมาย PRET ล้วน ๆ ต้องเห็นได้จากตัวเลข ไม่ใช่เชื่อชื่อสัญญาณ)
 */
export function fipSignals(piv: ThaiPivots, rets: Mat): { fip: Mat; pret: Mat } {
  const { close, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  const pretOut: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    const pretRow: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    const base = i >= FORM ? close[i - FORM] : null
    const cur = close[i]
    if (base && cur) {
      for (let j = 0; j < nSym; j++) {
        const c0 = cur[j]
        const cf = base[j]
        if (c0 === undefined || cf === undefined || cf <= 1e-9 || !liq[i][j]) continue
        let pos = 0
        let neg = 0
        let cnt = 0
        for (let t = i - FORM + 1; t <= i; t++) {
          const r = rets[t]?.[j]
          if (r === undefined) continue
          if (r > 1e-9) pos++
          else if (r < -1e-9) neg++
          cnt++
        }
        if (cnt < FORM * 0.6) continue // ต้องมี ≥60% ของหน้าต่าง
        const cum = c0 / cf - 1
        const sgn = cum > 0 ? 1 : cum < 0 ? -1 : 0
        row[j] = fipScore(sgn, pos, neg, cnt)
        pretRow[j] = cum
      }
    }
    out.push(row)
    pretOut.push(pretRow)
  }
  return { fip: out, pret: pretOut }
}

export function frogInPanSig(piv: ThaiPivots, rets: Mat): Mat {
  return fipSignals(piv, rets).fip
}

export function evalFrogInPan(piv: ThaiPivots, rets: Mat): EngineEval {
  const { fip: sig, pret } = fipSignals(piv, rets)
  const rows = icAcross(piv, sig, [3, 5, 10, 20])
  const best = bestIc(rows)
  const ic = best?.ic ?? { meanIC: 0, ICIR: 0, t: 0, n: 0 }
  const { verdict, why: whyBase } = alphaVerdict(ic.meanIC, ic.ICIR, ic.t, ic.n)
  // ฐานเทียบ: โมเมนตัมดิบ (PRET 20 วัน) ที่ hold เดียวกับ FIP — รายงานเท่านั้น ไม่เปลี่ยนเกณฑ์ verdict ที่ลงทะเบียนไว้
  const momIc = best ? icAcross(piv, pret, [best.hold])[0]?.ic : undefined
  const momICIR = momIc && momIc.n > 0 ? momIc.ICIR : null
  const why =
    momICIR === null
      ? whyBase
      : `${whyBase} · ฐานเทียบโมเมนตัมดิบ (PRET ${FORM} วัน) ที่ hold ${best?.hold} ICIR ${momICIR} → ส่วนเพิ่มจาก continuity ${(ic.ICIR - momICIR).toFixed(3)}${ic.ICIR - momICIR <= 0 ? " (ยังไม่ดีกว่าโมเมนตัมธรรมดา)" : ""}`

  const stats: EngineStats = {
    bestHold: best?.hold ?? 0,
    meanIC: ic.meanIC,
    ICIR: ic.ICIR,
    t: ic.t,
    nDays: ic.n,
    formWindow: FORM,
    liveValue: latestSignalValue(sig) ?? NaN,
    icHold3: rows.find((r) => r.hold === 3)?.ic.ICIR ?? 0,
    icHold5: rows.find((r) => r.hold === 5)?.ic.ICIR ?? 0,
    icHold10: rows.find((r) => r.hold === 10)?.ic.ICIR ?? 0,
    icHold20: rows.find((r) => r.hold === 20)?.ic.ICIR ?? 0,
  }
  if (momICIR !== null) {
    stats.momICIR = momICIR
    stats.fipVsMomICIR = Math.round((ic.ICIR - momICIR) * 1000) / 1000
  }

  return {
    id: "frog_in_pan",
    name: "Frog-in-the-Pan (Information Discreteness)",
    source: {
      authors: "Da, Gurun & Warachka",
      year: 2014,
      title: "Frog in the Pan: Continuous Information and Momentum",
      venue: "Review of Financial Studies 27(7)",
    },
    thesis:
      "โมเมนตัมที่เกิดจากข่าวไหลทีละนิดต่อเนื่อง (ID ติดลบ) กำไรกว่าแบบข่าวมาทีเดียวจั๊ว — เพราะนักลงทุนใส่ใจน้อยและราคาปรับช้า ทำให้มีเวลาไล่ตามได้",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "signals/engine.ts — quality gate ของคอร์โมเมนตัม",
      how: "ถ้า PASS → ใช้ sign(PRET)×(1−ID)/2 จัดอันดับซ้ำในคอร์ 5–20 วัน (ดันผู้ชนะแบบต่อเนื่องขึ้น กดผู้แพ้แบบต่อเนื่องลง คัด 'โมเมนตัมกระตุก' ไว้กลางตาราง) ก่อนส่งเข้า Jev",
    },
    spark: { label: "ICIR ตาม hold", values: [stats.icHold3 as number, stats.icHold5 as number, stats.icHold10 as number, stats.icHold20 as number] },
  }
}
