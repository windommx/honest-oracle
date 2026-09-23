// ============================================================
// Profit Engine — validation ชุดเดียวจบ:
//  1) Backtest กลยุทธ์โมเมนตัม (กติกา prereg)
//  2) Naive baseline (Top-N โดย ret20, สภาพคล่องเดียวกัน)
//  3) Time-half split + bootstrap CI ของ (กลยุทธ์ − naive)
//  4) Cost sensitivity grid
//  5) Meta-model ผ่าน CPCV
//  → เช็กลิสต์ 7 เกณฑ์ + คะแนนความพร้อม + VERDICT GO / WEAK / NO-GO
// ============================================================

import { db } from "@/lib/db"
import { emitEvent } from "./events"
import { TH_STRATEGY } from "@/lib/config/thai"
import { buildNaiveSignals, buildMomentumSignals, runBacktest } from "@/lib/momentum/engine"
import type { BacktestStats } from "@/lib/momentum/contracts"
import { buildMetaPanel } from "./features"
import { MIN_PANEL_ROWS, runCpcv, type CpcvParams } from "./cpcv"
import { mulberry32 } from "./logistic"
import { getPrereg, paramsHash, type TrialParams } from "./prereg"

export interface CriterionResult {
  key: string
  label: string
  pass: boolean
  detail: string
}

export interface CpcvSummary {
  paths: number
  panelN: number
  meanHit: number
  stdHit: number
  meanAuc: number
  pctAbove: number
  avgLong: number
  avgShort: number
  avgGap: number
  hitGate: number
  pooledHit: number
  pooledAuc: number
}

export interface TrialResult {
  id?: number
  paramsHash: string
  params: TrialParams
  frozen: boolean
  strategy: BacktestStats
  naive: BacktestStats
  halves: { first: number; second: number } // mean daily ret % ของแต่ละครึ่ง
  bootstrap: { mean: number; low5: number; high95: number } // diff daily mean %
  costGrid: { costBps: number; cagr: number; totalRet: number }[]
  meta: CpcvSummary
  criteria: CriterionResult[]
  passed: number
  total: number
  verdict: "GO" | "WEAK" | "NO-GO"
  tookMs: number
}

// ข้อมูลไม่พอให้ตัดสิน — route แปลงเป็น 400 (ไม่บันทึก verdict ที่ไม่ได้มาจากการทดสอบจริง)
export class InsufficientDataError extends Error {}

// เปอร์เซ็นไทล์จาก array (linear interp ไม่จำเป็น — ใช้ nearest rank)
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[idx]
}

