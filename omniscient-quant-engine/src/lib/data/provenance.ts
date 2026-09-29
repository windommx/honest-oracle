// ============================================================
// ที่มาของข้อมูล (provenance) — ข้อมูลในระบบตอนนี้คืออะไร มาจากไหน สดแค่ไหน ครอบคลุมอะไรบ้าง
// ใช้ที่ GET /api/data/provenance, /api/health และป้ายข้อมูลบน UI (ห้ามเขียนป้าย "ข้อมูลจำลอง" ตายตัวในหน้าเว็บ)
// ============================================================

import { db } from "@/lib/db"
import { computeFreshness, type FreshnessReport } from "./freshness"

export type DataKind = "synthetic" | "real" | "unknown"

export interface DataProvenance {
  kind: DataKind
  source: string | null
  license: string | null
  note: string | null
  recordedAt: string | null
  seed: number | null
  stocks: number
  prices: number
  firstDate: string | null
  lastDate: string | null
  coverage: { fundamentals: number; flows: number }
  freshness: FreshnessReport
  /** ป้ายสั้นภาษาไทยสำหรับ footer/หัวหน้า */
  label: string
}

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

export async function getDataProvenance(now: Date = new Date()): Promise<DataProvenance> {
  const [ds, stocks, prices, first, last, fundStocks, flowStocks, lastBySymbol] = await Promise.all([
    db.dataSource.findFirst({ orderBy: { createdAt: "desc" } }).catch(() => null),
    db.stock.count(),
    db.price.count(),
    db.price.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    db.price.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    db.fundamental.groupBy({ by: ["stockId"] }).then((r) => r.length),
    db.fundFlow.groupBy({ by: ["stockId"] }).then((r) => r.length),
    db.price.groupBy({ by: ["stockId"], _max: { date: true } }),
  ])
  const kind: DataKind = ds?.kind === "real" ? "real" : ds?.kind === "synthetic" ? "synthetic" : "unknown"
  const symbols = new Map((await db.stock.findMany({ select: { id: true, symbol: true } })).map((s) => [s.id, s.symbol]))
  const lastDateBySymbol = new Map<string, string>()
  for (const r of lastBySymbol) {
    const sym = symbols.get(r.stockId)
    if (sym && r._max.date) lastDateBySymbol.set(sym, ymd(r._max.date)!)
  }
  const dbLatest = ymd(last?.date)
  const freshness = computeFreshness({ now, kind: kind === "unknown" ? null : kind, dbLatest, lastDateBySymbol })
  const firstDate = ymd(first?.date)
  const label =
    stocks === 0
      ? "ยังไม่มีข้อมูลตลาด"
      : kind === "real"
        ? `ข้อมูลจริง · ${ds?.source ?? "ไม่ระบุแหล่ง"} · ${stocks} หุ้น · ถึง ${dbLatest}${freshness.status === "fresh" ? "" : freshness.status === "lagging" ? " (ตามหลัง 1 วัน)" : freshness.status === "stale" ? ` (ค้าง ${freshness.lagSessions} วันซื้อขาย)` : ""}`
        : kind === "synthetic"
          ? `ข้อมูลจำลองเพื่อการสาธิต · seed ${ds?.seed ?? "?"} · ${stocks} หุ้น × ${prices && stocks ? Math.round(prices / stocks) : 0} วัน`
          : `ข้อมูลไม่ทราบที่มา · ${stocks} หุ้น · ถึง ${dbLatest}`
  return {
    kind,
    source: ds?.source ?? null,
    license: ds?.license ?? null,
    note: ds?.note ?? null,
    recordedAt: ds?.createdAt?.toISOString() ?? null,
    seed: ds?.seed ?? null,
    stocks,
    prices,
    firstDate,
    lastDate: dbLatest,
    coverage: { fundamentals: fundStocks, flows: flowStocks },
    freshness,
    label,
  }
}
