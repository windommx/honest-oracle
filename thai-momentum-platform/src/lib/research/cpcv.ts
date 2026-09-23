// ============================================================
// CPCV — Combinatorial Purged Cross-Validation (López de Prado)
// แบ่งวันที่เป็น N กลุ่มต่อเนื่อง → เลือก k กลุ่มเป็น test ทุก combination
// purge = ตัด train แถวที่อยู่ใกล้ test (label ซ้อนทับ horizon), embargo = กักหลัง test
// ได้ "การกระจายของผลลัพธ์" ไม่ใช่ตัวเลขเดียว
// ============================================================

import { auc, fitLogistic, predictProba } from "./logistic"
import type { MetaPanel } from "./features"

export interface CpcvParams {
  nGroups: number // จำนวนกลุ่ม (default 6)
  nTestGroups: number // จำนวนกลุ่มที่เป็น test ต่อ path (default 2)
  purge: number // จำนวน "วัน" ที่ตัดรอบ test (default = hold เช่น 8)
  embargo: number // ตัดหลัง test เพิ่ม (default = round(hold/2))
  hitGate: number // เกณฑ์ hit ที่ถือว่าผ่านต่อ path (default 0.55)
}

// defaults: purge = hold, embargo = round(hold/2) — hold ฐานของระบบ = 8 (TH_STRATEGY.hold)
export const DEFAULT_CPCV: CpcvParams = {
  nGroups: 6,
  nTestGroups: 2,
  purge: 8,
  embargo: 4,
  hitGate: 0.55,
}

export interface CpcvPathRow {
  path: number
  n: number // จำนวนแถว test
  hit: number // 0..1
  auc: number
  longRet: number // % เฉลี่ย top 30% ที่โมเดลชอบ
  shortRet: number // % เฉลี่ย bottom 30%
  gap: number
}

export interface CpcvResult {
  params: CpcvParams
  paths: number
  panelN: number
  meanHit: number
  stdHit: number
  meanAuc: number
  pctAbove: number // % paths ที่ hit > hitGate
  avgLong: number
  avgShort: number
  avgGap: number
  pooledHit: number
  pooledAuc: number
  pathRows: CpcvPathRow[]
  metaPass: boolean
  skipped: number // paths ที่ข้ามเพราะข้อมูลไม่พอ
}

const MAX_TRAIN_ROWS = 12000
const EPOCHS = 250
export const MIN_PANEL_ROWS = 200 // panel เล็กกว่านี้ไม่รัน CPCV (paths = 0)

function* combinations(n: number, k: number): Generator<number[]> {
  const c = Array.from({ length: k }, (_, i) => i)
  while (true) {
    yield [...c]
    let i = k - 1
    while (i >= 0 && c[i] === n - k + i) i--
    if (i < 0) return
    c[i]++
    for (let j = i + 1; j < k; j++) c[j] = c[j - 1] + 1
  }
}

// ---- CPCV split helper (ใช้ร่วมกับ Purged Permutation Importance) ----

export interface CpcvSplit {
  train: string[] // วันที่ที่อนุญาตให้เทรน (ตัด test + purge/embargo แล้ว)
  test: string[] // วันที่ของ test groups
}

