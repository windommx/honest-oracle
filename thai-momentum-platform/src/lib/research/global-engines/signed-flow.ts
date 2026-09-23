// Signed Turnover Flow (order-flow imbalance proxy รายวัน)
// อ้างอิงแนวคิด: Lu et al. (2024) volume order imbalance & returns; Dobrev &
// Schaumburg (2025, Fed Notes) order flow imbalances amplify price moves.
// ปรับใช้กับข้อมูลเรา (close + val): flow_t = val_t·sign(r_t)
// sig = Σ flow / Σ val ในหน้าต่าง k วัน — บวกมาก = เงินไหลเข้าแรง
// (เสริมจาก MFD ที่เป็น feature ชั้นหนึ่งของเราอยู่แล้ว ด้วยตัววัดคนละแบบ)

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { icAcross, bestIc, latestSignalValue } from "./helpers"
import { alphaVerdict, type EngineEval, type EngineStats } from "./types"

const K = 10

export function signedFlowSig(piv: ThaiPivots, rets: Mat): Mat {
  const { val, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    for (let j = 0; j < nSym; j++) {
      if (!liq[i][j]) continue
      let sFlow = 0
      let sVal = 0
      let cnt = 0
      for (let t = Math.max(0, i - K + 1); t <= i; t++) {
        const v = val[t]?.[j]
        const r = rets[t]?.[j]
        if (v === undefined || v <= 0) continue
        sVal += v
        // sign(r): วันราคานิ่ง (r = 0 — พบบ่อยในหุ้นไทยเพราะช่วงราคา) = 0 ไม่ใช่แรงขาย
        sFlow += v * (r === undefined ? 0 : Math.sign(r))
        cnt++
      }
      if (cnt >= Math.ceil(K * 0.6) && sVal > 1e-9) row[j] = sFlow / sVal
    }
    out.push(row)
  }
  return out
}

export function evalSignedFlow(piv: ThaiPivots, rets: Mat): EngineEval {
  const sig = signedFlowSig(piv, rets)
  const rows = icAcross(piv, sig, [3, 5, 10])
  const best = bestIc(rows)
  const ic = best?.ic ?? { meanIC: 0, ICIR: 0, t: 0, n: 0 }
  const { verdict, why } = alphaVerdict(ic.meanIC, ic.ICIR, ic.t, ic.n)

  const stats: EngineStats = {
    bestHold: best?.hold ?? 0,
    meanIC: ic.meanIC,
    ICIR: ic.ICIR,
    t: ic.t,
    nDays: ic.n,
    window: K,
    liveValue: latestSignalValue(sig) ?? NaN,
    icHold3: rows.find((r) => r.hold === 3)?.ic.ICIR ?? 0,
    icHold5: rows.find((r) => r.hold === 5)?.ic.ICIR ?? 0,
    icHold10: rows.find((r) => r.hold === 10)?.ic.ICIR ?? 0,
  }

  return {
    id: "signed_flow",
    name: "Signed Turnover Flow (OFI proxy)",
    source: {
      authors: "Lu et al. (2024); Dobrev & Schaumburg (2025, Fed Notes)",
      year: 2024,
      title: "Volume order imbalance & returns · Order Flow Imbalances and Amplification of Price Movements",
      venue: "J. Financial Markets / Federal Reserve Board FEDS Notes",
    },
    thesis:
      "เงินไหลนำราคา — สัดส่วนมูลค่าซื้อขายที่เกิดในวันราคาขึ้นลบวันราคาลง ใน 10 วันล่าสุด บอกแรงซื้อสุทธิก่อนราคาปรับ (อีกตัววัดหนึ่งของ flow คนละเชิงกับ MFD)",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "signals/thai.ts — mfd feature tier-1",
      how: "ถ้า PASS → ใช้ confirm คู่กับ mfd ใน snapback/entry gate (ผ่านเมื่อ flow ตัวใดตัวหนึ่งเข้าข่าย หรือบังคับทั้งคู่ถ้า correlation ต่ำ)",
    },
    spark: { label: "ICIR ตาม hold", values: [stats.icHold3 as number, stats.icHold5 as number, stats.icHold10 as number] },
  }
}
