// ============================================================
// Cross-source reconciliation — เทียบราคาปิดวัน/หุ้นเดียวกันจากสองแหล่ง (pure)
//
// ใช้ 2 กรณี:
//   1) inbox มีหลายแหล่งให้วันเดียวกัน (เช่น settfex + Settrade + Yahoo) → เทียบก่อนผสาน
//   2) ข้อมูลที่เพิ่งดึง vs ค่าที่อยู่ใน DB อยู่แล้ว (ช่วงวันที่ซ้อนกัน) → จับ "ฐานราคาเปลี่ยน"
//      เช่น Yahoo ปรับราคาย้อนหลังหลังขึ้น XD/สปลิต: ประวัติใน DB ยังเป็นฐานเก่า ถ้า upsert แค่ช่วง 6 เดือน
//      ประวัติจะต่อกันคนละฐาน → ต้องดึงประวัติเต็มใหม่ ไม่ใช่เดาปรับเอง
//
// เกณฑ์: |a/b − 1| > 0.5% = ต่างกันจริง (tick size ของ SET + ปัดเศษ adjusted ไม่ถึงระดับนี้)
// ============================================================

import { provenanceFor } from "./provenance"

export const RECON_TOLERANCE = 0.005
/** จำนวนคู่ที่ต่างขั้นต่ำก่อนจัดเป็น rebased/rescaled (ต่ำกว่านี้ = conflict) */
export const MIN_SCALE_PAIRS = 3

export interface CloseRow {
  date: string
  symbol: string
  close: number
}

export interface SourceRows<T extends CloseRow = CloseRow> {
  source: string
  rows: T[]
}

/**
 * match    = ตรงกันทุกวัน
 * rebased  = ต่างเป็นสัดส่วนคงที่เฉพาะช่วงต้น แล้วตรงกันตั้งแต่วันหนึ่ง → ฐานราคาเปลี่ยน (ปันผล/สปลิตถูกปรับย้อนหลัง)
 * rescaled = ต่างเป็นสัดส่วนคงที่ทุกวัน → คนละฐานราคา (ราคาดิบ vs ปรับแล้ว / สปลิตคนละฐาน)
 * conflict = ต่างแบบไม่มีรูปแบบ → แหล่งใดแหล่งหนึ่งผิด ต้องตรวจก่อนใช้
 */
export type ReconKind = "match" | "rebased" | "rescaled" | "conflict"

export interface ReconPair {
  date: string
  symbol: string
  a: number
  b: number
  diffPct: number // (a/b − 1) × 100
}

export interface SymbolRecon {
  symbol: string
  compared: number
  flagged: number
  medianRatio: number
  maxAbsDiffPct: number
  kind: ReconKind
  /** rebased: วันแรกที่สองแหล่งกลับมาตรงกัน (ขอบของการปรับฐาน) */
  basisChangeDate: string | null
  worst: ReconPair | null
}

export interface ReconReport {
  sourceA: string
  sourceB: string
  tolerancePct: number
  compared: number
  flagged: number
  flaggedPct: number | null
  symbols: number
  counts: Record<ReconKind, number>
  /** เรียง: conflict → rescaled → rebased → match */
  bySymbol: SymbolRecon[]
  /** คู่ที่ต่างเกินเกณฑ์ มากสุด 50 คู่ */
  flaggedPairs: ReconPair[]
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const r4 = (x: number) => Math.round(x * 1e4) / 1e4

/** ส่วนที่ "ต่างเป็นสัดส่วนคงที่" — ≥ 90% ของอัตราส่วนอยู่ใน tol ของค่ามัธยฐาน */
function consistent(ratios: number[], tol: number): { ok: boolean; med: number } {
  const med = median(ratios)
  if (!Number.isFinite(med) || med <= 0) return { ok: false, med }
  const within = ratios.filter((r) => Math.abs(r / med - 1) <= tol).length
  return { ok: within >= Math.ceil(ratios.length * 0.9), med }
}

export function classifySymbol(pairs: ReconPair[], tol = RECON_TOLERANCE): Omit<SymbolRecon, "symbol"> {
  const sorted = [...pairs].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  const ratios = sorted.map((p) => p.a / p.b)
  const isFlag = ratios.map((r) => Math.abs(r - 1) > tol)
  const flagged = isFlag.filter(Boolean).length
  let worst: ReconPair | null = null
  for (const p of sorted) if (!worst || Math.abs(p.diffPct) > Math.abs(worst.diffPct)) worst = p
  const base = {
    compared: sorted.length,
    flagged,
    medianRatio: r4(median(ratios)),
    maxAbsDiffPct: worst ? Math.round(Math.abs(worst.diffPct) * 100) / 100 : 0,
    worst: flagged > 0 ? worst : null,
  }
  if (flagged === 0) return { ...base, kind: "match", basisChangeDate: null }
  // สรุปว่า "ฐานราคาต่างกัน" ต้องเห็นสัดส่วนคงที่อย่างน้อย 3 วัน — วันเดียวแยกไม่ออกจากราคาผิด
  if (flagged < MIN_SCALE_PAIRS) return { ...base, kind: "conflict", basisChangeDate: null }
  const lastFlag = isFlag.lastIndexOf(true)
  const firstClean = isFlag.indexOf(false)
  const flaggedRatios = ratios.filter((_, i) => isFlag[i])
  const c = consistent(flaggedRatios, tol)
  if (firstClean === -1) return { ...base, kind: c.ok ? "rescaled" : "conflict", basisChangeDate: null }
  // ช่วงที่ต่างอยู่ "ก่อน" ช่วงที่ตรงทั้งหมด (prefix) + สัดส่วนคงที่ = ฐานราคาถูกปรับย้อนหลัง ณ วันที่กลับมาตรงกัน
  if (lastFlag < firstClean && c.ok) return { ...base, kind: "rebased", basisChangeDate: sorted[firstClean].date }
  return { ...base, kind: "conflict", basisChangeDate: null }
}

const KIND_ORDER: Record<ReconKind, number> = { conflict: 0, rescaled: 1, rebased: 2, match: 3 }

/** เทียบราคาปิดของสองแหล่งตาม (date, symbol) ที่มีทั้งคู่ */
export function reconcileCloses(a: SourceRows, b: SourceRows, tol = RECON_TOLERANCE): ReconReport {
  const bIdx = new Map<string, number>()
  for (const r of b.rows) if (Number.isFinite(r.close) && r.close > 0) bIdx.set(`${r.date}|${r.symbol}`, r.close)
  const bySym = new Map<string, ReconPair[]>()
  for (const r of a.rows) {
    if (!(Number.isFinite(r.close) && r.close > 0)) continue
    const bc = bIdx.get(`${r.date}|${r.symbol}`)
    if (bc === undefined) continue
    let arr = bySym.get(r.symbol)
    if (!arr) bySym.set(r.symbol, (arr = []))
    arr.push({ date: r.date, symbol: r.symbol, a: r.close, b: bc, diffPct: (r.close / bc - 1) * 100 })
  }
  const counts: Record<ReconKind, number> = { match: 0, rebased: 0, rescaled: 0, conflict: 0 }
  const bySymbol: SymbolRecon[] = []
  const flaggedPairs: ReconPair[] = []
  let compared = 0
  let flagged = 0
  for (const [symbol, pairs] of bySym) {
    const s = classifySymbol(pairs, tol)
    counts[s.kind]++
    compared += s.compared
    flagged += s.flagged
    bySymbol.push({ symbol, ...s })
    for (const p of pairs) if (Math.abs(p.diffPct) > tol * 100) flaggedPairs.push(p)
  }
  bySymbol.sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || y.maxAbsDiffPct - x.maxAbsDiffPct || x.symbol.localeCompare(y.symbol))
  flaggedPairs.sort((x, y) => Math.abs(y.diffPct) - Math.abs(x.diffPct))
  return {
    sourceA: a.source,
    sourceB: b.source,
    tolerancePct: tol * 100,
    compared,
    flagged,
    flaggedPct: compared > 0 ? Math.round((flagged / compared) * 10000) / 100 : null,
    symbols: bySym.size,
    counts,
    bySymbol,
    flaggedPairs: flaggedPairs.slice(0, 50).map((p) => ({ ...p, diffPct: Math.round(p.diffPct * 100) / 100 })),
  }
}

