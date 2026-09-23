// ============================================================
// bun run fetch:cross — ดึงข้อมูลจริง SPX / USDTHB / GOLD จาก Yahoo Finance
// แล้ว "แทนที่" ชุดของแต่ละ asset ในตาราง CrossAsset (ใช้แทนชุด synthetic จาก seed ได้ทันที)
// ถ้า sandbox/เครือข่ายไม่อนุญาต → แจ้งเตือนแล้วจบ (crossZ ยังใช้ข้อมูลเดิมได้)
//
// - วันที่ = วันที่ตามเวลาของตลาดนั้น (meta.exchangeTimezoneName) — FX ของ Yahoo ตราเวลาเที่ยงคืนลอนดอน
//   (23:00 UTC ช่วง BST) การตัดวันที่แบบ UTC จะเลื่อนวันถอยไป 1 วัน = look-ahead 1 วันเทียบวันที่ของหุ้นไทย
// - แทนที่ทั้งชุดต่อ asset (ไม่ upsert ทับ): upsert ทับชุด seed ทิ้งแถวสังเคราะห์ไว้ในวันที่ Yahoo ไม่มี
//   (วันหยุดสหรัฐ/นอกช่วง 3 ปี) → ราคาปลอมระดับ ~1,500 แทรกกลางราคาจริง ~6,000 → z-score เพี้ยน
// - asset ที่ดึงไม่สำเร็จ: ถ้าของเดิมเป็นชุดสังเคราะห์ → ลบทิ้ง (ไม่ผสมของปลอมกับของจริง; crossZ ไม่นับ asset ที่ไม่มีข้อมูล)
// ============================================================

import { db } from "../src/lib/db"
import { tsToMarketDate } from "../src/lib/feed/yahoo"
import { CROSS_ASSET_SOURCE_KEY, markDataChanged } from "../src/lib/momentum/core"

const ASSETS: Record<string, string> = { SPX: "^GSPC", USDTHB: "THB=X", GOLD: "GC=F" }
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

type YahooChart = {
  chart?: {
    result?: {
      meta?: { exchangeTimezoneName?: string }
      timestamp?: number[]
      indicators?: { quote?: { close?: (number | null)[] }[] }
    }[]
    error?: unknown
  }
}

const prevSource = (await db.setting.findUnique({ where: { key: CROSS_ASSET_SOURCE_KEY } }))?.value ?? null
let upserted = 0
const failed: string[] = []
for (const [asset, sym] of Object.entries(ASSETS)) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3y&interval=1d`
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = (await r.json()) as YahooChart
    const res = j.chart?.result?.[0]
    const ts = res?.timestamp ?? []
    const closes = res?.indicators?.quote?.[0]?.close ?? []
    const tz = res?.meta?.exchangeTimezoneName ?? "UTC"
    if (ts.length === 0) throw new Error("ไม่มีข้อมูลจาก Yahoo")
    const byDate = new Map<string, number>()
    for (let i = 0; i < ts.length; i++) {
      const close = closes[i]
      if (close == null || !isFinite(close) || close <= 0) continue
      const date = tsToMarketDate(ts[i], tz)
      if (!byDate.has(date)) byDate.set(date, close) // แท่งซ้ำวันเดียวกัน (แท่งสดท้ายชุด) — เก็บแท่งแรก
    }
    if (byDate.size === 0) throw new Error("ไม่มีราคาปิดที่ใช้ได้")
    const rows = [...byDate].map(([date, close]) => ({ date, asset, close }))
    await db.$transaction([db.crossAsset.deleteMany({ where: { asset } }), db.crossAsset.createMany({ data: rows })])
    upserted += rows.length
    console.log(`${asset}: แทนที่ ${rows.length} แถว (${rows[0].date} → ${rows[rows.length - 1].date}, tz ${tz})`)
  } catch (e) {
    failed.push(asset)
    console.warn(`⚠️ ${asset} ดึงไม่สำเร็จ (${(e as Error).message}) — ข้าม`)
  }
}

if (failed.length < Object.keys(ASSETS).length) {
  // มีข้อมูลจริงอย่างน้อย 1 asset — asset ที่ยังเป็นชุดสังเคราะห์ของ seed ต้องไม่ปนกับของจริง
  if (prevSource !== "yahoo" && failed.length > 0) {
    await db.crossAsset.deleteMany({ where: { asset: { in: failed } } })
    console.warn(`⚠️ ลบชุดสังเคราะห์ของ ${failed.join(", ")} (crossZ จะไม่นับ asset ที่ไม่มีข้อมูล) — รันใหม่เมื่อเครือข่ายพร้อม`)
  }
  await db.setting.upsert({
    where: { key: CROSS_ASSET_SOURCE_KEY },
    create: { key: CROSS_ASSET_SOURCE_KEY, value: "yahoo" },
    update: { value: "yahoo" },
  })
  await markDataChanged() // ให้ cache ของ server ที่รันอยู่รู้ว่าข้อมูลเปลี่ยน
} else {
  console.warn("⚠️ ดึงไม่ได้เลย — CrossAsset คงเดิม (crossZ ยังใช้ข้อมูลที่มีอยู่)")
}
console.log(`รวม ${upserted} แถว`)
process.exit(0)
