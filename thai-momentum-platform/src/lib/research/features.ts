// ============================================================
// Feature Factory + meta-labeling panel — Version 2 (Extended)
// ฟีเจอร์ 12 ตัวต่อ (วัน, หุ้น) ตามชุด "Version 2 – Extended" สำหรับตลาดไทย:
//   n_tf, streak, resid20, resid60, mom_quality20, dist_high,
//   val_surge, val_trend, repeat_z, breadth, mkt_vol20, ret20_pct
// label y = ผลตอบแทน forward `hold` วัน > 0 (ชนะ/แพ้) — primary signal คือ "ขา long"
// ใช้ได้ทั้งสร้าง panel สำหรับ CPCV / Permutation Importance และ live scoring ใน Jev
// ทุกฟีเจอร์ใช้ข้อมูลถึงวันที่ i เท่านั้น (ไม่มี look-ahead)
// ============================================================

import { db } from "@/lib/db"
import { closePivot, snapshotMembers, zScore, type Pivot } from "@/lib/momentum/core"
import { valuePivot } from "@/lib/momentum/engine"
import { predictProba, type LogisticModel } from "./logistic"

export const FEATURE_INFO = [
  { key: "n_tf", th: "จำนวนโผที่ติดพร้อมกัน (1-7)" },
  { key: "streak", th: "วันติดโผต่อเนื่อง" },
  { key: "resid20", th: "ret20 หักผลตอบแทนตลาด 20 วัน (%)" },
  { key: "resid60", th: "ret60 หักผลตอบแทนตลาด 60 วัน (%)" },
  { key: "mom_quality20", th: "โมเมนตัมต่อความเสี่ยง: ret20 / vol20" },
  { key: "dist_high", th: "ระยะราคาจากจุดสูงสุด 120 วัน (%)" },
  { key: "val_surge", th: "มูลค่าซื้อขายวันนี้ / เฉลี่ย 20 วันก่อนหน้า (เท่า)" },
  { key: "val_trend", th: "มูลค่าเฉลี่ย 5 วัน / เฉลี่ยวันที่ 6-20 (เท่า)" },
  { key: "repeat_z", th: "Overlap Ratio z-score" },
  { key: "breadth", th: "สัดส่วนหุ้น ret20 > 0 ในวันนั้น (0-1)" },
  { key: "mkt_vol20", th: "ความผันผวน 20 วันของดัชนีเฉลี่ยตลาด (%)" },
  { key: "ret20_pct", th: "เปอร์เซ็นไทล์ ret20 เทียบหุ้นทุกตัววันนั้น (0-1)" },
] as const

export const N_FEATURES = FEATURE_INFO.length

export interface PanelRow {
  date: string
  symbol: string
  x: number[]
  y: 0 | 1
  fwd: number // % forward return (horizon = hold)
}

export interface MetaPanel {
  rows: PanelRow[]
  hold: number
  nDates: number
}

// ---- per-date context (cached) ----

interface FeatureCtx {
  pivot: Pivot // pivot ที่ใช้สร้าง ctx นี้ (ตัวตนใช้ตรวจ cache — ingest/seed สร้าง pivot ใหม่เสมอ)
  pivotDates: string[]
  dateIdx: Map<string, number>
  symIdx: Map<string, number>
  px: number[][]
  val: number[][]
  unionByDate: Map<string, Set<string>>
  mktMean20: number[] // per pivot date index (%)
  mktMean60: number[] // per pivot date index (%)
  breadth: number[] // สัดส่วนหุ้น ret20 > 0 ต่อวัน (0..1)
  mktVol20: number[] // std ของ daily mean market return 20 วัน (%) ต่อวัน
  ret20Pct: number[][] // per date × symbol percentile rank ของ ret20 (0..1, NaN = ไม่มีข้อมูล)
  repeatZ: number[] // per pivot date index
  key: string
}

let _ctxCache: FeatureCtx | null = null

