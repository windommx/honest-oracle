// ============================================================
// bun run evidence:real -- [--out data/reports] [--min-days 250] [--hold 10] [--dry-run] [--no-emit] [--json]
//
// รายงานหลักฐานบน DB ปัจจุบัน — "อ่านอย่างเดียว" ต่อชั้นวิจัย (ไม่เขียน ResearchRun / config_th / signals_policy):
//   1) Evidence Board H1–H4 (ฟังก์ชัน pure ของ thai-fit: scan · reversal · tom — ไม่ auto-apply config)
//   2) Signals IC harness (crossIC / timingCorr + เกณฑ์ PROMOTE เดียวกับ /api/signals/ic — ไม่บันทึก policy)
//   3) Walk-forward (expanding window): เลือก k/hold จาก in-sample เท่านั้น แล้ววัดช่วงถัดไป + config ลงทะเบียนล่วงหน้า
// → data/reports/evidence-YYYY-MM-DD.json พร้อม data fingerprint · params hash · ป้ายที่มาข้อมูล · verdict
//   และ EventLog "evidence_real" (hash ของรายงาน — พิสูจน์ได้ว่ารายงานมีอยู่ ณ เวลานั้น)
//
// ความซื่อตรง: ติดป้าย REAL ได้เฉพาะเมื่อข้อมูลจริงล้วนจากแหล่งที่รู้จัก และประวัติ ≥ --min-days วันซื้อขาย
// ไม่งั้นทุก verdict ถูกตีป้าย NOT_REAL (countsAsEvidence: false) — ตัวเลขยังแสดง แต่ห้ามอ้างเป็นหลักฐาน
// exit: 0 เขียนรายงานแล้ว (ไม่ว่าป้ายใด) · 1 error · 2 argument ผิด · 3 ไม่มีข้อมูลตลาด
// ============================================================

import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { db } from "@/lib/db"
import { closePivot, dataFingerprint } from "@/lib/momentum/core"
import { TH_STRATEGY } from "@/lib/config/thai"
import { classifyProvenance } from "@/lib/flagship/funnel"
import { emitEvent } from "@/lib/research/events"
import { getPrereg } from "@/lib/research/prereg"
import { COST_RT, FLOW_MAX, FORMS_TH, HOLDS_LONG, HOLDS_SHORT, loadPivots, MIN_CS_N, reversal, scan, TOM_T, tom, TURN_MIN, Z_IN } from "@/lib/research/thai-fit"
import { buildPanel, crossIC, promote, timingCorr } from "@/lib/momentum/signals/engine"
import { dataKey, DEFAULT_W, loadAll, loadSectorOf } from "@/lib/momentum/signals/io"
import { buildMomentumSignals, runBacktest } from "@/lib/momentum/engine"
import { bangkokClock } from "@/lib/feed/calendar"
import { dataEpoch, epochSourceIds, evidenceDataLabel, provenanceFor } from "@/lib/feed/provenance"
import { evidenceVerdict, MIN_HISTORY_DAYS, walkForward } from "@/lib/track/evidence"

const sha = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex")