export async function runProfitEngine(overrides?: Partial<TrialParams>): Promise<TrialResult> {
  const t0 = Date.now()
  const prereg = await getPrereg()
  let params: TrialParams
  let frozen: boolean
  if (prereg) {
    params = prereg.params
    frozen = true
  } else {
    const d = (await import("./prereg")).DEFAULT_TRIAL_PARAMS
    params = { ...d, ...(overrides ?? {}), costsGrid: overrides?.costsGrid ?? [...d.costsGrid] }
    frozen = false
  }
  const hash = paramsHash(params)

  // ---- 1) กลยุทธ์ + naive ----
  // slippage คงที่ตาม config ไทย (cost grid กวาดเฉพาะ costBps — slipBps ไม่เปลี่ยน)
  const btParams = {
    k: params.k,
    hold: params.hold,
    stopPct: params.stopPct,
    maxPos: params.maxPos,
    costBps: params.costBps,
    slipBps: TH_STRATEGY.slipBpsBase,
  }
  const [strategySignals, naiveSignals] = await Promise.all([
    buildMomentumSignals(params.k),
    buildNaiveSignals(params.maxPos),
  ])
  // เงื่อนไขเดียวกับ /api/backtest — DB ว่าง/ข้อมูล < 2 วัน ไม่มีอะไรให้ทดสอบ
  // (เดิมได้ CAGR NaN → null, bootstrap null → หน้าห้องวิจัยพัง และบันทึก NO-GO ที่ MaxDD 0% "ผ่าน")
  if (strategySignals.size < 2) {
    throw new InsufficientDataError("ข้อมูลราคาไม่พอสำหรับ Profit Engine (ต้องมีอย่างน้อย 2 วัน) — นำเข้าข้อมูลก่อน")
  }
  const [strategy, naive] = await Promise.all([
    runBacktest(btParams, strategySignals),
    runBacktest(btParams, naiveSignals),
  ])

  // ---- 2) time-half split (mean daily return %) ----
  const dr = strategy.dailyRet
  const half = Math.floor(dr.length / 2)
  const meanPct = (arr: number[]) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) * 100 : 0)
  const halves = { first: meanPct(dr.slice(0, half)), second: meanPct(dr.slice(half)) }

  // ---- 3) bootstrap CI ของ diff (strategy − naive) รายวัน ----
  const nDays = Math.min(dr.length, naive.dailyRet.length)
  const diff: number[] = []
  for (let i = 0; i < nDays; i++) diff.push(dr[i] - naive.dailyRet[i])
  const rng = mulberry32(params.seed)
  const bootMeans: number[] = []
  for (let b = 0; b < params.bootN; b++) {
    let s = 0
    for (let i = 0; i < nDays; i++) s += diff[Math.floor(rng() * nDays)]
    bootMeans.push(s / nDays)
  }
  bootMeans.sort((a, b) => a - b)
  const diffMean = diff.reduce((a, b) => a + b, 0) / (diff.length || 1)
  const bootstrap = {
    mean: diffMean * 100,
    low5: percentile(bootMeans, 0.05) * 100,
    high95: percentile(bootMeans, 0.95) * 100,
  }

  // ---- 4) cost sensitivity ----
  const costGrid: { costBps: number; cagr: number; totalRet: number }[] = []
  for (const c of params.costsGrid) {
    if (c === params.costBps) {
      costGrid.push({ costBps: c, cagr: strategy.stats.cagr, totalRet: strategy.stats.totalRet })
      continue
    }
    const r = await runBacktest({ ...btParams, costBps: c }, strategySignals)
    costGrid.push({ costBps: c, cagr: r.stats.cagr, totalRet: r.stats.totalRet })
  }

  // ---- 5) meta-model ผ่าน CPCV ----
  const panel = await buildMetaPanel(params.hold)
  const cpcvParams: CpcvParams = {
    nGroups: params.nGroups,
    nTestGroups: params.nTestGroups,
    purge: params.purge,
    embargo: 2,
    hitGate: params.hitGate,
  }
  const cpcv = runCpcv(panel, cpcvParams)
  const meta: CpcvSummary = {
    paths: cpcv.paths,
    panelN: cpcv.panelN,
    meanHit: cpcv.meanHit,
    stdHit: cpcv.stdHit,
    meanAuc: cpcv.meanAuc,
    pctAbove: cpcv.pctAbove,
    avgLong: cpcv.avgLong,
    avgShort: cpcv.avgShort,
    avgGap: cpcv.avgGap,
    hitGate: params.hitGate,
    pooledHit: cpcv.pooledHit,
    pooledAuc: cpcv.pooledAuc,
  }

  // ---- 6) เช็กลิสต์ 7 เกณฑ์ ----
  const fmt = (x: number, d = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`
  const edge = strategy.stats.cagr - naive.stats.cagr
  const criteria: CriterionResult[] = [
    {
      key: "edge",
      label: "มี edge เหนือ naive (CAGR หลังต้นทุน)",
      pass: edge > 0,
      detail: `กลยุทธ์ ${fmt(strategy.stats.cagr)} vs naive ${fmt(naive.stats.cagr)} (ต่าง ${fmt(edge)})`,
    },
    {
      key: "cagr",
      label: "CAGR หลังต้นทุน > 0",
      pass: strategy.stats.cagr > 0,
      detail: `CAGR ${fmt(strategy.stats.cagr)}`,
    },
    {
      key: "maxdd",
      label: "MaxDD ดีกว่า −25%",
      pass: strategy.stats.maxDD > -0.25,
      detail: `MaxDD ${(strategy.stats.maxDD * 100).toFixed(1)}%`,
    },
    {
      key: "sharpe",
      label: "Sharpe > 0.6",
      pass: strategy.stats.sharpe > 0.6,
      detail: `Sharpe ${strategy.stats.sharpe.toFixed(2)}`,
    },
    {
      key: "trades",
      label: "จำนวนเทรด ≥ 100",
      pass: strategy.stats.trades >= 100,
      detail: `${strategy.stats.trades} เทรด`,
    },
    {
      key: "winrate",
      label: "Winrate > 48%",
      pass: strategy.stats.winRate > 0.48,
      detail: `Winrate ${(strategy.stats.winRate * 100).toFixed(1)}%`,
    },
    {
      key: "meta",
      label: "Meta-model ผ่าน CPCV (hit, เสถียร, มี economic edge)",
      pass: cpcv.metaPass && cpcv.paths > 0,
      detail:
        cpcv.paths === 0
          ? cpcv.panelN < MIN_PANEL_ROWS
            ? `ข้อมูลไม่พอสร้าง panel (${cpcv.panelN} แถว · ต้อง ≥ ${MIN_PANEL_ROWS})`
            : `CPCV ไม่มี path ที่ใช้ได้ (panel ${cpcv.panelN} แถว · ข้าม ${cpcv.skipped} path)`
          : `hit ${(cpcv.meanHit * 100).toFixed(1)}% · paths>${(params.hitGate * 100).toFixed(0)}%: ${(cpcv.pctAbove * 100).toFixed(0)}% · L−S gap ${cpcv.avgGap.toFixed(2)}%`,
    },
  ]
  const passed = criteria.filter((c) => c.pass).length

  // ---- 7) verdict + bootstrap คุณภาพเชิงสถิติ ----
  const statOk = bootstrap.low5 > 0
  let verdict: "GO" | "WEAK" | "NO-GO"
  if (passed >= 5 && statOk) verdict = "GO"
  else if (passed >= 5) verdict = "WEAK"
  else if (passed === 4) verdict = "WEAK"
  else verdict = "NO-GO"

  const notes: string[] = []
  if (!statOk)
    notes.push("Bootstrap CI ต่ำกว่า 0 — ความได้เปรียบเทียบกับ naive ยังไม่แน่นพอทางสถิติ")
  if (halves.first <= 0 || halves.second <= 0)
    notes.push("ครึ่งเวลาใดครึ่งเวลาหนึ่งติดลบ — ความเสถียรข้ามช่วงเวลาต่ำ")

  const result: TrialResult = {
    paramsHash: hash,
    params,
    frozen,
    strategy: strategy.stats,
    naive: naive.stats,
    halves,
    bootstrap,
    costGrid,
    meta,
    criteria,
    passed,
    total: criteria.length,
    verdict,
    tookMs: Date.now() - t0,
  }

  // ---- บันทึก + event ----
  const run = await db.researchRun.create({
    data: {
      kind: "trial",
      paramsHash: hash,
      params: JSON.stringify(params),
      result: JSON.stringify({
        strategy: strategy.stats,
        naive: naive.stats,
        halves,
        bootstrap,
        costGrid,
        meta,
        criteria,
        passed,
        total: criteria.length,
        notes,
      }),
      verdict,
    },
  })
  result.id = run.id
  await emitEvent("research", "system", {
    kind: "trial",
    runId: run.id,
    verdict,
    passed: `${passed}/${criteria.length}`,
    cagr: strategy.stats.cagr,
    frozen,
  })
  return result
}