// แบ่งวันที่เป็น nGroups กลุ่มต่อเนื่อง → ทุก combination ของ nTestGroups กลุ่มเป็น test
// พร้อม purge (label ซ้อนทับ horizon — ตัดทั้งก่อน test และหลัง test) และ embargo (กักเพิ่มหลัง test)
export function cpcvSplits(
  dates: string[],
  nGroups: number,
  nTestGroups: number,
  purge: number,
  embargo: number
): CpcvSplit[] {
  const G = nGroups
  const k = nTestGroups
  // จำนวนกลุ่มต้องเป็นจำนวนเต็ม — ค่าเศษทำให้ combinations() ไม่มีวันจบ (วนจน memory หมด)
  if (!Number.isInteger(G) || !Number.isInteger(k) || G < 2 || k < 1 || k > G || dates.length === 0) return []
  // purge/embargo นับเป็นจำนวนวัน (index) — ค่าเศษปัดขึ้น ไม่งั้น excluded[j] ถูกตั้งที่ index เศษ = ไม่ตัดอะไรเลย
  const pg = Math.max(0, Math.ceil(Number.isFinite(purge) ? purge : 0))
  const em = Math.max(0, Math.ceil(Number.isFinite(embargo) ? embargo : 0))
  // กลุ่มต่อเนื่อง (array_split style: กลุ่มแรกได้เพิ่ม 1 ถ้าหารไม่ลงตัว)
  const base = Math.floor(dates.length / G)
  const rem = dates.length % G
  const groupOfDate = new Map<string, number>()
  let cursor = 0
  for (let g = 0; g < G; g++) {
    const size = base + (g < rem ? 1 : 0)
    for (let j = 0; j < size; j++) groupOfDate.set(dates[cursor + j], g)
    cursor += size
  }
  const dateIndexOf = new Map<string, number>()
  dates.forEach((d, i) => dateIndexOf.set(d, i))

  const splits: CpcvSplit[] = []
  for (const combo of combinations(G, k)) {
    const testGroups = new Set(combo)
    // โซนต้องห้าม (purge/embargo) รอบทุกวัน test — แถว train ที่ label ซ้อนทับ horizon ต้องถูกตัด
    // ก่อน test: label ของ train [d, d+h] ยื่นเข้า test ได้ถ้า d ≥ t − purge
    // หลัง test: label ของ test [t, t+h] ทับ label ของ train ได้ถ้า d ≤ t + purge → ตัด purge แล้วกัก embargo ต่อ
    const excluded = new Array<boolean>(dates.length).fill(false)
    for (const [d, g] of groupOfDate) {
      if (!testGroups.has(g)) continue
      const t = dateIndexOf.get(d) as number
      for (let j = Math.max(0, t - pg); j <= Math.min(dates.length - 1, t + pg + em); j++) {
        excluded[j] = true
      }
    }
    const train: string[] = []
    const test: string[] = []
    for (let di = 0; di < dates.length; di++) {
      const g = groupOfDate.get(dates[di]) as number
      if (testGroups.has(g)) test.push(dates[di])
      else if (!excluded[di]) train.push(dates[di])
    }
    splits.push({ train, test })
  }
  return splits
}