let values: Record<string, string | boolean | undefined>
try {
  values = parseArgs({
    args: process.argv.slice(2),
    options: {
      out: { type: "string", default: path.join("data", "reports") },
      "min-days": { type: "string", default: String(MIN_HISTORY_DAYS) },
      hold: { type: "string", default: "10" },
      "dry-run": { type: "boolean", default: false },
      "no-emit": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  }).values
} catch (e) {
  console.error(`❌ ${(e as Error).message}`)
  process.exit(2)
}
const USAGE = "ใช้: bun run evidence:real -- [--out data/reports] [--min-days 250] [--hold 10] [--dry-run] [--no-emit] [--json]"
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
const minDays = Number(values["min-days"])
const hold = Number(values.hold)
if (!Number.isInteger(minDays) || minDays < 20) {
  console.error(`❌ --min-days ต้องเป็นจำนวนเต็ม ≥ 20\n${USAGE}`)
  process.exit(2)
}
if (!Number.isInteger(hold) || hold < 5 || hold > 60) {
  console.error(`❌ --hold ต้องเป็นจำนวนเต็ม 5–60 (เหมือน /api/signals/ic)\n${USAGE}`)
  process.exit(2)
}
const json = values.json === true
const say = (s: string) => {
  if (!json) console.log(s)
}

const t0 = Date.now()
const rawRows = await db.rawDaily.count()
if (rawRows === 0) {
  console.error("❌ ไม่มีข้อมูลตลาดใน DB — นำเข้าข้อมูลก่อน (bun run fetch:th -- --range 5y --replace-demo)")
  process.exit(3)
}

// ---------- ที่มาข้อมูล + ความยาวประวัติ ----------
const provEvents = await db.eventLog.findMany({ where: { kind: { in: ["seed", "ingest"] } }, select: { id: true, kind: true, payload: true, ts: true }, orderBy: { id: "asc" } })
const prov = classifyProvenance(provEvents, rawRows)
const epoch = dataEpoch(provEvents)
const dataLabel = evidenceDataLabel(prov, epochSourceIds(epoch))
const pivot = await closePivot()
const tradingDays = pivot.dates.length
const label = evidenceVerdict({ dataLabel, tradingDays, minDays })
const [fingerprint, key, prereg] = await Promise.all([dataFingerprint(), dataKey(), getPrereg()])
say(`🔬 Evidence (real-data protocol) · ${tradingDays} วันซื้อขาย ${pivot.dates[0]} → ${pivot.dates[tradingDays - 1]} · ${pivot.symbols.length} หุ้น`)
say(`   ที่มาข้อมูล: ${prov.dataLabel} → ป้ายหลักฐาน ${label.label}${label.reasons.length ? ` (${label.reasons.join(" · ")})` : ""}`)

// ---------- 1) Evidence Board H1–H4 (pure — ไม่ persist ไม่ apply) ----------
const piv = await loadPivots()
const scanRes = scan(piv)
const h2 = reversal(piv)
const h3 = tom(piv)
// params ชุดเดียวกับที่ runThaiFit('all') freeze ลง ResearchRun (ลำดับ key ต้องตรงกันเพื่อให้ hash เท่ากัน)
const thaiFitParams = { mode: "all", rules: 2, forms: [...FORMS_TH], holds: [...HOLDS_SHORT], holdsLong: [...HOLDS_LONG], minCsN: MIN_CS_N, cost: COST_RT, zIn: Z_IN, turnMin: TURN_MIN, flowMax: FLOW_MAX, tomT: TOM_T }
const board = {
  paramsHash: sha(thaiFitParams),
  params: thaiFitParams,
  measuredCells: scanRes.cells.filter((c) => c.n > 0).length,
  h1: { pass: scanRes.h1Pass, best: scanRes.best },
  h2,
  h3,
  h4: { pass: scanRes.h4Pass, longCells: scanRes.longCells },
  verdicts: `H1:${scanRes.h1Pass ? "PASS" : "FAIL"} H2:${h2.pass ? "PASS" : "FAIL"} H3:${h3.pass ? "PASS" : "FAIL"} H4:${scanRes.h4Pass ? "PASS" : "FAIL"}`,
  countsAsEvidence: label.realEvidence,
}
say(`   Evidence Board: ${board.verdicts} (${board.measuredCells} cell วัดได้)`)

// ---------- 2) Signals IC harness (ไม่บันทึก policy) ----------
const SIGNS = { mom: 1, mfd: -1, sec: 1, vol: -1 } as const
const { rows, snap, crossZ } = await loadAll()
const panel = buildPanel(rows, snap, await loadSectorOf(), crossZ, DEFAULT_W)
const ic = {
  mom: crossIC(panel, (s) => s.mom, hold, rows),
  mfd: crossIC(panel, (s) => s.mfd, hold, rows),
  sec: crossIC(panel, (s) => s.rotZ, hold, rows),
  vol: crossIC(panel, (s) => s.symVolPct, hold, rows),
}
const timing = {
  breadthZ: timingCorr(panel, (m) => m.breadthZ, hold, rows),
  crossZ: timingCorr(panel, (m) => m.crossZ, hold, rows),
  volPct: timingCorr(panel, (m) => -m.volPct, hold, rows),
  overlapZ: timingCorr(panel, (m) => m.overlapZ, hold, rows),
}
const icVerdict = (k: keyof typeof ic) => {
  const r = ic[k]
  const sign = SIGNS[k]
  if (promote(r, sign)) return "PROMOTE"
  if (Math.abs(r.ICIR) > 0.25 && r.n >= 120 && Math.sign(r.meanIC) !== sign) return "FLIP-CHECK"
  return "KILL"
}
const icVerdicts = Object.fromEntries((Object.keys(ic) as (keyof typeof ic)[]).map((k) => [k, icVerdict(k)]))
const timingVerdicts = Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.abs(v.corr) > 0.08 && v.n >= 200 ? "USE" : "KILL"]))
const icParams = { hold, signs: SIGNS, gates: { minAbsIC: 0.02, minAbsICIR: 0.25, minN: 120 }, timingGate: { minAbsCorr: 0.08, minN: 200 }, weights: DEFAULT_W }
const r4 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null)
const signalsIc = {
  paramsHash: sha(icParams),
  params: icParams,
  ic: Object.fromEntries(Object.entries(ic).map(([k, v]) => [k, { meanIC: r4(v.meanIC), ICIR: r4(v.ICIR), t: r4(v.t), n: v.n, hit: r4(v.hit) }])),
  timing: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, { corr: r4(v.corr), n: v.n, t: r4(v.t) }])),
  verdicts: icVerdicts,
  timingVerdicts,
  promoted: Object.entries(icVerdicts).filter(([, v]) => v === "PROMOTE").map(([k]) => k),
  countsAsEvidence: label.realEvidence,
}
say(`   Signals IC (hold ${hold}): ${Object.entries(icVerdicts).map(([k, v]) => `${k}=${v}`).join(" ")}`)