async function featureCtx(): Promise<FeatureCtx> {
  const [rawCount, snapCount, maxDate, pivot] = await Promise.all([
    db.rawDaily.count(),
    db.snapshot.count(),
    db.rawDaily.aggregate({ _max: { date: true } }).then((r) => r._max.date ?? ""),
    closePivot(),
  ])
  const key = `${rawCount}:${snapCount}:${maxDate}`
  // key อย่างเดียวไม่พอ: ingest ที่แก้แถวเดิม (จำนวนแถว/วันล่าสุดเท่าเดิม) ต้องได้ ctx ใหม่
  // → ผูกกับ object ของ closePivot ที่ invalidateDataCache() สร้างใหม่ทุกครั้งที่ข้อมูลเปลี่ยน
  if (_ctxCache && _ctxCache.key === key && _ctxCache.pivot === pivot) return _ctxCache

  const [vp, members] = await Promise.all([valuePivot(pivot), snapshotMembers()])
  const { dates, symbols, px } = pivot
  const N = dates.length

  // ---- market series ต่อวัน (คำนวณครั้งเดียวต่อ cache) ----
  // daily mean market return (fraction) — ใช้ทำ mktVol20
  const dailyMktRet = new Array<number>(N).fill(0)
  for (let i = 1; i < N; i++) {
    let s = 0
    let n = 0
    const rowPrev = px[i - 1]
    const rowNow = px[i]
    for (let si = 0; si < symbols.length; si++) {
      const a = rowPrev[si]
      const b = rowNow[si]
      if (isFinite(a) && isFinite(b) && a > 0) {
        s += b / a - 1
        n++
      }
    }
    dailyMktRet[i] = n > 0 ? s / n : 0
  }

  // mktMean20 + breadth + ret20Pct (pass เดียว: ทุกอันต้องการ ref20)
  const mktMean20 = new Array<number>(N).fill(0)
  const breadth = new Array<number>(N).fill(0)
  const ret20Pct: number[][] = Array.from({ length: N }, () =>
    new Array<number>(symbols.length).fill(NaN)
  )
  for (let i = 20; i < N; i++) {
    let s = 0
    let n = 0
    let up = 0
    const vals: number[] = []
    const symOf: number[] = []
    const rowRef = px[i - 20]
    const rowNow = px[i]
    for (let si = 0; si < symbols.length; si++) {
      const now = rowNow[si]
      const ref = rowRef[si]
      if (isFinite(now) && isFinite(ref) && ref > 0) {
        const r = now / ref - 1
        s += r
        n++
        if (r > 0) up++
        vals.push(r)
        symOf.push(si)
      }
    }
    mktMean20[i] = n > 0 ? (s / n) * 100 : 0
    breadth[i] = n > 0 ? up / n : 0

    // cross-sectional percentile rank ของ ret20 (average-rank กัน tie, 0..1)
    const m = vals.length
    if (m > 0) {
      const order = vals.map((_, k) => k).sort((a, b) => vals[a] - vals[b])
      let k = 0
      while (k < m) {
        let j = k
        while (j + 1 < m && vals[order[j + 1]] === vals[order[k]]) j++
        const avgRank = (k + j) / 2 // 0-based
        const pct = m > 1 ? avgRank / (m - 1) : 0.5
        for (let t = k; t <= j; t++) ret20Pct[i][symOf[order[t]]] = pct
        k = j + 1
      }
    }
  }

  // mktMean60 (%)
  const mktMean60 = new Array<number>(N).fill(0)
  for (let i = 60; i < N; i++) {
    let s = 0
    let n = 0
    for (let si = 0; si < symbols.length; si++) {
      const now = px[i][si]
      const ref = px[i - 60][si]
      if (isFinite(now) && isFinite(ref) && ref > 0) {
        s += now / ref - 1
        n++
      }
    }
    mktMean60[i] = n > 0 ? (s / n) * 100 : 0
  }

  // mktVol20: std (population) ของ daily mean market return 20 วัน ×100
  const mktVol20 = new Array<number>(N).fill(0)
  for (let i = 20; i < N; i++) {
    let m = 0
    for (let j = i - 19; j <= i; j++) m += dailyMktRet[j]
    m /= 20
    let v = 0
    for (let j = i - 19; j <= i; j++) v += (dailyMktRet[j] - m) ** 2
    mktVol20[i] = Math.sqrt(v / 20) * 100
  }

  // repeat ratio series (overlap) → z-score per date
  const rowsCount = await db.snapshot.groupBy({ by: ["date"], _count: { _all: true } })
  const rowsMap = new Map<string, number>()
  for (const c of rowsCount) rowsMap.set(c.date, c._count._all)
  const repeatSeries: number[] = dates.map((d) => {
    const rows = rowsMap.get(d) ?? 0
    const uniq = members.byDate.get(d)?.size ?? 0
    return rows > 0 ? 1 - uniq / rows : 0
  })
  const repeatZ = repeatSeries.map((_, i) => zScore(repeatSeries, i))

  const ctx: FeatureCtx = {
    pivot,
    pivotDates: dates,
    dateIdx: pivot.dateIdx,
    symIdx: pivot.symIdx,
    px,
    val: vp.val,
    unionByDate: members.byDate,
    mktMean20,
    mktMean60,
    breadth,
    mktVol20,
    ret20Pct,
    repeatZ,
    key,
  }
  _ctxCache = ctx
  return ctx
}

