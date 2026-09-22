// ============================================================
// Purged Permutation Importance — วัดความสำคัญของฟีเจอร์ meta
// (ตามแนว López de Prado: permutation importance บน CPCV paths)
//
// ขั้นตอน:
// 1) สร้าง panel ด้วย buildMetaPanel(hold)
// 2) แบ่งข้อมูลด้วย cpcvSplits (purge = hold, embargo = round(hold/2)) ทุก combination
// 3) ต่อ split: standardize ด้วยสถิติ train เท่านั้น → เทรน logistic (ตั้งค่าเดียวกับ CPCV)
//    → baseline: predict test → AUC + hit@0.5
// 4) ต่อฟีเจอร์ j × nRepeats รอบ: permute คอลัมน์ j ของ test (Fisher-Yates, seeded rng)
//    → AUC_perm → drop = AUC_base − AUC_perm
// 5) รวม mean/std ของ drop ข้ามทุก (split × repeat) → ฟีเจอร์ที่ permute แล้ว AUC ตกมาก = สำคัญ
// ============================================================

import { TH_STRATEGY } from "@/lib/config/thai"
import type { ImportanceResponse, ImportanceRow } from "@/lib/momentum/contracts"
import { buildMetaPanel, FEATURE_INFO } from "./features"
import { cpcvSplits } from "./cpcv"
import { auc, fitLogistic, mulberry32, predictProba } from "./logistic"

const MAX_TRAIN_ROWS = 12000 // เท่ากับ CPCV — subsample ด้วย stride แบบ deterministic
const EPOCHS = 250 // เท่ากับ CPCV
const MIN_TRAIN_ROWS = 80 // split ที่ train น้อยกว่านี้ข้าม
const MIN_TEST_ROWS = 20 // split ที่ test น้อยกว่านี้ข้าม

export interface ImportanceOptions {
  hold?: number // horizon ของ label (default TH_STRATEGY.hold = 8)
  nGroups?: number // CPCV groups (default 6)
  nTestGroups?: number // test groups ต่อ path (default 2)
  nRepeats?: number // จำนวนรอบ permutation ต่อฟีเจอร์ต่อ split (default 3)
  seed?: number // seed ของ RNG (default 42 — reproducible)
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6
const r4 = (x: number) => Math.round(x * 1e4) / 1e4

export async function purgedPermutationImportance(
  opts: ImportanceOptions = {}
): Promise<ImportanceResponse> {
  const t0 = Date.now()
  const hold = opts.hold ?? TH_STRATEGY.hold
  const nGroups = opts.nGroups ?? 6
  const nTestGroups = opts.nTestGroups ?? 2
  const nRepeats = Math.max(1, Math.round(opts.nRepeats ?? 3))
  const seed = opts.seed ?? 42
  const F = FEATURE_INFO.length
  const purge = hold // purge = horizon (label ซ้อนทับ forward window พอดี)
  const embargo = Math.round(hold / 2)

  const panel = await buildMetaPanel(hold)
  const rows = panel.rows
  const empty: ImportanceResponse = {
    rows: [],
    baseHit: 0,
    baseAuc: 0.5,
    panelN: rows.length,
    paths: 0,
    tookMs: Date.now() - t0,
  }
  if (rows.length < 200) return empty

  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const splits = cpcvSplits(dates, nGroups, nTestGroups, purge, embargo)

  const rng = mulberry32(seed)

  // accumulator ต่อฟีเจอร์: ค่า drop ทุกตัวอย่าง (split × repeat)
  const drops: number[][] = Array.from({ length: F }, () => [])
  let baseAucSum = 0
  let baseHitSum = 0
  let usable = 0

  for (const split of splits) {
    const testDates = new Set(split.test)
    const trainDates = new Set(split.train)
    const trainRows = rows.filter((r) => trainDates.has(r.date))
    const testRows = rows.filter((r) => testDates.has(r.date))
    if (trainRows.length < MIN_TRAIN_ROWS || testRows.length < MIN_TEST_ROWS) continue

    // subsample train ถ้าใหญ่ไป (deterministic stride — กติกาเดียวกับ CPCV)
    let trainUse = trainRows
    if (trainRows.length > MAX_TRAIN_ROWS) {
      const stride = Math.ceil(trainRows.length / MAX_TRAIN_ROWS)
      trainUse = trainRows.filter((_, idx) => idx % stride === 0)
    }

    // standardize ด้วยสถิติ train เท่านั้น (กัน leakage)
    const n = trainUse.length
    const mu = new Array<number>(F).fill(0)
    const sd = new Array<number>(F).fill(1)
    for (let j = 0; j < F; j++) {
      let s = 0
      for (let i = 0; i < n; i++) s += trainUse[i].x[j]
      mu[j] = s / n
      let v = 0
      for (let i = 0; i < n; i++) v += (trainUse[i].x[j] - mu[j]) ** 2
      sd[j] = Math.sqrt(v / n) + 1e-9
    }
    const Ztr = trainUse.map((r) => r.x.map((v, j) => (v - mu[j]) / sd[j]))
    const Zte = testRows.map((r) => r.x.map((v, j) => (v - mu[j]) / sd[j]))

    // trainer เดียวกับ CPCV (full-batch GD + L2)
    const model = fitLogistic(Ztr, trainUse.map((r) => r.y), { epochs: EPOCHS })

    const yTe = testRows.map((r) => r.y)
    const baseProbs = Zte.map((z) => predictProba(model, z))
    const baseAuc = auc(yTe, baseProbs)
    let hitCount = 0
    for (let i = 0; i < baseProbs.length; i++) {
      if ((baseProbs[i] > 0.5 ? 1 : 0) === yTe[i]) hitCount++
    }
    const baseHit = hitCount / baseProbs.length

    usable++
    baseAucSum += baseAuc
    baseHitSum += baseHit

    // permute ทีละคอลัมน์ (Fisher-Yates ด้วย seeded rng — deterministic)
    const m = Zte.length
    const col = new Array<number>(m)
    for (let j = 0; j < F; j++) {
      for (let rep = 0; rep < nRepeats; rep++) {
        for (let i = 0; i < m; i++) col[i] = Zte[i][j]
        for (let i = m - 1; i > 0; i--) {
          const k = Math.floor(rng() * (i + 1))
          const tmp = col[i]
          col[i] = col[k]
          col[k] = tmp
        }
        const permProbs = new Array<number>(m)
        for (let i = 0; i < m; i++) {
          const z = Zte[i]
          const zp = z.slice()
          zp[j] = col[i]
          permProbs[i] = predictProba(model, zp)
        }
        const aucPerm = auc(yTe, permProbs)
        drops[j].push(baseAuc - aucPerm)
      }
    }
  }

  if (usable === 0) return empty

  const result: ImportanceResponse = {
    rows: FEATURE_INFO.map((fi, j) => {
      const d = drops[j]
      const cnt = d.length || 1
      const mean = d.reduce((a, b) => a + b, 0) / cnt
      const std = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / cnt)
      const row: ImportanceRow = {
        feature: fi.key,
        th: fi.th,
        meanAucDrop: r6(mean),
        stdAucDrop: r6(std),
        nPaths: d.length,
      }
      return row
    }).sort((a, b) => b.meanAucDrop - a.meanAucDrop),
    baseHit: r4(baseHitSum / usable),
    baseAuc: r4(baseAucSum / usable),
    panelN: rows.length,
    paths: usable,
    tookMs: Date.now() - t0,
  }
  return result
}