// ---------- 3) Walk-forward ----------
const grid: { k: number; hold: number }[] = []
for (const k of [2, 3, 4]) for (const h of [5, 8, 12]) grid.push({ k, hold: h })
const preregKey = prereg ? `k${prereg.params.k}-h${prereg.params.hold}` : `k${TH_STRATEGY.k}-h${TH_STRATEGY.hold}`
const bt = { stopPct: prereg?.params.stopPct ?? TH_STRATEGY.stopPct, maxPos: prereg?.params.maxPos ?? TH_STRATEGY.maxPos, costBps: prereg?.params.costBps ?? TH_STRATEGY.costBps, slipBps: TH_STRATEGY.slipBpsBase }
if (prereg && !grid.some((g) => `k${g.k}-h${g.hold}` === preregKey)) grid.push({ k: prereg.params.k, hold: prereg.params.hold })
const sigCache = new Map<number, Map<string, Set<string>>>()
const configs: { key: string; rets: number[] }[] = []
for (const g of grid) {
  if (!sigCache.has(g.k)) sigCache.set(g.k, await buildMomentumSignals(g.k))
  const res = await runBacktest({ k: g.k, hold: g.hold, ...bt }, sigCache.get(g.k) as Map<string, Set<string>>)
  configs.push({ key: `k${g.k}-h${g.hold}`, rets: res.dailyRet })
}
const bench: number[] = []
for (let i = 1; i < pivot.dates.length; i++) {
  let s = 0
  let n = 0
  for (let j = 0; j < pivot.symbols.length; j++) {
    const a = pivot.px[i - 1][j]
    const b = pivot.px[i][j]
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0) {
      s += b / a - 1
      n++
    }
  }
  bench.push(n > 0 ? s / n : 0)
}
const wfParams = { grid, ...bt, selection: "max in-sample Sharpe", window: "expanding", warmup: 60, folds: 5, preregKey, preregFrozen: !!prereg }
const wf = walkForward({ dates: pivot.dates.slice(1), configs, bench, preregKey, warmup: 60, nFolds: 5, minDays })
const walk = { paramsHash: sha(wfParams), params: wfParams, ...wf, countsAsEvidence: label.realEvidence && wf.summary.sufficient }
say(`   Walk-forward: ${wf.summary.verdict} (OOS Sharpe มัธยฐาน ${wf.summary.medianOosSharpe ?? "—"} · เสื่อม ${wf.summary.degradationPct ?? "—"}%)`)

