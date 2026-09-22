// Frog-in-the-Pan: Information Discreteness — Da, Gurun & Warachka (2014), RFS 27(7)
// ID = sign(ret_form) × (%วันลง − %วันขึ้น)  → ค่ายิ่งติดลบ = ข่าวไหล "ต่อเนื่องเล็ก ๆ"
// นักลงทุนสนใจน้อย (limited attention) → โมเมนตัมคุณภาพสูง มีเวลาให้เราขึ้นรถ
// signal ที่ใช้วัด IC = −ID (ยิ่งมากยิ่ง continuous ทั้งฝั่งขึ้น/ลง)

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { icAcross, bestIc, latestSignalValue } from "./helpers"
import { alphaVerdict, type EngineEval, type EngineStats } from "./types"

const FORM = 20 // หน้าต่าง formation — ชนกับคอร์สั้นของเรา (H1 sweet spot)

export function frogInPanSig(piv: ThaiPivots, rets: Mat): Mat {
  const { close, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
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
        const id = sgn * (neg - pos) / cnt // ID ตามต้นฉบับ
        row[j] = -id // ยิ่งมากยิ่ง continuous-momentum
      }
    }
    out.push(row)
  }
  return out
}

export function evalFrogInPan(piv: ThaiPivots, rets: Mat): EngineEval {
  const sig = frogInPanSig(piv, rets)
  const rows = icAcross(piv, sig, [3, 5, 10, 20])
  const best = bestIc(rows)
  const ic = best?.ic ?? { meanIC: 0, ICIR: 0, t: 0, n: 0 }
  const { verdict, why } = alphaVerdict(ic.meanIC, ic.ICIR, ic.t)

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
      how: "ถ้า PASS → ใช้ −ID เป็นตัวคูณจัดอันดับซ้ำในคอร์ 5–20 วัน (คัด 'โมเมนตัมนุ่ม' ทิ้ง 'โมเมนตัมกระตุก') ก่อนส่งเข้า Jev",
    },
    spark: { label: "ICIR ตาม hold", values: [stats.icHold3 as number, stats.icHold5 as number, stats.icHold10 as number, stats.icHold20 as number] },
  }
}
