// ============================================================
// Signals IO layer — โหลดข้อมูลทั้งหมด + สร้าง crossZ + panel cache
// cache key = dataKey() (fingerprint ของ RawDaily/Snapshot/CrossAsset/SymbolMeta) + น้ำหนัก
// ============================================================

import { db } from "@/lib/db"
import { buildPanel, type Panel, type Row, type SnapRow } from "./engine"
import { DEFAULT_W, type SignalWeights } from "./weights"

export { DEFAULT_W }

export type CrossAssetRow = { date: string; asset: string; close: number }

// cache ระดับข้อมูลดิบ (แชร์ระหว่าง panel + IC + pairs scan ใน request เดียวกัน)
let _loadCache: { key: string; data: { rows: Row[]; snap: SnapRow[]; crossZ: Map<string, number> } } | null = null

// fingerprint แบบตัวเลข/สตริงสั้น (FNV-1a 32-bit) สำหรับ SymbolMeta
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * fingerprint ของข้อมูลทุกตารางที่ชั้นสัญญาณอ่าน — กัน cache ค้าง:
 *  - RawDaily: count/maxDate/maxId + Σclose/Σval (ingest แบบ upsert แก้ราคาเดิม → count/วัน/id เท่าเดิม)
 *  - Snapshot: count + maxId (rebuild snapshot = ลบแล้วสร้างใหม่ → id เปลี่ยน)
 *  - CrossAsset: count/maxDate/Σclose (bun run fetch:cross upsert ทับ → crossZ ต้องคำนวณใหม่)
 *  - SymbolMeta: hash ของ symbol:sector (แก้ sector → sector rotation/pairs ต้องคำนวณใหม่)
 */
export async function dataKey(): Promise<string> {
  const [raw, snap, ca, metas] = await Promise.all([
    db.rawDaily.aggregate({ _count: { _all: true }, _max: { date: true, id: true }, _sum: { close: true, val: true } }),
    db.snapshot.aggregate({ _count: { _all: true }, _max: { id: true } }),
    db.crossAsset
      .aggregate({ _count: { _all: true }, _max: { date: true }, _sum: { close: true } })
      .catch(() => null),
    db.symbolMeta
      .findMany({ select: { symbol: true, sector: true }, orderBy: { symbol: "asc" } })
      .catch(() => [] as { symbol: string; sector: string }[]),
  ])
  const caKey = ca ? `${ca._count._all}:${ca._max.date ?? ""}:${ca._sum.close ?? 0}` : "0"
  const metaKey = `${metas.length}:${fnv1a(metas.map((m) => `${m.symbol}=${m.sector}`).join(","))}`
  return [
    raw._count._all,
    raw._max.date ?? "",
    snap._count._all,
    raw._max.id ?? 0,
    raw._sum.close ?? 0,
    raw._sum.val ?? 0,
    snap._max.id ?? 0,
    caKey,
    metaKey,
  ].join("|")
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
  const rows = raw as Row[]
  const stockDates: string[] = []
  for (const r of rows) if (stockDates[stockDates.length - 1] !== r.date) stockDates.push(r.date) // rows เรียง date asc
  const data = { rows, snap: snap as SnapRow[], crossZ: buildCrossZ(ca, stockDates) }
  _loadCache = { key, data }
  return data
}

const CROSS_SIGN: Record<string, number> = { SPX: 0.45, USDTHB: -0.35, GOLD: -0.2 }
/** ค่า z ล่าสุดของ asset ใช้แทนวันที่ asset ไม่มีแถวได้ไม่เกินกี่วันปฏิทิน (วันหยุดต่างตลาด/หยุดยาว) */
export const CROSS_MAX_STALE_DAYS = 7
const dayNum = (d: string): number => Date.parse(`${d}T00:00:00Z`) / 86_400_000

/**
 * crossZ ต่อวัน = 0.45·z20(SPX) − 0.35·z20(USDTHB) − 0.20·z20(GOLD)
 * z คำนวณจาก 20d return เทียบประวัติ trailing 250 วัน (ถ้า asset ไหนไม่มีข้อมูล = ไม่มีส่วนร่วม)
 *
 * การจัดวันเข้าปฏิทิน SET (dates): ใช้ z ล่าสุดของแต่ละ asset ที่ลงวันที่ "ก่อน" วันนั้นเท่านั้น
 *  - ราคาปิด SPX/GOLD/USDTHB ของวันที่ d ออกหลังตลาดไทยปิดวัน d (SPX ปิด ~03:00-04:00 น. ของ d+1)
 *    ขณะที่ Jev เข้าซื้อที่ราคาปิด d และ IC วัด close(d)→close(d+hold) → ใช้ค่าวัน d = look-ahead
 *  - วันหยุดต่างตลาด (เช่น SPX หยุด แต่ SET เปิด) ใช้ค่าล่าสุดต่อ (≤ CROSS_MAX_STALE_DAYS วัน)
 *    แทนการตัดทั้งพจน์ของ asset นั้นทิ้งเฉพาะวัน (เดิม crossZ กระโดดทุกวันหยุดสหรัฐฯ)
 * ไม่ส่ง dates → ใช้วันที่ของ CrossAsset เองเป็นปฏิทิน (กติกา "ก่อนวันนั้น" เดียวกัน)
 */
export function buildCrossZ(ca: CrossAssetRow[], dates?: string[]): Map<string, number> {
  const byA = new Map<string, { date: string; close: number }[]>()
  for (const r of ca) {
    const a = byA.get(r.asset) ?? []
    a.push({ date: r.date, close: r.close })
    byA.set(r.asset, a)
  }
  // z ต่อ asset ตามวันที่ของ asset เอง
  const zByAsset = new Map<string, { date: string; z: number }[]>()
  for (const [asset, rs] of byA) {
    if (!CROSS_SIGN[asset]) continue
    rs.sort((a, b) => a.date.localeCompare(b.date))
    const cl = rs.map((r) => r.close)
    const r20 = cl.map((v, i) => (i >= 20 && v > 0 && cl[i - 20] > 0 ? v / cl[i - 20] - 1 : NaN))
    const zs: { date: string; z: number }[] = []
    rs.forEach((_, i) => {
      if (i < 20 || !Number.isFinite(r20[i])) return
      const win = r20.slice(Math.max(0, i - 250), i + 1).filter(Number.isFinite)
      if (win.length < 20) return
      const mu = win.reduce((s, b) => s + b, 0) / win.length
      const sd =
        Math.sqrt(win.reduce((s, b) => s + (b - mu) ** 2, 0) / win.length) || 1e-9
      const z = (r20[i] - mu) / sd
      if (Number.isFinite(z)) zs.push({ date: rs[i].date, z })
    })
    zByAsset.set(asset, zs)
  }
  // as-of join เข้าปฏิทินเป้าหมาย: z ของวันที่ asset ล่าสุดที่ < d และเก่าไม่เกิน CROSS_MAX_STALE_DAYS
  const targets = [...new Set(dates ?? ca.map((r) => r.date))].sort()
  const out = new Map<string, number>()
  for (const [asset, zs] of zByAsset) {
    const w = CROSS_SIGN[asset]
    let j = -1
    for (const d of targets) {
      while (j + 1 < zs.length && zs[j + 1].date < d) j++
      if (j < 0) continue
      if (dayNum(d) - dayNum(zs[j].date) > CROSS_MAX_STALE_DAYS) continue
      out.set(d, (out.get(d) ?? 0) + w * zs[j].z)
    }
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