// คำนวณเวกเตอร์ฟีเจอร์ 1 แถว (order ตาม FEATURE_INFO — 12 ค่า)
// discipline เดิม: input ที่จำเป็นต้องมีครบ ไม่งั้นคืน null (ตัดแถวทิ้ง)
// ยกเว้นตาม spec: mom_quality20 (vol20≈0 → 0), val_surge/val_trend (ฐานเป็นศูนย์ → 1)
function featureRow(
  ctx: FeatureCtx,
  i: number, // pivot date index
  si: number, // symbol index
  nTf: number,
  streak: number
): number[] | null {
  const { px, val, mktMean20, mktMean60, breadth, mktVol20, ret20Pct, repeatZ } = ctx
  const now = px[i][si]
  if (!isFinite(now) || now <= 0) return null

  const ref20 = px[i - 20]?.[si]
  const ref60 = px[i - 60]?.[si]
  if (!isFinite(ref20) || !isFinite(ref60) || ref20 <= 0 || ref60 <= 0) return null
  const ret20 = (now / ref20 - 1) * 100
  const ret60 = (now / ref60 - 1) * 100

  // resid20 / resid60: ผลตอบแทนหักตลาด (market-neutral momentum)
  const resid20 = ret20 - mktMean20[i]
  const resid60 = ret60 - mktMean60[i]

  // vol20: std ของ daily return 20 วัน (%) — ใช้ต่อ mom_quality20
  let m = 0
  const rets: number[] = []
  for (let j = i - 19; j <= i; j++) {
    const a = px[j - 1]?.[si]
    const b = px[j]?.[si]
    if (!isFinite(a) || !isFinite(b) || a <= 0) return null
    rets.push(b / a - 1)
    m += b / a - 1
  }
  m /= rets.length
  let vv = 0
  for (const r of rets) vv += (r - m) ** 2
  const vol20 = Math.sqrt(vv / rets.length) * 100
  const momQuality20 = vol20 > 1e-9 ? ret20 / vol20 : 0

  // dist_high: (ราคา / max(ราคา 120 วันล่าสุด) − 1) × 100 — ปกติ ≤ 0
  // ถ้าข้อมูลไม่ถึง 120 วัน ใช้ช่วงที่มี (ต้องเหลืออย่างน้อย 20 วัน ไม่งั้น null)
  const win = Math.min(120, i + 1)
  if (win < 20) return null
  let hi = -Infinity
  for (let j = i - win + 1; j <= i; j++) {
    const p = px[j][si]
    if (isFinite(p) && p > hi) hi = p
  }
  if (!isFinite(hi) || hi <= 0) return null
  const distHigh = (now / hi - 1) * 100

  // val วันนี้ต้องมี (หุ้นที่ไม่มีมูลค่าซื้อขายวันนี้ตัดแถวทิ้ง)
  const valNow = val[i]?.[si]
  if (!isFinite(valNow) || valNow <= 0) return null

  // val_surge = val(วันนี้) / mean(val 20 วันก่อนหน้า ไม่รวมวันนี้) — ฐานเป็นศูนย์ → 1
  let sPrev = 0
  let nPrev = 0
  for (let j = i - 19; j <= i - 1; j++) {
    const v = val[j]?.[si]
    if (isFinite(v) && v > 0) {
      sPrev += v
      nPrev++
    }
  }
  const meanPrev = nPrev > 0 ? sPrev / nPrev : NaN
  const valSurge = isFinite(meanPrev) && meanPrev > 0 ? valNow / meanPrev : 1

  // val_trend = mean(val 5 วันล่าสุด) / mean(val วันที่ 6..20) — ฐานเป็นศูนย์ → 1
  let s5 = 0
  let n5 = 0
  for (let j = i - 4; j <= i; j++) {
    const v = val[j]?.[si]
    if (isFinite(v) && v > 0) {
      s5 += v
      n5++
    }
  }
  let s620 = 0
  let n620 = 0
  for (let j = i - 19; j <= i - 5; j++) {
    const v = val[j]?.[si]
    if (isFinite(v) && v > 0) {
      s620 += v
      n620++
    }
  }
  const mean5 = n5 > 0 ? s5 / n5 : NaN
  const mean620 = n620 > 0 ? s620 / n620 : NaN
  const valTrend =
    isFinite(mean5) && mean5 > 0 && isFinite(mean620) && mean620 > 0 ? mean5 / mean620 : 1

  const rz = repeatZ[i]
  const br = breadth[i]
  const mv = mktVol20[i]
  const pct = ret20Pct[i]?.[si]
  if (!isFinite(pct)) return null

  return [nTf, streak, resid20, resid60, momQuality20, distHigh, valSurge, valTrend, rz, br, mv, pct]
}

