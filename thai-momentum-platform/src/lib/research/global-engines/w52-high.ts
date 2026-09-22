// 52-Week High Proximity — George & Hwang (2004), Journal of Finance 59(5)
// ยืนยันข้ามตลาดรวม emerging: Liu, Strong & Xu (2011), JBF
// gamma = close / max(close, 252 วัน) ∈ (0,1] — นักลงทุนยึดจุดสูงสุดเป็น anchor
// หุ้นที่ใกล้จุดสูงสุด (gamma → 1) ยังวิ่งต่อได้ เพราะข่าวดีถูก under-react

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { icAcross, bestIc, latestSignalValue } from "./helpers"
import { alphaVerdict, type EngineEval, type EngineStats } from "./types"

const WIN = 252 // ปีซื้อขาย
const MIN_COVER = 180 // ยอมให้ข้อมูลไม่ครบแต่ต้องเกือบเต็มปี

export function w52HighSig(piv: ThaiPivots): Mat {
  const { close, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    const cur = close[i]
    if (cur) {
      for (let j = 0; j < nSym; j++) {
        const c0 = cur[j]
        if (c0 === undefined || !liq[i][j]) continue
        let hi = 0
        let cnt = 0
        const lo = Math.max(0, i - WIN + 1)
        for (let t = lo; t <= i; t++) {
          const c = close[t]?.[j]
          if (c === undefined) continue
          if (c > hi) hi = c
          cnt++
        }
        if (cnt < MIN_COVER || hi <= 1e-9) continue
        row[j] = c0 / hi // gamma
      }
    }
    out.push(row)
  }
  return out
}

export function evalW52High(piv: ThaiPivots): EngineEval {
  const sig = w52HighSig(piv)
  const rows = icAcross(piv, sig, [5, 10, 20, 40])
  const best = bestIc(rows)
  const ic = best?.ic ?? { meanIC: 0, ICIR: 0, t: 0, n: 0 }
  const { verdict, why } = alphaVerdict(ic.meanIC, ic.ICIR, ic.t)

  // % ของหุ้นที่อยู่ใกล้ high (gamma ≥ 0.9) วันล่าสุด — เชิงเล่าเรื่อง regime
  const last = sig[sig.length - 1] ?? []
  let near = 0
  let tot = 0
  for (const v of last) {
    if (v !== undefined) {
      tot++
      if (v >= 0.9) near++
    }
  }

  const stats: EngineStats = {
    bestHold: best?.hold ?? 0,
    meanIC: ic.meanIC,
    ICIR: ic.ICIR,
    t: ic.t,
    nDays: ic.n,
    window: WIN,
    pctNearHigh: tot > 0 ? Math.round((near / tot) * 1000) / 10 : 0,
    liveValue: latestSignalValue(sig) ?? NaN,
    icHold5: rows.find((r) => r.hold === 5)?.ic.ICIR ?? 0,
    icHold10: rows.find((r) => r.hold === 10)?.ic.ICIR ?? 0,
    icHold20: rows.find((r) => r.hold === 20)?.ic.ICIR ?? 0,
    icHold40: rows.find((r) => r.hold === 40)?.ic.ICIR ?? 0,
  }

  return {
    id: "w52_high",
    name: "52-Week High Proximity",
    source: {
      authors: "George & Hwang",
      year: 2004,
      title: "The 52-Week High and Momentum Investing",
      venue: "Journal of Finance 59(5) · ยืนยันตลาด emerging โดย Liu et al. 2011",
    },
    thesis:
      "นักลงทุนยึดจุดสูงสุด 52 สัปดาห์เป็น anchor — หุ้นวิ่งใกล้ high แต่ยังไม่ทะลุ = ข่าวดียัง under-react จึงมีเชื้อโมเมนตัมเหลืออยู่",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "signals/thai.ts — tie-break ของคอร์ 20 วัน",
      how: "ถ้า PASS → เพิ่ม gamma เป็น tie-break เมื่อ ret20 ใกล้เคียงกัน (เชื่อใจหุ้นที่วิ่งใกล้ high มากกว่าหุ้นเด้งกลับจากก้น)",
    },
    spark: { label: "ICIR ตาม hold", values: [stats.icHold5 as number, stats.icHold10 as number, stats.icHold20 as number, stats.icHold40 as number] },
  }
}
