// Residual Momentum — Blitz, Huij & Martens (2011), Journal of Empirical Finance
// แนวคิด: โมเมนตัมบน "residual return" หลังถอด market beta ออก
//   r_j,t = α_j + β_j·r_m,t + ε_t  (market model, หน้าต่าง F วัน)
//   signal = ผลตอบแทนสะสมหลังถอด market beta = Σ(r_t − β·m_t) = n·α̂
//   (Σ ε_t ในหน้าต่างเดียวกับที่ fit = 0 เสมอตามนิยาม OLS ที่มี intercept จึงใช้เป็นสัญญาณไม่ได้)
// เหตุผลที่เหมาะกับ SET: โมเมนตัมราคาดิบระยะยาวของเราตาย (H4) — residual momentum
// กำไร risk-adjusted ~2 เท่าของ total-return momentum และลด momentum crash
// (กัน beta/sector ปลอม ๆ ขับเคลื่อน)

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { icAcross, bestIc, latestSignalValue } from "./helpers"
import { alphaVerdict, type EngineEval, type EngineStats } from "./types"

const FORM = 126 // ~6 เดือน หน้าต่าง regression (ต้นฉบับใช้ 12-1 เดือน)
const MIN_VALID = 60 // ต้องมีอย่างน้อย 60 วันที่ข้อมูลครบในหน้าต่าง

export function residualMomentumSig(piv: ThaiPivots, rets: Mat, mkt: number[]): Mat {
  const { close, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    if (i >= FORM) {
      const cur = close[i]
      for (let j = 0; j < nSym; j++) {
        const c0 = cur[j]
        if (c0 === undefined || !liq[i][j]) continue
        // สะสม cross-product เพื่อ β = Σ(r−r̄)(m−m̄)/Σ(m−m̄)²
        let sr = 0
        let sm = 0
        let cnt = 0
        for (let t = i - FORM + 1; t <= i; t++) {
          const r = rets[t]?.[j]
          if (r === undefined) continue
          sr += r
          sm += mkt[t] ?? 0
          cnt++
        }
        if (cnt < MIN_VALID) continue
        const rb = sr / cnt
        const mb = sm / cnt
        let cov = 0
        let varM = 0
        for (let t = i - FORM + 1; t <= i; t++) {
          const r = rets[t]?.[j]
          if (r === undefined) continue
          const m = mkt[t] ?? 0
          cov += (r - rb) * (m - mb)
          varM += (m - mb) * (m - mb)
        }
        if (varM <= 1e-12) continue
        const beta = cov / varM
        // ผลตอบแทนสะสมหลังถอด beta = Σ(r_t − β·m_t) = cnt·(rb − β·mb) (เก็บ α̂ ไว้ — มันคือส่วนที่เป็นโมเมนตัม)
        // หมายเหตุ: Σ(r_t − rb) − β·Σ(m_t − mb) (ลบ α̂ ด้วย) = 0 เสมอ → สัญญาณเหลือแต่ noise ทศนิยม
        row[j] = cnt * (rb - beta * mb)
      }
    }
    out.push(row)
  }
  return out
}

export function evalResidualMomentum(piv: ThaiPivots, rets: Mat, mkt: number[]): EngineEval {
  const sig = residualMomentumSig(piv, rets, mkt)
  const rows = icAcross(piv, sig, [5, 10, 20, 40])
  const best = bestIc(rows)
  const ic = best?.ic ?? { meanIC: 0, ICIR: 0, t: 0, n: 0 }
  const { verdict, why } = alphaVerdict(ic.meanIC, ic.ICIR, ic.t, ic.n)

  const stats: EngineStats = {
    bestHold: best?.hold ?? 0,
    meanIC: ic.meanIC,
    ICIR: ic.ICIR,
    t: ic.t,
    nDays: ic.n,
    formWindow: FORM,
    liveValue: latestSignalValue(sig) ?? NaN,
    icHold5: rows.find((r) => r.hold === 5)?.ic.ICIR ?? 0,
    icHold10: rows.find((r) => r.hold === 10)?.ic.ICIR ?? 0,
    icHold20: rows.find((r) => r.hold === 20)?.ic.ICIR ?? 0,
    icHold40: rows.find((r) => r.hold === 40)?.ic.ICIR ?? 0,
  }

  return {
    id: "residual_momentum",
    name: "Residual Momentum",
    source: {
      authors: "Blitz, Huij & Martens",
      year: 2011,
      title: "Residual Momentum",
      venue: "Journal of Empirical Finance 18(3)",
    },
    thesis:
      "โมเมนตัมบน residual หลังถอด market beta — ตัดผลของตลาด/เบต้าปลอม ทำให้กำไร risk-adjusted สูงกว่าโมเมนตัมราคาดิบราว 2 เท่าและทน momentum crash กว่า",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "signals/thai.ts + config_th TF_WEIGHTS",
      how: "ถ้า PASS → เพิ่ม residual score เป็นตัวคูณคุณภาพของคอร์ 5–20 วัน (จัด rank ร่วมกับ ret) และทดแทนโมเมนตัมยาวที่ตายแล้ว (80–300 วัน)",
    },
    spark: { label: "ICIR ตาม hold", values: [stats.icHold5 as number, stats.icHold10 as number, stats.icHold20 as number, stats.icHold40 as number] },
  }
}
