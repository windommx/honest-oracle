// ============================================================
// Feed ingest — ทางเข้าเดียวของข้อมูลจริงทุกแหล่ง (Yahoo / SET ผ่านสคริปต์ / Settrade / CSV)
// → ingestRows (upsert + indicator + snapshot) → SymbolMeta (sector) → EventLog provenance
//
// replaceDemo: ล้างข้อมูลตลาดจำลอง (seed) ก่อน เพื่อไม่ให้หุ้นสมมติปนกับหุ้นจริง
// ล้างเฉพาะข้อมูลตลาด + สถานะกระดาษที่อ้างหุ้นจำลอง + โมเดล/นโยบายที่ผูกกับชุดข้อมูล
// ไม่ล้าง audit (Decision / EventLog / ResearchRun) — ประวัติต้องตรวจย้อนหลังได้เสมอ
// ============================================================

import { db } from "@/lib/db"
import { ingestRows, invalidateDataCache, type IngestSummary, type ParsedCsvRow } from "@/lib/momentum/core"
import { emitEvent } from "@/lib/research/events"
import { sectorForSymbol } from "./universe"
export { normalizeFeedRows } from "./rows"

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
}

export async function clearDemoMarketData(): Promise<void> {
  await db.snapshot.deleteMany()
  await db.rawDaily.deleteMany()
  await db.symbolMeta.deleteMany()
  await db.position.deleteMany()
  await db.pendingGate.deleteMany({ where: { status: "pending" } })
  await db.trade.deleteMany()
  await db.backtestRun.deleteMany()
  await db.setting.deleteMany({ where: { key: { in: ["meta_model", "prereg_trial", "signals_policy", "stops_policy"] } } })
  invalidateDataCache()
}

export async function ingestFeed(input: IngestFeedInput): Promise<IngestFeedResult> {
  const replacedDemo = !!input.replaceDemo
  if (replacedDemo) await clearDemoMarketData()

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
  })
  invalidateDataCache()
  return { ingest, sectorRows, replacedDemo, latestDate }
}