// ---------- รายงาน ----------
const now = new Date()
const runDate = bangkokClock(now).date
const honesty = [
  "รายงานนี้ไม่เขียน ResearchRun / config_th / signals_policy และไม่เปลี่ยนการตั้งค่าที่ระบบเทรดใช้",
  "ผล backtest/IC ทั้งหมดเป็น in-sample ของข้อมูลที่มี — หลักฐานจริงคือ live track record (GET /api/track-record) ที่สะสมต่อไป",
  "benchmark ของ walk-forward = equal-weight ทุกหุ้นที่มีราคา (ไม่ใช่ดัชนี SET)",
  ...(label.realEvidence ? [] : ["ป้าย NOT_REAL: ห้ามอ้างตัวเลขในรายงานนี้เป็นหลักฐานของ edge บนตลาดจริง"]),
]
const body = {
  v: 1,
  kind: "evidence_real",
  generatedAt: now.toISOString(),
  runDate,
  database: (process.env.DATABASE_URL ?? "").replace(/^file:/, ""),
  dataFingerprint: fingerprint,
  dataKey: key,
  provenance: {
    flagshipLabel: prov.dataLabel,
    evidenceLabel: dataLabel,
    isSynthetic: prov.isSynthetic,
    epochStart: epoch.startTs,
    epochKind: epoch.startKind,
    sources: epoch.sources.map((s) => ({ source: s.source, known: s.known, official: provenanceFor(s.source).official, commercialUse: s.commercialUse, rows: s.rows, lastLatestDate: s.lastLatestDate })),
  },
  history: { tradingDays, firstDate: pivot.dates[0] ?? null, lastDate: pivot.dates[tradingDays - 1] ?? null, symbols: pivot.symbols.length, minDays, sufficient: tradingDays >= minDays },
  label: label.label,
  realEvidence: label.realEvidence,
  reasons: label.reasons,
  prereg: prereg ? { frozen: true, hash: prereg.hash, frozenAt: prereg.frozenAt, params: prereg.params } : { frozen: false, hash: null, frozenAt: null, params: null },
  evidenceBoard: board,
  signalsIc,
  walkForward: walk,
  honesty,
  tookMs: Date.now() - t0,
}
const reportHash = sha(body)
const report = { ...body, reportHash }

let file: string | null = null
let emitted = false
if (!values["dry-run"]) {
  const outDir = String(values.out)
  await fs.mkdir(outDir, { recursive: true })
  file = path.join(outDir, `evidence-${runDate}.json`)
  await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n", "utf8")
  if (!values["no-emit"]) {
    await emitEvent("evidence_real", "system", {
      reportHash,
      file: path.basename(file),
      label: label.label,
      realEvidence: label.realEvidence,
      evidenceLabel: dataLabel,
      dataFingerprint: fingerprint,
      tradingDays,
      paramsHash: { evidenceBoard: board.paramsHash, signalsIc: signalsIc.paramsHash, walkForward: walk.paramsHash },
      verdicts: { board: board.verdicts, promoted: signalsIc.promoted, walkForward: wf.summary.verdict },
    })
    emitted = true
  }
}
if (json) console.log(JSON.stringify(report))
else {
  say(`${label.realEvidence ? "✅ REAL" : "⚠️  NOT_REAL"} · reportHash ${reportHash.slice(0, 16)}… · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  if (file) say(`   📝 ${file}${emitted ? " · EventLog evidence_real" : ""}`)
  else say("   (dry-run — ไม่เขียนไฟล์/ไม่ emit)")
}
process.exit(0)