/** สรุปสั้นสำหรับ run log / EventLog / UI */
export interface ReconSummary {
  pairs: string // "yahoo vs db"
  compared: number
  flagged: number
  flaggedPct: number | null
  counts: Record<ReconKind, number>
  rebased: string[]
  rescaled: string[]
  conflicts: string[]
  worst: ReconPair | null
}

export function summarizeRecon(r: ReconReport): ReconSummary {
  const pick = (k: ReconKind) => r.bySymbol.filter((s) => s.kind === k).map((s) => s.symbol)
  return {
    pairs: `${r.sourceA} vs ${r.sourceB}`,
    compared: r.compared,
    flagged: r.flagged,
    flaggedPct: r.flaggedPct,
    counts: r.counts,
    rebased: pick("rebased"),
    rescaled: pick("rescaled"),
    conflicts: pick("conflict"),
    worst: r.flaggedPairs[0] ?? null,
  }
}

/**
 * ผสานหลายแหล่งให้เหลือแถวเดียวต่อ (date, symbol) — เลือกแหล่งที่ precedence ดีที่สุด (ทางการก่อน)
 * แหล่งที่ precedence เท่ากัน: ชุดที่มาก่อนในรายการชนะ · คืนจำนวนแถวที่ถูกเลือกต่อแหล่ง
 */
export function mergeByPrecedence<T extends CloseRow>(
  sets: SourceRows<T>[],
): { rows: T[]; chosen: Record<string, number>; overlaps: number; groups: SourceRows<T>[] } {
  const best = new Map<string, { rank: number; order: number; row: T; source: string }>()
  let overlaps = 0
  sets.forEach((set, order) => {
    const rank = provenanceFor(set.source).precedence
    for (const row of set.rows) {
      const key = `${row.date}|${row.symbol}`
      const cur = best.get(key)
      if (cur) overlaps++
      if (!cur || rank < cur.rank || (rank === cur.rank && order < cur.order)) best.set(key, { rank, order, row, source: set.source })
    }
  })
  const chosen: Record<string, number> = {}
  const bySource = new Map<string, T[]>()
  const rows: T[] = []
  for (const v of best.values()) {
    rows.push(v.row)
    chosen[v.source] = (chosen[v.source] ?? 0) + 1
    let g = bySource.get(v.source)
    if (!g) bySource.set(v.source, (g = []))
    g.push(v.row)
  }
  const cmp = (x: T, y: T) => (x.symbol < y.symbol ? -1 : x.symbol > y.symbol ? 1 : x.date < y.date ? -1 : x.date > y.date ? 1 : 0)
  rows.sort(cmp)
  // กลุ่มต่อแหล่ง (แหล่งที่มีแถวมากสุดอยู่ท้าย — ingest ท้ายสุด = ป้าย provenance ล่าสุดสะท้อนแหล่งหลัก)
  const groups = [...bySource.entries()].map(([source, rs]) => ({ source, rows: rs.sort(cmp) })).sort((a, b) => a.rows.length - b.rows.length)
  return { rows, chosen, overlaps, groups }
}
