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
//
// ผลเป็น deterministic (seeded rng) → ขึ้นกับ "ข้อมูล × พารามิเตอร์" เท่านั้น: ใช้ purgedPermutationImportanceCached()
// เพื่อคำนวณครั้งเดียวต่อชุดข้อมูล (demo 240 หุ้น × 520 วัน ≈ 4.5–6 วินาทีต่อครั้ง ถ้าไม่ cache)
// ============================================================

import { TH_STRATEGY } from "@/lib/config/thai"
import { db } from "@/lib/db"
import { dataFingerprint } from "@/lib/momentum/core"
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

// ============================================================
// cache ในโปรเซส — คำนวณครั้งเดียวต่อ (ชุดข้อมูล × พารามิเตอร์)
// key ข้อมูล = dataFingerprint() (จำนวนแถว · วันล่าสุด · id ล่าสุดของ RawDaily · data_version ที่ผู้เขียนทุกทางตรา
//              — ingest/seed/ล้าง demo/cron จาก process อื่น) + จำนวนแถว/id ล่าสุดของ Snapshot (n_tf/streak มาจากโผ;
//              rebuild โผลบแล้วสร้างแถวใหม่ id เพิ่มเสมอ)
// ข้อมูลเปลี่ยน → ทิ้งผลเก่าทั้งหมด · เก็บเป็น Promise → request พร้อมกันใช้การคำนวณเดียวกัน (single-flight)
// คำนวณล้มเหลว → ลบ entry ทิ้ง (ไม่ cache error) · คืนสำเนาเสมอ ผู้เรียกแก้ object แล้ว cache ไม่เพี้ยน
// ============================================================

const CACHE_MAX_ENTRIES = 32 // พารามิเตอร์ต่างกันได้ ≤ 32 ชุดต่อชุดข้อมูล (เกินแล้วทิ้งตัวที่ใช้ล่าสุดนานที่สุด)

export type ImportanceCacheStatus = "hit" | "miss"

interface ImportanceCacheState {
  dataKey: string
  entries: Map<string, Promise<ImportanceResponse>>
}

let _cache: ImportanceCacheState = { dataKey: "", entries: new Map() }
const _stats = { hits: 0, misses: 0, computations: 0 }

/** ตัวนับของ cache (สำหรับ test / ตรวจสุขภาพ) — computations = จำนวนครั้งที่คำนวณจริง */
export function importanceCacheStats(): { hits: number; misses: number; computations: number; size: number } {
  return { ..._stats, size: _cache.entries.size }
}

/** ล้าง cache + ตัวนับ (ใช้ใน test) */
export function clearImportanceCache(): void {
  _cache = { dataKey: "", entries: new Map() }
  _stats.hits = 0
  _stats.misses = 0
  _stats.computations = 0
}

/** ค่าพารามิเตอร์หลังใส่ default — ค่าที่ให้ผลเท่ากันต้องได้ key เดียวกัน */
function normalizeOptions(opts: ImportanceOptions): Required<ImportanceOptions> {
  return {
    hold: opts.hold ?? TH_STRATEGY.hold,
    nGroups: opts.nGroups ?? 6,
    nTestGroups: opts.nTestGroups ?? 2,
    nRepeats: Math.max(1, Math.round(opts.nRepeats ?? 3)),
    seed: opts.seed ?? 42,
  }
}

/** ลายนิ้วมือของข้อมูลทั้งหมดที่ importance อ่าน (RawDaily + Snapshot) — query นับ/ค่าสูงสุดเท่านั้น (ไม่กี่ ms) */
export async function importanceDataKey(): Promise<string> {
  const [fp, snap] = await Promise.all([
    dataFingerprint(),
    db.snapshot.aggregate({ _count: { _all: true }, _max: { id: true } }),
  ])
  return `${fp}|${snap._count._all}:${snap._max.id ?? 0}`
}

/**
 * purgedPermutationImportance แบบมี cache — ผลเหมือนเรียกตรงทุกไบต์ (รวม tookMs = เวลาที่ใช้คำนวณจริงครั้งนั้น)
 * cache = "hit" ถ้าได้จากผลที่คำนวณไว้แล้ว (หรือกำลังคำนวณอยู่) สำหรับชุดข้อมูลปัจจุบัน
 */
export async function purgedPermutationImportanceCached(
  opts: ImportanceOptions = {}
): Promise<{ result: ImportanceResponse; cache: ImportanceCacheStatus }> {
  const o = normalizeOptions(opts)
  const dataKey = await importanceDataKey()
  if (_cache.dataKey !== dataKey) _cache = { dataKey, entries: new Map() }
  const state = _cache
  const paramKey = `${o.hold}|${o.nGroups}|${o.nTestGroups}|${o.nRepeats}|${o.seed}`

  const pending = state.entries.get(paramKey)
  if (pending) {
    _stats.hits++
    state.entries.delete(paramKey) // LRU: ย้ายไปท้ายสุด
    state.entries.set(paramKey, pending)
    return { result: structuredClone(await pending), cache: "hit" }
  }

  _stats.misses++
  _stats.computations++
  const job = purgedPermutationImportance(o)
  state.entries.set(paramKey, job)
  while (state.entries.size > CACHE_MAX_ENTRIES) {
    const oldest = state.entries.keys().next().value
    if (oldest === undefined) break
    state.entries.delete(oldest)
  }
  try {
    return { result: structuredClone(await job), cache: "miss" }
  } catch (e) {
    if (state.entries.get(paramKey) === job) state.entries.delete(paramKey)
    throw e
  }
}