export function runCpcv(panel: MetaPanel, params: CpcvParams): CpcvResult {
  const rows = panel.rows
  const p = { ...DEFAULT_CPCV, ...params }
  // purge/embargo ถ้าไม่ได้ระบุ → ผูกกับ horizon ของ panel: purge = hold, embargo = round(hold/2)
  const purge = Number.isFinite(p.purge) ? p.purge : Math.max(1, panel.hold)
  const embargo = Number.isFinite(p.embargo) ? p.embargo : Math.round(panel.hold / 2)
  const pEff = { ...p, purge, embargo }
  const empty: CpcvResult = {
    params: pEff, paths: 0, panelN: rows.length, meanHit: 0, stdHit: 0, meanAuc: 0,
    pctAbove: 0, avgLong: 0, avgShort: 0, avgGap: 0, pooledHit: 0, pooledAuc: 0,
    pathRows: [], metaPass: false, skipped: 0,
  }
  if (rows.length < MIN_PANEL_ROWS) return empty

  // วันที่ไม่ซ้ำ → แบ่งด้วย cpcvSplits (combinations + purge/embargo)
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const G = p.nGroups
  const k = p.nTestGroups
  if (G < 4 || G > 10 || k < 1 || k > Math.min(4, G - 2)) return empty
  const splits = cpcvSplits(dates, G, k, purge, embargo)

  const pathRows: CpcvPathRow[] = []
  const pooled = new Map<string, { ps: number[]; y: 0 | 1; fwd: number }>()
  let skipped = 0

  for (const split of splits) {
    const testDates = new Set(split.test)
    const trainDates = new Set(split.train)

    const train: { x: number[]; y: 0 | 1 }[] = []
    const test: { x: number[]; y: 0 | 1; fwd: number; key: string }[] = []
    for (const r of rows) {
      if (testDates.has(r.date)) {
        test.push({ x: r.x, y: r.y, fwd: r.fwd, key: `${r.date}|${r.symbol}` })
      } else if (trainDates.has(r.date)) {
        train.push({ x: r.x, y: r.y })
      }
    }
    if (train.length < 500 || test.length < 80) {
      skipped++
      continue
    }

    // subsample train ถ้าใหญ่ไป (deterministic: เว้นช่วง stride)
    let trainUse = train
    if (train.length > MAX_TRAIN_ROWS) {
      const stride = Math.ceil(train.length / MAX_TRAIN_ROWS)
      trainUse = train.filter((_, i) => i % stride === 0)
    }

    const X = trainUse.map((r) => r.x)
    const y = trainUse.map((r) => r.y)
    const model = fitLogistic(X, y, { epochs: EPOCHS })
    const probs = test.map((r) => predictProba(model, r.x))
    const ys = test.map((r) => r.y)

    const hits: number[] = probs.map((pr, i) => ((pr > 0.5 ? 1 : 0) === ys[i] ? 1 : 0))
    const hit = hits.reduce((a, b) => a + b, 0) / hits.length
    const a = auc(ys, probs)

    // economic: long = top 30% p, short = bottom 30%
    const order = probs.map((pr, i) => i).sort((a2, b2) => probs[b2] - probs[a2])
    const cut = Math.max(1, Math.floor(order.length * 0.3))
    let longSum = 0
    let shortSum = 0
    for (let i = 0; i < cut; i++) longSum += test[order[i]].fwd
    for (let i = order.length - cut; i < order.length; i++) shortSum += test[order[i]].fwd
    const longRet = longSum / cut
    const shortRet = shortSum / cut

    pathRows.push({ path: pathRows.length + 1, n: test.length, hit, auc: a, longRet, shortRet, gap: longRet - shortRet })

    // pool predictions (เฉลี่ย p ข้าม paths ต่อ (date,symbol))
    for (let i = 0; i < test.length; i++) {
      const cur = pooled.get(test[i].key)
      if (cur) cur.ps.push(probs[i])
      else pooled.set(test[i].key, { ps: [probs[i]], y: ys[i], fwd: test[i].fwd })
    }
  }

  if (pathRows.length === 0) return { ...empty, skipped }

  const meanHit = pathRows.reduce((a, b) => a + b.hit, 0) / pathRows.length
  const stdHit = Math.sqrt(pathRows.reduce((a, b) => a + (b.hit - meanHit) ** 2, 0) / pathRows.length)
  const meanAuc = pathRows.reduce((a, b) => a + b.auc, 0) / pathRows.length
  const pctAbove = pathRows.filter((r) => r.hit > p.hitGate).length / pathRows.length
  const avgLong = pathRows.reduce((a, b) => a + b.longRet, 0) / pathRows.length
  const avgShort = pathRows.reduce((a, b) => a + b.shortRet, 0) / pathRows.length
  const avgGap = pathRows.reduce((a, b) => a + b.gap, 0) / pathRows.length

  // pooled metrics
  let poolN = 0
  let poolHits = 0
  const poolY: number[] = []
  const poolP: number[] = []
  for (const [, v] of pooled) {
    const avg = v.ps.reduce((a, b) => a + b, 0) / v.ps.length
    poolY.push(v.y)
    poolP.push(avg)
    poolHits += (avg > 0.5 ? 1 : 0) === v.y ? 1 : 0
    poolN++
  }
  const pooledHit = poolN > 0 ? poolHits / poolN : 0
  const pooledAuc = poolN > 0 ? auc(poolY, poolP) : 0.5

  const metaPass = meanHit > p.hitGate && pctAbove >= 0.6 && avgGap > 0

  return {
    params: pEff,
    paths: pathRows.length,
    panelN: rows.length,
    meanHit,
    stdHit,
    meanAuc,
    pctAbove,
    avgLong,
    avgShort,
    avgGap,
    pooledHit,
    pooledAuc,
    pathRows,
    metaPass,
    skipped,
  }
}
