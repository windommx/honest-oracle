// ============================================================
// Feed ingest — ทางเข้าเดียวของข้อมูลจริงทุกแหล่ง (Yahoo / SET ผ่านสคริปต์ / Settrade / CSV)
// → ingestRows (upsert + indicator + snapshot) → SymbolMeta (sector) → EventLog provenance
//
// replaceDemo: ล้างข้อมูลตลาดจำลอง (seed) ก่อน เพื่อไม่ให้หุ้นสมมติปนกับหุ้นจริง
// ล้างเฉพาะข้อมูลตลาด + สถานะกระดาษที่อ้างหุ้นจำลอง + โมเดล/นโยบายที่ผูกกับชุดข้อมูล
// ไม่ล้าง audit (Decision / EventLog / ResearchRun) — ประวัติต้องตรวจย้อนหลังได้เสมอ
// ============================================================

import { db } from "@/lib/db"
import {
  CROSS_ASSET_SOURCE_KEY,
  ingestRows,
  invalidateDataCache,
  markDataChanged,
  type IngestSummary,
  type ParsedCsvRow,
} from "@/lib/momentum/core"
import { emitEvent } from "@/lib/research/events"
import { sectorForSymbol } from "./universe"
export { normalizeFeedRows } from "./rows"

/** ข้อความแจ้งผู้ใช้เมื่อ replaceDemo ล้าง CrossAsset สังเคราะห์ไปด้วย */
export const CROSS_ASSET_CLEARED_NOTE =
  "ล้าง CrossAsset จำลอง (SPX/USDTHB/GOLD ที่ seed สังเคราะห์จากตลาดจำลอง) ไปด้วย — crossZ ใน Regime Composite และชั้น lead-lag ปิดจนกว่าจะรัน bun run fetch:cross เพื่อดึงข้อมูลจริง"

export interface IngestFeedInput {
  rows: ParsedCsvRow[]
  source: string
  actor: "human" | "system"
  replaceDemo?: boolean
  sectors?: Record<string, string>
}

export interface IngestFeedResult {
  ingest: IngestSummary
  sectorRows: number
  replacedDemo: boolean
  latestDate: string | null
  /** replaceDemo ล้าง CrossAsset สังเคราะห์ของ seed ไปด้วย (แจ้งผู้ใช้ให้รัน fetch:cross) */
  clearedCrossAsset: boolean
}

export async function clearDemoMarketData(): Promise<{ clearedCrossAsset: boolean }> {
  await db.snapshot.deleteMany()
  await db.rawDaily.deleteMany()
  await db.symbolMeta.deleteMany()
  await db.position.deleteMany()
  await db.pendingGate.deleteMany({ where: { status: "pending" } })
  await db.trade.deleteMany()
  await db.backtestRun.deleteMany()
  await db.setting.deleteMany({ where: { key: { in: ["meta_model", "prereg_trial", "signals_policy", "stops_policy", "jev_pending_fills"] } } })
  // CrossAsset ของ seed สังเคราะห์จากผลตอบแทนของตลาดจำลอง — ถ้าคงไว้ crossZ (25% ของ regimeScore) จะเป็นสัญญาณปลอม
  // ปนกับหุ้นจริง จึงล้างด้วย เว้นแต่มีป้ายว่าเป็นข้อมูลจริงจาก `bun run fetch:cross` (Setting cross_asset_source=yahoo)
  let clearedCrossAsset = false
  const src = await db.setting.findUnique({ where: { key: CROSS_ASSET_SOURCE_KEY } })
  if (src?.value !== "yahoo") {
    const del = await db.crossAsset.deleteMany()
    clearedCrossAsset = del.count > 0
    await db.setting.deleteMany({ where: { key: CROSS_ASSET_SOURCE_KEY } })
  }
  await markDataChanged()
  return { clearedCrossAsset }
}

export async function ingestFeed(input: IngestFeedInput): Promise<IngestFeedResult> {
  const replacedDemo = !!input.replaceDemo
  const clearedCrossAsset = replacedDemo ? (await clearDemoMarketData()).clearedCrossAsset : false

  const ingest = await ingestRows(input.rows)

  // SymbolMeta — sector ต่อหุ้น (ค่าที่ส่งมา → universe ตั้งต้น → Unknown)
  const symbols = [...new Set(input.rows.map((r) => r.symbol))]
  let sectorRows = 0
  for (const symbol of symbols) {
    const sector = sectorForSymbol(symbol, input.sectors)
    const existing = await db.symbolMeta.findUnique({ where: { symbol } })
    if (existing && sector === "Unknown") continue // ไม่ทับค่าที่รู้อยู่แล้วด้วย Unknown
    await db.symbolMeta.upsert({ where: { symbol }, create: { symbol, sector }, update: { sector } })
    sectorRows++
  }

  const latestDate = ingest.snapDates.length > 0 ? ingest.snapDates[ingest.snapDates.length - 1] : null
  await emitEvent("ingest", input.actor, {
    kind: "feed",
    source: input.source,
    symbols: symbols.length,
    insertedRaw: ingest.insertedRaw,
    updatedRows: ingest.updatedRows,
    snapDates: ingest.snapDates.length,
    latestDate,
    replacedDemo,
    clearedCrossAsset,
  })
  invalidateDataCache()
  return { ingest, sectorRows, replacedDemo, latestDate, clearedCrossAsset }
}
