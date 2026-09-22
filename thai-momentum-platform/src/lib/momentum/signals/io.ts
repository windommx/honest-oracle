// ============================================================
// Signals IO layer — โหลดข้อมูลทั้งหมด + สร้าง crossZ + panel cache
// cache key = (จำนวน raw rows, วันล่าสุด, จำนวน snapshot, น้ำหนัก)
// ============================================================

import { db } from "@/lib/db"
import { buildPanel, type Panel, type Row, type SnapRow } from "./engine"
import { DEFAULT_W, type SignalWeights } from "./weights"

export { DEFAULT_W }

export type CrossAssetRow = { date: string; asset: string; close: number }

// cache ระดับข้อมูลดิบ (แชร์ระหว่าง panel + IC + pairs scan ใน request เดียวกัน)
let _loadCache: { key: string; data: { rows: Row[]; snap: SnapRow[]; crossZ: Map<string, number> } } | null = null

export async function dataKey(): Promise<string> {
  const [count, maxDateAgg, snapCount, maxIdAgg] = await Promise.all([
    db.rawDaily.count(),
    db.rawDaily.aggregate({ _max: { date: true } }),
    db.snapshot.count(),
    db.rawDaily.aggregate({ _max: { id: true } }), // fingerprint กัน cache ค้างหลัง reseed (จำนวนแถว/วันล่าสุดอาจเท่าเดิม)
  ])
  return `${count}|${maxDateAgg._max.date ?? ""}|${snapCount}|${maxIdAgg._max.id ?? 0}`
}

export async function loadAll(): Promise<{
  rows: Row[]
  snap: SnapRow[]
  crossZ: Map<string, number>
}> {
  const key = await dataKey()
  if (_loadCache?.key === key) return _loadCache.data
  const [raw, snap, ca] = await Promise.all([
    db.rawDaily.findMany({
      select: { date: true, symbol: true, close: true, val: true, liq5: true },
      orderBy: [{ date: "asc" }, { symbol: "asc" }],
    }),
    db.snapshot.findMany({
      select: { date: true, symbol: true, timeframe: true, rank: true },
    }),
    db.crossAsset.findMany().catch(() => [] as CrossAssetRow[]),
  ])
  const data = { rows: raw as Row[], snap: snap as SnapRow[], crossZ: buildCrossZ(ca) }
  _loadCache = { key, data }
  return data
}

/**
 * crossZ ต่อวัน = 0.45·z20(SPX) − 0.35·z20(USDTHB) − 0.20·z20(GOLD)
 * z คำนวณจาก 20d return เทียบประวัติ trailing 250 วัน (ถ้า asset ไหนไม่มีข้อมูล = ไม่มีส่วนร่วม)
 */
export function buildCrossZ(ca: CrossAssetRow[]): Map<string, number> {
  const byA = new Map<string, { date: string; close: number }[]>()
  for (const r of ca) {
    const a = byA.get(r.asset) ?? []
    a.push({ date: r.date, close: r.close })
    byA.set(r.asset, a)
  }
  const SIGN: Record<string, number> = { SPX: 0.45, USDTHB: -0.35, GOLD: -0.2 }
  const out = new Map<string, number>()
  for (const [asset, rs] of byA) {
    rs.sort((a, b) => a.date.localeCompare(b.date))
    const cl = rs.map((r) => r.close)
    const r20 = cl.map((v, i) => (i >= 20 ? v / cl[i - 20] - 1 : NaN))
    rs.forEach((_, i) => {
      if (i < 20) return
      const win = r20.slice(Math.max(0, i - 250), i + 1).filter(Number.isFinite)
      if (win.length < 20) return
      const mu = win.reduce((s, b) => s + b, 0) / win.length
      const sd =
        Math.sqrt(win.reduce((s, b) => s + (b - mu) ** 2, 0) / win.length) || 1e-9
      const z = (r20[i] - mu) / sd
      out.set(rs[i].date, (out.get(rs[i].date) ?? 0) + (SIGN[asset] ?? 0) * z)
    })
  }
  return out
}

// ---------- sector loader (SymbolMeta จริง + fallback) ----------
export async function loadSectorOf(): Promise<(s: string) => string> {
  const { fallbackSectorOf } = await import("./sectors")
  try {
    const metas = await db.symbolMeta.findMany()
    const m = new Map(metas.map((r) => [r.symbol, r.sector]))
    return (s: string) => m.get(s) ?? fallbackSectorOf(s)
  } catch {
    return fallbackSectorOf
  }
}

// ---------- panel cache ----------
let cache: { key: string; panel: Panel } | null = null

export function invalidatePanelCache(): void {
  cache = null
}

export async function getPanelCached(
  weights: SignalWeights = DEFAULT_W
): Promise<Panel> {
  const key = `${await dataKey()}|${JSON.stringify(weights)}`
  if (cache?.key === key) return cache.panel
  const { rows, snap, crossZ } = await loadAll()
  const sectorOf = await loadSectorOf()
  const panel = buildPanel(rows, snap, sectorOf, crossZ, weights)
  cache = { key, panel }
  return panel
}

// ---------- policy persistence (pre-registered signals policy) ----------
export interface SignalsPolicy {
  promoted: string[]
  signs: Record<string, 1 | -1>
  weights: SignalWeights
  hold: number
  v2: boolean // alpha ชั้นเปิดเมื่อมีสัญญาณผ่านเกณฑ์อย่างน้อย 1 ตัว
  updatedAt: string
  stats?: Record<string, { meanIC: number; ICIR: number; t: number; n: number }>
}

export const POLICY_KEY = "signals_policy"

export async function readSignalsPolicy(): Promise<SignalsPolicy | null> {
  const row = await db.setting.findUnique({ where: { key: POLICY_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as SignalsPolicy
  } catch {
    return null
  }
}