// สร้าง panel ทั้งชุดสำหรับ CPCV / Permutation Importance / เทรนโมเดล
export async function buildMetaPanel(holdIn = 10): Promise<MetaPanel> {
  // horizon เป็นจำนวนวันทำการ (index ของ pivot) — ค่าเศษทำให้ px[i + hold] เป็น undefined แล้วพัง
  const hold = Math.max(1, Math.round(holdIn))
  const ctx = await featureCtx()
  const { pivotDates, symIdx, px } = ctx
  const N = pivotDates.length

  // n_tf ต่อ (date, symbol) จาก snapshot
  const snaps = await db.snapshot.findMany({ select: { date: true, symbol: true } })
  const nTfByDate = new Map<string, Map<string, number>>()
  for (const s of snaps) {
    let m = nTfByDate.get(s.date)
    if (!m) {
      m = new Map()
      nTfByDate.set(s.date, m)
    }
    m.set(s.symbol, (m.get(s.symbol) ?? 0) + 1)
  }

  const rows: PanelRow[] = []
  for (let i = 60; i + hold < N; i++) {
    const date = pivotDates[i]
    const dayMap = nTfByDate.get(date)
    if (!dayMap || dayMap.size === 0) continue
    for (const [symbol, nTf] of dayMap) {
      const si = symIdx.get(symbol)
      if (si === undefined) continue
      // streak: วันติดโผต่อเนื่องย้อนหลัง (สูงสุด 20)
      let streak = 0
      for (let j = i; j >= 0 && streak < 20; j--) {
        const set = ctx.unionByDate.get(pivotDates[j])
        if (set && set.has(symbol)) streak++
        else break
      }
      const x = featureRow(ctx, i, si, nTf, streak)
      if (!x) continue
      const entry = px[i][si]
      const fwdPx = px[i + hold][si]
      if (!isFinite(fwdPx) || !isFinite(entry) || entry <= 0) continue
      const fwd = (fwdPx / entry - 1) * 100
      rows.push({ date, symbol, x, y: fwd > 0 ? 1 : 0, fwd })
    }
  }
  return { rows, hold, nDates: N }
}

// ---- live scoring สำหรับ Jev ----

export interface LiveScoreArgs {
  symbol: string
  date: string
  nTf: number
  streak: number
}

// คืน p(win) จากโมเดล meta ที่ deploy ไว้ (null = ไม่มีโมเดล/ข้อมูลไม่พอ)
// โมเดลเก่า (w.length !== N_FEATURES) ถูกปิดอัตโนมัติ — ต้อง deploy ใหม่จาก CPCV
export async function liveMetaProbability(args: LiveScoreArgs): Promise<number | null> {
  const raw = await db.setting.findUnique({ where: { key: "meta_model" } })
  if (!raw) return null
  let model: (LogisticModel & { hold: number }) | null = null
  try {
    model = JSON.parse(raw.value) as LogisticModel & { hold: number }
  } catch {
    return null
  }
  if (!model || !Array.isArray(model.w) || model.w.length !== N_FEATURES) return null

  const ctx = await featureCtx()
  const i = ctx.dateIdx.get(args.date)
  const si = ctx.symIdx.get(args.symbol)
  if (i === undefined || si === undefined || i < 60) return null
  const x = featureRow(ctx, i, si, args.nTf, args.streak)
  if (!x) return null
  return predictProba(model, x)
}

// multiplier ขนาดสถานะจาก p: clip(0.5 + p, 0.5, 1.5)
export function metaSizeMultiplier(p: number): number {
  return Math.min(1.5, Math.max(0.5, 0.5 + p))
}
