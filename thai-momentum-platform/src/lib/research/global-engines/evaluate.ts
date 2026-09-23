// evaluate.ts — รัน Global Engines ทั้งชุดบนข้อมูลจริงของเรา
// หลักการ: ทุก engine ต้องผ่านการทดสอบบนข้อมูล SET ก่อน "แนะนำ" เข้า config
// verdict เป็นเพียงผลวัด — การเปลี่ยน config ยังไปผ่าน apply-verdict/audit เหมือนเดิม

import { loadPivots, type ThaiPivots } from "@/lib/research/thai-fit"
import { dailyReturns, marketReturns } from "./helpers"
import { evalResidualMomentum } from "./residual-momentum"
import { evalFrogInPan } from "./frog-in-pan"
import { evalVolManaged } from "./vol-managed"
import { evalW52High } from "./w52-high"
import { evalSignedFlow } from "./signed-flow"
import { evalCsad } from "./csad"
import { evalTripleBarrier } from "./triple-barrier"
import { evalHmmRegime } from "./hmm-regime"
import { evalHrp } from "./hrp"
import type { GlobalEnginesReport } from "./types"

// cache ต่อ data snapshot: loadPivots คืน object เดิมก็ต่อเมื่อ fingerprint ข้อมูลไม่เปลี่ยน
// (count/maxDate/maxId/ผลรวมค่า) → ผูก cache กับ identity ของ pivot แทน "จำนวนวัน:วันล่าสุด"
// ที่พลาดการเพิ่ม/ลบหุ้นหรือแก้ราคาในช่วงวันเดิม
let _cache: { piv: ThaiPivots; report: GlobalEnginesReport } | null = null

export async function runGlobalEngines(): Promise<GlobalEnginesReport> {
  const piv = await loadPivots()
  if (_cache && _cache.piv === piv) return _cache.report

  const t0 = Date.now()
  const rets = dailyReturns(piv)
  const mkt = marketReturns(rets)

  const engines = [
    evalResidualMomentum(piv, rets, mkt),
    evalFrogInPan(piv, rets),
    evalVolManaged(piv, rets),
    evalW52High(piv),
    evalSignedFlow(piv, rets),
    evalCsad(rets, mkt),
    evalTripleBarrier(piv, rets),
    evalHmmRegime(mkt),
    evalHrp(piv),
  ]

  const report: GlobalEnginesReport = {
    generatedAt: new Date().toISOString(),
    dates: piv.dates.length,
    symbols: piv.nSym,
    latestDate: piv.dates[piv.dates.length - 1] ?? "",
    engines,
    runtimeMs: Date.now() - t0,
  }
  _cache = { piv, report }
  return report
}
