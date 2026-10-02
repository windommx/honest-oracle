/// <reference types="bun-types" />
// ============================================================
// bun scripts/engine-check.ts — รันเอนจินทั้งท่อบน DB ปัจจุบัน (เช่น หลังนำเข้าข้อมูลจริง) แล้วพิมพ์สรุป JSON 1 บรรทัด
// panel → gates/board → walk-forward backtest + attribution → provenance/freshness
// exit code: 0 = ทุกชั้นทำงานและตัวเลขจำกัด · 1 = ล้ม/มีค่าไม่จำกัด
// ============================================================

process.env.OQE_LOG_FORMAT ??= "json"

import { db } from "@/lib/db"
import { log } from "@/lib/log"
import { getDataProvenance } from "@/lib/data/provenance"
import { getBacktest, getBoard, getSystemStatus } from "@/lib/quant/engine/api"
import { RULES_HASH_SHORT } from "@/lib/quant/engine/rules"

async function main(): Promise<number> {
  const t0 = Date.now()
  const prov = await getDataProvenance()
  if (prov.stocks === 0) {
    log.error("engine check failed", { reason: "ไม่มีข้อมูลตลาดใน DB" })
    return 1
  }
  const [status, board, bt] = await Promise.all([getSystemStatus(), getBoard(), getBacktest()])
  const metrics = Object.entries(bt.metrics).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x, i) => [`${k}[${i}]`, x] as const) : [[k, v] as const]))
  const bad = metrics.filter(([, v]) => !Number.isFinite(v)).map(([k]) => k)
  const badRows = board.rows.filter((r) => !Number.isFinite(r.price) || !Number.isFinite(r.probUp)).map((r) => r.symbol)
  if (bad.length || badRows.length) {
    log.error("engine check failed", { nonFiniteMetrics: bad, nonFiniteBoardRows: badRows })
    return 1
  }
  log.info("engine ok", {
    rules: RULES_HASH_SHORT,
    data: { kind: prov.kind, source: prov.source, stocks: status.stocks, days: status.days, firstDate: status.firstDate, lastDate: status.lastDate, freshness: prov.freshness.status, coverage: prov.coverage },
    regime: status.regime.regime,
    board: { pullback: board.summary.nPullback, momentum: board.summary.nMomentum, noTrade: board.summary.nNoTrade, drift: board.summary.drift },
    backtest: { nSignals: bt.metrics.nSignals, hitRate: bt.metrics.hitRate, hitRateCI: bt.metrics.hitRateCI, sharpe: bt.metrics.sharpe, maxDD: bt.metrics.maxDD },
    gates: bt.attribution.map((a) => `${a.gate}:${a.verdict}`),
    tookMs: Date.now() - t0,
  })
  return 0
}

if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      log.error("engine check crashed", { error: e })
      process.exitCode = 1
    })
    .finally(() => db.$disconnect().catch(() => {}))
}
